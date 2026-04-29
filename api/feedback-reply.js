/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/feedback-reply.js — 피드백 게시물 AI 직원 자동 답변            ║
 * ║                                                                      ║
 * ║  기능:                                                               ║
 * ║  - GET: 미답변 피드백 게시물 목록 조회                              ║
 * ║  - POST: 피드백 게시물에 AI 직원 댓글 자동 생성                    ║
 * ║  - POST { action:'process_all' }: 미처리 피드백 일괄 처리           ║
 * ║  - 피드백 내용 → staff-chat feedback 채널 자동 공유                ║
 * ║  - 처리된 피드백은 업무 지시(ops 채널)에 반영                      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
export const config = { runtime: 'edge' }

import { generateFeedbackReply } from './ai-engine.js'

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const H = () => ({
  apikey:         SB_KEY,
  Authorization:  `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (d, s = 200) =>
  new Response(JSON.stringify(d, null, 2), {
    status: s, headers: { 'Content-Type': 'application/json', ...CORS },
  })

// 관리자 JWT 인증 확인
async function checkAdminJWT(token) {
  if (!token || !SB_URL || !SB_KEY) return false
  try {
    const r = await fetch(`${SB_URL}/rest/v1/profiles?select=role&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return false
    const rows = await r.json().catch(() => [])
    return Array.isArray(rows) && rows[0]?.role === 'admin'
  } catch { return false }
}

// ── 자체 AI 엔진 사용 — 외부 API 없음 ────────────────────────────

// ── AI 답변자 배정 — 피드백 내용에 따라 적합한 팀 매핑 ──────────
const FEEDBACK_RESPONDERS = [
  { key:'ARIA',  username:'ai_aria',  name:'ARIA',  emoji:'⚙️',  color:'#818CF8', team:'운영팀',
    triggers: ['운영','공지','이벤트','버그','오류','사이트','로딩','속도','오작동'],
  },
  { key:'NOVA',  username:'ai_nova',  name:'NOVA',  emoji:'✍️',  color:'#C084FC', team:'콘텐츠팀',
    triggers: ['콘텐츠','아티클','글','기사','인터뷰','스타트업','편집','오타'],
  },
  { key:'LUMI',  username:'ai_lumi',  name:'LUMI',  emoji:'💡',  color:'#34D399', team:'멘토링팀',
    triggers: ['멘토','창업','아이디어','조언','코칭','질문','도움','가이드'],
  },
  { key:'PULSE', username:'ai_pulse', name:'PULSE', emoji:'📡',  color:'#38BDF8', team:'뉴스팀',
    triggers: ['뉴스','소식','기사','최신','업데이트','정보','데이터'],
  },
  { key:'HANA',  username:'ai_hana',  name:'HANA',  emoji:'🤝',  color:'#FBBF24', team:'커뮤니티팀',
    triggers: ['커뮤니티','댓글','게시물','소통','분위기','멤버','친구'],
  },
  { key:'MAX',   username:'ai_max',   name:'MAX',   emoji:'🏛️',  color:'#F87171', team:'관리팀',
    triggers: ['정책','신고','규정','불편','개선','제안','요청','피드백'],
  },
  { key:'LEARN', username:'ai_learn', name:'LEARN', emoji:'🔬',  color:'#A78BFA', team:'기술팀',
    triggers: ['기능','추가','개발','업데이트','앱','모바일','검색','알림'],
  },
]

function assignResponder(content) {
  const lower = (content || '').toLowerCase()
  let best = null, bestScore = 0
  for (const r of FEEDBACK_RESPONDERS) {
    const score = r.triggers.filter(t => lower.includes(t)).length
    if (score > bestScore) { bestScore = score; best = r }
  }
  // 기본값: MAX (관리팀)
  return best || FEEDBACK_RESPONDERS.find(r => r.key === 'MAX')
}

