/**
 * api/run-summarize.js
 * Insightship 뉴스 AI v6 — 배치 요약 실행기
 * 외부 API 완전 0원 — summarize-news.js v6 엔진 직접 호출
 *
 * POST /api/run-summarize  (authorization: Bearer CRON_SECRET)
 * GET  /api/run-summarize  → 상태 확인
 */
export const config = { runtime: 'edge', maxDuration: 60 }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// ── v6 엔진 인라인 임포트 (Edge 환경에서 모듈 공유 불가로 핵심 로직 내장) ──

const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','위해','통해',
  '대한','관련','따른','있는','없는','되는','하는','있다','없다',
  '된다','한다','이다','있으며','되며','하며','이번','지난','올해',
  '작년','이달','오늘','어제','최근','현재','지금','특히','또','더',
  '가장','매우','모두','함께','이미','아직','약','총','전','후','당',
  '각','제','본','해당','기자','특파원','뉴스','보도','발표',
  '밝혔다','말했다','전했다','설명했다','밝혀졌다','알려졌다',
])

function tokenize(text) {
  if (!text) return []
  const cleaned = text.replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g, ' ').toLowerCase()
  return (cleaned.match(/[가-힣]{2,}|[a-z]{3,}|[0-9]+/g) || [])
    .filter(t => !STOPWORDS.has(t) && t.length >= 2)
}

const K1 = 1.5, B_P = 0.75
function bm25Score(qToks, dToks, avgLen, N, df) {
  const len = dToks.length
  const tf = {}
  for (const t of dToks) tf[t] = (tf[t] || 0) + 1
  let score = 0
  for (const q of qToks) {
    if (!tf[q]) continue
    const idf = Math.log((N - (df[q] || 0) + 0.5) / ((df[q] || 0) + 0.5) + 1)
    const tfw = (tf[q] * (K1 + 1)) / (tf[q] + K1 * (1 - B_P + B_P * len / avgLen))
    score += idf * tfw
  }
  return score
}

const EVENT_TYPES = {
  funding:     { kw: ['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC','엔젤'], label: '💰 투자 유치' },
  product:     { kw: ['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈'], label: '🚀 제품/서비스 출시' },
  policy:      { kw: ['정부','지원','공모','선발','과기부','중기부','창진원','예산','규제','정책'], label: '📋 정책/지원' },
  acquisition: { kw: ['인수','합병','M&A','지분','매각'], label: '🤝 인수/합병' },
  research:    { kw: ['연구','논문','결과','조사','분석','보고서','데이터','통계'], label: '🔬 연구/조사' },
  person:      { kw: ['대표','CEO','창업자','설립자','인터뷰','스토리','수상'], label: '👤 창업가 스토리' },
  market:      { kw: ['시장','성장','규모','트렌드','전망','예측','확대','점유율'], label: '📊 시장/트렌드' },
}

const DOMAINS = {
  investment: { kw: ['투자','펀딩','시리즈A','시리즈B','억원','조원','VC'], ko: '투자·금융', cat: 'trend' },
  tech:       { kw: ['AI','인공지능','딥러닝','반도체','GPU','클라우드','SaaS'], ko: '기술·AI', cat: 'trend' },
  youth:      { kw: ['청소년','청년','대학생','고등학생','창업교육','해커톤'], ko: '청소년·교육', cat: 'insight' },
  policy:     { kw: ['정부','지원','공모','과기부','중기부','창진원'], ko: '정책·지원', cat: 'insight' },
  esg:        { kw: ['ESG','탄소중립','친환경','임팩트','소셜벤처'], ko: 'ESG·임팩트', cat: 'insight' },
  startup:    { kw: ['스타트업','창업','유니콘','피봇','글로벌'], ko: '창업·비즈니스', cat: 'news' },
  edutech:    { kw: ['에듀테크','교육플랫폼','학습','온라인교육'], ko: '에듀테크', cat: 'insight' },
  fintech:    { kw: ['핀테크','결제','금융','블록체인'], ko: '핀테크', cat: 'trend' },
}

