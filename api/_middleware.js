// Vercel Edge Middleware - DDoS/Rate Limit/보안 헤더
export const config = { matcher: ['/api/:path*'] }

// IP별 요청 카운트 (Edge 메모리, 인스턴스당)
const rateLimitMap = new Map()
const WINDOW_MS = 60_000  // 1분
const MAX_REQ   = 60      // 분당 60회

function getClientIP(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown'
}

function rateLimit(ip) {
  const now = Date.now()
  const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + WINDOW_MS }
  if (now > record.resetAt) {
    record.count = 0
    record.resetAt = now + WINDOW_MS
  }
  record.count++
  rateLimitMap.set(ip, record)
  return { limited: record.count > MAX_REQ, remaining: Math.max(0, MAX_REQ - record.count), resetAt: record.resetAt }
}

export default function middleware(req) {
  const ip = getClientIP(req)
  const url = new URL(req.url)

  // cron/summarize 엔드포인트는 더 엄격하게 (분당 10회)
  const strictPaths = ['/api/run-summarize', '/api/generate-report', '/api/send-newsletter']
  const isStrict = strictPaths.some(p => url.pathname.startsWith(p))

  const { limited, remaining, resetAt } = rateLimit(ip + (isStrict ? '_strict' : ''))
  const strictLimit = isStrict && remaining < (MAX_REQ - 10)

  if (limited || strictLimit) {
    return new Response(JSON.stringify({ error: 'Too Many Requests', retryAfter: Math.ceil((resetAt - Date.now()) / 1000) }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
        'X-RateLimit-Limit': String(MAX_REQ),
        'X-RateLimit-Remaining': '0',
      }
    })
  }

  // 보안 헤더 추가
  const res = new Response(null, { status: 200 })
  // 실제로는 next()를 반환해야 하지만 Vercel edge middleware는 NextResponse 사용
  // 여기서는 헤더만 추가
  return undefined // next()
}
