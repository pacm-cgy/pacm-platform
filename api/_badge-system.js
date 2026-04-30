/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP 뱃지 자동 부여 + 알림 시스템 v1.0                      ║
 * ║  설계서 §7 커뮤니티 시스템 기반 구현                                ║
 * ║                                                                      ║
 * ║  뱃지 조건:                                                          ║
 * ║   🚀 첫 창업가    - 첫 커뮤니티 게시글 작성                         ║
 * ║   💡 아이디어 마스터 - 아이디어 5개 이상 등록                       ║
 * ║   🤝 커뮤니티 빌더  - 댓글 10개 이상                                ║
 * ║   📚 지식 탐구자    - 강의 3개 이상 완료                            ║
 * ║   🔥 연속 방문자    - 7일 연속 방문                                  ║
 * ║   🏆 스타 창업가    - 게시글 좋아요 합계 50 이상                    ║
 * ║   🌟 AI 파워유저    - AI 멘토 10회 이상 대화                        ║
 * ║   🦄 유니콘 꿈나무  - 팔로워 20명 이상                              ║
 * ║   📰 뉴스 독자      - 기사 20개 이상 북마크                         ║
 * ║   🎯 팀 빌더        - 팀원 모집 게시글 작성 후 멤버 2명 이상 참여   ║
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

const sb = (path) => `${SB_URL}/rest/v1/${path}`
const GET = (path) => fetch(sb(path), { headers: H() }).then(r => r.json())
const PATCH = (path, body) => fetch(sb(path), { method: 'PATCH', headers: { ...H(), Prefer: 'return=minimal' }, body: JSON.stringify(body) })
const POST = (path, body) => fetch(sb(path), { method: 'POST', headers: { ...H(), Prefer: 'return=representation' }, body: JSON.stringify(body) })

// ── 뱃지 정의 ────────────────────────────────────────────────────
const BADGE_DEFS = [
  {
    id: 'first_startup',
    name: '첫 창업가',
    emoji: '🚀',
    description: '첫 커뮤니티 게시글을 작성했습니다',
    color: '#3B82F6',
    check: async (uid) => {
      const d = await GET(`community_posts?author_id=eq.${uid}&is_deleted=eq.false&limit=1&select=id`)
      return Array.isArray(d) && d.length > 0
    },
  },
  {
    id: 'idea_master',
    name: '아이디어 마스터',
    emoji: '💡',
    description: '아이디어를 5개 이상 등록했습니다',
    color: '#F59E0B',
    check: async (uid) => {
      const d = await GET(`startup_ideas?author_id=eq.${uid}&is_deleted=eq.false&select=id`)
      return Array.isArray(d) && d.length >= 5
    },
  },
  {
    id: 'community_builder',
    name: '커뮤니티 빌더',
    emoji: '🤝',
    description: '댓글을 10개 이상 작성했습니다',
    color: '#22C55E',
    check: async (uid) => {
      const d = await GET(`comments?author_id=eq.${uid}&is_deleted=eq.false&select=id`)
      return Array.isArray(d) && d.length >= 10
    },
  },
  {
    id: 'knowledge_seeker',
    name: '지식 탐구자',
    emoji: '📚',
    description: '강의를 3개 이상 완료했습니다',
    color: '#F97316',
    check: async (uid) => {
      const d = await GET(`edu_progress?user_id=eq.${uid}&completed=eq.true&select=id`)
      return Array.isArray(d) && d.length >= 3
    },
  },
  {
    id: 'star_founder',
    name: '스타 창업가',
    emoji: '🏆',
    description: '게시글 좋아요 합계가 50 이상입니다',
    color: '#EAB308',
    check: async (uid) => {
      const d = await GET(`community_posts?author_id=eq.${uid}&is_deleted=eq.false&select=like_count`)
      if (!Array.isArray(d)) return false
      const total = d.reduce((s, p) => s + (p.like_count || 0), 0)
      return total >= 50
    },
  },
  {
    id: 'ai_poweruser',
    name: 'AI 파워유저',
    emoji: '🌟',
    description: 'AI 멘토와 10회 이상 대화했습니다',
    color: '#A855F7',
    check: async (uid) => {
      const d = await GET(`mentor_sessions?user_id=eq.${uid}&select=id`)
      return Array.isArray(d) && d.length >= 10
    },
  },
  {
    id: 'unicorn_dreamer',
    name: '유니콘 꿈나무',
    emoji: '🦄',
    description: '팔로워가 20명 이상입니다',
    color: '#EC4899',
    check: async (uid) => {
      const d = await GET(`follows?following_id=eq.${uid}&select=id`)
      return Array.isArray(d) && d.length >= 20
    },
  },
  {
    id: 'news_reader',
    name: '뉴스 독자',
    emoji: '📰',
    description: '기사를 20개 이상 북마크했습니다',
    color: '#60A5FA',
    check: async (uid) => {
      const d = await GET(`article_bookmarks?user_id=eq.${uid}&select=id`)
      return Array.isArray(d) && d.length >= 20
    },
  },
]

