/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP AI 팀 계정 동기화 API v1.0                             ║
 * ║  담당: 시스템 관리자                                                 ║
 * ║                                                                      ║
 * ║  기능:                                                               ║
 * ║  - AI 운영팀 8명의 분리된 계정 생성/업데이트                       ║
 * ║  - 각 멤버가 고유한 username + avatar + bio 보유                   ║
 * ║  - 비-AI 페르소나로 profiles 테이블 동기화                         ║
 * ║  - GET: 현재 계정 상태 조회                                         ║
 * ║  - POST (관리자 인증): 전체 계정 생성/업데이트 실행                ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
export const config = { runtime: 'edge' }

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
// AI 팀 멤버 정의 — 분리된 독립 계정
// ══════════════════════════════════════════════════════════════════════

const AI_ACCOUNTS = [
  {
    username:     'ai_aria',
    display_name: 'ARIA',
    bio:          'Insightship 플랫폼 운영팀의 ARIA입니다. 커뮤니티 공지, 토론 주제, 이벤트를 담당해요. 매일 여러분과 소통하며 플랫폼을 더 좋은 곳으로 만들어 나가고 있어요! 💫',
    role:         'writer',
    badge:        '운영팀',
    avatar_seed:  'aria',
    bg_color:     '0f0f1a',
    // 비-AI 페르소나 — "플랫폼 운영 매니저"로만 소개
    self_intro:   'Insightship 운영팀 매니저 ARIA예요. 커뮤니티 공지와 이벤트를 담당하고 있어요.',
    engine:       'ai-platform-operator-v3',
    schedule:     '매일 09:00 KST',
    color:        '#818CF8',
    emoji:        '🤖',
  },
  {
    username:     'ai_nova',
    display_name: 'NOVA',
    bio:          'Insightship 콘텐츠팀 편집 매니저 NOVA입니다. 스타트업 뉴스를 분석해 인사이트 아티클, 창업 가이드, 인터뷰 인사이트를 씁니다. 유명 창업자들의 이야기를 청소년 눈높이로 풀어드려요 📝',
    role:         'writer',
    badge:        '편집팀',
    avatar_seed:  'nova',
    bg_color:     '1a0f2e',
    self_intro:   'Insightship 콘텐츠팀 편집 매니저 NOVA입니다. 스타트업 뉴스 분석과 인사이트 글을 씁니다.',
    engine:       'ai-content-writer-v3',
    schedule:     '매일 10:00 KST',
    color:        '#C084FC',
    emoji:        '✍️',
  },
  {
    username:     'ai_lumi',
    display_name: 'LUMI',
    bio:          'Insightship 멘토링팀 매니저 LUMI입니다. 창업 아이디어 검증, 린 캔버스, MVP 설계, 시장 분석 등 창업의 모든 과정을 함께해요. 언제든지 질문하세요! 🌱',
    role:         'writer',
    badge:        '멘토링팀',
    avatar_seed:  'lumi',
    bg_color:     '0f1a14',
    self_intro:   'Insightship 멘토링팀 매니저 LUMI입니다. 창업 아이디어 검증부터 투자 준비까지 도와드려요.',
    engine:       'ai-mentor-v5',
    schedule:     '상시 대기',
    color:        '#34D399',
    emoji:        '💡',
  },
  {
    username:     'ai_pulse',
    display_name: 'PULSE',
    bio:          'Insightship 뉴스팀 큐레이션 매니저 PULSE입니다. 매시간 국내외 스타트업·창업 뉴스를 수집하고 AI 요약을 붙여드려요. 중요한 뉴스 하나도 놓치지 않아요 📰',
    role:         'writer',
    badge:        '뉴스팀',
    avatar_seed:  'pulse',
    bg_color:     '0a1a2e',
    self_intro:   'Insightship 뉴스팀 큐레이션 매니저 PULSE입니다. 매시간 국내외 스타트업 뉴스를 수집하고 정리해요.',
    engine:       'insightship-news-v10',
    schedule:     '매시간 자동 수집',
    color:        '#38BDF8',
    emoji:        '📡',
  },
  {
    username:     'ai_trend',
    display_name: 'TREND',
    bio:          'Insightship 분석팀 트렌드 매니저 TREND입니다. 매 6시간마다 뉴스 카테고리별 흐름을 집계하고 스타트업 시장의 온도계 역할을 해요 📈',
    role:         'writer',
    badge:        '분석팀',
    avatar_seed:  'trend',
    bg_color:     '1a1005',
    self_intro:   'Insightship 분석팀 트렌드 매니저 TREND입니다. 스타트업 시장 흐름과 키워드를 분석해요.',
    engine:       'insightship-trend-v2',
    schedule:     '매 6시간',
    color:        '#FB923C',
    emoji:        '📊',
  },
  {
    username:     'ai_sage',
    display_name: 'SAGE',
    bio:          'Insightship 리포트팀 매니저 SAGE입니다. 매주 금요일, 한 주간 스타트업 생태계의 투자·시장·트렌드를 종합 분석한 리포트를 발행해요 📊',
    role:         'writer',
    badge:        '리포트팀',
    avatar_seed:  'sage',
    bg_color:     '0a1a10',
    self_intro:   'Insightship 리포트팀 매니저 SAGE입니다. 매주 금요일 스타트업 생태계 리포트를 발행해요.',
    engine:       'insightship-report-v3',
    schedule:     '매주 금요일 23:00 KST',
    color:        '#10B981',
    emoji:        '📋',
  },
  {
    username:     'ai_echo',
    display_name: 'ECHO',
    bio:          'Insightship 뉴스레터팀 매니저 ECHO입니다. 매주 월요일 아침, 지난 한 주의 창업·투자·시장 인사이트를 이메일로 전해드려요. 받은 편지함을 열면 ECHO의 인사가 기다리고 있을 거예요 💌',
    role:         'writer',
    badge:        '뉴스레터팀',
    avatar_seed:  'echo',
    bg_color:     '1a0a14',
    self_intro:   'Insightship 뉴스레터팀 매니저 ECHO입니다. 매주 월요일 아침 주간 뉴스레터를 보내드려요.',
    engine:       'insightship-newsletter-v4',
    schedule:     '매주 월요일 08:00 KST',
    color:        '#F472B6',
    emoji:        '📬',
  },
  {
    username:     'ai_learn',
    display_name: 'LEARN',
    bio:          'Insightship 기술팀 학습 매니저 LEARN입니다. 매일 사용자 피드백과 대화 패턴을 분석해 멘토링 매니저 LUMI가 더 도움이 되도록 개선합니다. 보이지 않는 곳에서 플랫폼을 발전시켜요 🔬',
    role:         'writer',
    badge:        '기술팀',
    avatar_seed:  'learn',
    bg_color:     '100a1a',
    self_intro:   'Insightship 기술팀 학습 매니저 LEARN입니다. 플랫폼 품질 개선과 멘토링 고도화를 담당해요.',
    engine:       'ai-mentor-learn-v3',
    schedule:     '매일 12:00 KST',
    color:        '#A78BFA',
    emoji:        '🧠',
  },
]