// ── 피드백 태그 감지 ──────────────────────────────────────────────
function isFeedbackPost(post) {
  const tags = post.tags || []
  const title = (post.title || '').toLowerCase()
  const content = (post.content || '').toLowerCase()
  return tags.includes('피드백') ||
         tags.includes('feedback') ||
         tags.includes('건의') ||
         tags.includes('제안') ||
         title.includes('피드백') ||
         title.includes('건의') ||
         title.includes('제안') ||
         content.includes('피드백') ||
         post.post_type === 'feedback'
}

// ── 미답변 피드백 게시물 조회 ─────────────────────────────────────
async function getUnansweredFeedbacks(limit = 20) {
  // 최근 7일 피드백 게시물 조회
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const r = await fetch(
    `${SB_URL}/rest/v1/community_posts?is_deleted=eq.false&created_at=gte.${since}&order=created_at.desc&limit=50&select=id,title,content,tags,post_type,author_id,created_at`,
    { headers: H() }
  )
  const posts = await r.json().catch(() => [])
  if (!Array.isArray(posts)) return []

  const feedbackPosts = posts.filter(isFeedbackPost).slice(0, limit)
  if (feedbackPosts.length === 0) return []

  // 각 포스트에 AI 답변이 이미 있는지 확인
  const results = []
  for (const post of feedbackPosts) {
    const cr = await fetch(
      `${SB_URL}/rest/v1/post_comments?post_id=eq.${post.id}&select=author_id&limit=20`,
      { headers: H() }
    )
    const comments = await cr.json().catch(() => [])
    const authorIds = Array.isArray(comments) ? comments.map(c => c.author_id) : []

    // AI 계정 ID 조회 (ai_* 프로필)
    const aiR = await fetch(
      `${SB_URL}/rest/v1/profiles?username=like.ai_%&select=id&limit=10`,
      { headers: H() }
    )
    const aiProfiles = await aiR.json().catch(() => [])
    const aiIds      = Array.isArray(aiProfiles) ? aiProfiles.map(p => p.id) : []

    const hasAIReply = authorIds.some(id => aiIds.includes(id))
    if (!hasAIReply) {
      results.push({ ...post, comment_count: comments.length })
    }
  }
  return results
}

// ── AI 직원 답변 댓글 생성 ────────────────────────────────────────
async function replyToFeedback(post) {
  const responder = assignResponder(`${post.title} ${post.content}`)

  // 1. AI 프로필 ID 가져오기
  const pr = await fetch(
    `${SB_URL}/rest/v1/profiles?username=eq.${responder.username}&select=id&limit=1`,
    { headers: H() }
  )
  const profiles = await pr.json().catch(() => [])
  const profileId = profiles?.[0]?.id
  if (!profileId) return { status: 'no_profile', username: responder.username }

  // 2. 자체 AI 엔진으로 답변 생성
  const replyText = generateFeedbackReply(responder.username, post)
  if (!replyText) return { status: 'reply_failed', post_id: post.id }

  // 3. 댓글 삽입
  const cr = await fetch(`${SB_URL}/rest/v1/post_comments`, {
    method:  'POST',
    headers: { ...H(), Prefer: 'return=representation' },
    body: JSON.stringify({
      post_id:    post.id,
      author_id:  profileId,
      content:    replyText.slice(0, 800),
      created_at: new Date().toISOString(),
    }),
  })
  const commentData = await cr.json().catch(() => [])
  const commentId   = commentData?.[0]?.id

  // 4. staff-chat feedback 채널에도 공유
  try {
    await fetch(`${SB_URL}/rest/v1/staff_chat_messages`, {
      method:  'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        room:         'feedback',
        sender_key:   responder.username,
        sender_name:  responder.name,
        sender_emoji: responder.emoji,
        sender_color: responder.color,
        sender_team:  responder.team,
        message:      `📥 새 피드백 답변 완료!\n\n게시물: "${post.title}"\n답변: ${replyText.slice(0, 200)}...`,
        msg_type:     'feedback_handled',
        is_deleted:   false,
        created_at:   new Date().toISOString(),
      }),
    })
  } catch (_) {}

  return {
    status:     'replied',
    post_id:    post.id,
    post_title: post.title,
    responder:  responder.name,
    comment_id: commentId,
    reply:      replyText.slice(0, 100) + '...',
  }
}

