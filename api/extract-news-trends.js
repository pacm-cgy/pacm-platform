// 뉴스 기반 트렌드 자동 추출 - 매일 실행
// 1) 뉴스 카테고리별 수집량 집계 → trend_snapshots 저장
// 2) 전일 대비 change_pct 자동 계산
export const config = { runtime: 'edge' }

// Groq + Gemini 폴백 헬퍼
const GROQ_KEY = process.env.GROQ_API_KEY
async function callAI(system, user, maxTokens=1000) {
  // 1차: Groq (llama-3.3-70b)
  if (GROQ_KEY) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${GROQ_KEY}`},
        body:JSON.stringify({model:'llama-3.3-70b-versatile',messages:[{role:'system',content:system},{role:'user',content:user}],max_tokens:maxTokens,temperature:0.4}),
        signal:AbortSignal.timeout(20000)
      })
      if (r.ok) {
        const d=await r.json()
        const t=d.choices?.[0]?.message?.content?.trim()||''
        if (t.length>50) return t
      }
    } catch(e) {}
  }
  // 2차: Gemini 폴백
  for (const model of ['gemini-1.5-flash','gemini-2.0-flash','gemini-1.5-flash-8b']) {
    try {
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({system_instruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:user}]}],generationConfig:{maxOutputTokens:maxTokens,temperature:0.4}}),
        signal:AbortSignal.timeout(18000)
      })
      if (r.status===429) continue
      if (!r.ok) continue
      const d=await r.json()
      const t=d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()||''
      if (t.length>50) return t
    } catch(e) { continue }
  }
  throw new Error('AI 호출 실패')
}


const SB_URL  = process.env.SUPABASE_URL
const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI  = process.env.GEMINI_API_KEY
const SECRET  = process.env.CRON_SECRET

// 카테고리 → 한국어 메트릭명 매핑
const CAT_MAP = {
  funding:        { name: '스타트업 투자/펀딩', unit: '건', cat_display: '경제/창업' },
  ai_startup:     { name: 'AI 스타트업',        unit: '건', cat_display: '기술/IT' },
  ai:             { name: 'AI 기술',             unit: '건', cat_display: '기술/IT' },
  edutech:        { name: '에듀테크',            unit: '건', cat_display: '교육/창업' },
  youth:          { name: '청소년/청년 창업',    unit: '건', cat_display: '사회/창업' },
  entrepreneurship:{ name: '창업 생태계',        unit: '건', cat_display: '경제/창업' },
  unicorn:        { name: '유니콘/IPO',          unit: '건', cat_display: '경제/창업' },
  climate:        { name: '기후테크/그린',       unit: '건', cat_display: '환경/에너지' },
  health:         { name: '헬스케어 AI',         unit: '건', cat_display: '헬스케어' },
  fintech:        { name: '핀테크',              unit: '건', cat_display: '경제/창업' },
  general:        { name: '일반 스타트업',       unit: '건', cat_display: '경제/창업' },
}

export default async function handler(req) {
  const isAuth = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === `Bearer ${SECRET}`
  if (!isAuth) return new Response('Unauthorized', { status: 401 })

  const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

  // 1) 오늘 + 어제 뉴스 카테고리별 수집량
  // 주간 집계: 이번 주(7일) vs 지난 주(7~14일)
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
  let [todayNews, yNews] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/articles?status=eq.published&category=eq.news&created_at=gte.${weekAgo}&select=ai_category&limit=500`, { headers: H }).then(r=>r.json()),
    fetch(`${SB_URL}/rest/v1/articles?status=eq.published&category=eq.news&created_at=gte.${twoWeeksAgo}&created_at=lt.${weekAgo}&select=ai_category&limit=500`, { headers: H }).then(r=>r.json()),
  ])

  // 오늘 뉴스 없으면 어제 데이터로 폴백 (KST 기준 이른 아침)
  if (!Array.isArray(todayNews) || !todayNews.length) {
    if (!Array.isArray(yNews) || !yNews.length) {
      return new Response(JSON.stringify({ message: '최근 뉴스 없음' }), { status: 200 })
    }
    todayNews = yNews
    yNews = []
  }

  // 카테고리별 집계
  const countToday = {}, countYest = {}
  for (const a of todayNews)  countToday[a.ai_category||'general'] = (countToday[a.ai_category||'general']||0)+1
  for (const a of (yNews||[])) countYest[a.ai_category||'general']  = (countYest[a.ai_category||'general']||0)+1

  // 2) AI로 핫 키워드 + 시장 분위기 추출
  let aiInsight = null
  try {
    const recentTitles = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&category=eq.news&published_at=gte.${weekAgo}&select=title,ai_category&order=published_at.desc&limit=50`,
      { headers: H }
    ).then(r=>r.json())

    const titles = (Array.isArray(recentTitles) ? recentTitles : []).map(a=>a.title).join('\n')
    const prompt = `다음 최근 1주일 스타트업/창업 뉴스 제목들을 분석하세요.
가장 뜨거운 트렌드 키워드 TOP 5를 JSON으로만 반환하세요:
{"hot_keywords":["키워드1","키워드2","키워드3","키워드4","키워드5"],"market_mood":"bullish|bearish|neutral","summary":"20자 이내 시장 요약"}

뉴스 제목:
${titles.slice(0, 2000)}

JSON만 출력:`

    const gr = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI}`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 256, temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(10000),
      }
    )
    if (gr.ok) {
      const gd = await gr.json()
      const txt = gd.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
      const clean = txt.replace(/```json|```/g, '').trim()
      try { aiInsight = JSON.parse(clean) } catch { aiInsight = null }
    }
  } catch {}

  // 3) trend_snapshots 저장/업데이트
  const saved = [], errors = []

  for (const [aiCat, count] of Object.entries(countToday)) {
    const meta = CAT_MAP[aiCat] || { name: aiCat, unit: '건', cat_display: '기타' }
    const prevCount = countYest[aiCat] || 0
    const changePct = prevCount > 0
      ? Math.round(((count - prevCount) / prevCount) * 100)
      : count > 0 ? 100 : 0

    // 오늘 이미 있으면 UPDATE, 없으면 INSERT (upsert)
    const upsertBody = {
      snapshot_date: today,
      category: meta.cat_display,
      metric_name: meta.name,
      metric_value: count,
      metric_unit: meta.unit,
      change_pct: changePct,
    }

    const r = await fetch(`${SB_URL}/rest/v1/trend_snapshots`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(upsertBody),
    })

    if (r.ok || r.status === 201 || r.status === 204) saved.push(meta.name)
    else {
      const errTxt = await r.text()
      errors.push(`${meta.name}:${r.status}:${errTxt.slice(0,50)}`)
    }
  }

  // 4) AI 인사이트 트렌드도 저장
  if (aiInsight?.hot_keywords?.length) {
    const mood = aiInsight.market_mood || 'neutral'
    const moodScore = mood === 'bullish' ? 1 : mood === 'bearish' ? -1 : 0

    const hotR = await fetch(`${SB_URL}/rest/v1/trend_snapshots`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        snapshot_date: today,
        category: 'AI분석',
        metric_name: '시장분위기지수',
        metric_value: moodScore,
        metric_unit: 'score',
        change_pct: 0,
      }),
    })
    if (hotR.ok || hotR.status === 201 || hotR.status === 204) saved.push('시장분위기지수')
  }

  // 5) 30일 이상 된 뉴스 기반 트렌드 정리
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  await fetch(
    `${SB_URL}/rest/v1/trend_snapshots?snapshot_date=lt.${cutoff}&category=in.(경제/창업,기술/IT,교육/창업,사회/창업,환경/에너지,헬스케어,AI분석)`,
    { method: 'DELETE', headers: H }
  ).catch(() => {})

  return new Response(JSON.stringify({
    ok: true,
    today,
    total_news: todayNews.length,
    categories_updated: saved.length,
    saved,
    errors,
    ai_insight: aiInsight,
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
