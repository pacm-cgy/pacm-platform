// API 연결 테스트
export const config = { runtime: 'edge' }

export default async function handler(req) {
  const GEMINI_KEY = process.env.GEMINI_API_KEY
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  const results = {
    anthropic_key_set: !!ANTHROPIC_KEY,
    gemini_key_set: !!GEMINI_KEY,
    gemini_key_prefix: GEMINI_KEY?.slice(0, 12) + '...',
  }

  // Gemini 테스트
  if (GEMINI_KEY) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: '테스트. 한 단어로만 답해줘: 안녕' }] }],
            generationConfig: { maxOutputTokens: 10 },
          }),
          signal: AbortSignal.timeout(10000),
        }
      )
      const body = await r.text()
      const d = JSON.parse(body)
      results.gemini_status = r.status
      results.gemini_ok = r.status === 200
      results.gemini_text = d.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 50)
      results.gemini_error = d.error?.message?.slice(0, 100)
    } catch(e) {
      results.gemini_error = e.message?.slice(0, 100)
    }
  }

  // Claude 테스트
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
          max_tokens: 20,
          messages: [{ role: 'user', content: '안녕' }],
        }),
        signal: AbortSignal.timeout(10000),
      })
      const d = await r.json()
      results.claude_status = r.status
      results.claude_ok = r.status === 200
      results.claude_text = d.content?.[0]?.text?.slice(0, 50)
      results.claude_error = d.error?.message?.slice(0, 100)
    } catch(e) {
      results.claude_error = e.message?.slice(0, 100)
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
}
