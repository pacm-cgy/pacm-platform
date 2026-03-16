// ── 슬러그 자동 생성 ─────────────────────────────────────────
export function generateSlug(title) {
  if (!title) return `article-${Date.now()}`
  
  // 한글 → 로마자 변환 (간단한 매핑)
  const korToEng = {
    '가':'ga','나':'na','다':'da','라':'la','마':'ma','바':'ba','사':'sa','아':'a','자':'ja','차':'cha','카':'ka','타':'ta','파':'pa','하':'ha',
    '창':'chang','업':'up','스':'seu','타':'ta','트':'teu','업':'up','인':'in','사':'sa','이':'i','트':'teu',
  }
  
  const slug = title
    .toLowerCase()
    .replace(/[^\w가-힣\s-]/g, '') // 특수문자 제거
    .replace(/\s+/g, '-')           // 공백 → 하이픈
    .replace(/-+/g, '-')            // 중복 하이픈 제거
    .slice(0, 60)                   // 최대 60자
    .replace(/(^-|-$)/g, '')        // 앞뒤 하이픈 제거
  
  const rand = Math.random().toString(36).slice(2, 6)
  return slug ? `${slug}-${rand}` : `article-${Date.now()}-${rand}`
}

// ── 텍스트 유사도 (중복 체크용) ──────────────────────────────
export function textSimilarity(a, b) {
  if (!a || !b) return 0
  const wordsA = new Set(a.replace(/[^\w가-힣]/g, ' ').split(/\s+/).filter(w => w.length > 1))
  const wordsB = new Set(b.replace(/[^\w가-힣]/g, ' ').split(/\s+/).filter(w => w.length > 1))
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  return union === 0 ? 0 : intersection / union
}

// ── 날짜 포맷 ────────────────────────────────────────────────
export function formatDate(dateStr, format = 'relative') {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  
  if (format === 'relative') {
    if (diff < 60000) return '방금 전'
    if (diff < 3600000) return `${Math.floor(diff/60000)}분 전`
    if (diff < 86400000) return `${Math.floor(diff/3600000)}시간 전`
    if (diff < 604800000) return `${Math.floor(diff/86400000)}일 전`
    return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
  }
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ── 읽기 시간 계산 ───────────────────────────────────────────
export function calcReadTime(text) {
  if (!text) return 1
  const words = text.replace(/[^\w가-힣\s]/g, '').split(/\s+/).length
  return Math.max(1, Math.ceil(words / 300)) // 분당 300 단어
}

// ── 안전한 URL 확인 ──────────────────────────────────────────
export function isSafeUrl(url) {
  if (!url) return false
  try {
    const u = new URL(url)
    return ['http:', 'https:'].includes(u.protocol)
  } catch { return false }
}
