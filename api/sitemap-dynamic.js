/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP SEO 동적 사이트맵 생성기 v1.0                          ║
 * ║  설계서 §12 마케팅·SEO 전략 기반                                    ║
 * ║                                                                      ║
 * ║  포함 URL:                                                           ║
 * ║   - 정적 페이지 (/, /insight, /trend, /news, /edu, ...)             ║
 * ║   - 동적 아티클 (발행된 모든 기사)                                  ║
 * ║   - 이벤트 페이지 (진행 중 이벤트)                                  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
export const config = { runtime: 'edge', maxDuration: 30 }

const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE_URL = 'https://www.insightship.pacm.kr'

const H = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
})

// 정적 페이지 설정
const STATIC_PAGES = [
  { path: '/',           priority: '1.0', changefreq: 'daily' },
  { path: '/insight',    priority: '0.9', changefreq: 'daily' },
  { path: '/news',       priority: '0.9', changefreq: 'daily' },
  { path: '/trend',      priority: '0.8', changefreq: 'daily' },
  { path: '/community',  priority: '0.8', changefreq: 'hourly' },
  { path: '/mentor',     priority: '0.8', changefreq: 'weekly' },
  { path: '/ideas',      priority: '0.7', changefreq: 'daily' },
  { path: '/edu',        priority: '0.8', changefreq: 'weekly' },
  { path: '/events',     priority: '0.7', changefreq: 'daily' },
  { path: '/connect',    priority: '0.6', changefreq: 'weekly' },
  { path: '/story',      priority: '0.7', changefreq: 'weekly' },
  { path: '/about',      priority: '0.5', changefreq: 'monthly' },
  { path: '/terms',      priority: '0.3', changefreq: 'monthly' },
  { path: '/privacy',    priority: '0.3', changefreq: 'monthly' },
]

export default async function handler(req) {
  const today = new Date().toISOString().slice(0, 10)

  // 동적 아티클 조회
  let articles = []
  let events = []
  try {
    const artRes = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&select=slug,published_at,updated_at&order=published_at.desc&limit=1000`,
      { headers: H() }
    )
    articles = await artRes.json().catch(() => [])
    if (!Array.isArray(articles)) articles = []

    const evRes = await fetch(
      `${SB_URL}/rest/v1/events?select=id,updated_at&limit=200`,
      { headers: H() }
    )
    events = await evRes.json().catch(() => [])
    if (!Array.isArray(events)) events = []
  } catch {}

  const urls = []

  // 정적 페이지
  for (const p of STATIC_PAGES) {
    urls.push(`  <url>
    <loc>${BASE_URL}${p.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`)
  }

  // 뉴스 아티클
  for (const art of articles) {
    if (!art.slug) continue
    const lastmod = (art.updated_at || art.published_at || today).slice(0, 10)
    // 소스가 있는 뉴스 vs 에디터 아티클 구분
    const isNews = art.slug.startsWith('news-') || art.slug.includes('-news-')
    const pathPrefix = isNews ? '/news' : '/article'
    urls.push(`  <url>
    <loc>${BASE_URL}${pathPrefix}/${art.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`)
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>`

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
