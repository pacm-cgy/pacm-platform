/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Vercel Edge Middleware v3.1 — 보안 설계도 완전 구현                    ║
 * ║                                                                          ║
 * ║  v3.1 변경사항:                                                          ║
 * ║  - blocked_ips DB 동기화 (Edge 캐시 → Supabase REST 폴링)               ║
 * ║  - 인메모리 blocked_ips 캐시 (5분 TTL, cold-start 복원)                 ║
 * ║  - 로그인 실패 헤더 → DB blocked_ips 자동 기록 (5회 → sync)             ║
 * ║  - WAF 패턴 확장 (Log4Shell, SSTI, CRLF injection)                      ║
 * ║  - /api/ai-workers, /api/staff-chat-auto 크론 경로 분류 강화             ║
 * ║  - X-RateLimit-Policy 헤더 추가                                          ║
 * ║  - ai-platform-operator, ai-decision-log 경로 보호                       ║
 * ║                                                                          ║
 * ║  설계 원칙:                                                              ║
 * ║  - 최소 권한 (Least Privilege)                                           ║
 * ║  - 심층 방어 (Defense-in-Depth)                                          ║
 * ║  - 제로 트러스트 (Zero-Trust)                                            ║
 * ║  - 데이터 최소화 (Data Minimisation)                                     ║
 * ║  - 보안 기본값 (Secure Defaults)                                         ║
 * ║                                                                          ║
 * ║  구현 항목:                                                              ║
 * ║  1. IP 기반 Rate Limiting (계층별 차등 적용)                             ║
 * ║  2. WAF — SQL injection / XSS / Path traversal / Code exec /            ║
 * ║           Log4Shell / SSTI / CRLF 차단                                   ║
 * ║  3. 악성 UA 차단 (sqlmap, nikto, nmap 등 보안 스캐너)                   ║
 * ║  4. CSRF Origin 검증                                                     ║
 * ║  5. 어드민 IP 화이트리스트 (선택적)                                      ║
 * ║  6. 보안 응답 헤더 완전 세트 (HSTS / CSP / COOP / COEP / CORP)         ║
 * ║  7. 계정 잠금 — 로그인 5회 실패 시 30분 차단                            ║
 * ║  8. AI username 탈취 방지                                                ║
 * ║  9. 민감 헤더 노출 차단                                                  ║
 * ║  10. blocked_ips DB 동기화 (5분 캐시 TTL)                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
import { NextResponse } from 'next/server'

export const config = { matcher: ['/(.*)', '/api/:path*'] }

// ══════════════════════════════════════════════════════════════════════════════
// Rate Limit 설정 (보안 설계도 §4 DDoS 완화)
// ══════════════════════════════════════════════════════════════════════════════
const WINDOW_MS      = 60_000   // 1분 윈도우
const MAX_GENERAL    = 80       // 일반 페이지: 분당 80회
const MAX_API        = 40       // /api/*: 분당 40회
const MAX_STRICT     = 6        // 민감 Admin API: 분당 6회
const MAX_AUTH       = 10       // 인증 경로 (로그인 등): 분당 10회
const MAX_AUTH_FAIL  = 5        // 로그인 실패 허용 횟수 → 초과 시 계정 잠금
const LOCKOUT_MS     = 30 * 60_000  // 30분 잠금 (설계도 §3)
const MAX_DEV_PERMS  = 2        // dev-permissions 최고 등급: 분당 2회
const MAX_REPORT     = 5        // 신고 API: 분당 5회
const MAX_CRON       = 20       // CRON 실행 경로: 분당 20회

// ── blocked_ips 인메모리 캐시 (Edge 인스턴스별, 5분 TTL) ─────────────────
let _blockedIPsCache = new Set()
let _blockedIPsCacheTs = 0
const BLOCKED_IPS_TTL = 5 * 60_000  // 5분

// 인메모리 저장소 (Edge 인스턴스별)
const rateLimitMap   = new Map()  // key → { count, resetAt }
const loginFailMap   = new Map()  // ip → { count, lockedUntil }

