// 지속 학습: AI 지식베이스에 새 데이터 추가
// 뉴스 요약 완료 후 자동 실행되어 RAG 지식베이스를 갱신
export const config = { runtime: 'edge' }

const GEMINI_KEY  = process.env.GEMINI_API_KEY
const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// 텍스트 임베딩 생성
async function embed(text) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text: text.slice(0, 2000) }] },
        taskType: 'RETRIEVAL_DOCUMENT',
      }),
      signal: AbortSignal.timeout(10000),
    }
  )
  if (!r.ok) return null
  const d = await r.json()
  return d.embedding?.values || null
}

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

    // 임베딩 생성
    const content = `${a.title}\n${a.ai_summary}`
    const embedding = await embed(content)

    const insertR = await fetch(`${SB_URL}/rest/v1/ai_knowledge`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        content,
        embedding: embedding || null,
        category: a.ai_category === 'startup' ? 'trend' : (a.ai_category || 'news'),
        source: `article:${a.id}`,
        keywords: a.tags || [],
        quality: 6, // 뉴스 자동 추가는 6점 (운영자 수동 추가는 9점)
      }),
    })
    if (insertR.ok || insertR.status === 201) added++

    await new Promise(res => setTimeout(res, 300))
  }

  return new Response(JSON.stringify({
    processed: articles.length,
    added,
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
