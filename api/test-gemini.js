export const config = { runtime: 'edge' }
const GEMINI_KEY = process.env.GEMINI_API_KEY

export default async function handler(req) {
  if (!GEMINI_KEY) return new Response(JSON.stringify({ error: 'NO_GEMINI_KEY' }), { status: 500 })
  
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: '안녕하세요 테스트. 한 문장으로 답해주세요.' }] }],
          generationConfig: { maxOutputTokens: 50, temperature: 0.3 },
        }),
        signal: AbortSignal.timeout(10000),
      }
    )
    const status = r.status
    const body = await r.text()
    return new Response(JSON.stringify({ gemini_status: status, body: body.slice(0, 300) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
}
