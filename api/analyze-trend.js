// 트렌드 "왜 그럴까?" AI 분석 + 웹 서칭
// Gemini 2.0 Flash (검색 포함) → 청소년 맞춤 트렌드 설명
export const config = { runtime: 'edge' }

const GEMINI_KEY = process.env.GEMINI_API_KEY
const CRON_SECRET = process.env.CRON_SECRET
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req) {
  // 인증 (로그인 불필요 - 공개 API지만 CORS 제한)
  const origin = req.headers.get('origin') || ''
  const isAllowed = origin.includes('insightship.pacm.kr') || origin.includes('localhost')
  if (!isAllowed && req.headers.get('authorization') !== 'Bearer ' + CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { metric_name, metric_value, metric_unit, change_pct, category, source_name } = await req.json().catch(() => ({}))
  if (!metric_name) return new Response(JSON.stringify({ error: 'metric_name required' }), { status: 400 })

  const changeDir = change_pct > 0 ? '상승' : change_pct < 0 ? '하락' : '보합'
  const changeAbs = Math.abs(change_pct || 0).toFixed(1)

  const prompt = `당신은 청소년 창업 플랫폼 'Insightship'의 트렌드 분석 AI입니다.

다음 트렌드 지표에 대해 "왜 이 트렌드가 오르게 됐을까?"를 창업에 관심 있는 청소년(중·고등학생)이 이해할 수 있도록 분석해주세요.

[트렌드 정보]
- 지표명: ${metric_name}
- 현재값: ${metric_value}${metric_unit || ''}
- 변화율: 전년 대비 ${changeDir} ${changeAbs}%
- 분야: ${category || '스타트업'}
- 출처: ${source_name || '공공기관'}

[작성 가이드]
1. **왜 이 트렌드가 생겼나** (배경/원인) — 2~3문장
2. **지금 어떤 상황인가** (현재 시장 동향) — 2~3문장  
3. **청소년 창업가에게 어떤 의미인가** (기회와 시사점) — 2~3문장

규칙:
- 어려운 용어는 괄호로 쉽게 설명 예) VC(벤처캐피탈, 스타트업에 투자하는 전문 회사)
- 수치와 구체적 사례 포함
- ~입니다/~했습니다 체
- 마크다운 볼드(**) 헤더 사용
- 전체 300~400자 분량
- 분석 내용만 출력 (앞뒤 설명 없이)`

  try {
    // Gemini 2.0 Flash with Google Search grounding
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],  // 웹 검색 활성화
          generationConfig: {
            maxOutputTokens: 600,
            temperature: 0.4,
          },
        }),
        signal: AbortSignal.timeout(20000),
      }
    )

    if (!r.ok) {
      const err = await r.json()
      // 검색 없이 재시도
      return fallbackAnalysis(prompt)
    }

    const d = await r.json()
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    const groundingChunks = d.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    const sources = groundingChunks.slice(0, 3).map(c => ({
      title: c.web?.title || '',
      url: c.web?.uri || '',
    })).filter(s => s.url)

    if (!text || text.length < 50) return fallbackAnalysis(prompt)

    return new Response(JSON.stringify({
      analysis: text,
      sources,
      model: 'gemini-2.0-flash+search',
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600', // 1시간 캐시
      }
    })
  } catch (e) {
    return fallbackAnalysis(prompt)
  }
}

async function fallbackAnalysis(prompt) {
  // 검색 없이 Gemini만 사용
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.4 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      }
    )
    if (!r.ok) throw new Error('Gemini error')
    const d = await r.json()
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return new Response(JSON.stringify({
      analysis: text || '분석을 불러오는 데 실패했습니다.',
      sources: [],
      model: 'gemini-2.0-flash',
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      }
    })
  } catch {
    return new Response(JSON.stringify({ error: 'AI 분석 실패', analysis: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
}
