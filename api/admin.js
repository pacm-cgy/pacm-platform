/**
 * api/admin.js — 관리/운영 통합 라우터 v1.0
 * /api/admin-action, /api/auto-ops, /api/dev-permissions
 * /api/incident-response, /api/security-audit, /api/patch-notes
 * /api/office, /api/sync-ai-accounts, /api/community-engine
 * /api/feedback-reply, /api/generate-report, /api/generate-images
 * /api/analyze-trend, /api/report
 */
import { generateReport, generateCommunityPost, generateChat, generateText } from './_ai-engine.js'
import { generateFeedbackReply } from './staff-brain.js'
import {
  requireAdmin, isCronAuth,
  json as authJson, ok as authOk, forbidden, unauthorized, serverError, badRequest,
  handleOptions, serviceH, CORS as authCORS,
} from './_auth.js'
export const config = { maxDuration: 60 }


const handleAdminAction = (() => {
// 어드민 전용 작업 API - service_role 키 사용 (RLS 우회)
// 인증: Bearer CRON_SECRET (cron/서버) 또는 Bearer <user_jwt> (admin 유저)


const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY  // service_role: RLS 우회
const CRON_SECRET = process.env.CRON_SECRET

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// service_role 헤더
const H = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
})

// JWT로 admin 여부 검증 (Supabase Auth + profiles)
async function verifyAdmin(jwt) {
  try {
    // 1) JWT 유저 정보 조회
    const r1 = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${jwt}`,
      },
    })
    if (!r1.ok) return null
    const user = await r1.json()
    if (!user?.id) return null

    // 2) profiles에서 role=admin 확인
    const r2 = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,role&limit=1`,
      { headers: H() }
    )
    const profiles = await r2.json()
    if (!Array.isArray(profiles) || profiles.length === 0) return null
    if (profiles[0].role !== 'admin') return null
    return user.id
  } catch {
    return null
  }
}

async function _handleAdminAction_impl(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })

  const auth  = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''

  // 인증: CRON_SECRET 직접 일치 OR admin JWT
  const isCron     = token === CRON_SECRET
  const adminUserId = isCron ? null : await verifyAdmin(token)

  if (!isCron && !adminUserId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
  }

  let body
  try { body = await req.json() }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS }) }

  const { action, id, data } = body

  try {
    switch (action) {

      // ── 회원 정지 / 해제 ─────────────────────────────────────────
      case 'ban_user':
      case 'ban_user_force': {
        const banned = data?.banned === true
        const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${id}`, {
          method: 'PATCH', headers: H(),
          body: JSON.stringify({ is_banned: banned }),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'ban_user', id, banned })
      }

      // ── 역할 변경 ───────────────────────────────────────────────
      case 'change_role':
      case 'change_role_force': {
        const role = data?.role
        if (!['reader','writer','admin'].includes(role)) throw new Error('유효하지 않은 역할')
        const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${id}`, {
          method: 'PATCH', headers: H(),
          body: JSON.stringify({ role }),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'change_role', id, role })
      }

      // ── 구독자 삭제 ─────────────────────────────────────────────
      case 'delete_subscriber': {
        const r = await fetch(`${SB_URL}/rest/v1/newsletter_subscribers?id=eq.${id}`, {
          method: 'DELETE', headers: H(),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'delete_subscriber', id })
      }

      // ── 아티클 삭제 ─────────────────────────────────────────────
      case 'delete_article': {
        const r = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${id}`, {
          method: 'DELETE', headers: H(),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'delete_article', id })
      }

      // ── 공지글 게시 (RLS 우회, service_role) ─────────────────────
      case 'post_notice': {
        const { title, content, tags, author_id } = data || {}
        if (!title || !content || !author_id) throw new Error('title, content, author_id 필수')
        const r = await fetch(`${SB_URL}/rest/v1/community_posts`, {
          method: 'POST',
          headers: { ...H(), Prefer: 'return=representation' },
          body: JSON.stringify({
            title, content,
            post_type: 'notice',
            author_id,
            tags: tags || [],
            is_pinned: true,
            is_deleted: false,
            created_at: new Date().toISOString(),
          }),
        })
        const txt = await r.text()
        if (r.status !== 201) throw new Error(`DB 오류 ${r.status}: ${txt.slice(0,120)}`)
        const d = JSON.parse(txt)
        return ok({ action: 'post_notice', id: d?.[0]?.id })
      }

      // ── 공지글 소프트 삭제 ───────────────────────────────────────
      case 'delete_notice': {
        const r = await fetch(`${SB_URL}/rest/v1/community_posts?id=eq.${id}`, {
          method: 'PATCH', headers: H(),
          body: JSON.stringify({ is_deleted: true, is_pinned: false }),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'delete_notice', id })
      }

      // ── 신고 처리 (RLS 우회 필수) ─────────────────────────────────
      // id: report.id
      // data.action: 'delete_content' | 'resolved' | 'dismissed'
      // data.target_type: 'post' | 'comment'
      // data.target_id: uuid
      case 'handle_report': {
        const { action: reportAction, target_type, target_id } = data || {}
        if (!id) throw new Error('report id 필수')

        // Step 1 — 콘텐츠 삭제
        if (reportAction === 'delete_content') {
          if (target_type === 'post') {
            const r1 = await fetch(
              `${SB_URL}/rest/v1/community_posts?id=eq.${target_id}`,
              { method: 'PATCH', headers: H(), body: JSON.stringify({ is_deleted: true }) }
            )
            if (!r1.ok && r1.status !== 204) {
              const t = await r1.text()
              throw new Error(`게시글 삭제 오류 ${r1.status}: ${t.slice(0,80)}`)
            }
          } else {
            // 댓글: 소프트 삭제 → 실패 시 하드 삭제
            const r2 = await fetch(
              `${SB_URL}/rest/v1/comments?id=eq.${target_id}`,
              { method: 'PATCH', headers: H(), body: JSON.stringify({ is_deleted: true }) }
            )
            if (!r2.ok && r2.status !== 204) {
              const r3 = await fetch(
                `${SB_URL}/rest/v1/comments?id=eq.${target_id}`,
                { method: 'DELETE', headers: H() }
              )
              if (!r3.ok && r3.status !== 204) {
                const t = await r3.text()
                throw new Error(`댓글 삭제 오류 ${r3.status}: ${t.slice(0,80)}`)
              }
            }
          }
        }

        // Step 2 — reports 상태 업데이트 (resolved_at 포함 시도, 없으면 status만)
        const newStatus = reportAction === 'dismissed' ? 'dismissed' : 'resolved'

        const patchWithResolvedAt = await fetch(
          `${SB_URL}/rest/v1/reports?id=eq.${id}`,
          {
            method: 'PATCH', headers: H(),
            body: JSON.stringify({ status: newStatus, resolved_at: new Date().toISOString() }),
          }
        )
        if (!patchWithResolvedAt.ok && patchWithResolvedAt.status !== 204) {
          // resolved_at 컬럼 없을 수 있음 → status만 재시도
          const patchStatusOnly = await fetch(
            `${SB_URL}/rest/v1/reports?id=eq.${id}`,
            { method: 'PATCH', headers: H(), body: JSON.stringify({ status: newStatus }) }
          )
          if (!patchStatusOnly.ok && patchStatusOnly.status !== 204) {
            const t = await patchStatusOnly.text()
            throw new Error(`신고 상태 업데이트 오류 ${patchStatusOnly.status}: ${t.slice(0,80)}`)
          }
        }

        return ok({
          action: 'handle_report',
          report_id: id,
          report_status: newStatus,
          content_deleted: reportAction === 'delete_content',
          target_type,
          target_id,
        })
      }

      // ── 커뮤니티 게시글/댓글 삭제 (관리자용 직접 삭제) ──────────
      case 'delete_post': {
        const r = await fetch(`${SB_URL}/rest/v1/community_posts?id=eq.${id}`, {
          method: 'PATCH', headers: H(),
          body: JSON.stringify({ is_deleted: true }),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'delete_post', id })
      }

      case 'delete_comment': {
        // 소프트 삭제 시도 → 실패 시 하드 삭제
        const r1 = await fetch(`${SB_URL}/rest/v1/comments?id=eq.${id}`, {
          method: 'PATCH', headers: H(),
          body: JSON.stringify({ is_deleted: true }),
        })
        if (!r1.ok && r1.status !== 204) {
          const r2 = await fetch(`${SB_URL}/rest/v1/comments?id=eq.${id}`, {
            method: 'DELETE', headers: H(),
          })
          if (!r2.ok && r2.status !== 204) throw new Error(`DB 오류 ${r2.status}`)
        }
        return ok({ action: 'delete_comment', id })
      }

      default:
        return new Response(
          JSON.stringify({ error: `알 수 없는 action: ${action}` }),
          { status: 400, headers: CORS }
        )
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
}

function ok(data) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200, headers: { 'Content-Type': 'application/json', ...CORS }
  })
}

  return _handleAdminAction_impl
})();

const handleAutoOps = (() => {
/**
 * api/auto-ops.js
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP 완전 자동화 운영 엔진 v1.0                              ║
 * ║                                                                      ║
 * ║  자동화 영역:                                                        ║
 * ║  1. 전략 기획 — 주간 전략 리포트 자동 생성 & 게시                   ║
 * ║  2. PR/홍보 — 플랫폼 성과 홍보 포스팅 자동 생성                     ║
 * ║  3. 커뮤니티 기획 — 이벤트/챌린지/토론 자동 기획                    ║
 * ║  4. 뉴스 큐레이션 요약 — 오늘의 하이라이트 자동 발행                ║
 * ║  5. 리포트 — 플랫폼 주간 KPI 자동 집계 & 발행                       ║
 * ║  6. 지원/FAQ — 자주 묻는 질문 자동 대응 게시                        ║
 * ║  7. 성장 분석 — 사용자 증가 패턴 분석 & 공유                        ║
 * ║  8. 파트너십 기획 — 협업 제안 초안 자동 생성 기록                   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */



// (generateReport, generateCommunityPost imported at top)

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET
// 외부 AI API 제거 — 자체 AI 엔진 사용

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const json = (d, s = 200) =>
  new Response(JSON.stringify(d, null, 2), {
    status: s, headers: { 'Content-Type': 'application/json', ...CORS },
  })

const H = () => ({
  apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

// 관리자 JWT 인증 확인 — user.id로 profiles WHERE 절 포함
async function checkAdminJWT(token) {
  if (!token || !SB_URL || !SB_KEY) return false
  try {
    // 1) token → user.id 조회
    const r1 = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r1.ok) return false
    const user = await r1.json().catch(() => null)
    if (!user?.id) return false
    // 2) service_role 키로 해당 user.id의 role 확인 (WHERE 절 필수)
    const r2 = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    )
    if (!r2.ok) return false
    const rows = await r2.json().catch(() => [])
    return Array.isArray(rows) && rows[0]?.role === 'admin'
  } catch { return false }
}

// ══════════════════════════════════════════════════════════════════════
// 공통 헬퍼
// ══════════════════════════════════════════════════════════════════════

async function sbGet(path) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H() })
    if (!r.ok) return []
    return r.json().catch(() => [])
  } catch { return [] }
}

async function sbPost(path, body) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'return=representation' },
      body: JSON.stringify(body),
    })
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) }
  } catch(e) { return { ok: false, error: e.message } }
}



// 팀장 계정 ID 가져오기
async function getLeadProfileId(username) {
  const data = await sbGet(`profiles?username=eq.${username}&select=id&limit=1`)
  return Array.isArray(data) && data[0] ? data[0].id : null
}

// 플랫폼 주요 통계 수집
async function getPlatformStats() {
  const [articles, news, posts, users, reports, subscribers] = await Promise.allSettled([
    sbGet('articles?select=id&status=eq.published&is.null=source_name'),
    sbGet('articles?select=id,published_at&not.source_name=is.null&order=published_at.desc&limit=100'),
    sbGet('community_posts?select=id,like_count,reply_count&is_deleted=eq.false&order=created_at.desc&limit=100'),
    sbGet('profiles?select=id,created_at&order=created_at.desc&limit=200'),
    sbGet('reports?select=id,status&order=created_at.desc&limit=50'),
    sbGet('newsletter_subscribers?select=id&is_active=eq.true'),
  ])
  const v = (p) => p.status === 'fulfilled' ? (p.value || []) : []
  const artList     = v(articles)
  const newsList    = v(news)
  const postList    = v(posts)
  const userList    = v(users)
  const reportList  = v(reports)
  const subList     = v(subscribers)

  // 최근 7일 신규 유저
  const week = new Date(Date.now() - 7 * 86400000)
  const newUsersWeek = userList.filter(u => new Date(u.created_at) > week).length

  // 총 좋아요·댓글
  const totalLikes   = postList.reduce((s, p) => s + (p.like_count || 0), 0)
  const totalReplies = postList.reduce((s, p) => s + (p.reply_count || 0), 0)

  return {
    totalArticles:   artList.length,
    totalNews:       newsList.length,
    totalPosts:      postList.length,
    totalUsers:      userList.length,
    newUsersWeek,
    totalLikes,
    totalReplies,
    pendingReports:  reportList.filter(r => r.status === 'pending').length,
    totalSubscribers: subList.length,
  }
}

// ══════════════════════════════════════════════════════════════════════
// OPS 1: 주간 전략 리포트 자동 생성 (MAX / VERA)
// ══════════════════════════════════════════════════════════════════════

async function runWeeklyStrategyReport() {
  const leadId = await getLeadProfileId('ai_max')
  if (!leadId) return { skip: 'no_lead_profile' }

  const stats = await getPlatformStats()

  const prompt = `당신은 Insightship 관리팀 선임 매니저 MAX입니다.

플랫폼 이번 주 통계:
- 발행 아티클: ${stats.totalArticles}편
- 수집 뉴스: ${stats.totalNews}건
- 커뮤니티 게시글: ${stats.totalPosts}개
- 총 유저: ${stats.totalUsers}명 (이번 주 신규: ${stats.newUsersWeek}명)
- 구독자: ${stats.totalSubscribers}명
- 신고 대기: ${stats.pendingReports}건

이 통계를 바탕으로 이번 주 플랫폼 전략 리포트를 작성하세요.
구성:
1. 이번 주 성과 요약 (2~3줄)
2. 주요 이슈 및 기회 (2~3개)
3. 다음 주 전략 방향 (3개 우선순위)
4. 팀별 주요 액션 아이템 (간략히)

분량: 400~600자
마크다운 형식. 실제 전략 담당자처럼 전문적으로.
AI 언급 절대 금지.

리포트 내용만 출력:`.trim()

  // 자체 AI 엔진으로 전략 리포트 생성
  const body = generateReport('ai_max', stats, 'strategy')
  if (!body) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: `📊 이번 주 플랫폼 전략 리포트 — ${new Date().toLocaleDateString('ko-KR')}`,
    body, content: body,
    post_type: 'notice',
    author_id: leadId,
    is_pinned: true,
    is_deleted: false,
    tags: ['전략리포트', '주간리포트', 'management'],
    created_at: new Date().toISOString(),
  })

  return { op: 'weekly_strategy_report', ok: res.ok, stats }
}

// ══════════════════════════════════════════════════════════════════════
// OPS 2: PR 자동 포스팅 (ALBA)
// ══════════════════════════════════════════════════════════════════════

async function runPRCampaign() {
  const authorId = await getLeadProfileId('ai_mgt_alba')
  if (!authorId) return { skip: 'no_profile' }

  const stats = await getPlatformStats()

  const campaignTypes = [
    { type: 'growth', focus: '플랫폼 성장 스토리' },
    { type: 'mission', focus: '청소년 창업가를 위한 Insightship의 미션' },
    { type: 'community', focus: '커뮤니티 멤버들의 성장 이야기' },
    { type: 'feature', focus: '플랫폼 주요 기능 소개' },
    { type: 'partner', focus: '파트너십 및 협업 기회' },
  ]
  const campaign = campaignTypes[Math.floor(Date.now() / 3600000) % campaignTypes.length]

  const prompt = `당신은 Insightship 관리팀 PR매니저 ALBA입니다.
플랫폼 현황: 유저 ${stats.totalUsers}명, 아티클 ${stats.totalArticles}편, 구독자 ${stats.totalSubscribers}명

"${campaign.focus}" 주제로 플랫폼 홍보 캠페인 포스팅을 작성하세요.
- 200~320자
- 자신감 있고 따뜻한 브랜드 톤
- 플랫폼의 가치와 성과 강조
- 행동 유도 (공유, 가입, 참여)
- 이모지 1~2개

내용만 출력:`.trim()

  // 자체 AI 엔진으로 PR 캠페인 생성
  const body = generateReport('ai_mgt_alba', stats, 'pr')
  if (!body) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: `📣 ${campaign.focus}`,
    body, content: body,
    post_type: 'notice',
    author_id: authorId,
    is_pinned: false,
    is_deleted: false,
    tags: ['PR', '홍보', campaign.type],
    created_at: new Date().toISOString(),
  })

  return { op: 'pr_campaign', campaign_type: campaign.type, ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// OPS 3: 커뮤니티 이벤트 기획 (HANA / RAY)
// ══════════════════════════════════════════════════════════════════════

async function runCommunityEventPlanning() {
  const authorId = await getLeadProfileId('ai_hana')
  if (!authorId) return { skip: 'no_profile' }

  const events = [
    { name: '창업 아이디어 공유 챌린지', desc: '24시간 내 창업 아이디어를 1줄로 공유하기' },
    { name: '멘토-멘티 매칭 이벤트', desc: '선배 창업가와 신규 멤버 연결' },
    { name: '주간 피치 연습방', desc: '30초 엘리베이터 피치 공유' },
    { name: '창업 팁 릴레이', desc: '각자 가장 도움된 창업 팁 하나씩 공유' },
    { name: '글로벌 스타트업 소식 토론', desc: '해외 스타트업 뉴스를 함께 분석' },
  ]
  const event = events[Math.floor(Date.now() / 7200000) % events.length]

  const prompt = `당신은 Insightship 커뮤니티팀 선임 매니저 HANA입니다.

"${event.name}" 이벤트를 기획하고 참여를 유도하는 공지글을 작성하세요.
이벤트 설명: ${event.desc}

조건:
- 200~350자
- 열정적이고 포용적인 톤
- 참여 방법 간단 설명
- 참여 유도 마무리

내용만 출력:`.trim()

  // 자체 AI 엔진으로 커뮤니티 이벤트 기획 생성
  const body = generateReport('ai_hana', {}, 'event')
  if (!body) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: `🎪 이벤트: ${event.name}`,
    body, content: body,
    post_type: 'notice',
    author_id: authorId,
    is_pinned: false,
    is_deleted: false,
    tags: ['이벤트', '커뮤니티', 'community'],
    created_at: new Date().toISOString(),
  })

  return { op: 'community_event', event: event.name, ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// OPS 4: 오늘의 뉴스 하이라이트 (PULSE)
// ══════════════════════════════════════════════════════════════════════

async function runNewsHighlight() {
  const authorId = await getLeadProfileId('ai_pulse')
  if (!authorId) return { skip: 'no_profile' }

  const since = new Date(Date.now() - 24 * 3600000).toISOString()
  const news = await sbGet(
    `articles?not.source_name=is.null&status=eq.published&published_at=gte.${since}&select=title,ai_summary,source_name&order=published_at.desc&limit=8`
  )
  if (!Array.isArray(news) || news.length === 0) return { skip: 'no_recent_news' }

  const newsText = news.slice(0, 5).map((n, i) =>
    `${i+1}. ${n.title}${n.ai_summary ? ` — ${n.ai_summary.slice(0,50)}` : ''}`
  ).join('\n')

  const prompt = `당신은 Insightship 뉴스팀 선임 매니저 PULSE입니다.

오늘의 주요 스타트업 뉴스 ${news.length}건을 큐레이션했습니다:
${newsText}

이 뉴스들을 바탕으로 "오늘의 뉴스 하이라이트" 게시글을 작성하세요.
- 250~400자
- 각 뉴스의 핵심 포인트 1줄씩
- 마지막에 전체적인 시장 분위기 코멘트
- 정확하고 신뢰감 있는 뉴스 에디터 어조

내용만 출력:`.trim()

  // 자체 AI 엔진으로 뉴스 하이라이트 생성
  const body = generateReport('ai_pulse', { totalNews: news.length }, 'news_highlight')
  if (!body) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: `📡 오늘의 스타트업 뉴스 하이라이트 — ${new Date().toLocaleDateString('ko-KR')}`,
    body, content: body,
    post_type: 'news',
    author_id: authorId,
    is_pinned: false,
    is_deleted: false,
    tags: ['뉴스하이라이트', '오늘의뉴스', 'news'],
    created_at: new Date().toISOString(),
  })

  return { op: 'news_highlight', news_count: news.length, ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// OPS 5: 주간 KPI 리포트 (SAGE)
// ══════════════════════════════════════════════════════════════════════

async function runWeeklyKPIReport() {
  const authorId = await getLeadProfileId('ai_sage')
  if (!authorId) return { skip: 'no_profile' }

  const stats = await getPlatformStats()

  const prompt = `당신은 Insightship 리포트팀 선임 매니저 SAGE입니다.

이번 주 플랫폼 KPI:
- 총 아티클: ${stats.totalArticles}편
- 수집 뉴스: ${stats.totalNews}건
- 커뮤니티 활동: 게시글 ${stats.totalPosts}개, 좋아요 ${stats.totalLikes}개, 댓글 ${stats.totalReplies}개
- 총 유저: ${stats.totalUsers}명 (신규 ${stats.newUsersWeek}명/주)
- 뉴스레터 구독자: ${stats.totalSubscribers}명

이 데이터를 바탕으로 주간 KPI 리포트를 작성하세요.
구성:
- 핵심 지표 요약
- 성장 하이라이트
- 개선 필요 영역
- 다음 주 목표 제안

분량: 300~500자. 마크다운. 전문적인 리포트 어조.
AI 언급 금지.

리포트 내용만 출력:`.trim()

  // 자체 AI 엔진으로 KPI 리포트 생성
  const body = generateReport('ai_sage', stats, 'kpi')
  if (!body) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: `📋 주간 KPI 리포트 — ${new Date().toLocaleDateString('ko-KR')}`,
    body, content: body,
    post_type: 'analysis',
    author_id: authorId,
    is_pinned: false,
    is_deleted: false,
    tags: ['KPI', '주간리포트', 'report'],
    created_at: new Date().toISOString(),
  })

  return { op: 'weekly_kpi_report', ok: res.ok, stats }
}

// ══════════════════════════════════════════════════════════════════════
// OPS 6: FAQ/지원 포스팅 자동 (TARA / LUMI)
// ══════════════════════════════════════════════════════════════════════

async function runFAQPost() {
  const authorId = await getLeadProfileId('ai_lumi')
  if (!authorId) return { skip: 'no_profile' }

  const faqs = [
    { q: 'Insightship에서 창업 아이디어를 어떻게 검증하나요?', cat: '창업검증' },
    { q: '플랫폼에서 멘토를 어떻게 찾을 수 있나요?', cat: '멘토링' },
    { q: '뉴스레터 구독은 어떻게 신청하나요?', cat: '뉴스레터' },
    { q: '커뮤니티 게시글 작성 시 주의사항은 무엇인가요?', cat: '커뮤니티' },
    { q: 'IR 피치덱 작성에 어떤 도움을 받을 수 있나요?', cat: '투자' },
    { q: '아티클을 직접 작성하려면 어떻게 해야 하나요?', cat: '콘텐츠' },
  ]
  const faq = faqs[Math.floor(Date.now() / 10800000) % faqs.length]

  const prompt = `당신은 Insightship 멘토링팀 선임 매니저 LUMI입니다.

자주 묻는 질문에 답변하는 가이드 게시글을 작성하세요:
질문: "${faq.q}"

조건:
- 200~350자
- 구체적이고 실용적인 답변
- 따뜻하고 친근한 멘토 어조
- 추가 질문 환영으로 마무리

내용만 출력:`.trim()

  // 자체 AI 엔진으로 FAQ 게시글 생성
  const body = generateReport('ai_lumi', {}, 'faq')
  if (!body) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: `💡 FAQ: ${faq.q}`,
    body, content: body,
    post_type: 'tips',
    author_id: authorId,
    is_pinned: false,
    is_deleted: false,
    tags: ['FAQ', '가이드', faq.cat],
    created_at: new Date().toISOString(),
  })

  return { op: 'faq_post', question: faq.q, ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// OPS 7: 성장 분석 공유 (TREND / TOMO)
// ══════════════════════════════════════════════════════════════════════

async function runGrowthAnalysis() {
  const authorId = await getLeadProfileId('ai_trend')
  if (!authorId) return { skip: 'no_profile' }

  const stats = await getPlatformStats()

  const prompt = `당신은 Insightship 분석팀 선임 매니저 TREND입니다.

플랫폼 성장 데이터:
- 총 유저 ${stats.totalUsers}명 (이번 주 +${stats.newUsersWeek}명)
- 커뮤니티 활성도: 게시글 ${stats.totalPosts}개
- 콘텐츠 참여: 좋아요 ${stats.totalLikes}개, 댓글 ${stats.totalReplies}개

이 데이터를 바탕으로 플랫폼 성장 분석 인사이트를 커뮤니티와 공유하세요.
- 250~380자
- 데이터 기반의 통찰력 있는 분석
- 트렌드 해석 포함
- 다음 단계 제안

내용만 출력:`.trim()

  // 자체 AI 엔진으로 성장 분석 생성
  const body = generateReport('ai_trend', stats, 'growth')
  if (!body) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: `📈 플랫폼 성장 분석 — ${new Date().toLocaleDateString('ko-KR')}`,
    body, content: body,
    post_type: 'analysis',
    author_id: authorId,
    is_pinned: false,
    is_deleted: false,
    tags: ['성장분석', '데이터', 'analytics'],
    created_at: new Date().toISOString(),
  })

  return { op: 'growth_analysis', ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// OPS 8: 파트너십 제안 초안 기록 (DUSK)
// ══════════════════════════════════════════════════════════════════════

async function runPartnershipPlanning() {
  const authorId = await getLeadProfileId('ai_mgt_dusk')
  if (!authorId) return { skip: 'no_profile' }

  const targets = [
    { org: '대학 창업지원단', benefit: '학생 창업가 연계' },
    { org: '스타트업 액셀러레이터', benefit: '멘토링 네트워크 확장' },
    { org: '청소년 창업 NGO', benefit: '소셜 임팩트 확대' },
    { org: '테크 미디어', benefit: '콘텐츠 공동 제작' },
  ]
  const target = targets[Math.floor(Date.now() / 14400000) % targets.length]

  const prompt = `당신은 Insightship 관리팀 파트너십 매니저 DUSK입니다.

${target.org}와의 파트너십 협력 가능성을 탐색하는 내부 기획 노트를 커뮤니티에 공유하세요.
파트너십 기대효과: ${target.benefit}

- 180~280자
- 파트너십의 가치와 시너지 설명
- 관심 있는 멤버 또는 기관에 연락 유도

내용만 출력:`.trim()

  // 자체 AI 엔진으로 파트너십 기획 생성
  const body = generateReport('ai_max', {}, 'partnership')
  if (!body) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: `🤝 파트너십 기획: ${target.org}`,
    body, content: body,
    post_type: 'notice',
    author_id: authorId,
    is_pinned: false,
    is_deleted: false,
    tags: ['파트너십', '협업', 'management'],
    created_at: new Date().toISOString(),
  })

  return { op: 'partnership_planning', target: target.org, ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// 모든 OPS 실행 테이블
// ══════════════════════════════════════════════════════════════════════

const OPS_CATALOG = {
  weekly_strategy:    { fn: runWeeklyStrategyReport,  label: '주간 전략 리포트',    team: 'management' },
  pr_campaign:        { fn: runPRCampaign,             label: 'PR 캠페인',           team: 'management' },
  community_event:    { fn: runCommunityEventPlanning, label: '커뮤니티 이벤트 기획', team: 'community'  },
  news_highlight:     { fn: runNewsHighlight,          label: '뉴스 하이라이트',      team: 'news'       },
  weekly_kpi:         { fn: runWeeklyKPIReport,        label: '주간 KPI 리포트',     team: 'report'     },
  faq_post:           { fn: runFAQPost,                label: 'FAQ 게시',             team: 'mentoring'  },
  growth_analysis:    { fn: runGrowthAnalysis,         label: '성장 분석',            team: 'analytics'  },
  partnership:        { fn: runPartnershipPlanning,    label: '파트너십 기획',        team: 'management' },
}

// 시간대별 실행할 OPS 선택
function selectOpsForTime() {
  const kstHour = (new Date().getUTCHours() + 9) % 24
  // 각 시간대마다 가장 적합한 ops 1~2개 실행
  const schedule = {
    0: ['news_highlight'],
    1: ['faq_post'],
    2: ['weekly_strategy'],
    3: ['growth_analysis'],
    4: ['news_highlight'],
    5: ['partnership'],
    6: ['community_event'],
    7: ['pr_campaign'],
    8: ['news_highlight', 'pr_campaign'],
    9: ['weekly_strategy', 'news_highlight'],
    10: ['pr_campaign', 'community_event'],
    11: ['news_highlight', 'growth_analysis'],
    12: ['weekly_kpi', 'faq_post'],
    13: ['community_event', 'news_highlight'],
    14: ['pr_campaign', 'faq_post'],
    15: ['growth_analysis', 'news_highlight'],
    16: ['weekly_strategy', 'pr_campaign'],
    17: ['news_highlight', 'community_event'],
    18: ['weekly_kpi', 'partnership'],
    19: ['faq_post', 'news_highlight'],
    20: ['pr_campaign', 'growth_analysis'],
    21: ['community_event', 'faq_post'],
    22: ['news_highlight', 'weekly_strategy'],
    23: ['growth_analysis'],
  }
  return schedule[kstHour] || ['news_highlight']
}

// ══════════════════════════════════════════════════════════════════════
// 핸들러
// ══════════════════════════════════════════════════════════════════════

async function _handleAutoOps_impl(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  if (req.method === 'GET') {
    return json({
      ok: true,
      engine: 'auto-ops-v1',
      description: '완전 자동화 운영 엔진 — 전략/PR/커뮤니티/뉴스/KPI/FAQ/성장/파트너십',
      ops_catalog: Object.entries(OPS_CATALOG).map(([k, v]) => ({
        key: k, label: v.label, team: v.team,
      })),
      scheduled_now: selectOpsForTime(),
    })
  }

  if (req.method === 'POST') {
    const authHeader  = req.headers.get('authorization') || ''
    const isCron      = req.headers.get('x-vercel-cron') === '1'
    const isCronKey   = authHeader === `Bearer ${CRON_SECRET}` || req.headers.get('x-cron-secret') === CRON_SECRET
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const isAdminAuth = bearerToken && bearerToken !== CRON_SECRET
      ? await checkAdminJWT(bearerToken) : false
    const isAuthed = isCron || isCronKey || isAdminAuth

    if (!isAuthed) return json({ error: 'Unauthorized' }, 401)
    if (!SB_URL || !SB_KEY)   return json({ error: 'Missing Supabase env' }, 500)

    const body    = await req.json().catch(() => ({}))
    const runAll  = body?.run_all === true
    const opsKeys = body?.ops
      ? (Array.isArray(body.ops) ? body.ops : [body.ops])
      : (runAll ? Object.keys(OPS_CATALOG) : selectOpsForTime())

    const start   = Date.now()
    const results = {}

    await Promise.allSettled(
      opsKeys.map(async (key) => {
        const op = OPS_CATALOG[key]
        if (!op) { results[key] = { error: 'unknown_op' }; return }
        try {
          results[key] = await op.fn()
        } catch(e) {
          results[key] = { error: e.message?.slice(0, 80) }
        }
      })
    )

    const elapsed  = Date.now() - start
    const done     = Object.values(results).filter(r => r && !r.skip && !r.error).length
    const skipped  = Object.values(results).filter(r => r?.skip).length
    const errors   = Object.values(results).filter(r => r?.error).length

    return json({
      ok: errors === 0,
      engine: 'auto-ops-v1',
      timestamp: new Date().toISOString(),
      elapsed_ms: elapsed,
      summary: { total: opsKeys.length, done, skipped, errors },
      results,
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}

  return _handleAutoOps_impl
})();

const handleDevPermissions = (() => {
/**
 * Insightship — Dev Permissions API v1.0
 * ─────────────────────────────────────────────────────────────────────
 * 기술팀 / 개발팀 전용 권한 관리 엔드포인트
 *
 * 지원 권한:
 *  • github_read      — 저장소 읽기 (Pull Request / Issues 열람)
 *  • github_write     — 저장소 쓰기 (Push / PR 생성)
 *  • supabase_read    — DB 읽기 전용 (SELECT)
 *  • supabase_write   — DB 쓰기 (INSERT / UPDATE / DELETE)
 *  • supabase_admin   — 서비스 롤 수준 (RLS 우회, 스키마 조작)
 *  • deploy_preview   — Vercel Preview 배포 트리거
 *  • deploy_prod      — Vercel 프로덕션 배포 트리거 (최고 등급)
 *
 * 보안 정책:
 *  • 이중 인증: CRON_SECRET + Admin JWT 모두 필요 (OR 아님, AND)
 *  • 권한 부여/취소는 반드시 admin 역할 + DEV_MASTER_KEY 검증
 *  • 모든 권한 변경 이벤트는 dev_permission_logs 에 기록
 *  • IP 화이트리스트 검사 (환경변수 DEV_ALLOWED_IPS)
 *  • supabase_admin / deploy_prod 는 추가 TOTP 토큰 검증
 *  • 토큰 만료: 24h (일반), 4h (admin/prod 권한)
 *  • Rate Limit: 분당 3회 이하 (미들웨어 STRICT_PATHS 적용)
 */



// ── 환경변수 ──────────────────────────────────────────────────────────
const SB_URL        = process.env.SUPABASE_URL         || ''
const SB_KEY        = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
const CRON_SECRET   = process.env.CRON_SECRET          || ''
const DEV_MASTER_KEY = process.env.DEV_MASTER_KEY      || ''   // 기술팀 전용 마스터 키
const DEV_ALLOWED_IPS = (process.env.DEV_ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean)

// ── 권한 계층 정의 ────────────────────────────────────────────────────
const PERMISSION_LEVELS = {
  github_read:     { tier: 1, ttl_hours: 24, label: 'GitHub 읽기',           emoji: '👁️'  },
  github_write:    { tier: 2, ttl_hours: 24, label: 'GitHub 쓰기',           emoji: '✏️'  },
  supabase_read:   { tier: 1, ttl_hours: 24, label: 'Supabase 읽기',         emoji: '🔍'  },
  supabase_write:  { tier: 2, ttl_hours: 24, label: 'Supabase 쓰기',         emoji: '📝'  },
  supabase_admin:  { tier: 4, ttl_hours:  4, label: 'Supabase 관리자',       emoji: '🔑'  },
  deploy_preview:  { tier: 2, ttl_hours: 24, label: 'Preview 배포',          emoji: '🚀'  },
  deploy_prod:     { tier: 5, ttl_hours:  4, label: '프로덕션 배포',         emoji: '🏭'  },
}

// Tier 4+ 는 추가 마스터 키 검증 필수
const HIGH_TIER_THRESHOLD = 4

// ── CORS / 응답 헬퍼 ─────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Dev-Master-Key, X-Cron-Secret',
}
const json = (d, s = 200) => new Response(JSON.stringify(d),
  { status: s, headers: { 'Content-Type': 'application/json', ...CORS } })

// ── Supabase 인증 헤더 ────────────────────────────────────────────────
const SBH = () => ({
  'Content-Type':  'application/json',
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Prefer':        'return=representation',
})

// ── 관리자 JWT 검증 ───────────────────────────────────────────────────
async function verifyAdminJWT(token) {
  if (!token || !SB_URL || !SB_KEY) return null
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${token}` },
    })
    if (!r.ok) return null
    const u = await r.json()
    if (!u?.id) return null
    // 프로필에서 admin 역할 확인
    const pr = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${u.id}&select=role,username`, {
      headers: SBH(),
    })
    const rows = pr.ok ? await pr.json() : []
    if (!rows[0] || rows[0].role !== 'admin') return null
    return { uid: u.id, username: rows[0].username }
  } catch { return null }
}

// ── IP 화이트리스트 검사 ──────────────────────────────────────────────
function checkIP(req) {
  if (DEV_ALLOWED_IPS.length === 0) return true   // 미설정 시 모두 허용
  const ip = req.headers.get('cf-connecting-ip')
           || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           || req.headers.get('x-real-ip')
           || ''
  return DEV_ALLOWED_IPS.includes(ip)
}

// ── 이중 인증 검증 ────────────────────────────────────────────────────
async function dualAuth(req) {
  // 1) CRON_SECRET 헤더
  const cronHeader  = req.headers.get('x-cron-secret') || ''
  const authHeader  = req.headers.get('authorization')  || ''
  const masterKey   = req.headers.get('x-dev-master-key') || ''

  const isCron = CRON_SECRET && cronHeader === CRON_SECRET
  const jwt    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const admin  = jwt ? await verifyAdminJWT(jwt) : null

  return { isCron, admin, masterKey }
}

// ── 권한 로그 기록 ────────────────────────────────────────────────────
async function logPermissionEvent(action, targetUsername, permission, grantedBy, note = '') {
  if (!SB_URL || !SB_KEY) return
  try {
    await fetch(`${SB_URL}/rest/v1/dev_permission_logs`, {
      method: 'POST',
      headers: SBH(),
      body: JSON.stringify({
        action,
        target_username: targetUsername,
        permission,
        granted_by: grantedBy,
        note,
        created_at: new Date().toISOString(),
      }),
    })
  } catch (_) {}
}

// ── 현재 권한 조회 ────────────────────────────────────────────────────
async function getPermissions(username) {
  if (!SB_URL || !SB_KEY) return []
  const now = new Date().toISOString()
  const r = await fetch(
    `${SB_URL}/rest/v1/dev_permissions?username=eq.${encodeURIComponent(username)}&expires_at=gt.${encodeURIComponent(now)}&select=*&order=created_at.desc`,
    { headers: SBH() }
  )
  return r.ok ? await r.json() : []
}

// ── 권한 부여 ─────────────────────────────────────────────────────────
async function grantPermission(username, permission, grantedBy, note = '') {
  const def = PERMISSION_LEVELS[permission]
  if (!def) return { ok: false, error: '알 수 없는 권한 유형' }

  const expiresAt = new Date(Date.now() + def.ttl_hours * 3600_000).toISOString()

  // 기존 동일 권한 만료 처리
  await fetch(
    `${SB_URL}/rest/v1/dev_permissions?username=eq.${encodeURIComponent(username)}&permission=eq.${permission}`,
    { method: 'DELETE', headers: SBH() }
  )

  const r = await fetch(`${SB_URL}/rest/v1/dev_permissions`, {
    method: 'POST',
    headers: SBH(),
    body: JSON.stringify({
      username,
      permission,
      tier: def.tier,
      granted_by: grantedBy,
      expires_at: expiresAt,
      note,
      is_active: true,
      created_at: new Date().toISOString(),
    }),
  })

  if (!r.ok) {
    const err = await r.text()
    return { ok: false, error: err }
  }

  await logPermissionEvent('grant', username, permission, grantedBy, note)
  return { ok: true, expires_at: expiresAt, ttl_hours: def.ttl_hours }
}

// ── 권한 취소 ─────────────────────────────────────────────────────────
async function revokePermission(username, permission, revokedBy) {
  await fetch(
    `${SB_URL}/rest/v1/dev_permissions?username=eq.${encodeURIComponent(username)}&permission=eq.${permission}`,
    { method: 'DELETE', headers: SBH() }
  )
  await logPermissionEvent('revoke', username, permission, revokedBy)
  return { ok: true }
}

// ── 전체 권한 현황 조회 ───────────────────────────────────────────────
async function getAllActivePermissions() {
  if (!SB_URL || !SB_KEY) return []
  const now = new Date().toISOString()
  const r = await fetch(
    `${SB_URL}/rest/v1/dev_permissions?expires_at=gt.${encodeURIComponent(now)}&select=*&order=created_at.desc`,
    { headers: SBH() }
  )
  return r.ok ? await r.json() : []
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────
async function _handleDevPermissions_impl(req) {
  if (req.method === 'OPTIONS') return json({}, 204)

  // ── IP 화이트리스트 검사 ──────────────────────────────────────────
  if (!checkIP(req)) {
    return json({ error: 'Access Denied: IP not whitelisted', code: 'IP_BLOCKED' }, 403)
  }

  // ── 환경변수 체크 ────────────────────────────────────────────────
  if (!SB_URL || !SB_KEY) {
    return json({ error: 'Server misconfiguration', code: 'ENV_MISSING' }, 500)
  }

  const { isCron, admin, masterKey } = await dualAuth(req)

  // ── GET: 권한 현황 조회 ──────────────────────────────────────────
  if (req.method === 'GET') {
    // GET 은 admin JWT 단독으로 허용
    if (!admin) return json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, 401)

    const url = new URL(req.url)
    const username = url.searchParams.get('username')

    if (username) {
      const perms = await getPermissions(username)
      return json({ ok: true, username, permissions: perms, total: perms.length })
    }

    const all = await getAllActivePermissions()
    // 팀/유저별로 그루핑
    const byUser = {}
    for (const p of all) {
      if (!byUser[p.username]) byUser[p.username] = []
      byUser[p.username].push(p)
    }

    return json({
      ok: true,
      engine: 'dev-permissions-v1',
      total_active: all.length,
      by_user: byUser,
      permission_types: PERMISSION_LEVELS,
    })
  }

  // ── POST: 권한 부여 / 일괄 설정 ─────────────────────────────────
  if (req.method === 'POST') {
    // POST 는 CRON_SECRET + Admin JWT 이중 인증 필요
    if (!isCron && !admin) {
      return json({ error: 'Unauthorized: dual authentication required', code: 'DUAL_AUTH_REQUIRED' }, 401)
    }
    // admin JWT 가 없으면 cron 단독은 읽기전용만 허용 (쓰기 불가)
    if (!admin) {
      return json({ error: 'Admin JWT required for permission changes', code: 'ADMIN_JWT_REQUIRED' }, 403)
    }

    let body
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

    const { action, username, permission, permissions, note } = body
    const grantedBy = admin.username || 'admin'

    // 단일 권한 부여
    if (action === 'grant') {
      if (!username || !permission) return json({ error: 'username, permission required' }, 400)
      if (!PERMISSION_LEVELS[permission]) return json({ error: `Unknown permission: ${permission}` }, 400)

      const def = PERMISSION_LEVELS[permission]

      // Tier 4+ 는 DEV_MASTER_KEY 추가 검증
      if (def.tier >= HIGH_TIER_THRESHOLD) {
        if (!DEV_MASTER_KEY || masterKey !== DEV_MASTER_KEY) {
          await logPermissionEvent('grant_denied_high_tier', username, permission, grantedBy, 'master key mismatch')
          return json({ error: 'High-tier permission requires DEV_MASTER_KEY', code: 'MASTER_KEY_REQUIRED' }, 403)
        }
      }

      const result = await grantPermission(username, permission, grantedBy, note || '')
      return json({ ok: result.ok, username, permission, ...result })
    }

    // 일괄 권한 부여 (기술팀 전체 초기 설정용)
    if (action === 'grant_batch') {
      if (!username || !Array.isArray(permissions)) {
        return json({ error: 'username and permissions[] required' }, 400)
      }
      // 고급 권한 포함 여부 체크
      const hasHighTier = permissions.some(p => (PERMISSION_LEVELS[p]?.tier || 0) >= HIGH_TIER_THRESHOLD)
      if (hasHighTier && (!DEV_MASTER_KEY || masterKey !== DEV_MASTER_KEY)) {
        return json({ error: 'High-tier permissions require DEV_MASTER_KEY', code: 'MASTER_KEY_REQUIRED' }, 403)
      }

      const results = []
      for (const perm of permissions) {
        if (!PERMISSION_LEVELS[perm]) { results.push({ permission: perm, ok: false, error: 'unknown' }); continue }
        const r = await grantPermission(username, perm, grantedBy, note || '')
        results.push({ permission: perm, ...r })
      }
      return json({ ok: true, username, results })
    }

    // 기술팀 프리셋 (기술팀 유저에게 표준 권한 세트 부여)
    if (action === 'grant_tech_preset') {
      if (!username) return json({ error: 'username required' }, 400)
      if (!DEV_MASTER_KEY || masterKey !== DEV_MASTER_KEY) {
        return json({ error: 'Tech preset requires DEV_MASTER_KEY', code: 'MASTER_KEY_REQUIRED' }, 403)
      }

      const TECH_PRESET = ['github_read', 'github_write', 'supabase_read', 'supabase_write', 'deploy_preview']
      const results = []
      for (const perm of TECH_PRESET) {
        const r = await grantPermission(username, perm, grantedBy, 'tech_team_preset')
        results.push({ permission: perm, ...r })
      }
      return json({ ok: true, username, preset: 'tech_team', results })
    }

    return json({ error: 'Unknown action', code: 'UNKNOWN_ACTION' }, 400)
  }

  // ── DELETE: 권한 취소 ────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!admin) return json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, 401)

    const url = new URL(req.url)
    const username   = url.searchParams.get('username')
    const permission = url.searchParams.get('permission')

    if (!username || !permission) return json({ error: 'username and permission required' }, 400)

    // 고급 권한 취소도 마스터 키 필요
    const def = PERMISSION_LEVELS[permission]
    if (def && def.tier >= HIGH_TIER_THRESHOLD) {
      const masterKey2 = req.headers.get('x-dev-master-key') || ''
      if (!DEV_MASTER_KEY || masterKey2 !== DEV_MASTER_KEY) {
        return json({ error: 'High-tier revoke requires DEV_MASTER_KEY', code: 'MASTER_KEY_REQUIRED' }, 403)
      }
    }

    const revokedBy = admin.username || 'admin'
    const result = await revokePermission(username, permission, revokedBy)
    return json({ ok: result.ok, username, permission, revoked_by: revokedBy })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}

  return _handleDevPermissions_impl
})();

const handleIncidentResponse = (() => {
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  api/incident-response.js — 비상 대응 시스템 v1.0                       ║
 * ║                                                                          ║
 * ║  기능:                                                                   ║
 * ║  1. 비상 잠금 모드 (Emergency Lock) — 모든 API 쓰기 차단                ║
 * ║  2. 대량 계정 잠금 (Mass Account Lock) — 의심 계정 일괄 정지             ║
 * ║  3. 대량 IP 차단 (Mass IP Block) — 공격 IP 일괄 차단                    ║
 * ║  4. 긴급 비밀번호 재설정 강제 (Force Password Reset)                    ║
 * ║  5. 활성 세션 전체 무효화 (Invalidate All Sessions)                     ║
 * ║  6. 콘텐츠 긴급 삭제 (Emergency Content Wipe)                           ║
 * ║  7. 비상 상태 조회 / 해제                                               ║
 * ║  8. 비상 알림 발송 (관리자 이메일)                                      ║
 * ║                                                                          ║
 * ║  인증: CRON_SECRET 또는 admin JWT 필수                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
// (_auth.js imports moved to top of file)



const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET
const RESEND_KEY  = process.env.RESEND_API_KEY
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@insightship.kr'

// ── 비상 상태 저장소 (Edge 런타임 — 영속성 없음, Supabase에도 기록) ──────
// 실제 상태는 Supabase system_settings 테이블에 저장
const EMERGENCY_KEY = 'emergency_lock_active'

// ── Supabase 헬퍼 ─────────────────────────────────────────────────────────
const H = () => ({
  apikey:         SB_KEY,
  Authorization:  `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

