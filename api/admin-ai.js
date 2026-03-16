// 어드민 AI 작성 보조 API
export const config = { runtime: 'edge' }

const GEMINI_KEY = process.env.GEMINI_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req) {
  // 인증 확인 (Supabase JWT)
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const url = new URL(req.url)
  const prompt = url.searchParams.get('prompt') || ''
  const context = url.searchParams.get('context') || ''

  if (!prompt) return new Response(JSON.stringify({ error: '프롬프트 필요' }), { status: 400 })
  if (!GEMINI_KEY) return new Response(JSON.stringify({ error: 'GEMINI_API_KEY 없음' }), { status: 500 })

  // 최근 뉴스 컨텍스트 가져오기
  const newsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&ai_summary=not.is.null&select=title,ai_summary,ai_category&order=published_at.desc&limit=15`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  ).catch(() => null)
  const recentNews = newsRes?.ok ? await newsRes.json() : []

  const newsContext = recentNews.length > 0
    ? '\n\n최근 뉴스:\n' + recentNews.map((n, i) => `${i+1}. ${n.title}: ${(n.ai_summary||'').slice(0,100)}`).join('\n')
    : ''

  const systemPrompt = `당신은 Insightship 청소년 창업 플랫폼의 전문 콘텐츠 분석 AI입니다.
운영자가 아티클 작성 시 시장 동향, 데이터, 인사이트를 제공합니다.

규칙:
- 사실 기반, 수치 포함, 추측 금지
- 청소년도 이해할 수 있는 명확한 문체
- 어려운 용어는 괄호로 설명
- 한국어로 작성${newsContext}`

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + '\n\n요청: ' + prompt }] }],
          generationConfig: { maxOutputTokens: 800, temperature: 0.4 },
        }),
        signal: AbortSignal.timeout(30000),
      }
    )
    if (!r.ok) throw new Error('Gemini ' + r.status)
    const d = await r.json()
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return new Response(JSON.stringify({ result: text }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, result: '현재 AI 분석을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.' }), { status: 200 })
  }
}
