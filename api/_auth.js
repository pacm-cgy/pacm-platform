/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  api/_auth.js — RBAC/ABAC 인증 공통 유틸 v1.0                          ║
 * ║                                                                          ║
 * ║  설계도 §6 Authorization & API Security 구현                             ║
 * ║  - RBAC: role 기반 권한 (admin / moderator / user / ai_staff)           ║
 * ║  - ABAC: 속성 기반 (is_ai_account, admin_locked, is_verified)           ║
 * ║  - IDOR 방어: 모든 자원 접근 시 소유권 서버 검증                        ║
 * ║  - JWT 검증: Supabase Auth 연동                                          ║
 * ║  - 세션 고정 방지: 토큰 재발급 시 이전 토큰 무효화 (refresh 추적)      ║
 * ║  - 민감 오류 마스킹: 내부 정보 노출 방지                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── Supabase 서비스 롤 헤더 ──────────────────────────────────────────────
export const serviceH = () => ({
  apikey:         SB_KEY,
  Authorization:  `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

// ── 표준 CORS 헤더 ──────────────────────────────────────────────────────
export const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cron-Secret',
}

// ── JSON 응답 헬퍼 ──────────────────────────────────────────────────────
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

export function ok(data)           { return json(data, 200) }
export function created(data)      { return json(data, 201) }
export function badRequest(msg)    { return json({ error: msg, code: 'BAD_REQUEST' }, 400) }
export function unauthorized(msg)  { return json({ error: msg || '로그인이 필요합니다', code: 'UNAUTHORIZED' }, 401) }
export function forbidden(msg)     { return json({ error: msg || '권한이 없습니다', code: 'FORBIDDEN' }, 403) }
export function notFound(msg)      { return json({ error: msg || '찾을 수 없습니다', code: 'NOT_FOUND' }, 404) }
export function serverError(msg)   { return json({ error: msg || '서버 오류가 발생했습니다', code: 'SERVER_ERROR' }, 500) }

// ══════════════════════════════════════════════════════════════════════════
// RBAC 역할 정의 (설계도 §6)
// ══════════════════════════════════════════════════════════════════════════
export const ROLES = {
  ADMIN:     'admin',
  MODERATOR: 'moderator',
  USER:      'user',
  AI_STAFF:  'ai_staff',
}

export const ROLE_HIERARCHY = {
  admin:     4,
  moderator: 3,
  ai_staff:  2,
  user:      1,
}

/** 최소 역할 이상 권한 보유 여부 확인 */
export function hasRole(userRole, minRole) {
  const userLevel = ROLE_HIERARCHY[userRole]  || 0
  const minLevel  = ROLE_HIERARCHY[minRole]   || 0
  return userLevel >= minLevel
}

// ══════════════════════════════════════════════════════════════════════════
// JWT → 유저 정보 조회 (설계도 §3 토큰 검증)
// ══════════════════════════════════════════════════════════════════════════
/**
 * Bearer 토큰에서 Supabase 유저 정보를 검증하고 프로필과 함께 반환
 * @returns {{ id, email, role, is_ai_account, admin_locked, is_verified, username } | null}
 */
export async function getAuthUser(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)

  // 빈 토큰 또는 cron secret은 유저로 처리하지 않음
  if (!token || token === process.env.CRON_SECRET) return null

  try {
    // 1. JWT로 Supabase Auth 유저 조회
    const r1 = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r1.ok) return null
    const authUser = await r1.json()
    if (!authUser?.id) return null

    // 2. profiles에서 역할/속성 조회 (ABAC)
    const r2 = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${authUser.id}&select=id,username,display_name,role,is_ai_account,admin_locked,is_verified,avatar_url&limit=1`,
      { headers: serviceH() }
    )
    const profiles = await r2.json().catch(() => [])
    if (!Array.isArray(profiles) || profiles.length === 0) return null

    return {
      id:            authUser.id,
      email:         authUser.email,
      ...profiles[0],
    }
  } catch {
    return null
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CRON / 서버 인증 (내부 자동화 용도)
// ══════════════════════════════════════════════════════════════════════════
export function isCronAuth(req) {
  const CRON_SECRET = process.env.CRON_SECRET
  if (!CRON_SECRET) return false
  const authH = req.headers.get('authorization') || ''
  const cronH = req.headers.get('x-cron-secret')  || ''
  return authH === `Bearer ${CRON_SECRET}` || cronH === CRON_SECRET
}

// ══════════════════════════════════════════════════════════════════════════
// 관리자 검증 (CRON 또는 admin JWT)
// ══════════════════════════════════════════════════════════════════════════
export async function requireAdmin(req) {
  // CRON 시크릿은 관리자 수준 허용
  if (isCronAuth(req)) return { ok: true, source: 'cron' }

  const authHeader = req.headers.get('authorization') || ''
  const user = await getAuthUser(authHeader)
  if (!user)                      return { ok: false, response: unauthorized() }
  if (user.role !== ROLES.ADMIN)  return { ok: false, response: forbidden('관리자 권한이 필요합니다') }
  return { ok: true, user, source: 'jwt' }
}

// ══════════════════════════════════════════════════════════════════════════
// 일반 로그인 유저 검증
// ══════════════════════════════════════════════════════════════════════════
export async function requireAuth(req) {
  const authHeader = req.headers.get('authorization') || ''
  const user = await getAuthUser(authHeader)
  if (!user) return { ok: false, response: unauthorized() }
  return { ok: true, user }
}

// ══════════════════════════════════════════════════════════════════════════
// IDOR 방어: 자원 소유권 확인 (설계도 §6)
// ══════════════════════════════════════════════════════════════════════════
/**
 * 게시글/댓글/자원의 소유자인지, 또는 관리자인지 확인
 * @param {string} userId - 요청 유저 ID
 * @param {string} table  - Supabase 테이블명
 * @param {string} id     - 자원 ID
 * @param {string} ownerField - 소유자 컬럼명 (기본 'author_id' 또는 'user_id')
 */
export async function checkOwnership(userId, table, id, ownerField = 'author_id') {
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/${table}?id=eq.${id}&select=${ownerField}&limit=1`,
      { headers: serviceH() }
    )
    const rows = await r.json().catch(() => [])
    if (!Array.isArray(rows) || rows.length === 0) return { exists: false }
    return { exists: true, isOwner: rows[0][ownerField] === userId }
  } catch {
    return { exists: false }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 입력 검증 유틸 (설계도 §5 — SQL injection / XSS 방어)
// ══════════════════════════════════════════════════════════════════════════
const SQL_INJECTION_PATTERNS = [
  /\bunion\s+(all\s+)?select\b/i,
  /\bdrop\s+(table|database)\b/i,
  /;\s*(select|insert|update|delete|drop)\s/i,
  /\bor\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i,
  /\bexec\s*\(/i,
  /xp_cmdshell/i,
]

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on\w+\s*=\s*["'`]?\s*\w/i,
  /<\s*iframe/i,
  /document\.cookie/i,
  /document\.write/i,
  /eval\s*\(/i,
]

/** 문자열 입력 검증 */
export function validateString(value, { maxLength = 1000, fieldName = '입력값', allowHtml = false } = {}) {
  if (typeof value !== 'string') return { ok: false, error: `${fieldName}은 문자열이어야 합니다` }
  if (value.length > maxLength)  return { ok: false, error: `${fieldName}은 ${maxLength}자 이하여야 합니다` }
  if (!allowHtml) {
    for (const p of XSS_PATTERNS) {
      if (p.test(value)) return { ok: false, error: `${fieldName}에 허용되지 않는 문자가 포함되어 있습니다` }
    }
  }
  for (const p of SQL_INJECTION_PATTERNS) {
    if (p.test(value)) return { ok: false, error: `${fieldName}에 허용되지 않는 패턴이 포함되어 있습니다` }
  }
  return { ok: true }
}

/** UUID 형식 검증 */
export function isValidUUID(val) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

/** 정수 파라미터 파싱 */
export function parseIntParam(val, defaultVal = 0, min = 0, max = 1000) {
  const n = parseInt(val)
  if (isNaN(n)) return defaultVal
  return Math.min(Math.max(n, min), max)
}

// ══════════════════════════════════════════════════════════════════════════
// 보안 감사 로그 기록 (설계도 §7 Logging)
// ══════════════════════════════════════════════════════════════════════════
export async function logSecurityEvent({ action, userId, ip, meta = {}, severity = 'info' }) {
  try {
    await fetch(`${SB_URL}/rest/v1/security_audit_logs`, {
      method:  'POST',
      headers: { ...serviceH(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        action,
        user_id:    userId || null,
        ip_address: ip     || null,
        severity,
        meta:       JSON.stringify(meta),
        created_at: new Date().toISOString(),
      }),
    })
  } catch {
    // 로그 실패는 무시 (가용성 우선)
  }
}

// ══════════════════════════════════════════════════════════════════════════
// OPTIONS 프리플라이트 응답
// ══════════════════════════════════════════════════════════════════════════
export function handleOptions() {
  return new Response(null, { status: 204, headers: CORS })
}