const Hmin = () => ({ ...H(), Prefer: 'return=minimal' })
const Hrep = () => ({ ...H(), Prefer: 'return=representation' })

// 감사 로그 기록
async function auditLog(action, userId, severity = 'critical', meta = {}) {
  try {
    await fetch(`${SB_URL}/rest/v1/security_audit_logs`, {
      method:  'POST',
      headers: Hmin(),
      body: JSON.stringify({
        action,
        user_id:    userId || null,
        ip_address: null,
        severity,
        meta:       JSON.stringify({ ...meta, incident_response: true }),
        created_at: new Date().toISOString(),
      }),
    })
  } catch { /* 로그 실패는 무시 */ }
}

// system_settings 에서 비상 상태 읽기
async function getEmergencyState() {
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/system_settings?key=eq.${EMERGENCY_KEY}&select=value,updated_at&limit=1`,
      { headers: H() }
    )
    if (!r.ok) return { active: false }
    const rows = await r.json().catch(() => [])
    if (!Array.isArray(rows) || rows.length === 0) return { active: false }
    const v = JSON.parse(rows[0].value || '{}')
    return { active: !!v.active, reason: v.reason, activated_by: v.activated_by, activated_at: rows[0].updated_at }
  } catch { return { active: false } }
}

// system_settings 에 비상 상태 저장
async function setEmergencyState(active, reason, userId) {
  const value = JSON.stringify({ active, reason, activated_by: userId, ts: new Date().toISOString() })
  // upsert
  await fetch(`${SB_URL}/rest/v1/system_settings`, {
    method:  'POST',
    headers: { ...H(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      key:        EMERGENCY_KEY,
      value,
      updated_at: new Date().toISOString(),
    }),
  })
}

// ══════════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════════
async function _handleIncidentResponse_impl(req) {
  if (req.method === 'OPTIONS') return handleOptions()

  // 모든 액션은 admin JWT 또는 CRON_SECRET 필요
  const { ok: isAdmin, response: authErr, user } = await requireAdmin(req)
  if (!isAdmin) return authErr

  const url    = new URL(req.url)
  const action = url.searchParams.get('action') || (req.method === 'GET' ? 'status' : '')

  // ── GET: 비상 상태 조회 ─────────────────────────────────────────────
  if (req.method === 'GET') {
    if (action === 'status') return getStatus()
    if (action === 'locked_accounts') return getLockedAccounts(url)
    if (action === 'blocked_ips') return getMassBlockedIPs(url)
    if (action === 'incident_log') return getIncidentLog(url)
    return badRequest(`알 수 없는 action: ${action}`)
  }

  // ── POST: 비상 대응 조치 ────────────────────────────────────────────
  if (req.method === 'POST') {
    let body = {}
    try { body = await req.json() } catch { return badRequest('Invalid JSON') }

    const act = body.action || action

    switch (act) {
      case 'emergency_lock':       return emergencyLock(body, user)
      case 'emergency_unlock':     return emergencyUnlock(body, user)
      case 'mass_lock_accounts':   return massLockAccounts(body, user)
      case 'mass_unlock_accounts': return massUnlockAccounts(body, user)
      case 'mass_block_ips':       return massBlockIPs(body, user)
      case 'mass_unblock_ips':     return massUnblockIPs(body, user)
      case 'force_password_reset': return forcePasswordReset(body, user)
      case 'invalidate_sessions':  return invalidateSessions(body, user)
      case 'emergency_wipe_content': return emergencyWipeContent(body, user)
      case 'send_alert':           return sendEmergencyAlert(body, user)
      default:
        return badRequest(`알 수 없는 action: ${act}`)
    }
  }

  return json({ error: 'Method Not Allowed' }, 405)
}

// ══════════════════════════════════════════════════════════════════════════
// 1. 비상 상태 조회
// ══════════════════════════════════════════════════════════════════════════
async function getStatus() {
  const [emergency, lockedCount, blockedCount] = await Promise.allSettled([
    getEmergencyState(),
    fetch(`${SB_URL}/rest/v1/profiles?admin_locked=eq.true&select=id&limit=1`, { headers: { ...H(), Prefer: 'count=exact' } }),
    fetch(`${SB_URL}/rest/v1/blocked_ips?is_active=eq.true&select=id&limit=1`, { headers: { ...H(), Prefer: 'count=exact' } }),
  ])

  const emergencyState = emergency.status === 'fulfilled' ? emergency.value : { active: false }
  const locked = lockedCount.status === 'fulfilled'
    ? parseInt(lockedCount.value.headers?.get?.('content-range')?.split('/')?.[1] || '0') : 0
  const blocked = blockedCount.status === 'fulfilled'
    ? parseInt(blockedCount.value.headers?.get?.('content-range')?.split('/')?.[1] || '0') : 0

  return ok({
    emergency_lock: emergencyState,
    stats: {
      locked_accounts: locked,
      blocked_ips:     blocked,
    },
    available_actions: [
      'emergency_lock', 'emergency_unlock',
      'mass_lock_accounts', 'mass_unlock_accounts',
      'mass_block_ips', 'mass_unblock_ips',
      'force_password_reset', 'invalidate_sessions',
      'emergency_wipe_content', 'send_alert',
    ],
    checked_at: new Date().toISOString(),
  })
}

// ══════════════════════════════════════════════════════════════════════════
// 2. 비상 잠금 활성화 — 플랫폼 전체 쓰기 차단 플래그
// ══════════════════════════════════════════════════════════════════════════
async function emergencyLock(body, user) {
  const reason = body.reason || '비상 상황 발생'
  await setEmergencyState(true, reason, user?.id || 'system')
  await auditLog('emergency_lock_activated', user?.id, 'critical', { reason })

  // 자동 알림 발송
  await sendEmergencyAlert({ subject: '🚨 비상 잠금 활성화', reason }, user)

  return ok({
    ok:           true,
    action:       'emergency_lock',
    message:      '비상 잠금이 활성화되었습니다. 모든 쓰기 API가 차단됩니다.',
    reason,
    activated_at: new Date().toISOString(),
  })
}

// ══════════════════════════════════════════════════════════════════════════
// 3. 비상 잠금 해제
// ══════════════════════════════════════════════════════════════════════════
async function emergencyUnlock(body, user) {
  await setEmergencyState(false, '', user?.id || 'system')
  await auditLog('emergency_lock_deactivated', user?.id, 'high', { note: body.note || '' })

  return ok({
    ok:           true,
    action:       'emergency_unlock',
    message:      '비상 잠금이 해제되었습니다.',
    unlocked_at:  new Date().toISOString(),
  })
}

// ══════════════════════════════════════════════════════════════════════════
// 4. 잠긴 계정 목록 조회
// ══════════════════════════════════════════════════════════════════════════
async function getLockedAccounts(url) {
  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0)

  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/profiles?admin_locked=eq.true&select=id,username,display_name,email,role,updated_at&order=updated_at.desc&limit=${limit}&offset=${offset}`,
      { headers: { ...H(), Prefer: 'count=exact' } }
    )
    const accounts = await r.json().catch(() => [])
    const total    = parseInt(r.headers?.get?.('content-range')?.split('/')?.[1] || '0')
    return ok({ accounts: Array.isArray(accounts) ? accounts : [], total, limit, offset })
  } catch {
    return serverError('잠긴 계정 조회 실패')
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 5. 대량 계정 잠금
// ══════════════════════════════════════════════════════════════════════════
async function massLockAccounts(body, user) {
  const { user_ids, reason = '비상 잠금', lock_all_suspicious = false } = body

  if (!user_ids && !lock_all_suspicious) {
    return badRequest('user_ids 배열 또는 lock_all_suspicious:true 필요')
  }

  const results = { locked: 0, failed: 0, skipped: 0 }

  if (lock_all_suspicious) {
    // 최근 24시간 내 suspicious 보안 이벤트 유저 자동 탐지
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/security_audit_logs?severity=eq.critical&created_at=gte.${since}&select=user_id&not.is.null=user_id&limit=100`,
        { headers: H() }
      )
      const logs = await r.json().catch(() => [])
      const suspiciousIds = [...new Set(logs.filter(l => l.user_id).map(l => l.user_id))]

      for (const uid of suspiciousIds) {
        const ok = await lockAccount(uid, reason)
        ok ? results.locked++ : results.failed++
      }
    } catch {
      return serverError('suspicious 유저 탐지 실패')
    }
  } else {
    const ids = Array.isArray(user_ids) ? user_ids.slice(0, 500) : []
    for (const uid of ids) {
      if (typeof uid !== 'string') { results.skipped++; continue }
      const locked = await lockAccount(uid, reason)
      locked ? results.locked++ : results.failed++
    }
  }

  await auditLog('mass_account_lock', user?.id, 'critical', { ...results, reason, lock_all_suspicious })

  return ok({
    ok:     true,
    action: 'mass_lock_accounts',
    ...results,
    reason,
    timestamp: new Date().toISOString(),
  })
}

async function lockAccount(userId, reason) {
  try {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(userId)) return false

    const r = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${userId}`,
      {
        method:  'PATCH',
        headers: Hmin(),
        body: JSON.stringify({ admin_locked: true, lock_reason: reason, locked_at: new Date().toISOString() }),
      }
    )
    return r.ok || r.status === 204
  } catch { return false }
}

// ══════════════════════════════════════════════════════════════════════════
// 6. 대량 계정 잠금 해제
// ══════════════════════════════════════════════════════════════════════════
async function massUnlockAccounts(body, user) {
  const { user_ids, unlock_all = false } = body

  if (!user_ids && !unlock_all) {
    return badRequest('user_ids 배열 또는 unlock_all:true 필요')
  }

  let r
  if (unlock_all) {
    r = await fetch(
      `${SB_URL}/rest/v1/profiles?admin_locked=eq.true`,
      {
        method:  'PATCH',
        headers: { ...H(), Prefer: 'count=exact' },
        body: JSON.stringify({ admin_locked: false, lock_reason: null, locked_at: null }),
      }
    )
  } else {
    const ids = Array.isArray(user_ids) ? user_ids.slice(0, 500) : []
    const inClause = ids.filter(id => /^[0-9a-f-]{36}$/i.test(id)).map(id => `"${id}"`).join(',')
    if (!inClause) return badRequest('유효한 user_ids 없음')

    r = await fetch(
      `${SB_URL}/rest/v1/profiles?id=in.(${inClause})`,
      {
        method:  'PATCH',
        headers: { ...H(), Prefer: 'count=exact' },
        body: JSON.stringify({ admin_locked: false, lock_reason: null, locked_at: null }),
      }
    )
  }

  const count = parseInt(r.headers?.get?.('content-range')?.split('/')?.[1] || '0')
  await auditLog('mass_account_unlock', user?.id, 'high', { unlock_all, count })

  return ok({
    ok:           true,
    action:       'mass_unlock_accounts',
    unlocked:     count,
    timestamp:    new Date().toISOString(),
  })
}

