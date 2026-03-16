// OG 이미지 및 설명 재수집 - 기존 뉴스에서 이미지 없는 것들 처리
export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

async function fetchOgMeta(url) {
  if (!url) return {}
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InsightshipBot/1.0)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return {}
    const html = await res.text()
    const get = (prop) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
      return m ? m[1].trim() : null
    }
    const image = get('og:image') || get('twitter:image')
    const description = get('og:description') || get('description') || get('twitter:description')
    return { image, description }
  } catch {
    return {}
  }
}

export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  // cover_image 없는 뉴스 최대 10개씩 처리
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&cover_image=is.null&source_url=not.is.null&select=id,source_url&order=published_at.desc&limit=10`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY } }
  )
  const articles = await res.json()
  if (!articles?.length) return new Response(JSON.stringify({ message: '처리할 기사 없음' }), { status: 200 })

  const results = { updated: 0, failed: 0 }

  for (const article of articles) {
    const meta = await fetchOgMeta(article.source_url)
    if (!meta.image) { results.failed++; continue }

    // 이미지 URL 유효성 확인 (http로 시작)
    if (!meta.image.startsWith('http')) { results.failed++; continue }

    const r = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${article.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ cover_image: meta.image }),
    })
    if (r.status === 204) results.updated++
    else results.failed++
  }

  return new Response(JSON.stringify({ ...results, timestamp: new Date().toISOString() }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
