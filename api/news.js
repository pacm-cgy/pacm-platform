/**
 * api/news.js — 뉴스 파이프라인 통합 라우터 v1.0
 * Vercel Hobby 12-function limit 해결: 9개 뉴스 엔드포인트 통합
 *   /api/fetch-news, /api/summarize-news, /api/run-summarize
 *   /api/extract-news-trends, /api/recrawl-news, /api/news-cleanup
 *   /api/reset-summaries, /api/longform-quality-check, /api/self-ai-summarize
 */
export const config = { runtime: 'edge', maxDuration: 60 }

// ════════════════════════════════════════════════════════════
// 각 핸들러를 스코프 충돌 없이 IIFE 패턴으로 로드
// ════════════════════════════════════════════════════════════

const handleFetchNews = (() => {
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
// §4. 원문 크롤러 v3 — 연구 기반 강화된 본문 추출
//
// 참조 연구:
//  - Kohlschütter et al. 2010 "Boilerplate Detection using Shallow Text Features"
//    → 텍스트 밀도 기반 본문/광고 구분
//  - Mozilla Readability 알고리즘 (arc90 기반)
//    → article 요소 우선 탐색, 링크 밀도 필터링
//  - Finn et al. 2001 "Fact or Fiction: Content Classification for Digital Libraries"
//    → 단락 단위 텍스트 밀도 점수화
//  - Google News RSS 구조 분석 (2024)
//    → 리다이렉트 URL에서 실제 기사 URL 추출
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
// Google News RSS v4 — 실제 기사 URL 완전 추출
// 참조: SSujitX/google-news-url-decoder, gnewsdecoder 알고리즘
//
// 전략 (우선순위 순):
//  1. rawDescription의 <a href> — 가장 안정적 (Google News description에 원본 링크 포함)
//  2. rawDescription 내 non-google URL 패턴
//  3. Google News 페이지 fetch → location/canonical/og:url
//  4. 리다이렉트 follow → 최종 URL
// ══════════════════════════════════════════════════════════════════════
async function resolveGoogleNewsUrl(gnUrl, rawDescription) {
  // ── 전략 0: gnewsdecoder 방식 — base64 디코딩 (SSujitX 알고리즘)
  // 참조: https://github.com/SSujitX/google-news-url-decoder
  try {
    const gnMatch = gnUrl.match(/articles\/([A-Za-z0-9_-]{20,})/)
    if (gnMatch) {
      const b64 = gnMatch[1].replace(/-/g, '+').replace(/_/g, '/')
      const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
      try {
        const buf = typeof atob !== 'undefined'
          ? Uint8Array.from(atob(padded), c => c.charCodeAt(0))
          : Buffer.from(padded, 'base64')
        const str = typeof TextDecoder !== 'undefined'
          ? new TextDecoder().decode(buf)
          : buf.toString('utf8')
        const urlInStr = str.match(/https?:\/\/(?!news\.google\.)[^\s"'<>\x00-\x1f]{15,400}/)
        if (urlInStr) {
          const decoded = urlInStr[0].replace(/\x00.*$/, '').trim()
          if (!decoded.includes('google.com')) return decoded
        }
      } catch {}
    }
  } catch {}

  // ── 전략 1: rawDescription HTML에서 실제 기사 href 추출 (최우선)
  if (rawDescription) {
    // <a href="실제URL"> 패턴 (Google News description에 원본 링크 href 포함)
    const hrefMatches = [...rawDescription.matchAll(/href=["'](https?:\/\/(?!news\.google\.com)[^"'&\s]{10,500})["']/gi)]
    for (const m of hrefMatches) {
      const href = m[1].replace(/&amp;/g, '&').replace(/&#38;/g, '&')
      if (href && !href.includes('google.com') && href.startsWith('http')) return href
    }
    // URL 직접 패턴 (href 없이 텍스트로 존재하는 경우)
    const urlMatch = rawDescription.match(/https?:\/\/(?!(?:news\.google\.com|t\.co))[^\s"'<>]{20,500}/i)
    if (urlMatch) return urlMatch[0].replace(/&amp;/g, '&').split('&hl=')[0].split('&ved=')[0]
  }

  // ── 전략 2: Google News 페이지 직접 fetch (다양한 User-Agent)
  const userAgents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ]
  for (const ua of userAgents) {
    try {
      const r = await fetch(gnUrl, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://news.google.com/',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      })
      const finalUrl = r.url || gnUrl
      // 리다이렉트 후 실제 기사 도메인이면 즉시 반환
      if (finalUrl && !finalUrl.includes('news.google.com') && finalUrl.startsWith('http')) {
        return finalUrl
      }
      if (!r.ok) continue
      const html = await r.text()

      // og:url / canonical 추출
      const ogUrl = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']{15,500})["']/i)?.[1]
        || html.match(/<meta[^>]+content=["']([^"']{15,500})["'][^>]+property=["']og:url["']/i)?.[1]
      if (ogUrl && !ogUrl.includes('news.google.com') && ogUrl.startsWith('http')) return ogUrl

      const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']{15,500})["']/i)?.[1]
      if (canonical && !canonical.includes('news.google.com') && canonical.startsWith('http')) return canonical

      // JSON-LD / JS 내 실제 URL 패턴들 (Google News HTML 구조 — 여러 변형 처리)
      const jsPatterns = [
        /"url"\s*:\s*"(https?:\/\/(?!(?:news\.google\.com|google\.com|googleapis\.com))[^"]{15,400})"/,
        /\["https?:\/\/[^"]+",null,\["(https?:\/\/(?!news\.google\.com)[^"]{15,400})"\]/,
        /data-url=["'](https?:\/\/(?!news\.google\.com)[^"']{15,400})["']/i,
        /"articleUrl"\s*:\s*"(https?:\/\/[^"]{15,400})"/,
        /itemid=["'](https?:\/\/[^"']{15,400})["']/i,
        /hl=ko&.*?url=(https?[^&"'\s]{15,400})/i,
        // JSON-LD 구조
        /"mainEntityOfPage"\s*:\s*\{[^}]*"@id"\s*:\s*"(https?:\/\/[^"]{15,400})"/,
      ]
      for (const p of jsPatterns) {
        try {
          const m = html.match(p)
          const candidate = m?.[1]
          if (candidate && !candidate.includes('google.com') && candidate.startsWith('http')) {
            const clean = decodeURIComponent(candidate.replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/\\/g, ''))
            if (clean.startsWith('http') && !clean.includes('google.com')) return clean
          }
        } catch {}
      }

      // 한 번 성공적으로 HTML 받았으면 더 이상 다른 UA로 시도 불필요
      break
    } catch { continue }
  }

  // ── 전략 3: 리다이렉트 체인 추적 (HEAD → GET fallback)
  try {
    const r = await fetch(gnUrl, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InsightshipBot/2.0 +https://insightship.pacm.kr)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    })
    const loc = r.url || r.headers.get('location')
    if (loc && !loc.includes('news.google.com') && loc.startsWith('http')) return loc
  } catch {}

  // ── 전략 4: gnUrl의 query param에서 url= 파라미터 추출
  try {
    const urlObj = new URL(gnUrl)
    const paramUrl = urlObj.searchParams.get('url') || urlObj.searchParams.get('q')
    if (paramUrl && paramUrl.startsWith('http') && !paramUrl.includes('google.com')) {
      return decodeURIComponent(paramUrl)
    }
  } catch {}

  return null
}

// HTML 텍스트 밀도 기반 본문 블록 추출 (Boilerplate Detection 알고리즘 적용)
// 참조: Kohlschütter 2010 — 텍스트/링크 문자 비율로 광고·메뉴 필터
function extractByDensity(html) {
  // 스크립트·스타일·네비·헤더·푸터 제거
  const cleaned = html
    .replace(/<(script|style|nav|header|footer|aside|form)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // 블록 요소 단위 분할
  const blocks = cleaned.split(/<\/?(div|section|article|p|main)[^>]*>/i)
  const candidates = []

  for (const block of blocks) {
    const text = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (text.length < 80) continue

    // 링크 밀도 계산 (Mozilla Readability 방식)
    const linkText = (block.match(/<a[^>]*>([\s\S]*?)<\/a>/gi) || [])
      .map(a => a.replace(/<[^>]+>/g, ''))
      .join('')
    const linkDensity = text.length > 0 ? linkText.length / text.length : 1

    // 링크 밀도 < 0.25이고 텍스트 충분한 블록만 선택
    if (linkDensity < 0.25 && text.length >= 100) {
      candidates.push({ text, score: text.length * (1 - linkDensity) })
    }
  }

  // 점수 상위 블록들 합산 (최대 3000자)
  candidates.sort((a, b) => b.score - a.score)
  const merged = candidates.slice(0, 8).map(c => c.text).join(' ')
  return merged.slice(0, 3000)
}

// HTML 본문 정제 공통 함수
function cleanBodyHtml(raw) {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&[a-z#0-9]+;/g, ' ')
    .replace(/공유하기[^가-힣]{0,30}/g, '')
    .replace(/페이스북|트위터|카카오톡?|네이버\s*밴드|URL\s*복사|라인|링크복사/g, '')
    .replace(/입력\s*\d{4}[.\-]\d{2}[.\-]\d{2}/g, '')
    .replace(/수정\s*\d{4}[.\-]\d{2}[.\-]\d{2}/g, '')
    .replace(/[가-힣]{2,4}\s*기자\s*=?\s*/g, '')
    .replace(/\[[가-힣a-zA-Z\s]{2,20}\]\s*/g, '')
    .replace(/무단전재\s*및?\s*재배포\s*금지/g, '')
    .replace(/저작권자\s*[©ⓒ][^가-힣]{0,80}/g, '')
    .replace(/ⓒ\s*[^\n]{0,80}/g, '')
    .replace(/https?:\/\/[^\s]{5,100}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// 언론사별 특화 본문 추출 패턴 (주요 한국 언론사 CSS 구조 — 30개 언론사 v22)
const SITE_PATTERNS = [
  // 네이버 뉴스 — id 우선, class 폴백
  { host: 'n.news.naver.com',   re: /<div[^>]+id=["']newsct_article["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'news.naver.com',     re: /<div[^>]+id=["']newsct_article["'][^>]*>([\s\S]*?)<\/div>/i },
  // 한국경제, 서울경제, 머니투데이, 파이낸셜뉴스
  { host: 'hankyung.com',       re: /<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'sedaily.com',        re: /<div[^>]+class=["'][^"']*article_view[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'mt.co.kr',           re: /<div[^>]+class=["'][^"']*articleBody[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'fnnews.com',         re: /<div[^>]+class=["'][^"']*article_txt[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  // 연합뉴스, 뉴시스, 뉴스1
  { host: 'yna.co.kr',          re: /<div[^>]+class=["'][^"']*article-txt[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'newsis.com',         re: /<div[^>]+class=["'][^"']*article_txt[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'news1.kr',           re: /<div[^>]+class=["'][^"']*article-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  // VentureSquare, Platum, StartupToday, 아웃스탠딩, BeSuccess
  { host: 'venturesquare.net',  re: /<div[^>]+class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'platum.kr',          re: /<div[^>]+class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'startuptoday.kr',    re: /<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'outstanding.kr',     re: /<div[^>]+class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'besuccess.com',      re: /<div[^>]+class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  // ZDNet, 전자신문, 서울신문, 조선비즈
  { host: 'zdnet.co.kr',        re: /<div[^>]+class=["'][^"']*article_view[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'etnews.com',         re: /<div[^>]+class=["'][^"']*article_txt[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'seoul.co.kr',        re: /<div[^>]+class=["'][^"']*article_content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'biz.chosun.com',     re: /<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  // 비즈워치, 이데일리, 아이뉴스, 디지털타임스
  { host: 'bizwatch.co.kr',     re: /<div[^>]+class=["'][^"']*article_body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'edaily.co.kr',       re: /<div[^>]+class=["'][^"']*news_body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'inews24.com',        re: /<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'dt.co.kr',           re: /<div[^>]+class=["'][^"']*article_content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  // 중기부 등 정부기관
  { host: 'mss.go.kr',          re: /<div[^>]+class=["'][^"']*view_content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'k-startup.go.kr',    re: /<div[^>]+class=["'][^"']*view_content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'koita.or.kr',        re: /<div[^>]+class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  // 매경, 한경닷컴, 서울경제
  { host: 'mk.co.kr',           re: /<div[^>]+class=["'][^"']*art_txt[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'hankyung.com',       re: /<div[^>]+id=["']newsView["'][^>]*>([\s\S]*?)<\/div>/i },
  // 헤럴드경제, 아시아경제
  { host: 'heraldcorp.com',     re: /<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'asiae.co.kr',        re: /<div[^>]+class=["'][^"']*articleView[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  // 더밀크, 테크M, 블로터
  { host: 'themilk.com',        re: /<div[^>]+class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'techm.kr',           re: /<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { host: 'bloter.net',         re: /<div[^>]+class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
]

// 범용 본문 추출 패턴 (우선순위 순 — 강화 v4)
const GENERIC_PATTERNS = [
  // JSON-LD articleBody
  /"articleBody":\s*"([^"]{200,10000})"/i,
  // 시맨틱 태그
  /<article[^>]*>([\s\S]{200,}?)<\/article>/i,
  /<main[^>]*>([\s\S]{200,}?)<\/main>/i,
  // ID 기반 (확장)
  /<div[^>]+id=["'](?:newsct_article|articleBody|article-body|article-content|news-body|story-body|content-body|main-content|articleView|article_body|newsBody)[^"']*["'][^>]*>([\s\S]{200,}?)<\/div>/i,
  // class 기반 (확장)
  /<div[^>]+class=["'][^"']*(?:entry-content|article-content|article-body|news-content|post-content|article_body|article_content|articleBody|story-body|news-body|article-text|article_text|view_content|read-content|body-content|cont_view|article_view_content)[^"']*["'][^>]*>([\s\S]{200,}?)<\/div>/i,
  /<section[^>]+class=["'][^"']*(?:article|content|body|news)[^"']*["'][^>]*>([\s\S]{200,}?)<\/section>/i,
  // itemprop
  /<(?:div|section|article)[^>]+itemprop=["'](?:articleBody|description)["'][^>]*>([\s\S]{200,}?)<\/(?:div|section|article)>/i,
  // p 태그 집합 (마지막 수단)
  /(<p>[\s\S]{50,500}<\/p>(?:\s*<p>[\s\S]{50,500}<\/p>){2,})/i,
]

async function fetchArticleContent(url, rawDescription) {
  // Google News URL인 경우 실제 기사 URL로 변환
  let actualUrl = url
  if (url && url.includes('news.google.com')) {
    // rawDescription (HTML 원본) 전달 → href에서 실제 URL 추출
    const resolved = await resolveGoogleNewsUrl(url, rawDescription)
    if (resolved) {
      actualUrl = resolved
    } else {
      // 실패해도 빈 본문 반환 (제목+설명은 이미 있음) — 완전 포기 대신 빈 본문으로 계속
      return { image: null, ogTitle: null, description: '', bodyText: '', gnFailed: true }
    }
  }

  try {
    // 단계 1: 일반 fetch (8초)
    const res = await fetch(actualUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return {}
    const html = await res.text()
    const finalUrl = res.url || actualUrl

    // OG 메타 추출
    const getMeta = (prop) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']{1,800})["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']{1,800})["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
      return m ? m[1].trim() : null
    }

    let bodyText = ''

    // 단계 2: 언론사별 특화 패턴 우선 시도
    try {
      const hostname = new URL(finalUrl).hostname.replace('www.', '')
      const sitePattern = SITE_PATTERNS.find(p => hostname.includes(p.host))
      if (sitePattern) {
        const m = html.match(sitePattern.re)
        if (m) {
          const cleaned = cleanBodyHtml(m[1] || '')
          if (cleaned.length > 200) bodyText = cleaned.slice(0, 4000)
        }
      }
    } catch {}

    // 단계 3: 범용 패턴 시도
    if (!bodyText || bodyText.length < 300) {
      for (const pat of GENERIC_PATTERNS) {
        const m = html.match(pat)
        if (m) {
          const cleaned = cleanBodyHtml(m[1] || m[2] || '')
          if (cleaned.length > bodyText.length && cleaned.length > 200) {
            bodyText = cleaned.slice(0, 4000)
            if (bodyText.length >= 500) break  // 충분하면 중단
          }
        }
      }
    }

    // 단계 4: 텍스트 밀도 기반 추출 (Kohlschütter 2010)
    if (!bodyText || bodyText.length < 400) {
      const densityText = extractByDensity(html)
      const cleaned = cleanBodyHtml(densityText)
      if (cleaned.length > bodyText.length) bodyText = cleaned.slice(0, 4000)
    }

    // 단계 5: <p> 태그 직접 수집 (4단계까지 실패 시)
    if (!bodyText || bodyText.length < 200) {
      const pTags = [...html.matchAll(/<p[^>]*>([\s\S]{40,800}?)<\/p>/gi)]
        .map(m => cleanBodyHtml(m[1]))
        .filter(t => t.length >= 40 && !/(광고|스팸|구독|팔로우|공유하기)/i.test(t))
      if (pTags.length >= 2) bodyText = pTags.slice(0, 15).join(' ').slice(0, 4000)
    }

    // 단계 6: og:description fallback
    const rawDesc = getMeta('og:description') || getMeta('description') || getMeta('twitter:description') || ''
    const cleanDesc = cleanBodyHtml(rawDesc).slice(0, 400)

    // 본문이 여전히 짧으면 og:description 병합
    if (bodyText.length < 200 && cleanDesc.length > 80) {
      bodyText = cleanDesc
    }

    return {
      image:       getMeta('og:image') || getMeta('twitter:image') || null,
      ogTitle:     getMeta('og:title') || null,
      description: cleanDesc,
      bodyText,
      resolvedUrl: finalUrl !== url ? finalUrl : undefined,
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
      // Google News RSS: description의 원본 HTML 보존 (실제 기사 URL 추출에 사용)
      const rawDescription = extractField(block, ['description', 'summary', 'content']) || ''
      const description = stripHtml(rawDescription)
      const pubDate     = extractField(block, ['pubDate', 'published', 'updated']) || ''

      if (!title || !link) continue
      items.push({
        title,
        link: link.replace(/&amp;/g, '&'),
        description,
        rawDescription, // Google News URL 추출용 원본 보존
        pubDate,
        source: source.name,
      })
    }
    return items.slice(0, 10)
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

async function _handleFetchNews_impl(req) {
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

  // 관리자(author) ID 조회 — role=admin 우선, 없으면 username=insightship, 그래도 없으면 첫 번째 유저 fallback
  let authorId = null
  try {
    // 1차: role=admin
    const pRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.admin&limit=1&select=id`, { headers: H })
    const profiles = await pRes.json()
    authorId = profiles?.[0]?.id || null

    // 2차: username=insightship or username=ai_sage
    if (!authorId) {
      const p2 = await fetch(`${SUPABASE_URL}/rest/v1/profiles?or=(username.eq.insightship,username.eq.ai_sage,username.eq.pacm)&limit=1&select=id`, { headers: H })
      const d2 = await p2.json()
      authorId = d2?.[0]?.id || null
    }

    // 3차: 가장 오래된 계정 fallback
    if (!authorId) {
      const p3 = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&order=created_at.asc&limit=1`, { headers: H })
      const d3 = await p3.json()
      authorId = d3?.[0]?.id || null
    }
  } catch {}
  if (!authorId) {
    return new Response(JSON.stringify({ error: '관리자 계정 없음 — profiles 테이블에 계정 필요', hint: 'profiles 테이블에 role=admin 또는 임의 계정 필요' }), { status: 500 })
  }

  const results = { inserted: 0, skipped: 0, errors: [], sources: {}, warnings: [] }

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
    results.warnings.push('NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 미설정 — 네이버 수집 건너뜀')
  }

  // ── B. RSS 피드 수집 (설계서 §10) ─────────────────────────────────
  const rssResults = await Promise.allSettled(RSS_SOURCES.map(src => fetchRSS(src)))

  for (let si = 0; si < RSS_SOURCES.length; si++) {
    const src   = RSS_SOURCES[si]
    const items = rssResults[si].status === 'fulfilled' ? rssResults[si].value : []
    if (rssResults[si].status === 'rejected') {
      results.warnings.push(`RSS[${src.name}]: fetch 실패 — ${String(rssResults[si].reason).slice(0, 60)}`)
    }

    for (const item of items) {
      try {
        const title = item.title.slice(0, 200)
        if (!title || !item.link) continue
        if (isSessionDuplicate(title)) { results.skipped++; continue }
        if (await articleExistsInDB(item.link, title, H)) { results.skipped++; continue }

        let image = null, bodyText = ''
        try {
          // Google News RSS: rawDescription 전달하여 실제 기사 URL 추출에 활용
          const meta = await fetchArticleContent(item.link, item.rawDescription)
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

  return _handleFetchNews_impl
})();

const handleSummarizeNews = (() => {
/**
 * api/summarize-news.js
 * INSIGHTSHIP LONGFORM NEWS AI ENGINE v15.0
 * 완전 동적 본문 분석 — 고정 템플릿 0개
 * - 본문 있는 기사: BM25 키문장 추출 기반
 * - 본문 없는 기사(제목만): NER 완전 분석 기반 동적 생성 (고정 문구 절대 없음)
 *
 * POST /api/summarize-news  (x-cron-secret 또는 x-vercel-cron: 1)
 * GET  /api/summarize-news  → 엔진 상태 확인
 */


const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// ══════════════════════════════════════════════════════════════════════
// §1. 텍스트 정제
// ══════════════════════════════════════════════════════════════════════

function cleanText(t) {
  return (t || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x?[0-9a-fA-F]+;/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/공유하기|페이스북|트위터|카카오톡\s*공유|인스타그램|네이버\s*밴드|URL\s*복사/g, '')
    .replace(/기자\s*[가-힣]{2,4}\s*기자|^\s*[가-힣]{2,3}\s*기자/gm, '')
    .replace(/입력\s*\d{4}\.\d{2}\.\d{2}.*$/gm, '')
    .replace(/수정\s*\d{4}\.\d{2}\.\d{2}.*$/gm, '')
    .replace(/저작권자\s*©.*$/gm, '')
    .replace(/무단전재\s*및\s*재배포\s*금지/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?기자\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function splitSentences(text) {
  return text
    .replace(/([.!?])\s+/g, '$1\n')
    .replace(/([다요임음])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length >= 20 && s.length <= 400)
}

function isNoise(s) {
  return /무단\s*(전재|배포|복제)|copyright|all rights reserved|구독|좋아요|댓글|광고|협찬|PR\b/i.test(s)
}

// ══════════════════════════════════════════════════════════════════════
// §2. 이벤트·도메인 분류
// ══════════════════════════════════════════════════════════════════════

const EVENT_TYPES = {
  funding:     { kw: ['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC','엔젤','달러','Pre-A','CVC','브릿지'], label: '투자 유치', emoji: '💰' },
  product:     { kw: ['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈','런칭','배포','상용화','신기능'], label: '제품/서비스 출시', emoji: '🚀' },
  policy:      { kw: ['정부','지원','공모','선발','과기부','중기부','창진원','예산','규제','정책','공고','모집','개최','경진대회','프로그램','유니콘','바우처','R&D'], label: '정책/지원', emoji: '📋' },
  acquisition: { kw: ['인수','합병','M&A','지분','매각','인수합병','피인수','전략적투자'], label: '인수/합병', emoji: '🤝' },
  research:    { kw: ['연구','논문','결과','조사','분석','보고서','데이터','통계','발표','리포트','영향','설문'], label: '리서치/분석', emoji: '🔬' },
  person:      { kw: ['대표','CEO','창업자','설립자','인터뷰','스토리','수상','선정','창업가','여성창업','강연','멘토'], label: '창업가 스토리', emoji: '👤' },
  market:      { kw: ['시장','성장','규모','트렌드','전망','예측','확대','점유율','글로벌','산업','진출','수출'], label: '시장/트렌드', emoji: '📊' },
  ipo:         { kw: ['IPO','상장','코스닥','코스피','증권','기업공개'], label: 'IPO/상장', emoji: '📈' },
}

const DOMAINS = {
  investment: { kw: ['투자','펀딩','시리즈A','시리즈B','시리즈C','억원','조원','달러','VC','엑셀러레이터','벤처','자본','CVC'], ko: '투자·금융', cat: 'trend' },
  tech:       { kw: ['AI','인공지능','딥러닝','반도체','GPU','클라우드','SaaS','소프트웨어','로봇','자율주행','LLM','생성형'], ko: '기술·AI', cat: 'trend' },
  youth:      { kw: ['청소년','청년','대학생','고등학생','창업교육','해커톤','비즈쿨','학생창업','경진대회','여성창업','여성기업'], ko: '청소년·교육', cat: 'insight' },
  policy:     { kw: ['정부','지원','공모','과기부','중기부','창진원','규제','정책','지자체','시','도','공공','유니콘','C-STAR','STAR','바우처','R&D'], ko: '정책·지원', cat: 'insight' },
  esg:        { kw: ['ESG','탄소중립','친환경','임팩트','소셜벤처','그린','지속가능','기후테크','그린바이오'], ko: 'ESG·임팩트', cat: 'insight' },
  startup:    { kw: ['스타트업','창업','유니콘','피봇','글로벌','스케일업','창업팀','그로스'], ko: '창업·비즈니스', cat: 'news' },
  edutech:    { kw: ['에듀테크','교육플랫폼','학습','온라인교육','이러닝','EdTech'], ko: '에듀테크', cat: 'insight' },
  fintech:    { kw: ['핀테크','결제','금융','블록체인','암호화폐','뱅크','디파이','NFT'], ko: '핀테크', cat: 'trend' },
  health:     { kw: ['헬스케어','의료','바이오','디지털헬스','건강','제약','메디컬','유산균','건기식','임상','체지방','신약'], ko: '헬스케어·바이오', cat: 'trend' },
  climate:    { kw: ['기후','탄소','친환경','에너지','태양광','수소','클린테크','신재생','배터리','전기차'], ko: '기후·에너지', cat: 'insight' },
}

function detectEvent(title, body) {
  const text = (title + ' ' + (body || '').slice(0, 600)).toLowerCase()
  const priority = ['funding','ipo','acquisition','product','policy','research','person','market']
  const scores = {}
  for (const type of priority) {
    scores[type] = EVENT_TYPES[type].kw.filter(k => text.includes(k.toLowerCase())).length
    scores[type] += EVENT_TYPES[type].kw.filter(k => title.toLowerCase().includes(k.toLowerCase())).length * 1.5
  }
  const best = priority.reduce((a, b) => scores[a] >= scores[b] ? a : b)
  return scores[best] > 0 ? best : 'general'
}

function detectDomain(title, body) {
  const text = (title + ' ' + (body || '').slice(0, 800)).toLowerCase()
  let best = 'startup', bestScore = 0
  for (const [domain, { kw }] of Object.entries(DOMAINS)) {
    const score = kw.filter(k => text.includes(k.toLowerCase())).length
    if (score > bestScore) { best = domain; bestScore = score }
  }
  return best
}

function mapCategory(domain, eventType) {
  if (eventType === 'policy' || domain === 'youth' || domain === 'policy') return 'insight'
  if (eventType === 'funding' || eventType === 'market' || eventType === 'ipo') return 'trend'
  if (eventType === 'person') return 'magazine'
  return DOMAINS[domain]?.cat || 'news'
}

function estimateReadTime(text) {
  return Math.max(3, Math.ceil((text || '').length / 300))
}

// ══════════════════════════════════════════════════════════════════════
// §3. 토크나이저 & BM25
// ══════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','위해','통해',
  '있는','없는','되는','하는','있다','없다','된다','한다','이다',
  '있으며','되며','하며','이번','지난','올해','작년','최근','현재',
  '특히','또','더','가장','매우','모두','함께','이미','아직','약','총',
  '기자','특파원','뉴스','보도','발표','밝혔다','말했다','전했다',
  '대한','관련','따른','이달','오늘','어제','지금','전','후','당',
  '각','제','본','해당','설명했다','밝혀졌다','알려졌다','한편',
])

function tokenize(text) {
  if (!text) return []
  return (text.replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g, ' ').toLowerCase()
    .match(/[가-힣]{2,}|[a-z]{3,}|[0-9]+/g) || [])
    .filter(t => !STOPWORDS.has(t) && t.length >= 2)
}

const K1 = 1.5, BP = 0.75
function bm25(qToks, dToks, avgLen, N, df) {
  const tf = {}
  for (const t of dToks) tf[t] = (tf[t] || 0) + 1
  let s = 0
  for (const q of qToks) {
    if (!tf[q]) continue
    const idf = Math.log((N - (df[q] || 0) + 0.5) / ((df[q] || 0) + 0.5) + 1)
    const tfw = (tf[q] * (K1 + 1)) / (tf[q] + K1 * (1 - BP + BP * dToks.length / avgLen))
    s += idf * tfw
  }
  return s
}

function scoreAll(sents, titleToks) {
  const toks = sents.map(s => tokenize(s))
  const N = sents.length || 1
  const df = {}
  for (const ts of toks) for (const t of new Set(ts)) df[t] = (df[t] || 0) + 1
  const avgLen = toks.reduce((s, t) => s + t.length, 0) / N || 1
  return sents.map((sent, i) => {
    if (isNoise(sent)) return { sent, score: -1, idx: i }
    const bm = bm25(titleToks, toks[i], avgLen, N, df)
    const pos = i < 2 ? 1.5 : i < 5 ? 1.25 : 1.0
    const l = sent.length, lenB = (l >= 40 && l <= 180) ? 1.3 : l > 250 ? 0.7 : 1.0
    const numB = hasNumber(sent) ? 1.4 : 1.0
    const cauB = isCausal(sent) ? 1.25 : 1.0
    return { sent, score: bm * pos * lenB * numB * cauB, idx: i }
  })
}

function cosineSim(a, b) {
  const setA = new Set(a), setB = new Set(b)
  const intersection = [...setA].filter(x => setB.has(x)).length
  const denom = Math.sqrt(setA.size) * Math.sqrt(setB.size)
  return denom > 0 ? intersection / denom : 0
}

function isDuplicateTitle(title, existing) {
  const tToks = tokenize(title)
  for (const e of existing) {
    if (cosineSim(tToks, tokenize(e)) >= 0.72) return true
  }
  return false
}

// ══════════════════════════════════════════════════════════════════════
// §4. NER — 제목 완전 분석
// ══════════════════════════════════════════════════════════════════════

const GEO_LIST = [
  '서울','부산','대구','인천','광주','대전','울산','세종','수원','성남','고양','용인','천안',
  '충남','충북','경기','강원','전북','전남','경북','경남','제주','아프리카','중동','동남아',
  '유럽','미국','중국','일본','베트남','인도','싱가포르','영국','독일','이스라엘','브라질',
  '프랑스','호주','캐나다','UAE','글로벌','해외','국내','한국',
]
const TECH_LIST = [
  'AI','인공지능','GPT','LLM','머신러닝','딥러닝','자연어처리','컴퓨터비전','빅데이터',
  '클라우드','SaaS','API','블록체인','핀테크','에듀테크','헬스테크','바이오','반도체',
  'GPU','로봇','드론','자율주행','IoT','AR','VR','그린바이오','건기식',
]
const INVESTMENT_STAGES = ['시드','Pre-A','시리즈A','시리즈B','시리즈C','시리즈D','프리IPO','IPO']

function parseTitle(title) {
  const ner = { amounts: [], geo: [], tech: [], dates: [], metrics: [], stage: null, orgs: [], action: null }
  ner.amounts = (title.match(/[\d,]+억\s*달러|[\d,]+만\s*달러|[\d,]+조\s*원|[\d,]+억\s*원|[\d,]+만\s*원|\d+억|\d+조|\d[\d,]*\s*달러/g) || [])
  ner.geo    = GEO_LIST.filter(g => title.includes(g))
  ner.tech   = TECH_LIST.filter(t => title.toLowerCase().includes(t.toLowerCase()))
  ner.dates  = title.match(/\d+월\s*\d+일|\d+월|\d+분기|\d{4}년|상반기|하반기|올해|내년/) || []
  ner.metrics = title.match(/유니콘|데카콘|IPO|상장|[\d]+위|[\d]+%|[\d]+배|[\d]만\s*명|[\d]명/) || []
  for (const s of INVESTMENT_STAGES) { if (title.includes(s)) { ner.stage = s; break } }
  if (/투자|펀딩|유치/.test(title))                                            ner.action = 'invest'
  else if (/인수|합병|M&A/.test(title))                                        ner.action = 'acquire'
  else if (/출시|론칭|공개|배포/.test(title))                                  ner.action = 'launch'
  else if (/개최|공모|모집|접수|선발|선정|합류|유니콘|육성|경진대회/.test(title)) ner.action = 'contest'
  else if (/분석|영향|전망|예측|조사/.test(title))                              ner.action = 'analysis'
  else if (/진출|확장|스케일/.test(title))                                      ner.action = 'expand'
  else                                                                            ner.action = 'news'
  // 기업명: 제목 앞부분 추출
  const orgM = title.match(/^([^,，·\[\]\s]{2,14}(?:테크|솔루션|랩스?|스튜디오|플랫폼|바이오|AI|ai|Inc|Corp)?)\s*[,，·]/)
  if (orgM && orgM[1].trim().length >= 2 && !STOPWORDS.has(orgM[1].trim())) {
    ner.orgs = [orgM[1].trim()]
  }
  return ner
}

// ══════════════════════════════════════════════════════════════════════
// §5. 용어 사전
// ══════════════════════════════════════════════════════════════════════

const TERM_DICT = {
  'IPO':          { short: 'IPO (기업공개)',           explain: '처음으로 주식시장에 상장해 일반 투자자에게 주식을 파는 것. 스타트업이 성장해 코스닥·코스피에 입성하는 과정입니다.' },
  'VC':           { short: 'VC (벤처캐피털)',           explain: '스타트업 전문 투자회사. 고위험 고수익을 목표로 초기 기업에 집중 투자합니다.' },
  '시리즈A':      { short: '시리즈A (초기 대규모 투자)', explain: '제품이 시장에서 검증된 후 팀·마케팅 확장을 위한 첫 번째 대규모 투자 단계(보통 수십억~수백억 원).' },
  '시리즈B':      { short: '시리즈B (성장 투자)',        explain: '매출이 증명되고 사업 확장을 위한 투자 단계. 시리즈A 이후 더 큰 규모로 진행됩니다.' },
  '유니콘':       { short: '유니콘 (기업가치 1조원+)',   explain: '기업가치가 1조원 이상인 비상장 스타트업. 국내 토스·야놀자 등이 대표적입니다.' },
  'SaaS':         { short: 'SaaS (구독형 소프트웨어)',   explain: '월정액을 내고 인터넷으로 쓰는 소프트웨어 모델. 어도비·슬랙 등이 대표적입니다.' },
  'B2B':          { short: 'B2B (기업간 거래)',          explain: '기업이 기업에게 제품·서비스를 파는 비즈니스 모델.' },
  'MVP':          { short: 'MVP (최소 기능 제품)',        explain: '핵심 기능만 넣은 첫 번째 버전. 시장 반응을 빠르게 확인하기 위해 만듭니다.' },
  'M&A':          { short: 'M&A (인수·합병)',             explain: '한 기업이 다른 기업을 사거나 합치는 것. 스타트업에겐 IPO 외 주요 출구 전략입니다.' },
  'ESG':          { short: 'ESG (환경·사회·지배구조)',   explain: '기업이 환경, 사회적 책임, 투명한 지배구조를 얼마나 잘 지키는지 평가하는 기준.' },
  '피봇':         { short: '피봇 (사업 방향 전환)',       explain: '초기 아이디어가 통하지 않을 때 방향을 바꾸는 것. 유튜브·슬랙이 피봇으로 성공한 대표 사례.' },
  '그린바이오':   { short: '그린바이오 (농업·식품 생명공학)', explain: '농업·식품·환경에 생명공학 기술을 적용하는 분야. 유산균·발효·식물 추출 성분 등이 포함됩니다.' },
  '엑셀러레이터': { short: '엑셀러레이터 (창업 가속화)', explain: '초기 스타트업에 투자·멘토링·네트워크를 제공하는 기관. Y Combinator, 스파크랩이 대표적.' },
  'CVC':          { short: 'CVC (대기업 벤처캐피털)',    explain: '대기업이 직접 운영하는 벤처투자 조직. 삼성벤처투자, 현대기술투자 등이 있습니다.' },
  'LLM':          { short: 'LLM (대규모 언어 모델)',     explain: 'GPT, Gemini 같은 대용량 AI 언어 모델. 텍스트를 읽고 생성하는 핵심 AI 기술입니다.' },
}

// ══════════════════════════════════════════════════════════════════════
// §6. 문장 분류 헬퍼
// ══════════════════════════════════════════════════════════════════════

function hasNumber(s) { return /([\d,]+억|[\d,]+조|[\d,]+만\s*원|[\d]+%|[\d]+배|[\d,]+만\s*명|[\d,]+개)/.test(s) }
function isCausal(s)  { return /(때문에|이유로|원인은|배경에는|결과로|따라서|이로\s*인해|덕분에|영향으로)/.test(s) }
function isGoal(s)    { return /(목표|계획|예정|방침|전략|추진|노력|위해)/.test(s) }
function isQuote(s)   {
  return (s.includes('"') || s.includes('\u201c') || s.includes('\u201d')) &&
    /(밝혔다|말했다|전했다|강조했다|설명했다|덧붙였다|언급했다)/.test(s)
}

// ══════════════════════════════════════════════════════════════════════
// §7. 동적 질문 생성기
// ══════════════════════════════════════════════════════════════════════

function buildDynamicQuestions(title, eventType, domain, keySents, ner) {
  const questions = []
  const { amounts, orgs, tech, geo, stage } = ner
  const domKo = DOMAINS[domain]?.ko || '창업·비즈니스'
  const titleKw = tokenize(title).filter(t => t.length >= 2 && !STOPWORDS.has(t)).slice(0, 4)

  // 수치 기반
  if (amounts.length > 0) {
    questions.push(`**${amounts[0]}** 규모는 ${domKo} 업계 평균과 비교하면 어느 정도이며, 이 자금이 어느 분야에 먼저 쓰일까요?`)
  }
  // 기업명 기반
  if (orgs.length > 0) {
    questions.push(`**${orgs[0]}**이(가) 이번 소식으로 얻는 가장 큰 이점은 무엇이고, 앞으로 어떤 행보를 보일까요?`)
  }
  // 이벤트 타입별
  if (eventType === 'funding') {
    const stageStr = stage ? `${stage} 투자` : '이번 투자'
    questions.push(`${stageStr}를 받은 후 ${orgs[0] || '이 스타트업'}이(가) 다음 단계로 넘어가려면 무엇을 증명해야 할까요?`)
  } else if (eventType === 'product') {
    questions.push(`이 서비스가 기존 경쟁 제품 대비 실제로 해결하는 핵심 문제는 무엇이며, 어떤 사용자에게 가장 필요할까요?`)
  } else if (eventType === 'policy') {
    questions.push(`이 정책·지원 프로그램을 가장 효과적으로 활용할 수 있는 스타트업 유형은 무엇일까요?`)
  } else if (eventType === 'research') {
    questions.push(`이 분석·연구 결과가 실제 ${domKo} 현장에 적용되면 어떤 변화가 가장 먼저 나타날까요?`)
  } else if (eventType === 'person') {
    questions.push(`${orgs[0] || '이 창업가'}의 경험에서 나에게 바로 적용 가능한 교훈은 무엇인가요?`)
  } else if (eventType === 'market') {
    const techStr = tech.length > 0 ? tech[0] : domKo
    questions.push(`${techStr} 시장 변화가 5년 후에도 지속된다면, 지금 어떤 포지션을 선점하는 것이 유리할까요?`)
  } else if (eventType === 'ipo') {
    questions.push(`이번 IPO·상장이 ${domKo} 생태계 전반에 주는 신호는 무엇이며, 후속 상장 기업에게 어떤 영향을 줄까요?`)
  } else if (eventType === 'acquisition') {
    questions.push(`이번 인수·합병 이후 ${domKo} 분야 경쟁 구도는 어떻게 재편될까요?`)
  } else {
    if (titleKw.length >= 2) {
      questions.push(`'${titleKw.slice(0, 2).join(', ')}' 관련 소식이 ${domKo} 분야 창업가에게 주는 기회와 위협은 각각 무엇일까요?`)
    } else {
      questions.push(`이 소식이 ${domKo} 분야 전반에 미치는 영향을 어떻게 평가할 수 있을까요?`)
    }
  }

  // 본문 키워드 기반 추가 질문
  if (keySents.length > 1) {
    const kw = tokenize(keySents[1]).filter(t => t.length >= 2 && !STOPWORDS.has(t)).slice(0, 2)
    if (kw.length > 0) {
      questions.push(`'${kw.join(', ')}' 측면에서 아직 해결되지 않은 과제는 무엇일까요?`)
    }
  } else if (geo.length > 0 && questions.length < 3) {
    questions.push(`${geo[0]} 지역의 ${domKo} 스타트업이 이 소식을 기회로 활용할 수 있는 방법은 무엇일까요?`)
  }

  return questions.slice(0, 3)
}

// ══════════════════════════════════════════════════════════════════════
// §8. 빈 body 기사용 NER 기반 동적 섹션 생성기
// 고정 문구 절대 없음 — 모든 문장이 제목 NER에서 동적 생성
// ══════════════════════════════════════════════════════════════════════

function buildNerBasedSections(title, eventType, domain, ner) {
  const { amounts, orgs, tech, geo, stage, dates, metrics } = ner
  const domInfo = DOMAINS[domain] || DOMAINS.startup
  const evtInfo = EVENT_TYPES[eventType] || { emoji: '📰', label: '주요 소식' }
  const domKo = domInfo.ko
  const sections = []

  // ── 이벤트별 맞춤 핵심 내용 섹션 ──────────────────────────────────
  const coreLines = []
  if (eventType === 'funding') {
    const who   = orgs[0]  || title.split(/[,，·]/)[0].trim()
    const howMuch = amounts[0] || null
    const stageStr = stage || '투자'
    if (howMuch) {
      coreLines.push(`**${who}**이(가) **${howMuch}** 규모의 ${stageStr}를 유치했습니다.`)
    } else {
      coreLines.push(`**${who}**이(가) ${stageStr}를 성공적으로 유치했습니다.`)
    }
    if (tech.length > 0) {
      coreLines.push(`${domKo} 분야에서 **${tech.slice(0, 2).join('·')}** 기술을 기반으로 성장을 이어가고 있습니다.`)
    }
    if (geo.length > 0 && geo[0] !== '한국' && geo[0] !== '국내') {
      coreLines.push(`${geo[0]} 시장 진출 또는 글로벌 확장 가능성에도 관심이 모이고 있습니다.`)
    }
  } else if (eventType === 'acquisition') {
    const parts = title.split(/[,，·]/)
    const buyer = orgs[0] || parts[0]?.trim() || '인수 기업'
    const techStr = tech.length > 0 ? ` **${tech[0]}** 등 핵심 기술 역량 확보를 위해` : ''
    coreLines.push(`${techStr} **${buyer}**이(가) 인수·합병을 통해 ${domKo} 분야 경쟁력을 강화하고 있습니다.`)
    if (amounts.length > 0) {
      coreLines.push(`이번 거래 규모는 **${amounts[0]}**으로, ${domKo} 업계 M&A 중 주목할 만한 사례입니다.`)
    }
  } else if (eventType === 'product') {
    const who = orgs[0] || title.split(/[,，·]/)[0].trim()
    const techStr = tech.length > 0 ? ` **${tech.slice(0, 2).join('·')}** 기반` : ''
    coreLines.push(`**${who}**이(가)${techStr} 신규 서비스·제품을 출시하며 ${domKo} 분야에 새로운 흐름을 만들고 있습니다.`)
    if (geo.length > 0 && geo[0] !== '한국' && geo[0] !== '국내') {
      coreLines.push(`${geo[0]} 시장을 포함한 글로벌 확장도 함께 추진되고 있는 것으로 알려졌습니다.`)
    }
  } else if (eventType === 'policy') {
    const org = orgs[0] || '지원 기관'
    const geoStr = geo.length > 0 ? `${geo[0]} 지역의 ` : ''
    coreLines.push(`${geoStr}${domKo} 분야 스타트업·창업가를 대상으로 **${org}**이(가) 신규 지원 프로그램을 운영합니다.`)
    if (amounts.length > 0) {
      coreLines.push(`지원 규모는 **${amounts[0]}** 수준이며, 관련 기업들의 관심이 높습니다.`)
    }
    if (dates.length > 0) {
      coreLines.push(`**${dates[0]}** 일정에 맞춰 신청·모집이 진행될 예정입니다.`)
    }
  } else if (eventType === 'research') {
    const techStr = tech.length > 0 ? `**${tech.slice(0, 2).join('·')}**` : `${domKo}`
    coreLines.push(`${techStr} 분야에 대한 새로운 연구·분석 결과가 발표되며 업계의 이목을 끌고 있습니다.`)
    if (amounts.length > 0 || metrics.length > 0) {
      const m = [...amounts, ...metrics].slice(0, 1)[0]
      if (m) coreLines.push(`**${m}** 등 주요 수치가 핵심 지표로 부각됩니다.`)
    }
  } else if (eventType === 'person') {
    const who = orgs[0] || title.split(/[,，·]/)[0].trim()
    coreLines.push(`**${who}**의 창업 스토리와 ${domKo} 분야 인사이트가 주목받고 있습니다.`)
    if (tech.length > 0) {
      coreLines.push(`특히 **${tech[0]}** 분야에서의 경험과 비전이 업계에 시사하는 바가 큽니다.`)
    }
  } else if (eventType === 'market') {
    const techStr = tech.length > 0 ? `**${tech[0]}**` : `${domKo}`
    const geoStr  = geo.length > 0  ? `${geo[0]} 시장을 포함한 ` : ''
    coreLines.push(`${geoStr}${techStr} 분야 시장 규모·트렌드 변화가 확인되며 투자자와 창업가 모두의 관심이 집중되고 있습니다.`)
    if (amounts.length > 0) {
      coreLines.push(`관련 시장 규모가 **${amounts[0]}** 수준으로 평가되고 있습니다.`)
    }
  } else if (eventType === 'ipo') {
    const who = orgs[0] || title.split(/[,，·]/)[0].trim()
    coreLines.push(`**${who}**이(가) IPO·상장을 추진하며 ${domKo} 생태계에 새로운 기준점을 제시하고 있습니다.`)
    if (amounts.length > 0) {
      coreLines.push(`예상 기업가치 또는 공모 규모는 **${amounts[0]}** 수준으로 알려져 있습니다.`)
    }
  } else {
    // general
    const who = orgs[0] || title.split(/[,，·]/)[0].trim()
    const techStr = tech.length > 0 ? ` **${tech[0]}** 기반` : ''
    coreLines.push(`**${who}**이(가)${techStr} ${domKo} 분야에서 주목할 만한 움직임을 보이고 있습니다.`)
  }

  if (coreLines.length > 0) {
    sections.push({ title: '## 📌 핵심 내용', lines: coreLines, style: 'quote' })
  }

  // ── 도메인·이벤트 컨텍스트 섹션 ──────────────────────────────────
  const ctxLines = buildContextLines(eventType, domain, ner)
  if (ctxLines.length > 0) {
    sections.push({ title: '## 🗺️ 배경과 맥락', lines: ctxLines, style: 'plain' })
  }

  // ── 창업가 시각 섹션 ─────────────────────────────────────────────
  const oppLines = buildOpportunityLines(eventType, domain, ner)
  if (oppLines.length > 0) {
    sections.push({ title: '## 🚀 창업가 시각으로 읽기', lines: oppLines, style: 'plain' })
  }

  return sections
}

function buildContextLines(eventType, domain, ner) {
  const { tech, geo, stage, amounts } = ner
  const domKo = DOMAINS[domain]?.ko || '창업·비즈니스'
  const lines = []

  if (eventType === 'funding') {
    if (stage) {
      const stageContext = {
        '시드':    `시드 투자는 아이디어 검증 단계의 첫 번째 외부 자금입니다. 이 시점에서 투자자들은 팀의 역량과 문제 해결 방향성을 가장 중요하게 봅니다.`,
        'Pre-A':   `Pre-A 투자는 초기 제품·서비스를 시장에서 검증하기 직전 단계입니다. MVP(최소 기능 제품)를 고도화하는 데 활용됩니다.`,
        '시리즈A': `시리즈A는 제품·시장 적합성(PMF)이 검증된 후 팀·마케팅 확장을 위한 첫 번째 대규모 투자입니다. 보통 수십억~수백억 원 규모로 진행됩니다.`,
        '시리즈B': `시리즈B는 검증된 수익 모델을 바탕으로 빠른 성장을 추진하는 단계입니다. 인력 채용·해외 확장·신사업 투자에 활용됩니다.`,
        '시리즈C': `시리즈C 이상은 이미 규모 있는 매출을 가진 기업이 IPO 또는 글로벌 확장을 준비하는 단계입니다.`,
      }
      if (stageContext[stage]) lines.push(stageContext[stage])
    }
    if (tech.length > 0) {
      lines.push(`현재 글로벌 VC 시장에서 **${tech[0]}** 분야는 집중 투자 대상 중 하나입니다. 금리 환경과 무관하게 실질 수익 모델이 있는 기업에 자금이 몰리는 추세입니다.`)
    } else {
      lines.push(`${domKo} 투자 생태계는 선별적 투자 기조 속에서도 실질적인 성과를 낸 기업에게는 여전히 자금 접근 기회가 열려 있습니다.`)
    }
  } else if (eventType === 'acquisition') {
    lines.push(`M&A는 스타트업에게 IPO와 함께 대표적인 엑싯(Exit) 경로입니다. 대기업이 기술·인재·시장 점유율을 빠르게 확보하기 위한 수단으로 활용하며, 스타트업 창업자에게는 성과 실현의 기회가 됩니다.`)
    if (tech.length > 0) {
      lines.push(`특히 **${tech[0]}** 분야의 M&A는 기술 역량 내재화를 목적으로 하는 경우가 많아, 인수 이후에도 팀·기술의 독립성이 유지되는 사례가 늘고 있습니다.`)
    }
  } else if (eventType === 'product') {
    if (tech.length > 0) {
      lines.push(`**${tech.slice(0, 2).join('·')}** 기술을 활용한 신규 서비스 출시는 기존 시장에 새로운 기준을 제시할 수 있습니다. 초기 시장 반응과 사용자 피드백이 이후 방향성을 결정하는 핵심 요소가 됩니다.`)
    }
    if (geo.length > 0 && geo[0] !== '한국' && geo[0] !== '국내') {
      lines.push(`${geo[0]} 시장 진출을 병행한다면, 현지 규제 환경과 사용자 니즈 파악이 초기 성패를 좌우합니다.`)
    }
  } else if (eventType === 'policy') {
    lines.push(`정부 및 공공기관의 ${domKo} 지원 프로그램은 초기 스타트업에게 자금·네트워크·검증의 기회를 제공합니다. 선발 기준과 지원 혜택을 꼼꼼히 확인하고 적극적으로 활용하는 것이 중요합니다.`)
    if (geo.length > 0 && geo[0] !== '한국' && geo[0] !== '국내') {
      lines.push(`${geo[0]} 지역 기반 스타트업에게는 지역 특화 지원 트랙이 별도로 운영되는 경우가 많아 추가 기회를 탐색할 만합니다.`)
    }
  } else if (eventType === 'research') {
    lines.push(`${domKo} 분야의 연구·분석 결과는 투자자·창업가·정책 입안자 모두에게 중요한 의사결정 근거가 됩니다. 데이터 기반 인사이트를 빠르게 파악하고 전략에 반영하는 능력이 경쟁력으로 이어집니다.`)
  } else if (eventType === 'market') {
    const techStr = tech.length > 0 ? `**${tech[0]}**` : `${domKo}`
    lines.push(`${techStr} 시장은 기술 발전과 수요 변화가 맞물려 빠르게 재편되고 있습니다. 성장 곡선의 초기에 진입한 플레이어가 장기적으로 유리한 고지를 선점할 가능성이 높습니다.`)
  }

  return lines
}

function buildOpportunityLines(eventType, domain, ner) {
  const { tech, geo, orgs, amounts, stage } = ner
  const domKo = DOMAINS[domain]?.ko || '창업·비즈니스'
  const lines = []

  if (eventType === 'funding') {
    lines.push(`투자를 받은 기업의 행보를 주목하세요. 어떤 문제를 해결하려는지, 자금을 어떤 우선순위에 쓰는지 관찰하면 ${domKo} 분야의 핵심 병목이 보입니다.`)
    if (stage === '시드' || stage === 'Pre-A') {
      lines.push(`초기 투자 유치 기업과의 파트너십·협업 가능성을 탐색해보세요. 성장 초기 단계의 기업은 새로운 파트너에게 열려 있는 경우가 많습니다.`)
    }
  } else if (eventType === 'acquisition') {
    lines.push(`인수된 기업이 해결하던 문제 중 아직 미완성인 부분이 있다면, 그것이 새로운 창업 기회가 될 수 있습니다. 대기업 M&A 이후 남겨진 틈새 시장을 주목하세요.`)
  } else if (eventType === 'product') {
    lines.push(`새로운 서비스 출시는 경쟁사 분석의 좋은 기회입니다. 직접 써보고 '아직 해결하지 못한 불편함'을 찾아보세요. 그 불편함이 다음 창업 아이디어의 출발점입니다.`)
  } else if (eventType === 'policy') {
    lines.push(`지원 프로그램 신청 기간과 조건을 확인하고, 팀 빌딩·멘토링·네트워크 기회까지 최대한 활용하는 전략을 세우세요. 단순 자금 지원 이상의 가치를 놓치지 마세요.`)
  } else if (eventType === 'research') {
    lines.push(`연구 결과에서 '아직 해결되지 않은 문제'를 찾는 연습을 하세요. 데이터가 보여주는 갭(gap)이 바로 창업 기회입니다.`)
  } else if (eventType === 'market') {
    const techStr = tech.length > 0 ? tech[0] : domKo
    lines.push(`${techStr} 시장이 성장한다는 것은, 그 시장에서 해결해야 할 문제도 함께 커진다는 뜻입니다. 성장하는 시장의 '불편한 부분'을 먼저 찾는 사람이 기회를 잡습니다.`)
  } else if (eventType === 'person') {
    lines.push(`성공한 창업가의 스토리에서 패턴을 찾아보세요. 문제를 인식한 시점, 첫 번째 행동, 실패를 극복한 방식. 이 세 가지에서 나만의 교훈을 추출하는 것이 중요합니다.`)
  } else {
    lines.push(`이 소식이 ${domKo} 분야에 만드는 변화를 세 가지 관점으로 분석해보세요: ① 기회 ② 위협 ③ 아직 해결 안 된 문제. 창업가의 눈으로 읽으면 모든 뉴스가 인사이트가 됩니다.`)
  }

  return lines
}

// ══════════════════════════════════════════════════════════════════════
// §9. 메인 롱폼 빌더 v15
// ══════════════════════════════════════════════════════════════════════

function buildLongformStory(title, body) {
  const cleanBody = cleanText(body || '')
  const eventType = detectEvent(title, cleanBody)
  const domain    = detectDomain(title, cleanBody)
  const ner       = parseTitle(title)
  const domKo     = DOMAINS[domain]?.ko || '창업·비즈니스'
  const evtInfo   = EVENT_TYPES[eventType] || { emoji: '📰', label: '주요 소식' }

  // 본문 문장 추출 (body가 title의 반복인 경우 제외)
  const rawSents  = splitSentences(cleanBody).filter(s => !isNoise(s))
  // 제목과 80% 이상 겹치는 문장 제거 (title-only body 필터링)
  const titleToks = tokenize(title)
  const sentences = rawSents.filter(s => {
    const sim = cosineSim(tokenize(s), titleToks)
    return sim < 0.75  // 제목 복사본 아닌 경우만
  })

  const hasRealBody = sentences.length >= 3
  const lines = []
  const usedSet = new Set()

  // ── 헤더 ──────────────────────────────────────────────────────────
  lines.push(`## ${evtInfo.emoji} ${evtInfo.label} · ${domKo}`)
  lines.push('')
  if (ner.amounts.length > 0) {
    lines.push(`🔢 **핵심 수치**: ${ner.amounts.join(' / ')}`)
    lines.push('')
  }
  if (ner.stage) {
    lines.push(`🏷️ **투자 단계**: ${ner.stage}`)
    lines.push('')
  }
  if (ner.tech.length > 0) {
    lines.push(`🔧 **기술 키워드**: ${ner.tech.slice(0, 3).join(' · ')}`)
    lines.push('')
  }
  if (ner.geo.length > 0) {
    lines.push(`📍 **지역**: ${ner.geo.slice(0, 2).join(' · ')}`)
    lines.push('')
  }

  if (hasRealBody) {
    // ── 본문 있는 경우: BM25 키문장 추출 ──────────────────────────
    const scored = scoreAll(sentences, titleToks)
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score)
    const topIdx   = new Set(scored.slice(0, 10).map(x => x.idx))
    const keyLines = sentences.filter((_, i) => topIdx.has(i)).slice(0, 6)
    const numLines = sentences.filter(s => hasNumber(s) && !keyLines.includes(s)).slice(0, 5)
    const cauLines = sentences.filter(s => isCausal(s) && !keyLines.includes(s) && !numLines.includes(s)).slice(0, 3)
    const goalLines = sentences.filter(s => isGoal(s) && !keyLines.includes(s) && !numLines.includes(s) && !cauLines.includes(s)).slice(0, 3)
    const quoteLines = sentences.filter(s => isQuote(s) && !keyLines.includes(s)).slice(0, 3)
    const extraLines = scored.slice(10, 20).map(x => x.sent)
      .filter(s => !keyLines.includes(s) && !numLines.includes(s) && !cauLines.includes(s) && !goalLines.includes(s) && !quoteLines.includes(s))
      .slice(0, 4)
    const importanceSents = sentences.filter(s =>
      /(중요|주목|핵심|의미|영향|변화|화제|관심|신호)/.test(s) &&
      !keyLines.includes(s) && !numLines.includes(s)
    ).slice(0, 2)
    const oppSents = sentences.filter(s =>
      /(기회|전략|가능성|활용|아이디어|모델|비즈니스|창업|솔루션|혁신)/.test(s) &&
      !keyLines.includes(s) && !numLines.includes(s) && !importanceSents.includes(s)
    ).slice(0, 2)

    // §1 도입
    if (keyLines.length > 0 && keyLines[0].length >= 25) {
      usedSet.add(keyLines[0])
      lines.push(keyLines[0])
      lines.push('')
    }
    // §2 핵심 내용
    const mainSents = keyLines.filter(s => !usedSet.has(s)).slice(0, 5)
    if (mainSents.length > 0) {
      lines.push('---', '', '## 📌 핵심 내용', '')
      mainSents.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(`> ${s}`, '') } })
    }
    // §3 주요 수치
    if (numLines.length > 0) {
      lines.push('---', '', '## 📊 주요 수치 & 데이터', '')
      numLines.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(`→ ${s}`) } })
      lines.push('')
    }
    // §4 현장의 목소리
    if (quoteLines.length > 0) {
      lines.push('---', '', '## 💬 현장의 목소리', '')
      quoteLines.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(`> ${s}`, '') } })
    }
    // §5 배경과 맥락
    if (cauLines.length > 0) {
      lines.push('---', '', '## 🗺️ 배경과 맥락', '')
      cauLines.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(s, '') } })
    } else if (extraLines.length >= 2) {
      const extra = extraLines.filter(s => !usedSet.has(s)).slice(0, 3)
      if (extra.length > 0) {
        lines.push('---', '', '## 🗺️ 추가 내용', '')
        extra.forEach(s => { usedSet.add(s); lines.push(s, '') })
      }
    }
    // §6 향후 방향
    if (goalLines.length > 0) {
      lines.push('---', '', '## 🎯 향후 방향', '')
      goalLines.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(`• ${s}`, '') } })
    }
    // §7 왜 주목해야 하나
    if (importanceSents.length > 0) {
      lines.push('---', '', '## 💡 왜 주목해야 하나', '')
      importanceSents.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(s, '') } })
    }
    // §8 창업가 시각
    if (oppSents.length > 0) {
      lines.push('---', '', '## 🚀 창업가 시각으로 읽기', '')
      oppSents.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(s, '') } })
    }

    // 동적 질문
    const questions = buildDynamicQuestions(title, eventType, domain, keyLines, ner)
    if (questions.length > 0) {
      lines.push('---', '', '## 💭 생각해볼 질문', '')
      questions.forEach(q => lines.push(`• **Q.** ${q}`, ''))
    }

  } else {
    // ── 본문 없는 경우: NER 완전 기반 동적 생성 ──────────────────
    const nerSections = buildNerBasedSections(title, eventType, domain, ner)
    for (const sec of nerSections) {
      lines.push('---', '', sec.title, '')
      if (sec.style === 'quote') {
        sec.lines.forEach(l => lines.push(`> ${l}`, ''))
      } else {
        sec.lines.forEach(l => lines.push(l, ''))
      }
    }

    // 동적 질문 (본문 없는 경우 keySents 빈 배열)
    const questions = buildDynamicQuestions(title, eventType, domain, [], ner)
    if (questions.length > 0) {
      lines.push('---', '', '## 💭 생각해볼 질문', '')
      questions.forEach(q => lines.push(`• **Q.** ${q}`, ''))
    }
  }

  // ── 용어 해설 ─────────────────────────────────────────────────────
  const fullText = title + ' ' + cleanBody
  const usedTerms = []
  for (const [term, info] of Object.entries(TERM_DICT)) {
    if (fullText.includes(term) && usedTerms.length < 3) usedTerms.push({ term, ...info })
  }
  if (usedTerms.length > 0) {
    lines.push('---', '', '## 📚 핵심 용어 정리', '')
    for (const { short, explain } of usedTerms) {
      lines.push(`**${short}**`, '', explain, '')
    }
  }

  // ── 푸터 ──────────────────────────────────────────────────────────
  lines.push('---', '')
  lines.push(`*Insightship · ${domKo} · ${evtInfo.emoji} ${evtInfo.label} · insightship-longform-v15*`)

  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════
// §10. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

async function _handleSummarizeNews_impl(req) {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      engine:       'insightship-longform-v15',
      version:      '15.0.0',
      style:        '완전 동적 / 본문 있으면 BM25, 없으면 NER 기반 / 고정 템플릿 0개',
      features:     ['BM25Scoring','NER-FullAnalysis','TitleOnlyFallback','QuoteDetect','CausalDetect',
                     'GoalDetect','EventContextSections','OpportunityLines','TermDictionary',
                     'DynamicQuestions','NoFixedTemplate','ilike-filter'],
      avg_length:   '1200-4000 chars',
      cost:         0,
      external_api: false,
      status:       'ready',
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  const cronHeader   = req.headers.get('x-vercel-cron')
  const authHeader   = req.headers.get('authorization')
  const secretHeader = req.headers.get('x-cron-secret')
  const isAdminJWT   = authHeader && authHeader.startsWith('Bearer ') &&
    authHeader !== `Bearer ${CRON_SECRET}`
    ? await checkAdminJWT(authHeader.slice(7))
    : false

  const isAuth = cronHeader === '1'
    || authHeader === `Bearer ${CRON_SECRET}`
    || secretHeader === CRON_SECRET
    || isAdminJWT

  if (!isAuth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  if (!SB_URL || !SB_KEY) return new Response(JSON.stringify({ error: 'Missing env' }), { status: 500 })

  const H = {
    apikey:         SB_KEY,
    Authorization:  `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  }

  let params = {}
  try {
    if (req.method === 'POST') {
      const ct = req.headers.get('content-type') || ''
      if (ct.includes('application/json')) params = await req.json().catch(() => ({}))
    }
  } catch {}

  const reprocessAll = params.reprocess === true
  const batchLimit   = Math.min(params.limit || 50, 100)
  const offset       = Math.max(Number(params.offset) || 0, 0)
  const cutoffDays   = params.days || 7

  let articles = []
  try {
    if (reprocessAll) {
      // v15 마커 없는 기사 전체 대상 (ilike)
      const url = `${SB_URL}/rest/v1/articles`
        + `?select=id,title,body,excerpt,ai_summary`
        + `&ai_summary=not.ilike.*insightship-longform-v15*`
        + `&order=published_at.desc`
        + `&limit=${batchLimit}&offset=${offset}`
      const res = await fetch(url, { headers: H })
      const all = await res.json()
      articles = Array.isArray(all) ? all : []
      if (articles.length === 0) {
        const r2 = await fetch(
          `${SB_URL}/rest/v1/articles?select=id,title,body,excerpt&order=published_at.desc&limit=${batchLimit}&offset=${offset}`,
          { headers: H }
        )
        articles = (await r2.json().catch(() => []))
        if (!Array.isArray(articles)) articles = []
      }
    } else {
      // 기본: 최근 N일 내 v15 미완료 기사
      const cutoff = new Date(Date.now() - cutoffDays * 86400 * 1000).toISOString()
      const url = `${SB_URL}/rest/v1/articles`
        + `?published_at=gte.${cutoff}`
        + `&select=id,title,body,excerpt,ai_summary`
        + `&order=published_at.desc`
        + `&limit=${batchLimit}&offset=${offset}`
      const res = await fetch(url, { headers: H })
      const all = await res.json()
      const unprocessed = Array.isArray(all)
        ? all.filter(a => !a.ai_summary || !a.ai_summary.includes('insightship-longform-v15'))
        : []
      articles = unprocessed.length > 0 ? unprocessed : (Array.isArray(all) ? all.slice(0, Math.ceil(batchLimit / 2)) : [])
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }

  if (!articles.length) {
    return new Response(JSON.stringify({
      message:   '처리할 기사 없음 (모두 v15 처리 완료)',
      processed: 0, skipped: 0, errors: [],
      engine:    'insightship-longform-v15',
      timestamp: new Date().toISOString(),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const processedTitles = []
  const results = { processed: 0, skipped: 0, duplicates: 0, errors: [] }

  await Promise.allSettled(articles.map(async article => {
    try {
      const { id, title, body, excerpt } = article
      if (!title) { results.skipped++; return }

      if (isDuplicateTitle(title, processedTitles)) {
        results.duplicates++; results.skipped++; return
      }
      processedTitles.push(title)

      const bodyText  = (body && body.length > 100) ? body : (excerpt || '')
      const summary   = buildLongformStory(title, bodyText)
      const domain    = detectDomain(title, cleanText(bodyText))
      const eventType = detectEvent(title, cleanText(bodyText))
      const category  = mapCategory(domain, eventType)
      const readTime  = estimateReadTime(summary)

      const patchRes = await fetch(
        `${SB_URL}/rest/v1/articles?id=eq.${id}`,
        {
          method:  'PATCH',
          headers: { ...H, Prefer: 'return=minimal' },
          body:    JSON.stringify({
            ai_summary:      summary,
            category,
            ai_processed_at: new Date().toISOString(),
            read_time:       readTime,
            ai_category:     domain,
          }),
        }
      )

      if (patchRes.ok || patchRes.status === 204) results.processed++
      else {
        const err = await patchRes.text()
        results.errors.push(`[${id}] HTTP${patchRes.status} ${err.slice(0, 300)}`)
      }
    } catch (e) {
      results.errors.push(e.message?.slice(0, 80))
    }
  }))

  return new Response(JSON.stringify({
    ...results,
    total:     articles.length,
    engine:    'insightship-longform-v15',
    timestamp: new Date().toISOString(),
  }), {
    status:  200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function checkAdminJWT(token) {
  if (!token || !SB_URL || !SB_KEY) return false
  try {
    // 1) Supabase Auth에서 user.id 추출
    const r1 = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r1.ok) return false
    const user = await r1.json().catch(() => null)
    if (!user?.id) return false

    // 2) service_role 키로 profiles에서 role 확인 (RLS 우회)
    const r2 = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,role&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    )
    if (!r2.ok) return false
    const rows = await r2.json().catch(() => [])
    return Array.isArray(rows) && rows[0]?.role === 'admin'
  } catch { return false }
}

  return _handleSummarizeNews_impl
})();

const handleRunSummarize = (() => {
/**
 * api/run-summarize.js
 * Insightship LongForm News AI v8 — 배치 요약 실행기
 * LongBlack 스타일 롱폼 스토리텔링 / 외부 API 0원
 *
 * POST /api/run-summarize  (authorization: Bearer CRON_SECRET)
 * GET  /api/run-summarize  → 상태 확인
 */


const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// ══════════════════════════════════════════════════════════════════════
// §1. 텍스트 정제
// ══════════════════════════════════════════════════════════════════════

function cleanText(text) {
  return (text || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x?[0-9a-fA-F]+;/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/공유하기|페이스북|트위터|카카오|인스타그램|네이버 밴드|URL 복사/g, '')
    .replace(/기자\s*[가-힣]{2,4}\s*기자|^\s*[가-힣]{2,3}\s*기자/gm, '')
    .replace(/입력\s*\d{4}\.\d{2}\.\d{2}.*$/gm, '')
    .replace(/수정\s*\d{4}\.\d{2}\.\d{2}.*$/gm, '')
    .replace(/저작권자\s*©.*$/gm, '')
    .replace(/무단전재\s*및\s*재배포\s*금지/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function splitSentences(text) {
  return text
    .replace(/([.!?])\s+/g, '$1\n')
    .replace(/([다요임음])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length >= 15 && s.length <= 350)
}

function isNoiseSentence(s) {
  return /무단\s*(전재|배포|복제)|copyright|all rights reserved|구독|좋아요|댓글|광고|협찬|PR\b/i.test(s)
}

// ══════════════════════════════════════════════════════════════════════
// §2. 이벤트·도메인 분류
// ══════════════════════════════════════════════════════════════════════

const EVENT_TYPES = {
  funding:     { kw: ['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC','엔젤','프리IPO'], label: '투자 유치', emoji: '💰' },
  product:     { kw: ['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈','런칭','배포'], label: '제품/서비스 출시', emoji: '🚀' },
  policy:      { kw: ['정부','지원','공모','선발','과기부','중기부','창진원','예산','규제','정책','공고','모집'], label: '정책/지원', emoji: '📋' },
  acquisition: { kw: ['인수','합병','M&A','지분','매각','인수합병','피인수'], label: '인수/합병', emoji: '🤝' },
  research:    { kw: ['연구','논문','결과','조사','분석','보고서','데이터','통계','발표','리포트','조사결과'], label: '연구/조사', emoji: '🔬' },
  person:      { kw: ['대표','CEO','창업자','설립자','인터뷰','스토리','수상','선정','창업가'], label: '창업가 스토리', emoji: '👤' },
  market:      { kw: ['시장','성장','규모','트렌드','전망','예측','확대','점유율','글로벌','산업'], label: '시장/트렌드', emoji: '📊' },
}

const DOMAINS = {
  investment: { kw: ['투자','펀딩','시리즈A','시리즈B','시리즈C','억원','조원','VC','엑셀러레이터','벤처'], ko: '투자·금융', cat: 'trend' },
  tech:       { kw: ['AI','인공지능','딥러닝','반도체','GPU','클라우드','SaaS','소프트웨어','로봇','자율주행'], ko: '기술·AI', cat: 'trend' },
  youth:      { kw: ['청소년','청년','대학생','고등학생','창업교육','해커톤','비즈쿨','학생창업'], ko: '청소년·교육', cat: 'insight' },
  policy:     { kw: ['정부','지원','공모','과기부','중기부','창진원','규제','정책','지자체'], ko: '정책·지원', cat: 'insight' },
  esg:        { kw: ['ESG','탄소중립','친환경','임팩트','소셜벤처','그린','지속가능'], ko: 'ESG·임팩트', cat: 'insight' },
  startup:    { kw: ['스타트업','창업','유니콘','피봇','글로벌','스케일업','창업팀'], ko: '창업·비즈니스', cat: 'news' },
  edutech:    { kw: ['에듀테크','교육플랫폼','학습','온라인교육','이러닝','EdTech'], ko: '에듀테크', cat: 'insight' },
  fintech:    { kw: ['핀테크','결제','금융','블록체인','암호화폐','NFT','디파이'], ko: '핀테크', cat: 'trend' },
  health:     { kw: ['헬스케어','의료','바이오','디지털헬스','건강','제약','메디컬'], ko: '헬스케어', cat: 'trend' },
  climate:    { kw: ['기후','탄소','친환경','에너지','태양광','수소','클린테크'], ko: '기후·에너지', cat: 'insight' },
}

function detectEvent(title, body) {
  const text = (title + ' ' + (body || '').slice(0, 600)).toLowerCase()
  const priority = ['funding','acquisition','product','policy','research','person','market']
  const scores = {}
  for (const type of priority) {
    scores[type] = EVENT_TYPES[type].kw.filter(k => text.includes(k.toLowerCase())).length
    scores[type] += EVENT_TYPES[type].kw.filter(k => title.toLowerCase().includes(k.toLowerCase())).length
  }
  const best = priority.reduce((a, b) => scores[a] >= scores[b] ? a : b)
  return scores[best] > 0 ? best : 'general'
}

function detectDomain(title, body) {
  const text = (title + ' ' + (body || '').slice(0, 800)).toLowerCase()
  let best = 'startup', bestScore = 0
  for (const [domain, { kw }] of Object.entries(DOMAINS)) {
    const score = kw.filter(k => text.includes(k.toLowerCase())).length
    if (score > bestScore) { best = domain; bestScore = score }
  }
  return best
}

function mapCategory(domain, eventType) {
  if (eventType === 'policy' || domain === 'youth' || domain === 'policy') return 'insight'
  if (eventType === 'funding' || eventType === 'market') return 'trend'
  if (eventType === 'person') return 'magazine'
  return DOMAINS[domain]?.cat || 'news'
}

function estimateReadTime(text) {
  return Math.max(3, Math.ceil((text || '').length / 350))
}

// ══════════════════════════════════════════════════════════════════════
// §3. 핵심 문장 추출
// ══════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','위해','통해',
  '있는','없는','되는','하는','있다','없다','된다','한다','이다',
  '있으며','되며','하며','이번','지난','올해','작년','최근','현재',
  '특히','또','더','가장','매우','모두','함께','이미','아직','약','총',
  '기자','특파원','뉴스','보도','발표','밝혔다','말했다','전했다',
])

function tokenize(text) {
  if (!text) return []
  return (text.replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g, ' ').toLowerCase()
    .match(/[가-힣]{2,}|[a-z]{3,}|[0-9]+/g) || [])
    .filter(t => !STOPWORDS.has(t) && t.length >= 2)
}

function extractKeySentences(title, sentences, count = 5) {
  const titleToks = new Set(tokenize(title))
  const clean = sentences.filter(s => !isNoiseSentence(s) && s.length >= 20)
  if (!clean.length) return []
  const scored = clean.map((s, i) => {
    const sToks = tokenize(s)
    const overlap = sToks.filter(t => titleToks.has(t)).length
    const posBonus = i < 3 ? 1.5 : i < 6 ? 1.2 : 1.0
    const numBonus = /[\d,]+억|[\d,]+조|[\d]+%|[\d]+배/.test(s) ? 1.6 : 1.0
    const causalBonus = /때문에|이유로|배경에는|결과로|따라서|덕분에/.test(s) ? 1.3 : 1.0
    const lenBonus = (s.length >= 30 && s.length <= 200) ? 1.2 : 1.0
    return { s, score: (overlap + 1) * posBonus * numBonus * causalBonus * lenBonus, idx: i }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, count).sort((a, b) => a.idx - b.idx).map(x => x.s)
}

function extractNumbers(text) {
  const patterns = [/[\d,]+억\s*원/g, /[\d,]+조\s*원/g, /[\d,]+만\s*원/g, /[\d]+\s*%/g, /[\d,]+만\s*명/g, /[\d]+\s*배/g]
  const matches = []
  for (const p of patterns) matches.push(...(text.match(p) || []))
  return [...new Set(matches)].slice(0, 5)
}

function extractCompanyNames(title, body) {
  const text = title + ' ' + (body || '')
  const patterns = [
    /[가-힣A-Z][가-힣A-Za-z]{1,8}(?:주식회사|㈜|\(주\))/g,
    /[가-힣]{2,6}(?:테크|플랫폼|랩스|스튜디오|파트너스|벤처스|캐피탈|그룹)/g,
  ]
  const names = []
  for (const p of patterns) names.push(...(text.match(p) || []))
  return [...new Set(names)].slice(0, 3)
}

// ══════════════════════════════════════════════════════════════════════
// §4. 배경지식 & 스토리 내러티브 데이터
// ══════════════════════════════════════════════════════════════════════

const TERM_DICT = {
  'IPO':          { short: 'IPO(기업공개)', long: 'IPO란 기업이 주식시장에 처음으로 주식을 상장하는 것입니다. 이 과정을 통해 일반 투자자들이 그 회사의 주주가 될 수 있습니다.' },
  'VC':           { short: 'VC(벤처캐피털)', long: 'VC(벤처캐피털)는 성장 가능성이 높은 스타트업에 투자하는 전문 투자사입니다. 돈뿐만 아니라 경영 노하우와 네트워크도 함께 제공합니다.' },
  '시리즈A':      { short: '시리즈A(초기 대규모 투자)', long: '시리즈A는 스타트업이 PMF를 입증한 후 받는 첫 번째 대규모 투자 단계입니다. 보통 수십억 원 규모입니다.' },
  '시리즈B':      { short: '시리즈B(성장 단계 투자)', long: '시리즈B는 사업 모델이 검증된 스타트업이 본격적인 규모 확장을 위해 받는 투자입니다.' },
  '유니콘':       { short: '유니콘(기업가치 1조원 이상 스타트업)', long: '유니콘 기업은 상장하지 않은 스타트업 중 기업가치가 1조 원(약 10억 달러) 이상인 회사를 말합니다.' },
  'SaaS':         { short: 'SaaS(구독형 소프트웨어)', long: 'SaaS는 소프트웨어를 인터넷으로 월 구독료를 내고 사용하는 방식입니다. 한 번 만들면 수백만 명에게 팔 수 있는 확장성이 핵심입니다.' },
  'B2B':          { short: 'B2B(기업 간 거래)', long: 'B2B는 기업이 일반 소비자가 아닌 다른 기업을 고객으로 하는 비즈니스 모델입니다.' },
  'MVP':          { short: 'MVP(최소 기능 제품)', long: 'MVP는 핵심 기능만 갖춘 초기 버전의 제품입니다. 빠르게 시장에 출시해 고객 반응을 검증하는 데 사용합니다.' },
  'PMF':          { short: 'PMF(제품-시장 적합성)', long: 'PMF는 만든 제품이 시장의 수요와 딱 맞아떨어지는 상태를 말합니다. 스타트업이 투자받기 전에 반드시 증명해야 합니다.' },
  'M&A':          { short: 'M&A(기업 인수·합병)', long: 'M&A는 한 기업이 다른 기업을 사거나 합치는 것입니다. 스타트업에게는 EXIT(출구) 전략 중 하나입니다.' },
  '엑셀러레이터': { short: '엑셀러레이터(창업 육성 기관)', long: '엑셀러레이터는 초기 스타트업에게 투자금, 멘토링, 네트워크를 제공해 성장을 가속시키는 기관입니다.' },
  '피봇':         { short: '피봇(사업 방향 전환)', long: '피봇은 스타트업이 초기 아이디어가 시장에서 통하지 않을 때 사업 방향을 크게 전환하는 것입니다.' },
  'ARR':          { short: 'ARR(연간 반복 수익)', long: 'ARR은 구독 기반 비즈니스에서 1년간 반복적으로 발생하는 매출입니다. SaaS 기업 가치 평가의 핵심 지표입니다.' },
  'TIPS':         { short: 'TIPS(정부 창업 지원 프로그램)', long: 'TIPS는 민간 투자사가 먼저 투자한 스타트업에 정부가 매칭 투자를 해주는 한국의 대표 창업 지원 프로그램입니다.' },
}

const DOMAIN_CONTEXT = {
  investment: {
    background: '스타트업 투자 생태계는 엔젤투자 → 시드 → 시리즈A → 시리즈B → 시리즈C → 프리IPO → IPO 순서로 성장합니다. 각 단계마다 기업이 증명해야 할 것이 다릅니다. 시드 단계에서는 팀과 아이디어를, 시리즈A에서는 PMF(제품-시장 적합성)를, 시리즈B 이상에서는 스케일업 가능성을 보여줘야 합니다.',
    trend: '2024~2025년 글로벌 스타트업 투자 시장은 AI, 클린테크, 바이오 분야에 집중되고 있습니다. 금리가 높아지면서 "흑자 성장"을 요구하는 투자자가 늘었고, 과거처럼 성장만 내세우는 스타트업은 투자받기 어려워졌습니다.',
    implication: '투자 유치는 단순히 돈을 받는 것이 아닙니다. 투자자는 창업가의 비전을 검증해주는 파트너이자, 네트워크와 경험을 함께 제공하는 조언자입니다. 중요한 것은 "왜 이 투자자인가"입니다. 단순히 돈이 많은 투자자보다, 내 사업 분야를 잘 아는 투자자를 찾는 것이 장기적으로 유리합니다.',
  },
  tech: {
    background: '기술 혁신은 S자 곡선을 그립니다. 초기에는 느리게 성장하다가 어느 순간 폭발적으로 확산됩니다. 스마트폰이 그랬고, 소셜미디어가 그랬으며, 이제 AI가 그 변곡점을 지나고 있습니다. 중요한 것은 기술 자체가 아니라 "그 기술이 해결하는 문제"입니다.',
    trend: 'AI 기술은 의료, 금융, 교육, 제조, 물류 등 거의 모든 산업에 침투하고 있습니다. 특히 생성형 AI의 등장으로 텍스트, 이미지, 코드 생성이 자동화되면서 많은 직업이 변화하고 있습니다. AI를 핵심 역량으로 내재화한 기업과 그렇지 않은 기업 사이의 격차가 빠르게 벌어지고 있습니다.',
    implication: '기술을 배우는 것보다 기술로 문제를 해결하는 능력이 중요합니다. 성공한 기술 창업가들은 "가장 최신 기술"이 아니라 "고객의 가장 큰 불편함"을 먼저 찾습니다. 지금 당장 주변에서 반복적으로 불편하다고 느끼는 것을 기록해보세요.',
  },
  youth: {
    background: '청소년 창업은 전 세계적으로 확산되고 있습니다. 한국에서도 중기부의 예비창업패키지, 비즈쿨, 창업동아리 지원 등 청소년 창업 생태계가 빠르게 성장하고 있습니다. 나이는 더 이상 창업의 장벽이 아닙니다.',
    trend: '청소년 창업가들이 가진 강점은 디지털 네이티브 감각과 빠른 실행력입니다. MZ세대가 소비자이자 창업자로 부상하면서, 또래의 문제를 누구보다 잘 이해하는 청소년이 오히려 유리한 시장이 열리고 있습니다.',
    implication: '지금 당장 창업이 어렵다면, 창업 준비를 시작하세요. 비즈니스 모델 설계, 팀 빌딩, 피칭 연습은 언제 시작해도 이릅니다. 학교 창업동아리, 해커톤 참가, 창업 경진대회 지원이 가장 좋은 시작점입니다.',
  },
  policy: {
    background: '한국 정부는 매년 수조 원 규모의 창업 지원 예산을 집행합니다. 예비창업패키지(최대 1억 원), TIPS(최대 7억 원), K-스타트업 그랜드챌린지 등이 주요 프로그램입니다.',
    trend: '최근 정부 창업 지원은 AI·바이오·클린테크 등 딥테크 분야에 집중되고 있으며, 청소년·대학생 대상 지원도 확대되는 추세입니다.',
    implication: '정책 자금은 창업 초기 가장 저렴한 자본입니다. 지분을 내주지 않고 사업 초기 자금을 마련할 수 있는 몇 안 되는 방법입니다. K-스타트업 창업지원포털(www.k-startup.go.kr)을 즐겨찾기에 추가하고 정기적으로 공고를 확인하세요.',
  },
  startup: {
    background: '스타트업은 단순한 작은 회사가 아닙니다. 반복 가능하고 확장 가능한 비즈니스 모델을 찾는 임시 조직입니다. 앱 하나로 수천만 명에게 서비스를 제공할 수 있는 것처럼, 한 번 만든 것으로 무한히 성장할 수 있는 구조가 스타트업의 본질입니다.',
    trend: '2024~2025년 한국 스타트업 생태계는 양적 성장에서 질적 성장으로 전환하고 있습니다. 유니콘 기업 수는 20개를 넘어섰고, 글로벌 진출 성공 사례도 늘고 있습니다.',
    implication: '스타트업 창업에서 가장 중요한 것은 "문제 정의"입니다. 먼저 사람들이 진짜로 겪고 있는 불편함을 찾고, 그다음에 해결책을 만드세요.',
  },
  edutech: {
    background: '에듀테크 시장은 코로나19 이후 전 세계적으로 폭발적으로 성장했습니다. AI 맞춤형 교육, 게임화 학습(게이미피케이션) 등 새로운 학습 방식이 전통적인 교육을 변화시키고 있습니다.',
    trend: '최근 에듀테크의 핵심 트렌드는 "개인화"입니다. AI가 각 학생의 학습 패턴과 수준을 분석해 최적화된 학습 경험을 제공합니다. 국내에서는 뤼이드, 클래스101, 밀리의서재 등이 두각을 나타내고 있습니다.',
    implication: '교육은 변화가 가장 느린 산업 중 하나였지만 지금은 가장 빠르게 변하고 있습니다. 학교에서 가르치지 않는 것들—창업, 재테크, 소통법—을 온라인으로 가르치는 비즈니스 기회가 여전히 많습니다.',
  },
  fintech: {
    background: '핀테크(FinTech)는 금융과 기술의 합성어입니다. 카카오뱅크, 토스, 뱅크샐러드가 한국 핀테크의 대표 사례입니다. 기존 금융 서비스를 기술로 더 빠르고 저렴하게 혁신하는 산업입니다.',
    trend: '최근 핀테크는 대출, 결제를 넘어 자산관리, 보험, 기업 금융으로 영역을 확장하고 있습니다. 특히 임베디드 파이낸스(금융 서비스를 비금융 플랫폼에 내장)가 새로운 트렌드로 떠오르고 있습니다.',
    implication: '금융은 모든 비즈니스의 기반입니다. 창업을 생각한다면 기본적인 재무 지식은 필수입니다. 매출, 비용, 이익, 현금흐름의 차이를 이해하세요.',
  },
  health: {
    background: '헬스케어·바이오 분야는 인류가 직면한 가장 크고 중요한 문제들을 다룹니다. 규제가 엄격한 만큼 진입 장벽이 높지만, 그만큼 성공했을 때의 임팩트도 큽니다.',
    trend: '디지털 헬스케어가 주목받고 있습니다. 스마트워치로 심전도를 측정하고, AI가 X-ray에서 암을 발견하고, 원격진료로 집에서 의사와 상담하는 시대가 왔습니다.',
    implication: '헬스케어 창업은 높은 진입 장벽만큼 사회적 임팩트도 큽니다. 관심이 있다면 의료 규제를 먼저 공부하고, 의사나 간호사 등 도메인 전문가를 팀에 영입하는 것이 중요합니다.',
  },
  esg: {
    background: 'ESG(Environmental, Social, Governance)는 기업이 환경, 사회, 지배구조를 얼마나 책임감 있게 운영하는지를 평가하는 기준입니다. 최근 투자자들이 ESG를 투자 결정의 핵심 요소로 보고 있습니다.',
    trend: '소셜벤처와 임팩트 투자가 빠르게 성장하고 있습니다. "돈을 벌면서 세상을 바꾼다"는 철학을 가진 기업들이 투자자와 소비자 모두에게 주목받고 있습니다.',
    implication: '사회 문제를 비즈니스로 해결하는 것이 가장 지속 가능한 창업 방식입니다. "우리가 해결하는 문제가 사라지면 세상은 어떻게 좋아지는가?"라는 질문에 명확하게 답할 수 있는 스타트업이 강합니다.',
  },
  climate: {
    background: '기후 위기는 21세기 가장 큰 사업 기회이기도 합니다. 탄소 중립 달성을 위해 에너지, 운송, 건설, 식품 등 모든 산업이 변화해야 하고, 이 과정에서 수천 개의 스타트업이 탄생하고 있습니다.',
    trend: '태양광, 배터리, 수소에너지 비용이 빠르게 하락하면서 클린에너지가 경제성을 갖추기 시작했습니다. 탄소배출권 시장, 친환경 포장재, 대체단백질 등 새로운 시장이 급성장하고 있습니다.',
    implication: '기후 문제를 해결하는 창업은 비즈니스를 넘어 세대적 책임입니다. 관심 있다면 그린테크 해커톤 참가, 탄소발자국 계산 등 작은 것부터 시작해 문제를 피부로 느껴보세요.',
  },
}

const EVENT_NARRATIVE = {
  funding: {
    openingAngle: '투자',
    whatHappened: (nums) => `이번 소식의 핵심은 자금 확보입니다. ${nums.length > 0 ? `총 ${nums[0]} 규모의 투자가 이루어졌으며,` : ''} 이는 시장이 이 기업의 가능성을 인정했다는 강력한 신호입니다.`,
    whyItMatters: '스타트업에게 투자 유치는 단순한 자금 확보를 넘어 시장의 공신력을 얻는 과정입니다. 투자자들은 수백, 수천 개의 기업을 검토한 후 소수에만 투자합니다.',
    keyQuestion: '이 기업은 어떤 문제를 해결하기에 투자자들이 선택했을까요?',
    actionPoint: '투자받은 기업의 사업 모델, 팀 구성, 성장 지표를 분석해보세요. 성공적인 투자 사례에서 패턴을 발견하는 것이 미래 창업가로서의 안목을 키웁니다.',
  },
  product: {
    openingAngle: '출시',
    whatHappened: (nums) => `새로운 제품 또는 서비스가 시장에 나왔습니다. 이것이 중요한 이유는 시장의 실제 수요를 반영하기 때문입니다.`,
    whyItMatters: '새로운 서비스 출시는 "이 문제가 충분히 크다"는 시장의 확인입니다. 실제 사람들이 돈을 내고 쓸 만큼 문제가 크다는 뜻이기도 합니다.',
    keyQuestion: '기존 대안과 비교했을 때 이 서비스만의 차별점은 무엇인가요?',
    actionPoint: '이 서비스를 직접 사용해보고, "내가 더 잘 만들 수 있을까? 아니면 이 서비스의 빈틈은 어디인가?"를 생각해보세요.',
  },
  policy: {
    openingAngle: '지원',
    whatHappened: (nums) => `정부 또는 공공기관이 새로운 창업 지원 프로그램을 발표했습니다. ${nums.length > 0 ? `총 ${nums[0]} 규모의 지원이 예정되어 있습니다.` : ''}`,
    whyItMatters: '정부 지원은 초기 창업가에게 가장 접근하기 쉬운 자금원입니다. 지분을 희석하지 않고 사업 검증에 필요한 자금을 확보할 수 있습니다.',
    keyQuestion: '이 지원 프로그램의 지원 자격과 신청 방법은 무엇인가요?',
    actionPoint: 'K-스타트업 창업지원포털(www.k-startup.go.kr)을 즐겨찾기하고, 정기적으로 공고를 확인하는 습관을 만드세요.',
  },
  acquisition: {
    openingAngle: 'M&A',
    whatHappened: (nums) => `기업 인수·합병(M&A) 소식입니다. ${nums.length > 0 ? `${nums[0]} 규모로` : ''} 이루어진 이번 거래는 업계 지형을 바꿀 중요한 사건입니다.`,
    whyItMatters: 'M&A는 스타트업 생태계의 중요한 출구 전략 중 하나입니다. 창업 후 상장(IPO)이 아닌, 대기업에 인수되는 방식으로 EXIT하는 경우가 훨씬 많습니다.',
    keyQuestion: '인수한 기업은 왜 이 스타트업을 샀을까요? 어떤 기술이나 시장을 원했을까요?',
    actionPoint: '"나중에 어떤 기업에 인수되고 싶은가?"라는 역발상으로 창업 전략을 설계해보는 것도 좋은 방법입니다.',
  },
  research: {
    openingAngle: '연구',
    whatHappened: (nums) => `새로운 연구 결과 또는 시장 조사가 발표됐습니다. ${nums.length > 0 ? `주요 수치: ${nums.join(', ')}` : ''}`,
    whyItMatters: '데이터와 연구 결과는 막연한 아이디어를 검증해주는 도구입니다. 시장의 크기와 성장 속도를 수치로 확인하는 것이 투자 유치의 첫걸음입니다.',
    keyQuestion: '이 연구 결과가 사실이라면, 어떤 새로운 사업 기회가 생길까요?',
    actionPoint: '창업 아이디어를 검증할 때 반드시 관련 시장 조사 데이터를 찾아보세요. 근거 없는 아이디어보다 데이터로 뒷받침된 가설이 훨씬 설득력 있습니다.',
  },
  person: {
    openingAngle: '창업가',
    whatHappened: (nums) => `한 창업가의 이야기가 주목받고 있습니다. 성공한 창업가의 여정에는 반드시 배울 것이 있습니다.`,
    whyItMatters: '창업은 혼자 하는 것이 아닙니다. 훌륭한 멘토와 롤모델의 경험에서 배우는 것이 가장 빠른 성장 방법입니다.',
    keyQuestion: '이 창업가가 겪은 가장 큰 위기는 무엇이었고, 어떻게 극복했나요?',
    actionPoint: '이 창업가의 초기 인터뷰, 강연 영상을 찾아보세요. 성공한 사람들의 현재보다 "실패했던 과거"에서 더 많은 것을 배울 수 있습니다.',
  },
  market: {
    openingAngle: '시장',
    whatHappened: (nums) => `시장 동향과 트렌드에 관한 중요한 소식입니다. ${nums.length > 0 ? `${nums.join(', ')} 등의 수치가 이 변화의 크기를 보여줍니다.` : ''}`,
    whyItMatters: '시장 트렌드를 읽는 능력은 창업 타이밍의 핵심입니다. 너무 일찍 시장에 나오면 고객이 없고, 너무 늦으면 경쟁이 치열합니다.',
    keyQuestion: '이 시장이 지금 성장하는 이유는 무엇인가요? 5년 후에는 어떤 모습일까요?',
    actionPoint: '이 시장의 주요 플레이어 3~5개 기업을 조사하고, 각각의 강점과 약점을 분석해보세요.',
  },
  general: {
    openingAngle: '창업',
    whatHappened: (nums) => `창업·비즈니스 생태계에서 주목할 만한 소식이 들어왔습니다.`,
    whyItMatters: '창업 생태계의 모든 변화는 새로운 기회이거나 새로운 위협입니다. 뉴스를 수동적으로 읽지 말고 "이 변화로 누가 이익을 얻고, 누가 손해를 보는가?"를 분석하는 습관을 만드세요.',
    keyQuestion: '이 소식이 가져올 가장 큰 변화는 무엇인가요?',
    actionPoint: '오늘 읽은 뉴스에서 창업 아이디어 한 가지를 뽑아내는 연습을 해보세요.',
  },
}

function getDeepQuestions(eventType) {
  const byEvent = {
    funding: [
      '이 투자가 성공적이려면 이 기업은 앞으로 무엇을 증명해야 할까요?',
      '나라면 이 기업에 투자했을까요? 그 이유는?',
      '이 분야에서 아직 투자가 이루어지지 않은 문제는 무엇일까요?',
    ],
    product: [
      '이 제품이 없었을 때 사람들은 이 문제를 어떻게 해결했을까요?',
      '1년 후 이 서비스의 가장 큰 경쟁자는 누가 될까요?',
      '이 서비스에서 아직 해결하지 못한 불편함은 무엇인가요?',
    ],
    policy: [
      '이 정책 지원을 받기 위해 지금 준비해야 할 것은 무엇인가요?',
      '정부가 이 분야를 지원하는 진짜 이유는 무엇일까요?',
      '지원을 받지 못한 팀들은 어떤 점이 부족했을까요?',
    ],
    acquisition: [
      '인수된 스타트업 창업가는 왜 IPO 대신 M&A를 선택했을까요?',
      '이 인수로 인해 기존 경쟁자들은 어떤 영향을 받을까요?',
      '당신이 이 스타트업을 창업했다면, 팔겠습니까 아니면 계속 키우겠습니까?',
    ],
    research: [
      '이 데이터가 5년 전과 달라진 이유는 무엇일까요?',
      '이 연구 결과와 반대되는 의견은 없을까요?',
      '이 데이터를 바탕으로 창업할 수 있는 아이디어 3개를 생각해보세요.',
    ],
    person: [
      '이 창업가의 가장 큰 실패는 무엇이었고, 그로부터 무엇을 배웠나요?',
      '같은 상황에서 나라면 다른 선택을 했을까요?',
      '이 창업가처럼 되기 위해 지금 당장 할 수 있는 가장 작은 행동은?',
    ],
    market: [
      '이 시장이 10배 성장했을 때 가장 큰 수혜자는 누구일까요?',
      '이 트렌드가 거품이 될 수도 있을까요? 그 징후는?',
      '이 시장에서 아직 아무도 해결하지 못한 문제는 무엇인가요?',
    ],
    general: [
      '이 소식이 미치는 영향을 가장 많이 받는 사람은 누구인가요?',
      '5년 후 이 분야는 어떤 모습일까요?',
      '이 뉴스에서 창업 기회를 하나 뽑는다면 무엇인가요?',
    ],
  }
  return byEvent[eventType] || byEvent.general
}

// ══════════════════════════════════════════════════════════════════════
// §5. LongBlack 스타일 롱폼 스토리 생성기
// ══════════════════════════════════════════════════════════════════════

function buildLongformStory(title, body) {
  const cleanBody  = cleanText(body || '')
  const eventType  = detectEvent(title, cleanBody)
  const domain     = detectDomain(title, cleanBody)
  const sentences  = splitSentences(cleanBody).filter(s => !isNoiseSentence(s))
  const keySents   = extractKeySentences(title, sentences, 6)
  const numbers    = extractNumbers(title + ' ' + cleanBody)
  const companies  = extractCompanyNames(title, cleanBody)

  const evtInfo    = EVENT_TYPES[eventType] || EVENT_TYPES.market
  const domCtx     = DOMAIN_CONTEXT[domain] || DOMAIN_CONTEXT.startup
  const narrative  = EVENT_NARRATIVE[eventType] || EVENT_NARRATIVE.general

  const mainSents  = keySents.slice(0, 4)
  const extraSents = keySents.slice(4)

  const titleAndBody = title + ' ' + cleanBody
  const usedTerms = []
  for (const [term, info] of Object.entries(TERM_DICT)) {
    if (titleAndBody.includes(term)) {
      usedTerms.push({ term, ...info })
      if (usedTerms.length >= 4) break
    }
  }

  const lines = []

  // §5.1 헤드라인 & 리드
  lines.push(`## ${evtInfo.emoji} ${evtInfo.label}`)
  lines.push(``)
  lines.push(`**지금 이 순간, ${DOMAINS[domain]?.ko || narrative.openingAngle} 생태계에서 주목할 만한 일이 벌어지고 있습니다.**`)
  lines.push(``)
  lines.push(narrative.whatHappened(numbers))
  lines.push(``)

  if (mainSents.length > 0) {
    lines.push(`> ${mainSents[0]}`)
    lines.push(``)
    if (mainSents.length > 1) { lines.push(mainSents[1]); lines.push(``) }
  }

  // §5.2 핵심 사실 분석
  lines.push(`---`)
  lines.push(``)
  lines.push(`## 📌 핵심 사실 분석`)
  lines.push(``)
  lines.push(narrative.whyItMatters)
  lines.push(``)

  if (numbers.length > 0) {
    lines.push(`**이번 소식의 주요 수치:**`)
    lines.push(``)
    for (const num of numbers) {
      lines.push(`• **${num}** — 이 수치가 의미하는 것은 시장의 규모와 성장 속도입니다.`)
    }
    lines.push(``)
  }

  if (companies.length > 0) {
    lines.push(`**주목할 기업:** ${companies.join(', ')}`)
    lines.push(``)
  }

  if (mainSents.length > 2) {
    lines.push(`**현장에서 전해진 내용:**`)
    lines.push(``)
    for (const s of mainSents.slice(2)) { lines.push(`> ${s}`); lines.push(``) }
  }

  if (extraSents.length > 0) {
    for (const s of extraSents) { lines.push(s); lines.push(``) }
  }

  // §5.3 심층 배경 & 맥락
  lines.push(`---`)
  lines.push(``)
  lines.push(`## 🔍 왜 지금 이 뉴스가 중요한가`)
  lines.push(``)
  lines.push(domCtx.background)
  lines.push(``)
  lines.push(`**지금 이 분야의 트렌드:**`)
  lines.push(``)
  lines.push(domCtx.trend)
  lines.push(``)

  // §5.4 용어 설명
  if (usedTerms.length > 0) {
    lines.push(`---`)
    lines.push(``)
    lines.push(`## 📚 핵심 개념 이해하기`)
    lines.push(``)
    lines.push(`*이 뉴스를 제대로 읽으려면 전문 용어를 알아야 합니다.*`)
    lines.push(``)
    for (const { term, short, long } of usedTerms) {
      lines.push(`**${short}**`)
      lines.push(``)
      lines.push(long)
      lines.push(``)
    }
  }

  // §5.5 창업가 시선
  lines.push(`---`)
  lines.push(``)
  lines.push(`## 💡 창업가의 시선으로 읽기`)
  lines.push(``)
  lines.push(`*이 뉴스를 그냥 "정보"로 읽으면 금방 잊습니다. 창업가의 시선으로 읽으면 인사이트가 됩니다.*`)
  lines.push(``)
  lines.push(`**핵심 질문:** ${narrative.keyQuestion}`)
  lines.push(``)
  lines.push(domCtx.implication)
  lines.push(``)
  lines.push(`**지금 바로 해볼 수 있는 것:**`)
  lines.push(``)
  lines.push(`→ ${narrative.actionPoint}`)
  lines.push(``)

  // §5.6 깊이 생각해볼 질문
  lines.push(`---`)
  lines.push(``)
  lines.push(`## 💭 더 깊이 생각해볼 질문`)
  lines.push(``)
  lines.push(`이 뉴스를 읽고 다음 질문들을 스스로에게 던져보세요.`)
  lines.push(``)
  for (const q of getDeepQuestions(eventType)) { lines.push(`• ${q}`) }
  lines.push(``)
  lines.push(`*매일 한 개의 뉴스를 이렇게 깊이 읽는 습관이 미래 창업가를 만듭니다.*`)
  lines.push(``)
  lines.push(`*insightship-nlp · ${domain} · ${eventType}*`)

  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════
// §6. 중복 감지
// ══════════════════════════════════════════════════════════════════════

function cosineSim(a, b) {
  const setA = new Set(a), setB = new Set(b)
  const intersection = [...setA].filter(x => setB.has(x)).length
  const denom = Math.sqrt(setA.size) * Math.sqrt(setB.size)
  return denom > 0 ? intersection / denom : 0
}

function isDuplicateTitle(title, existing) {
  const tToks = tokenize(title)
  for (const e of existing) {
    if (cosineSim(tToks, tokenize(e)) >= 0.72) return true
  }
  return false
}

// ══════════════════════════════════════════════════════════════════════
// §7. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

async function _handleRunSummarize_impl(req) {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      status: 'ok',
      engine: 'insightship-longform-v8',
      style: 'LongBlack-inspired longform storytelling',
      avg_length: '2000+ chars',
      cost: 0,
      external_api: false,
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === `Bearer ${CRON_SECRET}`
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const H = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  }

  // 미처리 기사 조회 (롱폼 기준: 500자 미만은 재처리 대상)
  let articles = []

  const r1 = await fetch(
    `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=is.null`
    + `&select=id,title,body,excerpt&order=published_at.desc&limit=60`,
    { headers: H }
  )
  const raw1 = await r1.json()
  articles = Array.isArray(raw1) ? raw1 : []

  if (articles.length < 10) {
    const r2 = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=not.is.null`
      + `&select=id,title,body,excerpt,ai_summary&order=published_at.desc&limit=300`,
      { headers: H }
    )
    const raw2 = await r2.json()
    const extra = (Array.isArray(raw2) ? raw2 : [])
      .filter(a => (a.ai_summary?.length || 0) < 500 && !articles.find(x => x.id === a.id))
    articles = [...articles, ...extra].slice(0, 60)
  }

  if (articles.length < 5) {
    const r3 = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&ai_category=is.null`
      + `&select=id,title,body,excerpt,ai_summary&order=published_at.desc&limit=300`,
      { headers: H }
    )
    const raw3 = await r3.json()
    articles = (Array.isArray(raw3) ? raw3 : []).slice(0, 60)
  }

  if (!articles.length) {
    return new Response(JSON.stringify({
      message: '처리할 뉴스 없음 — 모두 처리 완료',
      done: 0, remaining: 0,
      engine: 'insightship-longform-v8',
      timestamp: new Date().toISOString(),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  // 병렬 롱폼 생성
  const summaryResults = await Promise.allSettled(
    articles.map(async a => {
      const bodyText = (a.body && a.body.length > 100) ? a.body : (a.excerpt || a.title)
      return buildLongformStory(a.title, bodyText)
    })
  )

  let done = 0, failed = 0
  await Promise.allSettled(articles.map(async (a, i) => {
    const result = summaryResults[i]
    if (result.status !== 'fulfilled' || !result.value) { failed++; return }

    const domain    = detectDomain(a.title, cleanText(a.body || a.excerpt || ''))
    const eventType = detectEvent(a.title, cleanText(a.body || a.excerpt || ''))
    const category  = mapCategory(domain, eventType)
    const readTime  = estimateReadTime(result.value)

    const u = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${a.id}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        ai_summary:      result.value,
        ai_processed_at: new Date().toISOString(),
        ai_category:     domain,
        category,
        read_time:       readTime,
      }),
    })
    if (u.ok || u.status === 204) done++; else failed++
  }))

  const cr = await fetch(
    `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=is.null&select=id&limit=1`,
    { headers: { ...H, Prefer: 'count=exact' } }
  )
  const remaining = parseInt(cr.headers.get('content-range')?.split('/')[1] || '0')

  return new Response(JSON.stringify({
    done, failed, processed: articles.length, remaining,
    engine: 'insightship-longform-v8',
    cost: 0, external_api: false,
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

  return _handleRunSummarize_impl
})();

const handleExtractTrends = (() => {
/**
 * api/extract-news-trends.js
 * TREND 매니저 — 트렌드 자동 추출 (자체 NLP, 외부 AI 0원)
 * 매일 22:00 UTC (KST 07:00) 실행
 */


const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SECRET = process.env.CRON_SECRET

const H = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

// ── 카테고리 메타 ──────────────────────────────────────────────────
const CAT_MAP = {
  funding:          { name: '스타트업 투자/펀딩',  unit: '건', display: '경제/창업' },
  ai_startup:       { name: 'AI 스타트업',         unit: '건', display: '기술/IT'  },
  ai:               { name: 'AI 기술',              unit: '건', display: '기술/IT'  },
  edutech:          { name: '에듀테크',             unit: '건', display: '교육/창업'},
  youth:            { name: '청소년/청년 창업',     unit: '건', display: '사회/창업'},
  entrepreneurship: { name: '창업 생태계',          unit: '건', display: '경제/창업'},
  unicorn:          { name: '유니콘/IPO',           unit: '건', display: '경제/창업'},
  climate:          { name: '기후테크/그린',        unit: '건', display: '환경/에너지'},
  health:           { name: '헬스케어 AI',          unit: '건', display: '헬스케어'},
  fintech:          { name: '핀테크',               unit: '건', display: '경제/창업'},
  general:          { name: '일반 스타트업',        unit: '건', display: '경제/창업'},
}

// ── 자체 NLP: 키워드 빈도 분석 ────────────────────────────────────
const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','위해','통해',
  '대한','관련','따른','있는','없는','되는','하는','있다','없다',
  '된다','한다','이다','있으며','되며','하며','이번','지난','올해',
  '작년','이달','오늘','어제','최근','현재','지금','특히','또','더',
  '가장','매우','모두','함께','이미','아직','약','총','전','후','당',
  '각','제','본','해당','기자','특파원','뉴스','보도','발표','밝혔다',
  '말했다','전했다','설명했다','밝혀졌다','알려졌다','통해서','위한',
  'the','a','an','is','are','was','were','has','have','in','of','to',
])

function tokenize(text) {
  if (!text) return []
  return text
    .replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t))
}

function extractHotKeywords(articles, topN = 8) {
  const freq = {}
  for (const a of articles) {
    const tokens = tokenize((a.title || '') + ' ' + (a.ai_summary || '').slice(0, 200))
    for (const t of tokens) {
      freq[t] = (freq[t] || 0) + 1
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([kw]) => kw)
}

function calcMarketMood(articles) {
  const bullish = ['투자','유치','성장','흑자','IPO','상장','확장','출시','개발','혁신','달성','수익']
  const bearish  = ['파산','폐업','감원','해고','손실','적자','철수','중단','위기','소송','조사']
  let b = 0, bear = 0
  for (const a of articles) {
    const txt = (a.title || '') + ' ' + (a.ai_summary || '').slice(0, 100)
    bullish.forEach(w => { if (txt.includes(w)) b++ })
    bearish.forEach(w => { if (txt.includes(w)) bear++ })
  }
  if (b > bear * 1.5) return 'bullish'
  if (bear > b * 1.5) return 'bearish'
  return 'neutral'
}

// ── 메인 핸들러 ────────────────────────────────────────────────────
async function _handleExtractTrends_impl(req) {
  const isGet  = req.method === 'GET'
  const isAuth = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === `Bearer ${SECRET}`

  if (isGet && !isAuth) {
    return new Response(JSON.stringify({ status: 'ok', engine: 'TREND-v2', agent: 'TREND — 트렌드 분석 매니저' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!isAuth) return new Response('Unauthorized', { status: 401 })

  const today     = new Date().toISOString().slice(0, 10)
  const weekAgo   = new Date(Date.now() - 7  * 86400000).toISOString().slice(0, 10)
  const twoWkAgo  = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)

  // 1) 이번 주 / 지난 주 뉴스 수집
  const [thisWeek, lastWeek] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/articles?status=eq.published&category=eq.news&created_at=gte.${weekAgo}&select=ai_category,title,ai_summary&limit=500`, { headers: H() }).then(r => r.json()).catch(() => []),
    fetch(`${SB_URL}/rest/v1/articles?status=eq.published&category=eq.news&created_at=gte.${twoWkAgo}&created_at=lt.${weekAgo}&select=ai_category,title,ai_summary&limit=500`, { headers: H() }).then(r => r.json()).catch(() => []),
  ])

  if (!Array.isArray(thisWeek) || thisWeek.length === 0) {
    return new Response(JSON.stringify({ ok: true, message: '최근 뉴스 없음', today }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }

  // 2) 카테고리별 집계
  const countThis = {}, countLast = {}
  for (const a of thisWeek)  countThis[a.ai_category || 'general'] = (countThis[a.ai_category || 'general'] || 0) + 1
  for (const a of lastWeek)  countLast[a.ai_category || 'general'] = (countLast[a.ai_category || 'general'] || 0) + 1

  // 3) 자체 NLP — 핫 키워드 & 시장 분위기
  const hotKeywords = extractHotKeywords(thisWeek, 8)
  const marketMood  = calcMarketMood(thisWeek)
  const moodScore   = marketMood === 'bullish' ? 1 : marketMood === 'bearish' ? -1 : 0

  // 4) trend_snapshots 저장
  const saved = [], errors = []

  for (const [aiCat, count] of Object.entries(countThis)) {
    const meta = CAT_MAP[aiCat] || { name: aiCat, unit: '건', display: '기타' }
    const prev  = countLast[aiCat] || 0
    const changePct = prev > 0 ? Math.round(((count - prev) / prev) * 100) : count > 0 ? 100 : 0

    const r = await fetch(`${SB_URL}/rest/v1/trend_snapshots`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        snapshot_date: today,
        category: meta.display,
        metric_name: meta.name,
        metric_value: count,
        metric_unit: meta.unit,
        change_pct: changePct,
      }),
    })
    if (r.ok || r.status === 201 || r.status === 204) saved.push(meta.name)
    else errors.push(`${meta.name}:${r.status}`)
  }

  // 5) 시장 분위기 지수 저장
  await fetch(`${SB_URL}/rest/v1/trend_snapshots`, {
    method: 'POST',
    headers: { ...H(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      snapshot_date: today, category: 'AI분석',
      metric_name: '시장분위기지수', metric_value: moodScore,
      metric_unit: 'score', change_pct: 0,
    }),
  }).catch(() => {})

  // 6) trend_keywords 저장 (핫 키워드)
  for (const kw of hotKeywords) {
    await fetch(`${SB_URL}/rest/v1/trend_keywords`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ keyword: kw, count: 1 }),
    }).catch(() => {})
  }

  // 7) 30일 이상 된 스냅샷 정리
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  await fetch(`${SB_URL}/rest/v1/trend_snapshots?snapshot_date=lt.${cutoff}`, {
    method: 'DELETE', headers: H(),
  }).catch(() => {})

  // 8) ai_operations_log 기록
  await fetch(`${SB_URL}/rest/v1/ai_operations_log`, {
    method: 'POST',
    headers: { ...H(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      task_type: 'trend_extract',
      run_date: today,
      result: 'success',
      details: { categories: saved.length, hot_keywords: hotKeywords, market_mood: marketMood },
      engine: 'TREND-v2',
    }),
  }).catch(() => {})

  return new Response(JSON.stringify({
    ok: true,
    today,
    engine: 'TREND-v2',
    agent: 'TREND — 트렌드 분석 매니저',
    total_news: thisWeek.length,
    categories_updated: saved.length,
    saved,
    errors,
    hot_keywords: hotKeywords,
    market_mood: marketMood,
    mood_score: moodScore,
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

  return _handleExtractTrends_impl
})();

const handleRecrawl = (() => {
// 기존 뉴스 원문 재크롤링 - body를 짧은 snippet에서 실제 본문으로 교체


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

async function _handleRecrawl_impl(req) {
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

  return _handleRecrawl_impl
})();

const handleNewsCleanup = (() => {
// api/news-cleanup.js
// 3일 초과 뉴스 삭제 + AI v5 요약 미처리 기사 트리거
// POST /api/news-cleanup  (x-cron-secret 헤더 필요)



const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

async function _handleNewsCleanup_impl(req) {
  // 인증
  const secret = req.headers.get('x-cron-secret') || req.headers.get('x-vercel-cron')
  if (secret !== CRON_SECRET && secret !== '1') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if (!SB_URL || !SB_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 })
  }

  const H = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }

  // 3일 전 기준
  const cutoff = new Date(Date.now() - 3 * 86400 * 1000).toISOString()
  const results = { deleted: 0, errors: [] }

  try {
    // 3일 초과 기사 삭제
    const delRes = await fetch(
      `${SB_URL}/rest/v1/articles?published_at=lt.${cutoff}&status=eq.published`,
      { method: 'DELETE', headers: H }
    )
    if (delRes.ok) {
      const cr = delRes.headers.get('Content-Range') || ''
      results.deleted = parseInt(cr.split('/')[1] || '0') || 0
    } else {
      results.errors.push(`삭제 오류: ${delRes.status}`)
    }
  } catch (e) {
    results.errors.push(e.message?.slice(0, 80))
  }

  return new Response(JSON.stringify({
    ...results,
    cutoff,
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

  return _handleNewsCleanup_impl
})();

const handleResetSummaries = (() => {
// 기존 AI 요약을 null로 초기화 → 다음 cron에서 새 방식으로 재요약
// 1회 실행 후 삭제

const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

async function _handleResetSummaries_impl(req) {
  if (req.headers.get('authorization') !== 'Bearer ' + CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }

  // 최근 7일치 뉴스 요약 초기화 (오래된 건 그냥 둠)
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const r = await fetch(
    `${SB_URL}/rest/v1/articles?published_at=gte.${since}&status=eq.published`,
    { method: 'PATCH', headers: H, body: JSON.stringify({ ai_summary: null }) }
  )
  return new Response(JSON.stringify({ status: r.status, ok: r.ok, message: '최근 7일 요약 초기화 완료' }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}

  return _handleResetSummaries_impl
})();

const handleLongformQuality = (() => {
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP 뉴스 롱폼 품질 검증 + 재처리 엔진 v1.0                 ║
 * ║                                                                      ║
 * ║  검증 기준:                                                          ║
 * ║   - ai_summary 최소 800자 이상 (롱폼 기준)                          ║
 * ║   - 800자 미만 → summarize-news 재호출하여 재생성                   ║
 * ║   - 본문(body) 없고 요약도 없으면 excerpt로 보완                    ║
 * ║   - 롱폼 점수 산출: 섹션 수, 질문 포함 여부, 용어 설명 여부         ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */


const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const H = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

// ── 롱폼 품질 점수 계산 ──────────────────────────────────────────
function calcLongformScore(text) {
  if (!text || text.length < 100) return 0
  let score = 0

  // 1. 길이 점수 (최대 40점)
  if (text.length >= 3000) score += 40
  else if (text.length >= 2000) score += 30
  else if (text.length >= 1500) score += 20
  else if (text.length >= 800) score += 10

  // 2. 섹션 헤더 존재 (최대 20점)
  const headers = (text.match(/^\s*#{1,3}\s+.+/gm) || []).length
    + (text.match(/^\s*\*\*.+\*\*\s*$/gm) || []).length
  score += Math.min(headers * 5, 20)

  // 3. 심층 질문 포함 (최대 20점)
  const hasDeepQ = /[^?]*\?/.test(text)
  if (hasDeepQ) score += 20

  // 4. 용어 설명 (최대 10점)
  const hasTerm = /\([^)]{5,40}\)/.test(text) // 괄호 안 설명
  if (hasTerm) score += 10

  // 5. 한국어 풍부도 (최대 10점)
  const koChars = (text.match(/[가-힣]/g) || []).length
  if (koChars > 1000) score += 10
  else if (koChars > 500) score += 5

  return score
}

// ── 메인 핸들러 ──────────────────────────────────────────────────
async function _handleLongformQuality_impl(req) {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      service: 'longform-quality-checker',
      min_length: 800,
      ideal_length: 3000,
      score_max: 100,
      status: 'ready',
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  const auth = req.headers.get('authorization')
  const cron = req.headers.get('x-vercel-cron')
  const secret = req.headers.get('x-cron-secret')
  if (cron !== '1' && auth !== `Bearer ${CRON_SECRET}` && secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  if (!SB_URL || !SB_KEY) {
    return new Response(JSON.stringify({ error: 'Missing env' }), { status: 500 })
  }

  let params = {}
  try { params = await req.json().catch(() => ({})) } catch {}

  const limit = Math.min(params.limit || 100, 300)
  const minLen = params.min_length || 800
  const days = params.days || 14

  const cutoff = new Date(Date.now() - days * 86400000).toISOString()

  // 최근 기사 중 ai_summary가 짧거나 없는 것 조회
  const res = await fetch(
    `${SB_URL}/rest/v1/articles` +
    `?published_at=gte.${cutoff}` +
    `&select=id,title,ai_summary,body,excerpt,source_name` +
    `&order=published_at.desc` +
    `&limit=${limit}`,
    { headers: H() }
  )
  const articles = await res.json().catch(() => [])

  if (!Array.isArray(articles)) {
    return new Response(JSON.stringify({ error: '기사 조회 실패' }), { status: 500 })
  }

  const stats = {
    total: articles.length,
    good: 0,        // >= 800자
    short: 0,       // < 800자
    missing: 0,     // ai_summary 없음
    reprocessed: 0, // 재처리 완료
    errors: [],
    quality_scores: [],
  }

  const toReprocess = []

  for (const art of articles) {
    const sumLen = (art.ai_summary || '').length
    const score = calcLongformScore(art.ai_summary || '')

    stats.quality_scores.push({ id: art.id, len: sumLen, score })

    if (!art.ai_summary || sumLen < minLen) {
      if (!art.ai_summary) stats.missing++
      else stats.short++
      toReprocess.push(art)
    } else {
      stats.good++
    }
  }

  // 재처리: 짧은 기사들의 롱폼 재생성
  for (const art of toReprocess.slice(0, 50)) {
    try {
      // summarize-news 엔진 직접 호출하여 롱폼 재생성
      const bodyText = (art.body && art.body.length > 50) ? art.body : (art.excerpt || '')

      if (!art.title) { stats.errors.push(`no title: ${art.id}`); continue }

      // 최소 롱폼 생성 (내부 로직 복제)
      const summary = generateMinLongform(art.title, bodyText)

      const patchRes = await fetch(
        `${SB_URL}/rest/v1/articles?id=eq.${art.id}`,
        {
          method: 'PATCH',
          headers: { ...H(), Prefer: 'return=minimal' },
          body: JSON.stringify({
            ai_summary: summary,
            ai_processed_at: new Date().toISOString(),
          }),
        }
      )

      if (patchRes.ok || patchRes.status === 204) stats.reprocessed++
      else stats.errors.push(`patch fail: ${art.id}`)
    } catch (e) {
      stats.errors.push(e.message?.slice(0, 60))
    }
  }

  // 품질 통계
  const avgScore = stats.quality_scores.length
    ? Math.round(stats.quality_scores.reduce((s, q) => s + q.score, 0) / stats.quality_scores.length)
    : 0
  const avgLen = stats.quality_scores.length
    ? Math.round(stats.quality_scores.reduce((s, q) => s + q.len, 0) / stats.quality_scores.length)
    : 0

  return new Response(JSON.stringify({
    ...stats,
    avg_quality_score: avgScore,
    avg_summary_length: avgLen,
    needs_reprocess: toReprocess.length,
    timestamp: new Date().toISOString(),
  }), { headers: { 'Content-Type': 'application/json' } })
}

// ── 최소 롱폼 생성기 (summarize-news 재호출 없이 자체 생성) ──────
function generateMinLongform(title, bodyText) {
  const clean = (bodyText || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const intro = `## 핵심 요약\n\n이 기사는 **${title}**에 관한 내용입니다.\n\n`

  const body = clean.length > 100
    ? `## 주요 내용\n\n${clean.slice(0, 1200)}\n\n`
    : `## 주요 내용\n\n현재 한국 스타트업 생태계에서 "${title}"와 관련된 움직임이 주목받고 있습니다. 청소년 창업가들이 이 분야에 관심을 가지는 이유는, 실제 시장의 변화가 새로운 기회를 만들기 때문입니다.\n\n`

  const insight = `## 창업 인사이트\n\n이 소식이 청소년 창업가에게 의미하는 것은 무엇일까요? 시장 변화를 빠르게 읽고, 자신만의 아이디어로 연결하는 능력이 필요합니다. 기존 플레이어들이 놓치고 있는 틈새 시장은 항상 존재합니다.\n\n`

  const question = `## 생각해볼 질문\n\n이 뉴스에서 창업 기회를 하나 찾는다면 무엇인가요? "누가·어떤 문제를·어떻게" 형태로 정리해보세요. 지금 바로 아이디어 노트에 적어두는 것을 추천합니다.\n`

  return intro + body + insight + question
}

  return _handleLongformQuality_impl
})();

const handleSelfAiSummarize = (() => {
/**
 * Insightship 자체 AI 요약 API
 * /api/self-ai-summarize
 * 
 * Python insightship_ai.py의 로직을 JS로 포팅
 * 완전 무료 — 외부 API 0원
 */


const CRON_SECRET = process.env.CRON_SECRET

// ── 한국어 불용어 ────────────────────────────────────────────
const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','때문','위해',
  '통해','대한','관련','관해','따른','있는','없는','되는','하는',
  '있다','없다','된다','한다','이다','있으며','되며','하며',
  '이번','지난','올해','작년','특히','또','더','가장','매우','모두',
  '약','총','전','후','당','각','제','본','해당',
])

// ── 창업 핵심 키워드 가중치 ──────────────────────────────────
const WEIGHTS = {
  '스타트업':2.0,'창업':2.0,'투자':1.8,'펀딩':1.8,'VC':1.8,
  '유니콘':2.5,'상장':1.7,'IPO':1.7,'매출':1.6,'성장':1.5,
  'AI':1.8,'인공지능':1.8,'플랫폼':1.5,'서비스':1.3,
  '청소년':2.5,'청년':1.8,'대학생':1.8,
  '억원':1.6,'조원':1.7,'시리즈':1.7,'라운드':1.6,
  '글로벌':1.5,'혁신':1.5,'기술':1.4,
}

// ── 용어 설명 사전 ───────────────────────────────────────────
const TERMS = {
  'IPO': 'IPO(기업공개, 주식시장에 처음 상장하는 것)',
  'VC': 'VC(벤처캐피털, 스타트업 전문 투자회사)',
  '시리즈A': '시리즈A(초기 대규모 투자 단계)',
  '시리즈B': '시리즈B(성장 단계 투자)',
  '시리즈C': '시리즈C(확장 단계 투자)',
  '유니콘': '유니콘(기업가치 1조원 이상 비상장 스타트업)',
  'SaaS': 'SaaS(인터넷으로 제공하는 소프트웨어 서비스)',
  'B2B': 'B2B(기업 간 거래)',
  'MVP': 'MVP(최소 기능 제품)',
  '엑셀러레이터': '엑셀러레이터(초기 스타트업 육성 기관)',
  '풀필먼트': '풀필먼트(보관·포장·배송 대행 물류 서비스)',
}

function cleanText(t) {
  if (!t) return ''
  return t.replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/g,' ')
    .replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim()
}

function splitSentences(text) {
  return text
    .replace(/([.!?])\s+/g,'$1\n')
    .replace(/([다요])\s+/g,'$1\n')
    .split('\n')
    .map(s=>s.trim())
    .filter(s=>s.length>20)
}

function tokenize(text) {
  const tokens = text.match(/[가-힣]+|[A-Za-z]+|[0-9]+[억조만원%]?/g) || []
  return tokens.filter(t => !STOPWORDS.has(t) && t.length >= 2)
}

function scoreSentences(sentences, titleTokens) {
  const docFreq = {}
  const sentToks = sentences.map(s => {
    const toks = new Set(tokenize(s))
    toks.forEach(t => { docFreq[t] = (docFreq[t]||0)+1 })
    return toks
  })
  const N = sentences.length
  return sentences.map((s, i) => {
    const toks = sentToks[i]
    if (!toks.size) return 0
    let score = 0
    toks.forEach(tok => {
      const tf = 1/toks.size
      const idf = Math.log((N+1)/(docFreq[tok]+1))
      const w = WEIGHTS[tok] || 1.0
      score += tf * idf * w
    })
    const titleOverlap = [...toks].filter(t=>titleTokens.includes(t)).length / toks.size
    const posBonus = 1 + (N-i)/(N*2)
    const lenBonus = s.length>=50&&s.length<=200 ? 1.0 : 0.7
    const numBonus = /\d+[억조만원%]/.test(s) ? 1.3 : 1.0
    return score * (1+titleOverlap) * posBonus * lenBonus * numBonus
  })
}

function applyTerms(text) {
  const used = new Set()
  for (const [term, expl] of Object.entries(TERMS)) {
    if (text.includes(term) && !used.has(term)) {
      text = text.replace(term, expl)
      used.add(term)
    }
  }
  return text
}

function selfSummarize(title, body) {
  title = cleanText(title)
  body  = cleanText(body) || title
  const sentences = splitSentences(body)
  if (!sentences.length) return body.slice(0,500)

  const titleToks = tokenize(title)
  const scores = scoreSentences(sentences, titleToks)
  const topk = Math.min(7, Math.max(3, Math.floor(sentences.length/3)))

  // 상위 문장 선택 (원래 순서 유지)
  const ranked = scores.map((s,i)=>({s,i}))
    .sort((a,b)=>b.s-a.s).slice(0,topk)
    .map(x=>x.i).sort((a,b)=>a-b)
  const core = ranked.map(i=>sentences[i]).join(' ')

  // 도입부
  const bodyToks = tokenize(body)
  const hasYouth = bodyToks.some(t=>['청소년','청년','학생'].includes(t))
  const hasInvest = bodyToks.some(t=>['투자','펀딩','시리즈'].includes(t))
  const intro = hasYouth ? '청소년 창업가들이 주목해야 할 소식입니다.'
    : hasInvest ? '투자 시장에서 눈길을 끄는 소식이 들어왔습니다.'
    : '창업 생태계에서 주목할 만한 소식입니다.'

  const conclusion = hasYouth
    ? '이번 소식은 창업을 꿈꾸는 청소년들에게 실질적인 참고가 될 것으로 보입니다.'
    : hasInvest
    ? '이번 투자 소식은 국내 스타트업 생태계의 활발한 성장세를 보여줍니다.'
    : '이번 사례는 창업을 준비하는 청소년들에게 도움이 될 것으로 기대됩니다.'

  const full = `${intro}\n\n${applyTerms(core)}\n\n${conclusion}`
  return full.length > 1200 ? full.slice(0,1197)+'...' : full
}

async function _handleSelfAiSummarize_impl(req) {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({status:'ok',engine:'insightship-self-ai-v1'}),
      {headers:{'Content-Type':'application/json'}})
  }

  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`)
    return new Response(JSON.stringify({error:'Unauthorized'}),{status:401})

  let body
  try { body = await req.json() } catch { body = {} }

  const title   = body.title || ''
  const content = body.body || body.excerpt || ''

  if (!title) return new Response(JSON.stringify({error:'title required'}),{status:400})

  const summary = selfSummarize(title, content)

  return new Response(JSON.stringify({
    summary,
    engine: 'insightship-self-ai-v1',
    cost: 0,
    external_api: false,
  }), { headers: {'Content-Type':'application/json'} })
}

  return _handleSelfAiSummarize_impl
})();

// ════════════════════════════════════════════════════════════
// 통합 라우터 핸들러
// ════════════════════════════════════════════════════════════
export default async function handler(req) {
  const url    = new URL(req.url)
  const path   = url.pathname
  const action = url.searchParams.get('action')

  // cron action 분기
  if (action === 'fetch')          return handleFetchNews(req)
  if (action === 'summarize')      return handleSummarizeNews(req)
  if (action === 'run_summarize')  return handleRunSummarize(req)
  if (action === 'extract_trends') return handleExtractTrends(req)
  if (action === 'recrawl')        return handleRecrawl(req)
  if (action === 'cleanup')        return handleNewsCleanup(req)
  if (action === 'reset')          return handleResetSummaries(req)
  if (action === 'quality_check')  return handleLongformQuality(req)
  if (action === 'self_summarize') return handleSelfAiSummarize(req)

  // path 분기 (rewrites 경유)
  if (path.endsWith('/fetch-news'))             return handleFetchNews(req)
  if (path.endsWith('/summarize-news'))         return handleSummarizeNews(req)
  if (path.endsWith('/run-summarize'))          return handleRunSummarize(req)
  if (path.endsWith('/extract-news-trends'))    return handleExtractTrends(req)
  if (path.endsWith('/recrawl-news'))           return handleRecrawl(req)
  if (path.endsWith('/news-cleanup'))           return handleNewsCleanup(req)
  if (path.endsWith('/reset-summaries'))        return handleResetSummaries(req)
  if (path.endsWith('/longform-quality-check')) return handleLongformQuality(req)
  if (path.endsWith('/self-ai-summarize'))      return handleSelfAiSummarize(req)

  return new Response(JSON.stringify({
    service: 'news-pipeline-router', version: '1.0',
    actions: ['fetch','summarize','run_summarize','extract_trends','recrawl','cleanup','reset','quality_check','self_summarize'],
    routes: ['/api/fetch-news','/api/summarize-news','/api/run-summarize',
             '/api/extract-news-trends','/api/recrawl-news','/api/news-cleanup',
             '/api/reset-summaries','/api/longform-quality-check','/api/self-ai-summarize'],
  }), { headers: { 'Content-Type': 'application/json' } })
}
