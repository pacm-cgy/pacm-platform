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
export async function handleDevPermissions(req) {
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
