// 지속 학습: AI 지식베이스에 새 데이터 추가
// 뉴스 요약 완료 후 자동 실행되어 RAG 지식베이스를 갱신
// 임베딩 없이 텍스트 기반 지식 저장 (외부 API 없음)
export const config = { runtime: 'edge' }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }

  // 최근 3일치 요약된 뉴스 중 아직 지식베이스에 없는 것
  const since = new Date(Date.now() - 3 * 86400000).toISOString()
  const r = await fetch(
    `${SB_URL}/rest/v1/articles?ai_summary=not.is.null&published_at=gte.${since}&select=id,title,ai_summary,ai_category,tags,source_name&order=published_at.desc&limit=20`,
    { headers: H }
  )
  const articles = await r.json()
  if (!articles?.length) return new Response(JSON.stringify({ message: '추가할 기사 없음' }), { status: 200 })

  let added = 0

  for (const a of articles) {
    if (!a.ai_summary || a.ai_summary.length < 50) continue

    // 이미 있는지 확인 (source로 중복 방지)
    const exists = await fetch(
      `${SB_URL}/rest/v1/ai_knowledge?source=eq.article:${a.id}&limit=1`,
      { headers: H }
    )
    const ex = await exists.json()
    if (ex?.length > 0) continue

    const content = `${a.title}\n${a.ai_summary}`

    // 임베딩 없이 텍스트 기반으로 저장 (자체 RAG용 텍스트 검색 활용)
    const insertR = await fetch(`${SB_URL}/rest/v1/ai_knowledge`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        content,
        embedding: null,   // 임베딩 비활성화 (외부 API 없음)
        category:  a.ai_category === 'startup' ? 'trend' : (a.ai_category || 'news'),
        source:    `article:${a.id}`,
        keywords:  a.tags || [],
        quality:   6,      // 뉴스 자동 추가는 6점 (운영자 수동 추가는 9점)
      }),
    })
    if (insertR.ok || insertR.status === 201) added++

    await new Promise(res => setTimeout(res, 200))
  }

  return new Response(JSON.stringify({
    processed:  articles.length,
    added,
    model:      'insightship-ai-v1-no-embedding',
    timestamp:  new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
