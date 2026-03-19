// 뉴스 AI 요약 - 50개 병렬 처리 (Edge 25초 제한 최대 활용)
export const config = { runtime: 'edge' }

const GEMINI_KEY  = process.env.GEMINI_API_KEY
const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const SYSTEM = `Insightship 뉴스 에디터. 800~1000자 요약. 핵심 팩트로 시작. ~입니다/했습니다 체. 어려운 용어 괄호 설명. 마지막 문장은 마침표로 끝낼 것. 인사말 절대 금지.`

async function summarizeOne(article) {
  const text = article.body?.length > 200
    ? article.body.slice(0, 1500)
    : article.excerpt?.length > 30
    ? article.excerpt
    : article.title

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text:
            `제목: ${article.title}\n본문: ${text}\n\n800~1000자로 요약. 핵심 팩트로 바로 시작.`
          }] }],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.2,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!r.ok) return null
    const d = await r.json()
    let txt = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
    if (!txt || txt.length < 100) return null
    // 인사말 제거
    const greets = ['안녕하세요', '반갑습니다', '여러분,', '여러분!']
    if (greets.some(g => txt.startsWith(g))) {
      const dotIdx = txt.indexOf('. ')
      if (dotIdx > 0 && dotIdx < 80) txt = txt.slice(dotIdx + 2).trim()
    }
    // 끊김 처리 - 마침표로 끝나지 않으면 마지막 마침표까지 자르기
    if (!txt.endsWith('.')) {
      const lastDot = txt.lastIndexOf('.')
      if (lastDot > txt.length * 0.6) txt = txt.slice(0, lastDot + 1).trim()
      else return null
    }
    return txt
  } catch { return null }
}

export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === `Bearer ${CRON_SECRET}`
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

  // null 요약 50개 가져오기
  const r = await fetch(
    `${SB_URL}/rest/v1/articles?status=eq.published&category=eq.news&ai_summary=is.null&select=id,title,body,excerpt&order=published_at.desc&limit=50`,
    { headers: H }
  )
  let articles = await r.json()

  if (!Array.isArray(articles) || !articles.length) {
    // null 없으면 짧은 것(200자 미만) 처리
    const r2 = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&category=eq.news&ai_summary=not.is.null&select=id,title,body,excerpt,ai_summary&order=published_at.desc&limit=300`,
      { headers: H }
    )
    const all = await r2.json()
    articles = (Array.isArray(all) ? all : [])
      .filter(a => (a.ai_summary?.length || 0) < 200)
      .slice(0, 50)
  }

  if (!Array.isArray(articles) || !articles.length) {
    return new Response(JSON.stringify({ message: '처리할 뉴스 없음', done: 0, remaining: 0 }), { status: 200 })
  }

  // 50개 완전 병렬 요약
  const summaries = await Promise.allSettled(articles.map(a => summarizeOne(a)))

  let done = 0, failed = 0
  await Promise.allSettled(articles.map(async (a, i) => {
    const s = summaries[i].status === 'fulfilled' ? summaries[i].value : null
    if (!s) { failed++; return }
    const u = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${a.id}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ai_summary: s }),
    })
    if (u.ok || u.status === 204) done++; else failed++
  }))

  // 남은 null 수
  const cr = await fetch(
    `${SB_URL}/rest/v1/articles?status=eq.published&category=eq.news&ai_summary=is.null&select=id&limit=1`,
    { headers: { ...H, Prefer: 'count=exact' } }
  )
  const remaining = parseInt(cr.headers.get('content-range')?.split('/')[1] || '0')

  return new Response(JSON.stringify({
    done, failed, processed: articles.length, remaining,
    model: 'gemini-2.5-flash', timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
