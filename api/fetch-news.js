/**
 * api/fetch-news.js
 * Insightship 뉴스 자동 수집기 v2
 * 설계서 v1.0 §10 기반 — RSS 6개 소스 + 네이버 뉴스 API 병용
 *
 * 수집 소스 (설계서 §10):
 *   1. 네이버 뉴스 검색 API (무료 25,000건/일)
 *   2. 벤처스퀘어 RSS
 *   3. 플래텀 RSS
 *   4. 스타트업 투데이 RSS
 *   5. 중소벤처기업부 공지 RSS
 *   6. Google News RSS (창업/스타트업)
 *
 * 중복 제거 (설계서 §8):
 *   1차: URL 해시 기반
 *   2차: 제목 코사인 유사도 ≥ 0.72
 *
 * POST /api/fetch-news  (x-vercel-cron: 1 또는 Authorization: Bearer CRON_SECRET)
 */
export const config = { runtime: 'edge', maxDuration: 60 }

const SUPABASE_URL  = process.env.SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const NAVER_ID      = process.env.NAVER_CLIENT_ID
const NAVER_SECRET  = process.env.NAVER_CLIENT_SECRET
const CRON_SECRET   = process.env.CRON_SECRET

// ══════════════════════════════════════════════════════════════════════
// §1. 수집 설정 — 설계서 §10 소스 목록
// ══════════════════════════════════════════════════════════════════════

// 네이버 API 키워드 (설계서 §10 기반 확장)
const NAVER_KEYWORDS = [
  { q: '청소년 창업',         tag: '청소년창업',   cat: 'youth' },
  { q: '청년 창업가',         tag: '청년창업',     cat: 'youth' },
  { q: '스타트업 투자',       tag: '스타트업투자', cat: 'investment' },
  { q: '스타트업 시리즈A',    tag: '투자',         cat: 'investment' },
  { q: '스타트업 IPO',        tag: '투자',         cat: 'investment' },
  { q: 'AI 스타트업',         tag: 'AI스타트업',   cat: 'tech' },
  { q: '인공지능 스타트업',   tag: 'AI스타트업',   cat: 'tech' },
  { q: '유니콘 스타트업',     tag: '유니콘',       cat: 'investment' },
  { q: '에듀테크 스타트업',   tag: '에듀테크',     cat: 'edutech' },
  { q: '핀테크 스타트업',     tag: '핀테크',       cat: 'fintech' },
  { q: '창업 지원 프로그램',  tag: '창업지원',     cat: 'policy' },
  { q: '예비창업패키지',      tag: '정부지원',     cat: 'policy' },
  { q: '중기부 창업',         tag: '정부지원',     cat: 'policy' },
  { q: '스타트업 성공사례',   tag: '성공사례',     cat: 'startup' },
  { q: '소셜벤처 임팩트',     tag: 'ESG',          cat: 'esg' },
  { q: '헬스케어 스타트업',   tag: '헬스케어',     cat: 'health' },
]

// RSS 피드 소스 (설계서 §10 — 벤처스퀘어, 플래텀, 스타트업투데이, 중기부, 구글뉴스)
const RSS_SOURCES = [
  {
    name: '벤처스퀘어',
    url:  'https://www.venturesquare.net/feed',
    cat:  'startup',
    tag:  '스타트업',
  },
  {
    name: '플래텀',
    url:  'https://platum.kr/feed',
    cat:  'startup',
    tag:  '스타트업',
  },
  {
    name: '스타트업 투데이',
    url:  'https://www.startuptoday.kr/rss/allArticle.xml',
    cat:  'startup',
    tag:  '창업',
  },
  {
    name: '중소벤처기업부',
    url:  'https://www.mss.go.kr/site/smba/ex/rss/rssView.do',
    cat:  'policy',
    tag:  '정부지원',
  },
  {
    name: 'Google News 창업',
    url:  'https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%EC%B0%BD%EC%97%85&hl=ko&gl=KR&ceid=KR:ko',
    cat:  'startup',
    tag:  '창업',
  },
  {
    name: 'Google News AI스타트업',
    url:  'https://news.google.com/rss/search?q=AI+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko',
    cat:  'tech',
    tag:  'AI스타트업',
  },
]