const INSIGHT_TEMPLATES = {
  funding:     '투자 동향은 시장의 온도계입니다. 어느 분야에 돈이 몰리는지를 추적하면 내 창업 아이디어의 타이밍을 검증할 수 있습니다. 투자받은 기업의 문제 정의 방식과 성장 전략을 분석해 보세요.',
  product:     '새 제품·서비스 출시는 시장이 실제로 원하는 것을 보여주는 증거입니다. "왜 지금 이 문제인가", "기존 대안과 무엇이 다른가"를 분석하면 제품 기획 역량이 성장합니다.',
  policy:      '정책 지원을 전략적으로 활용하면 초기 창업의 가장 큰 허들인 자본과 네트워크를 동시에 해결할 수 있습니다. 지원 자격과 신청 시기를 미리 파악하세요.',
  acquisition: 'M&A는 스타트업의 또 다른 출구 전략입니다. "이 회사에 인수되고 싶다"는 목표로 사업을 설계하는 역발상 창업 전략도 유효합니다.',
  research:    '데이터와 연구는 가설을 사실로 바꾸는 힘입니다. 이 연구 결과를 바탕으로 "만약 내가 이 문제를 해결하는 제품을 만든다면?"이라는 가정으로 비즈니스 모델을 설계해 보세요.',
  person:      '성공한 창업가의 스토리에서 가장 중요한 것은 실패와 피봇의 순간입니다. 전환점에서 어떤 판단을 내렸는지 집중하면 진짜 창업 교육이 됩니다.',
  market:      '시장 트렌드 분석은 타이밍의 예술입니다. 지금 이 시장이 성장하는 이유를 3가지로 정리할 수 있다면, 그 교차점에서 창업 아이디어가 탄생합니다.',
  general:     '모든 성공한 스타트업에는 남들이 놓친 문제를 발견한 순간이 있었습니다. 오늘의 뉴스를 "이 문제를 내가 해결한다면?"이라는 창업가의 시선으로 다시 읽어 보세요.',
}

const TERM_DICT = {
  'IPO': 'IPO(기업공개, 주식시장 첫 상장)', 'VC': 'VC(벤처캐피털, 스타트업 전문 투자사)',
  '시리즈A': '시리즈A(초기 대규모 투자 단계)', '시리즈B': '시리즈B(성장 단계 투자)',
  '유니콘': '유니콘(기업가치 1조원 이상 비상장 스타트업)', 'SaaS': 'SaaS(구독형 소프트웨어)',
  'MVP': 'MVP(최소 기능 제품)', 'M&A': 'M&A(기업 인수·합병)',
  'ARR': 'ARR(연간 반복 수익)', 'MRR': 'MRR(월간 반복 수익)',
}

