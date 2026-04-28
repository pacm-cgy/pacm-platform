/**
 * api/extract-news-trends.js
 * TREND 매니저 — 트렌드 자동 추출 (자체 NLP, 외부 AI 0원)
 * 매일 22:00 UTC (KST 07:00) 실행
 */
export const config = { runtime: 'edge', maxDuration: 60 }

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
export default async function handler(req) {
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
