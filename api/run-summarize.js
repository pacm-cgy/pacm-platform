// 뉴스 AI 요약 - 8개 병렬 처리 (Edge 25초 제한 내 완료)
export const config = { runtime: 'edge' }

const GEMINI_KEY  = process.env.GEMINI_API_KEY
const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const SYSTEM = `당신은 청소년 창업 플랫폼 'Insightship'의 뉴스 에디터입니다.
전문성: 경제·비즈니스 기자 출신, VC 심사역, 청소년 창업 교육 전문가

뉴스 정리 규칙:
1. 청소년(중·고등학생) 창업가가 이해할 수 있게 충분히 풀어서 설명
2. 글자수: 반드시 500~800자 (짧은 원문이어도 배경·의미를 추가해 풍부하게)
3. 어려운 용어는 괄호로 설명: VC(벤처캐피탈, 스타트업 전문 투자회사)
4. 이 뉴스가 창업·스타트업 생태계에 어떤 의미인지 반드시 포함
5. ~입니다/~했습니다/~합니다 체
6. 반드시 완전한 문장으로 마무리 (끊기지 않게)
7. 제목·인사말·번호 없이 바로 내용 시작`

async function summarizeOne(article) {
  // body가 충분히 길면(크롤링된 원문) 우선 사용, 짧으면 excerpt/title 사용
  const text = article.body && article.body.length > 200
    ? article.body.slice(0, 3000)
    : article.excerpt && article.excerpt.length > 50
    ? article.excerpt
    : article.title

  const userMsg = `다음 뉴스를 청소년 창업가를 위해 정리하세요.
반드시 500~800자로 완전한 문장으로 마무리하세요.

제목: ${article.title}
내용: ${text}`

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: userMsg }] }],
          generationConfig: {
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingBudget: 0 },
            temperature: 0.4
          },
        }),
        signal: AbortSignal.timeout(12000),
      }
    )
    if (!r.ok) return null
    const d = await r.json()
    return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
  } catch { return null }
}

export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }

  // ai_summary가 없거나 200자 미만인 뉴스 8개 처리
  const r = await fetch(
    `${SB_URL}/rest/v1/articles?status=eq.published&category=eq.news&or=(ai_summary.is.null,ai_summary.lte.%22%22)&select=id,title,body,excerpt&order=published_at.desc&limit=8`,
    { headers: H }
  )
  let articles = await r.json()

  // null인 것 없으면 짧은 것(200자 미만) 처리
  if (!Array.isArray(articles) || !articles.length) {
    const r2 = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&category=eq.news&ai_summary=not.is.null&select=id,title,body,excerpt,ai_summary&order=published_at.desc&limit=200`,
      { headers: H }
    )
    const all = await r2.json()
    articles = (Array.isArray(all) ? all : [])
      .filter(a => (a.ai_summary?.length || 0) < 200)
      .slice(0, 8)
  }

  if (!Array.isArray(articles) || !articles.length) {
    return new Response(JSON.stringify({ message: '처리할 뉴스 없음', done: 0 }), { status: 200 })
  }

  // 병렬 요약
  const summaries = await Promise.allSettled(articles.map(a => summarizeOne(a)))

  let done = 0, failed = 0
  await Promise.allSettled(articles.map(async (a, i) => {
    const s = summaries[i].status === 'fulfilled' ? summaries[i].value : null
    if (!s || s.length < 100) { failed++; return }
    const u = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${a.id}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ai_summary: s }),
    })
    if (u.ok || u.status === 204) done++; else failed++
  }))

  // 남은 수 (null + 200자 미만)
  const cr = await fetch(
    `${SB_URL}/rest/v1/articles?status=eq.published&category=eq.news&ai_summary=is.null&select=id&limit=1`,
    { headers: { ...H, Prefer: 'count=exact' } }
  )
  const nullCount = parseInt(cr.headers.get('content-range')?.split('/')[1] || '0')

  return new Response(JSON.stringify({
    done, failed, processed: articles.length,
    remaining: nullCount,
    model: 'gemini-2.5-flash',
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