// ── 알림 전송 헬퍼 ───────────────────────────────────────────────
async function sendNotification(userId, title, message, type = 'badge', link = '/profile') {
  try {
    await POST('notifications', {
      user_id: userId,
      title,
      message,
      type,
      link,
      is_read: false,
      created_at: new Date().toISOString(),
    })
  } catch {}
}

// ── 뱃지 부여 핵심 로직 ──────────────────────────────────────────
async function processUserBadges(userId) {
  const gained = []

  // 이미 보유한 뱃지 조회
  const existing = await GET(`user_badges?user_id=eq.${userId}&select=badge_id`)
  const owned = new Set(Array.isArray(existing) ? existing.map(b => b.badge_id) : [])

  for (const badge of BADGE_DEFS) {
    if (owned.has(badge.id)) continue // 이미 보유
    try {
      const earned = await badge.check(userId)
      if (!earned) continue

      // 뱃지 부여
      await POST('user_badges', {
        user_id: userId,
        badge_id: badge.id,
        badge_name: badge.name,
        badge_emoji: badge.emoji,
        badge_color: badge.color,
        earned_at: new Date().toISOString(),
      })

      // 알림 전송
      await sendNotification(
        userId,
        `${badge.emoji} 새 뱃지 획득!`,
        `축하합니다! "${badge.name}" 뱃지를 획득했습니다. ${badge.description}`,
        'badge',
        '/profile'
      )

      gained.push(badge.id)
    } catch {}
  }

  return gained
}

// ── 메인 핸들러 ──────────────────────────────────────────────────
export async function handleBadgeSystem(req) {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      service: 'insightship-badge-system',
      version: '1.0',
      badges: BADGE_DEFS.map(b => ({ id: b.id, name: b.name, emoji: b.emoji })),
      status: 'ready',
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // 인증 확인
  const auth = req.headers.get('authorization')
  const cron = req.headers.get('x-vercel-cron')
  const secret = req.headers.get('x-cron-secret')
  if (cron !== '1' && auth !== `Bearer ${CRON_SECRET}` && secret !== CRON_SECRET) {
    // POST 요청에서 특정 user_id를 직접 처리하는 경우도 허용 (로그인 후 트리거)
    const body = await req.json().catch(() => ({}))
    if (body.user_id && body.trigger === 'user_action') {
      const gained = await processUserBadges(body.user_id)
      return new Response(JSON.stringify({ gained, user_id: body.user_id }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  if (!SB_URL || !SB_KEY) {
    return new Response(JSON.stringify({ error: 'Missing env' }), { status: 500 })
  }

  // 크론 실행: 모든 활성 사용자 뱃지 일괄 점검
  let params = {}
  try {
    if (req.method === 'POST') {
      params = await req.json().catch(() => ({}))
    }
  } catch {}

  const limit = Math.min(params.limit || 200, 500)

  // 최근 활동한 사용자 우선
  const users = await GET(`profiles?select=id&limit=${limit}&order=updated_at.desc`)
  if (!Array.isArray(users) || users.length === 0) {
    return new Response(JSON.stringify({ message: '처리할 사용자 없음', processed: 0 }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let totalGained = 0
  const results = []

  for (const user of users) {
    try {
      const gained = await processUserBadges(user.id)
      if (gained.length > 0) {
        totalGained += gained.length
        results.push({ user_id: user.id, gained })
      }
    } catch {}
  }

  return new Response(JSON.stringify({
    processed: users.length,
    total_badges_granted: totalGained,
    results: results.slice(0, 20), // 최대 20개만 반환
    timestamp: new Date().toISOString(),
  }), { headers: { 'Content-Type': 'application/json' } })
}
