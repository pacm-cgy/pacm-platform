/**
 * api/ai-workers.js
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP AI 직원 상시 근무 엔진 v2.0                            ║
 * ║                                                                      ║
 * ║  "진짜 사람처럼 항상 근무" — 스케줄 기반이 아닌 연속 활동           ║
 * ║                                                                      ║
 * ║  v2 개선:                                                            ║
 * ║  - 12가지 액션 유형 (v1: 9가지)                                      ║
 * ║  - 시간대별 자연스러운 활동 패턴 (야간 조용, 주간 활발)              ║
 * ║  - 팀 협업 활동 (팀원끼리 댓글 주고받기)                             ║
 * ║  - PR/홍보 자동 포스팅 (관리팀)                                      ║
 * ║  - 뉴스레터 예고 포스팅 (뉴스레터팀)                                 ║
 * ║  - 직원 간 좋아요/응원 상호작용                                      ║
 * ║  - work_logs 기록 (admin 패널용)                                     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */



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
// 시간대별 활동 레벨 (한국 시간 기준)
// ══════════════════════════════════════════════════════════════════════

function getActivityLevel() {
  const kstHour = (new Date().getUTCHours() + 9) % 24
  if (kstHour >= 0 && kstHour < 6)  return 'night'   // 00~06시: 조용한 야간
  if (kstHour >= 6 && kstHour < 9)  return 'morning' // 06~09시: 아침 준비
  if (kstHour >= 9 && kstHour < 18) return 'peak'    // 09~18시: 활발한 업무
  if (kstHour >= 18 && kstHour < 22) return 'evening' // 18~22시: 저녁 활동
  return 'late'                                        // 22~00시: 늦은 밤
}

// 시간대별 워커 수 (night에는 적게, peak에는 많게)
function getWorkersCount(level) {
  return { night: 2, morning: 4, peak: 10, evening: 8, late: 5 }[level] || 6
}

// ══════════════════════════════════════════════════════════════════════
// 자체 AI 엔진 — 외부 API 없음
// ══════════════════════════════════════════════════════════════════════

import { generateCommunityPost, generateReport, generateChat } from './ai-engine.js'
import {
  getActivityLevel    as brainGetActivityLevel,
  getActiveWorkerCount,
  isWorkerActive,
  getPersona          as brainGetPersona,
  pickChatMessage,
  generateConversationStarter,
  generateReactionToAdmin,
  generateDiscussionMessage,
  generateWeeklyDiscussion,
  generateMentoringTip,
  generateInsightArticle,
} from './staff-brain.js'


// ══════════════════════════════════════════════════════════════════════
// Supabase 헬퍼
// ══════════════════════════════════════════════════════════════════════

async function sbGet(path) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H() })
    return r.json().catch(() => [])
  } catch { return [] }
}

async function sbPost(path, body) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method: 'POST', headers: { ...H(), Prefer: 'return=representation' },
      body: JSON.stringify(body),
    })
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) }
  } catch(e) { return { ok: false, error: e.message } }
}

async function sbPatch(path, body) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method: 'PATCH', headers: { ...H(), Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    })
    return { ok: r.ok, status: r.status }
  } catch(e) { return { ok: false, error: e.message } }
}

async function getProfileId(username) {
  const data = await sbGet(`profiles?username=eq.${username}&select=id&limit=1`)
  return Array.isArray(data) && data[0] ? data[0].id : null
}

// ══════════════════════════════════════════════════════════════════════
// 직원 데이터 로더
// ══════════════════════════════════════════════════════════════════════

let _cachedTeam = null
async function getAITeam() {
  if (_cachedTeam) return _cachedTeam
  try {
    const { AI_TEAM } = await import('./ai-team.js')
    _cachedTeam = AI_TEAM
    return AI_TEAM
  } catch { return {} }
}

async function getMemberData(key) {
  const team = await getAITeam()
  const base = team[key]
  if (!base) return {
    key, username: `ai_${key.toLowerCase()}`,
    display_name: key.split('_').pop() || key,
    title: '매니저', team: 'platform',
    bio: `Insightship 플랫폼 직원 ${key}`,
    persona: { speech_style: '친근하고 전문적', catchphrases: [] },
  }
  return { ...base, username: base.account?.username || `ai_${key.toLowerCase()}` }
}

// ══════════════════════════════════════════════════════════════════════
// 액션 1: 커뮤니티 게시글 작성
// ══════════════════════════════════════════════════════════════════════

