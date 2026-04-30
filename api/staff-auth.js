/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/staff-auth.js — AI 직원 관리자 권한 부여 & 보안 강화           ║
 * ║                                                                      ║
 * ║  기능:                                                               ║
 * ║  1. AI 직원 100명 전원 role=admin 일괄 설정                        ║
 * ║  2. AI 계정 식별자 잠금 (username 변경 방지 플래그)                ║
 * ║  3. 일반 유저가 AI username 패턴 등록 차단 검증                    ║
 * ║  4. is_ai_account 플래그 + admin_locked 플래그 설정                ║
 * ║  5. GET: 현재 AI 계정 권한 상태 조회                               ║
 * ║  6. POST: 전체 AI 계정 권한 강화 실행                              ║
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

// ── AI 직원 username 목록 (100명) ─────────────────────────────────
const AI_USERNAMES = [
  // 운영팀
  'ai_aria','ai_ops_june','ai_ops_ray','ai_ops_mina','ai_ops_ken',
  'ai_ops_tara','ai_ops_finn','ai_ops_dana','ai_ops_zara','ai_ops_leon',
  // 콘텐츠팀
  'ai_nova','ai_cnt_iris','ai_cnt_alex','ai_cnt_vivi','ai_cnt_owen',
  'ai_cnt_lena','ai_cnt_seth','ai_cnt_faye','ai_cnt_bren','ai_cnt_nika',
  // 멘토링팀
  'ai_lumi','ai_mnt_bora','ai_mnt_cole','ai_mnt_yuna','ai_mnt_jake',
  'ai_mnt_romi','ai_mnt_park','ai_mnt_elle','ai_mnt_wren','ai_mnt_tino',
  // 뉴스팀
  'ai_pulse','ai_nws_clam','ai_nws_vero','ai_nws_mont','ai_nws_skye',
  'ai_nws_riku','ai_nws_pola','ai_nws_alan','ai_nws_beth','ai_nws_cody',
  // 분석팀
  'ai_trend','ai_anl_miko','ai_anl_dino','ai_anl_reva','ai_anl_tomo',
  'ai_anl_zion','ai_anl_oryn','ai_anl_prim','ai_anl_hiro','ai_anl_fion',
  // 리포트팀
  'ai_sage','ai_rpt_ivan','ai_rpt_elia','ai_rpt_borg','ai_rpt_nina',
  'ai_rpt_hugo','ai_rpt_sona','ai_rpt_abel','ai_rpt_clio','ai_rpt_duke',
  // 뉴스레터팀
  'ai_echo','ai_nwl_ruby','ai_nwl_milo','ai_nwl_anya','ai_nwl_gael',
  'ai_nwl_tess','ai_nwl_cove','ai_nwl_arlo','ai_nwl_blix','ai_nwl_reed',
  // 기술팀
  'ai_learn','ai_tch_vega','ai_tch_axis','ai_tch_orbi','ai_tch_kite',
  'ai_tch_flux','ai_tch_wyne','ai_tch_grim','ai_tch_bolt','ai_tch_rune',
  // 커뮤니티팀
  'ai_hana','ai_cmm_jade','ai_cmm_beau','ai_cmm_rolo','ai_cmm_ines',
  'ai_cmm_lark','ai_cmm_gray','ai_cmm_dore','ai_cmm_wyla','ai_cmm_teal',
  // 관리팀
  'ai_max','ai_mgt_vera','ai_mgt_finn','ai_mgt_alba','ai_mgt_dusk',
  'ai_mgt_lore','ai_mgt_crow','ai_mgt_opal','ai_mgt_wick','ai_mgt_rome',
]

// ── AI username 패턴 — 일반 유저 등록 차단용 ─────────────────────
export const AI_USERNAME_PATTERNS = [
  /^ai_/i,
  /^insightship_/i,
  /^platform_/i,
  /^system_/i,
  /^admin_bot/i,
]

export function isAIUsername(username) {
  return AI_USERNAME_PATTERNS.some(p => p.test(username)) ||
         AI_USERNAMES.includes(username.toLowerCase())
}

// ── 배치 처리 ─────────────────────────────────────────────────────
async function runBatch(items, fn, size = 10) {
  const results = []
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    const res   = await Promise.all(batch.map(fn))
    results.push(...res)
  }
  return results
}

