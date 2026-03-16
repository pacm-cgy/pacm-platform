// 뉴스 OG 이미지가 없는 기사에 AI 이미지 자동 생성
// Pollinations.ai (완전 무료, API 키 불필요)
export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY = process.env.GEMINI_API_KEY
const CRON_SECRET = process.env.CRON_SECRET

// Gemini로 이미지 프롬프트 생성 (한 → 영)
async function makeImagePrompt(title, category) {
  const catPrompts = {
    funding: 'investment, venture capital, money, business growth chart',
    ai: 'artificial intelligence, technology, neural network, digital',
    edutech: 'education technology, student learning, digital classroom',
    youth: 'young entrepreneur, teenager, startup idea, innovation',
    entrepreneurship: 'startup, entrepreneur, business plan, team',
    unicorn: 'unicorn startup, billion dollar company, success',
    climate: 'green technology, sustainability, renewable energy',
    health: 'healthcare technology, digital health, medical innovation',
    fintech: 'financial technology, digital payment, banking',
    general: 'startup, business, innovation, Korea',
  }

  const base = catPrompts[category] || catPrompts.general

  if (GEMINI_KEY && title) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Convert this Korean news title to a 10-word English image prompt for a modern business/tech illustration. No text in image. Reply ONLY with the prompt:\n\n"${title}"` }] }],
            generationConfig: { maxOutputTokens: 50, temperature: 0.4 },
          }),
          signal: AbortSignal.timeout(8000),
        }
      )
      if (r.ok) {
        const d = await r.json()
        const prompt = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (prompt && prompt.length > 5) return prompt
      }
    } catch { /* 폴백 */ }
  }

  return base
}

// Pollinations.ai로 이미지 URL 생성 (실제 이미지 fetch 없이 URL만 반환)
function makePollinationsUrl(prompt, seed) {
  const encoded = encodeURIComponent(prompt + ', professional illustration, no text, clean background')
  return `https://image.pollinations.ai/prompt/${encoded}?width=800&height=450&seed=${seed}&nologo=true&model=flux`
}

export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === `Bearer ${CRON_SECRET}`
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  // 이미지 없는 기사 가져오기 (최대 10개)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&cover_image=is.null&ai_summary=not.is.null&select=id,title,ai_category&order=published_at.desc&limit=10`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  )
  const articles = await res.json()
  if (!articles?.length) return new Response(JSON.stringify({ message: '처리할 기사 없음' }), { status: 200 })

  const results = { updated: 0, errors: [] }

  for (const article of articles) {
    try {
      const prompt = await makeImagePrompt(article.title, article.ai_category)
      const seed = parseInt(article.id.replace(/-/g, '').slice(0, 8), 16) % 99999
      const imageUrl = makePollinationsUrl(prompt, seed)

      const r = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${article.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({ cover_image: imageUrl }),
      })
      if (r.status === 204) results.updated++
    } catch (e) {
      results.errors.push(article.id.slice(0, 8) + ': ' + (e.message || '').slice(0, 40))
    }
  }

  return new Response(JSON.stringify({ ...results, timestamp: new Date().toISOString() }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