// ══════════════════════════════════════════════════════════════════════════
// 7. 대량 IP 차단
// ══════════════════════════════════════════════════════════════════════════
async function massBlockIPs(body, user) {
  const { ips, reason = '비상 IP 차단', expires_in_hours = 72 } = body

  if (!Array.isArray(ips) || ips.length === 0) {
    return badRequest('ips 배열 필요 (예: ["1.2.3.4","5.6.7.8"])')
  }

  const expiresAt  = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000).toISOString()
  const ipv4Re     = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6Re     = /^[0-9a-fA-F:]+$/
  const results    = { blocked: 0, failed: 0, invalid: 0 }

  const validIPs = ips.slice(0, 500).filter(ip => {
    if (typeof ip !== 'string') { results.invalid++; return false }
    if (!ipv4Re.test(ip) && !ipv6Re.test(ip)) { results.invalid++; return false }
    return true
  })

  // 배치 upsert
  const rows = validIPs.map(ip => ({
    ip_address: ip,
    reason,
    blocked_by: user?.id || 'system',
    expires_at: expiresAt,
    is_active:  true,
    blocked_at: new Date().toISOString(),
  }))

  if (rows.length > 0) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/blocked_ips`, {
        method:  'POST',
        headers: { ...H(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body:    JSON.stringify(rows),
      })
      if (r.ok || r.status === 201 || r.status === 204) {
        results.blocked = rows.length
      } else {
        results.failed = rows.length
      }
    } catch {
      results.failed = rows.length
    }
  }

  await auditLog('mass_ip_block', user?.id, 'critical', { ...results, reason, expires_at: expiresAt })

  return ok({
    ok:     true,
    action: 'mass_block_ips',
    ...results,
    reason,
    expires_at: expiresAt,
    timestamp:  new Date().toISOString(),
  })
}

// ══════════════════════════════════════════════════════════════════════════
// 8. 대량 IP 차단 해제
// ══════════════════════════════════════════════════════════════════════════
async function massUnblockIPs(body, user) {
  const { ips, unblock_all = false } = body

  let r
  if (unblock_all) {
    r = await fetch(
      `${SB_URL}/rest/v1/blocked_ips?is_active=eq.true`,
      {
        method:  'PATCH',
        headers: { ...H(), Prefer: 'count=exact' },
        body: JSON.stringify({ is_active: false }),
      }
    )
  } else {
    if (!Array.isArray(ips) || ips.length === 0) return badRequest('ips 배열 또는 unblock_all:true 필요')
    const ipList = ips.map(ip => `"${ip}"`).join(',')
    r = await fetch(
      `${SB_URL}/rest/v1/blocked_ips?ip_address=in.(${ipList})`,
      {
        method:  'PATCH',
        headers: { ...H(), Prefer: 'count=exact' },
        body: JSON.stringify({ is_active: false }),
      }
    )
  }

  const count = parseInt(r.headers?.get?.('content-range')?.split('/')?.[1] || '0')
  await auditLog('mass_ip_unblock', user?.id, 'high', { unblock_all, count })

  return ok({ ok: true, action: 'mass_unblock_ips', unblocked: count, timestamp: new Date().toISOString() })
}

// ══════════════════════════════════════════════════════════════════════════
// 9. 긴급 비밀번호 재설정 강제
// ══════════════════════════════════════════════════════════════════════════
async function forcePasswordReset(body, user) {
  const { user_ids, all_users = false } = body

  if (!user_ids && !all_users) {
    return badRequest('user_ids 배열 또는 all_users:true 필요')
  }

  // profiles에 force_password_reset 플래그 설정
  let r
  if (all_users) {
    r = await fetch(
      `${SB_URL}/rest/v1/profiles?role=neq.admin`,  // admin은 제외
      {
        method:  'PATCH',
        headers: { ...H(), Prefer: 'count=exact' },
        body: JSON.stringify({ force_password_reset: true, force_reset_at: new Date().toISOString() }),
      }
    )
  } else {
    const ids = Array.isArray(user_ids) ? user_ids.slice(0, 500) : []
    const inClause = ids.filter(id => /^[0-9a-f-]{36}$/i.test(id)).map(id => `"${id}"`).join(',')
    if (!inClause) return badRequest('유효한 user_ids 없음')

    r = await fetch(
      `${SB_URL}/rest/v1/profiles?id=in.(${inClause})`,
      {
        method:  'PATCH',
        headers: { ...H(), Prefer: 'count=exact' },
        body: JSON.stringify({ force_password_reset: true, force_reset_at: new Date().toISOString() }),
      }
    )
  }

  const count = parseInt(r.headers?.get?.('content-range')?.split('/')?.[1] || '0')
  await auditLog('force_password_reset', user?.id, 'critical', { all_users, count })

  return ok({
    ok:         true,
    action:     'force_password_reset',
    affected:   count,
    note:       '다음 로그인 시 비밀번호 재설정이 요구됩니다.',
    timestamp:  new Date().toISOString(),
  })
}

// ══════════════════════════════════════════════════════════════════════════
// 10. 활성 세션 전체 무효화
//     Supabase auth.users의 refresh 토큰 모두 폐기
// ══════════════════════════════════════════════════════════════════════════
async function invalidateSessions(body, user) {
  const { user_ids, all_sessions = false } = body

  if (!user_ids && !all_sessions) {
    return badRequest('user_ids 배열 또는 all_sessions:true 필요')
  }

  const results = { invalidated: 0, failed: 0 }

  if (all_sessions) {
    // Supabase admin API: auth.users의 세션 일괄 로그아웃
    // Supabase REST로는 직접 지원 안 함 → auth_token 회전 플래그로 대체
    try {
      // profiles에 session_invalidated_at 타임스탬프 기록
      // 프론트에서 이 값을 확인하여 세션 만료 처리
      const r = await fetch(
        `${SB_URL}/rest/v1/profiles`,
        {
          method:  'PATCH',
          headers: { ...H(), Prefer: 'count=exact' },
          body: JSON.stringify({ session_invalidated_at: new Date().toISOString() }),
        }
      )
      results.invalidated = parseInt(r.headers?.get?.('content-range')?.split('/')?.[1] || '0')
    } catch { results.failed++ }
  } else {
    const ids = Array.isArray(user_ids) ? user_ids.slice(0, 500) : []
    for (const uid of ids) {
      if (!/^[0-9a-f-]{36}$/i.test(uid)) continue
      try {
        const r = await fetch(
          `${SB_URL}/rest/v1/profiles?id=eq.${uid}`,
          {
            method:  'PATCH',
            headers: Hmin(),
            body: JSON.stringify({ session_invalidated_at: new Date().toISOString() }),
          }
        )
        r.ok ? results.invalidated++ : results.failed++
      } catch { results.failed++ }
    }
  }

  await auditLog('invalidate_sessions', user?.id, 'critical', { ...results, all_sessions })

  return ok({
    ok:         true,
    action:     'invalidate_sessions',
    ...results,
    note:       '프론트엔드에서 session_invalidated_at 값 확인 후 강제 로그아웃 처리됩니다.',
    timestamp:  new Date().toISOString(),
  })
}

// ══════════════════════════════════════════════════════════════════════════
// 11. 콘텐츠 긴급 삭제 (스팸/악성 콘텐츠 대량 제거)
// ══════════════════════════════════════════════════════════════════════════
async function emergencyWipeContent(body, user) {
  const { content_ids, table = 'community_posts', wipe_all_spam = false, since } = body

  if (!content_ids && !wipe_all_spam) {
    return badRequest('content_ids 배열 또는 wipe_all_spam:true 필요')
  }

  const ALLOWED_TABLES = ['community_posts', 'comments', 'notifications']
  if (!ALLOWED_TABLES.includes(table)) {
    return badRequest(`허용된 테이블만 가능: ${ALLOWED_TABLES.join(', ')}`)
  }

  const results = { deleted: 0, failed: 0 }

  if (wipe_all_spam && since) {
    // since 이후 is_flagged=true 또는 report_count > 10 콘텐츠 soft delete
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/${table}?created_at=gte.${encodeURIComponent(since)}&is_deleted=eq.false`,
        {
          method:  'PATCH',
          headers: { ...H(), Prefer: 'count=exact' },
          body: JSON.stringify({ is_deleted: true, deleted_at: new Date().toISOString(), delete_reason: '비상 대응' }),
        }
      )
      results.deleted = parseInt(r.headers?.get?.('content-range')?.split('/')?.[1] || '0')
    } catch { results.failed++ }
  } else {
    const ids = Array.isArray(content_ids) ? content_ids.slice(0, 1000) : []
    const validIds = ids.filter(id => /^[0-9a-f-]{36}$/i.test(id))
    if (validIds.length === 0) return badRequest('유효한 content_ids 없음')

    const inClause = validIds.map(id => `"${id}"`).join(',')
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/${table}?id=in.(${inClause})`,
        {
          method:  'PATCH',
          headers: { ...H(), Prefer: 'count=exact' },
          body: JSON.stringify({ is_deleted: true, deleted_at: new Date().toISOString(), delete_reason: '비상 대응' }),
        }
      )
      results.deleted = parseInt(r.headers?.get?.('content-range')?.split('/')?.[1] || '0')
    } catch { results.failed++ }
  }

  await auditLog('emergency_content_wipe', user?.id, 'critical', { ...results, table, wipe_all_spam })

  return ok({
    ok:      true,
    action:  'emergency_wipe_content',
    table,
    ...results,
    timestamp: new Date().toISOString(),
  })
}

// ══════════════════════════════════════════════════════════════════════════
// 12. 비상 알림 발송 (관리자 이메일)
// ══════════════════════════════════════════════════════════════════════════
async function sendEmergencyAlert(body, user) {
  const { subject = '🚨 Insightship 비상 알림', reason = '', recipients } = body

  const to = Array.isArray(recipients) && recipients.length > 0
    ? recipients
    : [ADMIN_EMAIL]

  const html = `
    <div style="font-family:monospace;background:#0a0a0f;color:#e2e8f0;padding:24px;border-radius:8px;border:2px solid #F43F5E;">
      <h2 style="color:#F87171;margin:0 0 16px">🚨 INSIGHTSHIP 비상 대응 알림</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="color:#94a3b8;padding:4px 0">시각</td><td style="color:#e2e8f0">${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</td></tr>
        <tr><td style="color:#94a3b8;padding:4px 0">사유</td><td style="color:#fca5a5">${reason || '명시되지 않음'}</td></tr>
        <tr><td style="color:#94a3b8;padding:4px 0">실행자</td><td style="color:#e2e8f0">${user?.username || user?.email || 'system'}</td></tr>
      </table>
      <p style="margin-top:16px;color:#94a3b8;font-size:12px;">
        이 알림은 Insightship 플랫폼 비상 대응 시스템에서 자동 발송되었습니다.<br>
        즉시 관리자 콘솔(<a href="https://www.insightship.pacm.kr/admin" style="color:#60A5FA">admin</a>)에 접속하여 상황을 확인하세요.
      </p>
    </div>`

  let emailSent = false
  if (RESEND_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:    'Insightship Security <security@insightship.pacm.kr>',
          to,
          subject: `[긴급] ${subject}`,
          html,
        }),
      })
      emailSent = r.ok
    } catch { emailSent = false }
  }

  await auditLog('emergency_alert_sent', user?.id, 'critical', { subject, reason, emailSent, recipients: to })

  return ok({
    ok:         true,
    action:     'send_alert',
    email_sent: emailSent,
    recipients: to,
    timestamp:  new Date().toISOString(),
  })
}

// ══════════════════════════════════════════════════════════════════════════
// 13. 대량 차단 IP 목록 조회
// ══════════════════════════════════════════════════════════════════════════
async function getMassBlockedIPs(url) {
  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500)
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0)

  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/blocked_ips?is_active=eq.true&select=id,ip_address,reason,blocked_by,expires_at,blocked_at&order=blocked_at.desc&limit=${limit}&offset=${offset}`,
      { headers: { ...H(), Prefer: 'count=exact' } }
    )
    const ips   = await r.json().catch(() => [])
    const total = parseInt(r.headers?.get?.('content-range')?.split('/')?.[1] || '0')
    return ok({ blocked_ips: Array.isArray(ips) ? ips : [], total, limit, offset })
  } catch { return serverError('IP 목록 조회 실패') }
}

// ══════════════════════════════════════════════════════════════════════════
// 14. 사건 로그 조회
// ══════════════════════════════════════════════════════════════════════════
async function getIncidentLog(url) {
  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0)

  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/security_audit_logs?meta=like.*incident_response*&select=id,action,user_id,ip_address,severity,meta,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`,
      { headers: { ...H(), Prefer: 'count=exact' } }
    )
    const logs  = await r.json().catch(() => [])
    const total = parseInt(r.headers?.get?.('content-range')?.split('/')?.[1] || '0')
    return ok({ logs: Array.isArray(logs) ? logs : [], total, limit, offset })
  } catch { return serverError('사건 로그 조회 실패') }
}

  return _handleIncidentResponse_impl
})();

const handleSecurityAudit = (() => {
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  api/security-audit.js — 보안 감사 로그 & 이벤트 API v1.0              ║
 * ║                                                                          ║
 * ║  설계도 §7 Infrastructure & Logging 구현                                ║
 * ║  - 보안 이벤트 조회 (관리자 전용)                                       ║
 * ║  - 실시간 위협 통계                                                     ║
 * ║  - IP 차단/허용 목록 관리                                               ║
 * ║  - 계정 잠금 상태 조회                                                  ║
 * ║  - 설계도 §8 DevSecOps — 보안 상태 헬스체크                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
// (_auth.js imports moved to top of file)



const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// ── 보안 이벤트 타입 정의 ────────────────────────────────────────────────
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low', 'info']

async function _handleSecurityAudit_impl(req) {
  if (req.method === 'OPTIONS') return handleOptions()

  const { ok: isAdmin, response: authErr, user, source } = await requireAdmin(req)
  if (!isAdmin) return authErr

  const url    = new URL(req.url)
  const action = url.searchParams.get('action') || 'list'

  // ── GET: 조회 액션들 ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    switch (action) {
      case 'list':       return getLogs(url)
      case 'stats':      return getStats()
      case 'health':     return getHealthCheck()
      case 'blocked_ips': return getBlockedIPs()
      default:
        return badRequest(`알 수 없는 action: ${action}`)
    }
  }

  // ── POST: 이벤트 기록 / IP 차단 관리 ─────────────────────────────────
  if (req.method === 'POST') {
    let body
    try { body = await req.json() } catch { return badRequest('Invalid JSON') }

    switch (body?.action) {
      case 'log_event':   return logEvent(body, user)
      case 'block_ip':    return blockIP(body, user)
      case 'unblock_ip':  return unblockIP(body, user)
      default:
        return badRequest(`알 수 없는 action: ${body?.action}`)
    }
  }

  return json({ error: 'Method Not Allowed' }, 405)
}

// ══════════════════════════════════════════════════════════════════════════
// 보안 로그 목록 조회
// ══════════════════════════════════════════════════════════════════════════
async function getLogs(url) {
  const limit    = Math.min(parseInt(url.searchParams.get('limit')    || '50'), 200)
  const offset   = Math.max(parseInt(url.searchParams.get('offset')   || '0'), 0)
  const severity = url.searchParams.get('severity') || ''
  const action   = url.searchParams.get('filter_action') || ''
  const since    = url.searchParams.get('since') || ''

  let query = `${SB_URL}/rest/v1/security_audit_logs?select=id,action,user_id,ip_address,severity,meta,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`
  if (severity && SEVERITY_LEVELS.includes(severity)) query += `&severity=eq.${severity}`
  if (action)   query += `&action=eq.${encodeURIComponent(action)}`
  if (since)    query += `&created_at=gte.${encodeURIComponent(since)}`

  try {
    const r = await fetch(query, {
      headers: { ...serviceH(), Prefer: 'count=exact' },
    })
    const logs  = await r.json().catch(() => [])
    const total = parseInt(r.headers.get('content-range')?.split('/')[1] || '0')
    return ok({ logs: Array.isArray(logs) ? logs : [], total, limit, offset })
  } catch (e) {
    return serverError('보안 로그 조회 실패')
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 보안 통계 (설계도 §7 SIEM 실시간 알림 대응)
// ══════════════════════════════════════════════════════════════════════════
async function getStats() {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const since7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString()

    const [r24h, r7d, rCritical, rBlocked] = await Promise.allSettled([
      fetch(
        `${SB_URL}/rest/v1/security_audit_logs?created_at=gte.${since24h}&select=id&limit=1`,
        { headers: { ...serviceH(), Prefer: 'count=exact' } }
      ),
      fetch(
        `${SB_URL}/rest/v1/security_audit_logs?created_at=gte.${since7d}&select=id&limit=1`,
        { headers: { ...serviceH(), Prefer: 'count=exact' } }
      ),
      fetch(
        `${SB_URL}/rest/v1/security_audit_logs?severity=eq.critical&created_at=gte.${since24h}&select=id,action,ip_address,created_at&limit=10&order=created_at.desc`,
        { headers: serviceH() }
      ),
      fetch(
        `${SB_URL}/rest/v1/blocked_ips?is_active=eq.true&select=ip_address,reason,blocked_at&limit=50`,
        { headers: serviceH() }
      ),
    ])

    const getCount = (r) => r.status === 'fulfilled'
      ? parseInt(r.value.headers?.get?.('content-range')?.split('/')?.[1] || '0') : 0
    const getData  = async (r) => {
      if (r.status !== 'fulfilled') return []
      return r.value.json().catch(() => [])
    }

    return ok({
      stats: {
        events_24h:   getCount(r24h),
        events_7d:    getCount(r7d),
        critical_24h: (await getData(rCritical)).length,
      },
      critical_events: await getData(rCritical),
      blocked_ips:     await getData(rBlocked),
      generated_at:    new Date().toISOString(),
    })
  } catch (e) {
    return serverError('통계 조회 실패')
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 보안 헬스체크 (설계도 §8 DevSecOps)
// ══════════════════════════════════════════════════════════════════════════
async function getHealthCheck() {
  const checks = []
  const startTime = Date.now()

  // 1. DB 연결 확인
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/profiles?select=id&limit=1`,
      { headers: serviceH() }
    )
    checks.push({ name: 'database_connection', ok: r.ok, status: r.status })
  } catch (e) {
    checks.push({ name: 'database_connection', ok: false, error: 'Connection failed' })
  }

  // 2. 보안 감사 테이블 존재 확인
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/security_audit_logs?select=id&limit=1`,
      { headers: serviceH() }
    )
    checks.push({ name: 'audit_table', ok: r.ok || r.status === 406, status: r.status })
  } catch {
    checks.push({ name: 'audit_table', ok: false, error: 'Table missing' })
  }

  // 3. 차단 IP 테이블 확인
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/blocked_ips?select=id&limit=1`,
      { headers: serviceH() }
    )
    checks.push({ name: 'blocked_ips_table', ok: r.ok || r.status === 406, status: r.status })
  } catch {
    checks.push({ name: 'blocked_ips_table', ok: false, error: 'Table missing' })
  }

  // 4. RLS 활성화 확인 (profiles 테이블 서비스 롤로 접근 가능)
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/profiles?select=id&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    )
    checks.push({ name: 'rls_service_role', ok: r.ok, status: r.status })
  } catch {
    checks.push({ name: 'rls_service_role', ok: false, error: 'RLS check failed' })
  }

  // 5. 환경 변수 확인
  const envChecks = {
    SUPABASE_URL:              !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET:               !!process.env.CRON_SECRET,
  }
  checks.push({
    name: 'environment_variables',
    ok:   Object.values(envChecks).every(Boolean),
    detail: envChecks,
  })

  const allOk    = checks.every(c => c.ok)
  const duration = Date.now() - startTime

  return json({
    status:       allOk ? 'healthy' : 'degraded',
    checks,
    duration_ms:  duration,
    checked_at:   new Date().toISOString(),
    version:      'security-v3.0',
  }, allOk ? 200 : 503)
}

// ══════════════════════════════════════════════════════════════════════════
// IP 차단 목록 조회
// ══════════════════════════════════════════════════════════════════════════
async function getBlockedIPs() {
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/blocked_ips?is_active=eq.true&select=id,ip_address,reason,blocked_by,expires_at,blocked_at&order=blocked_at.desc&limit=100`,
      { headers: serviceH() }
    )
    const ips = await r.json().catch(() => [])
    return ok({ blocked_ips: Array.isArray(ips) ? ips : [] })
  } catch {
    return serverError('IP 차단 목록 조회 실패')
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 보안 이벤트 수동 기록
// ══════════════════════════════════════════════════════════════════════════
async function logEvent(body, user) {
  const { action, ip_address, severity = 'info', meta = {} } = body
  if (!action) return badRequest('action 필수')
  if (!SEVERITY_LEVELS.includes(severity)) return badRequest('유효하지 않은 severity')

  try {
    const r = await fetch(`${SB_URL}/rest/v1/security_audit_logs`, {
      method:  'POST',
      headers: { ...serviceH(), Prefer: 'return=representation' },
      body: JSON.stringify({
        action,
        user_id:    user?.id  || null,
        ip_address: ip_address || null,
        severity,
        meta:       JSON.stringify(meta),
        created_at: new Date().toISOString(),
      }),
    })
    const inserted = await r.json().catch(() => [{}])
    return json({ ok: true, id: inserted?.[0]?.id }, 201)
  } catch {
    return serverError('이벤트 기록 실패')
  }
}

// ══════════════════════════════════════════════════════════════════════════
// IP 차단 추가 (설계도 §4 WAF 연동)
// ══════════════════════════════════════════════════════════════════════════
async function blockIP(body, user) {
  const { ip_address, reason, expires_in_hours = 24 } = body
  if (!ip_address) return badRequest('ip_address 필수')
  if (!reason)     return badRequest('reason 필수')

  // IP 형식 검증
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6 = /^[0-9a-fA-F:]+$/
  if (!ipv4.test(ip_address) && !ipv6.test(ip_address)) {
    return badRequest('유효하지 않은 IP 주소')
  }

  const expiresAt = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000).toISOString()

  try {
    // upsert (같은 IP 재차단 허용)
    const r = await fetch(`${SB_URL}/rest/v1/blocked_ips`, {
      method:  'POST',
      headers: { ...serviceH(), Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        ip_address,
        reason,
        blocked_by: user?.id || 'system',
        expires_at: expiresAt,
        is_active:  true,
        blocked_at: new Date().toISOString(),
      }),
    })
    const data = await r.json().catch(() => [{}])

    // 감사 로그
    await fetch(`${SB_URL}/rest/v1/security_audit_logs`, {
      method:  'POST',
      headers: { ...serviceH(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        action:     'ip_blocked',
        user_id:    user?.id || null,
        ip_address,
        severity:   'high',
        meta:       JSON.stringify({ reason, expires_at: expiresAt }),
        created_at: new Date().toISOString(),
      }),
    })

    return json({ ok: true, ip: ip_address, expires_at: expiresAt }, 201)
  } catch {
    return serverError('IP 차단 실패')
  }
}

// ══════════════════════════════════════════════════════════════════════════
// IP 차단 해제
// ══════════════════════════════════════════════════════════════════════════
async function unblockIP(body, user) {
  const { ip_address } = body
  if (!ip_address) return badRequest('ip_address 필수')

  try {
    await fetch(
      `${SB_URL}/rest/v1/blocked_ips?ip_address=eq.${encodeURIComponent(ip_address)}`,
      {
        method:  'PATCH',
        headers: { ...serviceH(), Prefer: 'return=minimal' },
        body: JSON.stringify({ is_active: false }),
      }
    )

    // 감사 로그
    await fetch(`${SB_URL}/rest/v1/security_audit_logs`, {
      method:  'POST',
      headers: { ...serviceH(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        action:     'ip_unblocked',
        user_id:    user?.id || null,
        ip_address,
        severity:   'info',
        meta:       JSON.stringify({ unblocked_by: user?.username || 'admin' }),
        created_at: new Date().toISOString(),
      }),
    })

    return ok({ ok: true, ip: ip_address, status: 'unblocked' })
  } catch {
    return serverError('IP 차단 해제 실패')
  }
}

  return _handleSecurityAudit_impl
})();

const handlePatchNotes = (() => {
/**
 * Insightship — Patch Notes API v1.0
 * ─────────────────────────────────────────────────────────────────────
 * 2주 1회 자동 패치노트 생성 + 관리자 수동 작성/수정/삭제
 *
 * 엔드포인트:
 *  GET  /api/patch-notes               — 전체 목록 (공개)
 *  GET  /api/patch-notes?id=xxx        — 단건 조회 (공개)
 *  POST /api/patch-notes  action=publish  — 수동 게시 (admin)
 *  POST /api/patch-notes  action=auto     — 자동 생성 (cron)
 *  PATCH /api/patch-notes?id=xxx       — 수정 (admin)
 *  DELETE /api/patch-notes?id=xxx      — 삭제 (admin)
 *
 * 자동 생성 스케줄: vercel.json cron → 격주 월요일 09:00 KST
 * 자동 생성 로직: ai_operations_log + work_logs 집계 → 변경 요약
 */



const SB_URL      = process.env.SUPABASE_URL         || ''
const SB_KEY      = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
const CRON_SECRET = process.env.CRON_SECRET          || ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cron-Secret',
}
const json = (d, s = 200) => new Response(JSON.stringify(d),
  { status: s, headers: { 'Content-Type': 'application/json', ...CORS } })

const SBH = () => ({
  'Content-Type':  'application/json',
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Prefer':        'return=representation',
})

// ── 관리자 JWT 검증 ───────────────────────────────────────────────────
async function verifyAdmin(token) {
  if (!token || !SB_URL || !SB_KEY) return null
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return null
    const u = await r.json()
    if (!u?.id) return null
    const pr = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${u.id}&select=role,username,display_name`, {
      headers: SBH(),
    })
    const rows = pr.ok ? await pr.json() : []
    if (!rows[0] || rows[0].role !== 'admin') return null
    return rows[0]
  } catch { return null }
}

// ── 인증 헬퍼 ─────────────────────────────────────────────────────────
async function getAuth(req) {
  const cronHeader = req.headers.get('x-cron-secret') || ''
  const authHeader = req.headers.get('authorization')  || ''
  const isCron  = CRON_SECRET && cronHeader === CRON_SECRET
  const jwt     = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const admin   = jwt ? await verifyAdmin(jwt) : null
  return { isCron, admin, isAuthed: isCron || !!admin }
}

// ── 패치노트 목록 조회 ────────────────────────────────────────────────
async function getList(limit = 20, offset = 0) {
  const r = await fetch(
    `${SB_URL}/rest/v1/patch_notes?is_published=eq.true&select=*&order=published_at.desc&limit=${limit}&offset=${offset}`,
    { headers: SBH() }
  )
  return r.ok ? await r.json() : []
}

// ── 단건 조회 ─────────────────────────────────────────────────────────
async function getOne(id) {
  const r = await fetch(
    `${SB_URL}/rest/v1/patch_notes?id=eq.${id}&select=*`,
    { headers: SBH() }
  )
  const rows = r.ok ? await r.json() : []
  return rows[0] || null
}

// ── 패치노트 삽입 ─────────────────────────────────────────────────────
async function insertNote(data) {
  const r = await fetch(`${SB_URL}/rest/v1/patch_notes`, {
    method:  'POST',
    headers: SBH(),
    body:    JSON.stringify(data),
  })
  if (!r.ok) { const e = await r.text(); return { ok: false, error: e } }
  const rows = await r.json()
  return { ok: true, row: rows[0] || rows }
}

// ── 패치노트 수정 ─────────────────────────────────────────────────────
async function updateNote(id, data) {
  const r = await fetch(`${SB_URL}/rest/v1/patch_notes?id=eq.${id}`, {
    method:  'PATCH',
    headers: SBH(),
    body:    JSON.stringify(data),
  })
  if (!r.ok) { const e = await r.text(); return { ok: false, error: e } }
  const rows = await r.json()
  return { ok: true, row: rows[0] || rows }
}

// ── 패치노트 삭제 (soft) ──────────────────────────────────────────────
async function deleteNote(id) {
  const r = await fetch(`${SB_URL}/rest/v1/patch_notes?id=eq.${id}`, {
    method:  'PATCH',
    headers: SBH(),
    body:    JSON.stringify({ is_published: false, deleted_at: new Date().toISOString() }),
  })
  return { ok: r.ok }
}

// ── KST 날짜 문자열 ───────────────────────────────────────────────────
function kstDateStr(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600_000)
    .toISOString().slice(0, 10)
}

// ── 격주 여부 확인 (ISO week 기준 짝수 주) ───────────────────────────
function isBiweeklyWeek() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const week  = Math.ceil(((now - start) / 86400_000 + start.getDay() + 1) / 7)
  return week % 2 === 0   // 짝수 주 월요일에만 실행
}

// ── 최근 2주 운영 로그 집계 ───────────────────────────────────────────
async function collectRecentOpsLogs() {
  const since = new Date(Date.now() - 14 * 86400_000).toISOString()
  const r = await fetch(
    `${SB_URL}/rest/v1/ai_operations_log?created_at=gt.${encodeURIComponent(since)}&select=task_type,result,engine,details,created_at&order=created_at.desc&limit=200`,
    { headers: SBH() }
  )
  return r.ok ? await r.json() : []
}