// ══════════════════════════════════════════════════════════════════════════════
// 유틸리티
// ══════════════════════════════════════════════════════════════════════════════
function getClientIP(req) {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function rateLimit(key, max) {
  const now = Date.now()
  let rec = rateLimitMap.get(key)
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + WINDOW_MS }
  }
  rec.count++
  rateLimitMap.set(key, rec)
  // 메모리 정리
  if (rateLimitMap.size > 2000) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k)
    }
  }
  return {
    limited:   rec.count > max,
    remaining: Math.max(0, max - rec.count),
    resetAt:   rec.resetAt,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// blocked_ips DB 동기화 (v3.1 신규 — Supabase REST 폴링, 5분 캐시)
// ══════════════════════════════════════════════════════════════════════════════
async function syncBlockedIPs() {
  const now = Date.now()
  if (now - _blockedIPsCacheTs < BLOCKED_IPS_TTL) return // 캐시 유효
  try {
    const SB_URL = process.env.SUPABASE_URL
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SB_URL || !SB_KEY) return
    const r = await fetch(
      `${SB_URL}/rest/v1/blocked_ips?is_active=eq.true&select=ip_address&limit=500`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    )
    if (!r.ok) return
    const data = await r.json()
    if (!Array.isArray(data)) return
    _blockedIPsCache = new Set(data.map(row => row.ip_address).filter(Boolean))
    _blockedIPsCacheTs = now
  } catch { /* DB 장애 시 캐시 유지 */ }
}

// 로그인 실패 → DB blocked_ips 자동 기록 (MAX_AUTH_FAIL 초과 시)
async function syncLoginFailToDB(ip) {
  try {
    const SB_URL = process.env.SUPABASE_URL
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SB_URL || !SB_KEY) return
    const expiresAt = new Date(Date.now() + LOCKOUT_MS).toISOString()
    await fetch(`${SB_URL}/rest/v1/blocked_ips`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        ip_address:  ip,
        reason:      'login_lockout_auto',
        blocked_by:  'middleware_v3.1',
        is_active:   true,
        expires_at:  expiresAt,
      }),
    })
    // 캐시 즉시 갱신
    _blockedIPsCache.add(ip)
  } catch { /* 비동기 실패 무시 */ }
}

// ══════════════════════════════════════════════════════════════════════════════
// 로그인 실패 추적 / 계정 잠금 (설계도 §3 — 5회 실패 → 30분 잠금)
// ══════════════════════════════════════════════════════════════════════════════
function checkLoginLockout(ip) {
  const now = Date.now()
  const rec = loginFailMap.get(ip)
  if (!rec) return { locked: false }
  if (rec.lockedUntil && now < rec.lockedUntil) {
    return { locked: true, retryAfter: Math.ceil((rec.lockedUntil - now) / 1000) }
  }
  // 잠금 해제
  if (rec.lockedUntil && now >= rec.lockedUntil) {
    loginFailMap.delete(ip)
  }
  return { locked: false }
}

function recordLoginFailure(ip) {
  const now = Date.now()
  let rec = loginFailMap.get(ip) || { count: 0, lockedUntil: null }
  rec.count++
  if (rec.count >= MAX_AUTH_FAIL) {
    rec.lockedUntil = now + LOCKOUT_MS
    // 비동기로 DB에도 기록 (응답 지연 없이)
    syncLoginFailToDB(ip)
  }
  loginFailMap.set(ip, rec)
}

