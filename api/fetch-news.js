// Vercel Serverless Function - 뉴스 자동 수집
// Cron: 매시간 정각 (0 * * * *)

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// 모두 'news' 카테고리로 저장 (별도 뉴스 섹션)
const RSS_FEEDS = [
  { url: 'https://news.google.com/rss/search?q=%EC%B2%AD%EC%86%8C%EB%85%84+%EC%B0%BD%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', tag: '청소년창업' },
  { url: 'https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%ED%88%AC%EC%9E%90&hl=ko&gl=KR&ceid=KR:ko', tag: '스타트업투자' },
  { url: 'https://news.google.com/rss/search?q=%EC%B0%BD%EC%97%85+%EC%9D%B8%EC%82%AC%EC%9D%B4%ED%8A%B8&hl=ko&gl=KR&ceid=KR:ko', tag: '창업인사이트' },
  { url: 'https://news.google.com/rss/search?q=AI+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', tag: 'AI스타트업' },
  { url: 'https://news.google.com/rss/search?q=%EC%9C%A0%EB%8B%88%EC%BD%98+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', tag: '유니콘' },
]

function makeSlug() {
  return `news-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
      const sourceMeta = block.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/)
      // HTML 태그, CDATA 잔재, 특수문자 완전 제거
      const rawDesc = get('description')
      const description = rawDesc
        .replace(/<[^>]+>/g, '')           // HTML 태그 제거
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#[0-9]+;/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 400)
      if (!rawTitle || !link) continue
      items.push({
        title: rawTitle.replace(/ - [^-]+$/, '').trim().slice(0, 200),
        link,
        description,
        pubDate: get('pubDate'),
        sourceName: sourceMeta ? sourceMeta[2].trim() : extractSource(rawTitle),
        sourceUrl: link,
      })
    }
    return items.slice(0, 6)
  } catch (e) {
    return []
  }
}

async function articleExists(url) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_url=eq.${encodeURIComponent(url)}&select=id&limit=1`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  )
  const data = await res.json()
  return data?.length > 0
}

export default async function handler(req) {
  const authHeader = req.headers.get('authorization')
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  if (!isVercelCron && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수 없음' }), { status: 500 })
  }

  // 관리자 계정 조회
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?role=eq.admin&limit=1&select=id`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  )
  const profiles = await profileRes.json()
  if (!profiles?.length) {
    return new Response(JSON.stringify({ error: '관리자 계정 없음. SQL: UPDATE profiles SET role=admin WHERE email=...' }), { status: 500 })
  }
  const authorId = profiles[0].id

  const results = { inserted: 0, skipped: 0, errors: [] }

  for (const feed of RSS_FEEDS) {
    const items = await parseRSS(feed.url)
    for (const item of items) {
      try {
        // 중복 체크 (같은 URL 이미 존재하면 스킵)
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
            excerpt: item.description || item.title,
            body: item.description ? `${item.description}\n\n원문: ${item.link}` : `원문: ${item.link}`,
            category: 'insight',     // news enum 추가 전 임시 insight 사용
            status: 'published',
            author_id: authorId,
            read_time: 2,
            source_name: item.sourceName,
            source_url: item.link,
            published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            tags: ['뉴스', '자동수집', feed.tag],
            featured: false,
          }),
        })
        if (res.status === 201) results.inserted++
        else {
          const err = await res.text()
          // category enum 오류 시 insight로 fallback
          if (err.includes('invalid input value for enum') || err.includes('article_category')) {
            results.errors.push('news 카테고리 enum 미등록 - Supabase SQL 실행 필요')
          } else {
            results.errors.push(err.slice(0, 150))
          }
        }
      } catch (e) {
        results.errors.push(e.message?.slice(0, 100))
      }
    }
  }

  return new Response(JSON.stringify({ ...results, timestamp: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
