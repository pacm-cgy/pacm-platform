/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║   PACM-AI 지속 학습 엔진 v2.0                                       ║
 * ║   /api/ai-mentor-learn                                               ║
 * ║                                                                      ║
 * ║   학습 파이프라인:                                                   ║
 * ║   A. 피드백 학습  — 👍/👎 → 응답 품질 가중치 갱신                  ║
 * ║   B. 패턴 학습    — 자주 묻는 질문 → 자동 지식 블록 생성            ║
 * ║   C. 기사 학습    — 최신 뉴스/아티클 → 지식베이스 자동 보강        ║
 * ║   D. 취약점 탐지  — 부정 피드백 많은 의도 → 지식 강화 표시         ║
 * ║   E. 자기 진화    — 사용 패턴 기반 가중치 자동 조정                ║
 * ║   F. 지식 정리    — 오래되고 낮은 품질 지식 자동 삭제              ║
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
// §A. 피드백 학습 — 👍/👎 반영 + 가중치 갱신
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

  // 3. 의도 통계 업데이트
  await fetch(`${SB_URL}/rest/v1/mentor_intent_stats`, {
    method: 'POST',
    headers: { ...H(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      intent: log.intent_classified || 'general',
      sample_query: log.user_message?.slice(0, 200),
      needs_improvement: rating === 'bad',
      created_at: new Date().toISOString(),
    }),
  })

  // 4. 긍정 피드백이면 → 관련 지식 품질 점수 상승
  if (rating === 'good' && log.intent_classified) {
    const catMap = {
      lean_canvas: 'guide', mvp: 'guide', revenue_model: 'guide',
      idea_validation: 'guide', pitch_deck: 'guide', team_building: 'guide',
      market_analysis: 'market', funding: 'market', government_support: 'policy',
      startup_basics: 'guide', marketing: 'guide', legal_tax: 'legal',
      failure_lesson: 'insight', simulation: 'guide', research_request: 'trend',
    }
    const cat = catMap[log.intent_classified]
    if (cat) {
      // 해당 카테고리 상위 지식 품질 소폭 상승 (최대 10)
      const knRes = await fetch(
        `${SB_URL}/rest/v1/ai_knowledge?category=eq.${cat}&order=use_count.desc&limit=3`,
        { headers: H() }
      )
      const knList = await knRes.json()
      for (const kn of (knList || [])) {
        if ((kn.quality || 5) < 10) {
          fetch(`${SB_URL}/rest/v1/ai_knowledge?id=eq.${kn.id}`, {
            method: 'PATCH',
            headers: { ...H(), Prefer: 'return=minimal' },
            body: JSON.stringify({ quality: Math.min(10, (kn.quality || 5) + 1) }),
          }).catch(() => {})
        }
      }
    }
  }

  return { ok: true, feedback: rating, intent: log.intent_classified }
}

// ══════════════════════════════════════════════════════════════════════
// §B. 패턴 학습 — 자주 묻는 질문 클러스터링 → 자동 지식 생성
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
  const lc = text.toLowerCase()
  if (/투자|vc|펀딩|시리즈|유니콘/.test(lc)) return 'market'
  if (/정책|지원|공모전|창진원|중기부/.test(lc)) return 'policy'
  if (/법인|세금|특허|계약|지분/.test(lc)) return 'legal'
  if (/트렌드|동향|시장|성장|통계/.test(lc)) return 'trend'
  if (/에듀테크|교육|학습/.test(lc)) return 'insight'
  return 'guide'
}