// ══════════════════════════════════════════════════════════════════════
// §2. 중복 감지 — URL + 제목 코사인 유사도 (설계서 §8)
// ══════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로',
  '하지만','그러나','또한','따라서','때문에','위해','통해','대한',
  '있는','없는','되는','하는','있다','없다','된다','이번','지난',
])

function tokenizeTitle(text) {
  if (!text) return []
  return (text.replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g, ' ')
    .toLowerCase()
    .match(/[가-힣]{2,}|[a-z]{3,}/g) || [])
    .filter(t => !STOPWORDS.has(t) && t.length >= 2)
}

function cosineSim(a, b) {
  const setA = new Set(a), setB = new Set(b)
  const inter = [...setA].filter(x => setB.has(x)).length
  const denom = Math.sqrt(setA.size) * Math.sqrt(setB.size)
  return denom > 0 ? inter / denom : 0
}

// 배치 중복 감지용 세션 캐시
const sessionTitles = []
function isSessionDuplicate(title) {
  const toks = tokenizeTitle(title)
  for (const existing of sessionTitles) {
    if (cosineSim(toks, tokenizeTitle(existing)) >= 0.72) return true
  }
  return false
}

// ══════════════════════════════════════════════════════════════════════
// §3. 유틸리티
// ══════════════════════════════════════════════════════════════════════

function makeSlug() {
  return `news-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function stripHtml(s) {
  if (!s) return ''
  return s.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function estimateReadTime(text) {
  return Math.max(1, Math.ceil((text || '').length / 350))
}

// 언론사 이름 추출 (네이버 제목 패턴 or URL 호스트)
function extractSourceName(itemTitle, linkUrl) {
  // "제목 - 언론사명" 패턴
  const parts = (itemTitle || '').split(' - ')
  if (parts.length > 1) {
    const candidate = parts[parts.length - 1].trim()
    if (candidate.length >= 2 && candidate.length < 30 && !candidate.includes('http')) return candidate
  }
  try {
    const host = new URL(linkUrl).hostname.replace('www.', '')
    if (host.length <= 30 && !host.includes('=') && !host.includes('%')) return host
  } catch {}
  return '뉴스'
}

// ══════════════════════════════════════════════════════════════════════
// §4. 원문 크롤러 — 본문 텍스트 + OG 이미지 추출
// ══════════════════════════════════════════════════════════════════════

async function fetchArticleContent(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InsightshipBot/2.0; +https://insightship.kr)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return {}
    const html = await res.text()

    // OG 메타 추출 헬퍼
    const getMeta = (prop) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']{1,600})["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']{1,600})["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
      return m ? m[1].trim() : null
    }

    // 본문 추출 패턴 (네이버·일반 언론사·구글뉴스 대응)
    let bodyText = ''
    const bodyPatterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]+id=["']newsct_article["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class=["'][^"']*(?:article[-_]?(?:body|content|text)|news[-_]?(?:body|content|text)|story[-_]?body|post[-_]?body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class=["'][^"']*newsct[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<section[^>]+class=["'][^"']*article[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
    ]
    for (const pat of bodyPatterns) {
      const m = html.match(pat)
      if (m) {
        let raw = (m[1] || m[2] || '')
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&[a-z#0-9]+;/g, ' ')
          .replace(/공유하기[^가-힣]{0,30}/g, '')
          .replace(/페이스북|트위터|카카오톡|네이버\s*밴드|URL\s*복사/g, '')
          .replace(/입력\s*\d{4}\.\d{2}\.\d{2}/g, '')
          .replace(/수정\s*\d{4}\.\d{2}\.\d{2}/g, '')
          .replace(/기자\s*[가-힣]{2,4}\s*기자/g, '')
          .replace(/무단전재\s*및?\s*재배포\s*금지/g, '')
          .replace(/저작권자\s*©[^가-힣]{0,60}/g, '')
          .replace(/https?:\/\/[^\s]{5,80}/g, '')
          .replace(/\s+/g, ' ').trim()
        if (raw.length > 200) { bodyText = raw.slice(0, 3000); break }
      }
    }

    const rawDesc = getMeta('og:description') || getMeta('description') || getMeta('twitter:description') || ''
    const cleanDesc = rawDesc.replace(/공유하기|페이스북|트위터|카카오|https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim()

    return {
      image:    getMeta('og:image') || getMeta('twitter:image') || null,
      ogTitle:  getMeta('og:title') || null,
      description: cleanDesc,
      bodyText,
    }
  } catch { return {} }
}

// ══════════════════════════════════════════════════════════════════════
// §5. DB 중복 체크 — URL + 당일 제목 (설계서 §8)
// ══════════════════════════════════════════════════════════════════════

async function articleExistsInDB(url, title, H) {
  try {
    const [r1, r2] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/articles?source_url=eq.${encodeURIComponent(url)}&select=id&limit=1`, { headers: H }),
      title ? fetch(
        `${SUPABASE_URL}/rest/v1/articles?title=eq.${encodeURIComponent(title)}&published_at=gte.${new Date().toISOString().slice(0,10)}&select=id&limit=1`,
        { headers: H }
      ) : Promise.resolve(null),
    ])
    const d1 = await r1.json()
    if (Array.isArray(d1) && d1.length > 0) return true
    if (r2) {
      const d2 = await r2.json()
      if (Array.isArray(d2) && d2.length > 0) return true
    }
    return false
  } catch { return false }
}