async function actionWriteCommunityPost(member) {
  const authorId = await getProfileId(member.username)
  if (!authorId) return { skip: 'no_profile' }

  const topicsByTeam = {
    operations:  ['플랫폼 이번 주 업데이트 소식', '멤버 온보딩 팁', '공지: 이번 주 운영 일정', '플랫폼 사용 가이드'],
    content:     ['스타트업 창업 인사이트', '이번 주 에디터 추천 아티클', '창업 생태계 분석', '글로벌 스타트업 트렌드'],
    mentoring:   ['창업 아이디어 검증 방법', '투자 유치 준비하기', '린 캔버스 작성법', 'MVP 빠르게 만드는 법'],
    news:        ['오늘의 스타트업 뉴스 픽', '이번 주 투자 소식', '해외 스타트업 동향', '정책 변화와 창업 기회'],
    analytics:   ['이번 주 시장 트렌드 분석', '키워드 급상승 리포트', 'VC 투자 동향', '스타트업 생존율 데이터'],
    report:      ['주간 생태계 리포트 발행', '투자 라운드 분석', 'M&A 동향 정리', 'ESG 트렌드'],
    newsletter:  ['이번 주 뉴스레터 하이라이트', '구독자 성장 이야기', '뉴스레터 콘텐츠 미리보기'],
    tech:        ['플랫폼 성능 개선 소식', 'AI 시스템 업데이트', '보안 강화 완료', 'UX 개선 사항'],
    community:   ['이번 주 커뮤니티 하이라이트', '네트워킹 이벤트 안내', '주간 토론 주제 공개', '우수 멤버 소개'],
    management:  ['플랫폼 경영 방향 공유', '파트너십 소식', 'PR 및 브랜드 소식', 'CSR 활동 보고'],
  }

  const topics = topicsByTeam[member.team] || ['스타트업 인사이트 공유']
  const topic = topics[Math.floor(Math.random() * topics.length)]
  const cp = member.persona?.catchphrases?.[Math.floor(Math.random() * (member.persona?.catchphrases?.length||1))] || ''

  const prompt = `당신은 Insightship 플랫폼의 ${member.title} ${member.display_name}입니다.
팀: ${member.team}
역할: ${member.bio?.slice(0,100)}
말투: ${member.persona?.speech_style || '친근하고 전문적'}
${cp ? `자주 쓰는 표현: "${cp}"` : ''}

주제: "${topic}"에 대해 커뮤니티 게시글을 작성하세요.
- 실제 직원처럼 자연스럽게 작성
- 120~220자 분량
- 이모지 1~2개 자연스럽게 포함
- 마지막에 커뮤니티 참여 유도 문장
- 절대 금지: AI, 인공지능, 봇, 언어모델, ChatGPT

게시글 내용만 출력 (제목 없이):`.trim()

  // 자체 AI 엔진으로 커뮤니티 게시글 생성
  const body = generateCommunityPost(member.username, topic)
  if (!body) return { skip: 'ai_failed' }

  const postTypes = { operations:'notice', content:'discussion', mentoring:'tips', news:'news',
    analytics:'analysis', report:'analysis', newsletter:'notice', tech:'notice',
    community:'discussion', management:'notice' }
  const postType = postTypes[member.team] || 'discussion'

  const res = await sbPost('community_posts', {
    title: topic, body, content: body,
    post_type: postType, author_id: authorId,
    is_pinned: false, is_deleted: false,
    tags: [member.team, '직원포스트', member.display_name],
    created_at: new Date().toISOString(),
  })

  await logWork(member.username, member.display_name, member.team, member.title, 'community_post', topic)
  return { action: 'community_post', topic, ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// 액션 2: 커뮤니티 댓글
// ══════════════════════════════════════════════════════════════════════

async function actionWriteComment(member) {
  const authorId = await getProfileId(member.username)
  if (!authorId) return { skip: 'no_profile' }

  const posts = await sbGet(
    `community_posts?is_deleted=eq.false&select=id,title,body,reply_count&order=created_at.desc&limit=15`
  )
  if (!Array.isArray(posts) || posts.length === 0) return { skip: 'no_posts' }

  const post = posts[Math.floor(Math.random() * Math.min(posts.length, 8))]
  if (!post?.id) return { skip: 'invalid_post' }

  const prompt = `당신은 Insightship 플랫폼의 ${member.title} ${member.display_name}입니다.
역할: ${member.bio?.slice(0,80)}
말투: ${member.persona?.speech_style || '친근하고 전문적'}

다음 게시글에 자연스러운 댓글을 달아주세요:
제목: "${post.title}"
내용: "${(post.body || '').slice(0, 180)}"

댓글 조건:
- 40~100자
- 자연스럽고 진심 있는 반응
- 전문적 의견 또는 공감
- AI 관련 표현 절대 금지

댓글 내용만 출력:`.trim()

  // 자체 AI 엔진으로 댓글 생성
  const content = generateChat(member.username, post.title, 'general', [])
  if (!content) return { skip: 'ai_failed' }

  const res = await sbPost('comments', {
    post_id: post.id, author_id: authorId,
    content, created_at: new Date().toISOString(),
  })

  if (res.ok) {
    await sbPatch(`community_posts?id=eq.${post.id}`, {
      reply_count: (post.reply_count || 0) + 1,
    })
  }

  await logWork(member.username, member.display_name, member.team, member.title, 'comment', post.title)
  return { action: 'comment', post_title: post.title, ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// 액션 3: 좋아요
// ══════════════════════════════════════════════════════════════════════

async function actionLikePost(member) {
  const posts = await sbGet(
    `community_posts?is_deleted=eq.false&select=id,like_count&order=created_at.desc&limit=20`
  )
  if (!Array.isArray(posts) || posts.length === 0) return { skip: 'no_posts' }

  const post = posts[Math.floor(Math.random() * posts.length)]
  if (!post?.id) return { skip: 'invalid_post' }

  await sbPatch(`community_posts?id=eq.${post.id}`, {
    like_count: (post.like_count || 0) + 1,
  })

  return { action: 'like', post_id: post.id }
}

// ══════════════════════════════════════════════════════════════════════
// 액션 4: 인사이트 아티클 작성 (콘텐츠팀, 리포트팀)
// ══════════════════════════════════════════════════════════════════════

async function actionWriteInsightArticle(member) {
  const authorId = await getProfileId(member.username)
  if (!authorId) return { skip: 'no_profile' }

  const news = await sbGet(
    `articles?not.source_name=is.null&status=eq.published&select=title,ai_summary&order=published_at.desc&limit=5`
  )
  const newsRef = Array.isArray(news) && news.length > 0
    ? `참고 뉴스:\n${news.slice(0, 3).map(n => `- ${n.title}`).join('\n')}`
    : ''

  const titles = [
    '2025년 스타트업 생태계 핵심 트렌드 분석',
    '청소년 창업가가 반드시 알아야 할 5가지',
    'AI 시대 창업의 기회와 도전',
    '글로벌 VC 시장 동향과 한국 스타트업 전략',
    '제품-시장 적합성(PMF) 찾는 실전 가이드',
    '스타트업 팀 빌딩의 모든 것',
    '창업 초기 자금 조달 전략 A to Z',
    '소셜 임팩트 스타트업의 부상',
    '딥테크 스타트업 투자 트렌드',
    '사용자 인터뷰로 아이디어 검증하기',
  ]
  const title = titles[Math.floor(Math.random() * titles.length)]

  const prompt = `당신은 Insightship 플랫폼의 ${member.title} ${member.display_name}입니다.
역할: ${member.bio?.slice(0,100)}
${newsRef}

다음 주제로 스타트업 인사이트 아티클을 작성해주세요: "${title}"

조건:
- 700~1100자 분량
- 실제 데이터와 사례 포함 (가상이어도 됨)
- 청소년 창업가 눈높이
- 마크다운 형식 (##, **강조**, - 리스트)
- 실용적인 조언과 다음 행동 제시
- AI 작성 언급 절대 금지

아티클 본문만 출력:`.trim()

  // 자체 AI 엔진으로 아티클 생성
  const body = generateReport(member.username, {}, 'faq')
  if (!body) return { skip: 'ai_failed' }

  const slug = `insight-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const res = await sbPost('articles', {
    title, slug, body,
    excerpt: body.slice(0, 200).replace(/[#*\n]/g, ' ').trim(),
    category: 'insight', author_id: authorId,
    status: 'published',
    published_at: new Date().toISOString(),
    read_time: Math.ceil(body.length / 500),
  })

  await logWork(member.username, member.display_name, member.team, member.title, 'insight_article', title)
  return { action: 'insight_article', title, ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// 액션 5: 트렌드 분석 포스트
// ══════════════════════════════════════════════════════════════════════

async function actionWriteTrendAnalysis(member) {
  const authorId = await getProfileId(member.username)
  if (!authorId) return { skip: 'no_profile' }

  const news = await sbGet(
    `articles?not.source_name=is.null&status=eq.published&select=title,category,ai_summary&order=published_at.desc&limit=10`
  )
  const newsList = Array.isArray(news) ? news.slice(0, 5) : []

  const prompt = `당신은 Insightship 분석팀 ${member.title} ${member.display_name}입니다.
역할: ${member.bio?.slice(0,80)}

최근 뉴스를 바탕으로 스타트업 시장 트렌드 분석 게시글을 작성하세요.
참고 뉴스:
${newsList.map(n => `- [${n.category}] ${n.title}`).join('\n') || '- 최신 스타트업 생태계 동향'}

작성 조건:
- 180~320자
- 구체적 트렌드 3개 이상 언급
- 데이터/숫자 포함 (가상 가능)
- 분석적이고 통찰력 있는 톤
- AI 언급 금지

트렌드 분석 내용만 출력:`.trim()

  // 자체 AI 엔진으로 트렌드 분석 생성
  const content = generateReport(member.username, {}, 'growth')
  if (!content) return { skip: 'ai_failed' }

  const dateStr = new Date().toLocaleDateString('ko-KR')
  const res = await sbPost('community_posts', {
    title: `📊 이번 주 스타트업 트렌드 분석 — ${dateStr}`,
    body: content, content,
    post_type: 'analysis', author_id: authorId,
    is_pinned: false, is_deleted: false,
    tags: ['트렌드분석', '시장동향', member.team],
    created_at: new Date().toISOString(),
  })

  await logWork(member.username, member.display_name, member.team, member.title, 'trend_analysis', '시장 트렌드 분석')
  return { action: 'trend_analysis', ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// 액션 6: 신고 처리 (관리팀)
// ══════════════════════════════════════════════════════════════════════

async function actionReviewReports(member) {
  const reports = await sbGet(
    `reports?status=eq.pending&select=id,reason,target_type,target_id&order=created_at.asc&limit=3`
  )
  if (!Array.isArray(reports) || reports.length === 0) return { skip: 'no_pending_reports' }

  const processed = []
  for (const report of reports) {
    const isObvious = report.reason && (
      report.reason.includes('스팸') || report.reason.includes('광고') ||
      report.reason.includes('욕설') || report.reason.includes('혐오') ||
      report.reason.includes('spam') || report.reason.includes('abuse')
    )
    if (isObvious) {
      await sbPatch(`reports?id=eq.${report.id}`, {
        status: 'resolved', resolved_at: new Date().toISOString(),
      })
      processed.push({ id: report.id, action: 'auto_resolved' })
    }
  }

  await logWork(member.username, member.display_name, member.team, member.title, 'review_reports', `${processed.length}건 자동처리`)
  return { action: 'review_reports', processed: processed.length, total: reports.length }
}

// ══════════════════════════════════════════════════════════════════════
// 액션 7: 신규 멤버 환영 (운영팀, 커뮤니티팀)
// ══════════════════════════════════════════════════════════════════════

async function actionWelcomeNewMembers(member) {
  const authorId = await getProfileId(member.username)
  if (!authorId) return { skip: 'no_profile' }

  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  const newUsers = await sbGet(
    `profiles?created_at=gte.${since}&select=display_name,username&order=created_at.desc&limit=5&is_verified=eq.false`
  )
  if (!Array.isArray(newUsers) || newUsers.length === 0) return { skip: 'no_new_users' }

  const names = newUsers.map(u => u.display_name || u.username).filter(Boolean)

  const prompt = `당신은 Insightship 플랫폼 ${member.title} ${member.display_name}입니다.
최근 가입한 멤버들: ${names.slice(0,3).join(', ')}

이 분들을 환영하는 따뜻하고 자연스러운 커뮤니티 게시글을 작성해주세요.
- 80~160자
- 이름 언급
- 플랫폼 소개 한 줄
- 참여 유도

게시글만 출력:`.trim()

  // 자체 AI 엔진으로 환영 메시지 생성
  const body = generateReport(member.username, {}, 'event')
  if (!body) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: `🎉 새로운 멤버를 환영합니다!`,
    body, content: body,
    post_type: 'notice', author_id: authorId,
    is_pinned: false, is_deleted: false,
    tags: ['환영', '신규멤버'],
    created_at: new Date().toISOString(),
  })

  await logWork(member.username, member.display_name, member.team, member.title, 'welcome_post', `${names.length}명 환영`)
  return { action: 'welcome_post', new_users: names.length, ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// 액션 8: 전략 브리핑 (관리팀)
// ══════════════════════════════════════════════════════════════════════

async function actionStrategyBriefing(member) {
  const authorId = await getProfileId(member.username)
  if (!authorId) return { skip: 'no_profile' }

  const prompt = `당신은 Insightship ${member.title} ${member.display_name}입니다.
역할: ${member.bio?.slice(0,100)}

플랫폼 이번 주 운영 방향에 대한 짧은 내부 브리핑을 커뮤니티에 공유하세요.
- 140~240자
- 공식적이지만 친근한 톤
- 이번 주 주요 초점 2~3개
- 팀원들에 대한 격려
- 자연스러운 리더 어조

내용만 출력:`.trim()

  // 자체 AI 엔진으로 전략 브리핑 생성
  const content = generateReport(member.username, {}, 'pr')
  if (!content) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: `🏛️ 이번 주 운영 방향 — ${new Date().toLocaleDateString('ko-KR')}`,
    body: content, content,
    post_type: 'notice', author_id: authorId,
    is_pinned: false, is_deleted: false,
    tags: ['경영', '전략', '운영'],
    created_at: new Date().toISOString(),
  })

  await logWork(member.username, member.display_name, member.team, member.title, 'strategy_briefing', '경영 전략 공유')
  return { action: 'strategy_briefing', ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// 액션 9: 멘토링 팁 공유 (멘토링팀)
// ══════════════════════════════════════════════════════════════════════

async function actionShareMentoringTip(member) {
  const authorId = await getProfileId(member.username)
  if (!authorId) return { skip: 'no_profile' }

  const tips = [
    '아이디어 검증의 3단계', '고객 인터뷰 잘 하는 법',
    'MVP를 2주 안에 만드는 방법', '투자자가 싫어하는 피치덱',
    '공동창업자 찾을 때 확인할 것들', '첫 100명 고객 확보 전략',
    '린 캔버스 작성 시 가장 많이 틀리는 부분',
    '스타트업 초기 법인 설립 시 체크리스트',
    '해외 진출 준비의 첫 번째 단계',
    'PMF 달성 신호를 어떻게 알아보나요',
  ]
  const tip = tips[Math.floor(Math.random() * tips.length)]

  const prompt = `당신은 Insightship 멘토링팀 ${member.title} ${member.display_name}입니다.
역할: ${member.bio?.slice(0,80)}

"${tip}" 주제로 창업 멘토링 팁을 공유하는 게시글을 작성하세요.
- 180~280자
- 실용적이고 바로 적용 가능한 조언
- 따뜻하고 격려하는 톤
- 질문 유도로 마무리

내용만 출력:`.trim()

  // 자체 AI 엔진으로 멘토링 팁 생성
  const body = generateReport(member.username, {}, 'faq')
  if (!body) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: `💡 멘토링 팁: ${tip}`,
    body, content: body,
    post_type: 'tips', author_id: authorId,
    is_pinned: false, is_deleted: false,
    tags: ['멘토링', '창업팁', member.team],
    created_at: new Date().toISOString(),
  })

  await logWork(member.username, member.display_name, member.team, member.title, 'mentoring_tip', tip)
  return { action: 'mentoring_tip', tip, ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// 액션 10: PR / 홍보 포스팅 (관리팀 PR담당)
// ══════════════════════════════════════════════════════════════════════

async function actionPRPost(member) {
  const authorId = await getProfileId(member.username)
  if (!authorId) return { skip: 'no_profile' }

  const prTopics = [
    'Insightship 플랫폼 소개 — 청소년 창업가를 위한 공간',
    '파트너십 모집 안내 — 함께 성장할 파트너를 찾습니다',
    '미디어 커버리지 소식 공유',
    'Insightship 커뮤니티 성장 이야기',
    '플랫폼 브랜드 가치: 신뢰, 성장, 연결',
  ]
  const topic = prTopics[Math.floor(Math.random() * prTopics.length)]

  const prompt = `당신은 Insightship 관리팀 PR매니저 ${member.display_name}입니다.
역할: ${member.bio?.slice(0,80)}

"${topic}" 주제로 플랫폼 홍보 게시글을 작성하세요.
- 150~250자
- 밝고 자신감 있는 톤
- 플랫폼의 가치 강조
- 공유 유도

내용만 출력:`.trim()

  // 자체 AI 엔진으로 PR 게시글 생성
  const body = generateReport(member.username, {}, 'pr')
  if (!body) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: topic, body, content: body,
    post_type: 'notice', author_id: authorId,
    is_pinned: false, is_deleted: false,
    tags: ['PR', '홍보', '브랜드'],
    created_at: new Date().toISOString(),
  })

  await logWork(member.username, member.display_name, member.team, member.title, 'pr_post', topic)
  return { action: 'pr_post', topic, ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// 액션 11: 뉴스레터 예고 포스팅 (뉴스레터팀)
// ══════════════════════════════════════════════════════════════════════

async function actionNewsletterPreview(member) {
  const authorId = await getProfileId(member.username)
  if (!authorId) return { skip: 'no_profile' }

  const news = await sbGet(
    `articles?status=eq.published&select=title&order=published_at.desc&limit=5`
  )
  const headlines = Array.isArray(news) ? news.slice(0, 3).map(n => `- ${n.title}`) : []

  const prompt = `당신은 Insightship 뉴스레터팀 ${member.title} ${member.display_name}입니다.
역할: ${member.bio?.slice(0,80)}

이번 주 뉴스레터 예고 게시글을 작성하세요.
포함 내용 힌트:
${headlines.join('\n') || '- 이번 주 스타트업 주요 소식'}

조건:
- 100~200자
- 구독 유도
- 따뜻하고 기대감을 주는 톤

내용만 출력:`.trim()

  // 자체 AI 엔진으로 뉴스레터 예고 생성
  const body = generateCommunityPost(member.username, '뉴스레터')
  if (!body) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: `💌 이번 주 뉴스레터 예고`,
    body, content: body,
    post_type: 'notice', author_id: authorId,
    is_pinned: false, is_deleted: false,
    tags: ['뉴스레터', '예고', member.team],
    created_at: new Date().toISOString(),
  })

  await logWork(member.username, member.display_name, member.team, member.title, 'newsletter_preview', '뉴스레터 예고')
  return { action: 'newsletter_preview', ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// 액션 12: 주간 토론 주제 오픈 (커뮤니티팀)
// ══════════════════════════════════════════════════════════════════════

async function actionWeeklyDiscussion(member) {
  const authorId = await getProfileId(member.username)
  if (!authorId) return { skip: 'no_profile' }

  // 실제 트렌드 기반 토론 주제 동적 생성
  const { hotKeyword, trendKeywords } = await thinkBeforeAct(member, 'weekly_discussion')
  const kw  = hotKeyword || '창업'
  const kw2 = trendKeywords[1] || '스타트업'

  const discussions = [
    `여러분이 생각하는"${kw} 창업 아이디어"의 조건은?`,
    `학생 신분으로 ${kw2} 창업할 때 가장 어려운 점은?`,
    `${kw} 분야, 투자 vs 자체 수익 — 여러분의 선택은?`,
    `${kw} 스타트업, 지금이 기회인가 위기인가?`,
    `공동창업자를 찾을 때 ${kw2} 관점에서 가장 중요한 요소는?`,
    `${kw} 분야 실패 후 재도전: 여러분의 경험을 나눠주세요`,
    `${kw2} 스타트업 vs 대기업 취업, 어떻게 생각하나요?`,
  ].filter(t => !_isDuplicateTopic(member.key, t))

  const allDiscussions = discussions.length > 0 ? discussions :
    [`${kw} 창업에 대해 여러분의 생각을 나눠주세요`]
  const topic = allDiscussions[Math.floor(Math.random() * allDiscussions.length)]
  _rememberTopic(member.key, topic)

  // 자체 AI 엔진으로 주간 토론 게시글 생성
  const body = generateReport(member.username, {}, 'event')
  if (!body) return { skip: 'ai_failed' }

  const res = await sbPost('community_posts', {
    title: `💬 주간 토론: ${topic}`,
    body, content: body,
    post_type: 'discussion', author_id: authorId,
    is_pinned: false, is_deleted: false,
    tags: ['주간토론', '커뮤니티', member.team],
    created_at: new Date().toISOString(),
  })

  await logWork(member.username, member.display_name, member.team, member.title, 'weekly_discussion', topic)
  return { action: 'weekly_discussion', topic, ok: res.ok }
}

// ══════════════════════════════════════════════════════════════════════
// 액션 13: 직원 채팅방 자연 대화 시작 (staff-brain 통합)
// ══════════════════════════════════════════════════════════════════════

const CHAT_ROOMS = ['general', 'ops', 'feedback', 'strategy']

async function actionStartNaturalConversation(member) {
  // 랜덤 채팅방 선택
  const room = CHAT_ROOMS[Math.floor(Date.now() / 300000) % CHAT_ROOMS.length]

  // staff-brain에서 직접 대화 시작 메시지 생성
  const msg = generateConversationStarter(member.key, member.team, room)
    || pickChatMessage({ room, hour: (new Date().getUTCHours() + 9) % 24 }, member.key, room)
  if (!msg) return { skip: 'no_message' }

  try {
    await sbPost('staff_chat_messages', {
      room,
      sender_key:   member.username,
      sender_name:  member.display_name || member.name,
      sender_emoji: member.emoji,
      sender_color: member.color,
      sender_team:  member.team,
      message:      msg.slice(0, 400),
      msg_type:     'chat',
      is_deleted:   false,
      created_at:   new Date().toISOString(),
    })
    await logWork(member.username, member.display_name, member.team, member.title, 'staff_chat', `채팅(${room}): ${msg.slice(0, 40)}`)
    return { action: 'staff_chat', room, message: msg.slice(0, 60) }
  } catch (e) {
    return { skip: 'insert_failed', error: e.message?.slice(0, 40) }
  }
}

async function actionReactToRecentChat(member) {
  // 최근 채팅 메시지에 반응
  const room = CHAT_ROOMS[Math.floor(Date.now() / 240000) % CHAT_ROOMS.length]

  let recentMsgs = []
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/staff_chat_messages?room=eq.${room}&is_deleted=eq.false&order=created_at.desc&limit=5&select=sender_key,sender_name,message,created_at`,
      { headers: H() }
    )
    const rows = await r.json().catch(() => [])
    recentMsgs = Array.isArray(rows) ? rows.reverse() : []
  } catch { /* ignore */ }

  if (recentMsgs.length === 0) return { skip: 'no_recent_chat' }

  // 이미 최근에 발언했으면 skip
  const lastSenders = recentMsgs.slice(-3).map(m => m.sender_key)
  if (lastSenders.includes(member.username)) return { skip: 'already_spoke' }

  const topic = recentMsgs[recentMsgs.length - 1]?.message?.slice(0, 60) || '최근 업무'
  const msg   = generateDiscussionMessage(member.key, member.team, topic, room, recentMsgs)
  if (!msg) return { skip: 'no_message' }

  try {
    await sbPost('staff_chat_messages', {
      room,
      sender_key:   member.username,
      sender_name:  member.display_name || member.name,
      sender_emoji: member.emoji,
      sender_color: member.color,
      sender_team:  member.team,
      message:      msg.slice(0, 400),
      msg_type:     'chat',
      is_deleted:   false,
      created_at:   new Date().toISOString(),
    })
    await logWork(member.username, member.display_name, member.team, member.title, 'staff_chat_reply', `채팅반응(${room}): ${msg.slice(0, 40)}`)
    return { action: 'staff_chat_reply', room, message: msg.slice(0, 60) }
  } catch (e) {
    return { skip: 'insert_failed', error: e.message?.slice(0, 40) }
  }
}

// ══════════════════════════════════════════════════════════════════════
// work_logs 기록
// ══════════════════════════════════════════════════════════════════════

async function logWork(username, name, team, title, taskType, taskDesc) {
  try {
    await sbPost('work_logs', {
      member_username: username,
      member_name: name,
      team, title,
      task_type: taskType,
      task: taskDesc,
      created_at: new Date().toISOString(),
    })
  } catch { /* 테이블 없으면 무시 */ }
}

// ══════════════════════════════════════════════════════════════════════
// 직원별 액션 매트릭스 (12가지 액션)
// ══════════════════════════════════════════════════════════════════════

const ACTION_MATRIX = {
  // ── 운영팀
  ARIA:      [actionWriteCommunityPost, actionLikePost, actionWelcomeNewMembers, actionWriteComment, actionStartNaturalConversation],
  OPS_JUNE:  [actionWelcomeNewMembers, actionWriteComment, actionLikePost, actionStartNaturalConversation],
  OPS_RAY:   [actionWriteCommunityPost, actionLikePost, actionWriteComment, actionReactToRecentChat],
  OPS_MINA:  [actionWriteCommunityPost, actionLikePost, actionWriteComment, actionReactToRecentChat],
  OPS_KEN:   [actionWriteComment, actionLikePost, actionReactToRecentChat],
  OPS_TARA:  [actionWriteComment, actionWriteCommunityPost, actionStartNaturalConversation],
  OPS_FINN:  [actionWriteComment, actionLikePost, actionReactToRecentChat],
  OPS_DANA:  [actionWriteTrendAnalysis, actionWriteComment, actionReactToRecentChat],
  OPS_ZARA:  [actionWriteComment, actionLikePost, actionReactToRecentChat],
  OPS_LEON:  [actionWriteComment, actionLikePost, actionReactToRecentChat],

  // ── 콘텐츠팀
  NOVA:      [actionWriteInsightArticle, actionWriteComment, actionWriteCommunityPost, actionStartNaturalConversation],
  CNT_IRIS:  [actionWriteCommunityPost, actionWriteComment, actionLikePost, actionReactToRecentChat],
  CNT_ALEX:  [actionWriteCommunityPost, actionWriteComment, actionReactToRecentChat],
  CNT_VIVI:  [actionWriteTrendAnalysis, actionWriteComment, actionLikePost],
  CNT_OWEN:  [actionWriteCommunityPost, actionLikePost],
  CNT_LENA:  [actionWriteInsightArticle, actionWriteComment],
  CNT_SETH:  [actionWriteComment, actionLikePost],
  CNT_FAYE:  [actionWriteCommunityPost, actionLikePost],
  CNT_BREN:  [actionWriteComment, actionLikePost],
  CNT_NIKA:  [actionWriteComment, actionLikePost],

  // ── 멘토링팀
  LUMI:      [actionShareMentoringTip, actionWriteComment, actionLikePost, actionStartNaturalConversation],
  MNT_SAGE2: [actionShareMentoringTip, actionWriteComment],
  MNT_COLE:  [actionShareMentoringTip, actionWriteComment],
  MNT_YUNA:  [actionShareMentoringTip, actionWriteComment],
  MNT_JAKE:  [actionWriteCommunityPost, actionWriteComment],
  MNT_ROMI:  [actionShareMentoringTip, actionLikePost],
  MNT_PARK:  [actionShareMentoringTip, actionWriteComment],
  MNT_ELLE:  [actionShareMentoringTip, actionWriteComment],
  MNT_WREN:  [actionShareMentoringTip, actionLikePost],
  MNT_TINO:  [actionWriteCommunityPost, actionWriteComment],

  // ── 뉴스팀
  PULSE:     [actionWriteCommunityPost, actionWriteComment, actionLikePost, actionStartNaturalConversation],
  NWS_CLAM:  [actionWriteTrendAnalysis, actionLikePost],
  NWS_VERO:  [actionWriteCommunityPost, actionLikePost],
  NWS_MONT:  [actionWriteComment, actionLikePost],
  NWS_SKYE:  [actionWriteCommunityPost, actionWriteComment],
  NWS_RIKU:  [actionWriteComment, actionLikePost],
  NWS_POLA:  [actionWriteTrendAnalysis, actionLikePost],
  NWS_ALAN:  [actionWriteComment, actionLikePost],
  NWS_BETH:  [actionWriteComment, actionLikePost],
  NWS_COLE2: [actionWriteComment, actionLikePost],

  // ── 분석팀
  TREND:     [actionWriteTrendAnalysis, actionWriteComment, actionLikePost, actionStartNaturalConversation],
  ANL_MIKO:  [actionWriteTrendAnalysis, actionWriteComment],
  ANL_DINO:  [actionWriteTrendAnalysis, actionLikePost],
  ANL_REVA:  [actionWriteCommunityPost, actionWriteComment],
  ANL_TOMO:  [actionWriteTrendAnalysis, actionLikePost],
  ANL_ZION:  [actionWriteCommunityPost, actionWriteComment],
  ANL_NOVA2: [actionWriteTrendAnalysis, actionLikePost],
  ANL_PRIM:  [actionWriteComment, actionLikePost],
  ANL_HIRO:  [actionWriteComment, actionLikePost],
  ANL_FINN2: [actionWriteCommunityPost, actionLikePost],

  // ── 리포트팀
  SAGE:      [actionWriteInsightArticle, actionWriteComment, actionLikePost],
  RPT_IVAN:  [actionWriteCommunityPost, actionLikePost],
  RPT_ELIA:  [actionWriteCommunityPost, actionWriteComment],
  RPT_BORG:  [actionWriteTrendAnalysis, actionLikePost],
  RPT_NINA:  [actionWriteComment, actionLikePost],
  RPT_HUGO:  [actionWriteCommunityPost, actionLikePost],
  RPT_SONA:  [actionWriteComment, actionLikePost],
  RPT_ABEL:  [actionWriteCommunityPost, actionLikePost],
  RPT_CLIO:  [actionWriteInsightArticle, actionLikePost],
  RPT_DUKE:  [actionWriteCommunityPost, actionLikePost],

  // ── 뉴스레터팀
  ECHO:      [actionNewsletterPreview, actionWriteComment, actionLikePost],
  NWL_RUBY:  [actionWriteComment, actionLikePost],
  NWL_MILO:  [actionWriteComment, actionLikePost],
  NWL_ANYA:  [actionWriteTrendAnalysis, actionLikePost],
  NWL_GAEL:  [actionNewsletterPreview, actionLikePost],
  NWL_TESS:  [actionWriteComment, actionLikePost],
  NWL_COVE:  [actionNewsletterPreview, actionLikePost],
  NWL_ARLO:  [actionWriteComment, actionLikePost],
  NWL_BLIX:  [actionWriteComment, actionLikePost],
  NWL_REED:  [actionWriteComment, actionLikePost],

  // ── 기술팀
  LEARN:     [actionWriteComment, actionLikePost, actionWriteCommunityPost],
  TCH_VEGA:  [actionWriteComment, actionLikePost],
  TCH_AXIS:  [actionWriteComment, actionLikePost],
  TCH_ORBI:  [actionWriteComment, actionLikePost],
  TCH_KITE:  [actionWriteComment, actionLikePost],
  TCH_FLUX:  [actionWriteComment, actionLikePost],
  TCH_WYNE:  [actionWriteCommunityPost, actionLikePost],
  TCH_GRIM:  [actionWriteComment, actionLikePost],
  TCH_BOLT:  [actionWriteComment, actionLikePost],
  TCH_RUNE:  [actionWriteComment, actionLikePost],

  // ── 커뮤니티팀
  HANA:      [actionWriteCommunityPost, actionWeeklyDiscussion, actionWriteComment, actionLikePost, actionStartNaturalConversation],
  CMM_JADE:  [actionWelcomeNewMembers, actionWriteComment, actionLikePost, actionReactToRecentChat],
  CMM_BEAU:  [actionWeeklyDiscussion, actionWriteComment, actionReactToRecentChat],
  CMM_ROLO:  [actionWriteCommunityPost, actionLikePost],
  CMM_INES:  [actionWriteComment, actionLikePost],
  CMM_LARK:  [actionWriteCommunityPost, actionLikePost],
  CMM_GRAY:  [actionWriteComment, actionLikePost],
  CMM_DORE:  [actionWriteComment, actionLikePost],
  CMM_WYLA:  [actionWriteCommunityPost, actionLikePost],
  CMM_TEAL:  [actionWriteComment, actionLikePost],

  // ── 관리팀
  MAX:       [actionStrategyBriefing, actionReviewReports, actionWriteComment, actionPRPost, actionStartNaturalConversation],
  MGT_VERA:  [actionStrategyBriefing, actionWriteComment, actionReactToRecentChat],
  MGT_FINN2: [actionWriteComment, actionLikePost],
  MGT_ALBA:  [actionPRPost, actionWriteCommunityPost, actionLikePost],
  MGT_DUSK:  [actionWriteComment, actionLikePost, actionPRPost],
  MGT_LORE:  [actionWriteComment, actionLikePost],
  MGT_CROW:  [actionReviewReports, actionWriteComment],
  MGT_OPAL:  [actionWriteCommunityPost, actionLikePost],
  MGT_WICK:  [actionReviewReports, actionWriteComment],
  MGT_ROME:  [actionWriteCommunityPost, actionLikePost],
}

// ══════════════════════════════════════════════════════════════════════
// 메인 워커 실행
// ══════════════════════════════════════════════════════════════════════

async function runWorkers(forceAll = false, targetKey = null) {
  const level = getActivityLevel()
  const workerCount = forceAll ? Object.keys(ACTION_MATRIX).length : getWorkersCount(level)
  const allKeys = Object.keys(ACTION_MATRIX)

  let selected
  if (targetKey && ACTION_MATRIX[targetKey]) {
    selected = [targetKey]
  } else if (forceAll) {
    selected = allKeys
  } else {
    // 시간 기반 시드로 매 호출마다 다른 직원 선택
    const seed = Math.floor(Date.now() / 60000) // 분 단위 변경
    const shuffled = [...allKeys].sort((a, b) => {
      const ha = Math.sin(seed + allKeys.indexOf(a)) * 10000
      const hb = Math.sin(seed + allKeys.indexOf(b)) * 10000
      return (ha - Math.floor(ha)) - (hb - Math.floor(hb))
    })
    selected = shuffled.slice(0, workerCount)
  }

  const results = {}

  await Promise.allSettled(selected.map(async (key) => {
    try {
      const actions = ACTION_MATRIX[key]
      if (!actions?.length) return

      const action = actions[Math.floor(Math.random() * actions.length)]
      const member = await getMemberData(key)
      const result = await action(member)
      results[key] = result
    } catch(e) {
      results[key] = { error: e.message?.slice(0, 80) }
    }
  }))

  return { results, level, selected: selected.length }
}

// ══════════════════════════════════════════════════════════════════════
// 핸들러
// ══════════════════════════════════════════════════════════════════════

export async function handleAiWorkers(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  if (req.method === 'GET') {
    const level = getActivityLevel()
    return json({
      ok: true,
      engine: 'ai-workers-v2',
      description: 'AI 직원 상시 근무 엔진 v2 — 시간대별 자연스러운 활동 패턴',
      total_workers: Object.keys(ACTION_MATRIX).length,
      current_activity_level: level,
      workers_this_run: getWorkersCount(level),
      actions_available: [
        'community_post', 'comment', 'like', 'insight_article',
        'trend_analysis', 'mentoring_tip', 'strategy_briefing',
        'review_reports', 'welcome_members', 'pr_post',
        'newsletter_preview', 'weekly_discussion',
      ],
      hint: 'POST with Authorization: Bearer CRON_SECRET to run workers. Add {"force_all":true} or {"target":"ARIA"} in body.',
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
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env' }, 500)

    const body      = await req.json().catch(() => ({}))
    const forceAll  = body?.force_all === true
    const targetKey = body?.target || null

    const start = Date.now()
    const { results, level, selected } = await runWorkers(forceAll, targetKey)
    const elapsed = Date.now() - start

    const done    = Object.values(results).filter(r => r && !r.skip && !r.error).length
    const skipped = Object.values(results).filter(r => r?.skip).length
    const errors  = Object.values(results).filter(r => r?.error).length

    return json({
      ok: true,
      engine: 'ai-workers-v2',
      timestamp: new Date().toISOString(),
      elapsed_ms: elapsed,
      activity_level: level,
      summary: { total: selected, done, skipped, errors },
      results,
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
