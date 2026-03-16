// 요약 품질 테스트
export const config = { runtime: 'edge' }
const GEMINI_KEY = process.env.GEMINI_API_KEY
const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const SYSTEM = `당신은 청소년 창업 플랫폼 'Insightship'의 뉴스 에디터입니다.
전문성: 경제·비즈니스 기자 출신, VC 심사역, 청소년 창업 교육 전문가

뉴스 정리 규칙:
1. 청소년 창업가가 이해하기 쉽게 충분히 설명 (반드시 4~6문장, 200자 이상)
2. 짧은 원문이어도 배경 지식·맥락·의미를 추가해서 풍부하게 작성
3. 어려운 용어는 괄호로 설명: VC(벤처캐피탈, 스타트업 전문 투자회사)
4. 이 뉴스가 창업/스타트업 생태계에 어떤 의미인지 반드시 포함
5. ~입니다/~했습니다/~합니다 체
6. 정리된 내용만 출력 (제목·인사말·번호 없이)`

export default async function handler(req) {
  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }

  // 최신 뉴스 1개 가져와서 테스트
  const r = await fetch(`${SB_URL}/rest/v1/articles?status=eq.published&select=id,title,body,excerpt&order=published_at.desc&limit=1`, { headers: H })
  const [article] = await r.json()
  const text = article.body?.slice(0, 2000) || article.excerpt || article.title

  const gr = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: `제목: ${article.title}\n\n내용:\n${text}` }] }],
        generationConfig: { maxOutputTokens: 700, temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(15000),
    }
  )
  const gd = await gr.json()
  const summary = gd.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

  return new Response(JSON.stringify({
    article_title: article.title,
    body_len: article.body?.length || 0,
    summary_len: summary?.length || 0,
    summary,
    gemini_status: gr.status,
    error: gd.error?.message,
  }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}