// 자주 묻는 질문 → 새 지식 블록 자동 생성
async function learnFromFrequentQueries() {
  const since = new Date(Date.now() - 3 * 86400_000).toISOString()
  const res = await fetch(
    `${SB_URL}/rest/v1/mentor_chat_logs?created_at=gte.${since}&select=intent_classified,user_message,ai_response&limit=200`,
    { headers: H() }
  )
  const logs = await res.json()
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
    if (queries.length < 3) continue // 3번 이상 질문된 의도만

    // 공통 패턴 추출
    const allText = queries.join(' ')
    const keywords = extractKeywords(allText)
    const category = detectCategory(allText)

    // 이미 유사한 지식이 있는지 확인
    const existRes = await fetch(
      `${SB_URL}/rest/v1/ai_knowledge?category=eq.${category}&keywords=cs.{${keywords.slice(0,3).join(',')}}}&limit=1`,
      { headers: H() }
    )
    const exist = await existRes.json()
    if (Array.isArray(exist) && exist.length > 0) continue

    // 새 지식 블록 생성 — 가장 대표적인 질문 기반
    const repQuery = queries.sort((a,b)=>b.length-a.length)[0]
    if (repQuery.length < 20) continue

    const newKnowledge = {
      content: `[자동학습] ${intent} 관련 자주 묻는 질문 패턴: ${repQuery.slice(0, 300)}`,
      category,
      source: `auto:pattern:${intent}:${Date.now()}`,
      keywords: keywords.slice(0, 8),
      quality: 6,
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
// §C. 기사 학습 — 최신 아티클 → 지식베이스 자동 보강
// ══════════════════════════════════════════════════════════════════════

function extractKnowledgeFromArticle(article) {
  const text = `${article.title}\n${article.ai_summary || article.excerpt || ''}`
  const keywords = extractKeywords(text)
  const category = detectCategory(text)

  // 핵심 문장 추출
  const sentences = text
    .replace(/([다요])\s/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length >= 30 && s.length <= 400)

  if (!sentences.length) return null

  // BM25 간이 스코어링
  const scored = sentences.map(s => {
    const toks = new Set(tokenize(s))
    const overlap = keywords.filter(k => toks.has(k)).length
    return { s, score: overlap / Math.max(1, Math.sqrt(s.length)) }
  }).sort((a,b) => b.score - a.score)

  const content = scored.slice(0,3).map(x=>x.s).join(' ').slice(0, 600)
  if (content.length < 40) return null

  const quality = Math.min(9, Math.max(5, Math.round(keywords.length * 0.7 + content.length / 120)))

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
    `${SB_URL}/rest/v1/articles?status=eq.published&published_at=gte.${since}&select=id,title,ai_summary,excerpt,tags,category&order=published_at.desc&limit=50`,
    { headers: H() }
  )
  const articles = await res.json()
  if (!Array.isArray(articles) || !articles.length) return { ingested: 0 }

  let ingested = 0
  for (const art of articles) {
    // 이미 처리된 기사인지 확인
    const existRes = await fetch(
      `${SB_URL}/rest/v1/ai_knowledge?source=eq.article:${art.id}&limit=1`,
      { headers: H() }
    )
    const exist = await existRes.json()
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
// §D. 취약점 탐지 — 부정 피드백 많은 의도 분석
// ══════════════════════════════════════════════════════════════════════

async function analyzeWeakPoints() {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString()
  const res = await fetch(
    `${SB_URL}/rest/v1/mentor_intent_stats?created_at=gte.${since}&select=intent,needs_improvement`,
    { headers: H() }
  )
  const stats = await res.json()
  if (!Array.isArray(stats) || !stats.length) return { weakPoints: [] }

  const total = {}, bad = {}
  for (const s of stats) {
    total[s.intent] = (total[s.intent] || 0) + 1
    if (s.needs_improvement) bad[s.intent] = (bad[s.intent] || 0) + 1
  }

  const weakPoints = Object.entries(total)
    .map(([intent, count]) => ({
      intent,
      count,
      badRate: ((bad[intent]||0) / count),
      needsBoost: count >= 3 && ((bad[intent]||0) / count) > 0.2,
    }))
    .filter(x => x.needsBoost)
    .sort((a,b) => b.badRate - a.badRate)

  return { weakPoints }
}

// ══════════════════════════════════════════════════════════════════════
// §E. 자기 진화 — 사용 패턴 기반 가중치 자동 재조정
// ══════════════════════════════════════════════════════════════════════

async function selfEvolve() {
  // 최근 30일 의도 분포 분석
  const since = new Date(Date.now() - 30 * 86400_000).toISOString()
  const res = await fetch(
    `${SB_URL}/rest/v1/mentor_intent_stats?created_at=gte.${since}&select=intent`,
    { headers: H() }
  )
  const stats = await res.json()
  if (!Array.isArray(stats) || !stats.length) return { evolved: false }

  // 의도 빈도 계산
  const freq = {}
  for (const s of stats) freq[s.intent] = (freq[s.intent]||0) + 1
  const total = Object.values(freq).reduce((a,b)=>a+b, 0)

  // 자주 쓰이는 의도의 지식 품질 자동 향상
  const topIntents = Object.entries(freq)
    .sort((a,b)=>b[1]-a[1])
    .slice(0, 3)
    .map(([intent]) => intent)

  let evolved = 0
  for (const intent of topIntents) {
    const catMap = {
      lean_canvas:'guide', mvp:'guide', revenue_model:'guide',
      idea_validation:'guide', pitch_deck:'guide', funding:'market',
      government_support:'policy', marketing:'guide', simulation:'guide',
    }
    const cat = catMap[intent]
    if (!cat) continue

    // 해당 카테고리 지식 중 use_count 낮은 것들 boost
    const knRes = await fetch(
      `${SB_URL}/rest/v1/ai_knowledge?category=eq.${cat}&quality=gte.7&order=use_count.asc&limit=5`,
      { headers: H() }
    )
    const kns = await knRes.json()
    for (const kn of (kns||[])) {
      fetch(`${SB_URL}/rest/v1/ai_knowledge?id=eq.${kn.id}`, {
        method: 'PATCH',
        headers: { ...H(), Prefer: 'return=minimal' },
        body: JSON.stringify({ use_count: (kn.use_count||0) + 1 }),
      }).catch(()=>{})
      evolved++
    }
  }

  return { evolved, topIntents, distribution: freq }
}

// ══════════════════════════════════════════════════════════════════════
// §F. 지식 정리 — 오래되고 낮은 품질 지식 삭제
// ══════════════════════════════════════════════════════════════════════

async function pruneStaleKnowledge() {
  // 90일 이상 + 품질 낮음 + 사용 안 된 지식 삭제
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString()
  const res = await fetch(
    `${SB_URL}/rest/v1/ai_knowledge?quality=lt.5&use_count=lt.2&created_at=lt.${cutoff}&source=neq.seed`,
    { method: 'DELETE', headers: { ...H(), Prefer: 'return=representation' } }
  )
  const deleted = res.ok ? (await res.json().catch(()=>[])) : []

  // 30일 이상 + 자동학습 패턴 + 사용 0회 정리
  const cutoff30 = new Date(Date.now() - 30 * 86400_000).toISOString()
  const res2 = await fetch(
    `${SB_URL}/rest/v1/ai_knowledge?source=like.auto:pattern*&use_count=eq.0&created_at=lt.${cutoff30}`,
    { method: 'DELETE', headers: { ...H(), Prefer: 'return=minimal' } }
  )

  return { pruned: Array.isArray(deleted) ? deleted.length : 0, patternPruned: res2.ok }
}

// ══════════════════════════════════════════════════════════════════════
// §G. 지식 통계 요약
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
    if (!byCategory[cat]) byCategory[cat] = { count: 0, avgQuality: 0, totalUse: 0 }
    byCategory[cat].count++
    byCategory[cat].avgQuality += k.quality || 5
    byCategory[cat].totalUse += k.use_count || 0
  }
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].avgQuality = (byCategory[cat].avgQuality / byCategory[cat].count).toFixed(1)
  }

  return {
    total: all.length,
    byCategory,
    topUsed: top.map(k => ({ content: k.content?.slice(0, 80), category: k.category, uses: k.use_count })),
  }
}

