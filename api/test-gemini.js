export const config = { runtime: 'edge' }
const GEMINI_KEY = process.env.GEMINI_API_KEY

export default async function handler(req) {
  const results = { key_prefix: GEMINI_KEY?.slice(0,12) + '...' }

  // 사용 가능한 모델 목록 조회
  try {
    const listR = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    )
    const listD = await listR.json()
    results.available_models = listD.models
      ?.filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      ?.map(m => m.name.replace('models/', ''))
      ?.slice(0, 20) || []
    results.list_status = listR.status
  } catch(e) { results.list_error = e.message }

  // 실제 생성 테스트 - 각 후보 모델
  const candidates = [
    'gemini-2.5-pro-exp-03-25',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro-latest',
  ]

  results.generation_tests = {}
  for (const model of candidates) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: '1+1=' }] }],
            generationConfig: { maxOutputTokens: 10 },
          }),
          signal: AbortSignal.timeout(10000),
        }
      )
      const d = await r.json()
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      results.generation_tests[model] = { status: r.status, ok: r.status === 200, text }
      if (r.status === 200) break // 첫 성공 모델 찾으면 중단
    } catch(e) {
      results.generation_tests[model] = { error: e.message?.slice(0,40) }
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
}
