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
export const config = { runtime: 'edge', maxDuration: 60 }

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
export default async function handler(req) {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // 팔로우 피드 조회 (GET /api/community-engine?action=feed&user_id=xxx)
  if (req.method === 'GET' && action === 'feed') {
    const userId = url.searchParams.get('user_id')
    if (!userId) return json({ error: 'user_id required' }, 400)
    const feed = await getFollowFeed(userId, Number(url.searchParams.get('limit')) || 20)
    return json({ feed, count: feed.length })
  }

  // 인기 게시물 조회
  if (req.method === 'GET' && action === 'hot') {
    const days = Number(url.searchParams.get('days')) || 7
    const limit = Number(url.searchParams.get('limit')) || 10
    const hot = await calcHotPosts(days, limit)
    return json({ hot, count: hot.length })
  }

  // 배지 트리거
  if (req.method === 'POST' && action === 'badge_trigger') {
    let body = {}
    try { body = await req.json() } catch {}
    const userId = body.user_id
    if (!userId) return json({ error: 'user_id required' }, 400)
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