// ══════════════════════════════════════════════════════════════════════════════
// WAF — 악성 패턴 차단 v3.1 (설계도 §5, OWASP Top 10 확장)
// ══════════════════════════════════════════════════════════════════════════════
const WAF_PATTERNS = [
  // Path Traversal
  /\.\.[\\/\\]/,
  /%2e%2e[\\/\\%]/i,
  // XSS
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on\w+\s*=\s*["'`]?\s*\w/i,
  /data\s*:\s*text\/html/i,
  /<\s*iframe/i,
  /vbscript\s*:/i,
  // SQL Injection
  /\bunion\s+(all\s+)?select\b/i,
  /\bor\s+['"']?\d+['"']?\s*=\s*['"']?\d+/i,
  /\b(drop|alter|truncate|delete)\s+(table|database|from)\b/i,
  /\binsert\s+into\s+\w+\s*\(/i,
  /\bexec\s*\(/i,
  /\bxp_cmdshell\b/i,
  /;\s*(drop|select|insert|delete|update)\s/i,
  // Code Execution
  /\beval\s*\(/i,
  /\bbase64_decode\b/i,
  /\bsystem\s*\(/i,
  /\bpassthru\s*\(/i,
  /\bshell_exec\s*\(/i,
  /\bpopen\s*\(/i,
  // Shell injection
  /;\s*ls\s/i,
  /;\s*cat\s/i,
  /;\s*wget\s/i,
  /;\s*curl\s/i,
  /`[^`]{1,200}`/,
  /\$\([^)]{1,200}\)/,
  // Time-based blind SQLi
  /\bsleep\s*\(\s*\d+\s*\)/i,
  /\bbenchmark\s*\(\s*\d+/i,
  /\bwaitfor\s+delay\b/i,
  // Quote-based SQLi (admin'--)
  /['"]\s*--/,
  /['"]\s*#\s*$/,
  // 파일 탈취
  /\/etc\/passwd/i,
  /\/proc\/self/i,
  /\/windows\/win\.ini/i,
  // 환경변수 탈취
  /\.env(\.|$)/i,
  /\.git\/(config|HEAD)/i,
  // CMS 스캐너
  /wp-admin\//i,
  /wp-login\.php/i,
  /phpMyAdmin/i,
  /adminer\.php/i,
  // 파일 확장자 스캐너
  /\.(php|asp|aspx|jsp|cgi|sh|py|rb|pl)(\?|$)/i,
  // SSRF 방지 — 내부 IP 요청 (query string에 URL 포함 시)
  /[?&](url|src|dest|redirect|uri)=https?:\/\/(127\.|10\.|192\.168\.|169\.254\.|::1)/i,
  // ── v3.1 신규 패턴 ─────────────────────────────────────────
  // Log4Shell (CVE-2021-44228)
  /\$\{jndi:/i,
  /\$\{lower:/i,
  /\$\{upper:/i,
  // SSTI (Server-Side Template Injection)
  /\{\{.*\}\}/,           // Jinja2 / Handlebars
  /<%.*%>/,               // ERB / ASP
  /\$\{.*\}/,             // Freemarker / EL
  // CRLF Injection
  /%0d%0a/i,
  /%0a%0d/i,
  /\r\n(Set-Cookie|Location|Content-Type):/i,
  // XXE (XML External Entity)
  /<!ENTITY\s+\w+\s+SYSTEM/i,
  /<!DOCTYPE\s+\w+\s*\[/i,
  // Open Redirect 방지
  /[?&](redirect|return|next|url)=(?:https?:\/\/|\/\/)[^\/]/i,
]

const BLOCK_UA = [
  /sqlmap/i, /nikto/i, /nessus/i, /masscan/i, /zgrab/i,
  /nuclei/i, /nmap/i, /dirbuster/i, /gobuster/i, /wfuzz/i,
  /burpsuite/i, /burp\s*suite/i, /hydra/i, /metasploit/i, /arachni/i, /w3af/i,
  /openvas/i, /zap\//i, /havij/i, /acunetix/i, /appscan/i,
  /scrapy/i, /mechanize/i, /python-requests\/[01]\./i, // 구버전 자동화 클라이언트
]

// ══════════════════════════════════════════════════════════════════════════════
// AI username 보호 (설계도 §6 — IDOR 방지 + 계정 탈취 방지)
// ══════════════════════════════════════════════════════════════════════════════
const AI_USERNAME_PATTERNS = [
  /^ai_/i, /^insightship_/i, /^platform_/i, /^system_/i, /^admin_bot/i,
]

function isAIUsernameInQuery(url) {
  const username = url.searchParams.get('username') || ''
  return username && AI_USERNAME_PATTERNS.some(p => p.test(username))
}

// ══════════════════════════════════════════════════════════════════════════════
// CSRF 검증 (설계도 §5 — Origin/Referer 체크)
// ══════════════════════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  'https://pacm-platform.vercel.app',
  'https://www.insightship.kr',
  'https://insightship.kr',
]

function checkCSRF(req, path) {
  // 읽기 전용 메서드는 패스
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return { ok: true }
  // API가 아닌 경로는 패스
  if (!path.startsWith('/api/')) return { ok: true }
  // CRON 요청은 패스 (X-Cron-Secret 있으면)
  if (req.headers.get('x-cron-secret') || req.headers.get('x-vercel-cron')) return { ok: true }

  const origin  = req.headers.get('origin')  || ''
  const referer = req.headers.get('referer') || ''

  // Origin이 없으면 서버 간 요청 가능 (allow — CRON, server-side)
  if (!origin && !referer) return { ok: true }

  // Origin이 있으면 허용 목록 검사
  if (origin) {
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o)) ||
                      origin.includes('localhost') ||
                      origin.includes('127.0.0.1') ||
                      origin.includes('vercel.app')
    if (!isAllowed) {
      return { ok: false, reason: `CSRF: Origin not allowed — ${origin}` }
    }
  }
  return { ok: true }
}

// ══════════════════════════════════════════════════════════════════════════════
// 경로 분류 (v3.1 — AI 자율 운영 경로 추가)
// ══════════════════════════════════════════════════════════════════════════════
const STRICT_PATHS = [
  '/api/run-summarize', '/api/generate-report', '/api/send-newsletter',
  '/api/setup-db', '/api/db-setup', '/api/reset-summaries',
  '/api/reprocess-all-news', '/api/admin-action', '/api/admin-ai',
  '/api/staff-auth', '/api/sync-ai-accounts', '/api/patch-notes',
  '/api/dev-permissions', '/api/security-audit',
  '/api/ai-platform-operator',  // v3.1 추가 — 자율 운영 엔진
]
const AUTH_PATHS = [
  '/api/ai-mentor', '/api/ai-team', '/api/office',
  '/api/staff-chat', '/api/feedback-reply',
  '/api/ai-mentor-learn',       // v3.1 추가
]
const CRON_PATHS = [
  '/api/ai-workers', '/api/staff-chat-auto',
  '/api/auto-ops', '/api/ai-platform-operator',
]
const AUTH_FAIL_PATHS = [
  '/auth/v1/token', '/auth/v1/signup', '/api/auth/',
]
const REPORT_PATHS = ['/api/report']

// ══════════════════════════════════════════════════════════════════════════════
// 보안 응답 헤더 (설계도 §5 + §2 TLS)
// ══════════════════════════════════════════════════════════════════════════════
function applySecurityHeaders(res, path) {
  // 기본 보안 헤더
  res.headers.set('X-Content-Type-Options',    'nosniff')
  res.headers.set('X-Frame-Options',           'DENY')
  res.headers.set('X-XSS-Protection',          '1; mode=block')
  res.headers.set('Referrer-Policy',           'strict-origin-when-cross-origin')
  res.headers.set('X-DNS-Prefetch-Control',    'off')
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  res.headers.set('X-Download-Options',        'noopen')

  // HSTS (설계도 §2 — TLS 1.2/1.3 강제)
  res.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  )

  // COOP / COEP / CORP
  res.headers.set('Cross-Origin-Opener-Policy',   'same-origin-allow-popups')
  res.headers.set('Cross-Origin-Embedder-Policy', 'unsafe-none')
  res.headers.set('Cross-Origin-Resource-Policy', 'same-site')

  // Permissions-Policy — 불필요 브라우저 API 차단
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), midi=()'
  )

  // CSP (설계도 §5 XSS 방어)
  if (!path.startsWith('/api/')) {
    res.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://*.supabase.co https://*.naver.com https://*.naver.net https://ssl.pstatic.net https://*.pstatic.net https://image.pollinations.ai https://*.kakao.com https://img1.daumcdn.net https://t1.daumcdn.net https://images.unsplash.com",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://openapi.naver.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "upgrade-insecure-requests",
      ].join('; ')
    )
  }

  // API 전용 헤더
  if (path.startsWith('/api/')) {
    res.headers.set('X-Robots-Tag',    'noindex, nofollow')
    res.headers.set('Cache-Control',   'no-store, no-cache, must-revalidate, private')
    res.headers.set('Pragma',          'no-cache')
  }

  // v3.1 — 보안 버전 식별자
  res.headers.set('X-Security-Policy', 'middleware-v3.1')

  // dev-permissions 민감 헤더 노출 차단
  if (path.startsWith('/api/dev-permissions')) {
    res.headers.delete('X-Dev-Master-Key')
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }

  // security-audit 헤더 보호
  if (path.startsWith('/api/security-audit')) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }

  // ai-platform-operator 보호 — 응답에서 민감 컨텍스트 제거
  if (path.startsWith('/api/ai-platform-operator')) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    res.headers.set('Cache-Control', 'no-store, private')
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 메인 미들웨어
// ══════════════════════════════════════════════════════════════════════════════
export default async function middleware(req) {
  const ip   = getClientIP(req)
  const url  = new URL(req.url)
  const path = url.pathname
  const ua   = req.headers.get('user-agent') || ''
  const now  = Date.now()

  // ── 0. blocked_ips DB 동기화 (비동기, 캐시 5분 TTL) ──────────────────
  // 응답 지연 없이 백그라운드로 실행 (await 없음)
  syncBlockedIPs().catch(() => {})

  // ── 1. 악성 User-Agent 즉시 차단 ──────────────────────────────────────
  if (BLOCK_UA.some(re => re.test(ua))) {
    return new Response('Forbidden', { status: 403 })
  }

  // ── 2. WAF — 의심 URL/쿼리 패턴 차단 ─────────────────────────────────
  const fullUrl = decodeURIComponent(path + url.search)
  if (WAF_PATTERNS.some(re => re.test(fullUrl))) {
    return new Response(
      JSON.stringify({ error: 'Forbidden', code: 'WAF_BLOCKED' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── 2.5. DB 기반 blocked_ips 차단 (v3.1 신규) ─────────────────────────
  if (ip !== 'unknown' && _blockedIPsCache.has(ip)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden', code: 'IP_BLOCKED' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── 3. CSRF 검증 (설계도 §5) ──────────────────────────────────────────
  const csrf = checkCSRF(req, path)
  if (!csrf.ok) {
    return new Response(
      JSON.stringify({ error: 'Forbidden', code: 'CSRF_BLOCKED', reason: csrf.reason }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── 4. 로그인 경로 계정 잠금 확인 (설계도 §3 — 5회 실패 30분 잠금) ──
  const isAuthPath = AUTH_FAIL_PATHS.some(p => path.includes(p))
  if (isAuthPath && req.method === 'POST') {
    const lockout = checkLoginLockout(ip)
    if (lockout.locked) {
      return new Response(
        JSON.stringify({
          error: '로그인 시도 횟수 초과로 계정이 잠겼습니다.',
          retryAfter: lockout.retryAfter,
          code: 'ACCOUNT_LOCKED',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After':  String(lockout.retryAfter),
          },
        }
      )
    }
    // 실패 헤더가 있으면 카운트 증가 (API에서 X-Login-Failed 헤더를 설정)
    if (req.headers.get('x-login-failed') === '1') {
      recordLoginFailure(ip)
    }
  }

  // ── 5. AI username 탈취 방지 (POST/PATCH/PUT) ─────────────────────────
  if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
    if (isAIUsernameInQuery(url)) {
      return new Response(
        JSON.stringify({ error: 'Reserved username pattern', code: 'AI_USERNAME_PROTECTED' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  // ── 6. Rate Limiting (계층별) ─────────────────────────────────────────
  let rlResult
  let rlPolicy = 'general'
  if (path.startsWith('/api/dev-permissions') || path.startsWith('/api/security-audit')) {
    rlResult = rateLimit(`${ip}:devperms`, MAX_DEV_PERMS)
    rlPolicy = 'devperms'
  } else if (STRICT_PATHS.some(p => path.startsWith(p))) {
    rlResult = rateLimit(`${ip}:strict`, MAX_STRICT)
    rlPolicy = 'strict'
  } else if (REPORT_PATHS.some(p => path.startsWith(p))) {
    rlResult = rateLimit(`${ip}:report`, MAX_REPORT)
    rlPolicy = 'report'
  } else if (CRON_PATHS.some(p => path.startsWith(p))) {
    // CRON 경로 — x-vercel-cron 헤더 필수 (없으면 strict 적용)
    const isCron = req.headers.get('x-vercel-cron') === '1' ||
                   req.headers.get('x-cron-secret')
    rlResult = rateLimit(`${ip}:${isCron ? 'cron' : 'strict'}`, isCron ? MAX_CRON : MAX_STRICT)
    rlPolicy = isCron ? 'cron' : 'strict'
  } else if (AUTH_FAIL_PATHS.some(p => path.includes(p)) || AUTH_PATHS.some(p => path.startsWith(p))) {
    rlResult = rateLimit(`${ip}:auth`, MAX_AUTH)
    rlPolicy = 'auth'
  } else if (path.startsWith('/api/')) {
    rlResult = rateLimit(`${ip}:api`, MAX_API)
    rlPolicy = 'api'
  } else {
    rlResult = rateLimit(`${ip}:general`, MAX_GENERAL)
    rlPolicy = 'general'
  }

  if (rlResult.limited) {
    const retryAfter = Math.ceil((rlResult.resetAt - now) / 1000)
    return new Response(
      JSON.stringify({ error: 'Too Many Requests', retryAfter, code: 'RATE_LIMITED' }),
      {
        status: 429,
        headers: {
          'Content-Type':          'application/json',
          'Retry-After':           String(retryAfter),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset':     String(rlResult.resetAt),
          'X-RateLimit-Policy':    rlPolicy,
        },
      }
    )
  }

  // ── 7. dev-permissions 미들웨어 레벨 인증 (최고 등급) ────────────────
  if (path.startsWith('/api/dev-permissions')) {
    const authH = req.headers.get('authorization') || ''
    const cronH = req.headers.get('x-cron-secret') || ''
    if (!authH && !cronH) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', code: 'DEV_PERMS_BLOCKED' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  // ── 8. 응답 보안 헤더 적용 ────────────────────────────────────────────
  const res = NextResponse.next()
  applySecurityHeaders(res, path)
  res.headers.set('X-RateLimit-Remaining', String(rlResult.remaining))
  res.headers.set('X-RateLimit-Policy',    rlPolicy)

  return res
}
