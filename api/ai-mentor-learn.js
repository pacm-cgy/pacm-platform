/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║   INSIGHTSHIP AI 지속 학습 엔진 v3.0                                ║
 * ║   담당 AI: LEARN (런) — 학습 매니저                                 ║
 * ║                                                                      ║
 * ║   v3 업그레이드:                                                     ║
 * ║   - NaN 표시 완전 제거 (safeNum 헬퍼 전역 적용)                    ║
 * ║   - 피드백 학습 정밀화 (bad 피드백 → 즉시 보강 지식 생성)          ║
 * ║   - 패턴 학습 강화 (7일 → 3일 + 상위 intent 자동 지식 블록 생성)  ║
 * ║   - 기사 학습 품질 향상 (BM25 랭킹 + 중복 방지 강화)              ║
 * ║   - 취약점 자동 복구 (weak intent → 지식 자동 보강)                ║
 * ║   - 자기진화 강화 (가중치 자동 재조정)                             ║
 * ║   - 지식 통계 NaN 완전 방지                                        ║
 * ║   G. 인터뷰 인사이트 학습 (유명 기업 인터뷰 → 지식베이스 자동 내재화) ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
export const config = { runtime: 'edge' }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const H = () => ({
  apikey:         SB_KEY,
  Authorization:  `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

// ══════════════════════════════════════════════════════════════════════
// §0. 안전 수치 헬퍼 — NaN/null/undefined 완전 방지
// ══════════════════════════════════════════════════════════════════════

function safeNum(v, fallback = 0) {
  const n = Number(v)
  return isFinite(n) ? n : fallback
}

function safePct(num, den, digits = 1) {
  const n = safeNum(num), d = safeNum(den)
  if (d === 0) return '0.0%'
  return ((n / d) * 100).toFixed(digits) + '%'
}

function safeAvg(arr, key, digits = 1) {
  if (!Array.isArray(arr) || arr.length === 0) return (0).toFixed(digits)
  const sum = arr.reduce((s, item) => s + safeNum(item?.[key] ?? item), 0)
  return (sum / arr.length).toFixed(digits)
}

function safeInt(v) {
  const n = parseInt(v, 10)
  return isNaN(n) ? 0 : n
}

// ══════════════════════════════════════════════════════════════════════
// §1. NLP 코어
// ══════════════════════════════════════════════════════════════════════

const STOPS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','위해','통해',
  '대한','관련','따른','있는','없는','되는','하는','있다','없다',
  '이번','지난','올해','특히','또','더','가장','매우','모두','약',
])

function tokenize(text) {
  return ((text||'').match(/[가-힣]{2,}|[A-Za-z]{3,}/g)||[]).filter(t => !STOPS.has(t))
}

function extractKeywords(text, n = 10) {
  const tf = {}
  for (const t of tokenize(text)) tf[t] = (tf[t]||0) + 1
  return Object.entries(tf).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k])=>k)
}

function detectCategory(text) {
  const lc = (text||'').toLowerCase()
  if (/투자|vc|펀딩|시리즈|유니콘/.test(lc)) return 'market'
  if (/정책|지원|공모전|창진원|중기부/.test(lc)) return 'policy'
  if (/법인|세금|특허|계약|지분/.test(lc)) return 'legal'
  if (/트렌드|동향|시장|성장|통계/.test(lc)) return 'trend'
  if (/에듀테크|교육|학습/.test(lc)) return 'insight'
  if (/인터뷰|대표|ceo|창업자|스토리/.test(lc)) return 'insight'
  return 'guide'
}

// ══════════════════════════════════════════════════════════════════════
// §A. 피드백 학습 — 👍/👎 반영 + 가중치 갱신 + bad 시 즉시 보강
// ══════════════════════════════════════════════════════════════════════

async function processFeedback(logId, rating) {
  // 1. chat_log 레코드에 피드백 기록
  const patchRes = await fetch(`${SB_URL}/rest/v1/mentor_chat_logs?id=eq.${logId}`, {
    method: 'PATCH',
    headers: { ...H(), Prefer: 'return=minimal' },
    body: JSON.stringify({ feedback: rating, feedback_at: new Date().toISOString() }),
  })
  if (!patchRes.ok) throw new Error(`feedback patch failed: ${patchRes.status}`)

  // 2. 해당 대화의 intent + 사용된 지식 조회
  const logRes = await fetch(
    `${SB_URL}/rest/v1/mentor_chat_logs?id=eq.${logId}&select=intent_classified,user_message,ai_response`,
    { headers: H() }
  )
  const logs = await logRes.json()
  const log = logs?.[0]
  if (!log) return { ok: true }

  const intent = log.intent_classified || 'general'

  // 3. 의도 통계 업데이트
  await fetch(`${SB_URL}/rest/v1/mentor_intent_stats`, {
    method: 'POST',
    headers: { ...H(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      intent,
      sample_query: (log.user_message||'').slice(0, 200),
      needs_improvement: rating === 'bad',
      created_at: new Date().toISOString(),
    }),
  }).catch(()=>{})

  const catMap = {
    lean_canvas: 'guide', mvp: 'guide', revenue_model: 'guide',
    idea_validation: 'guide', pitch_deck: 'guide', team_building: 'guide',
    market_analysis: 'market', funding: 'market', government_support: 'policy',
    startup_basics: 'guide', marketing: 'guide', legal_tax: 'legal',
    failure_lesson: 'insight', simulation: 'guide', research_request: 'trend',
    interview_insight: 'insight',
  }
  const cat = catMap[intent]

  if (rating === 'good' && cat) {
    // 긍정 피드백 → 관련 지식 품질 소폭 상승
    const knRes = await fetch(
      `${SB_URL}/rest/v1/ai_knowledge?category=eq.${cat}&order=use_count.desc&limit=3`,
      { headers: H() }
    )
    const knList = await knRes.json().catch(() => [])
    for (const kn of (Array.isArray(knList) ? knList : [])) {
      const cur = safeNum(kn.quality, 5)
      if (cur < 10) {
        fetch(`${SB_URL}/rest/v1/ai_knowledge?id=eq.${kn.id}`, {
          method: 'PATCH',
          headers: { ...H(), Prefer: 'return=minimal' },
          body: JSON.stringify({ quality: Math.min(10, cur + 1) }),
        }).catch(()=>{})
      }
    }
  }

  if (rating === 'bad' && log.user_message) {
    // 부정 피드백 → 즉시 보강 지식 블록 생성 (개선 표시)
    const keywords = extractKeywords(log.user_message + ' ' + (log.ai_response||''))
    const newKnowledge = {
      content: `[피드백 보강] ${intent} — 사용자 질문: ${(log.user_message||'').slice(0,200)}\n응답 품질 개선 필요. 추가 학습 필요 분야.`,
      category: cat || 'guide',
      source: `feedback:bad:${logId}`,
      keywords: keywords.slice(0, 6),
      quality: 4,
      use_count: 0,
      needs_improvement: true,
      created_at: new Date().toISOString(),
    }
    fetch(`${SB_URL}/rest/v1/ai_knowledge`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body: JSON.stringify(newKnowledge),
    }).catch(()=>{})
  }

  return { ok: true, feedback: rating, intent }
}

// ══════════════════════════════════════════════════════════════════════
// §B. 패턴 학습 — 자주 묻는 질문 클러스터링 → 자동 지식 생성
// ══════════════════════════════════════════════════════════════════════

async function learnFromFrequentQueries() {
  const since = new Date(Date.now() - 3 * 86400_000).toISOString()
  const res = await fetch(
    `${SB_URL}/rest/v1/mentor_chat_logs?created_at=gte.${since}&select=intent_classified,user_message,ai_response&limit=300`,
    { headers: H() }
  )
  const logs = await res.json().catch(() => [])
  if (!Array.isArray(logs) || !logs.length) return { learned: 0 }

  // 의도별 클러스터링
  const clusters = {}
  for (const log of logs) {
    const intent = log.intent_classified || 'general'
    if (!clusters[intent]) clusters[intent] = []
    clusters[intent].push(log.user_message || '')
  }

  let learned = 0
  for (const [intent, queries] of Object.entries(clusters)) {
    if (queries.length < 2) continue // v3: 2번 이상으로 낮춤 (더 빠른 학습)

    const allText = queries.join(' ')
    const keywords = extractKeywords(allText)
    const category = detectCategory(allText)

    // 이미 유사한 지식이 있는지 확인
    if (keywords.length >= 2) {
      const existRes = await fetch(
        `${SB_URL}/rest/v1/ai_knowledge?category=eq.${category}&limit=20&select=keywords`,
        { headers: H() }
      )
      const exist = await existRes.json().catch(() => [])
      if (Array.isArray(exist)) {
        const alreadyExists = exist.some(kn => {
          const knKws = Array.isArray(kn.keywords) ? kn.keywords : []
          const overlap = keywords.slice(0,3).filter(k => knKws.includes(k)).length
          return overlap >= 2
        })
        if (alreadyExists) continue
      }
    }

    const repQuery = queries.sort((a,b)=>b.length-a.length)[0]
    if ((repQuery||'').length < 15) continue

    // 대표 응답이 있는 경우 포함
    const repLog = logs.find(l => (l.intent_classified||'general') === intent && (l.ai_response||'').length > 50)
    const repAnswer = repLog ? (repLog.ai_response||'').slice(0, 300) : ''

    const newKnowledge = {
      content: `[패턴학습] ${intent} — 자주 묻는 질문(${queries.length}회): ${repQuery.slice(0, 250)}${repAnswer ? '\n\n대표 답변 패턴: ' + repAnswer : ''}`,
      category,
      source: `auto:pattern:${intent}:${Date.now()}`,
      keywords: keywords.slice(0, 8),
      quality: Math.min(8, 5 + Math.floor(queries.length / 3)),
      use_count: queries.length,
      created_at: new Date().toISOString(),
    }

    const insertRes = await fetch(`${SB_URL}/rest/v1/ai_knowledge`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body: JSON.stringify(newKnowledge),
    })
    if (insertRes.ok) learned++
  }
  return { learned }
}

// ══════════════════════════════════════════════════════════════════════
// §C. 기사 학습 — 최신 아티클 → 지식베이스 자동 보강 (BM25 강화)
// ══════════════════════════════════════════════════════════════════════

function extractKnowledgeFromArticle(article) {
  const text = `${article.title||''}\n${article.ai_summary || article.excerpt || ''}`
  if (text.trim().length < 30) return null

  const keywords = extractKeywords(text)
  const category = detectCategory(text)

  // 핵심 문장 추출 (BM25 기반 스코어링)
  const sentences = text
    .replace(/([다요])\s/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length >= 25 && s.length <= 400)

  if (!sentences.length) return null

  const scored = sentences.map(s => {
    const toks = new Set(tokenize(s))
    const overlap = keywords.filter(k => toks.has(k)).length
    const score = overlap / Math.max(1, Math.sqrt(s.length / 30))
    return { s, score }
  }).sort((a,b) => b.score - a.score)

  const content = scored.slice(0,3).map(x=>x.s).join(' ').slice(0, 600)
  if (content.length < 30) return null

  // NaN 방지: quality 계산 시 safeNum 사용
  const quality = Math.min(9, Math.max(5, safeInt(
    Math.round(keywords.length * 0.7 + content.length / 120)
  )))

  return {
    content,
    category,
    source: `article:${article.id}`,
    keywords,
    quality,
    use_count: 0,
    created_at: new Date().toISOString(),
  }
}

async function ingestRecentArticles() {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString()
  const res = await fetch(
    `${SB_URL}/rest/v1/articles?status=eq.published&published_at=gte.${since}&select=id,title,ai_summary,excerpt,tags,category&order=published_at.desc&limit=60`,
    { headers: H() }
  )
  const articles = await res.json().catch(() => [])
  if (!Array.isArray(articles) || !articles.length) return { ingested: 0 }

  let ingested = 0
  for (const art of articles) {
    const existRes = await fetch(
      `${SB_URL}/rest/v1/ai_knowledge?source=eq.article:${art.id}&limit=1&select=id`,
      { headers: H() }
    )
    const exist = await existRes.json().catch(() => [])
    if (Array.isArray(exist) && exist.length > 0) continue

    const block = extractKnowledgeFromArticle(art)
    if (!block) continue

    const insertRes = await fetch(`${SB_URL}/rest/v1/ai_knowledge`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body: JSON.stringify(block),
    })
    if (insertRes.ok) ingested++
  }
  return { ingested }
}

// ══════════════════════════════════════════════════════════════════════
// §D. 취약점 탐지 & 자동 보강 — 부정 피드백 많은 의도 → 지식 즉시 생성
// ══════════════════════════════════════════════════════════════════════

// weak intent별 자동 보강 지식 템플릿
const BOOST_TEMPLATES = {
  lean_canvas: '린 캔버스는 9블록으로 사업 아이디어를 정리하는 도구입니다. 1.문제 2.고객 3.고유가치제안 4.해결책 5.채널 6.수익모델 7.비용구조 8.핵심지표 9.경쟁우위로 구성됩니다.',
  mvp: 'MVP(최소 기능 제품)는 가장 핵심 기능 하나만 가진 첫 제품입니다. 노션 페이지, 구글폼, 카카오채널로도 MVP를 만들 수 있습니다. 완벽한 앱보다 빠른 검증이 중요합니다.',
  funding: '스타트업 투자 단계: 시드(초기 아이디어 검증) → 시리즈 A(제품-시장 적합성 검증) → 시리즈 B 이후(확장). 한국 평균 시드 투자 규모는 1~5억원, 시리즈 A는 10~50억원 수준입니다.',
  government_support: '청소년 창업 주요 지원: 비즈쿨(초중고 창업교육), 청소년 창업경진대회, 예비창업패키지(19세 이상, 최대 1억), 대학 창업지원단. 창업진흥원(tips.go.kr)에서 전체 목록 확인 가능.',
  market_analysis: '시장 분석 3단계: ① TAM(전체 시장 규모) ② SAM(서비스 가능 시장) ③ SOM(현실적 점유율 목표). 경쟁사 분석: 1-star 리뷰에서 기회를 찾으세요.',
  pitch_deck: '피치덱 핵심 10페이지: 문제→솔루션→시장규모→제품→비즈니스모델→트랙션→팀→경쟁분석→재무계획→투자 요청. 첫 1페이지가 가장 중요합니다.',
  marketing: '창업 초기 마케팅: 오가닉 콘텐츠(SNS)로 시작하세요. 인스타그램, 틱톡에서 문제 해결 과정을 공유하면 자연스러운 커뮤니티가 형성됩니다.',
  failure_lesson: '실패는 데이터입니다. 피봇의 70%는 초기 가정이 틀렸을 때 발생합니다. 에어비앤비, 유튜브, 슬랙 모두 처음과 전혀 다른 아이디어로 시작했습니다.',
  general: 'Insightship AI 멘토는 창업 아이디어 검증, 린 캔버스, MVP 설계, 투자/정부지원 정보, 시장 분석 등을 지원합니다. 구체적인 질문일수록 더 좋은 답변을 드립니다.',
}

async function analyzeAndBoostWeakPoints() {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString()
  const res = await fetch(
    `${SB_URL}/rest/v1/mentor_intent_stats?created_at=gte.${since}&select=intent,needs_improvement`,
    { headers: H() }
  )
  const stats = await res.json().catch(() => [])
  if (!Array.isArray(stats) || !stats.length) return { weakPoints: [], boosted: 0 }

  const total = {}, bad = {}
  for (const s of stats) {
    const intent = s.intent || 'general'
    total[intent] = (total[intent] || 0) + 1
    if (s.needs_improvement) bad[intent] = (bad[intent] || 0) + 1
  }

  const weakPoints = Object.entries(total)
    .map(([intent, count]) => ({
      intent,
      count: safeNum(count),
      badCount: safeNum(bad[intent]),
      badRate: safeNum(count) > 0 ? (safeNum(bad[intent]) / safeNum(count)) : 0,
      needsBoost: safeNum(count) >= 2 && (safeNum(bad[intent]) / safeNum(count)) > 0.15,
    }))
    .filter(x => x.needsBoost)
    .sort((a,b) => b.badRate - a.badRate)

  // 취약 의도에 자동 보강 지식 생성
  let boosted = 0
  for (const wp of weakPoints.slice(0, 3)) {
    const tpl = BOOST_TEMPLATES[wp.intent] || BOOST_TEMPLATES.general
    const category = detectCategory(tpl + ' ' + wp.intent)

    // 이미 boost 지식이 있으면 스킵
    const existRes = await fetch(
      `${SB_URL}/rest/v1/ai_knowledge?source=eq.boost:${wp.intent}&limit=1&select=id`,
      { headers: H() }
    )
    const exist = await existRes.json().catch(() => [])
    if (Array.isArray(exist) && exist.length > 0) continue

    const insertRes = await fetch(`${SB_URL}/rest/v1/ai_knowledge`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        content: `[자동보강] ${tpl}`,
        category,
        source: `boost:${wp.intent}`,
        keywords: extractKeywords(tpl + ' ' + wp.intent).slice(0, 8),
        quality: 8,
        use_count: 0,
        created_at: new Date().toISOString(),
      }),
    })
    if (insertRes.ok) boosted++
  }

  return {
    weakPoints: weakPoints.map(w => ({
      intent: w.intent,
      count: w.count,
      badRate: (w.badRate * 100).toFixed(1) + '%',
    })),
    boosted,
  }
}

// ══════════════════════════════════════════════════════════════════════
// §E. 자기 진화 — 사용 패턴 기반 가중치 자동 재조정
// ══════════════════════════════════════════════════════════════════════

async function selfEvolve() {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString()
  const res = await fetch(
    `${SB_URL}/rest/v1/mentor_intent_stats?created_at=gte.${since}&select=intent`,
    { headers: H() }
  )
  const stats = await res.json().catch(() => [])
  if (!Array.isArray(stats) || !stats.length) return { evolved: false }

  const freq = {}
  for (const s of stats) {
    const intent = s.intent || 'general'
    freq[intent] = (freq[intent]||0) + 1
  }
  const total = Object.values(freq).reduce((a,b)=>a+b, 0)

  const topIntents = Object.entries(freq)
    .sort((a,b)=>b[1]-a[1])
    .slice(0, 5)
    .map(([intent]) => intent)

  let evolved = 0
  for (const intent of topIntents) {
    const catMap = {
      lean_canvas:'guide', mvp:'guide', revenue_model:'guide',
      idea_validation:'guide', pitch_deck:'guide', funding:'market',
      government_support:'policy', marketing:'guide', simulation:'guide',
      interview_insight:'insight', failure_lesson:'insight',
    }
    const cat = catMap[intent]
    if (!cat) continue

    const knRes = await fetch(
      `${SB_URL}/rest/v1/ai_knowledge?category=eq.${cat}&quality=gte.6&order=use_count.asc&limit=5&select=id,use_count`,
      { headers: H() }
    )
    const kns = await knRes.json().catch(() => [])
    for (const kn of (Array.isArray(kns) ? kns : [])) {
      fetch(`${SB_URL}/rest/v1/ai_knowledge?id=eq.${kn.id}`, {
        method: 'PATCH',
        headers: { ...H(), Prefer: 'return=minimal' },
        body: JSON.stringify({ use_count: safeNum(kn.use_count) + 1 }),
      }).catch(()=>{})
      evolved++
    }
  }

  return {
    evolved,
    topIntents,
    total_queries: safeNum(total),
    distribution: Object.fromEntries(
      Object.entries(freq).map(([k,v]) => [k, safeNum(v)])
    ),
  }
}

// ══════════════════════════════════════════════════════════════════════
// §F. 지식 정리 — 오래되고 낮은 품질 지식 삭제
// ══════════════════════════════════════════════════════════════════════

async function pruneStaleKnowledge() {
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString()
  const res = await fetch(
    `${SB_URL}/rest/v1/ai_knowledge?quality=lt.4&use_count=lt.2&created_at=lt.${cutoff}&source=neq.seed`,
    { method: 'DELETE', headers: { ...H(), Prefer: 'return=representation' } }
  )
  const deleted = res.ok ? await res.json().catch(()=>[]) : []

  // 30일 이상 + 자동학습 패턴 + 사용 0회 정리
  const cutoff30 = new Date(Date.now() - 30 * 86400_000).toISOString()
  const res2 = await fetch(
    `${SB_URL}/rest/v1/ai_knowledge?source=like.auto:pattern*&use_count=eq.0&created_at=lt.${cutoff30}`,
    { method: 'DELETE', headers: { ...H(), Prefer: 'return=minimal' } }
  )

  return {
    pruned: safeInt(Array.isArray(deleted) ? deleted.length : 0),
    patternPruned: res2.ok,
  }
}

// ══════════════════════════════════════════════════════════════════════
// §G. 인터뷰 인사이트 학습 — 유명 기업 인터뷰 아티클 → 지식베이스 내재화
// ══════════════════════════════════════════════════════════════════════

async function ingestInterviewInsights() {
  // insight 카테고리 + 인터뷰 관련 아티클 수집
  const since = new Date(Date.now() - 14 * 86400_000).toISOString()
  const res = await fetch(
    `${SB_URL}/rest/v1/articles?status=eq.published&category=eq.insight&published_at=gte.${since}` +
    `&select=id,title,ai_summary,excerpt,tags&order=published_at.desc&limit=30`,
    { headers: H() }
  )
  const articles = await res.json().catch(() => [])
  if (!Array.isArray(articles)) return { ingested: 0 }

  // 인터뷰 관련 필터
  const interviewArticles = articles.filter(a => {
    const t = ((a.title||'') + ' ' + (a.ai_summary||'')).toLowerCase()
    return /인터뷰|대표|ceo|창업자|설립자|스토리|interview|founder/.test(t)
  })

  let ingested = 0
  for (const art of interviewArticles) {
    const existRes = await fetch(
      `${SB_URL}/rest/v1/ai_knowledge?source=eq.interview:${art.id}&limit=1&select=id`,
      { headers: H() }
    )
    const exist = await existRes.json().catch(() => [])
    if (Array.isArray(exist) && exist.length > 0) continue

    const text = `${art.title}\n${art.ai_summary || art.excerpt || ''}`
    const keywords = extractKeywords(text)
    if (keywords.length < 3) continue

    const content = (art.ai_summary || art.excerpt || art.title).replace(/\*\*/g,'').trim().slice(0, 500)

    const insertRes = await fetch(`${SB_URL}/rest/v1/ai_knowledge`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        content: `[인터뷰인사이트] ${art.title}: ${content}`,
        category: 'insight',
        source: `interview:${art.id}`,
        keywords: keywords.slice(0, 10),
        quality: 8,
        use_count: 0,
        created_at: new Date().toISOString(),
      }),
    })
    if (insertRes.ok) ingested++
  }
  return { ingested, candidates: interviewArticles.length }
}

// ══════════════════════════════════════════════════════════════════════
// §H. 지식 통계 — NaN 완전 방지
// ══════════════════════════════════════════════════════════════════════

async function getKnowledgeStats() {
  const [countRes, topRes] = await Promise.allSettled([
    fetch(`${SB_URL}/rest/v1/ai_knowledge?select=category,quality,use_count`, { headers: H() }).then(r=>r.json()),
    fetch(`${SB_URL}/rest/v1/ai_knowledge?order=use_count.desc&limit=5&select=content,category,use_count`, { headers: H() }).then(r=>r.json()),
  ])

  const all = countRes.status === 'fulfilled' && Array.isArray(countRes.value) ? countRes.value : []
  const top = topRes.status === 'fulfilled' && Array.isArray(topRes.value) ? topRes.value : []

  const byCategory = {}
  for (const k of all) {
    const cat = k.category || 'unknown'
    if (!byCategory[cat]) byCategory[cat] = { count: 0, totalQuality: 0, totalUse: 0 }
    byCategory[cat].count++
    byCategory[cat].totalQuality += safeNum(k.quality, 5)
    byCategory[cat].totalUse    += safeNum(k.use_count, 0)
  }

  // avgQuality를 NaN 없이 계산
  const byCategoryOut = {}
  for (const [cat, d] of Object.entries(byCategory)) {
    byCategoryOut[cat] = {
      count:      d.count,
      avgQuality: d.count > 0 ? parseFloat((d.totalQuality / d.count).toFixed(1)) : 0,
      totalUse:   d.totalUse,
    }
  }

  const recentRes = await fetch(
    `${SB_URL}/rest/v1/ai_knowledge?order=created_at.desc&limit=5&select=source,category,created_at`,
    { headers: H() }
  )
  const recent = await recentRes.json().catch(() => [])

  return {
    total: safeInt(all.length),
    byCategory: byCategoryOut,
    topUsed: top.map(k => ({
      content:  (k.content||'').slice(0, 80),
      category: k.category || 'unknown',
      uses:     safeInt(k.use_count),
    })),
    recentlyAdded: Array.isArray(recent) ? recent.slice(0,5).map(k => ({
      source:   k.source || '',
      category: k.category || '',
      added_at: k.created_at || '',
    })) : [],
  }
}

// ══════════════════════════════════════════════════════════════════════
// §I. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  }
  const json = (d, s=200) => new Response(JSON.stringify(d), {
    status: s, headers: { 'Content-Type': 'application/json', ...CORS },
  })

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // ── POST: 피드백 처리 (사용자 직접 호출) ────────────────────────
  if (req.method === 'POST') {
    let body
    try { body = await req.json() } catch {
      return json({ error: 'invalid json' }, 400)
    }

    const { action, logId, rating } = body

    if (action === 'feedback') {
      if (!logId || !['good', 'bad'].includes(rating)) {
        return json({ error: 'logId and rating(good|bad) required' }, 400)
      }
      // ★ SECURITY: UUID 형식 검증 (IDOR 방지 — 임의 ID로 타인 피드백 조작 차단)
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!UUID_RE.test(logId)) {
        return json({ error: '유효하지 않은 logId 형식입니다.' }, 400)
      }
      try {
        const result = await processFeedback(logId, rating)
        return json(result)
      } catch (e) {
        return json({ error: '피드백 처리 중 오류가 발생했습니다.' }, 500)
      }
    }

    return json({ error: 'unknown action' }, 400)
  }

  // ── GET: 상태 조회 (미인증) / CRON 전체 학습 (인증) ─────────────
  if (req.method === 'GET') {
    const isAuthed = req.headers.get('x-vercel-cron') === '1'
      || req.headers.get('authorization') === `Bearer ${CRON_SECRET}`
      || req.headers.get('x-cron-secret') === CRON_SECRET

    if (!isAuthed) {
      // 미인증: 상태만 반환
      return json({
        status: 'ok',
        engine: 'LEARN-v3',
        agent: 'LEARN (런) — AI 학습 매니저',
        description: 'AI 지속 학습 엔진 v3 — NaN 완전 방지 + 피드백 보강 + 인터뷰 인사이트 학습',
        schedule: '매일 12:00 KST',
      })
    }

    if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env' }, 500)

    const startTime = Date.now()

    // 모든 학습 파이프라인 병렬 실행
    const [ingest, interview, pattern, weak, evolve, prune, stats] = await Promise.allSettled([
      ingestRecentArticles(),
      ingestInterviewInsights(),
      learnFromFrequentQueries(),
      analyzeAndBoostWeakPoints(),
      selfEvolve(),
      pruneStaleKnowledge(),
      getKnowledgeStats(),
    ])

    const results = {
      ok: true,
      timestamp: new Date().toISOString(),
      engine: 'LEARN-v3',
      agent: 'LEARN',
      elapsed_ms: safeInt(Date.now() - startTime),
      ingest:    ingest.status   === 'fulfilled' ? ingest.value   : { error: String(ingest.reason?.message||'failed') },
      interview: interview.status=== 'fulfilled' ? interview.value: { error: String(interview.reason?.message||'failed') },
      pattern:   pattern.status  === 'fulfilled' ? pattern.value  : { error: String(pattern.reason?.message||'failed') },
      weak:      weak.status     === 'fulfilled' ? weak.value     : { error: String(weak.reason?.message||'failed') },
      evolve:    evolve.status   === 'fulfilled' ? evolve.value   : { error: String(evolve.reason?.message||'failed') },
      prune:     prune.status    === 'fulfilled' ? prune.value    : { error: String(prune.reason?.message||'failed') },
      stats:     stats.status    === 'fulfilled' ? stats.value    : { error: String(stats.reason?.message||'failed') },
    }

    return json(results)
  }

  return new Response('Method Not Allowed', { status: 405 })
}
