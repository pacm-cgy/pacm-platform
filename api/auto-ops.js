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

export const config = { maxDuration: 60 }

import { generateReport, generateCommunityPost } from './ai-engine.js'

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

export default async function handler(req) {
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
