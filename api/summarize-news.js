// api/summarize-news.js
// AI v5 핵심 요약 로직 (JS 포팅) - Vercel Edge Runtime
// 3일 이내 미처리 기사에 What→Why→So What 요약 생성

export const config = { runtime: 'edge', maxDuration: 60 }

const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// ── 불용어
const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','위해','통해','대한','관련',
  '있는','없는','되는','하는','있다','없다','된다','한다','이다','있으며','되며',
  '이번','지난','올해','작년','이달','오늘','어제','최근','현재','지금',
  '특히','또','더','가장','매우','모두','함께','이미','아직','약','총',
  '기자','특파원','뉴스','보도','발표','밝혔다','말했다','전했다','설명했다',
])

// ── 이벤트 유형
const EVENT_TYPES = {
  funding: { kw: ['투자','펀딩','시리즈','유치','억원','조원','라운드','시드'], label: '💰 투자 유치' },
  product: { kw: ['출시','론칭','선보','공개','베타','서비스','앱','플랫폼'], label: '🚀 제품/서비스 출시' },
  policy:  { kw: ['정부','지원','공모','선발','과기부','중기부','창진원','예산','규제','정책'], label: '📋 정책/지원' },
  acquisition: { kw: ['인수','합병','M&A','지분','매각'], label: '🤝 인수/합병' },
  research: { kw: ['연구','논문','결과','조사','분석','보고서','데이터','통계'], label: '🔬 연구/조사' },
  person:  { kw: ['대표','CEO','창업자','설립자','인터뷰','스토리'], label: '👤 창업가 스토리' },
  market:  { kw: ['시장','성장','규모','트렌드','전망','예측','확대'], label: '📊 시장/트렌드' },
}

// ── 도메인
const DOMAINS = {
  investment: { kw: ['투자','펀딩','시리즈A','시리즈B','억원','조원','VC'], ko: '투자·금융' },
  tech:       { kw: ['AI','인공지능','딥러닝','반도체','GPU','클라우드','SaaS'], ko: '기술·AI' },
  youth:      { kw: ['청소년','청년','대학생','고등학생','창업교육','해커톤'], ko: '청소년·교육' },
  policy:     { kw: ['정부','지원','공모','과기부','중기부','창진원'], ko: '정책·지원' },
  esg:        { kw: ['ESG','탄소중립','친환경','임팩트','소셜벤처'], ko: 'ESG·임팩트' },
  startup:    { kw: ['스타트업','창업','유니콘','피봇','글로벌'], ko: '창업·비즈니스' },
}

// ── So What 시사점 템플릿
const SOWHAT = {
  funding: '투자 동향은 시장의 온도계입니다. 어느 분야에 돈이 몰리는지를 추적하면 내 창업 아이디어의 타이밍을 검증할 수 있습니다. 투자 받은 기업의 문제 정의 방식과 성장 전략을 분석해 보세요.',
  product: '새 제품·서비스 출시는 시장이 실제로 원하는 것을 보여주는 생생한 사례입니다. "왜 지금 이 문제인가", "기존 대안과 무엇이 다른가"를 스스로 분석하면 제품 기획 능력이 길러집니다.',
  policy:  '정책 지원을 전략적으로 활용하면 초기 창업의 가장 큰 허들인 자본과 네트워크 문제를 동시에 해결할 수 있습니다. 지원 자격과 신청 시기를 미리 파악하고 사업계획서 작성을 지금 시작하세요.',
  acquisition: 'M&A는 스타트업의 또 다른 출구 전략입니다. "이 회사에 인수되고 싶다"는 목표로 사업을 설계하는 역발상 창업 전략도 유효합니다.',
  research: '데이터와 연구는 가설을 사실로 바꾸는 힘입니다. 이 연구 결과를 바탕으로 "만약 내가 이 문제를 해결하는 제품을 만든다면"이라는 가정으로 비즈니스 모델을 설계해 보세요.',
  person:  '성공한 창업가의 스토리에서 가장 중요한 건 실패와 피봇의 순간입니다. 전환점에서 어떤 판단을 내렸는지에 집중하면 진짜 창업 교육이 됩니다.',
  market:  '시장 트렌드 분석은 타이밍의 예술입니다. 지금 이 시장이 성장하는 이유를 3가지로 정리할 수 있다면, 그 교차점에서 창업 아이디어가 탄생합니다.',
  general: '모든 성공한 스타트업에는 반드시 남들이 놓친 문제를 발견한 순간이 있었습니다. 오늘 주변의 불편함을 비즈니스 기회로 재정의해 보세요.',
}

