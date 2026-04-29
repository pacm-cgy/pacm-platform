/**
 * Vercel Edge Middleware
 * - IP 기반 Rate Limiting (DDoS 방어)
 * - 의심 요청 차단 (SQL 인젝션 / path traversal / 스캐너)
 * - 보안 헤더 강화
 */
import { NextResponse } from 'next/server'
export const config = { matcher: ['/(.*)', '/api/:path*'] }

// ── Rate-Limit 설정 ─────────────────────────────────────────────────
const WINDOW_MS   = 60_000   // 1분
const MAX_REQ     = 80       // 일반 경로: 분당 80회
const MAX_API     = 40       // /api/*: 분당 40회
const MAX_STRICT  = 6        // 민감 API: 분당 6회
const MAX_AUTH    = 10       // 인증 경로: 분당 10회

// Edge 인스턴스당 메모리 (Vercel Edge는 요청마다 재사용)
const rateLimitMap = new Map()

function getClientIP(req) {
  return req.headers.get('cf-connecting-ip')      // Cloudflare
      || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown'
}

function rateLimit(key, max) {
  const now = Date.now()
  let rec = rateLimitMap.get(key)
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + WINDOW_MS }
  }
  rec.count++
  rateLimitMap.set(key, rec)
  // 메모리 정리 (1000개 초과 시 오래된 것 제거)
  if (rateLimitMap.size > 1000) {
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

// ── AI 직원 username 보호 패턴 (일반 유저 탈취 방지) ─────────────────
// 이 패턴과 일치하는 username으로 회원가입/프로필 수정 시도 차단
const AI_USERNAME_PATTERNS = [
  /^ai_/i,
  /^insightship_/i,
  /^platform_/i,
  /^system_/i,
  /^admin_bot/i,
]

// 회원가입/프로필 수정 API에서 AI username 탈취 시도 감지
function isAIUsernameHijack(req, body) {
  try {
    const path = new URL(req.url).pathname
    // 프로필 수정 또는 회원가입 경로만 검사
    if (!path.includes('/auth/') && !path.includes('/profiles') && !path.includes('/signup')) return false
    if (!body) return false
    const username = body?.username || body?.data?.username || ''
    return AI_USERNAME_PATTERNS.some(p => p.test(username))
  } catch { return false }
}

// ── 의심 패턴 차단 ───────────────────────────────────────────────────
const BLOCK_PATTERNS = [
  /\.\.[\/\\]/,                          // path traversal
  /<script/i,                            // XSS
  /union\s+select/i,                     // SQL injection
  /exec\s*\(/i,                          // code execution
  /eval\s*\(/i,
  /\bbase64_decode\b/i,
  /\/etc\/passwd/i,
  /\/proc\/self/i,
  /\.php$/i,                             // PHP 스캐너
  /\.asp(x)?$/i,                         // ASP 스캐너
  /\.env$/i,                             // 환경변수 탈취
  /wp-admin/i,                           // WordPress 스캐너
  /phpMyAdmin/i,
]

const BLOCK_UA = [
  /sqlmap/i, /nikto/i, /nessus/i, /masscan/i,
  /zgrab/i, /nuclei/i, /nmap/i, /dirbuster/i,
  /gobuster/i, /wfuzz/i, /burpsuite/i,
]

export default function middleware(req) {
  const ip  = getClientIP(req)
  const url = new URL(req.url)
  const path = url.pathname
  const ua  = req.headers.get('user-agent') || ''

  // ── 1. 악성 User-Agent 차단 ──────────────────────────────────────
  if (BLOCK_UA.some(re => re.test(ua))) {
    return new Response('Forbidden', { status: 403 })
  }

  // ── 2. 의심 URL 패턴 차단 ────────────────────────────────────────
  const fullUrl = path + url.search
  if (BLOCK_PATTERNS.some(re => re.test(fullUrl))) {
    return new Response('Forbidden', { status: 403 })
  }

  // ── 2-b. AI username 탈취 시도 차단 ─────────────────────────────
  // GET/HEAD 요청은 패스, POST/PATCH/PUT 프로필 수정 요청만 검사
  if (['POST','PATCH','PUT'].includes(req.method)) {
    try {
      const ct = req.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        // Edge 미들웨어에서는 body를 직접 읽을 수 없으므로 URL 파라미터 검사
        const usernameParam = url.searchParams.get('username') || ''
        if (usernameParam && AI_USERNAME_PATTERNS.some(p => p.test(usernameParam))) {
          return new Response(
            JSON.stringify({ error: 'Reserved username pattern', code: 'AI_USERNAME_PROTECTED' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          )
        }
      }
    } catch (_) {}
  }

  // ── 3. Rate Limiting ─────────────────────────────────────────────
  // 민감 API (cron 트리거 가능 경로)
  const STRICT_PATHS = [
    '/api/run-summarize', '/api/generate-report', '/api/send-newsletter',
    '/api/setup-db', '/api/db-setup', '/api/reset-summaries',
    '/api/reprocess-all-news', '/api/admin-action', '/api/admin-ai',
    '/api/staff-auth', '/api/sync-ai-accounts',
  ]
  // 인증 경로
  const AUTH_PATHS = ['/api/ai-mentor', '/api/ai-team', '/api/office', '/api/staff-chat']

  let rlResult
  if (STRICT_PATHS.some(p => path.startsWith(p))) {
    rlResult = rateLimit(`${ip}_strict`, MAX_STRICT)
  } else if (AUTH_PATHS.some(p => path.startsWith(p))) {
    rlResult = rateLimit(`${ip}_auth`, MAX_AUTH)
  } else if (path.startsWith('/api/')) {
    rlResult = rateLimit(`${ip}_api`, MAX_API)
  } else {
    rlResult = rateLimit(ip, MAX_REQ)
  }

  if (rlResult.limited) {
    const retryAfter = Math.ceil((rlResult.resetAt - Date.now()) / 1000)
    return new Response(
      JSON.stringify({ error: 'Too Many Requests', retryAfter }),
      {
        status: 429,
        headers: {
          'Content-Type':          'application/json',
          'Retry-After':           String(retryAfter),
          'X-RateLimit-Limit':     String(MAX_REQ),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset':     String(rlResult.resetAt),
        },
      }
    )
  }

  // ── 4. 응답 보안 헤더 주입 ───────────────────────────────────────
  const res = NextResponse.next()

  // 소스 보호: 개발자도구 콘솔 경고 + 클리핑 차단
  res.headers.set('X-Content-Type-Options',    'nosniff')
  res.headers.set('X-Frame-Options',           'DENY')
  res.headers.set('X-XSS-Protection',          '1; mode=block')
  res.headers.set('Referrer-Policy',           'strict-origin-when-cross-origin')
  res.headers.set('X-DNS-Prefetch-Control',    'off')
  res.headers.set('Cross-Origin-Opener-Policy','same-origin-allow-popups')
  res.headers.set('Cross-Origin-Embedder-Policy', 'unsafe-none')

  // Rate-Limit 응답 헤더
  res.headers.set('X-RateLimit-Remaining', String(rlResult.remaining))

  return res
}
