// 뉴스 AI 요약 - Gemini 2.0 Flash (일 1500회 무료, 빠름)
// 청소년 맞춤 전문가 프롬프트 + RAG 없이 (뉴스는 속도 우선)
export const config = { runtime: 'edge' }

const GEMINI_KEY  = process.env.GEMINI_API_KEY
const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const SUMMARIZE_SYSTEM = `당신은 청소년 창업 플랫폼 'Insightship'의 뉴스 에디터입니다.
전문성: 경제·비즈니스 기자 출신, 청소년 교육 전문가

뉴스 요약 규칙:
1. 4~5문장으로 핵심을 완결되게 정리
2. 청소년(중·고등학생)이 이해할 수 있는 언어 사용
3. 어려운 용어는 반드시 괄호로 설명 예) IPO(기업공개, 주식시장 상장), VC(벤처캐피탈)
4. 구체적 수치(금액, %, 기업명)는 반드시 포함
5. 이 뉴스가 창업/스타트업 생태계에 어떤 의미인지 마지막 문장에 포함
6. ~입니다/~했습니다/~합니다 체
7. 요약문만 출력 (제목, 설명 없이)`

async function summarizeOne(title, content) {
  const prompt = `다음 뉴스 기사를 청소년 창업가가 이해하기 쉽게 정리해주세요.\n\n제목: ${title}\n\n내용:\n${body?.slice(0, 3000) || ''}`
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SUMMARIZE_SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(15000),
    }
  )
  if (!r.ok) throw new Error(`${r.status}`)
  const d = await r.json()
  return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
}

export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }

  // 요약 안 된 최근 뉴스 가져오기
  const r = await fetch(
    `${SB_URL}/rest/v1/articles?ai_summary=is.null&status=eq.published&select=id,title,body,source_name&order=published_at.desc&limit=40`,
    { headers: H }
  )
  const articles = await r.json()
  if (!articles?.length) return new Response(JSON.stringify({ message: '요약할 뉴스 없음' }), { status: 200 })

  let done = 0, failed = 0

  for (const a of articles) {
    try {
      const summary = await summarizeOne(a.title, a.body)
      if (!summary) { failed++; continue }

      const upR = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${a.id}`, {
        method: 'PATCH',
        headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ ai_summary: summary }),
      })
      if (upR.ok) done++; else failed++

      // 속도 제한 방지
      await new Promise(res => setTimeout(res, 500))
    } catch { failed++ }
  }

  return new Response(JSON.stringify({
    total: articles.length, done, failed,
    model: 'gemini-2.5-flash',
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