function clean(text) {
  return (text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\w\s가-힣.!?%,·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitSents(text) {
  return text.split(/(?<=[.!?다요임음.])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15)
}

function detectEvent(title, body) {
  const combined = title + ' ' + body.slice(0, 400)
  const scores = {}
  const priority = ['funding', 'acquisition', 'product', 'policy', 'research', 'person', 'market']
  for (const type of priority) {
    const { kw } = EVENT_TYPES[type]
    scores[type] = kw.filter(k => combined.includes(k)).length
    scores[type] += kw.filter(k => title.includes(k)).length  // 제목 가중치
  }
  const best = priority.reduce((a, b) => scores[a] >= scores[b] ? a : b)
  return scores[best] > 0 ? best : 'general'
}

function detectDomain(title, body) {
  const combined = title + ' ' + body.slice(0, 500)
  let best = 'startup', bestScore = 0
  for (const [domain, { kw }] of Object.entries(DOMAINS)) {
    const score = kw.filter(k => combined.includes(k)).length
    if (score > bestScore) { best = domain; bestScore = score }
  }
  return best
}

function hasNumber(sent) {
  return /(\d+억|\d+조|\d+만원|\d+%|\d+배|\d+만\s*명)/.test(sent)
}

function sentQuality(sent) {
  let score = 1.0
  const l = sent.length
  if (l >= 40 && l <= 150) score *= 1.3
  else if (l > 200) score *= 0.6
  if (hasNumber(sent)) score *= 1.3
  if (/(때문에|이유로|원인은|배경에는|결과로|따라서|이로 인해|덕분에)/.test(sent)) score *= 1.25
  if (/(밝혔다|말했다|전했다|설명했다)\s*$/.test(sent)) score *= 0.75
  return score
}

function buildSummary(title, body) {
  const cleanBody = clean(body)
  const domain = detectDomain(title, cleanBody)
  const eventType = detectEvent(title, cleanBody)
  const sents = splitSents(cleanBody)

  if (sents.length === 0) {
    return buildFallback(title, domain, eventType)
  }

  // 상위 문장 선택 (품질 + 위치 기반)
  const scored = sents.map((s, i) => ({
    s,
    score: sentQuality(s) * (i < 2 ? 1.4 : i < 5 ? 1.2 : 1.0),
  }))
  scored.sort((a, b) => b.score - a.score)

  const topSents = scored.slice(0, 4).map(x => x.s)
  const numSents = sents.filter(s => hasNumber(s)).slice(0, 2)
  const causalSents = sents
    .filter(s => /(때문에|이유로|원인은|배경에는|결과로|따라서)/.test(s))
    .slice(0, 2)

  // 원문 순서 유지
  const orderedTop = sents.filter(s => topSents.includes(s)).slice(0, 3)

  const evtInfo = EVENT_TYPES[eventType] || EVENT_TYPES.market
  const domainKo = DOMAINS[domain]?.ko || '창업·비즈니스'
  const sowhat = SOWHAT[eventType] || SOWHAT.general

  const lines = [
    `**${title.trim()}**`,
    '',
    `${evtInfo.label} · ${domainKo}`,
    '',
    '**핵심 내용**',
    '',
    ...orderedTop,
    '',
  ]

  if (numSents.length > 0) {
    const uniqueNums = numSents.filter(s => !orderedTop.includes(s))
    if (uniqueNums.length > 0) {
      lines.push('**주요 수치**', '')
      uniqueNums.forEach(s => lines.push(`• ${s}`))
      lines.push('')
    }
  }

  if (causalSents.length > 0) {
    const uniqueCausal = causalSents.filter(s => !orderedTop.includes(s) && !numSents.includes(s))
    if (uniqueCausal.length > 0) {
      lines.push('**배경과 맥락**', '')
      lines.push(...uniqueCausal)
      lines.push('')
    }
  }

  lines.push('**창업가 시사점**', '', sowhat, '')
  lines.push(`*category: news · domain: ${domain} · event: ${eventType} · ai: insightship-v5*`)

  return lines.join('\n')
}

function buildFallback(title, domain, eventType) {
  const evtInfo = EVENT_TYPES[eventType] || EVENT_TYPES.market
  const domainKo = DOMAINS[domain]?.ko || '창업·비즈니스'
  const sowhat = SOWHAT[eventType] || SOWHAT.general
  return [
    `**${title.trim()}**`,
    '',
    `${evtInfo.label} · ${domainKo}`,
    '',
    '**핵심 내용**',
    '',
    title,
    '',
    '**창업가 시사점**',
    '',
    sowhat,
    '',
    `*category: news · domain: ${domain} · event: ${eventType} · ai: insightship-v5*`,
  ].join('\n')
}

export default async function handler(req) {
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
  }

  // 3일 이내 미처리 기사 조회 (ai_version이 없거나 v5 아닌 것)
  const cutoff = new Date(Date.now() - 3 * 86400 * 1000).toISOString()
  const fetchUrl = (
    `${SB_URL}/rest/v1/articles`
    + `?published_at=gte.${cutoff}`
    + `&select=id,title,body,excerpt`
    + `&order=published_at.desc&limit=50`
  )

  let articles = []
  try {
    const res = await fetch(fetchUrl, { headers: H })
    articles = await res.json()
    if (!Array.isArray(articles)) {
      return new Response(JSON.stringify({ error: 'DB fetch failed', detail: articles }), { status: 500 })
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }

  const results = { processed: 0, skipped: 0, errors: [] }

  for (const article of articles) {
    try {
      const { id, title, body, excerpt } = article
      if (!title) { results.skipped++; continue }

      const bodyText = body || excerpt || title
      const summary = buildSummary(title, bodyText)
      const domain = detectDomain(title, clean(bodyText))
      const eventType = detectEvent(title, clean(bodyText))

      // 카테고리 결정
      const catMap = {
        youth: 'community', policy: 'insight', investment: 'trend',
        tech: 'trend', research: 'insight', person: 'magazine',
        market: 'trend', startup: 'insight',
      }
      const category = catMap[domain] || 'news'

      const patchRes = await fetch(
        `${SB_URL}/rest/v1/articles?id=eq.${id}`,
        {
          method: 'PATCH',
          headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({
            ai_summary: summary,
            category,
            ai_version: 'insightship-v5',
            ai_processed_at: new Date().toISOString(),
          }),
        }
      )

      if (patchRes.ok) results.processed++
      else {
        const err = await patchRes.text()
        results.errors.push(err.slice(0, 60))
      }
    } catch (e) {
      results.errors.push(e.message?.slice(0, 60))
    }
  }

  return new Response(JSON.stringify({
    ...results,
    total: articles.length,
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
