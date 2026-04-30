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
import {
  requireAdmin, isCronAuth,
  json, ok, forbidden, unauthorized, serverError, badRequest,
  handleOptions, serviceH, CORS,
} from './_auth.js'



const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// ── 보안 이벤트 타입 정의 ────────────────────────────────────────────────
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low', 'info']

export async function handleSecurityAudit(req) {
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