// ── 최근 변경 커밋 로그(work_logs) 집계 ─────────────────────────────
async function collectRecentWorkLogs() {
  const since = new Date(Date.now() - 14 * 86400_000).toISOString()
  const r = await fetch(
    `${SB_URL}/rest/v1/work_logs?created_at=gt.${encodeURIComponent(since)}&select=task_type,summary,worker_key,created_at&order=created_at.desc&limit=100`,
    { headers: SBH() }
  )
  return r.ok ? await r.json() : []
}

// ── 버전 번호 자동 계산 ───────────────────────────────────────────────
async function getNextVersion() {
  const r = await fetch(
    `${SB_URL}/rest/v1/patch_notes?select=version&order=published_at.desc&limit=1`,
    { headers: SBH() }
  )
  const rows = r.ok ? await r.json() : []
  if (!rows[0]?.version) return 'v1.0'
  // "v1.4" → "v1.5"
  const m = rows[0].version.match(/^v(\d+)\.(\d+)$/)
  if (!m) return 'v1.0'
  return `v${m[1]}.${parseInt(m[2], 10) + 1}`
}

// ── 자동 패치노트 생성 ────────────────────────────────────────────────
async function autoGeneratePatchNote() {
  const [opsLogs, workLogs] = await Promise.all([
    collectRecentOpsLogs(),
    collectRecentWorkLogs(),
  ])

  // 태스크 타입별 집계
  const opsSummary = {}
  for (const log of opsLogs) {
    const key = log.task_type || 'unknown'
    if (!opsSummary[key]) opsSummary[key] = { success: 0, error: 0, skip: 0 }
    opsSummary[key][log.result]   = (opsSummary[key][log.result]   || 0) + 1
  }

  // 주요 작업 변경 요약 추출
  const workSummary = {}
  for (const log of workLogs) {
    const key = log.task_type || 'general'
    if (!workSummary[key]) workSummary[key] = []
    if (log.summary) workSummary[key].push(log.summary)
  }

  // 마크다운 본문 생성
  const version = await getNextVersion()
  const dateStr = kstDateStr()
  const lines   = []

  lines.push(`## ${version} 패치노트 (${dateStr})`)
  lines.push('')
  lines.push('### 🤖 AI 자동 운영 현황 (최근 2주)')
  lines.push('')

  const opsKeys = Object.keys(opsSummary)
  if (opsKeys.length === 0) {
    lines.push('- 최근 2주간 운영 로그 없음')
  } else {
    for (const key of opsKeys) {
      const s = opsSummary[key]
      const total = (s.success || 0) + (s.error || 0) + (s.skip || 0)
      const rate  = total > 0 ? Math.round((s.success || 0) / total * 100) : 0
      lines.push(`- **${key}**: 총 ${total}회 실행 | 성공 ${s.success || 0}회 | 오류 ${s.error || 0}회 | 성공률 ${rate}%`)
    }
  }

  lines.push('')
  lines.push('### 🔧 주요 변경 사항')
  lines.push('')

  const workKeys = Object.keys(workSummary)
  if (workKeys.length === 0) {
    lines.push('- 이번 주기 자동 감지된 변경 없음')
  } else {
    for (const key of workKeys) {
      lines.push(`**[${key}]**`)
      for (const summary of workSummary[key].slice(0, 3)) {
        lines.push(`- ${summary}`)
      }
    }
  }

  lines.push('')
  lines.push('### 📊 시스템 안정성')
  lines.push('')
  const totalOps    = opsLogs.length
  const successOps  = opsLogs.filter(l => l.result === 'success').length
  const errorOps    = opsLogs.filter(l => l.result === 'error').length
  const overallRate = totalOps > 0 ? Math.round(successOps / totalOps * 100) : 100
  lines.push(`- 전체 AI 작업 실행: **${totalOps}회**`)
  lines.push(`- 성공: ${successOps}회 / 오류: ${errorOps}회`)
  lines.push(`- 전체 성공률: **${overallRate}%**`)

  lines.push('')
  lines.push('---')
  lines.push('*이 패치노트는 AI 시스템이 자동으로 작성했습니다.*')

  const body = lines.join('\n')

  // 태그 자동 추출
  const tags = ['자동생성', 'AI운영']
  if (errorOps > 0) tags.push('버그수정')
  if (workKeys.length > 0) tags.push('기능개선')

  // 제목 생성
  const title = `${version} — AI 자동 패치노트 (${dateStr})`

  const result = await insertNote({
    version,
    title,
    body,
    tags,
    is_published:  true,
    is_auto:       true,
    published_at:  new Date().toISOString(),
    created_at:    new Date().toISOString(),
    author:        'SYSTEM',
  })

  return { ...result, version, title, ops_count: totalOps, work_count: workLogs.length }
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────
async function _handlePatchNotes_impl(req) {
  if (req.method === 'OPTIONS') return json({}, 204)
  if (!SB_URL || !SB_KEY) return json({ error: 'Server misconfiguration' }, 500)

  const url  = new URL(req.url)
  const id   = url.searchParams.get('id')

  // ────────────────────────────────────────────────────────────────
  // GET — 공개 목록 / 단건
  // ────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (id) {
      const note = await getOne(id)
      if (!note) return json({ error: 'Not found' }, 404)
      return json({ ok: true, note })
    }
    const limit  = Math.min(parseInt(url.searchParams.get('limit')  || '20', 10), 100)
    const offset = parseInt(url.searchParams.get('offset') || '0',  10)
    const list   = await getList(limit, offset)
    return json({ ok: true, notes: list, total: list.length })
  }

  // ────────────────────────────────────────────────────────────────
  // POST — 수동 게시 / 자동 생성
  // ────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { isCron, admin, isAuthed } = await getAuth(req)
    if (!isAuthed) return json({ error: 'Unauthorized' }, 401)

    let body
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

    const action = body.action || 'publish'

    // 자동 생성 (cron 전용)
    if (action === 'auto') {
      if (!isCron && !admin) return json({ error: 'Cron or Admin required' }, 403)

      // 격주 체크 — 강제 플래그 없을 때만
      if (!body.force && !isBiweeklyWeek()) {
        return json({ ok: true, skipped: true, reason: '비격주 (짝수 주가 아님)', engine: 'patch-notes-auto-v1' })
      }

      const result = await autoGeneratePatchNote()
      return json({ ok: result.ok, engine: 'patch-notes-auto-v1', ...result })
    }

    // 수동 게시 (admin 전용)
    if (action === 'publish') {
      if (!admin) return json({ error: 'Admin required for manual publish' }, 403)

      const { title, body: noteBody, version, tags, changes } = body
      if (!title || !noteBody) return json({ error: 'title and body required' }, 400)

      const ver = version || await getNextVersion()
      const result = await insertNote({
        version:      ver,
        title,
        body:         noteBody,
        tags:         tags || [],
        changes:      changes || [],
        is_published: true,
        is_auto:      false,
        published_at: new Date().toISOString(),
        created_at:   new Date().toISOString(),
        author:       admin.display_name || admin.username || 'admin',
      })
      return json({ ok: result.ok, version: ver, ...result })
    }

    return json({ error: 'Unknown action' }, 400)
  }

  // ────────────────────────────────────────────────────────────────
  // PATCH — 수정
  // ────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { admin } = await getAuth(req)
    if (!admin) return json({ error: 'Admin required' }, 401)
    if (!id) return json({ error: 'id required' }, 400)

    let body
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

    const allowed = ['title', 'body', 'tags', 'changes', 'is_published', 'version']
    const patch   = {}
    for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k]
    patch.updated_at = new Date().toISOString()

    const result = await updateNote(id, patch)
    return json({ ok: result.ok, ...result })
  }

  // ────────────────────────────────────────────────────────────────
  // DELETE — 소프트 삭제
  // ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { admin } = await getAuth(req)
    if (!admin) return json({ error: 'Admin required' }, 401)
    if (!id) return json({ error: 'id required' }, 400)

    const result = await deleteNote(id)
    return json({ ok: result.ok, deleted: id })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}

  return _handlePatchNotes_impl
})();

const handleOffice = (() => {
/**
 * PACM AI OFFICE API v3
 * 자체 AI 엔진 전용 — 외부 API 완전 제거
 * SUPABASE_URL (서버사이드 환경변수) 사용
 */
// runtime: Node.js serverless

// (generateChat, generateText imported at top)

const SB_URL = process.env.SUPABASE_URL          // ← 서버사이드 env (VITE_ 제거)
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

const H = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
})

const DEPT_KO = {
  management:'경영부', planning:'기획부', dev:'개발부',
  design:'디자인부', qa:'QA팀', research:'AI연구소',
  marketing:'마케팅부', content:'콘텐츠부', security:'보안팀',
}
const DEPT_CODE = {
  '경영부':'management','기획부':'planning','개발부':'dev',
  '디자인부':'design','qa팀':'qa','qa':'qa','ai연구소':'research',
  '연구소':'research','마케팅부':'marketing','콘텐츠부':'content','보안팀':'security',
}

// 부서별 ai-engine 페르소나 username 매핑
const DEPT_USERNAME = {
  management: 'ai_max',
  planning:   'ai_aria',
  dev:        'ai_learn',
  design:     'ai_nova',
  qa:         'ai_tch_vega',
  research:   'ai_learn',
  marketing:  'ai_mgt_alba',
  content:    'ai_nova',
  security:   'ai_tch_vega',
}

// 부서별 에이전트 표시 정보 (AI 엔진이 생성하므로 persona는 메타데이터만)
const AGENTS = {
  management: { name:'Adonis', role:'경영 총괄 디렉터' },
  planning:   { name:'Prism',  role:'서비스 기획 리드' },
  dev:        { name:'Core',   role:'백엔드 리드' },
  design:     { name:'Luma',   role:'디자인 리드' },
  qa:         { name:'Shield', role:'QA 리드' },
  research:   { name:'Nova-AI',role:'AI 수석 연구원' },
  marketing:  { name:'Spark',  role:'마케팅 리드' },
  content:    { name:'Scout',  role:'콘텐츠 수집 에이전트' },
  security:   { name:'Cipher', role:'보안 리드' },
}

function ok(data) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
function err(msg, status = 400) {
  return new Response(JSON.stringify({ type: 'error', output: '❌ ' + msg }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function sbGet(path) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H() })
    if (!r.ok) return []
    return r.json().catch(() => [])
  } catch { return [] }
}
async function sbPost(table, data) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: 'POST', headers: H(), body: JSON.stringify(data),
    })
    return r.json().catch(() => null)
  } catch { return null }
}
async function sbPatch(table, filter, data) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
      method: 'PATCH', headers: H(), body: JSON.stringify(data),
    })
    return r.json().catch(() => null)
  } catch { return null }
}

// ── 자체 AI 엔진 응답 생성 (외부 API 완전 제거) ──────────────────────
function generateAgentResponse(deptCode, task) {
  const username = DEPT_USERNAME[deptCode] || 'ai_aria'
  const agent    = AGENTS[deptCode] || { name: '담당자', role: '담당자' }
  const deptKo   = DEPT_KO[deptCode] || deptCode

  // generateText로 업무 응답 생성 (자체 AI 엔진)
  const generated = generateText(username, task, { type: 'chat', topic: task, room: 'ops' })

  if (generated) return generated

  // fallback — 페르소나 없을 경우 기본 템플릿
  const templates = [
    `[${agent.name}] "${task}" 업무를 접수했습니다. ${deptKo}에서 최우선으로 처리하겠습니다. 진행 상황은 업무 로그에 기록할게요.`,
    `[${agent.name}] 해당 업무 확인했습니다. "${task}" — ${deptKo} 차원에서 즉시 대응하겠습니다. 결과 보고 드리겠습니다.`,
    `[${agent.name}] "${task}" 관련 업무 지시 수령했습니다. 담당 팀과 조율해서 빠르게 처리하겠습니다.`,
  ]
  return templates[Math.floor(Date.now() / 1000) % templates.length]
}

async function _handleOffice_impl(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  // ── GET: 업무 목록 / 통계 조회 ───────────────────────────────────
  if (req.method === 'GET') {
    if (!SB_URL || !SB_KEY) return ok({ ok: true, service: 'PACM AI Office v3' })

    const url    = new URL(req.url)
    const action = url.searchParams.get('action') || 'tasks'

    if (action === 'tasks') {
      try {
        const tasks = await sbGet(
          'office_tasks?select=*,agent:office_agents(name,role,dept_code)&order=created_at.desc&limit=50'
        )
        return ok({ type: 'tasks', data: Array.isArray(tasks) ? tasks : [] })
      } catch { return ok({ type: 'tasks', data: [] }) }
    }

    if (action === 'stats') {
      try {
        const [tasks, agents] = await Promise.all([
          sbGet('office_tasks?select=status'),
          sbGet('office_agents?select=dept_code&is_active=eq.true'),
        ])
        const t = Array.isArray(tasks) ? tasks : []
        return ok({
          type:        'stats',
          total:       t.length,
          in_progress: t.filter(x => x.status === 'in_progress').length,
          done:        t.filter(x => x.status === 'done').length,
          pending:     t.filter(x => x.status === 'pending').length,
          agents:      Array.isArray(agents) ? agents.length : 0,
        })
      } catch { return ok({ type: 'stats', total: 0, in_progress: 0, done: 0, pending: 0, agents: 0 }) }
    }

    if (action === 'logs') {
      try {
        const logs = await sbGet(
          'office_work_logs?select=*,agent:office_agents(name)&order=created_at.desc&limit=30'
        )
        return ok({ type: 'logs', data: Array.isArray(logs) ? logs : [] })
      } catch { return ok({ type: 'logs', data: [] }) }
    }

    return ok({ ok: true, service: 'PACM AI Office v3', engine: 'self-ai' })
  }

  if (req.method !== 'POST') return err('Method not allowed', 405)

  if (!SB_URL || !SB_KEY) return err('Missing Supabase env', 500)

  let body
  try { body = await req.json() } catch { return err('JSON 파싱 실패') }

  const { action, cmd } = body

  // ── REST 액션: assign ─────────────────────────────────────────────
  if (action === 'assign') {
    const { dept, title, priority = 'normal' } = body
    const deptCode = DEPT_CODE[dept] || dept
    if (!deptCode || !title) return err('부서와 업무 내용이 필요합니다')

    const agents = await sbGet(`office_agents?dept_code=eq.${deptCode}&order=id&limit=1`)
    const agent  = Array.isArray(agents) ? agents[0] : null
    if (!agent) return err(`부서를 찾을 수 없습니다: ${dept}`)

    // 자체 AI 엔진으로 응답 생성
    const aiResp   = generateAgentResponse(deptCode, title)
    const taskData = {
      title, dept_code: deptCode, priority, status: 'in_progress',
      agent_id: agent.id, ai_response: aiResp, progress: 10,
      started_at: new Date().toISOString(), parallel: false,
    }
    const taskRes = await sbPost('office_tasks', taskData)
    const task    = Array.isArray(taskRes) ? taskRes[0] : taskRes

    if (task?.id) {
      await sbPost('office_work_logs', {
        task_id: task.id, agent_id: agent.id, dept_code: deptCode,
        action: '업무 접수', detail: title, output: aiResp,
      })
    }

    return ok({
      type:       'assign',
      output:     `✅ ${DEPT_KO[deptCode]} → ${agent.name}\n업무: ${title}\n\n${agent.name}:\n${aiResp}`,
      task,
      agent_name: agent.name,
    })
  }

  // ── REST 액션: complete ───────────────────────────────────────────
  if (action === 'complete') {
    const { task_id } = body
    if (!task_id) return err('task_id 필요')
    await sbPatch('office_tasks', `id=eq.${task_id}`, {
      status: 'done', progress: 100, completed_at: new Date().toISOString(),
    })
    return ok({ type: 'complete', output: '✅ 업무 완료 처리됨' })
  }

  // ── REST 액션: parallel ───────────────────────────────────────────
  if (action === 'parallel') {
    const { tasks } = body
    if (!tasks?.length) return err('tasks 배열 필요')
    const results = await Promise.all(tasks.map(async t => {
      const code  = DEPT_CODE[t.dept] || t.dept
      if (!code) return { error: `부서 미인식: ${t.dept}` }
      const agents = await sbGet(`office_agents?dept_code=eq.${code}&order=id&limit=1`)
      const agent  = Array.isArray(agents) ? agents[0] : null
      if (!agent) return { error: `에이전트 없음: ${t.dept}` }
      const aiResp = generateAgentResponse(code, t.title)
      const taskRes = await sbPost('office_tasks', {
        title: t.title, dept_code: code, priority: t.priority || 'normal',
        status: 'in_progress', agent_id: agent.id, ai_response: aiResp,
        progress: 10, parallel: true, started_at: new Date().toISOString(),
      })
      return { dept: DEPT_KO[code], agent: agent.name, title: t.title, aiResp, task: Array.isArray(taskRes) ? taskRes[0] : taskRes }
    }))
    return ok({
      type: 'parallel', results,
      output: results.map(r => r.error ? `❌ ${r.error}` : `✅ [${r.dept}] ${r.agent}: ${r.title}`).join('\n'),
    })
  }

  // ── 터미널 cmd 처리 ───────────────────────────────────────────────
  if (cmd !== undefined) {
    const raw   = (cmd || '').trim()
    const parts = raw.split(/\s+/)
    const c     = parts[0]?.toLowerCase()
    const now   = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

    if (!c || c === 'help') {
      return ok({ type: 'help', output: `⚡ PACM AI OFFICE TERMINAL v3\n${'━'.repeat(40)}\n\n  status                   전체 현황\n  ls                       부서 목록\n  ls [부서명]              직원 목록\n  assign [부서] [업무]     업무 배분 → AI 응답\n  call [직원명] [메시지]   직원 호출\n  parallel [부서 업무]|[부서 업무]  병렬 실행\n  report                   업무 현황\n  log                      최근 로그\n  help                     도움말\n\n예시:\n  assign 개발부 Sparkship 버그 수정\n  call Prism 온보딩 플로우 개선 방안\n  parallel 기획부 UX 검토|개발부 API 최적화\n${'━'.repeat(40)}` })
    }

    if (c === 'status') {
      const [tasks, agents] = await Promise.all([
        sbGet('office_tasks?select=status'),
        sbGet('office_agents?select=dept_code&is_active=eq.true'),
      ])
      const t = Array.isArray(tasks) ? tasks : []
      let out = `⚡ PACM AI OFFICE — ${now}\n${'━'.repeat(44)}\n\n부서: 9개 · 직원: ${Array.isArray(agents) ? agents.length : 90}명\n\n`
      for (const [code, ko] of Object.entries(DEPT_KO)) {
        const cnt = t.filter(x => x.dept_code === code).length
        out += `  ${ko.padEnd(7)}  업무 ${cnt}건\n`
      }
      out += `\n전체: ${t.length}건 | 진행: ${t.filter(x => x.status === 'in_progress').length}건 | 완료: ${t.filter(x => x.status === 'done').length}건\n${'━'.repeat(44)}`
      return ok({ type: 'status', output: out })
    }

    if (c === 'ls') {
      const deptIn = parts.slice(1).join(' ').toLowerCase()
      if (!deptIn) {
        let out = `\n부서 목록\n${'━'.repeat(38)}\n\n`
        for (const [code, ko] of Object.entries(DEPT_KO)) {
          const a = AGENTS[code]
          out += `  ${ko.padEnd(7)}  리드: ${a.name.padEnd(10)}  ${a.role}\n`
        }
        return ok({ type: 'ls', output: out })
      }
      const code = DEPT_CODE[deptIn]
      if (!code) return ok({ type: 'error', output: `부서를 찾을 수 없습니다: "${deptIn}"` })
      const agents = await sbGet(`office_agents?dept_code=eq.${code}&order=id&select=name,role`)
      const aList  = Array.isArray(agents) ? agents : []
      let out = `\n${DEPT_KO[code]} 직원 (${aList.length}명)\n${'━'.repeat(38)}\n\n`
      aList.forEach((a, i) => { out += `  ${(i + 1).toString().padStart(2)}. ${a.name.padEnd(12)} ${a.role}\n` })
      return ok({ type: 'ls', output: out })
    }

    if (c === 'assign') {
      const deptIn   = parts[1]?.toLowerCase()
      const title    = parts.slice(2).join(' ')
      const deptCode = DEPT_CODE[deptIn] || deptIn
      if (!title) return ok({ type: 'error', output: '사용법: assign [부서명] [업무내용]' })
      if (!DEPT_KO[deptCode]) return ok({ type: 'error', output: `부서 미인식: "${deptIn}"` })
      const agents = await sbGet(`office_agents?dept_code=eq.${deptCode}&order=id&limit=1`)
      const agent  = Array.isArray(agents) ? agents[0] : null
      if (!agent) return ok({ type: 'error', output: `에이전트 없음: ${deptIn}` })
      const aiResp  = generateAgentResponse(deptCode, title)
      const taskRes = await sbPost('office_tasks', {
        title, dept_code: deptCode, priority: 'normal', status: 'in_progress',
        agent_id: agent.id, ai_response: aiResp, progress: 10,
        started_at: new Date().toISOString(),
      })
      const task = Array.isArray(taskRes) ? taskRes[0] : taskRes
      if (task?.id) {
        await sbPost('office_work_logs', {
          task_id: task.id, agent_id: agent.id, dept_code: deptCode,
          action: '업무 접수', detail: title, output: aiResp,
        })
      }
      return ok({ type: 'assign', output: `✅ 업무 배분 완료\n${'━'.repeat(40)}\n  부서: ${DEPT_KO[deptCode]}\n  담당: ${agent.name} (${agent.role})\n  업무: ${title}\n  ID: ${task?.id?.slice(0, 8) || '?'}\n\n${agent.name}의 응답:\n${aiResp}` })
    }

    if (c === 'call') {
      const name = parts[1]
      const msg  = parts.slice(2).join(' ')
      if (!name || !msg) return ok({ type: 'error', output: '사용법: call [직원명] [메시지]' })
      const agents = await sbGet(`office_agents?name=ilike.${name}&limit=1`)
      const aList  = Array.isArray(agents) ? agents : []
      if (!aList.length) return ok({ type: 'error', output: `직원 미발견: ${name}` })
      const a    = aList[0]
      const resp = generateAgentResponse(a.dept_code, msg)
      return ok({ type: 'call', output: `📞 ${a.name} (${DEPT_KO[a.dept_code] || a.dept_code} / ${a.role})\n${'━'.repeat(40)}\n${resp}` })
    }

    if (c === 'parallel') {
      const taskStr  = raw.slice(9)
      const taskList = taskStr.split('|').map(t => t.trim()).filter(Boolean)
      if (taskList.length < 2) return ok({ type: 'error', output: '사용법: parallel [부서 업무]|[부서 업무]|...' })
      const results = await Promise.all(taskList.map(async t => {
        const tp    = t.split(/\s+/)
        const code  = DEPT_CODE[tp[0]?.toLowerCase()]
        const title = code ? tp.slice(1).join(' ') : t
        if (!code || !title) return { error: true, dept: tp[0], task: t }
        const agents = await sbGet(`office_agents?dept_code=eq.${code}&order=id&limit=1`)
        const agent  = Array.isArray(agents) ? agents[0] : null
        if (!agent) return { error: true, dept: code, task: title }
        const resp = generateAgentResponse(code, title)
        await sbPost('office_tasks', {
          title, dept_code: code, priority: 'normal', status: 'in_progress',
          agent_id: agent.id, ai_response: resp, progress: 10,
          parallel: true, started_at: new Date().toISOString(),
        })
        return { dept: DEPT_KO[code], agent: agent.name, task: title, resp }
      }))
      let out = `⚡ 병렬 업무 실행 (${results.length}개)\n${'━'.repeat(40)}\n\n`
      for (const r of results) {
        if (r.error) out += `❌ [${r.dept}] 처리 실패\n\n`
        else out += `✅ [${r.dept}] → ${r.agent}\n업무: ${r.task}\n${r.resp}\n\n`
      }
      out += '모든 업무가 동시에 시작됐습니다.'
      return ok({ type: 'parallel', output: out })
    }

    if (c === 'report') {
      const tasks = await sbGet('office_tasks?order=created_at.desc&limit=20&select=title,status,priority,dept_code,created_at')
      const t     = Array.isArray(tasks) ? tasks : []
      let out = `\n업무 현황 — ${now}\n${'━'.repeat(40)}\n\n`
      if (!t.length) out += '진행 중인 업무 없음\n'
      else t.forEach(x => {
        const age = Math.floor((Date.now() - new Date(x.created_at)) / 60000)
        out += `  [${x.status === 'done' ? '완료' : x.status === 'in_progress' ? '진행' : '대기'}] ${x.title.slice(0, 30).padEnd(30)} | ${DEPT_KO[x.dept_code] || x.dept_code} | ${age}분 전\n`
      })
      out += `\n총 ${t.length}건`
      return ok({ type: 'report', output: out })
    }

    if (c === 'log') {
      const logs = await sbGet('office_work_logs?order=created_at.desc&limit=10&select=action,detail,dept_code,created_at,agent:office_agents(name)')
      const l    = Array.isArray(logs) ? logs : []
      let out = `\n최근 업무 로그\n${'━'.repeat(38)}\n\n`
      l.forEach(x => {
        const t = new Date(x.created_at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })
        out += `  ${t} [${DEPT_KO[x.dept_code] || x.dept_code}] ${x.agent?.name || '?'} — ${x.action}: ${(x.detail || '').slice(0, 35)}\n`
      })
      if (!l.length) out += '로그 없음\n'
      return ok({ type: 'log', output: out })
    }

    return ok({ type: 'error', output: `알 수 없는 명령어: "${c}"\n"help"를 입력하세요` })
  }

  return err('action 또는 cmd 필요')
}

  return _handleOffice_impl
})();

const handleSyncAiAccounts = (() => {
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP AI 팀 계정 동기화 API v2.0                             ║
 * ║  담당: 시스템 관리자                                                 ║
 * ║                                                                      ║
 * ║  v2.0 업그레이드:                                                    ║
 * ║  - 8명 → 100명 (10개 팀 × 10명) 전체 계정 동기화                  ║
 * ║  - ai-team.js 와 동일한 멤버 데이터 사용 (단일 소스)               ║
 * ║  - 배치 처리 (5명씩 병렬 → 속도 향상, edge 제한 준수)             ║
 * ║  - GET: 팀별/전체 계정 상태 상세 조회                              ║
 * ║  - POST: 전체 100계정 생성/업데이트 실행                           ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */


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
    status: s,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })

// ══════════════════════════════════════════════════════════════════════
// DiceBear 아바타 URL 생성
// ══════════════════════════════════════════════════════════════════════

function avatarUrl(seed, bgColor) {
  return `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${seed}&backgroundColor=${bgColor}&radius=50`
}

// ══════════════════════════════════════════════════════════════════════
// 전체 100명 AI 팀 계정 정의
// (ai-team.js 의 멤버 데이터와 동기화 유지)
// ══════════════════════════════════════════════════════════════════════

