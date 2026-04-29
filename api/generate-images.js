// 뉴스 OG 이미지가 없는 기사에 AI 이미지 자동 생성
// Pollinations.ai (완전 무료, API 키 불필요) — 외부 AI API 없음
export const config = { runtime: 'edge' }

const SUPABASE_URL      = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET       = process.env.CRON_SECRET

// 카테고리별 기본 이미지 프롬프트 (외부 AI 없이 직접 매핑)
const CAT_PROMPTS = {
  funding:        'investment, venture capital, money, business growth chart, professional illustration',
  ai:             'artificial intelligence, technology, neural network, digital, futuristic',
  edutech:        'education technology, student learning, digital classroom, bright colors',
  youth:          'young entrepreneur, teenager, startup idea, innovation, inspiring',
  entrepreneurship: 'startup, entrepreneur, business plan, team collaboration',
  unicorn:        'unicorn startup, billion dollar company, success, achievement',
  climate:        'green technology, sustainability, renewable energy, eco-friendly',
  health:         'healthcare technology, digital health, medical innovation, clean design',
  fintech:        'financial technology, digital payment, banking, data visualization',
  news:           'news media, journalism, information, global connection',
  startup:        'startup culture, innovation, young team, office, creative workspace',
  general:        'startup, business, innovation, Korea, modern design',
}

// 제목 키워드 → 프롬프트 향상 매핑
const KEYWORD_ENHANCE = [
  { kw: 'AI',       add: 'artificial intelligence, machine learning, neural network' },
  { kw: '투자',     add: 'investment, funding, financial growth' },
  { kw: '창업',     add: 'startup, entrepreneur, new business launch' },
  { kw: '스타트업', add: 'startup office, young team, innovative workspace' },
  { kw: '청소년',   add: 'young people, youth, teenager, education' },
  { kw: '기술',     add: 'technology, innovation, digital transformation' },
  { kw: '교육',     add: 'education, learning, classroom, knowledge' },
  { kw: '환경',     add: 'green, sustainability, nature, eco technology' },
  { kw: '헬스',     add: 'health, medical, wellness, digital health' },
  { kw: '핀테크',   add: 'fintech, digital payment, banking app' },
]

// 카테고리와 제목 기반으로 이미지 프롬프트 생성 (완전 자체 처리)
function makeImagePrompt(title, category) {
  const base = CAT_PROMPTS[category] || CAT_PROMPTS.general

  // 제목 키워드로 프롬프트 강화
  const enhancements = []
  for (const { kw, add } of KEYWORD_ENHANCE) {
    if (title && title.includes(kw)) {
      enhancements.push(add)
    }
  }

  const enhanced = enhancements.length > 0
    ? `${base}, ${enhancements[0]}`
    : base

  return enhanced
}

// Pollinations.ai로 이미지 URL 생성 (실제 이미지 fetch 없이 URL만 반환)
function makePollinationsUrl(prompt, seed) {
  const encoded = encodeURIComponent(
    prompt + ', professional illustration, no text, clean background, high quality'
  )
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
      // 완전 자체 처리 — 외부 AI API 없음
      const prompt   = makeImagePrompt(article.title, article.ai_category)
      const seed     = parseInt(article.id.replace(/-/g, '').slice(0, 8), 16) % 99999
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

  return new Response(JSON.stringify({
    ...results,
    model:     'insightship-ai-v1-pollinations',
    timestamp: new Date().toISOString(),
  }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