// ══════════════════════════════════════════════════════════════════════
// §H. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  }

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // ── POST: 피드백 처리 (사용자 직접 호출) ────────────────────────
  if (req.method === 'POST') {
    let body
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } })
    }

    const { action, logId, rating } = body

    if (action === 'feedback') {
      if (!logId || !['good', 'bad'].includes(rating)) {
        return new Response(JSON.stringify({ error: 'logId and rating(good|bad) required' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
        })
      }
      try {
        const result = await processFeedback(logId, rating)
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...CORS },
        })
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
        })
      }
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  // ── GET: CRON / 관리자 전용 ──────────────────────────────────────
  if (req.method === 'GET') {
    const isAuthed = req.headers.get('x-vercel-cron') === '1'
      || req.headers.get('authorization') === `Bearer ${CRON_SECRET}`
    if (!isAuthed) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    const startTime = Date.now()
    const results = {}

    // 병렬 실행
    const [ingest, pattern, weak, evolve, prune, stats] = await Promise.allSettled([
      ingestRecentArticles(),
      learnFromFrequentQueries(),
      analyzeWeakPoints(),
      selfEvolve(),
      pruneStaleKnowledge(),
      getKnowledgeStats(),
    ])

    results.ingest   = ingest.status   === 'fulfilled' ? ingest.value   : { error: ingest.reason?.message }
    results.pattern  = pattern.status  === 'fulfilled' ? pattern.value  : { error: pattern.reason?.message }
    results.weak     = weak.status     === 'fulfilled' ? weak.value     : { error: weak.reason?.message }
    results.evolve   = evolve.status   === 'fulfilled' ? evolve.value   : { error: evolve.reason?.message }
    results.prune    = prune.status    === 'fulfilled' ? prune.value    : { error: prune.reason?.message }
    results.stats    = stats.status    === 'fulfilled' ? stats.value    : { error: stats.reason?.message }

    return new Response(JSON.stringify({
      ok: true,
      timestamp: new Date().toISOString(),
      engine: 'LEARN-v2',
      agent: 'LEARN',
      elapsed_ms: Date.now() - startTime,
      ...results,
    }), { headers: { 'Content-Type': 'application/json', ...CORS } })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
