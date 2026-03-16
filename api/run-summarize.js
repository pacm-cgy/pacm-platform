// 뉴스 AI 요약 실행 (버그 수정본 - excerpt/body 모두 지원)
export const config = { runtime: 'edge' }

const GEMINI_KEY  = process.env.GEMINI_API_KEY
const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const SYSTEM = `당신은 청소년 창업 플랫폼 'Insightship'의 뉴스 에디터입니다.
전문성: 경제·비즈니스 기자 출신, VC 심사역 경력, 청소년 창업 교육 전문가

뉴스 정리 규칙:
1. 원문의 핵심 내용을 충실히 담되 청소년(중·고등학생)이 이해할 수 있는 언어로 재구성
2. 중요한 내용은 모두 포함해서 충분히 설명 (최소 5문장 이상)
3. 어려운 용어는 반드시 괄호로 설명: VC(벤처캐피탈, 스타트업 전문 투자회사), IPO(기업공개)
4. 구체적 수치(금액, %, 기업명, 날짜)는 원문 그대로 포함
5. 이 뉴스가 창업/스타트업 생태계에 어떤 의미인지 자연스럽게 설명
6. ~입니다/~했습니다/~합니다 체
7. 정리된 내용만 출력 (제목, 인사말 없이)`

async function summarize(title, text) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: `제목: ${title}\n\n내용:\n${text}` }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(20000),
    }
  )
  if (!r.ok) throw new Error(r.status + '')
  const d = await r.json()
  return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
}

export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }

  // ai_summary 없는 published 뉴스 가져오기 (body + excerpt 모두 select)
  const r = await fetch(
    `${SB_URL}/rest/v1/articles?ai_summary=is.null&status=eq.published&select=id,title,body,excerpt&order=published_at.desc&limit=40`,
    { headers: H }
  )
  const articles = await r.json()
  if (!Array.isArray(articles) || !articles.length) {
    return new Response(JSON.stringify({ message: '요약할 뉴스 없음' }), { status: 200 })
  }

  let done = 0, failed = 0, skipped = 0

  for (const a of articles) {
    // body 우선, 없으면 excerpt 사용
    const text = (a.body && a.body.length > 30) ? a.body.slice(0, 3000)
               : (a.excerpt && a.excerpt.length > 20) ? a.excerpt.slice(0, 1000)
               : null

    if (!text) { skipped++; continue }

    try {
      const summary = await summarize(a.title, text)
      if (!summary) { failed++; continue }

      const upR = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${a.id}`, {
        method: 'PATCH',
        headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ ai_summary: summary }),
      })
      if (upR.ok || upR.status === 204) done++; else failed++

      await new Promise(res => setTimeout(res, 200))
    } catch { failed++ }
  }

  return new Response(JSON.stringify({
    total: articles.length, done, failed, skipped,
    model: 'gemini-2.5-flash',
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
