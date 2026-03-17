// 기존 뉴스 원문 재크롤링 - body를 짧은 snippet에서 실제 본문으로 교체
export const config = { runtime: 'edge' }

const SB_URL  = process.env.SUPABASE_URL
const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

async function crawlBody(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InsightshipBot/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const patterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]+(?:article[-_]?(?:body|content|text)|news[-_]?(?:body|content|text)|newsct_article)[^>]*>([\s\S]*?)<\/div>/i,
    ]
    for (const pat of patterns) {
      const m = html.match(pat)
      if (m) {
        const raw = (m[1] || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim()
        if (raw.length > 200) return raw.slice(0, 3000)
      }
    }
    // OG description fallback
    const og = html.match(/<meta[^>]+(?:property|name)=["']og:description["'][^>]+content=["']([^"']{50,}?)["']/i)
    if (og) return og[1].trim()
    return null
  } catch { return null }
}

export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }

  // body에 "원문 보기:" 텍스트가 있는 것 = snippet만 있는 기사
  // OR body가 없는 것
  const r = await fetch(
    `${SB_URL}/rest/v1/articles?status=eq.published&source_url=not.is.null&or=(body.like.*원문 보기*,body.is.null)&select=id,title,source_url,body&order=published_at.desc&limit=10`,
    { headers: H }
  )
  const articles = await r.json()
  if (!Array.isArray(articles) || !articles.length) {
    return new Response(JSON.stringify({ message: '처리할 기사 없음' }), { status: 200 })
  }

  // body 짧은 것만 필터
  const shortBody = articles.filter(a => (a.body?.length || 0) < 300 && a.source_url)

  let done = 0, failed = 0, skipped = 0
  for (const a of shortBody) {
    if (!a.source_url || a.source_url.includes('naver.com/redirect')) { skipped++; continue }
    const newBody = await crawlBody(a.source_url)
    if (!newBody || newBody.length < 100) { failed++; continue }

    const upR = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${a.id}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        body: newBody,
        excerpt: newBody.slice(0, 300),
        ai_summary: null, // 재요약 필요
        read_time: Math.max(1, Math.ceil(newBody.length / 400)),
      }),
    })
    if (upR.ok || upR.status === 204) done++; else failed++
    await new Promise(r => setTimeout(r, 200))
  }

  return new Response(JSON.stringify({
    checked: articles.length, short_body: shortBody.length, done, failed, skipped,
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
