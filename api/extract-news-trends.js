// 뉴스 기반 트렌드 자동 추출 - Claude API (primary) → Gemini (fallback)
export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY = process.env.GEMINI_API_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const CRON_SECRET = process.env.CRON_SECRET

async function callAI(prompt) {
  // Claude 우선
  if (ANTHROPIC_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(20000),
      })
      if (r.ok) {
        const d = await r.json()
        return d.content?.[0]?.text?.trim() || null
      }
    } catch {}
  }
  // Gemini 폴백
  if (GEMINI_KEY) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 800,
          thinkingConfig: { thinkingBudget: 0 },
          temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(15000),
        }
      )
      if (r.ok) {
        const d = await r.json()
        return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
      }
    } catch {}
  }
  return null
}

export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const H = { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY }

  // 최근 7일 뉴스
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const newsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?status=eq.published&published_at=gte.${since}&select=title,ai_summary,ai_category,tags&order=published_at.desc&limit=80`,
    { headers: H }
  )
  const news = await newsRes.json()
  if (!news?.length) return new Response(JSON.stringify({ message: '뉴스 없음' }), { status: 200 })

  const catCounts = {}
  const tagCounts = {}
  news.forEach(a => {
    const cat = a.ai_category || 'general'
    catCounts[cat] = (catCounts[cat] || 0) + 1
    ;(a.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1 })
  })

  const topTags = Object.entries(tagCounts)
    .filter(([t]) => t !== '뉴스' && t.length > 1)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)

  const catSummary = Object.entries(catCounts).sort((a, b) => b[1] - a[1])
    .map(([cat, cnt]) => `${cat}: ${cnt}건`).join(', ')
  const topTagStr = topTags.map(([t, c]) => `${t}(${c}건)`).join(', ')
  const sampleTitles = news.slice(0, 10).map(a => a.title).join('\n')

  const exampleJson = '[{"metric_name":"AI스타트업","metric_value":45,"metric_unit":"건/주","change_pct":25,"category":"ai","source_name":"뉴스 트렌드 분석","description":"AI 스타트업 관련 뉴스 증가"},{"metric_name":"에듀테크","metric_value":18,"metric_unit":"건/주","change_pct":12,"category":"edutech","source_name":"뉴스 트렌드 분석","description":"교육 기술 스타트업 관심 증가"}]'

  const prompt = `아래 최근 뉴스 데이터를 분석해서 현재 가장 주목받는 트렌드 지표 3개를 추출하세요.

카테고리별 기사 수: ${catSummary}
많이 언급된 키워드: ${topTagStr}
주요 기사 제목:
${sampleTitles}

반드시 JSON 배열 형식만 출력하세요 (코드블록이나 다른 텍스트 없이 순수 JSON만):
${exampleJson}`

  let extracted = []
  try {
    const result = await callAI(prompt)
    if (result) {
      const clean = result.replace(/```json|```/g, '').trim()
      const arrMatch = clean.match(/\[\s*\{[\s\S]*?\}\s*\]/)
      if (arrMatch) {
        try { extracted = JSON.parse(arrMatch[0]) } catch {}
      }
      if (!extracted.length) {
        try {
          const parsed = JSON.parse(clean)
          extracted = Array.isArray(parsed) ? parsed : []
        } catch {}
      }
    }
  } catch {}

  if (!extracted.length) return new Response(JSON.stringify({ message: '추출 실패', catSummary }), { status: 200 })

  const today = new Date().toISOString().slice(0, 10)
  let saved = 0
  const errors = []

  for (const t of extracted.slice(0, 5)) {
    try {
      const existing = await fetch(
        `${SUPABASE_URL}/rest/v1/trend_snapshots?metric_name=eq.${encodeURIComponent(t.metric_name)}&source=eq.뉴스 트렌드 분석&snapshot_date=gte.${today}`,
        { headers: H }
      )
      const ex = await existing.json()
      if (ex?.length > 0) continue

      const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/trend_snapshots`, {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          metric_name: t.metric_name,
          metric_value: t.metric_value || 0,
          metric_unit: t.metric_unit || '건/주',
          change_pct: t.change_pct || 0,
          category: t.category || 'general',
          source: '뉴스 트렌드 분석',
          source_url: null,
          snapshot_date: new Date().toISOString().slice(0, 10),
        }),
      })
      if (saveRes.ok || saveRes.status === 201) saved++
      else errors.push(t.metric_name + ':' + saveRes.status)
    } catch (e) {
      errors.push(t.metric_name + ':' + (e.message || '').slice(0, 30))
    }
  }

  return new Response(JSON.stringify({
    extracted: extracted.length, saved, errors,
    topTags: topTags.slice(0, 5).map(([t]) => t),
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