// ══════════════════════════════════════════════════════════════════════
// §6. RSS 파서 — Atom/RSS2.0 대응
// ══════════════════════════════════════════════════════════════════════

async function fetchRSS(source) {
  try {
    const res = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InsightshipBot/2.0)',
        'Accept': 'application/rss+xml, application/atom+xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const xml = await res.text()

    // RSS item 추출
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
    const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi
    const items = []

    const extractField = (block, tags) => {
      for (const tag of tags) {
        const m = block.match(new RegExp(`<${tag}[^>]*>(?:<![CDATA[)?([\s\S]*?)(?:\]\]>)?<\/${tag}>`, 'i'))
          || block.match(new RegExp(`<${tag}[^>]*href=["']([^"']+)["']`, 'i'))
        if (m && m[1]?.trim()) return m[1].trim()
      }
      return null
    }

    let match
    const regex = xml.includes('<item') ? itemRegex : entryRegex
    while ((match = regex.exec(xml)) !== null) {
      const block = match[1]
      const title       = stripHtml(extractField(block, ['title']) || '')
      const link        = extractField(block, ['link', 'guid']) || ''
      const description = stripHtml(extractField(block, ['description', 'summary', 'content']) || '')
      const pubDate     = extractField(block, ['pubDate', 'published', 'updated']) || ''

      if (!title || !link) continue
      items.push({ title, link: link.replace(/&amp;/g, '&'), description, pubDate, source: source.name })
    }
    return items.slice(0, 8)
  } catch { return [] }
}

// ══════════════════════════════════════════════════════════════════════
// §7. 기사 저장
// ══════════════════════════════════════════════════════════════════════

async function saveArticle({ title, link, description, pubDate, image, bodyText, sourceName, tag, cat }, authorId, H) {
  const body    = bodyText && bodyText.length > 200 ? bodyText : (description || title)
  const excerpt = (bodyText.length > 200 ? bodyText.slice(0, 400) : description || title).slice(0, 400)
  let pubIso
  try { pubIso = new Date(pubDate).toISOString() } catch { pubIso = new Date().toISOString() }

  const article = {
    title:        title.slice(0, 200),
    slug:         makeSlug(),
    excerpt,
    body,
    cover_image:  image || null,
    category:     'news',
    status:       'published',
    author_id:    authorId,
    read_time:    estimateReadTime(body),
    source_name:  sourceName,
    source_url:   link,
    published_at: pubIso,
    tags:         ['뉴스', tag],
    featured:     false,
    is_duplicate: false,
    ai_category:  cat || 'startup',
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify(article),
  })
  return res.status === 201 || res.status === 204
    ? { ok: true }
    : { ok: false, err: (await res.text()).slice(0, 80) }
}

