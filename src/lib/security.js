// ================================================================
// Insightship Security Module
// - 콘솔 남용 방지 (devtools 감지)
// - Rate limiting (Supabase 과부하 방지)
// - XSS 입력 검증
// - 에러 메시지 노출 최소화
// ================================================================

// ── 1. 프로덕션 콘솔 보호 ─────────────────────────────────────
export function initSecurityGuards() {
  if (import.meta.env.DEV) return // 개발 환경은 적용 안 함

  // 콘솔 메서드 오버라이드 (에러/경고만 허용, 일반 log 차단)
  const noop = () => {}
  const originalError = console.error.bind(console)
  const originalWarn = console.warn.bind(console)

  console.log = noop
  console.debug = noop
  console.info = noop
  console.table = noop
  console.dir = noop
  // error/warn은 유지 (Sentry 등 연동 위해)
  console.error = originalError
  console.warn = originalWarn

  // DevTools 열림 감지 → 경고만 출력 (사이트 마비 금지)
  let devtoolsOpen = false
  const threshold = 160

  const detectDevTools = () => {
    const widthDiff = window.outerWidth - window.innerWidth > threshold
    const heightDiff = window.outerHeight - window.innerHeight > threshold
    if ((widthDiff || heightDiff) && !devtoolsOpen) {
      devtoolsOpen = true
      // 페이지 마비가 아닌 조용한 감지만
    } else if (!widthDiff && !heightDiff) {
      devtoolsOpen = false
    }
  }
  window.addEventListener('resize', detectDevTools, { passive: true })

  // Prototype 오염 방지
  // Object.prototype freeze 제거 - React/Vite가 Object를 수정하므로 앱 전체 크래시 유발
  // 대신 __proto__ 직접 변조 감지만 수행
  try {
    Object.defineProperty(Object.prototype, '__proto__', {
      set(val) {
        // 프로토타입 오염 시도 무시
      }
    })
  } catch {}
}

// ── 2. 입력값 XSS 검증 ───────────────────────────────────────
const DANGEROUS_PATTERNS = [
  /<script/i, /javascript:/i, /on\w+\s*=/i,
  /data:text\/html/i, /vbscript:/i, /<iframe/i,
  /document\.cookie/i, /document\.write/i,
  /window\.location/i, /eval\s*\(/i,
]

export function sanitizeInput(value) {
  if (typeof value !== 'string') return value
  // HTML 이스케이프
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .slice(0, 10000) // 최대 길이 제한
}

export function validateInput(value, maxLength = 1000) {
  if (typeof value !== 'string') return { ok: false, error: '잘못된 입력입니다' }
  if (value.length > maxLength) return { ok: false, error: '입력이 너무 깁니다' }
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(value)) return { ok: false, error: '허용되지 않는 문자가 포함되어 있습니다' }
  }
  return { ok: true }
}

// ── 3. 클라이언트 Rate Limiting ──────────────────────────────
const rateLimitMap = new Map()

export function checkRateLimit(key, maxRequests = 10, windowMs = 60000) {
  const now = Date.now()
  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs }

  if (now > record.resetAt) {
    record.count = 0
    record.resetAt = now + windowMs
  }
  record.count++
  rateLimitMap.set(key, record)

  if (record.count > maxRequests) {
    const remaining = Math.ceil((record.resetAt - now) / 1000)
    return { limited: true, retryAfter: remaining }
  }
  return { limited: false }
}

// ── 4. 에러 메시지 안전화 ────────────────────────────────────
export function safeErrorMessage(error) {
  if (import.meta.env.DEV) return error?.message || '알 수 없는 오류'
  // 프로덕션: 내부 정보 노출 방지
  const msg = error?.message || ''
  if (msg.includes('JWT') || msg.includes('token') || msg.includes('key') ||
      msg.includes('secret') || msg.includes('password') || msg.includes('auth')) {
    return '인증 오류가 발생했습니다'
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed')) {
    return '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요'
  }
  if (msg.includes('duplicate') || msg.includes('23505')) {
    return '이미 존재하는 항목입니다'
  }
  return '오류가 발생했습니다. 잠시 후 다시 시도해주세요'
}

// ── 5. URL 파라미터 검증 ─────────────────────────────────────
export function validateSlug(slug) {
  if (!slug || typeof slug !== 'string') return false
  // slug는 소문자, 숫자, 하이픈만 허용
  return /^[a-z0-9-]+$/.test(slug) && slug.length <= 200
}

// ── 6. 클립보드 인젝션 방지 ──────────────────────────────────
export function initPasteGuard(formElement) {
  if (!formElement) return
  formElement.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') || ''
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(text)) {
        e.preventDefault()
        console.warn('보안: 위험한 내용이 감지되어 붙여넣기가 차단됐습니다')
        return
      }
    }
  })
}
