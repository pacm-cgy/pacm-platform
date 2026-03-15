// Vercel Serverless Function - 뉴스 자동 수집
// Cron: 매일 UTC 00:00 (KST 09:00)

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const RSS_FEEDS = [
  { url: 'https://news.google.com/rss/search?q=%EC%B2%AD%EC%86%8C%EB%85%84+%EC%B0%BD%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', tag: '청소년창업' },
  { url: 'https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%ED%88%AC%EC%9E%90&hl=ko&gl=KR&ceid=KR:ko', tag: '스타트업투자' },
  { url: 'https://news.google.com/rss/search?q=%EC%B0%BD%EC%97%85+%EC%9D%B8%EC%82%AC%EC%9D%B4%ED%8A%B8&hl=ko&gl=KR&ceid=KR:ko', tag: '창업인사이트' },
  { url: 'https://news.google.com/rss/search?q=AI+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', tag: 'AI스타트업' },
  { url: 'https://news.google.com/rss/search?q=%EC%9C%A0%EB%8B%88%EC%BD%98+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', tag: '유니콘' },
  { url: 'https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%EC%84%B1%EA%B3%B5&hl=ko&gl=KR&ceid=KR:ko', tag: '성공사례' },
]

// HTML 완전 제거 함수
function stripHtml(str) {
  if (!str) return ''
  return str
    .replace(/<[^>]+>/g, ' ')        // HTML 태그 제거
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#[0-9]+;/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function makeSlug() {
  return `news-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function extractSourceFromTitle(rawTitle) {
  const m = rawTitle?.match(/ - ([^-]+)$/)
  return m ? m[1].trim() : null
}

async function parseRSS(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'InsightshipBot/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    const items = []
    const itemReg = /<item>([\s\S]*?)<\/item>/g
    let m
    while ((m = itemReg.exec(xml)) !== null) {
      const block = m[1]
      const get = (tag) => {
        const r = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\/${tag}>`))
        return r ? (r[1] || r[2] || '').trim() : ''
      }
      const rawTitle = get('title')
      const link = get('link') || get('guid')
      if (!rawTitle || !link) continue

      // 소스 정보 추출
      const sourceMeta = block.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/)
      const sourceName = sourceMeta 
        ? stripHtml(sourceMeta[2]) 
        : extractSourceFromTitle(rawTitle)

      // 제목에서 출처 제거
      const cleanTitle = rawTitle.replace(/ - [^-]+$/, '').trim()
      
      // description에서 HTML 완전 제거
      const rawDesc = get('description')
      const cleanDesc = stripHtml(rawDesc).slice(0, 300)

      items.push({
        title: cleanTitle.slice(0, 200),
        link,
        description: cleanDesc,
        pubDate: get('pubDate'),
        sourceName: sourceName || '뉴스',
        sourceUrl: link,
      })
    }
    return items.slice(0, 6)
  } catch (e) {
    return []
  }
}

async function articleExists(url) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/articles?source_url=eq.${encodeURIComponent(url)}&select=id&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    )
    const data = await res.json()
    return Array.isArray(data) && data.length > 0
  } catch { return false }
}

export default async function handler(req) {
  const authHeader = req.headers.get('authorization')
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  if (!isVercelCron && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }), { status: 500 })
  }

  // 관리자 계정 조회
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?role=eq.admin&limit=1&select=id`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  )
  const profiles = await profileRes.json()
  if (!profiles?.length) {
    return new Response(JSON.stringify({ error: '관리자 계정 없음' }), { status: 500 })
  }
  const authorId = profiles[0].id

  const results = { inserted: 0, skipped: 0, errors: [] }

  for (const feed of RSS_FEEDS) {
    const items = await parseRSS(feed.url)
    for (const item of items) {
      try {
        // 중복 체크
        const exists = await articleExists(item.link)
        if (exists) { results.skipped++; continue }

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
            body: item.description 
              ? `${item.description}\n\n원문 보기: ${item.link}` 
              : `원문 보기: ${item.link}`,
            category: 'news',
            status: 'published',
            author_id: authorId,
            read_time: 2,
            source_name: item.sourceName,
            source_url: item.link,
            published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            tags: ['뉴스', feed.tag],
            featured: false,
          }),
        })
        if (res.status === 201) results.inserted++
        else {
          const err = await res.text()
          results.errors.push(err.slice(0, 100))
        }
      } catch (e) {
        results.errors.push(e.message?.slice(0, 80))
      }
    }
  }

  return new Response(JSON.stringify({ ...results, timestamp: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