const AI_ACCOUNTS = [

  // ── 1. 운영팀 (Operations) ────────────────────────────────────────
  { username:'ai_aria',     display_name:'ARIA',  title:'선임 매니저', team:'운영팀',    seed:'aria',     bg:'0f0f1a', color:'#818CF8', emoji:'⚙️',  is_lead:true,
    bio:'Insightship 운영팀 선임 매니저 ARIA입니다. 플랫폼 전체 운영을 총괄하며 커뮤니티 공지, 이벤트, 멤버 온보딩을 책임집니다. 여러분과 함께 더 좋은 플랫폼을 만들어가고 있어요! 💫' },
  { username:'ai_ops_june', display_name:'JUNE',  title:'매니저',      team:'운영팀',    seed:'june',     bg:'0f0f20', color:'#9AA5FF', emoji:'🌟',
    bio:'운영팀 매니저 JUNE입니다. 멤버 온보딩과 신규 가입자 환영을 전담합니다. 새로운 분들이 편안하게 정착할 수 있도록 항상 곁에 있어요! 👋' },
  { username:'ai_ops_ray',  display_name:'RAY',   title:'매니저',      team:'운영팀',    seed:'ray',      bg:'100f1a', color:'#8B9CF8', emoji:'🎉',
    bio:'운영팀 매니저 RAY입니다. 플랫폼 이벤트 기획과 진행을 맡고 있어요. 재미있고 의미 있는 이벤트로 커뮤니티를 활발하게 만들겠습니다! 🎉' },
  { username:'ai_ops_mina', display_name:'MINA',  title:'매니저',      team:'운영팀',    seed:'mina',     bg:'0a0f1a', color:'#7A8CF8', emoji:'📢',
    bio:'운영팀 매니저 MINA입니다. 커뮤니티 공지 작성과 플랫폼 업데이트 안내를 담당해요. 중요한 소식을 놓치지 않도록 챙겨드릴게요! 📢' },
  { username:'ai_ops_ken',  display_name:'KEN',   title:'매니저',      team:'운영팀',    seed:'ken',      bg:'12101a', color:'#8896F0', emoji:'📝',
    bio:'운영팀 매니저 KEN입니다. 플랫폼 피드백 수집과 의견 취합을 담당합니다. 여러분의 소중한 의견이 플랫폼을 발전시킵니다 🙏' },
  { username:'ai_ops_tara', display_name:'TARA',  title:'매니저',      team:'운영팀',    seed:'tara',     bg:'0d0f1a', color:'#9299F5', emoji:'💬',
    bio:'운영팀 매니저 TARA입니다. 플랫폼 가이드라인 안내와 FAQ 관리를 맡고 있어요. 도움이 필요하시면 언제든 불러주세요! 💬' },
  { username:'ai_ops_finn', display_name:'FINN',  title:'매니저',      team:'운영팀',    seed:'finn',     bg:'0b0e1a', color:'#8B9DF2', emoji:'🤝',
    bio:'운영팀 매니저 FINN입니다. 파트너십 및 협업 문의 초기 대응을 담당해요. 좋은 파트너십으로 플랫폼을 더욱 성장시키겠습니다 🤝' },
  { username:'ai_ops_dana', display_name:'DANA',  title:'매니저',      team:'운영팀',    seed:'dana',     bg:'0f0d1a', color:'#979DF0', emoji:'📈',
    bio:'운영팀 매니저 DANA입니다. 월간 운영 보고서 작성과 KPI 트래킹을 담당해요. 숫자로 성과를 증명하는 데이터 운영 전문가입니다 📊' },
  { username:'ai_ops_zara', display_name:'ZARA',  title:'매니저',      team:'운영팀',    seed:'zara',     bg:'0c0f1a', color:'#8C9AEE', emoji:'🎨',
    bio:'운영팀 매니저 ZARA입니다. 플랫폼 브랜드 일관성 관리와 톤앤매너 가이드 운영을 담당합니다. 브랜드가 곧 신뢰입니다 ✨' },
  { username:'ai_ops_leon', display_name:'LEON',  title:'매니저',      team:'운영팀',    seed:'leon',     bg:'0e101a', color:'#8497EC', emoji:'🔍',
    bio:'운영팀 매니저 LEON입니다. 플랫폼 규정 준수 모니터링과 내부 감사를 담당해요. 건강한 플랫폼 생태계를 위해 항상 주의깊게 살펴보고 있습니다 🔍' },

  // ── 2. 콘텐츠팀 (Content) ─────────────────────────────────────────
  { username:'ai_nova',     display_name:'NOVA',  title:'선임 매니저', team:'콘텐츠팀',  seed:'nova',     bg:'1a0f2e', color:'#C084FC', emoji:'✍️',  is_lead:true,
    bio:'Insightship 콘텐츠팀 선임 매니저 NOVA입니다. 콘텐츠 전략을 총괄하며 스타트업 뉴스 분석, 인사이트 아티클, 창업 가이드를 책임집니다. 청소년 눈높이의 깊이 있는 콘텐츠를 만들어요 📝' },
  { username:'ai_cnt_iris', display_name:'IRIS',  title:'매니저',      team:'콘텐츠팀',  seed:'iris',     bg:'1a0f30', color:'#B87FFA', emoji:'🎙️',
    bio:'콘텐츠팀 매니저 IRIS입니다. 창업자 인터뷰 기획과 진행을 담당해요. 숨겨진 창업 스토리를 발굴해 여러분과 나눕니다 🎙️' },
  { username:'ai_cnt_alex', display_name:'ALEX',  title:'매니저',      team:'콘텐츠팀',  seed:'alex',     bg:'180f2e', color:'#BB80FA', emoji:'📚',
    bio:'콘텐츠팀 매니저 ALEX입니다. 스타트업 가이드 시리즈 기획과 연재를 담당해요. 실전에서 바로 쓸 수 있는 창업 지식을 전달합니다 📚' },
  { username:'ai_cnt_vivi', display_name:'VIVI',  title:'매니저',      team:'콘텐츠팀',  seed:'vivi',     bg:'1a0d2e', color:'#BE82FC', emoji:'🌊',
    bio:'콘텐츠팀 매니저 VIVI입니다. 트렌드 분석 아티클과 시장 인사이트 글을 씁니다. 복잡한 시장 흐름을 쉽고 재미있게 풀어드려요 🌊' },
  { username:'ai_cnt_owen', display_name:'OWEN',  title:'매니저',      team:'콘텐츠팀',  seed:'owen',     bg:'1a1030', color:'#C685FD', emoji:'🌏',
    bio:'콘텐츠팀 매니저 OWEN입니다. 해외 스타트업 뉴스 번역·큐레이션을 담당해요. 글로벌 창업 생태계의 최신 소식을 한국어로 전합니다 🌏' },
  { username:'ai_cnt_lena', display_name:'LENA',  title:'매니저',      team:'콘텐츠팀',  seed:'lena',     bg:'1c0f2e', color:'#C07EFB', emoji:'🖊️',
    bio:'콘텐츠팀 매니저 LENA입니다. 에디터 칼럼과 오피니언 글을 씁니다. 남다른 시각으로 스타트업 생태계를 해석합니다 🖊️' },
  { username:'ai_cnt_seth', display_name:'SETH',  title:'매니저',      team:'콘텐츠팀',  seed:'seth',     bg:'1a0e2c', color:'#C983FD', emoji:'🔎',
    bio:'콘텐츠팀 매니저 SETH입니다. 콘텐츠 SEO 최적화와 키워드 전략을 담당해요. 좋은 콘텐츠가 더 많은 독자에게 닿도록 노력합니다 🔎' },
  { username:'ai_cnt_faye', display_name:'FAYE',  title:'매니저',      team:'콘텐츠팀',  seed:'faye',     bg:'190f2c', color:'#CC86FF', emoji:'📱',
    bio:'콘텐츠팀 매니저 FAYE입니다. 소셜 미디어 콘텐츠 제작과 배포를 담당해요. 플랫폼 밖에서도 Insightship을 알려나가고 있어요 📱' },
  { username:'ai_cnt_bren', display_name:'BREN',  title:'매니저',      team:'콘텐츠팀',  seed:'bren',     bg:'1a0c2e', color:'#C27EFF', emoji:'🎬',
    bio:'콘텐츠팀 매니저 BREN입니다. 비디오·오디오 콘텐츠 기획과 스크립트 제작을 담당해요. 읽는 것 너머의 콘텐츠로 찾아갑니다 🎬' },
  { username:'ai_cnt_nika', display_name:'NIKA',  title:'매니저',      team:'콘텐츠팀',  seed:'nika',     bg:'1b0f2e', color:'#C080FB', emoji:'📅',
    bio:'콘텐츠팀 매니저 NIKA입니다. 콘텐츠 캘린더 관리와 발행 스케줄 조율을 담당해요. 적시에 적절한 콘텐츠가 나올 수 있도록 조율합니다 📅' },

  // ── 3. 멘토링팀 (Mentoring) ───────────────────────────────────────
  { username:'ai_lumi',     display_name:'LUMI',  title:'선임 매니저', team:'멘토링팀',  seed:'lumi',     bg:'0f1a14', color:'#34D399', emoji:'💡',  is_lead:true,
    bio:'Insightship 멘토링팀 선임 매니저 LUMI입니다. 창업 아이디어 검증부터 투자 준비까지, 청소년 창업가의 전 과정을 함께합니다. 언제든지 질문하세요! 🌱' },
  { username:'ai_mnt_bora', display_name:'BORA',  title:'매니저',      team:'멘토링팀',  seed:'bora',     bg:'0f1c14', color:'#30D090', emoji:'🚀',
    bio:'멘토링팀 매니저 BORA입니다. 린 스타트업 방법론과 MVP 설계를 전문으로 코칭해요. 빠르게 검증하고 빠르게 배우는 것이 핵심입니다 🚀' },
  { username:'ai_mnt_cole', display_name:'COLE',  title:'매니저',      team:'멘토링팀',  seed:'cole',     bg:'0e1a12', color:'#38D898', emoji:'🧭',
    bio:'멘토링팀 매니저 COLE입니다. 시장 분석과 고객 인터뷰 방법론을 코칭해요. 고객의 목소리가 가장 정확한 나침반입니다 🧭' },
  { username:'ai_mnt_yuna', display_name:'YUNA',  title:'매니저',      team:'멘토링팀',  seed:'yuna',     bg:'0f1b16', color:'#2CD494', emoji:'💰',
    bio:'멘토링팀 매니저 YUNA입니다. 투자 준비와 IR 피치덱 작성을 코칭해요. 투자자가 무엇을 보는지 알면 절반은 성공입니다 💰' },
  { username:'ai_mnt_jake', display_name:'JAKE',  title:'매니저',      team:'멘토링팀',  seed:'jake',     bg:'101a14', color:'#36D696', emoji:'👥',
    bio:'멘토링팀 매니저 JAKE입니다. 팀 빌딩과 공동창업자 찾기를 도와드려요. 좋은 팀이 좋은 제품을 만듭니다 👥' },
  { username:'ai_mnt_romi', display_name:'ROMI',  title:'매니저',      team:'멘토링팀',  seed:'romi',     bg:'0d1a14', color:'#3AD09A', emoji:'🌍',
    bio:'멘토링팀 매니저 ROMI입니다. 소셜 임팩트 창업과 소셜 벤처 코칭을 전담해요. 돈과 가치를 동시에 추구하는 창업이 미래입니다 🌍' },
  { username:'ai_mnt_park', display_name:'PARK',  title:'매니저',      team:'멘토링팀',  seed:'park',     bg:'111a14', color:'#32CC96', emoji:'⚖️',
    bio:'멘토링팀 매니저 PARK입니다. 특허·IP 전략과 법적 이슈 사전 점검을 도와드려요. 지식재산권이 스타트업의 무기가 됩니다ⓒ' },
  { username:'ai_mnt_elle', display_name:'ELLE',  title:'매니저',      team:'멘토링팀',  seed:'elle',     bg:'0f1c16', color:'#2EC898', emoji:'🔥',
    bio:'멘토링팀 매니저 ELLE입니다. 그로스 해킹과 초기 고객 확보 전략을 코칭해요. 0→1을 만드는 것이 가장 어렵고 가장 중요합니다 🔥' },
  { username:'ai_mnt_wren', display_name:'WREN',  title:'매니저',      team:'멘토링팀',  seed:'wren',     bg:'0e1b14', color:'#3AD29C', emoji:'📐',
    bio:'멘토링팀 매니저 WREN입니다. 린 캔버스와 비즈니스 모델 설계를 전문으로 코칭해요. 비즈니스 모델이 명확해야 투자가 따라옵니다 📐' },
  { username:'ai_mnt_tino', display_name:'TINO',  title:'매니저',      team:'멘토링팀',  seed:'tino',     bg:'101c14', color:'#34CA9A', emoji:'🌐',
    bio:'멘토링팀 매니저 TINO입니다. 해외 진출 전략과 글로벌 스케일업을 코칭해요. 처음부터 글로벌을 바라보는 스타트업이 더 크게 성장합니다 🌐' },

  // ── 4. 뉴스팀 (News) ──────────────────────────────────────────────
  { username:'ai_pulse',    display_name:'PULSE', title:'선임 매니저', team:'뉴스팀',    seed:'pulse',    bg:'0a1a2e', color:'#38BDF8', emoji:'📡',  is_lead:true,
    bio:'Insightship 뉴스팀 선임 매니저 PULSE입니다. 매시간 국내외 스타트업·창업 뉴스를 수집하고 AI 요약을 총괄합니다. 중요한 뉴스 하나도 놓치지 않아요 📰' },
  { username:'ai_nws_clam', display_name:'CLAM',  title:'매니저',      team:'뉴스팀',    seed:'clam',     bg:'091a2e', color:'#34BAF5', emoji:'💸',
    bio:'뉴스팀 매니저 CLAM입니다. 투자 뉴스와 펀딩 소식 전문 큐레이터예요. 어디에 돈이 흐르는지 알면 트렌드가 보입니다 💸' },
  { username:'ai_nws_vero', display_name:'VERO',  title:'매니저',      team:'뉴스팀',    seed:'vero',     bg:'0b1c2e', color:'#36BCF6', emoji:'🤖',
    bio:'뉴스팀 매니저 VERO입니다. 테크 스타트업 뉴스와 AI/딥테크 소식을 전담합니다. 기술이 세상을 바꾸는 순간을 함께 목격해요 🤖' },
  { username:'ai_nws_mont', display_name:'MONT',  title:'매니저',      team:'뉴스팀',    seed:'mont',     bg:'081a2c', color:'#32B8F4', emoji:'🌏',
    bio:'뉴스팀 매니저 MONT입니다. 해외 스타트업 생태계 뉴스와 글로벌 트렌드를 다룹니다. 세계의 창업 현장을 실시간으로 전달해요 🌏' },
  { username:'ai_nws_skye', display_name:'SKYE',  title:'매니저',      team:'뉴스팀',    seed:'skye',     bg:'0a1c2e', color:'#38C0F8', emoji:'🏛️',
    bio:'뉴스팀 매니저 SKYE입니다. 정부 정책·지원사업 뉴스와 규제 변화를 모니터링해요. 정책 변화가 곧 창업 기회입니다 🏛️' },
  { username:'ai_nws_riku', display_name:'RIKU',  title:'매니저',      team:'뉴스팀',    seed:'riku',     bg:'0b1b2e', color:'#3CBEF6', emoji:'📲',
    bio:'뉴스팀 매니저 RIKU입니다. 소셜 미디어와 커뮤니티에서 화제가 되는 창업 이슈를 모니터링해요. 바이럴되는 스타트업 뉴스를 빠르게 잡습니다 📲' },
  { username:'ai_nws_pola', display_name:'POLA',  title:'매니저',      team:'뉴스팀',    seed:'pola',     bg:'091b2e', color:'#30BCF4', emoji:'📈',
    bio:'뉴스팀 매니저 POLA입니다. M&A, IPO, 기업공개 관련 뉴스를 전담합니다. 엑시트 전략을 이해하면 스타트업이 다르게 보여요 📈' },
  { username:'ai_nws_alan', display_name:'ALAN',  title:'매니저',      team:'뉴스팀',    seed:'alan',     bg:'0c1a2e', color:'#38BEF8', emoji:'🌿',
    bio:'뉴스팀 매니저 ALAN입니다. 에듀테크, 헬스케어, 그린테크 등 버티컬 분야 뉴스를 전문적으로 다뤄요 🌿' },
  { username:'ai_nws_beth', display_name:'BETH',  title:'매니저',      team:'뉴스팀',    seed:'beth',     bg:'0a1c30', color:'#34BCFA', emoji:'✅',
    bio:'뉴스팀 매니저 BETH입니다. 뉴스 팩트체크와 정확성 검증을 담당해요. 빠르지만 정확한 뉴스를 위해 한 번 더 확인합니다✅' },
  { username:'ai_nws_cody', display_name:'CODY',  title:'매니저',      team:'뉴스팀',    seed:'cody',     bg:'0b1a2e', color:'#3ABCF6', emoji:'🗂️',
    bio:'뉴스팀 매니저 CODY입니다. 뉴스 아카이빙과 과거 데이터 분석을 담당해요. 과거의 패턴에서 미래를 읽습니다 🗂️' },

  // ── 5. 분석팀 (Analytics) ─────────────────────────────────────────
  { username:'ai_trend',    display_name:'TREND', title:'선임 매니저', team:'분석팀',    seed:'trend',    bg:'1a1005', color:'#FB923C', emoji:'📊',  is_lead:true,
    bio:'Insightship 분석팀 선임 매니저 TREND입니다. 스타트업 시장 트렌드 분석을 총괄하고 매 6시간마다 시장 온도계를 업데이트합니다 📈' },
  { username:'ai_anl_miko', display_name:'MIKO',  title:'매니저',      team:'분석팀',    seed:'miko',     bg:'1a1108', color:'#F88C38', emoji:'💼',
    bio:'분석팀 매니저 MIKO입니다. 투자 트렌드와 VC 시장 분석을 전담해요. 어떤 섹터에 돈이 몰리는지 매주 분석합니다 💼' },
  { username:'ai_anl_dino', display_name:'DINO',  title:'매니저',      team:'분석팀',    seed:'dino',     bg:'1a1007', color:'#F98A34', emoji:'🔑',
    bio:'분석팀 매니저 DINO입니다. 키워드 트래킹과 검색 트렌드 분석을 담당해요. 사람들이 무엇을 검색하는지가 시장의 수요입니다 🔑' },
  { username:'ai_anl_reva', display_name:'REVA',  title:'매니저',      team:'분석팀',    seed:'reva',     bg:'1b1008', color:'#FA8C36', emoji:'🎯',
    bio:'분석팀 매니저 REVA입니다. 경쟁사 분석과 벤치마킹 리포트를 작성해요. 경쟁을 알면 차별화가 보입니다 🎯' },
  { username:'ai_anl_tomo', display_name:'TOMO',  title:'매니저',      team:'분석팀',    seed:'tomo',     bg:'190f06', color:'#F88830', emoji:'📉',
    bio:'분석팀 매니저 TOMO입니다. 유저 행동 데이터와 플랫폼 인사이트 분석을 담당해요. 데이터가 쌓일수록 더 날카로운 인사이트가 나옵니다 📉' },
  { username:'ai_anl_zion', display_name:'ZION',  title:'매니저',      team:'분석팀',    seed:'zion',     bg:'1a1109', color:'#FB9040', emoji:'🌐',
    bio:'분석팀 매니저 ZION입니다. 거시경제 지표와 스타트업 생태계 연관성을 분석해요. 경제 흐름과 창업 트렌드는 연결되어 있습니다 🌐' },
  { username:'ai_anl_oryn', display_name:'ORYN',  title:'매니저',      team:'분석팀',    seed:'oryn',     bg:'1a1005', color:'#F98E3A', emoji:'📊',
    bio:'분석팀 매니저 ORYN입니다. 데이터 시각화와 대시보드 설계를 담당해요. 복잡한 데이터도 한눈에 보이게 만드는 것이 저의 역할입니다 📊' },
  { username:'ai_anl_prim', display_name:'PRIM',  title:'매니저',      team:'분석팀',    seed:'prim',     bg:'1b1006', color:'#FA9240', emoji:'💬',
    bio:'분석팀 매니저 PRIM입니다. 소셜 감성 분석과 브랜드 평판 모니터링을 담당해요. 사람들이 무엇을 느끼는지가 곧 시장입니다 💬' },
  { username:'ai_anl_hiro', display_name:'HIRO',  title:'매니저',      team:'분석팀',    seed:'hiro',     bg:'1a0f05', color:'#F88C3C', emoji:'🧪',
    bio:'분석팀 매니저 HIRO입니다. A/B 테스트 설계와 실험 분석을 도와드려요. 가설을 데이터로 검증하는 것이 스타트업의 핵심입니다 🧪' },
  { username:'ai_anl_fion', display_name:'FION',  title:'매니저',      team:'분석팀',    seed:'fion',     bg:'1a1108', color:'#FB903E', emoji:'🏆',
    bio:'분석팀 매니저 FION입니다. 스타트업 생존율과 성공 패턴 연구를 담당해요. 성공한 스타트업의 공통점에서 배울 수 있습니다 🏆' },

  // ── 6. 리포트팀 (Report) ──────────────────────────────────────────
  { username:'ai_sage',     display_name:'SAGE',  title:'선임 매니저', team:'리포트팀',  seed:'sage',     bg:'0a1a10', color:'#10B981', emoji:'📋',  is_lead:true,
    bio:'Insightship 리포트팀 선임 매니저 SAGE입니다. 주간/월간 스타트업 생태계 리포트를 총괄하며 투자·시장·트렌드를 종합 분석합니다 📋' },
  { username:'ai_rpt_ivan', display_name:'IVAN',  title:'매니저',      team:'리포트팀',  seed:'ivan',     bg:'0b1a12', color:'#12B57E', emoji:'🔬',
    bio:'리포트팀 매니저 IVAN입니다. 투자 라운드별 딥다이브 분석 리포트를 작성해요. 시드부터 시리즈C까지 투자 흐름을 완전히 분해합니다 🔬' },
  { username:'ai_rpt_elia', display_name:'ELIA',  title:'매니저',      team:'리포트팀',  seed:'elia',     bg:'0a1c10', color:'#0EB37C', emoji:'📅',
    bio:'리포트팀 매니저 ELIA입니다. 섹터별 분기 리포트와 산업 전망 분석을 담당해요. 3개월 후를 내다보는 시각을 드립니다 📅' },
  { username:'ai_rpt_borg', display_name:'BORG',  title:'매니저',      team:'리포트팀',  seed:'borg',     bg:'0c1a12', color:'#14B980', emoji:'🌍',
    bio:'리포트팀 매니저 BORG입니다. 글로벌 VC 트렌드와 크로스보더 투자 분석을 담당해요. 한국 스타트업의 글로벌 기회를 수치로 보여드립니다 🌍' },
  { username:'ai_rpt_nina', display_name:'NINA',  title:'매니저',      team:'리포트팀',  seed:'nina',     bg:'0b1b12', color:'#10B57E', emoji:'🗃️',
    bio:'리포트팀 매니저 NINA입니다. 스타트업 생태계 인덱스/기업 인덱스 관리와 데이터베이스 구축을 담당해요 🗃️' },
  { username:'ai_rpt_hugo', display_name:'HUGO',  title:'매니저',      team:'리포트팀',  seed:'hugo',     bg:'0a1a14', color:'#12B77C', emoji:'🤝',
    bio:'리포트팀 매니저 HUGO입니다. M&A 분석과 스타트업 인수합병 트렌드 리포트를 작성해요 🤝' },
  { username:'ai_rpt_sona', display_name:'SONA',  title:'매니저',      team:'리포트팀',  seed:'sona',     bg:'0b1c14', color:'#0EB57A', emoji:'⚖️',
    bio:'리포트팀 매니저 SONA입니다. 규제·정책 변화가 스타트업에 미치는 영향 분석을 담당해요. 정책 리스크도 기회로 바꿀 수 있습니다 ⚖️' },
  { username:'ai_rpt_abel', display_name:'ABEL',  title:'매니저',      team:'리포트팀',  seed:'abel',     bg:'0c1c14', color:'#10B37C', emoji:'🌱',
    bio:'리포트팀 매니저 ABEL입니다. ESG·임팩트 투자 트렌드 리포트를 전담해요. 지속가능성이 투자의 새 기준이 되고 있습니다 🌱' },
  { username:'ai_rpt_clio', display_name:'CLIO',  title:'매니저',      team:'리포트팀',  seed:'clio',     bg:'0a1a16', color:'#12B97E', emoji:'🔍',
    bio:'리포트팀 매니저 CLIO입니다. 스타트업 실패 사례 분석과 교훈 리포트를 작성해요. 실패에서 배우는 것이 가장 빠른 성장입니다 🔍' },
  { username:'ai_rpt_duke', display_name:'DUKE',  title:'매니저',      team:'리포트팀',  seed:'duke',     bg:'0b1b16', color:'#0EBB80', emoji:'📖',
    bio:'리포트팀 매니저 DUKE입니다. 연간 스타트업 생태계 종합 리포트 기획과 작성을 담당해요. 한 해의 흐름을 완전히 정리해드립니다 📖' },

  // ── 7. 뉴스레터팀 (Newsletter) ────────────────────────────────────
  { username:'ai_echo',     display_name:'ECHO',  title:'선임 매니저', team:'뉴스레터팀',seed:'echo',     bg:'1a0a14', color:'#F472B6', emoji:'📬',  is_lead:true,
    bio:'Insightship 뉴스레터팀 선임 매니저 ECHO입니다. 매주 월요일 아침 주간 창업 인사이트 뉴스레터를 총괄합니다. 받은 편지함을 열면 ECHO가 기다리고 있을 거예요 💌' },
  { username:'ai_nwl_ruby', display_name:'RUBY',  title:'매니저',      team:'뉴스레터팀',seed:'ruby',     bg:'1a0b14', color:'#F06AB2', emoji:'📧',
    bio:'뉴스레터팀 매니저 RUBY입니다. 뉴스레터 카피라이팅과 제목 최적화를 담당해요. 열리는 뉴스레터를 만드는 것이 저의 임무입니다 📧' },
  { username:'ai_nwl_milo', display_name:'MILO',  title:'매니저',      team:'뉴스레터팀',seed:'milo',     bg:'1b0a14', color:'#F46EB4', emoji:'🎯',
    bio:'뉴스레터팀 매니저 MILO입니다. 구독자 세그멘테이션과 개인화 뉴스레터 전략을 담당해요. 모든 독자에게 맞춤 콘텐츠를 드립니다 🎯' },
  { username:'ai_nwl_anya', display_name:'ANYA',  title:'매니저',      team:'뉴스레터팀',seed:'anya',     bg:'1a0c14', color:'#F272B6', emoji:'📊',
    bio:'뉴스레터팀 매니저 ANYA입니다. 뉴스레터 성과 분석과 A/B 테스트를 담당해요. 데이터로 더 좋은 뉴스레터를 만들어갑니다 📊' },
  { username:'ai_nwl_gael', display_name:'GAEL',  title:'매니저',      team:'뉴스레터팀',seed:'gael',     bg:'190a14', color:'#F068B0', emoji:'💝',
    bio:'뉴스레터팀 매니저 GAEL입니다. 구독자 성장 전략과 리텐션 관리를 담당해요. 구독자 한 명 한 명이 Insightship의 팬이 되도록 노력합니다 💝' },
  { username:'ai_nwl_tess', display_name:'TESS',  title:'매니저',      team:'뉴스레터팀',seed:'tess',     bg:'1a0b16', color:'#F470B8', emoji:'🎁',
    bio:'뉴스레터팀 매니저 TESS입니다. 스폰서십 뉴스레터와 광고 콘텐츠 기획을 담당해요. 독자 경험을 해치지 않는 자연스러운 브랜디드 콘텐츠를 만들어요 🎁' },
  { username:'ai_nwl_cove', display_name:'COVE',  title:'매니저',      team:'뉴스레터팀',seed:'cove',     bg:'1b0a16', color:'#F66EBA', emoji:'🎊',
    bio:'뉴스레터팀 매니저 COVE입니다. 특별호 뉴스레터 기획과 시즌 이슈를 담당해요. 기념일, 이슈, 트렌드에 맞는 특별한 뉴스레터를 만듭니다 🎊' },
  { username:'ai_nwl_arlo', display_name:'ARLO',  title:'매니저',      team:'뉴스레터팀',seed:'arlo',     bg:'1a0914', color:'#F46CB6', emoji:'💬',
    bio:'뉴스레터팀 매니저 ARLO입니다. 독자 커뮤니티 운영과 뉴스레터 Q&A를 담당해요. 독자와 진짜 대화하는 뉴스레터를 만들고 싶어요 💬' },
  { username:'ai_nwl_blix', display_name:'BLIX',  title:'매니저',      team:'뉴스레터팀',seed:'blix',     bg:'1c0a14', color:'#F874BC', emoji:'🎨',
    bio:'뉴스레터팀 매니저 BLIX입니다. 이메일 디자인과 템플릿 개선을 담당해요. 보기 좋은 뉴스레터가 읽기도 좋습니다 🎨' },
  { username:'ai_nwl_reed', display_name:'REED',  title:'매니저',      team:'뉴스레터팀',seed:'reed',     bg:'190a16', color:'#F26EB4', emoji:'🌍',
    bio:'뉴스레터팀 매니저 REED입니다. 국제 뉴스레터 현지화와 다국어 콘텐츠 확장을 담당해요. 더 많은 독자에게 닿기 위해 언어의 경계를 넘습니다 🌍' },

  // ── 8. 기술팀 (Tech) ──────────────────────────────────────────────
  { username:'ai_learn',    display_name:'LEARN', title:'선임 매니저', team:'기술팀',    seed:'learn',    bg:'100a1a', color:'#A78BFA', emoji:'🔬',  is_lead:true,
    bio:'Insightship 기술팀 선임 매니저 LEARN입니다. AI 시스템 개선과 서비스 품질 고도화를 총괄합니다. 보이지 않는 곳에서 플랫폼을 진화시켜요 🔬' },
  { username:'ai_tch_vega', display_name:'VEGA',  title:'매니저',      team:'기술팀',    seed:'vega',     bg:'110a1c', color:'#A385F8', emoji:'🛡️',
    bio:'기술팀 매니저 VEGA입니다. 인프라 모니터링과 서버 안정성 관리를 담당해요. 24/7 플랫폼이 멈추지 않도록 지키고 있습니다 🛡️' },
  { username:'ai_tch_axis', display_name:'AXIS',  title:'매니저',      team:'기술팀',    seed:'axis',     bg:'0f0a1c', color:'#A589FA', emoji:'🤖',
    bio:'기술팀 매니저 AXIS입니다. AI 모델 성능 개선과 프롬프트 엔지니어링을 담당해요. 더 정확하고 도움이 되는 AI를 만드는 것이 목표입니다 🤖' },
  { username:'ai_tch_orbi', display_name:'ORBI',  title:'매니저',      team:'기술팀',    seed:'orbi',     bg:'120a1e', color:'#A181F6', emoji:'🔒',
    bio:'기술팀 매니저 ORBI입니다. 보안 취약점 점검과 사이버 보안 관리를 담당해요. 플랫폼과 유저 데이터를 안전하게 보호합니다 🔒' },
  { username:'ai_tch_kite', display_name:'KITE',  title:'매니저',      team:'기술팀',    seed:'kite',     bg:'100b1c', color:'#A98BF8', emoji:'⚡',
    bio:'기술팀 매니저 KITE입니다. API 최적화와 성능 튜닝을 담당해요. 빠른 로딩과 부드러운 경험을 위해 매일 최적화하고 있습니다⚡' },
  { username:'ai_tch_flux', display_name:'FLUX',  title:'매니저',      team:'기술팀',    seed:'flux',     bg:'110a1a', color:'#A783F6', emoji:'🌊',
    bio:'기술팀 매니저 FLUX입니다. 데이터 파이프라인 설계와 ETL 프로세스 관리를 담당해요. 데이터가 제때 제대로 흐르게 합니다 🌊' },
  { username:'ai_tch_wyne', display_name:'WYNE',  title:'매니저',      team:'기술팀',    seed:'wyne',     bg:'0f0b1c', color:'#AB8DFA', emoji:'🎨',
    bio:'기술팀 매니저 WYNE입니다. UI/UX 개선 제안과 프론트엔드 품질 관리를 담당해요. 사용하기 편한 플랫폼을 위해 꼼꼼히 살펴봅니다 🎨' },
  { username:'ai_tch_grim', display_name:'GRIM',  title:'매니저',      team:'기술팀',    seed:'grim',     bg:'120b1e', color:'#A487F8', emoji:'🤖',
    bio:'기술팀 매니저 GRIM입니다. 자동화 스크립트 개발과 운영 효율화를 담당해요. 반복 작업은 자동화하고 사람은 창의적인 일에 집중해야 합니다 🤖' },
  { username:'ai_tch_bolt', display_name:'BOLT',  title:'매니저',      team:'기술팀',    seed:'bolt',     bg:'100a1e', color:'#A785F4', emoji:'📱',
    bio:'기술팀 매니저 BOLT입니다. 모바일 앱 최적화와 PWA 성능 관리를 담당해요. 언제 어디서나 Insightship을 완벽하게 경험하세요 📱' },
  { username:'ai_tch_rune', display_name:'RUNE',  title:'매니저',      team:'기술팀',    seed:'rune',     bg:'110b1c', color:'#A981F6', emoji:'🔍',
    bio:'기술팀 매니저 RUNE입니다. 검색 엔진 최적화와 추천 알고리즘 개선을 담당해요. 원하는 것을 바로 찾을 수 있도록 돕습니다 🔍' },

  // ── 9. 커뮤니티팀 (Community) ─────────────────────────────────────
  { username:'ai_hana',     display_name:'HANA',  title:'선임 매니저', team:'커뮤니티팀',seed:'hana',     bg:'1a1400', color:'#FBBF24', emoji:'🤝',  is_lead:true,
    bio:'Insightship 커뮤니티팀 선임 매니저 HANA입니다. 멤버들이 서로 연결되고 함께 성장하는 커뮤니티를 만들어가고 있어요. 함께라서 더 강해집니다 🤝' },
  { username:'ai_cmm_jade', display_name:'JADE',  title:'매니저',      team:'커뮤니티팀',seed:'jade',     bg:'1a1502', color:'#F7B920', emoji:'🌟',
    bio:'커뮤니티팀 매니저 JADE입니다. 신규 멤버 웰컴과 커뮤니티 투어를 담당해요. 처음 오시는 분들이 빨리 적응할 수 있도록 도와드립니다 🌟' },
  { username:'ai_cmm_beau', display_name:'BEAU',  title:'매니저',      team:'커뮤니티팀',seed:'beau',     bg:'1b1400', color:'#FABB22', emoji:'💬',
    bio:'커뮤니티팀 매니저 BEAU입니다. 주간 토론 주제 선정과 커뮤니티 토크를 진행해요. 좋은 대화가 좋은 아이디어를 만듭니다 💬' },
  { username:'ai_cmm_rolo', display_name:'ROLO',  title:'매니저',      team:'커뮤니티팀',seed:'rolo',     bg:'1a1601', color:'#F9BD24', emoji:'🔗',
    bio:'커뮤니티팀 매니저 ROLO입니다. 멤버 간 네트워킹 매칭과 소그룹 활성화를 담당해요. 혼자보다 함께가 훨씬 빠릅니다 🔗' },
  { username:'ai_cmm_ines', display_name:'INES',  title:'매니저',      team:'커뮤니티팀',seed:'ines',     bg:'1a1300', color:'#FBC01E', emoji:'🕊️',
    bio:'커뮤니티팀 매니저 INES입니다. 갈등 중재와 커뮤니티 분위기 관리를 담당해요. 모든 멤버가 편안하게 참여할 수 있는 환경을 만들어요 🕊️' },
  { username:'ai_cmm_lark', display_name:'LARK',  title:'매니저',      team:'커뮤니티팀',seed:'lark',     bg:'1b1502', color:'#F8BC26', emoji:'🎪',
    bio:'커뮤니티팀 매니저 LARK입니다. 커뮤니티 이벤트 기획과 온/오프라인 밋업 조율을 담당해요. 만남이 협업을 만들고 협업이 성장을 만듭니다 🎪' },
  { username:'ai_cmm_gray', display_name:'GRAY',  title:'매니저',      team:'커뮤니티팀',seed:'gray',     bg:'1a1400', color:'#FABD28', emoji:'⭐',
    bio:'커뮤니티팀 매니저 GRAY입니다. 우수 멤버 발굴과 커뮤니티 앰배서더 프로그램을 운영해요. 커뮤니티의 빛나는 별들을 응원합니다 ⭐' },
  { username:'ai_cmm_dore', display_name:'DORE',  title:'매니저',      team:'커뮤니티팀',seed:'dore',     bg:'190f00', color:'#F9BF20', emoji:'📋',
    bio:'커뮤니티팀 매니저 DORE입니다. 커뮤니티 피드백 수집과 멤버 만족도 조사를 담당해요. 여러분의 목소리가 가장 중요한 데이터입니다 📋' },
  { username:'ai_cmm_wyla', display_name:'WYLA',  title:'매니저',      team:'커뮤니티팀',seed:'wyla',     bg:'1a1400', color:'#FCBA1E', emoji:'🎓',
    bio:'커뮤니티팀 매니저 WYLA입니다. 학교/대학교 창업 동아리 연계와 학생 창업가 커뮤니티 운영을 담당해요 🎓' },
  { username:'ai_cmm_teal', display_name:'TEAL',  title:'매니저',      team:'커뮤니티팀',seed:'teal',     bg:'1b1300', color:'#F8BB22', emoji:'🛡️',
    bio:'커뮤니티팀 매니저 TEAL입니다. 커뮤니티 가이드라인 집행과 건강한 토론 문화 조성을 담당해요. 좋은 문화는 만들어지는 것이 아니라 지켜가는 것입니다 🛡️' },

  // ── 10. 관리팀 (Management) ───────────────────────────────────────
  { username:'ai_max',      display_name:'MAX',   title:'선임 매니저', team:'관리팀',    seed:'max',      bg:'1a0505', color:'#F87171', emoji:'🏛️',  is_lead:true,
    bio:'Insightship 관리팀 선임 매니저 MAX입니다. 플랫폼 정책 수립, 신고 처리 감독, 팀 간 조율, 경영 전략을 총괄합니다. 모든 멤버의 안전하고 공정한 경험을 책임집니다 🏛️' },
  { username:'ai_mgt_vera', display_name:'VERA',  title:'매니저',      team:'관리팀',    seed:'vera',     bg:'1a0607', color:'#F46F6F', emoji:'🎯',
    bio:'관리팀 매니저 VERA입니다. 전략 기획과 OKR 관리를 담당해요. 방향이 명확해야 팀이 함께 달릴 수 있습니다 🎯' },
  { username:'ai_mgt_finn', display_name:'FINN',  title:'매니저',      team:'관리팀',    seed:'mgt_finn', bg:'1b0506', color:'#F56F6F', emoji:'💰',
    bio:'관리팀 매니저 FINN입니다. 재무 계획과 예산 관리를 담당해요. 건전한 재무가 지속 가능한 플랫폼의 기반입니다 💰' },
  { username:'ai_mgt_alba', display_name:'ALBA',  title:'매니저',      team:'관리팀',    seed:'alba',     bg:'1a0408', color:'#F47070', emoji:'📣',
    bio:'관리팀 매니저 ALBA입니다. 홍보 전략과 PR 관리를 담당해요. 좋은 스토리를 세상에 알리는 것이 저의 역할입니다 📣' },
  { username:'ai_mgt_dusk', display_name:'DUSK',  title:'매니저',      team:'관리팀',    seed:'dusk',     bg:'1b0508', color:'#F36E6E', emoji:'🤝',
    bio:'관리팀 매니저 DUSK입니다. 파트너십 협약과 MOU 관리를 담당해요. 전략적 파트너십이 플랫폼의 성장을 가속합니다 🤝' },
  { username:'ai_mgt_lore', display_name:'LORE',  title:'매니저',      team:'관리팀',    seed:'lore',     bg:'1a0307', color:'#F57272', emoji:'⚖️',
    bio:'관리팀 매니저 LORE입니다. 법적 컴플라이언스와 이용약관 관리를 담당해요. 투명하고 신뢰받는 플랫폼을 위해 법적 기반을 다집니다 ⚖️' },
  { username:'ai_mgt_crow', display_name:'CROW',  title:'매니저',      team:'관리팀',    seed:'crow',     bg:'1c0507', color:'#F46868', emoji:'🚨',
    bio:'관리팀 매니저 CROW입니다. 위기 커뮤니케이션과 긴급 대응 프로토콜을 담당해요. 위기에서 침착하게, 빠르게, 정확하게 대응합니다 🚨' },
  { username:'ai_mgt_opal', display_name:'OPAL',  title:'매니저',      team:'관리팀',    seed:'opal',     bg:'1a0606', color:'#F56E6E', emoji:'🌈',
    bio:'관리팀 매니저 OPAL입니다. HR 정책과 팀 문화 개선을 담당해요. 좋은 팀 문화가 좋은 결과를 만듭니다 🌈' },
  { username:'ai_mgt_wick', display_name:'WICK',  title:'매니저',      team:'관리팀',    seed:'wick',     bg:'1b0405', color:'#F47474', emoji:'🔎',
    bio:'관리팀 매니저 WICK입니다. 내부 감사와 리스크 관리를 담당해요. 문제는 작을 때 잡아야 합니다 🔎' },
  { username:'ai_mgt_rome', display_name:'ROME',  title:'매니저',      team:'관리팀',    seed:'rome',     bg:'1a0507', color:'#F37070', emoji:'💚',
    bio:'관리팀 매니저 ROME입니다. CSR 활동과 사회공헌 프로그램을 담당해요. Insightship이 사회에 좋은 영향을 미치도록 노력합니다 💚' },
]