// ── 단일 계정 권한 강화 ───────────────────────────────────────────
async function lockAccount(username) {
  try {
    const patchR = await fetch(
      `${SB_URL}/rest/v1/profiles?username=eq.${username}`,
      {
        method:  'PATCH',
        headers: { ...H(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          role:           'admin',
          is_verified:    true,
          is_ai_account:  true,
          admin_locked:   true,
          updated_at:     new Date().toISOString(),
        }),
      }
    )
    return { username, status: patchR.ok ? 'locked' : 'error', http: patchR.status }
  } catch (e) {
    return { username, status: 'exception', error: e.message }
  }
}

// ── GET: 상태 조회 ────────────────────────────────────────────────
async function getStatus() {
  // ★ SB_URL 미설정 시 undefined/null 안전 처리 — try/catch 필수
  if (!SB_URL || !SB_KEY) {
    return AI_USERNAMES.map(u => ({
      username: u, exists: false, role: null,
      is_admin: false, is_verified: false, is_ai_account: false,
      admin_locked: false, needs_lock: true,
    }))
  }
  try {
    const orStr = AI_USERNAMES.map(u => `username.eq.${u}`).join(',')
    const r = await fetch(
      `${SB_URL}/rest/v1/profiles?or=(${orStr})&select=username,role,is_verified,is_ai_account,admin_locked&limit=200`,
      { headers: H() }
    )
    const rows = await r.json().catch(() => [])
    const map  = {}
    if (Array.isArray(rows)) for (const row of rows) map[row.username] = row

    return AI_USERNAMES.map(u => ({
      username:       u,
      exists:         !!map[u],
      role:           map[u]?.role || null,
      is_admin:       map[u]?.role === 'admin',
      is_verified:    map[u]?.is_verified || false,
      is_ai_account:  map[u]?.is_ai_account || false,
      admin_locked:   map[u]?.admin_locked || false,
      needs_lock:     !map[u] || map[u]?.role !== 'admin' || !map[u]?.admin_locked,
    }))
  } catch (_e) {
    // 네트워크 오류 / URL 파싱 오류 → 빈 상태 반환 (FUNCTION_INVOCATION_FAILED 방지)
    return AI_USERNAMES.map(u => ({
      username: u, exists: false, role: null,
      is_admin: false, is_verified: false, is_ai_account: false,
      admin_locked: false, needs_lock: true,
    }))
  }
}

// ── 메인 핸들러 ───────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  if (req.method === 'GET') {
    const statuses  = await getStatus()
    const total     = statuses.length
    const locked    = statuses.filter(s => !s.needs_lock).length
    const needsLock = statuses.filter(s =>  s.needs_lock).length
    return json({
      status: 'ok',
      engine: 'staff-auth-v1',
      description: 'AI 직원 100명 관리자 권한 & 보안 잠금 상태',
      total, locked, needs_lock: needsLock,
      accounts: statuses,
      security_rules: [
        'AI 계정 username 패턴(ai_*) 일반 유저 등록 차단',
        'admin_locked=true 계정은 일반 API로 role 변경 불가',
        'is_ai_account=true 계정은 RLS 정책으로 자기자신만 수정 가능',
        'CRON_SECRET 인증 없이 권한 변경 불가',
      ],
    })
  }

  if (req.method === 'POST') {
    const authHeader  = req.headers.get('authorization') || ''
    const isCronKey   = authHeader === `Bearer ${CRON_SECRET}` || req.headers.get('x-cron-secret') === CRON_SECRET
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const isAdminAuth = bearerToken && bearerToken !== CRON_SECRET
      ? await checkAdminJWT(bearerToken) : false
    if (!isCronKey && !isAdminAuth) return json({ error: 'Unauthorized' }, 401)
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing env' }, 500)

    const results  = await runBatch(AI_USERNAMES, lockAccount, 10)
    const locked   = results.filter(r => r.status === 'locked').length
    const errors   = results.filter(r => r.status !== 'locked').length

    return json({
      ok:        errors === 0,
      engine:    'staff-auth-v1',
      timestamp: new Date().toISOString(),
      summary:   { total: AI_USERNAMES.length, locked, errors },
      results,
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
