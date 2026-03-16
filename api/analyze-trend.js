// 트렌드 "왜 그럴까?" AI 분석
// Claude API (primary) → Gemini (fallback)
export const config = { runtime: 'edge' }

const GEMINI_KEY = process.env.GEMINI_API_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

export default async function handler(req) {
  const { metric_name, metric_value, metric_unit, change_pct, category, source_name } = await req.json().catch(() => ({}))
  if (!metric_name) return new Response(JSON.stringify({ error: 'metric_name required' }), {
    status: 400, headers: corsHeaders()
  })

  const changeDir = (change_pct || 0) > 0 ? '상승' : (change_pct || 0) < 0 ? '하락' : '보합'
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
**왜 이 트렌드가 생겼나**
배경과 원인을 2~3문장으로 설명. 어려운 용어는 괄호로 설명 예) VC(벤처캐피탈)

**지금 어떤 상황인가**
현재 시장 동향을 2~3문장으로. 수치와 구체적 사례 포함.

**청소년 창업가에게 어떤 의미인가**
기회와 시사점을 2~3문장으로. ~입니다/~했습니다 체 사용.

분석 내용만 출력하세요 (앞뒤 설명 없이).`

  // 1. Claude API 시도
  if (ANTHROPIC_KEY) {
    try {
      const result = await callClaude(prompt, ANTHROPIC_KEY)
      if (result) {
        return new Response(JSON.stringify({
          analysis: result,
          sources: [],
          model: 'claude-haiku-4-5',
          timestamp: new Date().toISOString(),
        }), { status: 200, headers: corsHeaders() })
      }
    } catch {}
  }

  // 2. Gemini 폴백
  if (GEMINI_KEY) {
    try {
      const result = await callGemini(prompt, GEMINI_KEY)
      if (result) {
        return new Response(JSON.stringify({
          analysis: result,
          sources: [],
          model: 'gemini-fallback',
          timestamp: new Date().toISOString(),
        }), { status: 200, headers: corsHeaders() })
      }
    } catch {}
  }

  return new Response(JSON.stringify({ error: 'AI 분석 실패', analysis: null }), {
    status: 200, headers: corsHeaders()
  })
}

async function callClaude(prompt, apiKey) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!r.ok) return null
  const d = await r.json()
  return d.content?.[0]?.text?.trim() || null
}

async function callGemini(prompt, apiKey) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 600, temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(15000),
    }
  )
  if (!r.ok) return null
  const d = await r.json()
  return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  }
}