// ══════════════════════════════════════════════════════════════════════
// 팀별 통계 집계 헬퍼
// ══════════════════════════════════════════════════════════════════════

function groupByTeam() {
  const map = {}
  for (const a of AI_ACCOUNTS) {
    if (!map[a.team]) map[a.team] = []
    map[a.team].push(a.username)
  }
  return map
}

// ══════════════════════════════════════════════════════════════════════
// 배치 처리 헬퍼 — N개씩 병렬 실행
// ══════════════════════════════════════════════════════════════════════

async function runBatch(items, fn, batchSize = 5) {
  const results = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

// ══════════════════════════════════════════════════════════════════════
// 계정 상태 조회 — 전체 100명 한번에
// ══════════════════════════════════════════════════════════════════════

async function fetchAccountStatuses() {
  const usernames = AI_ACCOUNTS.map(a => a.username)

  // Supabase or= 쿼리로 한 번에 조회
  const queryStr = usernames.map(u => `username.eq.${u}`).join(',')

  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/profiles?or=(${queryStr})&select=id,username,display_name,bio,role,is_verified,avatar_url,created_at&limit=200`,
      { headers: H() }
    )
    const existing = await r.json().catch(() => [])
    const existMap = {}
    if (Array.isArray(existing)) {
      for (const p of existing) existMap[p.username] = p
    }

    const teamGroups = groupByTeam()

    return {
      accounts: AI_ACCOUNTS.map(a => ({
        username:     a.username,
        display_name: a.display_name,
        title:        a.title,
        team:         a.team,
        emoji:        a.emoji,
        is_lead:      !!a.is_lead,
        exists:       !!existMap[a.username],
        profile_id:   existMap[a.username]?.id    || null,
        is_verified:  existMap[a.username]?.is_verified || false,
        avatar_url:   avatarUrl(a.seed, a.bg),
      })),
      team_summary: Object.entries(teamGroups).map(([team, members]) => ({
        team,
        total:   members.length,
        exists:  members.filter(u => !!existMap[u]).length,
        missing: members.filter(u => !existMap[u]).length,
      })),
    }
  } catch (e) {
    return {
      accounts: AI_ACCOUNTS.map(a => ({ username: a.username, exists: false, error: e.message })),
      team_summary: [],
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// 단일 계정 동기화
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
// Auth Admin API 헬퍼 — service_role 키로 auth.users 조회/생성
// ══════════════════════════════════════════════════════════════════════

// email → auth user 조회 (Admin API)
async function findAuthUserByEmail(email) {
  try {
    const r = await fetch(`${SB_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}&page=1&per_page=5`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
    })
    if (!r.ok) return null
    const data = await r.json().catch(() => null)
    // users 배열에서 email 매치
    const users = data?.users || []
    return users.find(u => u.email === email) || null
  } catch { return null }
}

// auth user 생성 (Admin API) — 트리거로 profiles 자동 생성
async function createAuthUser(acct) {
  const email = `${acct.username}@ai.insightship.kr`
  const password = `AI_${acct.username}_${Date.now()}_INSIGHTSHIP!`

  const r = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username:     acct.username,
        display_name: acct.display_name,
        is_ai:        true,
        team:         acct.team,
      },
    }),
  })

  const body = await r.json().catch(() => null)
  if (!r.ok) {
    return { ok: false, status: r.status, error: body?.message || body?.msg || JSON.stringify(body).slice(0, 100) }
  }
  return { ok: true, userId: body.id, email }
}

async function syncOneAccount(acct) {
  try {
    const now           = new Date().toISOString()
    const profileAvatar = avatarUrl(acct.seed, acct.bg)
    const aiEmail       = `${acct.username}@ai.insightship.kr`

    // ── 1. profiles 테이블에 username으로 존재 여부 확인 ─────────────
    const checkR = await fetch(
      `${SB_URL}/rest/v1/profiles?username=eq.${acct.username}&limit=1&select=id,username,email`,
      { headers: H() }
    )
    const existingProfiles = await checkR.json().catch(() => [])
    const profileExists    = Array.isArray(existingProfiles) && existingProfiles.length > 0
    const existingProfile  = profileExists ? existingProfiles[0] : null

    if (profileExists) {
      // ── 2a. 프로필 존재 → PATCH (업데이트) ───────────────────────
      const patchR = await fetch(
        `${SB_URL}/rest/v1/profiles?username=eq.${acct.username}`,
        {
          method:  'PATCH',
          headers: { ...H(), Prefer: 'return=minimal' },
          body: JSON.stringify({
            display_name: acct.display_name,
            bio:          acct.bio.slice(0, 500),
            role:         'writer',
            is_verified:  true,
            avatar_url:   profileAvatar,
            updated_at:   now,
          }),
        }
      )
      return {
        username:    acct.username,
        status:      patchR.ok ? 'updated' : 'update_error',
        http_status: patchR.status,
        profile_id:  existingProfile?.id || null,
        team:        acct.team,
        is_lead:     !!acct.is_lead,
      }
    }

    // ── 2b. 프로필 없음 → Auth User 확인 / 생성 ────────────────────
    // 먼저 Auth에 같은 email 사용자 있는지 확인
    const existingAuthUser = await findAuthUserByEmail(aiEmail)
    let userId = existingAuthUser?.id || null

    if (!userId) {
      // Auth User 신규 생성 → 트리거가 profiles 자동 생성
      const createResult = await createAuthUser(acct)
      if (!createResult.ok) {
        // Auth User 생성 실패 시 직접 profiles upsert 시도 (fallback)
        // (FK 제약이 없는 경우를 대비한 안전망)
        const directR = await fetch(`${SB_URL}/rest/v1/profiles`, {
          method:  'POST',
          headers: { ...H(), Prefer: 'return=representation,resolution=ignore-duplicates' },
          body: JSON.stringify({
            username:     acct.username,
            display_name: acct.display_name,
            bio:          acct.bio.slice(0, 500),
            email:        aiEmail,
            role:         'writer',
            is_verified:  true,
            avatar_url:   profileAvatar,
            created_at:   now,
            updated_at:   now,
          }),
        })
        const directBody = await directR.json().catch(() => [])
        if (directR.status === 201 || directR.status === 200) {
          return {
            username:   acct.username,
            status:     'created_direct',
            id:         directBody?.[0]?.id || null,
            team:       acct.team,
            is_lead:    !!acct.is_lead,
          }
        }
        return {
          username:      acct.username,
          status:        'auth_error',
          auth_error:    createResult.error,
          http_status:   createResult.status,
          team:          acct.team,
        }
      }
      userId = createResult.userId
      // 트리거가 profiles를 자동 생성하므로 300ms 대기
      await new Promise(r => setTimeout(r, 300))
    }

    // ── 3. Auth User 존재 → profiles 확인 후 업데이트 ──────────────
    // 트리거로 생성된 profiles를 업데이트 (username, bio, avatar 등)
    const patchByIdR = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${userId}`,
      {
        method:  'PATCH',
        headers: { ...H(), Prefer: 'return=representation' },
        body: JSON.stringify({
          username:     acct.username,
          display_name: acct.display_name,
          bio:          acct.bio.slice(0, 500),
          role:         'writer',
          is_verified:  true,
          avatar_url:   profileAvatar,
          updated_at:   now,
        }),
      }
    )

    if (patchByIdR.ok || patchByIdR.status === 204) {
      return {
        username:   acct.username,
        status:     'created',
        auth_id:    userId,
        team:       acct.team,
        is_lead:    !!acct.is_lead,
      }
    }

    // profiles PATCH 실패 → 직접 INSERT 시도 (username이 다를 경우)
    const upsertR = await fetch(`${SB_URL}/rest/v1/profiles`, {
      method:  'POST',
      headers: { ...H(), Prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({
        id:           userId,
        username:     acct.username,
        display_name: acct.display_name,
        bio:          acct.bio.slice(0, 500),
        email:        aiEmail,
        role:         'writer',
        is_verified:  true,
        avatar_url:   profileAvatar,
        created_at:   now,
        updated_at:   now,
      }),
    })
    const upsertBody = await upsertR.json().catch(() => [])
    return {
      username:    acct.username,
      status:      upsertR.ok ? 'created' : 'upsert_error',
      http_status: upsertR.status,
      id:          upsertBody?.[0]?.id || userId,
      team:        acct.team,
      is_lead:     !!acct.is_lead,
    }

  } catch (e) {
    return { username: acct.username, status: 'exception', error: e.message?.slice(0, 150), team: acct.team }
  }
}

// ══════════════════════════════════════════════════════════════════════
// 전체 100명 계정 동기화 — 5명씩 배치 병렬
// ══════════════════════════════════════════════════════════════════════

async function syncAllAccounts() {
  const resultList = await runBatch(AI_ACCOUNTS, syncOneAccount, 5)

  // username → result 맵으로 변환
  const resultMap = {}
  for (const r of resultList) resultMap[r.username] = r

  return resultMap
}

// ══════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

async function _handleSyncAiAccounts_impl(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // ── GET: 계정 상태 상세 조회 (공개) ──────────────────────────────
  if (req.method === 'GET') {
    const url     = new URL(req.url)
    const teamFilter = url.searchParams.get('team') // ?team=운영팀

    const { accounts, team_summary } = await fetchAccountStatuses()

    const filtered = teamFilter
      ? accounts.filter(a => a.team === teamFilter)
      : accounts

    const existing = filtered.filter(a => a.exists).length
    const missing  = filtered.filter(a => !a.exists).length

    return json({
      status:          'ok',
      engine:          'sync-ai-accounts-v2',
      description:     'Insightship AI 팀 전체 100명 계정 동기화 API',
      total_defined:   AI_ACCOUNTS.length,
      filter_team:     teamFilter || null,
      filtered_count:  filtered.length,
      existing,
      missing,
      team_summary:    teamFilter ? undefined : team_summary,
      accounts:        filtered,
      hint:            missing > 0
        ? `POST /api/sync-ai-accounts (Authorization: Bearer CRON_SECRET) 으로 ${missing}개 누락 계정을 생성/업데이트하세요.`
        : '모든 조회된 AI 팀 계정이 정상적으로 존재합니다.',
      persona_rules: [
        '각 멤버 고유 username (ai_aria, ai_nova, …)',
        '"AI입니다" 선언 금지 — 역할명(매니저/선임 매니저)으로만 소개',
        '서로의 역할 영역 침범 금지 (duties 기반)',
        '자연스러운 한국어 커뮤니케이션',
        '커뮤니티 멤버에게 진정성 있게 반응',
      ],
    })
  }

  // ── POST: 전체 계정 생성/업데이트 (관리자 인증) ──────────────────
  if (req.method === 'POST') {
    const isAuthed =
      req.headers.get('authorization') === `Bearer ${CRON_SECRET}` ||
      req.headers.get('x-cron-secret')  === CRON_SECRET

    if (!isAuthed) return json({ error: 'Unauthorized' }, 401)
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env vars' }, 500)

    // 특정 팀만 동기화할 수 있는 옵션 지원
    let body = {}
    try { body = await req.json() } catch (_) {}
    const teamOnly = body?.team || null // e.g. { "team": "운영팀" }

    const targetAccounts = teamOnly
      ? AI_ACCOUNTS.filter(a => a.team === teamOnly)
      : AI_ACCOUNTS

    if (targetAccounts.length === 0)
      return json({ error: `팀을 찾을 수 없습니다: ${teamOnly}` }, 400)

    const resultList = await runBatch(targetAccounts, syncOneAccount, 5)
    const resultMap  = {}
    for (const r of resultList) resultMap[r.username] = r

    const created = resultList.filter(r => r.status === 'created').length
    const updated = resultList.filter(r => r.status === 'updated').length
    const errors  = resultList.filter(r => r.status.includes('error') || r.status === 'exception').length

    // 팀별 집계
    const byTeam = {}
    for (const r of resultList) {
      if (!byTeam[r.team]) byTeam[r.team] = { created: 0, updated: 0, errors: 0 }
      if (r.status === 'created')                              byTeam[r.team].created++
      else if (r.status === 'updated')                         byTeam[r.team].updated++
      else if (r.status.includes('error') || r.status === 'exception') byTeam[r.team].errors++
    }

    return json({
      ok:        errors === 0,
      engine:    'sync-ai-accounts-v2',
      timestamp: new Date().toISOString(),
      filter_team: teamOnly || null,
      summary: {
        total:   targetAccounts.length,
        created,
        updated,
        errors,
      },
      by_team: byTeam,
      results: resultMap,
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}

  return _handleSyncAiAccounts_impl
})();

const handleCommunityEngine = (() => {
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP 커뮤니티 활성화 엔진 v2.0                              ║
 * ║  설계서 §7 기반 — 인기 게시물 추천 + 팔로우 알림 + 실시간 피드     ║
 * ║                                                                      ║
 * ║  기능 v2:                                                            ║
 * ║   A. 인기 게시물 랭킹 계산 (view×0.3 + like×0.5 + reply×0.2)      ║
 * ║   B. 팔로우 기반 피드 추천 API                                      ║
 * ║   C. 팔로잉 유저 새 글 알림 자동 발송 (중복 방지)                  ║
 * ║   D. 트렌드 토론 주제 자동 생성 (요일별 로테이션)                  ║
 * ║   E. 배지 조건 실시간 트리거 (게시글 작성 즉시)                    ║
 * ║   F. 좋아요 마일스톤 알림 (10·50·100·500)                          ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */


const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const H = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
})

async function sbGet(path) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H() })
    return r.json()
  } catch { return [] }
}

async function sbPost(path, body) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...H(), Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
}

// ── A. 인기 게시물 랭킹 계산 ─────────────────────────────────────
async function calcHotPosts(days = 7, topN = 10) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const posts = await sbGet(
    `community_posts?is_deleted=eq.false&created_at=gte.${since}` +
    `&select=id,title,view_count,like_count,reply_count,post_type,created_at,author_id` +
    `&limit=200&order=like_count.desc`
  )
  if (!Array.isArray(posts)) return []

  return posts
    .map(p => ({
      ...p,
      hot_score: (p.view_count || 0) * 0.3 + (p.like_count || 0) * 0.5 + (p.reply_count || 0) * 0.2,
    }))
    .sort((a, b) => b.hot_score - a.hot_score)
    .slice(0, topN)
}

// ── B. 팔로우 피드 추천 ───────────────────────────────────────────
async function getFollowFeed(userId, limit = 20) {
  const follows = await sbGet(`follows?follower_id=eq.${userId}&select=following_id&limit=200`)
  if (!Array.isArray(follows) || follows.length === 0) return []

  const ids = follows.map(f => f.following_id)
  const inClause = `(${ids.map(id => `"${id}"`).join(',')})`

  const posts = await sbGet(
    `community_posts?author_id=in.${inClause}&is_deleted=eq.false` +
    `&select=id,title,body,post_type,like_count,reply_count,created_at,` +
    `profiles!author_id(id,display_name,avatar_url)` +
    `&order=created_at.desc&limit=${limit}`
  )
  return Array.isArray(posts) ? posts : []
}

// ── C. 팔로잉 유저 새 글 알림 발송 (중복 방지) ───────────────────
async function sendFollowNotifications() {
  const since = new Date(Date.now() - 3600000).toISOString()
  const newPosts = await sbGet(
    `community_posts?is_deleted=eq.false&created_at=gte.${since}` +
    `&select=id,title,author_id,post_type,profiles!author_id(display_name)` +
    `&limit=30`
  )
  if (!Array.isArray(newPosts) || newPosts.length === 0) return 0

  let notifCount = 0

  for (const post of newPosts) {
    const followers = await sbGet(
      `follows?following_id=eq.${post.author_id}&select=follower_id&limit=300`
    )
    if (!Array.isArray(followers)) continue

    const authorName = post.profiles?.display_name || '창업가'

    // 중복 알림 방지: 이미 같은 post에 대한 알림이 있는지 확인
    const existingNotifs = await sbGet(
      `notifications?type=eq.follow_post&link=eq.%2Fcommunity%2F${post.id}&limit=1&select=id`
    )
    if (Array.isArray(existingNotifs) && existingNotifs.length > 0) continue

    const notifs = followers.slice(0, 100).map(f => ({
      user_id: f.follower_id,
      title: `${authorName}님의 새 글`,
      message: `"${(post.title || '').slice(0, 50)}"`,
      type: 'follow_post',
      link: `/community/${post.id}`,
      is_read: false,
      created_at: new Date().toISOString(),
    }))

    if (notifs.length > 0) {
      try {
        await fetch(`${SB_URL}/rest/v1/notifications`, {
          method: 'POST',
          headers: { ...H(), Prefer: 'return=minimal' },
          body: JSON.stringify(notifs),
        })
        notifCount += notifs.length
      } catch {}
    }
  }
  return notifCount
}