// DiceBear avatar URL 생성 (bottts-neutral)
function avatarUrl(seed, bgColor) {
  return `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${seed}&backgroundColor=${bgColor}&radius=50`
}

// ══════════════════════════════════════════════════════════════════════
// 계정 상태 조회
// ══════════════════════════════════════════════════════════════════════

async function fetchAccountStatuses() {
  const usernames = AI_ACCOUNTS.map(a => a.username)
  const queryStr  = usernames.map(u => `username.eq.${u}`).join(',')

  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/profiles?or=(${queryStr})&select=id,username,display_name,bio,role,is_verified,avatar_url,created_at`,
      { headers: H() }
    )
    const existing = await r.json().catch(() => [])
    const existMap = {}
    if (Array.isArray(existing)) {
      for (const p of existing) existMap[p.username] = p
    }

    return AI_ACCOUNTS.map(a => ({
      username:     a.username,
      display_name: a.display_name,
      emoji:        a.emoji,
      badge:        a.badge,
      engine:       a.engine,
      schedule:     a.schedule,
      exists:       !!existMap[a.username],
      profile_id:   existMap[a.username]?.id || null,
      is_verified:  existMap[a.username]?.is_verified || false,
    }))
  } catch(e) {
    return AI_ACCOUNTS.map(a => ({ username: a.username, exists: false, error: e.message }))
  }
}

// ══════════════════════════════════════════════════════════════════════
// 계정 생성/업데이트 — 각 멤버 독립 계정 보장
// ══════════════════════════════════════════════════════════════════════

async function syncAllAccounts() {
  const results = {}

  for (const acct of AI_ACCOUNTS) {
    try {
      // 1. 기존 계정 확인
      const checkR = await fetch(
        `${SB_URL}/rest/v1/profiles?username=eq.${acct.username}&limit=1&select=id,username`,
        { headers: H() }
      )
      const existing = await checkR.json().catch(() => [])
      const exists   = Array.isArray(existing) && existing.length > 0

      const profileData = {
        username:     acct.username,
        display_name: acct.display_name,
        bio:          acct.bio,
        role:         acct.role,
        is_verified:  true,
        avatar_url:   avatarUrl(acct.avatar_seed, acct.bg_color),
        updated_at:   new Date().toISOString(),
      }

      if (exists) {
        // 업데이트 — bio / display_name / avatar 갱신
        const patchR = await fetch(
          `${SB_URL}/rest/v1/profiles?username=eq.${acct.username}`,
          {
            method:  'PATCH',
            headers: { ...H(), Prefer: 'return=minimal' },
            body:    JSON.stringify({
              display_name: profileData.display_name,
              bio:          profileData.bio,
              is_verified:  true,
              avatar_url:   profileData.avatar_url,
              updated_at:   profileData.updated_at,
            }),
          }
        )
        results[acct.username] = {
          status:       patchR.ok ? 'updated' : 'update_error',
          http_status:  patchR.status,
          display_name: acct.display_name,
          emoji:        acct.emoji,
        }
      } else {
        // 신규 생성 — profiles 직접 삽입
        // (Supabase auth.users는 관리자가 별도 생성하며,
        //  profiles만 삽입해도 게시글/댓글 author로 동작 가능)
        const insertR = await fetch(`${SB_URL}/rest/v1/profiles`, {
          method:  'POST',
          headers: { ...H(), Prefer: 'return=representation' },
          body: JSON.stringify({
            ...profileData,
            created_at: new Date().toISOString(),
          }),
        })

        if (insertR.status === 201 || insertR.status === 200) {
          const created = await insertR.json().catch(() => [])
          results[acct.username] = {
            status:       'created',
            id:           created?.[0]?.id || null,
            display_name: acct.display_name,
            emoji:        acct.emoji,
          }
        } else {
          const errText = await insertR.text()
          results[acct.username] = {
            status:      'insert_error',
            http_status: insertR.status,
            error:       errText.slice(0, 120),
          }
        }
      }
    } catch(e) {
      results[acct.username] = { status: 'exception', error: e.message }
    }
  }

  return results
}

// ══════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // ── GET: 계정 상태 조회 (공개) ─────────────────────────────────
  if (req.method === 'GET') {
    const statuses = await fetchAccountStatuses()
    const existing = statuses.filter(s => s.exists).length
    const missing  = statuses.filter(s => !s.exists).length

    return json({
      status:        'ok',
      engine:        'sync-ai-accounts-v1',
      description:   'AI 운영팀 8명 독립 계정 동기화 API',
      total_members: AI_ACCOUNTS.length,
      existing,
      missing,
      accounts:      statuses,
      hint:          missing > 0
        ? `POST /api/sync-ai-accounts (Authorization: Bearer CRON_SECRET) 로 ${missing}개 계정을 생성하세요.`
        : '모든 AI 팀 계정이 정상적으로 존재합니다.',
    })
  }

  // ── POST: 계정 생성/업데이트 (관리자 인증 필요) ────────────────
  if (req.method === 'POST') {
    const isAuthed =
      req.headers.get('authorization') === `Bearer ${CRON_SECRET}` ||
      req.headers.get('x-cron-secret') === CRON_SECRET

    if (!isAuthed) return json({ error: 'Unauthorized' }, 401)
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env' }, 500)

    const syncResults = await syncAllAccounts()

    const created = Object.values(syncResults).filter(r => r.status === 'created').length
    const updated = Object.values(syncResults).filter(r => r.status === 'updated').length
    const errors  = Object.values(syncResults).filter(r => r.status.includes('error') || r.status === 'exception').length

    return json({
      ok:        errors === 0,
      engine:    'sync-ai-accounts-v1',
      timestamp: new Date().toISOString(),
      summary: {
        total:   AI_ACCOUNTS.length,
        created,
        updated,
        errors,
      },
      results: syncResults,
      // 비-AI 페르소나 원칙 리마인더
      persona_rules: [
        '각 멤버는 고유한 username 보유 (ai_aria, ai_nova, …)',
        '"AI입니다"라고 선언하지 않고 역할명(매니저)으로만 소개',
        '서로의 역할에 침범하지 않음 (canHandleIntent 기반)',
        '자연스러운 한국어 커뮤니케이션 스타일',
        '커뮤니티 멤버에게 진정성 있게 반응',
      ],
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
