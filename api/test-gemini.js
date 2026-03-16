export const config = { runtime: 'edge' }
const GEMINI_KEY = process.env.GEMINI_API_KEY

export default async function handler(req) {
  const results = { key_prefix: GEMINI_KEY?.slice(0,12) + '...' }

  // 실제 생성 테스트
  const candidates = ['gemini-2.5-pro', 'gemini-2.5-flash']
  results.tests = {}

  for (const model of candidates) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: '안녕하세요, 한 문장으로만 답해주세요.' }] }],
            generationConfig: { maxOutputTokens: 30 },
          }),
          signal: AbortSignal.timeout(15000),
        }
      )
      const d = await r.json()
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      results.tests[model] = { status: r.status, ok: r.status === 200, text: text?.slice(0, 60), error: d.error?.message?.slice(0, 80) }
    } catch(e) {
      results.tests[model] = { error: e.message?.slice(0, 60) }
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
}
