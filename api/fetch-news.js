// Vercel Serverless Function - 뉴스 자동 수집
// Vercel Cron으로 매일 오전 9시 실행
// vercel.json crons 설정 필요

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// 구글 뉴스 RSS 키워드 목록 (창업/스타트업 관련)
const RSS_FEEDS = [
  { url: 'https://news.google.com/rss/search?q=청소년+창업&hl=ko&gl=KR&ceid=KR:ko', category: 'story' },
  { url: 'https://news.google.com/rss/search?q=스타트업+투자&hl=ko&gl=KR&ceid=KR:ko', category: 'trend' },
  { url: 'https://news.google.com/rss/search?q=창업+인사이트&hl=ko&gl=KR&ceid=KR:ko', category: 'insight' },
  { url: 'https://news.google.com/rss/search?q=AI+스타트업+한국&hl=ko&gl=KR&ceid=KR:ko', category: 'trend' },
  { url: 'https://news.google.com/rss/search?q=스타트업+성공사례&hl=ko&gl=KR&ceid=KR:ko', category: 'story' },
]

function slugify(text) {
  const timestamp = Date.now()
  const clean = text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50)
  return `${clean}-${timestamp}`
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

function extractSource(item) {
  // RSS source 태그 또는 title에서 출처 추출
  if (item.source) return item.source
  const titleMatch = item.title?.match(/- ([^-]+)$/)
  return titleMatch ? titleMatch[1].trim() : '뉴스'
}

function estimateReadTime(text) {
  const words = text.split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200))
}

async function parseRSS(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'InsightshipBot/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    const xml = await res.text()
    const items = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1]
      const get = (tag) => {
        const m = item.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`))
        return m ? (m[1] || m[2] || '').trim() : ''
      }
      const sourceMatch = item.match(/<source[^>]*url="([^"]*)"[^>]*>([^<]*)<\/source>/)
      items.push({
        title: get('title').replace(/ - [^-]+$/, ''), // 출처 제거 후 제목만
        link: get('link') || get('guid'),
        description: get('description').replace(/<[^>]+>/g, '').slice(0, 300),
        pubDate: get('pubDate'),
        source: sourceMatch ? sourceMatch[2].trim() : extractSource({ title: get('title') }),
        sourceUrl: sourceMatch ? sourceMatch[1] : '',
      })
    }
    return items.slice(0, 5) // 피드당 최대 5개
  } catch (e) {
    console.error('RSS fetch error:', url, e.message)
    return []
  }
}

async function supabaseRequest(path, method = 'GET', body = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: body ? JSON.stringify(body) : null,
  })
  if (!res.ok && method !== 'POST') {
    const err = await res.text()
    throw new Error(`Supabase error: ${err}`)
  }
  return res
}

export default async function handler(req) {
  // Cron 인증
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const results = { inserted: 0, skipped: 0, errors: [] }

  // system 계정 찾기 (뉴스 자동 수집용)
  const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.admin&limit=1`, {
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
  })
  const profiles = await profileRes.json()
  if (!profiles.length) {
    return new Response(JSON.stringify({ error: '관리자 계정 없음' }), { status: 500 })
  }
  const authorId = profiles[0].id

  for (const feed of RSS_FEEDS) {
    const items = await parseRSS(feed.url)
    for (const item of items) {
      if (!item.title || !item.link) continue
      try {
        const slug = slugify(item.title)
        const excerpt = item.description || item.title
        const body = `${item.description || ''}\n\n[원문 보기](${item.link})`
        await supabaseRequest('/articles', 'POST', {
          title: item.title.slice(0, 200),
          slug,
          excerpt: excerpt.slice(0, 500),
          body,
          category: feed.category,
          status: 'published',
          author_id: authorId,
          read_time: estimateReadTime(body),
          source_name: item.source,
          source_url: item.link,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          tags: ['뉴스', '자동수집'],
          featured: false,
        })
        results.inserted++
      } catch (e) {
        if (e.message?.includes('duplicate') || e.message?.includes('unique')) {
          results.skipped++
        } else {
          results.errors.push(e.message)
        }
      }
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