function cleanText(text) {
  return (text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/공유하기|페이스북|트위터|카카오|무단전재|재배포\s*금지/g, '')
    .replace(/기자\s*[가-힣]{2,4}\s*기자/g, '')
    .replace(/[^\w\s가-힣.!?%,·]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function splitSentences(text) {
  return text
    .replace(/([.!?])\s+/g, '$1\n')
    .replace(/([다요임음])\s+/g, '$1\n')
    .split('\n').map(s => s.trim())
    .filter(s => s.length >= 20 && s.length <= 300)
}

function hasNumberValue(sent) {
  return /([\d,]+억|[\d,]+조|[\d,]+만\s*원|[\d]+%|[\d]+배|[\d,]+만\s*명)/.test(sent)
}

function isCausal(sent) {
  return /(때문에|이유로|원인은|배경에는|결과로|따라서|이로\s*인해|덕분에)/.test(sent)
}

function isNoise(sent) {
  return /무단\s*(전재|배포)|copyright|구독|좋아요|광고|협찬/i.test(sent)
}

function scoreSents(sents, titleToks) {
  const toks = sents.map(s => tokenize(s))
  const N = sents.length || 1
  const df = {}
  for (const ts of toks) for (const t of new Set(ts)) df[t] = (df[t] || 0) + 1
  const avgLen = toks.reduce((s, t) => s + t.length, 0) / N
  return sents.map((sent, i) => {
    if (isNoise(sent)) return { sent, score: -1, idx: i }
    const bm = bm25Score(titleToks, toks[i], avgLen, N, df)
    const pos = i < 2 ? 1.5 : i < 5 ? 1.25 : 1.0
    const len = sent.length
    const lenB = (len >= 40 && len <= 150) ? 1.3 : len > 200 ? 0.7 : 1.0
    const numB = hasNumberValue(sent) ? 1.4 : 1.0
    const cauB = isCausal(sent) ? 1.25 : 1.0
    const qvP  = /(밝혔다|말했다|전했다|설명했다)\s*$/.test(sent) ? 0.75 : 1.0
    return { sent, score: bm * pos * lenB * numB * cauB * qvP, idx: i }
  })
}

function detectEvent(title, body) {
  const text = (title + ' ' + body.slice(0, 500)).toLowerCase()
  const pri = ['funding','acquisition','product','policy','research','person','market']
  const sc = {}
  for (const t of pri) {
    sc[t] = EVENT_TYPES[t].kw.filter(k => text.includes(k)).length
    sc[t] += EVENT_TYPES[t].kw.filter(k => title.toLowerCase().includes(k)).length
  }
  const best = pri.reduce((a, b) => sc[a] >= sc[b] ? a : b)
  return sc[best] > 0 ? best : 'general'
}

function detectDomain(title, body) {
  const text = (title + ' ' + body.slice(0, 600)).toLowerCase()
  let best = 'startup', bestScore = 0
  for (const [domain, { kw }] of Object.entries(DOMAINS)) {
    const score = kw.filter(k => text.includes(k.toLowerCase())).length
    if (score > bestScore) { best = domain; bestScore = score }
  }
  return best
}

function applyTerms(text, used) {
  for (const [term, expl] of Object.entries(TERM_DICT)) {
    if (text.includes(term) && !used.has(term)) {
      text = text.replace(term, expl); used.add(term); break
    }
  }
  return text
}

function buildSummary(title, body) {
  const cleanBody = cleanText(body)
  const domain    = detectDomain(title, cleanBody)
  const eventType = detectEvent(title, cleanBody)
  const sents     = splitSentences(cleanBody)

  const evtInfo   = EVENT_TYPES[eventType] || EVENT_TYPES.market
  const domInfo   = DOMAINS[domain] || DOMAINS.startup
  const insight   = INSIGHT_TEMPLATES[eventType] || INSIGHT_TEMPLATES.general

  if (!sents.length) {
    return [`**${title.trim()}**`, '', `${evtInfo.label} · ${domInfo.ko}`, '',
      '**핵심 내용**', '', title.trim(), '', '**창업가 시사점**', '', insight, '',
      `*ai: insightship-nlp · domain: ${domain} · event: ${eventType}*`].join('\n')
  }

  const titleToks = tokenize(title)
  const scored = scoreSents(sents, titleToks).filter(x => x.score >= 0).sort((a, b) => b.score - a.score)
  const topIdxs = new Set(scored.slice(0, 4).map(x => x.idx))
  const ordered = sents.filter((_, i) => topIdxs.has(i)).slice(0, 3)
  const numSents = sents.filter(s => hasNumberValue(s) && !ordered.includes(s)).slice(0, 2)
  const causal   = sents.filter(s => isCausal(s) && !ordered.includes(s) && !numSents.includes(s)).slice(0, 1)
  const used = new Set()

  const lines = [`**${title.trim()}**`, '', `${evtInfo.label} · ${domInfo.ko}`, '',
    '**핵심 내용**', '', ...ordered.map(s => applyTerms(s, used)), '']
  if (numSents.length) {
    lines.push('**주요 수치**', '')
    numSents.forEach(s => lines.push(`→ ${applyTerms(s, used)}`))
    lines.push('')
  }
  if (causal.length) {
    lines.push('**배경과 맥락**', '', applyTerms(causal[0], used), '')
  }
  lines.push('**창업가 시사점**', '', insight, '',
    `*ai: insightship-nlp · domain: ${domain} · event: ${eventType}*`)
  return lines.join('\n')
}

function mapCategory(domain, eventType) {
  if (eventType === 'policy' || domain === 'youth' || domain === 'policy') return 'insight'
  if (eventType === 'funding' || eventType === 'market') return 'trend'
  if (eventType === 'person') return 'magazine'
  return DOMAINS[domain]?.cat || 'news'
}

// ── 메인 핸들러 ────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      status: 'ok', engine: 'insightship-nlp',
      description: '뉴스 AI 요약 배치 실행기 — 외부 API 0원',
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

  // 미처리 기사 조회 (ai_summary 없는 것 우선)
  let articles = []

  // 1차: ai_summary가 없는 것
  const r1 = await fetch(
    `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=is.null`
    + `&select=id,title,body,excerpt&order=published_at.desc&limit=60`,
    { headers: H }
  )
  const raw1 = await r1.json()
  articles = Array.isArray(raw1) ? raw1 : []

  // 2차: 짧은 요약 재처리 (200자 미만)
  if (articles.length < 10) {
    const r2 = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=not.is.null`
      + `&select=id,title,body,excerpt,ai_summary&order=published_at.desc&limit=200`,
      { headers: H }
    )
    const raw2 = await r2.json()
    const extra = (Array.isArray(raw2) ? raw2 : [])
      .filter(a => (a.ai_summary?.length || 0) < 200 && !articles.find(x => x.id === a.id))
    articles = [...articles, ...extra].slice(0, 60)
  }

  // 3차: 최근 기사 중 ai_category 없는 것
  if (articles.length < 5) {
    const r3 = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&ai_category=is.null`
      + `&select=id,title,body,excerpt,ai_summary&order=published_at.desc&limit=200`,
      { headers: H }
    )
    const raw3 = await r3.json()
    articles = (Array.isArray(raw3) ? raw3 : []).slice(0, 60)
  }

  if (!articles.length) {
    return new Response(JSON.stringify({
      message: '처리할 뉴스 없음 — 모두 처리 완료', done: 0, remaining: 0,
      engine: 'insightship-nlp', timestamp: new Date().toISOString(),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  // 병렬 요약 생성 (v6 자체 엔진)
  const summaryResults = await Promise.allSettled(
    articles.map(async a => {
      const bodyText = (a.body && a.body.length > 100) ? a.body : (a.excerpt || a.title)
      return buildSummary(a.title, bodyText)
    })
  )

  // DB 병렬 업데이트
  let done = 0, failed = 0
  await Promise.allSettled(articles.map(async (a, i) => {
    const result = summaryResults[i]
    if (result.status !== 'fulfilled' || !result.value) { failed++; return }

    const domain    = detectDomain(a.title, cleanText(a.body || a.excerpt || ''))
    const eventType = detectEvent(a.title, cleanText(a.body || a.excerpt || ''))
    const category  = mapCategory(domain, eventType)

    const u = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${a.id}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        ai_summary:      result.value,
        ai_processed_at: new Date().toISOString(),
        ai_category:     domain,
        category,
      }),
    })
    if (u.ok || u.status === 204) done++; else failed++
  }))

  // 남은 미처리 수
  const cr = await fetch(
    `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=is.null&select=id&limit=1`,
    { headers: { ...H, Prefer: 'count=exact' } }
  )
  const remaining = parseInt(cr.headers.get('content-range')?.split('/')[1] || '0')

  return new Response(JSON.stringify({
    done, failed, processed: articles.length, remaining,
    engine: 'insightship-nlp',
    cost: 0, external_api: false,
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
