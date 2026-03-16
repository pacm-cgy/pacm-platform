// 뉴스 기사에서 자동 트렌드 지표 추출
// 매일 뉴스 DB를 분석해서 trend_snapshots에 뉴스 트렌드 추가
export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY = process.env.GEMINI_API_KEY
const CRON_SECRET = process.env.CRON_SECRET

async function callGemini(prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(15000),
    }
  )
  if (!r.ok) return null
  const d = await r.json()
  return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
}

export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const H = { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY }

  // 최근 7일치 뉴스 가져오기
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const newsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&status=eq.published&published_at=gte.${since}&select=title,ai_summary,ai_category,tags&order=published_at.desc&limit=80`,
    { headers: H }
  )
  const news = await newsRes.json()
  if (!news?.length) return new Response(JSON.stringify({ message: '뉴스 없음' }), { status: 200 })

  // 카테고리별 집계
  const catCounts = {}
  const tagCounts = {}
  news.forEach(a => {
    const cat = a.ai_category || 'general'
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    (a.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1 })
  })

  // 상위 태그 (뉴스 트렌드)
  const topTags = Object.entries(tagCounts)
    .filter(([t]) => t !== '뉴스' && t.length > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  // Gemini로 트렌드 지표 추출
  const catSummary = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, cnt]) => `${cat}: ${cnt}건`)
    .join(', ')

  const topTagStr = topTags.map(([t, c]) => `${t}(${c}건)`).join(', ')
  const sampleTitles = news.slice(0, 15).map(a => a.title).join('\n')

  const prompt = `당신은 한국 스타트업 생태계 분석가입니다.

최근 7일간 뉴스 ${news.length}건을 분석한 결과입니다:

[카테고리별 기사 수]
${catSummary}

[많이 언급된 키워드]
${topTagStr}

[주요 기사 제목 (상위 15건)]
${sampleTitles}

위 데이터를 바탕으로 현재 가장 주목받는 트렌드 지표 3~5개를 추출해주세요.
각 트렌드는 JSON 배열로만 출력하세요 (다른 텍스트 없이):

[
  {
    "metric_name": "지표명 (10자 이하)",
    "metric_value": 숫자 (언급 빈도나 추정 수치),
    "metric_unit": "건/주 또는 %",
    "change_pct": 변화율 숫자 (양수=상승, 음수=하락),
    "category": "ai|funding|edutech|youth|entrepreneurship|climate|health|fintech|general",
    "source_name": "뉴스 트렌드 분석",
    "description": "이 트렌드가 주목받는 이유 한 문장",
    "is_news_trend": true
  }
]`

  let extracted = []
  try {
    const result = await callGemini(prompt)
    if (result) {
      const clean = result.replace(/```json|```/g, '').trim()
      const jsonMatch = clean.match(/\[[\s\S]*\]/)
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0])
    }
  } catch (e) {
    console.error('Gemini parse error:', e)
  }

  if (!extracted.length) return new Response(JSON.stringify({ message: 'Gemini 추출 실패' }), { status: 200 })

  // trend_snapshots에 저장 (is_news_trend 필드 확인 필요)
  const today = new Date().toISOString().slice(0, 10)
  let saved = 0, errors = []

  for (const t of extracted) {
    try {
      // 오늘 날짜의 같은 metric_name 중복 방지
      const existing = await fetch(
        `${SUPABASE_URL}/rest/v1/trend_snapshots?metric_name=eq.${encodeURIComponent(t.metric_name)}&source_name=eq.뉴스 트렌드 분석&recorded_at=gte.${today}`,
        { headers: H }
      )
      const ex = await existing.json()
      if (ex?.length > 0) continue // 오늘 이미 저장됨

      const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/trend_snapshots`, {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          metric_name: t.metric_name,
          metric_value: t.metric_value || 0,
          metric_unit: t.metric_unit || '건/주',
          change_pct: t.change_pct || 0,
          category: t.category || 'general',
          source_name: '뉴스 트렌드 분석',
          source_url: null,
          description: t.description || '',
          recorded_at: new Date().toISOString(),
        }),
      })
      if (saveRes.ok || saveRes.status === 201) saved++
      else errors.push(t.metric_name + ':' + saveRes.status)
    } catch (e) {
      errors.push(t.metric_name + ':' + e.message?.slice(0, 30))
    }
  }

  return new Response(JSON.stringify({
    extracted: extracted.length,
    saved,
    errors,
    topTags: topTags.slice(0, 5).map(([t]) => t),
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