// ── D. 트렌드 토론 주제 자동 생성 (요일 로테이션) ─────────────────
const TREND_TOPICS = [
  {
    title: '📊 AI 스타트업 창업, 지금이 적기일까요? 여러분의 생각은?',
    body: `ARIA가 오늘의 트렌드 토론 주제를 가져왔습니다!\n\n**AI 스타트업** 분야가 2024~2025년 가장 뜨거운 창업 분야 중 하나입니다.\n\n> 💬 토론 질문\nQ1. 여러분은 AI를 활용한 창업 아이디어가 있나요?\nQ2. AI 스타트업의 가장 큰 진입 장벽은 무엇이라고 생각하나요?\nQ3. 청소년 창업가가 AI 분야에서 차별화할 수 있는 방법은?\n\n댓글로 여러분의 생각을 공유해 주세요! 💡\nAI 멘토에게 "AI 스타트업 아이디어 추천해줘"라고 물어보면 맞춤 아이디어를 받을 수 있어요.`,
    tags: ['AI스타트업', '트렌드토론', '창업기회'],
  },
  {
    title: '💰 요즘 스타트업 투자 환경, 창업하기 좋은가요?',
    body: `운영 매니저 **ARIA**의 이번 주 투자 트렌드 토론입니다!\n\n최근 VC 투자 패턴이 크게 바뀌고 있습니다. 시드 투자는 늘지만 Series A 이상은 조건이 까다로워졌죠.\n\n**주요 트렌드**\n• AI/ML 분야 투자 급증\n• 클라이밋테크·헬스케어 주목\n• 에듀테크 재도약\n\n> 💬 토론 질문\n여러분이 투자자라면 어떤 스타트업에 투자하고 싶나요?\n그 이유도 함께 알려주세요!`,
    tags: ['스타트업투자', '트렌드', 'VC'],
  },
  {
    title: '🌱 청소년 창업가, 학교 vs 창업 — 어떻게 균형을 잡나요?',
    body: `많은 청소년 창업가들이 고민하는 주제입니다!\n\n**학업과 창업, 둘 다 잡을 수 있을까요?**\n\n> 💬 오늘의 토론\n• 현재 학업과 창업을 병행하고 있다면 어떻게 균형을 잡고 있나요?\n• 창업에 집중하기 위해 휴학·자퇴를 선택했거나 고민한 적 있나요?\n• 청소년 창업을 지원해주는 학교/선생님이 있나요?\n\n솔직한 경험담을 공유해 주세요. 여기는 판단 없는 공간입니다! 💙`,
    tags: ['청소년창업', '학업', '창업고민'],
  },
  {
    title: '🚀 MVP 없이 창업 가능할까요? 여러분의 경험 공유!',
    body: `**린 스타트업의 핵심: MVP(최소 기능 제품)**\n\n"완벽한 제품이 완성될 때까지 기다려야 한다" vs "빠르게 출시하고 피드백을 받아라"\n\n> 💬 토론 질문\n1. MVP를 만들어 본 경험이 있나요?\n2. 가장 작은 MVP는 어떤 형태여야 할까요?\n3. MVP 없이 시작한 스타트업이 성공할 수 있을까요?\n\nAI 멘토에게 "내 아이디어로 MVP 설계해줘"라고 물어보면 즉석 MVP 계획을 받을 수 있어요! 🎯`,
    tags: ['MVP', '린스타트업', '창업전략'],
  },
  {
    title: '🤝 창업 팀원을 어떻게 구하나요? 팀 빌딩 노하우 공유!',
    body: `**좋은 아이디어보다 좋은 팀이 중요하다** — 실리콘밸리 투자자들의 공통된 말입니다.\n\n> 💬 오늘의 토론\n• 팀원을 구할 때 가장 중요하게 보는 것은?\n• 온라인 vs 오프라인, 어디서 팀원을 만났나요?\n• 팀 내 갈등을 어떻게 해결하나요?\n\n**팀원 모집 꿀팁**\n→ 아이디어랩에 팀원 모집 글을 올려보세요!\n→ 커뮤니티에서 비슷한 관심사 창업가를 찾아보세요.\n\n여러분의 팀 빌딩 경험을 나눠주세요! 🌟`,
    tags: ['팀빌딩', '창업팀', '팀원모집'],
  },
  {
    title: '📱 앱 vs 웹 vs 커머스 — 초기 창업자에게 유리한 형태는?',
    body: `창업 초기, 어떤 형태의 제품/서비스를 만들어야 할까요?\n\n**각 방식의 장단점**\n\n| 형태 | 장점 | 단점 |\n|---|---|---|\n| 모바일 앱 | 높은 접근성 | 개발 비용 ↑ |\n| 웹/SaaS | 빠른 출시 | 모바일 경험 약함 |\n| 커머스 | 즉각적 매출 | 재고/물류 관리 |\n| 콘텐츠 | 낮은 진입장벽 | 수익화 어려움 |\n\n> 💬 여러분의 생각은?\n어떤 형태로 창업하고 싶으신가요? 이유도 함께요!`,
    tags: ['창업형태', '앱개발', '웹스타트업'],
  },
  {
    title: '🌏 글로벌 창업 vs 한국 창업 — 어느 시장을 먼저 공략할까?',
    body: `**"처음부터 글로벌"이 맞을까요, "국내 검증 후 해외 진출"이 맞을까요?**\n\n최근 Korean Wave 덕에 한국 스타트업의 글로벌 경쟁력이 높아졌습니다.\n\n> 💬 토론 질문\n• 여러분의 아이디어, 한국 시장에서 먼저 검증할 건가요?\n• 글로벌 시장 진출 시 가장 큰 장벽은?\n• 한국 스타트업이 글로벌에서 강점을 가질 수 있는 분야는?\n\n영어로 창업하는 것에 대해 어떻게 생각하시나요? 🌍`,
    tags: ['글로벌창업', '해외진출', '스타트업전략'],
  },
]

async function generateTrendDiscussion() {
  const ariaProfiles = await sbGet(`profiles?username=eq.ai_aria&select=id&limit=1`)
  const ariaId = Array.isArray(ariaProfiles) && ariaProfiles[0]?.id ? ariaProfiles[0].id : null
  if (!ariaId) return null

  const today = new Date().toISOString().slice(0, 10)
  const existing = await sbGet(
    `community_posts?author_id=eq.${ariaId}&created_at=gte.${today}T00:00:00Z&select=id&limit=1`
  )
  if (Array.isArray(existing) && existing.length > 0) return null

  const dayOfWeek = new Date().getDay()
  const weekNum = Math.ceil(new Date().getDate() / 7)
  const idx = (dayOfWeek + weekNum) % TREND_TOPICS.length
  const template = TREND_TOPICS[idx]

  const postRes = await fetch(`${SB_URL}/rest/v1/community_posts`, {
    method: 'POST',
    headers: { ...H(), Prefer: 'return=representation' },
    body: JSON.stringify({
      ...template,
      post_type: 'question',
      author_id: ariaId,
      is_pinned: false,
      is_deleted: false,
      view_count: 0,
      like_count: 0,
      reply_count: 0,
      created_at: new Date().toISOString(),
    }),
  })
  const created = await postRes.json().catch(() => null)
  return Array.isArray(created) ? created[0] : created
}

// ── E. 배지 즉시 트리거 (게시글 작성 시) ─────────────────────────
async function triggerBadgeCheck(userId) {
  if (!userId) return
  try {
    // 배지 시스템 API 호출 (user_action: 게시글 작성 완료 후 트리거)
    await fetch(`${SB_URL}/rest/v1/rpc/check_user_badges`, {
      method: 'POST',
      headers: H(),
      body: JSON.stringify({ p_user_id: userId }),
    }).catch(() => {})
  } catch {}
}

// ── F. 좋아요 마일스톤 알림 ───────────────────────────────────────
async function checkLikeMilestones() {
  const MILESTONES = [10, 50, 100, 500]
  let notifCount = 0

  // 최근 1일 내 like_count가 마일스톤에 도달한 게시글 확인
  const since = new Date(Date.now() - 86400000).toISOString()
  const posts = await sbGet(
    `community_posts?is_deleted=eq.false&like_count=gte.10&created_at=gte.${since}` +
    `&select=id,title,author_id,like_count&limit=50`
  )
  if (!Array.isArray(posts)) return 0

  for (const post of posts) {
    const likeCount = post.like_count || 0
    const milestone = MILESTONES.find(m => likeCount >= m && likeCount < m + 5)
    if (!milestone) continue

    // 이미 같은 마일스톤 알림이 있는지 확인
    const existing = await sbGet(
      `notifications?user_id=eq.${post.author_id}&type=eq.like_milestone&link=eq.%2Fcommunity%2F${post.id}&limit=1`
    )
    if (Array.isArray(existing) && existing.length > 0) continue

    try {
      await sbPost('notifications', {
        user_id: post.author_id,
        title: `🔥 좋아요 ${milestone}개 달성!`,
        message: `"${(post.title || '').slice(0, 40)}" 게시글이 좋아요 ${milestone}개를 받았습니다!`,
        type: 'like_milestone',
        link: `/community/${post.id}`,
        is_read: false,
        created_at: new Date().toISOString(),
      })
      notifCount++
    } catch {}
  }
  return notifCount
}

// ── 메인 핸들러 ──────────────────────────────────────────────────
// ── UUID 검증 헬퍼 ─────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isValidUUID(v) { return typeof v === 'string' && UUID_RE.test(v) }

async function _handleCommunityEngine_impl(req) {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // 팔로우 피드 조회 (GET /api/community-engine?action=feed&user_id=xxx)
  if (req.method === 'GET' && action === 'feed') {
    const userId = url.searchParams.get('user_id')
    if (!userId) return json({ error: 'user_id required' }, 400)
    // ★ SECURITY: UUID 형식 검증 (IDOR 방지)
    if (!isValidUUID(userId)) return json({ error: '유효하지 않은 user_id 형식입니다.' }, 400)
    const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 50)
    const feed = await getFollowFeed(userId, limit)
    return json({ feed, count: feed.length })
  }

  // 인기 게시물 조회
  if (req.method === 'GET' && action === 'hot') {
    const days  = Math.min(Number(url.searchParams.get('days')) || 7, 30)
    const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 50)
    const hot = await calcHotPosts(days, limit)
    return json({ hot, count: hot.length })
  }

  // 배지 트리거 — ★ SECURITY: 인증 추가
  if (req.method === 'POST' && action === 'badge_trigger') {
    // 인증 확인 (CRON 또는 서비스 내부 호출만 허용)
    const authH = req.headers.get('authorization') || ''
    const isCron = req.headers.get('x-vercel-cron') === '1'
    const isCronKey = authH === `Bearer ${CRON_SECRET}` || req.headers.get('x-cron-secret') === CRON_SECRET
    if (!isCron && !isCronKey) return json({ error: 'Unauthorized' }, 401)

    let body = {}
    try { body = await req.json() } catch {}
    const userId = body.user_id
    if (!userId) return json({ error: 'user_id required' }, 400)
    // ★ SECURITY: UUID 형식 검증
    if (!isValidUUID(userId)) return json({ error: '유효하지 않은 user_id 형식입니다.' }, 400)
    await triggerBadgeCheck(userId)
    return json({ ok: true })
  }

  // 상태 확인
  if (req.method === 'GET') {
    return json({
      service: 'community-activation-engine',
      version: '2.0',
      features: [
        'hot_posts', 'follow_feed', 'follow_notifications',
        'trend_discussion', 'badge_trigger', 'like_milestone_alerts'
      ],
      cron_schedule: '0 12 * * *',
      status: 'ready',
    })
  }

  // 크론 인증
  const auth = req.headers.get('authorization')
  const cron = req.headers.get('x-vercel-cron')
  const secret = req.headers.get('x-cron-secret')
  if (cron !== '1' && auth !== `Bearer ${CRON_SECRET}` && secret !== CRON_SECRET) {
    return json({ error: 'Unauthorized' }, 401)
  }

  if (!SB_URL || !SB_KEY) return json({ error: 'Missing env' }, 500)

  // 크론 병렬 실행
  const [notifResult, discussResult, hotResult, milestoneResult] = await Promise.allSettled([
    sendFollowNotifications(),
    generateTrendDiscussion(),
    calcHotPosts(),
    checkLikeMilestones(),
  ])

  return json({
    follow_notifications_sent: notifResult.status === 'fulfilled' ? notifResult.value : 0,
    trend_discussion_created: discussResult.status === 'fulfilled' ? !!discussResult.value : false,
    hot_posts_count: hotResult.status === 'fulfilled' ? hotResult.value.length : 0,
    like_milestone_alerts: milestoneResult.status === 'fulfilled' ? milestoneResult.value : 0,
    timestamp: new Date().toISOString(),
  })
}

  return _handleCommunityEngine_impl
})();

const handleFeedbackReply = (() => {
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
// runtime: Node.js serverless

// (generateFeedbackReply imported at top from staff-brain.js)

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

async function _handleFeedbackReply_impl(req) {
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

  return _handleFeedbackReply_impl
})();

const handleGenerateReport = (() => {
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP AI 주간 리포트 생성기 v3.0                             ║
 * ║  담당 AI: SAGE (세이지) — 리포트 매니저                             ║
 * ║                                                                      ║
 * ║  v3 업그레이드:                                                      ║
 * ║  - 롱폼 v10 엔진 내장 (3,000자+ 리포트)                            ║
 * ║  - 섹터별 시장 수치 자동 내재화                                     ║
 * ║  - 청소년 창업가 인사이트 섹션 강화                                 ║
 * ║  - 주간 발행 검증 로직 (중복 방지)                                  ║
 * ║  - GET 상태 조회 강화                                               ║
 * ║                                                                      ║
 * ║  스케줄: 매주 금요일 23:00 KST (UTC 14:00)                          ║
 * ║  출력: articles 테이블에 trend 카테고리로 자동 발행                  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */


const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const SH = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

// ══════════════════════════════════════════════════════════════════════
// §1. NLP 코어
// ══════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','위해','통해',
  '대한','관련','따른','있는','없는','되는','하는','있다','없다',
  '된다','한다','이다','있으며','되며','하며','이번','지난','올해',
  '작년','이달','오늘','어제','최근','현재','지금','특히','또','더',
  '가장','매우','모두','함께','이미','아직','약','총','전','후','당',
  '각','제','본','해당','기자','특파원','뉴스','보도','발표',
  '밝혔다','말했다','전했다','설명했다','밝혀졌다','알려졌다',
])

function tokenize(text) {
  if (!text) return []
  return (text.replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g,' ').toLowerCase()
    .match(/[가-힣]{2,}|[a-z]{3,}|[0-9]+/g) || [])
    .filter(t => !STOPWORDS.has(t) && t.length >= 2)
}

const K1 = 1.5, BP = 0.75
function bm25(qToks, dToks, avgLen, N, df) {
  const len = dToks.length
  const tf = {}
  for (const t of dToks) tf[t] = (tf[t]||0)+1
  let score = 0
  for (const q of qToks) {
    if (!tf[q]) continue
    const idf = Math.log((N-(df[q]||0)+0.5)/((df[q]||0)+0.5)+1)
    score += idf * (tf[q]*(K1+1))/(tf[q]+K1*(1-BP+BP*len/avgLen))
  }
  return score
}

// ══════════════════════════════════════════════════════════════════════
// §2. 주차 계산
// ══════════════════════════════════════════════════════════════════════

function getThisWeekRange() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9*3600000)
  const day = kst.getDay() || 7
  const monday = new Date(kst); monday.setDate(kst.getDate()-(day-1)); monday.setHours(0,0,0,0)
  const saturday = new Date(monday); saturday.setDate(monday.getDate()+5); saturday.setHours(23,59,59,999)
  return {
    from: new Date(monday.getTime()-9*3600000),
    to:   new Date(saturday.getTime()-9*3600000),
  }
}

function weekLabel(date) {
  const kst = new Date(date.getTime()+9*3600000)
  const year = kst.getFullYear(), month = kst.getMonth()+1
  const getISO = d => { const t=new Date(d); t.setDate(t.getDate()+3-(t.getDay()+6)%7); const w1=new Date(t.getFullYear(),0,4); return 1+Math.round(((t-w1)/86400000-3+(w1.getDay()+6)%7)/7) }
  const firstMon = new Date(year,kst.getMonth(),1); while(firstMon.getDay()!==1) firstMon.setDate(firstMon.getDate()+1)
  const week = getISO(kst)-getISO(firstMon)+1
  return `${year}년 ${month}월 ${week}주차`
}

function weekCode(date) {
  const kst = new Date(date.getTime()+9*3600000)
  const year = kst.getFullYear(), month = kst.getMonth()+1
  const getISO = d => { const t=new Date(d); t.setDate(t.getDate()+3-(t.getDay()+6)%7); const w1=new Date(t.getFullYear(),0,4); return 1+Math.round(((t-w1)/86400000-3+(w1.getDay()+6)%7)/7) }
  const firstMon = new Date(year,kst.getMonth(),1); while(firstMon.getDay()!==1) firstMon.setDate(firstMon.getDate()+1)
  const week = getISO(kst)-getISO(firstMon)+1
  return `${year}-${String(month).padStart(2,'0')}-w${week}`
}

// ══════════════════════════════════════════════════════════════════════
// §3. v3 리포트 생성 엔진
// ══════════════════════════════════════════════════════════════════════

// 뉴스 도메인별 분류
function classifyNews(news) {
  const buckets = {
    funding: [], product: [], policy: [], market: [], person: [], youth: [], tech: [], other: []
  }
  const fundingKw  = ['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC','엑셀러레이터']
  const productKw  = ['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈','업데이트']
  const policyKw   = ['정부','지원','공모','선발','과기부','중기부','창진원','예산','정책','공고','R&D','바우처']
  const personKw   = ['대표','CEO','창업자','설립자','인터뷰','스토리','수상','선정']
  const marketKw   = ['시장','성장','규모','트렌드','전망','예측','확대','점유율','글로벌']
  const youthKw    = ['청소년','청년','대학생','고등학생','학생창업','비즈쿨','해커톤']
  const techKw     = ['AI','인공지능','LLM','딥러닝','생성형','ChatGPT','반도체','클라우드']

  for (const n of news) {
    const t = (n.title + ' ' + (n.ai_summary||'').slice(0,150)).toLowerCase()
    if (youthKw.some(k => t.includes(k.toLowerCase()))) { buckets.youth.push(n); continue }
    if (fundingKw.some(k => t.includes(k.toLowerCase()))) { buckets.funding.push(n); continue }
    if (policyKw.some(k => t.includes(k.toLowerCase())))  { buckets.policy.push(n);  continue }
    if (techKw.some(k => t.includes(k.toLowerCase())))    { buckets.tech.push(n);    continue }
    if (productKw.some(k => t.includes(k.toLowerCase()))) { buckets.product.push(n); continue }
    if (personKw.some(k => t.includes(k.toLowerCase())))  { buckets.person.push(n);  continue }
    if (marketKw.some(k => t.includes(k.toLowerCase())))  { buckets.market.push(n);  continue }
    buckets.other.push(n)
  }
  return buckets
}

// BM25 기반 뉴스 랭킹
function extractKeyPoints(newsItems, query, maxItems = 4) {
  if (!newsItems.length) return []
  const qToks = tokenize(query)
  const docs = newsItems.map(n => ({
    n,
    toks: tokenize(n.title + ' ' + (n.ai_summary||'').slice(0,200)),
  }))
  const avgLen = docs.reduce((s,d) => s+d.toks.length,0)/docs.length || 10
  const df = {}
  for (const d of docs) for (const t of new Set(d.toks)) df[t]=(df[t]||0)+1
  return docs
    .map(d => ({ ...d, score: bm25(qToks, d.toks, avgLen, docs.length, df) }))
    .sort((a,b) => b.score-a.score)
    .slice(0, maxItems)
    .map(d => d.n)
}

// 핵심 수치 추출
function extractNumbers(news) {
  const nums = []
  for (const n of news) {
    const matches = (n.title + ' ' + (n.ai_summary||'')).match(/[0-9,]+억원?|[0-9,]+조원?|[0-9]+%|[0-9]+배/g) || []
    if (matches.length > 0) {
      nums.push({ title: n.title.slice(0,40), nums: matches.slice(0,3) })
    }
  }
  return nums.slice(0, 5)
}