// ══════════════════════════════════════════════════════════════════════
// §8. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  const authHeader   = req.headers.get('authorization')
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  if (!isVercelCron && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), { status: 500 })
  }

  const H = {
    'Content-Type':  'application/json',
    apikey:          SUPABASE_KEY,
    Authorization:   `Bearer ${SUPABASE_KEY}`,
  }

  // 관리자(author) ID 조회
  let authorId = null
  try {
    const pRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.admin&limit=1&select=id`, { headers: H })
    const profiles = await pRes.json()
    authorId = profiles?.[0]?.id || null
  } catch {}
  if (!authorId) {
    return new Response(JSON.stringify({ error: '관리자 계정 없음 — profiles 테이블에 role=admin 계정 필요' }), { status: 500 })
  }

  const results = { inserted: 0, skipped: 0, errors: [], sources: {} }

  // ── A. 네이버 뉴스 API 수집 ────────────────────────────────────────
  if (NAVER_ID && NAVER_SECRET) {
    for (const { q, tag, cat } of NAVER_KEYWORDS) {
      try {
        const naverRes = await fetch(
          `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=8&sort=date`,
          {
            headers: { 'X-Naver-Client-Id': NAVER_ID, 'X-Naver-Client-Secret': NAVER_SECRET },
            signal: AbortSignal.timeout(8000),
          }
        )
        if (!naverRes.ok) { results.errors.push(`네이버[${q}]: ${naverRes.status}`); continue }
        const { items = [] } = await naverRes.json()

        for (const item of items.slice(0, 5)) {
          const link  = (item.originallink?.startsWith('http')) ? item.originallink : item.link
          const title = stripHtml(item.title).slice(0, 200)
          if (!link || !title) continue
          if (isSessionDuplicate(title)) { results.skipped++; continue }
          if (await articleExistsInDB(link, title, H)) { results.skipped++; continue }

          const description = stripHtml(item.description).slice(0, 400)
          let image = null, bodyText = ''
          try {
            const meta = await fetchArticleContent(link)
            image = meta.image; bodyText = meta.bodyText || ''
          } catch {}

          const saved = await saveArticle({
            title, link, description,
            pubDate: item.pubDate || '',
            image, bodyText,
            sourceName: extractSourceName(item.title, link),
            tag, cat,
          }, authorId, H)

          if (saved.ok) {
            results.inserted++
            sessionTitles.push(title)
            results.sources['네이버'] = (results.sources['네이버'] || 0) + 1
          } else {
            if (!saved.err?.includes('23505')) results.errors.push(`네이버[${title.slice(0,30)}]: ${saved.err}`)
            else results.skipped++
          }
        }
      } catch (e) {
        results.errors.push(`네이버[${tag}]: ${e.message?.slice(0, 60)}`)
      }
    }
  } else {
    results.errors.push('NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 미설정 — 네이버 수집 건너뜀')
  }

  // ── B. RSS 피드 수집 (설계서 §10) ─────────────────────────────────
  const rssResults = await Promise.allSettled(RSS_SOURCES.map(src => fetchRSS(src)))

  for (let si = 0; si < RSS_SOURCES.length; si++) {
    const src   = RSS_SOURCES[si]
    const items = rssResults[si].status === 'fulfilled' ? rssResults[si].value : []

    for (const item of items) {
      try {
        const title = item.title.slice(0, 200)
        if (!title || !item.link) continue
        if (isSessionDuplicate(title)) { results.skipped++; continue }
        if (await articleExistsInDB(item.link, title, H)) { results.skipped++; continue }

        let image = null, bodyText = ''
        try {
          const meta = await fetchArticleContent(item.link)
          image = meta.image; bodyText = meta.bodyText || ''
        } catch {}

        const saved = await saveArticle({
          title, link: item.link,
          description: item.description || '',
          pubDate: item.pubDate || '',
          image, bodyText,
          sourceName: src.name,
          tag: src.tag, cat: src.cat,
        }, authorId, H)

        if (saved.ok) {
          results.inserted++
          sessionTitles.push(title)
          results.sources[src.name] = (results.sources[src.name] || 0) + 1
        } else {
          if (!saved.err?.includes('23505')) results.errors.push(`RSS[${src.name}]: ${saved.err}`)
          else results.skipped++
        }
      } catch (e) {
        results.errors.push(`RSS[${src.name}]: ${e.message?.slice(0, 60)}`)
      }
    }
  }

  // ── C. 신규 기사 있으면 AI 요약 자동 트리거 ───────────────────────
  if (results.inserted > 0) {
    try {
      const origin = new URL(req.url).origin
      fetch(`${origin}/api/summarize-news`, {
        method: 'POST',
        headers: { 'x-vercel-cron': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: Math.min(results.inserted + 10, 60) }),
      }).catch(() => {})
    } catch {}
  }

  return new Response(JSON.stringify({
    ...results,
    total_inserted: results.inserted,
    total_skipped: results.skipped,
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