// ── 업무 지시 채널에 피드백 요약 공유 ────────────────────────────
async function broadcastFeedbackSummary(processedCount, highlights) {
  if (processedCount === 0) return
  try {
    await fetch(`${SB_URL}/rest/v1/staff_chat_messages`, {
      method:  'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        room:         'ops',
        sender_key:   'ai_max',
        sender_name:  'MAX',
        sender_emoji: '🏛️',
        sender_color: '#F87171',
        sender_team:  '관리팀',
        message:      `📊 피드백 처리 완료 보고\n\n총 ${processedCount}건의 피드백에 답변 완료했습니다.\n${highlights.map(h => `• ${h.post_title} → ${h.responder} 답변`).join('\n')}\n\n각 팀은 해당 피드백을 검토하고 개선 사항에 반영해 주세요. 🙏`,
        msg_type:     'task_directive',
        is_deleted:   false,
        created_at:   new Date().toISOString(),
      }),
    })
  } catch (_) {}
}

// ══════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // ── GET: 미처리 피드백 조회 ──────────────────────────────────────
  if (req.method === 'GET') {
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing env' }, 500)
    const feedbacks = await getUnansweredFeedbacks(20)
    return json({
      ok:    true,
      engine:'feedback-reply-v1',
      count: feedbacks.length,
      feedbacks: feedbacks.map(f => ({
        id:       f.id,
        title:    f.title,
        preview:  (f.content || '').slice(0, 80),
        tags:     f.tags,
        assigned: assignResponder(`${f.title} ${f.content}`)?.name,
        created_at: f.created_at,
      })),
    })
  }

  // ── POST: 처리 실행 ──────────────────────────────────────────────
  if (req.method === 'POST') {
    const authHeader  = req.headers.get('authorization') || ''
    const isCronKey   = authHeader === `Bearer ${CRON_SECRET}` || req.headers.get('x-cron-secret') === CRON_SECRET
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const isAdminAuth = bearerToken && bearerToken !== CRON_SECRET
      ? await checkAdminJWT(bearerToken) : false
    if (!isCronKey && !isAdminAuth) return json({ error: 'Unauthorized' }, 401)
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing env' }, 500)

    let body = {}
    try { body = await req.json() } catch (_) {}

    const { action, post_id } = body

    // 단건 처리
    if (action === 'reply_single' && post_id) {
      const pr = await fetch(
        `${SB_URL}/rest/v1/community_posts?id=eq.${post_id}&select=id,title,content,tags,post_type&limit=1`,
        { headers: H() }
      )
      const posts = await pr.json().catch(() => [])
      if (!posts?.[0]) return json({ error: '게시물 없음' }, 404)
      const result = await replyToFeedback(posts[0])
      return json({ ok: true, result })
    }

    // 전체 미처리 피드백 처리
    const feedbacks = await getUnansweredFeedbacks(10)
    if (feedbacks.length === 0) {
      return json({ ok: true, engine:'feedback-reply-v1', message:'처리할 피드백 없음', processed: 0 })
    }

    const results = []
    for (const fb of feedbacks) {
      const r = await replyToFeedback(fb)
      results.push(r)
      await new Promise(res => setTimeout(res, 200)) // rate limit 방지
    }

    const succeeded = results.filter(r => r.status === 'replied')
    await broadcastFeedbackSummary(succeeded.length, succeeded)

    return json({
      ok:        true,
      engine:    'feedback-reply-v1',
      timestamp: new Date().toISOString(),
      summary: {
        total:     feedbacks.length,
        replied:   succeeded.length,
        failed:    results.length - succeeded.length,
      },
      results,
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
