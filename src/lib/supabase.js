import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // 보안: httpOnly 쿠키 방식 권장하나 브라우저 제한으로 localStorage 사용
    storageKey: 'pacm_auth',
  },
  global: {
    headers: {
      'x-client-info': 'pacm-app/1.0',
    },
  },
  db: {
    schema: 'public',
  },
  realtime: {
    params: {
      eventsPerSecond: 10, // Rate limit realtime
    },
  },
})

// ── 보안 헬퍼: 현재 세션 유효성 검사 ──────────────────────────────
export async function getSecureSession() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) return null
  // 토큰 만료 임박 시 자동 갱신
  const expiresAt = session.expires_at * 1000
  const now = Date.now()
  if (expiresAt - now < 5 * 60 * 1000) {
    const { data } = await supabase.auth.refreshSession()
    return data.session
  }
  return session
}

// ── Storage 헬퍼: 이미지 업로드 (type/size 검증 포함) ─────────────
export async function uploadImage(file, bucket = 'article-images') {
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  const MAX_SIZE = 5 * 1024 * 1024 // 5MB

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('허용되지 않는 파일 형식입니다. (JPEG, PNG, WebP, GIF만 가능)')
  }
  if (file.size > MAX_SIZE) {
    throw new Error('파일 크기는 5MB 이하여야 합니다.')
  }

  const ext = file.name.split('.').pop().toLowerCase()
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg'
  // 랜덤 파일명으로 저장 (경로 추측 방지)
  const fileName = `${crypto.randomUUID()}.${safeExt}`
  const filePath = `${new Date().getFullYear()}/${fileName}`

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (error) throw error

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path)

  return urlData.publicUrl
}

// ── Rate limiter (클라이언트 측 추가 보호) ─────────────────────────
const requestCounts = new Map()
export function checkRateLimit(key, maxRequests = 10, windowMs = 60000) {
  const now = Date.now()
  const windowStart = now - windowMs
  const timestamps = (requestCounts.get(key) || []).filter(t => t > windowStart)
  if (timestamps.length >= maxRequests) {
    throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.')
  }
  timestamps.push(now)
  requestCounts.set(key, timestamps)
}

// ── XSS 방지: 텍스트 sanitize ─────────────────────────────────────
export function sanitizeText(text) {
  if (typeof text !== 'string') return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim()
}
