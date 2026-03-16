// Vercel Serverless Function - 뉴스 자동 수집
// 네이버 뉴스 검색 API 사용 (무료 25,000건/일)
// NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 환경변수 필요

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const NAVER_ID = process.env.NAVER_CLIENT_ID
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET
const CRON_SECRET = process.env.CRON_SECRET

const KEYWORDS = [
  { q: '청소년 창업', tag: '청소년창업' },
  { q: '스타트업 투자', tag: '스타트업투자' },
  { q: '창업 인사이트', tag: '창업인사이트' },
  { q: 'AI 스타트업', tag: 'AI스타트업' },
  { q: '유니콘 스타트업', tag: '유니콘' },
  { q: '스타트업 성공', tag: '성공사례' },
  { q: '청년 창업가', tag: '청년창업' },
  { q: '스타트업 시리즈A', tag: '투자' },
  { q: '에듀테크 스타트업', tag: '에듀테크' },
  { q: '창업 지원 프로그램', tag: '창업지원' },
  { q: '스타트업 IPO', tag: '투자' },
  { q: '핀테크 스타트업', tag: '핀테크' },
]

// OG 메타데이터 추출 (이미지, 설명)
async function fetchArticleContent(url) {
  try {
    const res = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (compatible; InsightshipBot/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return {}
    const html = await res.text()
    
    const getMeta = (prop) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=[\"']${prop}[\"'][^>]+content=[\"']([^\"']{1,500})[\"']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=[\"']([^\"']{1,500})[\"'][^>]+(?:property|name)=[\"']${prop}[\"']`, 'i'))
      return m ? m[1].trim() : null
    }

    // 본문 텍스트 추출 (주요 기사 본문 selector들)
    let bodyText = ''
    const bodyPatterns = [
      // article, .article-content, .article_body 등
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]+class=["'][^"']*(?:article[-_]?(?:body|content|text)|news[-_]?(?:body|content|text)|cont[-_]?(?:art|text)|story[-_]?body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      // 네이버 뉴스
      /<div[^>]+id=["']newsct_article["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class=["'][^"']*newsct[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    ]
    
    for (const pat of bodyPatterns) {
      const m = html.match(pat)
      if (m) {
        const raw = (m[1] || m[2] || '')
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&[a-z]+;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (raw.length > 200) { bodyText = raw.slice(0, 3000); break }
      }
    }

    return {
      image: getMeta('og:image') || getMeta('twitter:image'),
      description: getMeta('og:description') || getMeta('description') || getMeta('twitter:description'),
      bodyText,
    }
  } catch {
    return {}
  }
}

function makeSlug() {
  return `news-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function stripHtml(s) {
  if (!s) return ''
  return s.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim()
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
    return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), { status: 500 })
  }

  // 네이버 API 키 없으면 에러
  if (!NAVER_ID || !NAVER_SECRET) {
    return new Response(JSON.stringify({ error: 'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수 없음. https://developers.naver.com 에서 발급 필요' }), { status: 500 })
  }

  // 관리자 계정
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

  for (const { q, tag } of KEYWORDS) {
    try {
      // 네이버 뉴스 검색 API
      const naverRes = await fetch(
        `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=10&sort=date`,
        {
          headers: {
            'X-Naver-Client-Id': NAVER_ID,
            'X-Naver-Client-Secret': NAVER_SECRET,
          },
          signal: AbortSignal.timeout(8000),
        }
      )
      if (!naverRes.ok) {
        results.errors.push(`네이버 API 오류: ${naverRes.status}`)
        continue
      }
      const naverData = await naverRes.json()
      const items = naverData.items || []

      for (const item of items.slice(0, 5)) {
        const link = (item.originallink && item.originallink.startsWith('http')) ? item.originallink : item.link
        if (!link) continue
        if (await articleExists(link)) { results.skipped++; continue }

        const title = stripHtml(item.title).slice(0, 200)
        const description = stripHtml(item.description).slice(0, 400)

        // 원문 크롤링 (본문 + 이미지)
        let image = null
        let crawledBody = ''
        try {
          const meta = await fetchArticleContent(link)
          image = meta.image || null
          crawledBody = meta.bodyText || ''
        } catch {}
        const excerpt = description || title

        // 발행일
        let pubIso
        try { pubIso = new Date(item.pubDate).toISOString() }
        catch { pubIso = new Date().toISOString() }

        const article = {
          title,
          slug: makeSlug(),
          excerpt: (crawledBody.slice(0, 300) || description || title).slice(0, 400),
          body: crawledBody.length > 200 ? crawledBody : `${description}\n\n원문 보기: ${link}`,
          cover_image: image || null,
          category: 'news',
          status: 'published',
          author_id: authorId,
          read_time: 2,
          source_name: (() => {
          // 네이버 뉴스 제목에서 언론사 추출 시도
          const titleParts = item.title?.split(' - ');
          const fromTitle = titleParts?.length > 1 ? titleParts[titleParts.length-1].trim() : null;
          if (fromTitle && fromTitle.length < 30 && !fromTitle.includes('http')) return fromTitle;
          // URL에서 호스트 추출
          try {
            const url = new URL(item.originallink || item.link);
            const host = url.hostname.replace('www.','');
            // JWT 포함된 경우 스킵
            if (host.length > 30 || host.includes('=') || host.includes('%')) return '뉴스';
            return host;
          } catch { return '뉴스'; }
        })(),
          source_url: link,
          published_at: pubIso,
          tags: ['뉴스', tag],
          featured: false,
        }

        const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(article),
        })

        if (saveRes.status === 201) results.inserted++
        else {
          const err = await saveRes.text()
          if (!err.includes('23505')) results.errors.push(err.slice(0, 80))
          else results.skipped++
        }
      }
    } catch (e) {
      results.errors.push(`${tag}: ${e.message?.slice(0, 60)}`)
    }
  }

  // 새 기사가 있으면 비동기로 AI 요약 트리거 (응답 지연 없이)
  if (results.inserted > 0) {
    const host = new URL(req.url).origin
    fetch(host + '/api/summarize-news', { headers: { 'x-vercel-cron': '1' } }).catch(() => {})
  }

  return new Response(JSON.stringify({ ...results, timestamp: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
