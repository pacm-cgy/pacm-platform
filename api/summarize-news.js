// AI 뉴스 요약 + 분류 + 중복 제거
// Gemini API (무료) → 규칙 기반 폴백
export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY = process.env.GEMINI_API_KEY
const CRON_SECRET = process.env.CRON_SECRET

// ── 카테고리 키워드 맵 ────────────────────────────────────────
const CAT_KEYWORDS = {
  funding:          ['투자', 'vc', '펀딩', '시리즈', 'ipo', '상장', '유치', '라운드', '억원'],
  unicorn:          ['유니콘', '데카콘', '기업가치'],
  ai:               ['ai', '인공지능', '머신러닝', '딥러닝', 'llm', '생성형', '챗봇'],
  edutech:          ['에듀테크', '교육', '학습', '강의', '튜터', '이러닝'],
  youth:            ['청소년', '청년', '학생', '고등학생', '중학생', '대학생', '청년창업'],
  entrepreneurship: ['창업', '스타트업', '창업자', '대표', '사업', '벤처'],
  climate:          ['기후', '친환경', '그린', 'esg', '탄소', '재생에너지', '기후테크'],
  health:           ['헬스케어', '의료', '바이오', '디지털헬스', '원격진료'],
  fintech:          ['핀테크', '금융', '페이', '블록체인'],
}

function detectCategory(text) {
  const lower = (text || '').toLowerCase()
  let best = 'general', bestScore = 0
  for (const [cat, kws] of Object.entries(CAT_KEYWORDS)) {
    const score = kws.filter(k => lower.includes(k)).length
    if (score > bestScore) { bestScore = score; best = cat }
  }
  return best
}

// ── 규칙 기반 폴백 요약 ────────────────────────────────────────
function smartSummarize(title, excerpt) {
  const clean = (s) => (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[단독\]|\[속보\]|\[긴급\]|\[종합\]|\[인터뷰\]/g, '')
    .replace(/기자\s*[:=]\s*[^\s]+/g, '')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ').trim()

  const text = clean(excerpt || '')
  if (!text) return clean(title).slice(0, 400)

  const sentences = text.split(/(?<=[.!?])\s+|(?<=다[.。])\s+|(?<=요[.。])\s+/)
    .map(s => s.trim()).filter(s => s.length > 15 && s.length < 300)

  if (!sentences.length) return text.slice(0, 400)

  const titleWords = (title || '').replace(/[^\w가-힣]/g, ' ')
    .split(/\s+/).filter(w => w.length > 2)

  const importantKws = ['창업', '스타트업', '투자', '청소년', '청년', 'ai', '인공지능',
    '성장', '지원', '개발', '서비스', '플랫폼', '기업', '억원']
  const badPatterns = ['기자', '취재', '편집', '구독', '클릭', '더보기', '관련기사']

  const scored = sentences.map((s, i) => {
    const sl = s.toLowerCase()
    let score = 0
    titleWords.forEach(w => { if (sl.includes(w.toLowerCase())) score += 3 })
    importantKws.forEach(k => { if (sl.includes(k)) score += 1 })
    if (/\d+/.test(s)) score += 1
    if (s.length < 20) score -= 2
    badPatterns.forEach(p => { if (s.includes(p)) score -= 3 })
    return { score, i, s }
  })

  const top = scored.sort((a, b) => b.score - a.score)
    .slice(0, 4).sort((a, b) => a.i - b.i)
    .map(x => x.s)

  return top.join(' ').slice(0, 450) || text.slice(0, 400)
}

// ── Gemini API ────────────────────────────────────────────────
async function callGemini(prompt) {
  if (!GEMINI_KEY) return null
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.35 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          ]
        }),
        signal: AbortSignal.timeout(15000),
      }
    )
    if (!r.ok) return null
    const d = await r.json()
    return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
  } catch { return null }
}

async function summarizeArticle(article) {
  const { title = '', excerpt = '' } = article
  const cleanExcerpt = (excerpt || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[단독\]|\[속보\]|\[긴급\]|\[종합\]/g, '')
    .replace(/기자\s*[:=]\s*\S+/g, '')
    .replace(/\s+/g, ' ').trim()
    .slice(0, 600)

  if (GEMINI_KEY) {
    const prompt = `당신은 청소년 창업 플랫폼 'Insightship'의 뉴스 에디터입니다.
아래 뉴스 기사를 창업에 관심 있는 청소년(중·고등학생)을 위해 정리해주세요.

[정리 방식]
- 단순 요약이 아니라 "기사 내용 정리" 느낌으로 써주세요
- 4~5문장 분량 (너무 짧게 줄이지 말 것)
- 핵심 내용을 빠뜨리지 않되 쉽게 풀어서 설명
- 어려운 경제·금융·창업 용어는 반드시 괄호로 설명
  예) 시리즈B(성장 단계 투자), IPO(주식시장 상장), VC(벤처캐피탈, 스타트업 투자 전문 회사)
- 수치(금액, 퍼센트, 인원 등)는 반드시 포함
- "~입니다", "~했습니다" 체 (신뢰감 있는 친절한 문체)
- 뉴스 기자 이름, 구독 유도 문구, '[단독]' 등 불필요한 표현 제거
- 정리된 내용만 출력 (앞뒤 설명 없이)

제목: ${title}
기사 내용: ${cleanExcerpt}`

    const result = await callGemini(prompt)
    if (result && result.length > 50) return result
  }

  // 폴백: 규칙 기반
  return smartSummarize(title, excerpt)
}

// ── 중복 감지 ─────────────────────────────────────────────────
function isSimilar(t1, t2) {
  const words = t => new Set((t || '').replace(/[^\w가-힣]/g, ' ').split(/\s+/).filter(w => w.length > 2))
  const w1 = words(t1), w2 = words(t2)
  if (!w1.size) return false
  const common = [...w1].filter(w => w2.has(w)).length
  return common / Math.max(w1.size, w2.size) > 0.55
}

export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  // 미처리 뉴스 (최대 20개)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&ai_summary=is.null&select=id,title,excerpt,source_name&order=published_at.desc&limit=20`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY } }
  )
  const articles = await res.json()
  if (!articles?.length) return new Response(JSON.stringify({ message: '처리할 기사 없음' }), { status: 200 })

  // 이미 처리된 제목 목록 (중복 감지용)
  const doneRes = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&ai_summary=not.is.null&select=title&order=published_at.desc&limit=100`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY } }
  )
  const doneTitles = (await doneRes.json()).map(a => a.title)

  const results = { summarized: 0, duplicates: 0, ai_used: !!GEMINI_KEY, errors: [] }

  for (const article of articles) {
    try {
      // 중복 체크
      if (doneTitles.some(t => isSimilar(article.title, t))) {
        await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${article.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({ ai_summary: '(중복)' }),
        })
        results.duplicates++
        continue
      }

      const summary = await summarizeArticle(article)
      const category = detectCategory(article.title + ' ' + (article.excerpt || ''))

      await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${article.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          ai_summary: summary,
          ai_category: category,
          excerpt: summary.slice(0, 450),
        }),
      })

      results.summarized++
      doneTitles.push(article.title)
    } catch (e) {
      results.errors.push(article.id.slice(0, 8) + ': ' + (e.message || '').slice(0, 50))
    }
  }

  return new Response(JSON.stringify({ ...results, timestamp: new Date().toISOString() }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
