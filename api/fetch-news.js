// Vercel Serverless Function - 뉴스 자동 수집
// vercel.json crons: 매일 UTC 00:00 (KST 09:00)

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const RSS_FEEDS = [
  { url: 'https://news.google.com/rss/search?q=%EC%B2%AD%EC%86%8C%EB%85%84+%EC%B0%BD%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', category: 'story' },
  { url: 'https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%ED%88%AC%EC%9E%90&hl=ko&gl=KR&ceid=KR:ko', category: 'trend' },
  { url: 'https://news.google.com/rss/search?q=%EC%B0%BD%EC%97%85+%EC%9D%B8%EC%82%AC%EC%9D%B4%ED%8A%B8&hl=ko&gl=KR&ceid=KR:ko', category: 'insight' },
  { url: 'https://news.google.com/rss/search?q=AI+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%ED%95%9C%EA%B5%AD&hl=ko&gl=KR&ceid=KR:ko', category: 'trend' },
  { url: 'https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%EC%84%B1%EA%B3%B5%EC%82%AC%EB%A1%80&hl=ko&gl=KR&ceid=KR:ko', category: 'story' },
]

function makeSlug() {
  return `news-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
}

function extractSource(rawTitle) {
  const m = rawTitle?.match(/ - ([^-]+)$/)
  return m ? m[1].trim() : '뉴스'
}

async function parseRSS(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'InsightshipBot/1.0 (+https://www.insightship.pacm.kr)' },
      signal: AbortSignal.timeout(10000),
    })
    const xml = await res.text()
    const items = []
    const itemReg = /<item>([\s\S]*?)<\/item>/g
    let m
    while ((m = itemReg.exec(xml)) !== null) {
      const block = m[1]
      const get = (tag) => {
        const r = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`))
        return r ? (r[1] || r[2] || '').trim() : ''
      }
      const rawTitle = get('title')
      const sourceMeta = block.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/)
      const link = get('link') || get('guid')
      const description = get('description').replace(/<[^>]+>/g, '').slice(0, 400)
      if (!rawTitle || !link) continue
      items.push({
        title: rawTitle.replace(/ - [^-]+$/, '').slice(0, 200),
        link,
        description,
        pubDate: get('pubDate'),
        sourceName: sourceMeta ? sourceMeta[2].trim() : extractSource(rawTitle),
        sourceUrl: sourceMeta ? sourceMeta[1] : link,
      })
    }
    return items.slice(0, 5)
  } catch (e) {
    console.error('RSS error:', url, e.message)
    return []
  }
}

export default async function handler(req) {
  // Vercel Cron 자동 실행이거나 CRON_SECRET 인증
  const authHeader = req.headers.get('authorization')
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  if (!isVercelCron && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500 })
  }

  // 관리자 계정 조회
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?role=eq.admin&limit=1&select=id`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  )
  const profiles = await profileRes.json()
  if (!profiles?.length) {
    return new Response(JSON.stringify({ error: '관리자 계정 없음. Supabase에서 role=admin 설정 필요' }), { status: 500 })
  }
  const authorId = profiles[0].id

  const results = { inserted: 0, skipped: 0, errors: [] }

  for (const feed of RSS_FEEDS) {
    const items = await parseRSS(feed.url)
    for (const item of items) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            title: item.title,
            slug: makeSlug(),
            excerpt: item.description || item.title.slice(0, 200),
            body: `${item.description}\n\n[원문 보기](${item.link})`,
            category: feed.category,
            status: 'published',
            author_id: authorId,
            read_time: 2,
            source_name: item.sourceName,
            source_url: item.link,
            published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            tags: ['뉴스'],
            featured: false,
          }),
        })
        if (res.status === 201) results.inserted++
        else if (res.status === 409) results.skipped++ // duplicate
        else {
          const err = await res.text()
          results.errors.push(err.slice(0, 100))
        }
      } catch (e) {
        results.errors.push(e.message)
      }
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
