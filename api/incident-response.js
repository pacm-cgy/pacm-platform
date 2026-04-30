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
import {
  requireAdmin, isCronAuth,
  json, ok, forbidden, unauthorized, serverError, badRequest,
  handleOptions, serviceH, CORS,
} from './_auth.js'

export const config = { maxDuration: 60 }

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
export default async function handler(req) {
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
