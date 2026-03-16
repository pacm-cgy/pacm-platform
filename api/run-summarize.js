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
2. 반드시 4~6문장, 200자 이상으로 작성 (짧은 원문이어도 배경·의미를 추가해 풍부하게)
3. 어려운 용어는 괄호로 설명: VC(벤처캐피탈, 스타트업 전문 투자회사), AI(인공지능)
4. 이 뉴스가 창업·스타트업 생태계에 어떤 의미인지 반드시 포함
5. ~입니다/~했습니다/~합니다 체
6. 정리된 내용만 출력 (제목·인사말·번호 없이)`

async function summarizeOne(article) {
  const text = (article.body?.length > 30) ? article.body.slice(0, 2000)
             : (article.excerpt?.length > 20) ? article.excerpt
             : article.title
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: `제목: ${article.title}\n\n내용:\n${text}` }] }],
          generationConfig: { maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 },
          temperature: 0.4 },
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

  const r = await fetch(
    `${SB_URL}/rest/v1/articles?ai_summary=is.null&status=eq.published&select=id,title,body,excerpt&order=published_at.desc&limit=8`,
    { headers: H }
  )
  const articles = await r.json()
  if (!Array.isArray(articles) || !articles.length) {
    return new Response(JSON.stringify({ message: '요약할 뉴스 없음' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  // 병렬 처리
  const summaries = await Promise.allSettled(articles.map(a => summarizeOne(a)))

  let done = 0, failed = 0
  await Promise.allSettled(
    articles.map((a, i) => {
      const s = summaries[i].status === 'fulfilled' ? summaries[i].value : null
      if (!s) { failed++; return Promise.resolve() }
      return fetch(`${SB_URL}/rest/v1/articles?id=eq.${a.id}`, {
        method: 'PATCH',
        headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ ai_summary: s }),
      }).then(r => { if (r.ok || r.status === 204) done++; else failed++ }).catch(() => { failed++ })
    })
  )

  const countR = await fetch(
    `${SB_URL}/rest/v1/articles?ai_summary=is.null&status=eq.published&select=id`,
    { headers: { ...H, 'Range-Unit': 'items', 'Range': '0-0', Prefer: 'count=exact' } }
  )
  const remaining = parseInt(countR.headers.get('content-range')?.split('/')[1] || '0')

  return new Response(JSON.stringify({
    processed: articles.length, done, failed, remaining,
    model: 'gemini-2.5-flash',
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