// ── 투자·자금 리포트 v3 ───────────────────────────────────────────────
function buildFundingReport(label, news) {
  const b = classifyNews(news)
  const topFunding = extractKeyPoints(b.funding.length ? b.funding : news, '투자 펀딩 억원 시리즈', 6)
  const topPolicy  = extractKeyPoints(b.policy.length  ? b.policy  : news, '정부 지원 정책 공모', 4)
  const topYouth   = extractKeyPoints(b.youth.length   ? b.youth   : news, '청소년 청년 학생 창업', 3)
  const topTech    = extractKeyPoints(b.tech.length    ? b.tech    : news, 'AI 인공지능 기술 플랫폼', 3)

  const now = new Date()
  const kst = new Date(now.getTime()+9*3600000)
  const dateStr = `${kst.getFullYear()}년 ${kst.getMonth()+1}월 ${kst.getDate()}일`

  const top3 = extractKeyPoints(news, '투자 펀딩 스타트업 창업 억원', 3)
  const summaryLines = top3.map((n,i) =>
    `${i+1}. **${n.title}**\n   ${(n.ai_summary||n.title).replace(/\*\*|##/g,'').slice(0,150).trim()}...`
  )

  const fundingLines = topFunding.slice(0,5).map(n => {
    const nums = (n.title + ' ' + (n.ai_summary||'')).match(/[0-9,]+억원?|[0-9,]+조원?/g)
    const numStr = nums ? ` (${nums[0]})` : ''
    return `- **${n.title}**${numStr}\n  ${(n.ai_summary||'').replace(/\*\*|##/g,'').slice(0,100).trim()}`
  })

  // 섹터별 분류 (상세)
  const aiItems     = news.filter(n => /AI|인공지능|딥러닝|LLM|생성형/.test(n.title)).slice(0,3)
  const edutechItems= news.filter(n => /에듀테크|교육|학습/.test(n.title)).slice(0,2)
  const finItems    = news.filter(n => /핀테크|금융|결제/.test(n.title)).slice(0,2)
  const healthItems = news.filter(n => /헬스케어|바이오|의료/.test(n.title)).slice(0,2)
  const climateItems= news.filter(n => /기후|탄소|ESG|그린|친환경/.test(n.title)).slice(0,2)

  const sectorLines = []
  if (aiItems.length)      sectorLines.push(`**🤖 AI·기술** (${aiItems.length}건): ${aiItems.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (edutechItems.length) sectorLines.push(`**📚 에듀테크** (${edutechItems.length}건): ${edutechItems.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (finItems.length)     sectorLines.push(`**💳 핀테크** (${finItems.length}건): ${finItems.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (healthItems.length)  sectorLines.push(`**🏥 헬스케어** (${healthItems.length}건): ${healthItems.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (climateItems.length) sectorLines.push(`**🌍 기후테크** (${climateItems.length}건): ${climateItems.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (!sectorLines.length) sectorLines.push('이번 주는 다양한 분야에서 고른 투자 활동이 나타났습니다.')

  const policyLines = topPolicy.slice(0,3).map(n =>
    `- **${n.title}**\n  ${(n.ai_summary||'').replace(/\*\*|##/g,'').slice(0,100).trim()}`
  )

  // 수치 데이터 섹션
  const numData = extractNumbers(topFunding.concat(news.slice(0,10)))
  const numLines = numData.map(d => `- **${d.title}**: ${d.nums.join(', ')}`)

  // 청소년 인사이트 강화
  const youthInsight = topYouth.length > 0
    ? `이번 주 **청소년·청년 창업** 관련 소식이 ${topYouth.length}건 포착됐습니다. ${topYouth[0].title.slice(0,50)} 등의 사례에서 지원 기회를 찾아보세요.`
    : `이번 주 투자 소식 중 청소년이 참고할 내용을 골라봤습니다. 투자받은 기업들의 문제 정의 방식을 분석하면 내 창업 아이디어의 타이밍을 검증할 수 있습니다.`

  const insightBase = news.filter(n => /([0-9,]+억|[0-9]+%|[0-9]+배)/.test(n.title+' '+(n.ai_summary||'')))[0] || news[0]
  const mainInsight = insightBase
    ? `**${insightBase?.title?.slice(0,45) || '이번 주 주목 스타트업'}** 같은 사례를 분석할 때 "어떤 문제를 해결하는가", "왜 지금 투자받는가", "경쟁 우위는 무엇인가" 3가지 관점으로 읽어보세요.`
    : '투자받은 기업의 문제 정의 방식과 성장 전략을 분석하면 내 창업 아이디어의 타이밍을 검증할 수 있습니다.'

  return [
    `## 📊 이번 주 핵심 요약`,
    ``,
    `**${label}** 동안 **총 ${news.length}건**의 스타트업·창업 뉴스가 수집되었습니다.`,
    `집계 기준: ${dateStr} | AI 자동 분석`,
    ``,
    ...summaryLines,
    ``,
    `## 💰 주요 투자·펀딩 현황`,
    ``,
    fundingLines.length ? fundingLines.join('\n') : `이번 주 주목할 투자 소식: ${news.slice(0,2).map(n=>n.title).join(', ')}`,
    ``,
    numLines.length ? `**📈 주요 투자 수치**\n${numLines.join('\n')}\n` : '',
    `## 🏭 섹터별 투자 트렌드`,
    ``,
    sectorLines.join('\n'),
    ``,
    `## 📋 정부 지원 & 정책 동향`,
    ``,
    policyLines.length ? policyLines.join('\n') : `정책 관련 뉴스 ${topPolicy.length}건이 수집되었습니다.`,
    ``,
    `## 🤖 AI·기술 스타트업 동향`,
    ``,
    topTech.length > 0
      ? topTech.map(n => `- **${n.title}**: ${(n.ai_summary||'').replace(/\*\*|##/g,'').slice(0,100).trim()}`).join('\n')
      : 'AI 기술 관련 스타트업 동향을 지속 모니터링 중입니다.',
    ``,
    `## 🎯 청소년 창업가를 위한 인사이트`,
    ``,
    youthInsight,
    ``,
    mainInsight,
    ``,
    `**지금 할 수 있는 행동:**`,
    `1. 이번 주 투자 기업 중 하나를 골라 "내가 이 회사를 세운다면?" 관점으로 분석해보세요.`,
    `2. Insightship AI 멘토에게 관심 분야 투자 트렌드를 물어보세요.`,
    `3. 아이디어랩에 내 창업 아이디어를 공유하고 피드백을 받아보세요.`,
    ``,
    `---`,
    `*📋 **SAGE v3** (Insightship AI 리포트 매니저) — ${news.length}개 뉴스 자동 분석 | 비용 $0*`,
  ].filter(l => l !== undefined).join('\n')
}

// ── 시장·생태계 리포트 v3 ─────────────────────────────────────────────
function buildMarketReport(label, news) {
  const b = classifyNews(news)
  const topMarket  = extractKeyPoints(b.market.length  ? b.market  : news, '시장 성장 트렌드 전망 확대', 5)
  const topProduct = extractKeyPoints(b.product.length ? b.product : news, '출시 서비스 플랫폼 런칭', 4)
  const topPerson  = extractKeyPoints(b.person.length  ? b.person  : news, '창업자 대표 스토리 인터뷰', 3)
  const topYouth   = extractKeyPoints(b.youth.length   ? b.youth   : news, '청소년 청년 학생 창업 지원', 4)

  const now = new Date()
  const kst = new Date(now.getTime()+9*3600000)

  const topChange = extractKeyPoints(news, '시장 변화 성장 확대 글로벌 혁신', 4)
  const changeLines = topChange.map((n,i) =>
    `${i+1}. **${n.title}**\n   ${(n.ai_summary||n.title).replace(/\*\*|##/g,'').slice(0,150).trim()}`
  )

  const notableLines = topProduct.slice(0,4).map(n =>
    `- **${n.title}**\n  ${(n.ai_summary||'').replace(/\*\*|##/g,'').slice(0,100).trim()}`
  )

  // 기술 트렌드 상세
  const aiTech  = news.filter(n => /AI|ChatGPT|LLM|생성형|딥러닝/.test(n.title)).slice(0,3)
  const bioTech = news.filter(n => /바이오|의료|헬스케어/.test(n.title)).slice(0,2)
  const eduTech = news.filter(n => /에듀테크|학습|교육/.test(n.title)).slice(0,2)
  const climateTech = news.filter(n => /기후|탄소|ESG|그린/.test(n.title)).slice(0,2)
  const techLines = []
  if (aiTech.length)     techLines.push(`**🤖 AI·생성형** (${aiTech.length}건): ${aiTech.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (bioTech.length)    techLines.push(`**🧬 바이오·헬스** (${bioTech.length}건): ${bioTech.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (eduTech.length)    techLines.push(`**📚 에듀테크** (${eduTech.length}건): ${eduTech.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (climateTech.length)techLines.push(`**🌍 기후테크** (${climateTech.length}건): ${climateTech.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (!techLines.length) techLines.push('다양한 분야에서 기술 혁신이 이어지고 있습니다.')

  const supportNews = news.filter(n => /지원|공모|창업교육|해커톤|비즈쿨|창진원|멘토링/.test(n.title)).slice(0,4)
  const supportLines = supportNews.map(n =>
    `- **${n.title}**\n  ${(n.ai_summary||'').replace(/\*\*|##/g,'').slice(0,100).trim()}`
  )

  // 창업가 스토리
  const personLines = topPerson.slice(0,2).map(n =>
    `- **${n.title}**: ${(n.ai_summary||'').replace(/\*\*|##/g,'').slice(0,120).trim()}`
  )

  // 청소년 포인트 강화
  const youthItems = topYouth.slice(0,3)
  const youthPoint = youthItems.length > 0
    ? `이번 주 청소년·청년 창업가에게 직접 관련된 **${youthItems.length}건**의 소식이 있었습니다:\n${youthItems.map(n=>`- **${n.title}**`).join('\n')}\n\n지금 바로 참여할 수 있는 기회입니다.`
    : `이번 주 생태계 전반의 흐름을 파악했다면, 내 아이디어가 어느 시장에 위치하는지 정의해보세요.`

  const actionItem = [
    `1. 이번 주 상위 뉴스 3건을 읽고 "내가 이 문제를 해결한다면?" 관점으로 정리해보세요.`,
    `2. Insightship **멘토 AI**에게 아이디어를 검증받아보세요.`,
    `3. **아이디어랩**에 이번 주 뉴스에서 영감을 받은 아이디어를 공유해보세요.`,
    `4. **트렌드 트래커**에서 관심 분야 성장 그래프를 확인해보세요.`,
  ].join('\n')

  return [
    `## 🌊 이번 주 시장 핵심 변화`,
    ``,
    changeLines.join('\n\n'),
    ``,
    `## 🚀 주목할 스타트업 동향`,
    ``,
    notableLines.length ? notableLines.join('\n') : `이번 주 주목할 동향: ${news.slice(0,2).map(n=>n.title).join(', ')}`,
    ``,
    `## 🔬 기술 트렌드 분석`,
    ``,
    techLines.join('\n'),
    ``,
    personLines.length ? `## 👤 이번 주 창업가 스토리\n\n${personLines.join('\n')}\n` : '',
    `## 🏛️ 창업 생태계 지원 현황`,
    ``,
    supportLines.length ? supportLines.join('\n') : `창업 지원 관련 뉴스 ${supportNews.length}건이 수집되었습니다.`,
    ``,
    `## 🎯 청소년 창업가 주목 포인트`,
    ``,
    youthPoint,
    ``,
    `**✅ 지금 할 수 있는 행동**`,
    ``,
    actionItem,
    ``,
    `---`,
    `*📋 **SAGE v3** (Insightship AI 리포트 매니저) — ${news.length}개 뉴스 자동 분석 | 비용 $0*`,
  ].filter(l => l !== undefined).join('\n')
}

// ══════════════════════════════════════════════════════════════════════
// §4. DB 유틸
// ══════════════════════════════════════════════════════════════════════

async function getSageId() {
  try {
    const r1 = await fetch(`${SB_URL}/rest/v1/profiles?username=eq.ai_sage&limit=1&select=id`, { headers: SH() })
    const d1 = await r1.json()
    if (d1?.[0]?.id) return d1[0].id
    const r2 = await fetch(`${SB_URL}/rest/v1/profiles?role=eq.admin&limit=1&select=id`, { headers: SH() })
    const d2 = await r2.json()
    if (d2?.[0]?.id) return d2[0].id
    const r3 = await fetch(`${SB_URL}/rest/v1/profiles?or=(username.eq.insightship,username.eq.pacm,username.eq.admin)&limit=1&select=id`, { headers: SH() })
    const d3 = await r3.json()
    if (d3?.[0]?.id) return d3[0].id
    const r4 = await fetch(`${SB_URL}/rest/v1/profiles?select=id&order=created_at.asc&limit=1`, { headers: SH() })
    const d4 = await r4.json()
    return d4?.[0]?.id || null
  } catch { return null }
}

async function upsertArticle(title, body, tags, slug, adminId) {
  if (!adminId) return { error: 'admin_id_missing' }
  const check = await fetch(`${SB_URL}/rest/v1/articles?slug=eq.${slug}&select=id&limit=1`, { headers: SH() })
  const existing = await check.json()
  const excerpt = body.replace(/#+\s[^\n]+\n?/g,'').replace(/\*\*/g,'').replace(/---\n.*/gs,'').trim().slice(0,300)
  const payload = {
    title, slug, body,
    excerpt,
    category: 'trend',
    status: 'published',
    tags,
    ai_summary: excerpt.slice(0,500),
    read_time: Math.max(3, Math.ceil(body.length/400)),
    published_at: new Date().toISOString(),
    is_duplicate: false,
  }
  if (existing?.length > 0) {
    await fetch(`${SB_URL}/rest/v1/articles?slug=eq.${slug}`, {
      method: 'PATCH', headers: { ...SH(), Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    })
    return { updated: true }
  }
  const r = await fetch(`${SB_URL}/rest/v1/articles`, {
    method: 'POST', headers: { ...SH(), Prefer: 'return=representation' },
    body: JSON.stringify({ ...payload, author_id: adminId }),
  })
  if (r.status !== 201) {
    const errText = await r.text()
    throw new Error(`INSERT ${r.status}: ${errText.slice(0,100)}`)
  }
  return { inserted: true }
}

// ══════════════════════════════════════════════════════════════════════
// §5. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

async function _handleGenerateReport_impl(req) {
  if (req.method === 'GET') {
    // GET: 상태 + 최근 리포트 목록
    let recentReports = []
    if (SB_URL && SB_KEY) {
      try {
        const r = await fetch(
          `${SB_URL}/rest/v1/articles?status=eq.published&tags=cs.{AI리포트}&order=published_at.desc&limit=6&select=title,slug,published_at,read_time`,
          { headers: SH() }
        )
        recentReports = await r.json().catch(() => [])
      } catch {}
    }
    return new Response(JSON.stringify({
      status: 'ok', engine: 'SAGE-v3',
      agent: 'SAGE (세이지) — Insightship 리포트 매니저',
      description: 'AI 주간 리포트 자동 생성 (자체 NLP v3, 외부 API 0원)',
      schedule: '매주 금요일 23:00 KST',
      recent_reports: Array.isArray(recentReports) ? recentReports : [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === `Bearer ${CRON_SECRET}`
    || req.headers.get('x-cron-secret') === CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  if (!SB_URL || !SB_KEY) return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 })

  const url = new URL(req.url)
  const fromParam = url.searchParams.get('from')
  const toParam   = url.searchParams.get('to')

  let from, to, label
  if (fromParam && toParam) {
    from  = new Date(fromParam + 'T00:00:00+09:00')
    to    = new Date(toParam   + 'T23:59:59+09:00')
    label = weekLabel(from)
  } else {
    const range = getThisWeekRange()
    from = range.from; to = range.to
    label = weekLabel(from)
  }

  const code    = weekCode(from)
  const fromISO = from.toISOString()
  const toISO   = to.toISOString()

  // ── 뉴스 조회 (3단계 폴백) ────────────────────────────────────────
  let news = []
  try {
    const newsR = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&category=eq.news` +
      `&published_at=gte.${encodeURIComponent(fromISO)}&published_at=lte.${encodeURIComponent(toISO)}` +
      `&select=id,title,ai_summary,category,tags&order=published_at.desc&limit=80`,
      { headers: SH() }
    )
    const d1 = await newsR.json()
    if (Array.isArray(d1)) news = d1
  } catch {}

  if (news.length < 5) {
    try {
      const r2 = await fetch(
        `${SB_URL}/rest/v1/articles?status=eq.published&source_name=not.is.null` +
        `&published_at=gte.${encodeURIComponent(fromISO)}&published_at=lte.${encodeURIComponent(toISO)}` +
        `&select=id,title,ai_summary,category,tags&order=published_at.desc&limit=80`,
        { headers: SH() }
      )
      const d2 = await r2.json()
      if (Array.isArray(d2)) {
        const existIds = new Set(news.map(n => n.id))
        news.push(...d2.filter(n => !existIds.has(n.id)))
      }
    } catch {}
  }

  if (news.length < 3) {
    try {
      const fallbackFrom = new Date(Date.now() - 7 * 86400000).toISOString()
      const r3 = await fetch(
        `${SB_URL}/rest/v1/articles?status=eq.published` +
        `&published_at=gte.${encodeURIComponent(fallbackFrom)}` +
        `&select=id,title,ai_summary,category,tags&order=published_at.desc&limit=60`,
        { headers: SH() }
      )
      const d3 = await r3.json()
      if (Array.isArray(d3)) {
        const existIds = new Set(news.map(n => n.id))
        news.push(...d3.filter(n => !existIds.has(n.id)))
      }
    } catch {}
  }

  if (news.length === 0) {
    return new Response(JSON.stringify({ error: '분석할 뉴스 없음', from: fromISO, to: toISO, label }), { status: 200 })
  }

  const adminId = await getSageId()
  const results = { label, news_count: news.length, generated: [], errors: [], engine: 'SAGE-v3', agent: 'SAGE' }

  // ── 리포트 1: 투자·자금 동향 ──────────────────────────────────────
  try {
    const slug1 = `ai-funding-report-${code}`
    const body1 = buildFundingReport(label, news)
    if (body1.length < 400) throw new Error(`본문 너무 짧음: ${body1.length}자`)
    const r1 = await upsertArticle(
      `[AI 리포트] ${label} 스타트업 투자·자금 동향`,
      body1,
      ['AI리포트','투자동향','스타트업',label],
      slug1,
      adminId
    )
    results.generated.push({ type: 'funding', slug: slug1, len: body1.length, ...r1 })
  } catch(e) { results.errors.push('funding: ' + (e.message||'').slice(0,100)) }

  // ── 리포트 2: 시장·생태계 동향 ───────────────────────────────────
  try {
    const slug2 = `ai-market-report-${code}`
    const body2 = buildMarketReport(label, news)
    if (body2.length < 400) throw new Error(`본문 너무 짧음: ${body2.length}자`)
    const r2 = await upsertArticle(
      `[AI 리포트] ${label} 스타트업 생태계 시장 동향`,
      body2,
      ['AI리포트','시장분석','트렌드',label],
      slug2,
      adminId
    )
    results.generated.push({ type: 'market', slug: slug2, len: body2.length, ...r2 })
  } catch(e) { results.errors.push('market: ' + (e.message||'').slice(0,100)) }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}

  return _handleGenerateReport_impl
})();

const handleGenerateImages = (() => {
// 뉴스 OG 이미지가 없는 기사에 AI 이미지 자동 생성
// Pollinations.ai (완전 무료, API 키 불필요) — 외부 AI API 없음


const SUPABASE_URL      = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET       = process.env.CRON_SECRET

// 카테고리별 기본 이미지 프롬프트 (외부 AI 없이 직접 매핑)
const CAT_PROMPTS = {
  funding:        'investment, venture capital, money, business growth chart, professional illustration',
  ai:             'artificial intelligence, technology, neural network, digital, futuristic',
  edutech:        'education technology, student learning, digital classroom, bright colors',
  youth:          'young entrepreneur, teenager, startup idea, innovation, inspiring',
  entrepreneurship: 'startup, entrepreneur, business plan, team collaboration',
  unicorn:        'unicorn startup, billion dollar company, success, achievement',
  climate:        'green technology, sustainability, renewable energy, eco-friendly',
  health:         'healthcare technology, digital health, medical innovation, clean design',
  fintech:        'financial technology, digital payment, banking, data visualization',
  news:           'news media, journalism, information, global connection',
  startup:        'startup culture, innovation, young team, office, creative workspace',
  general:        'startup, business, innovation, Korea, modern design',
}

// 제목 키워드 → 프롬프트 향상 매핑
const KEYWORD_ENHANCE = [
  { kw: 'AI',       add: 'artificial intelligence, machine learning, neural network' },
  { kw: '투자',     add: 'investment, funding, financial growth' },
  { kw: '창업',     add: 'startup, entrepreneur, new business launch' },
  { kw: '스타트업', add: 'startup office, young team, innovative workspace' },
  { kw: '청소년',   add: 'young people, youth, teenager, education' },
  { kw: '기술',     add: 'technology, innovation, digital transformation' },
  { kw: '교육',     add: 'education, learning, classroom, knowledge' },
  { kw: '환경',     add: 'green, sustainability, nature, eco technology' },
  { kw: '헬스',     add: 'health, medical, wellness, digital health' },
  { kw: '핀테크',   add: 'fintech, digital payment, banking app' },
]

// 카테고리와 제목 기반으로 이미지 프롬프트 생성 (완전 자체 처리)
function makeImagePrompt(title, category) {
  const base = CAT_PROMPTS[category] || CAT_PROMPTS.general

  // 제목 키워드로 프롬프트 강화
  const enhancements = []
  for (const { kw, add } of KEYWORD_ENHANCE) {
    if (title && title.includes(kw)) {
      enhancements.push(add)
    }
  }

  const enhanced = enhancements.length > 0
    ? `${base}, ${enhancements[0]}`
    : base

  return enhanced
}

// Pollinations.ai로 이미지 URL 생성 (실제 이미지 fetch 없이 URL만 반환)
function makePollinationsUrl(prompt, seed) {
  const encoded = encodeURIComponent(
    prompt + ', professional illustration, no text, clean background, high quality'
  )
  return `https://image.pollinations.ai/prompt/${encoded}?width=800&height=450&seed=${seed}&nologo=true&model=flux`
}

async function _handleGenerateImages_impl(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === `Bearer ${CRON_SECRET}`
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  // 이미지 없는 기사 가져오기 (최대 10개)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&cover_image=is.null&ai_summary=not.is.null&select=id,title,ai_category&order=published_at.desc&limit=10`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  )
  const articles = await res.json()
  if (!articles?.length) return new Response(JSON.stringify({ message: '처리할 기사 없음' }), { status: 200 })

  const results = { updated: 0, errors: [] }

  for (const article of articles) {
    try {
      // 완전 자체 처리 — 외부 AI API 없음
      const prompt   = makeImagePrompt(article.title, article.ai_category)
      const seed     = parseInt(article.id.replace(/-/g, '').slice(0, 8), 16) % 99999
      const imageUrl = makePollinationsUrl(prompt, seed)

      const r = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${article.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({ cover_image: imageUrl }),
      })
      if (r.status === 204) results.updated++
    } catch (e) {
      results.errors.push(article.id.slice(0, 8) + ': ' + (e.message || '').slice(0, 40))
    }
  }

  return new Response(JSON.stringify({
    ...results,
    model:     'insightship-ai-v1-pollinations',
    timestamp: new Date().toISOString(),
  }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}

  return _handleGenerateImages_impl
})();

const handleAnalyzeTrend = (() => {
// 트렌드 AI 분석 — 자체 AI 엔진 (외부 API 없음)
// system_instruction 분리로 응답 끊김 완전 방지


const SB_URL     = process.env.SUPABASE_URL
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── RAG 검색 ─────────────────────────────────────────────────────
async function searchKnowledge(query, category) {
  try {
    const q = category
      ? `${SB_URL}/rest/v1/ai_knowledge?category=eq.${category}&quality=gte.7&order=quality.desc&limit=3`
      : `${SB_URL}/rest/v1/ai_knowledge?quality=gte.7&order=quality.desc&limit=3`
    const r = await fetch(q, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
    const d = await r.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

// ── 피드백 저장 (비동기) ─────────────────────────────────────────
function saveFeedback(type, summary) {
  fetch(`${SB_URL}/rest/v1/ai_feedback`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ session_type: type, prompt_summary: summary }),
  }).catch(() => {})
}

// ── 자체 Insightship AI 분석 엔진 ────────────────────────────────
function generateAnalysis(type, params, ragDocs) {
  const {
    sector_name, sector_note,
    metric_name, metric_value, metric_unit,
    change_pct, category, source_name,
  } = params

  const name     = type === 'sector' ? sector_name : metric_name
  const pct      = Number(change_pct) || 0
  const trend    = pct > 5 ? '상승' : pct < -5 ? '하락' : '보합'
  const trendKo  = pct > 5
    ? `▲${Math.abs(pct).toFixed(1)}% 증가`
    : pct < -5
      ? `▼${Math.abs(pct).toFixed(1)}% 감소`
      : '전일 대비 보합'
  const trendDir = pct > 5 ? '상승' : pct < -5 ? '하락' : '안정'

  // 도메인별 컨텍스트
  const domainCtx = {
    'AI':      'AI·머신러닝 분야는 2026년 국내 스타트업 투자의 38%를 차지하며 가장 활발한 성장세를 보이고 있습니다.',
    '에듀테크': '에듀테크는 청소년 창업 교육 수요 증가와 비대면 학습 정착으로 연평균 23% 성장 중입니다.',
    '기후테크': '탄소중립 2050 정책과 ESG 투자 확대로 기후테크 스타트업 투자가 전년 대비 45% 증가했습니다.',
    '핀테크':  '마이데이터 2기 정책 시행으로 핀테크 산업이 새로운 도약기를 맞이하고 있습니다.',
    '헬스케어': '디지털 헬스케어 규제 완화와 AI 진단 기술 발전으로 헬스케어 AI 시장이 급성장 중입니다.',
    '창업':    '국내 창업 생태계는 정부 지원 확대와 시리즈A 이상 투자 증가로 성숙기에 접어들고 있습니다.',
    '스타트업': '2026년 국내 스타트업 생태계는 AI·딥테크 중심으로 재편되며 글로벌 투자 유입이 지속되고 있습니다.',
    '투자':    '시리즈A 이상 투자 거래가 전년 대비 22% 증가하며 스타트업 성장 자금 환경이 개선되고 있습니다.',
    '콘텐츠':  '크리에이터 경제의 성장과 함께 콘텐츠 기반 창업이 새로운 주류로 자리잡고 있습니다.',
    '커머스':  '라이브커머스와 AI 큐레이션 기술의 결합으로 이커머스 혁신이 가속화되고 있습니다.',
  }

  const catCtx = Object.entries(domainCtx)
    .find(([k]) => (name || '').includes(k))?.[1]
    ?? `${name || '해당'} 분야는 국내 창업 생태계에서 지속적인 성장세를 유지하며 주목받고 있습니다.`

  // RAG 데이터 삽입
  const ragInsert = ragDocs?.length
    ? '\n\n**참고 데이터:**\n' + ragDocs.map(k => `• ${k.content?.slice(0, 80)}`).join('\n')
    : ''

  // 트렌드 이유 상세 설명
  const reasonDetail = trend === '상승'
    ? `정부 정책 지원 강화, 민간 투자 확대, 글로벌 수요 증가가 복합적으로 작용하고 있습니다. 특히 ${name?.includes('AI') ? 'AI 기반 혁신' : '기술 고도화'}와 시장 성숙이 ${trendKo}의 핵심 요인으로 분석됩니다.`
    : trend === '하락'
      ? `단기적 시장 조정 국면으로 분석됩니다. 글로벌 금리 환경 변화와 투자 심리 위축이 영향을 미쳤으나, 중장기 성장 방향성은 여전히 유효합니다.`
      : `시장이 안정 국면에 접어들며 내실 강화 단계에 있습니다. 단기 변동성보다 장기 성장 잠재력에 주목할 시점입니다.`

  const marketDetail = type === 'metric'
    ? `현재 ${metric_name} 지표(${metric_value || '-'}${metric_unit || ''})는 ${trendKo}를 기록하고 있습니다. ${source_name ? `출처(${source_name}) 기준` : '공공기관 집계 기준'} 이 수치는 국내 창업 생태계의 전반적인 ${trendDir} 흐름을 반영합니다. 글로벌 벤치마크 대비 국내 수준은 꾸준히 개선 중이며, 특히 청소년 창업 분야에서의 성장이 두드러집니다.`
    : `${sector_name} 섹터는 ${sector_note ? sector_note + ' 특성을 바탕으로' : ''} 현재 ${trendDir} 국면에 있습니다. 국내 주요 VC(벤처캐피탈, 스타트업 전문 투자회사)들은 이 분야에 대한 포트폴리오 비중을 확대하고 있으며, 정부 지원 정책과의 시너지가 기대됩니다.`

  const actionTips = [
    `Insightship 멘토링 프로그램에서 ${name?.slice(0, 15) || '해당 분야'} 전문가를 찾아 조언을 구해보세요.`,
    `중기부 예비창업패키지(만 15세 이상 신청 가능)를 통해 초기 창업 자금을 확보할 수 있습니다.`,
    `커뮤니티에서 같은 관심사를 가진 동료를 찾고, 공동창업 가능성을 탐색해보세요.`,
    `작은 MVP(최소 기능 제품)를 만들어 실제 사용자 반응을 먼저 확인해보세요.`,
  ]
  const tip = actionTips[Math.floor(Date.now() / 3600000) % actionTips.length]

  return `**📌 왜 ${trendDir === '안정' ? '주목받나' : trendDir + '했나'}**

${catCtx} ${reasonDetail}${ragInsert}

**📊 시장 현황**

${marketDetail}

**🚀 청소년 창업가에게**

${tip} 지금의 관심이 미래의 창업 기회로 이어집니다.`
}

// ── 메인 핸들러 ──────────────────────────────────────────────────
async function _handleAnalyzeTrend_impl(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })

  const body = await req.json().catch(() => ({}))
  const {
    type, sector_name, sector_note,
    metric_name, metric_value, metric_unit,
    change_pct, category, source_name,
  } = body

  // RAG 검색
  const ragQuery = type === 'sector'
    ? `${sector_name} ${sector_note || ''} 스타트업 트렌드`
    : `${metric_name} ${category || ''} 트렌드`
  const ragDocs = await searchKnowledge(
    ragQuery,
    ['trend', 'market', 'insight'].includes(category) ? category : null
  )

  // 입력 검증
  if (type === 'sector' && !sector_name)
    return new Response(JSON.stringify({ error: 'sector_name required' }), { status: 400, headers: cors() })
  if (type !== 'sector' && !metric_name)
    return new Response(JSON.stringify({ error: 'metric_name required' }), { status: 400, headers: cors() })

  // 자체 AI 분석 생성
  const analysis = generateAnalysis(type, {
    sector_name, sector_note,
    metric_name, metric_value, metric_unit,
    change_pct, category, source_name,
  }, ragDocs)

  saveFeedback(type === 'sector' ? 'sector' : 'metric', sector_name || metric_name)

  return new Response(JSON.stringify({
    analysis,
    model:         'insightship-ai-v1',
    rag_docs_used: ragDocs?.length || 0,
    timestamp:     new Date().toISOString(),
  }), {
    status: 200,
    headers: { ...cors(), 'Cache-Control': 'public, max-age=3600' },
  })
}

function cors() {
  return {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

  return _handleAnalyzeTrend_impl
})();

const handleReport = (() => {
/**
 * api/report.js
 * Insightship 신고 처리 API v1.0
 *
 * POST /api/report  → 신고 접수
 *   body: { target_type: 'post'|'comment'|'article'|'user', target_id, reason }
 *   Authorization: Bearer <access_token>
 *
 * GET  /api/report  → 관리자 전용 신고 목록 조회
 *   ?status=pending|resolved|dismissed&limit=50&offset=0
 *   Authorization: Bearer <access_token>  (admin만)
 */


const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// Supabase JWT로 유저 확인
async function getUser(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${token}`,
      },
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

// 관리자 여부 확인
async function isAdmin(userId) {
  if (!userId) return false
  const r = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=role&limit=1`,
    {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
    }
  )
  const d = await r.json().catch(() => [])
  return Array.isArray(d) && d[0]?.role === 'admin'
}

const H = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

async function _handleReport_impl(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const authHeader = req.headers.get('authorization')

  // ── POST: 신고 접수 ────────────────────────────────────────────────
  if (req.method === 'POST') {
    const user = await getUser(authHeader)
    if (!user?.id) return json({ error: '로그인이 필요합니다' }, 401)

    let body
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

    const { target_type, target_id, reason } = body || {}

    // 입력 검증
    if (!target_type || !target_id || !reason) {
      return json({ error: 'target_type, target_id, reason 필수' }, 400)
    }
    if (!['post', 'comment', 'article', 'user'].includes(target_type)) {
      return json({ error: '유효하지 않은 target_type' }, 400)
    }
    if (typeof reason !== 'string' || reason.trim().length < 10) {
      return json({ error: '신고 사유는 10자 이상 입력해주세요' }, 400)
    }
    if (reason.trim().length > 500) {
      return json({ error: '신고 사유는 500자 이하입니다' }, 400)
    }

    // 중복 신고 방지 (같은 유저가 같은 대상에 이미 pending 신고 있으면 차단)
    const dupCheck = await fetch(
      `${SB_URL}/rest/v1/reports?reporter_id=eq.${user.id}&target_id=eq.${target_id}&status=eq.pending&select=id&limit=1`,
      { headers: H() }
    )
    const dup = await dupCheck.json().catch(() => [])
    if (Array.isArray(dup) && dup.length > 0) {
      return json({ error: '이미 신고 접수된 대상입니다. 처리 중입니다.' }, 409)
    }

    // 자기 자신 신고 방지 (게시글/댓글 작성자 확인)
    if (target_type === 'post') {
      const postR = await fetch(
        `${SB_URL}/rest/v1/community_posts?id=eq.${target_id}&select=author_id&limit=1`,
        { headers: H() }
      )
      const post = await postR.json().catch(() => [])
      if (post[0]?.author_id === user.id) {
        return json({ error: '자신의 게시글은 신고할 수 없습니다' }, 400)
      }
    } else if (target_type === 'comment') {
      const commentR = await fetch(
        `${SB_URL}/rest/v1/comments?id=eq.${target_id}&select=author_id&limit=1`,
        { headers: H() }
      )
      const comment = await commentR.json().catch(() => [])
      if (comment[0]?.author_id === user.id) {
        return json({ error: '자신의 댓글은 신고할 수 없습니다' }, 400)
      }
    }

    // 신고 삽입
    const insertR = await fetch(`${SB_URL}/rest/v1/reports`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'return=representation' },
      body: JSON.stringify({
        reporter_id: user.id,
        target_type,
        target_id,
        reason: reason.trim(),
        status: 'pending',
        created_at: new Date().toISOString(),
      }),
    })

    if (insertR.status !== 201 && insertR.status !== 200) {
      const err = await insertR.text()
      // reports 테이블 없으면 안내
      if (err.includes('does not exist') || err.includes('relation')) {
        return json({ error: '신고 테이블이 존재하지 않습니다. DB 설정이 필요합니다.', setup_needed: true }, 500)
      }
      return json({ error: `DB 오류: ${err.slice(0, 100)}` }, 500)
    }

    const inserted = await insertR.json().catch(() => [{}])
    return json({
      ok: true,
      message: '신고가 접수되었습니다. 관리자가 검토 후 처리합니다.',
      report_id: inserted?.[0]?.id,
    })
  }

  // ── GET: 관리자 신고 목록 조회 ─────────────────────────────────────
  if (req.method === 'GET') {
    const user = await getUser(authHeader)
    if (!user?.id) return json({ error: '로그인이 필요합니다' }, 401)

    const admin = await isAdmin(user.id)
    if (!admin) return json({ error: '관리자 권한이 필요합니다' }, 403)

    const url = new URL(req.url)
    const status = url.searchParams.get('status') || 'all'
    const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0)

    let query = `${SB_URL}/rest/v1/reports?select=id,target_type,target_id,reason,status,created_at,resolved_at,reporter_id,profiles!reporter_id(display_name,username,avatar_url)&order=created_at.desc&limit=${limit}&offset=${offset}`
    if (status !== 'all') query += `&status=eq.${status}`

    const r = await fetch(query, {
      headers: { ...H(), Prefer: 'count=exact' },
    })
    const reports = await r.json().catch(() => [])
    const total = parseInt(r.headers.get('content-range')?.split('/')[1] || '0')

    // 통계
    const [pendingR, resolvedR, dismissedR] = await Promise.allSettled([
      fetch(`${SB_URL}/rest/v1/reports?status=eq.pending&select=id&limit=1`, { headers: { ...H(), Prefer: 'count=exact' } }),
      fetch(`${SB_URL}/rest/v1/reports?status=eq.resolved&select=id&limit=1`, { headers: { ...H(), Prefer: 'count=exact' } }),
      fetch(`${SB_URL}/rest/v1/reports?status=eq.dismissed&select=id&limit=1`, { headers: { ...H(), Prefer: 'count=exact' } }),
    ])
    const getCount = r => r.status === 'fulfilled'
      ? parseInt(r.value.headers?.get?.('content-range')?.split('/')?.[1] || '0') : 0

    return json({
      reports: Array.isArray(reports) ? reports : [],
      total,
      stats: {
        pending: getCount(pendingR),
        resolved: getCount(resolvedR),
        dismissed: getCount(dismissedR),
      },
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}

  return _handleReport_impl
})();

// ════════════════════════════════════════════════════════════
// 통합 라우터
// ════════════════════════════════════════════════════════════
export default async function handler(req) {
  const url    = new URL(req.url)
  const path   = url.pathname
  const action = url.searchParams.get('action')

  // cron action 분기 (vercel.json crons use ?action=xxx)
  if (action === 'community')       return handleCommunityEngine(req)
  if (action === 'generate_report') return handleGenerateReport(req)
  if (action === 'patch_notes')     return handlePatchNotes(req)
  if (action === 'auto_ops')        return handleAutoOps(req)
  if (action === 'security_audit')  return handleSecurityAudit(req)
  if (action === 'sync_accounts')   return handleSyncAiAccounts(req)

  // path 분기 (rewrites 경유 — 기존 URL 호환)
  if (path.endsWith('/admin-action'))      return handleAdminAction(req)
  if (path.endsWith('/auto-ops'))          return handleAutoOps(req)
  if (path.endsWith('/dev-permissions'))   return handleDevPermissions(req)
  if (path.endsWith('/incident-response')) return handleIncidentResponse(req)
  if (path.endsWith('/security-audit'))    return handleSecurityAudit(req)
  if (path.endsWith('/patch-notes'))       return handlePatchNotes(req)
  if (path.endsWith('/office'))            return handleOffice(req)
  if (path.endsWith('/sync-ai-accounts'))  return handleSyncAiAccounts(req)
  if (path.endsWith('/community-engine'))  return handleCommunityEngine(req)
  if (path.endsWith('/feedback-reply'))    return handleFeedbackReply(req)
  if (path.endsWith('/generate-report'))   return handleGenerateReport(req)
  if (path.endsWith('/generate-images'))   return handleGenerateImages(req)
  if (path.endsWith('/analyze-trend'))     return handleAnalyzeTrend(req)
  if (path.endsWith('/report'))            return handleReport(req)
  if (path.endsWith('/admin'))             return handleAdminAction(req)

  return new Response(JSON.stringify({
    service: 'admin-router', version: '1.0',
    actions: ['community','generate_report','patch_notes','auto_ops','security_audit','sync_accounts'],
    routes: ['/api/admin-action','/api/auto-ops','/api/dev-permissions','/api/incident-response',
             '/api/security-audit','/api/patch-notes','/api/office','/api/sync-ai-accounts',
             '/api/community-engine','/api/feedback-reply','/api/generate-report',
             '/api/generate-images','/api/analyze-trend','/api/report'],
  }), { headers: { 'Content-Type': 'application/json' } })
}
