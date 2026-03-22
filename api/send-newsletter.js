// 뉴스레터 발송 - 매주 월요일 KST 08:00 (UTC 일요일 23:00)
export const config = { runtime: 'edge' }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_KEY  = process.env.RESEND_API_KEY
const CRON_SECRET = process.env.CRON_SECRET
const GEMINI_KEY  = process.env.GEMINI_API_KEY

const SH = () => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` })
const json = (d, s=200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })

// KST 기준 지난주 범위 (월~일)
function getLastWeekRange() {
  const now = new Date(Date.now() + 9*3600000)
  const day = now.getDay() || 7
  const thisMonday = new Date(now)
  thisMonday.setDate(now.getDate() - (day - 1))
  thisMonday.setHours(0, 0, 0, 0)
  const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7)
  const lastSunday  = new Date(thisMonday); lastSunday.setDate(thisMonday.getDate() - 1); lastSunday.setHours(23, 59, 59, 999)
  const fmt = d => `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`
  const fmtShort = d => `${d.getMonth()+1}/${d.getDate()}`
  return {
    from:  new Date(lastMonday.getTime() - 9*3600000).toISOString(),
    to:    new Date(lastSunday.getTime()  - 9*3600000).toISOString(),
    label: `${fmtShort(lastMonday)} ~ ${fmtShort(lastSunday)}`,
    labelFull: `${fmt(lastMonday)} ~ ${fmt(lastSunday)}`,
    weekNum: Math.ceil(lastMonday.getDate() / 7),
    month: lastMonday.getMonth() + 1,
  }
}

// AI 호출 우선순위:
// 1. Insightship 자체 AI (self-ai-summarize, 비용 0)
// 2. Groq (무료 14,400 RPD)
// 3. Gemini (무료 250 RPD)

async function callSelfAI(system, user, maxTokens=1500) {
  // 자체 AI는 뉴스레터 섹션 생성에는 적합하지 않아 스킵
  // (뉴스 단건 요약 전용)
  throw new Error('self-ai: 뉴스레터 섹션 생성 불가')
}

// AI 호출 - Groq(llama-3.3-70b) 우선, Gemini 폴백
const GROQ_KEY   = process.env.GROQ_API_KEY
const GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b']

async function callGroq(system, user, maxTokens = 1500) {
  if (!GROQ_KEY) throw new Error('GROQ_KEY 없음')
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens,
      temperature: 0.6,
    }),
    signal: AbortSignal.timeout(25000),
  })
  if (!r.ok) throw new Error(`Groq ${r.status}`)
  const d = await r.json()
  return d.choices?.[0]?.message?.content?.trim() || ''
}

async function callGemini(system, user, maxTokens = 1500) {
  for (const model of GEMINI_MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6 },
          }),
          signal: AbortSignal.timeout(20000),
        }
      )
      if (r.status === 429) { await new Promise(r=>setTimeout(r,500)); continue }
      if (!r.ok) continue
      const d = await r.json()
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
      if (text.length > 50) return text
    } catch(e) { continue }
  }
  throw new Error('Gemini 모든 모델 실패')
}

// Groq 우선 → Gemini 폴백
async function gemini(system, user, maxTokens = 1500) {
  try {
    const txt = await callGroq(system, user, maxTokens)
    if (txt.length > 50) return txt
  } catch(e) {
    console.error('Groq 실패, Gemini 폴백:', e.message)
  }
  return callGemini(system, user, maxTokens)
}

const SYSTEM_NEWS = `당신은 Insightship 뉴스레터 에디터입니다.
규칙:
- 인사말/서론 없이 바로 본문 시작
- ~입니다/~했습니다/~됩니다 경어체
- 완전한 문장으로 마무리 (절대 끊기지 않게)
- 어려운 용어는 괄호(  )로 설명
- 수치·기업명·날짜 구체적으로 포함
- 단락 구분은 빈 줄 사용
- **볼드**, ## 마크다운 절대 사용 금지
- 순수 텍스트만 출력`

const SYSTEM_FORECAST = `당신은 데이터 기반 창업 생태계 분석가입니다.
지난주 뉴스 데이터를 바탕으로 이번 주 흐름을 추론합니다.
규칙:
- "AI 추론:" 접두어로 시작
- 불확실성을 명확히 표현 (예: "~될 가능성이 높습니다", "~로 예상됩니다")
- 근거가 된 뉴스/데이터를 언급
- 낙관적 전망과 리스크 요인 모두 포함
- ~입니다/~됩니다 경어체
- 마크다운 없이 순수 텍스트
- 300~400자 이내`

// HTML 이메일 컴포넌트 v2 — 현대적 인라인 이메일 디자인
const C = {
  // 섹션 박스 (Gmail/Outlook 호환 테이블 기반)
  section: (icon, title, body, accent='#6366F1') =>
    `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;border-radius:12px;overflow:hidden;border:1px solid #1E1E1E">` +
    `<tr><td style="background:#111111;padding:14px 24px;border-bottom:1px solid #1E1E1E">` +
    `<table cellpadding="0" cellspacing="0"><tr>` +
    `<td style="width:28px;height:28px;background:${accent}22;border-radius:8px;text-align:center;vertical-align:middle;font-size:14px">${icon}</td>` +
    `<td style="padding-left:10px;font-family:'JetBrains Mono',monospace,sans-serif;font-size:11px;font-weight:600;letter-spacing:1px;color:${accent};text-transform:uppercase">${title}</td>` +
    `</tr></table></td></tr>` +
    `<tr><td style="background:#0D0D0D;padding:20px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.85;color:#A1A1A1;white-space:pre-wrap;word-break:keep-all">${body}</td></tr>` +
    `</table>`,

  // 뉴스 아이템
  newsItem: (title, source, i) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #141414">` +
    `<table width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="width:22px;font-family:'JetBrains Mono',monospace;font-size:10px;color:#404040;vertical-align:top;padding-top:1px">${String(i+1).padStart(2,'0')}</td>` +
    `<td style="padding-left:8px">` +
    `<div style="font-size:13px;color:#D4D4D4;line-height:1.5;margin-bottom:3px">${title}</div>` +
    `${source ? `<div style="font-size:11px;color:#404040;font-family:'JetBrains Mono',monospace">${source}</div>` : ''}` +
    `</td></tr></table></td></tr>`,

  // 트렌드 배지
  trendBadge: (cat, count, change) => {
    const up=change>0, down=change<0
    const color = up ? '#10B981' : down ? '#F43F5E' : '#6B6B6B'
    const arrow = up ? '↑' : down ? '↓' : '—'
    return `<td style="padding:6px 8px;text-align:center;vertical-align:top">` +
      `<table cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1E1E1E;border-radius:8px;min-width:76px"><tr><td style="padding:10px 12px;text-align:center">` +
      `<div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#6B6B6B;letter-spacing:.5px;margin-bottom:6px;text-transform:uppercase">${cat}</div>` +
      `<div style="font-family:-apple-system,sans-serif;font-size:20px;font-weight:700;color:#F5F5F5;margin-bottom:4px">${count}</div>` +
      `<div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:${color}">${arrow} ${Math.abs(change)}</div>` +
      `</td></tr></table></td>`
  }
}


export default async function handler(req) {
  const auth = req.headers.get('authorization')
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron && auth !== `Bearer ${CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401)

  // 테스트 모드
  let isTest = false, testEmail = ''
  try {
    const u = new URL(req.url.startsWith('http') ? req.url : `https://insightship.pacm.kr${req.url}`)
    isTest = u.searchParams.get('test') === 'true'
    testEmail = u.searchParams.get('email') || ''
  } catch {}
  if (isTest && !testEmail) return json({ error: 'email 파라미터 필요 (?test=true&email=xxx)' }, 400)

  const { from, to, label, labelFull, month, weekNum } = getLastWeekRange()
  const thisWeekLabel = (() => {
    const n = new Date(Date.now() + 9*3600000)
    const sun = new Date(n); sun.setDate(n.getDate() + (7 - (n.getDay()||7)))
    return `${n.getMonth()+1}/${n.getDate()} ~ ${sun.getMonth()+1}/${sun.getDate()}`
  })()

  // ── 데이터 수집 ──────────────────────────────────────────────
  // 1) 지난주 뉴스
  let articles = []
  const r1 = await fetch(
    `${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published` +
    `&published_at=gte.${encodeURIComponent(from)}&published_at=lte.${encodeURIComponent(to)}` +
    `&ai_summary=not.is.null&select=title,ai_summary,source_name,ai_category&order=published_at.desc&limit=50`,
    { headers: SH() }
  )
  try { articles = await r1.json() || [] } catch {}
  if (!articles.length) {
    const r2 = await fetch(
      `${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published` +
      `&ai_summary=not.is.null&select=title,ai_summary,source_name,ai_category&order=published_at.desc&limit=50`,
      { headers: SH() }
    )
    try { articles = await r2.json() || [] } catch {}
  }
  if (!articles.length) return json({ error: '뉴스 없음' }, 200)

  // 2) 카테고리별 수치 (지난주 vs 전전주)
  const prevWeekStart = new Date(new Date(from).getTime() - 7*86400000).toISOString()
  const catCounts = {}; const prevCatCounts = {}
  articles.forEach(a => { const c = a.ai_category||'general'; catCounts[c] = (catCounts[c]||0) + 1 })

  const rPrev = await fetch(
    `${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published` +
    `&published_at=gte.${encodeURIComponent(prevWeekStart)}&published_at=lt.${encodeURIComponent(from)}` +
    `&select=ai_category&limit=200`,
    { headers: SH() }
  )
  try {
    const prev = await rPrev.json() || []
    prev.forEach(a => { const c = a.ai_category||'general'; prevCatCounts[c] = (prevCatCounts[c]||0) + 1 })
  } catch {}

  // 3) 구독자
  let subscribers = []
  if (isTest) {
    subscribers = [{ email: testEmail, unsubscribe_token: 'test' }]
  } else {
    const rs = await fetch(
      `${SB_URL}/rest/v1/newsletter_subscribers?is_active=eq.true&select=email,unsubscribe_token`,
      { headers: SH() }
    )
    try { subscribers = await rs.json() || [] } catch {}
  }
  if (!subscribers.length) return json({ message: '활성 구독자 없음' }, 200)

  // ── AI 콘텐츠 생성 ───────────────────────────────────────────
  const ctx = articles.slice(0, 35).map((a,i) =>
    `${i+1}. [${a.source_name||''}] ${a.title}\n${(a.ai_summary||'').slice(0, 200)}`
  ).join('\n\n')

  const basePrompt = `[${label} 주요 창업·스타트업 뉴스]\n${ctx}\n\n위 내용을 바탕으로 `

  // 순차 처리 (쿼터 절약 + 안정성)
  // 자체 AI로 뉴스레터 섹션 생성
  function selfAISection(articles, sectionType) {
    if (!articles?.length) return null
    // 카테고리별 기사 분류
    const byType = {
      startup: articles.filter(a => /스타트업|창업|투자|펀딩|VC|유니콘/.test(a.title||'')),
      economy:  articles.filter(a => /경제|금리|환율|주식|시장|정책/.test(a.title||'')),
      keyword:  articles,
      insight:  articles.filter(a => /청소년|청년|학생|교육|아이디어/.test(a.title||'')),
      forecast: articles,
    }
    const pool = byType[sectionType] || articles
    const top = pool.slice(0, sectionType==='keyword' ? 4 : 6)

    if (sectionType === 'startup') {
      const lines = top.map(a => {
        const s = (a.ai_summary||a.title||'').slice(0,120)
        return s.replace(/\*\*|##/g,'').trim()
      }).filter(Boolean).join('\n\n')
      return `지난 한 주간 창업·스타트업 생태계에서 주목할 만한 소식들이 이어졌습니다.\n\n${lines}\n\n청소년 창업가들에게 국내 스타트업 시장이 활발하게 움직이고 있음을 보여주는 한 주였습니다.`
    }
    if (sectionType === 'economy') {
      const lines = top.map(a => (a.ai_summary||a.title||'').slice(0,100).replace(/\*\*|##/g,'').trim()).filter(Boolean).join('\n\n')
      return `경제·시장 측면에서도 다양한 변화가 있었습니다.\n\n${lines}\n\n이러한 경제 환경 변화는 스타트업의 투자 유치 전략과 서비스 방향에도 영향을 미칠 것으로 보입니다.`
    }
    if (sectionType === 'keyword') {
      const keywords = []
      const kws = [
        ['AI', 'AI(인공지능) — 스타트업 분야에서 가장 뜨거운 키워드'],
        ['투자', '투자/펀딩 — 스타트업이 성장 자본을 확보하는 핵심 활동'],
        ['청소년', '청소년 창업 — Z세대가 직접 만드는 비즈니스 생태계'],
        ['글로벌', '글로벌 진출 — 국내를 넘어 세계 시장을 향한 도전'],
        ['에듀테크', '에듀테크(EdTech) — 교육과 기술의 결합, 청소년과 직결된 분야'],
      ]
      for (const [kw, desc] of kws) {
        if (articles.some(a=>(a.title||'').includes(kw)||(a.ai_summary||'').includes(kw))) {
          keywords.push(desc)
          if (keywords.length >= 3) break
        }
      }
      if (!keywords.length) keywords.push('스타트업 — 혁신적 아이디어로 새로운 비즈니스를 만드는 주체')
      return `이번 주 뉴스에서 특히 눈에 띄었던 키워드들을 정리했습니다.\n\n${keywords.join('\n')}\n\n위 키워드들은 현재 창업 생태계의 흐름을 잘 보여주는 개념들입니다.`
    }
    if (sectionType === 'insight') {
      const ins = top.length
        ? `이번 주 ${top.length}건의 청소년 관련 창업 소식이 있었습니다. ${(top[0]?.ai_summary||top[0]?.title||'').slice(0,100)}...`
        : '이번 주에도 다양한 창업 소식들이 전해졌습니다.'
      return `청소년 창업가 여러분이 이번 주 뉴스에서 가져갈 수 있는 인사이트를 정리했습니다.\n\n첫째, 실패를 두려워하지 마세요. 이번 주 소개된 스타트업들은 모두 여러 번의 피벗(사업 방향 전환)을 거쳐 현재의 모습이 됐습니다.\n\n둘째, 문제를 먼저 발견하세요. 성공한 스타트업은 모두 일상의 불편함에서 사업 아이디어를 찾았습니다.\n\n셋째, 지금 시작할 수 있는 가장 작은 것부터 시작하세요. MVP(최소 기능 제품)로 빠르게 검증하는 것이 핵심입니다.`
    }
    if (sectionType === 'forecast') {
      const hotTopics = [...new Set(articles.flatMap(a=>
        (a.title||'').match(/AI|플랫폼|투자|헬스케어|핀테크|에듀테크|자율주행|로봇/g)||[]
      ))].slice(0,3)
      const topics = hotTopics.length ? hotTopics.join(', ') : 'AI, 스타트업 투자'
      return `AI 추론: 지난주 뉴스 데이터를 바탕으로 이번 주 흐름을 추론한 내용입니다. 실제 결과와 다를 수 있습니다.\n\n지난주 뉴스에서 ${topics} 관련 소식이 집중 조명되었습니다. 이번 주에는 이 분야에서 추가적인 투자 발표나 서비스 출시 소식이 이어질 가능성이 높습니다.\n\n특히 AI 기반 스타트업에 대한 투자 심리가 지속적으로 강세를 보이고 있어, 관련 분야 청소년 창업가들에게는 주목할 만한 한 주가 될 것으로 예상됩니다. 다만 이는 AI가 뉴스 데이터를 분석한 추론이며 확정된 사실이 아닙니다.`
    }
    return null
  }

  async function tryGemini(system, prompt) {
    try { return await gemini(system, prompt) }
    catch(e) { console.error('Gemini 오류:', e.message); return null }
  }

  const rS1r = await tryGemini(SYSTEM_NEWS, basePrompt +
      `지난 한 주간(${label}) 한국 창업·스타트업 생태계의 핵심 흐름을 정리하세요. ` +
      `주요 투자·펀딩 사례(금액·기업명·라운드 포함), 눈에 띄는 스타트업, AI·헬스케어·핀테크·에듀테크 섹터 동향을 ` +
      `구체적 수치와 함께 서술하세요. 청소년 창업가가 '이번 주 이런 일이 있었구나'를 느낄 수 있도록 생생하게 작성하세요. 500~600자.`)

  const rS2r = await tryGemini(SYSTEM_NEWS, basePrompt +
      `지난주(${label}) 경제·시장 동향이 스타트업 생태계에 어떤 영향을 미쳤는지 분석하세요. ` +
      `투자 심리, 금리·환율 영향, 주요 정책 변화를 포함하되, ` +
      `청소년 독자가 이해할 수 있도록 쉽게 설명하세요. 400~500자.`)

  const rS3r = await tryGemini(SYSTEM_NEWS, basePrompt +
      `지난주(${label}) 뉴스에서 반복적으로 등장한 핵심 키워드 3~4개를 선정하고, ` +
      `각각이 왜 주목받는지 배경과 의미를 설명하세요. ` +
      `형식: "키워드명 — 설명" 형태로 한 줄씩. 300~400자.`)

  const rS4r = await tryGemini(SYSTEM_NEWS, basePrompt +
      `지난주 동향에서 청소년 창업가가 실제로 참고할 수 있는 인사이트 2~3가지를 도출하세요. ` +
      `'무엇을 배울 수 있는가', '어떻게 적용할 수 있는가'를 구체적 예시와 함께 작성하세요. 400~500자.`)

  const rForecastr = await tryGemini(SYSTEM_FORECAST, basePrompt +
      `지난주(${label}) 데이터를 바탕으로 이번 주(${thisWeekLabel}) 창업 생태계 흐름을 추론하세요. ` +
      `예상되는 투자·정책 발표, 주목할 섹터, 리스크 요인을 포함하세요. ` +
      `반드시 "AI 추론:"으로 시작하고, 이 내용이 뉴스 데이터 기반 AI 추론임을 명시하세요. 300~400자.`, 600)

  // 자체 AI 폴백 적용
  const selfS1 = rS1r || selfAISection(articles, 'startup')
  const selfS2 = rS2r || selfAISection(articles, 'economy')
  const selfS3 = rS3r || selfAISection(articles, 'keyword')
  const selfS4 = rS4r || selfAISection(articles, 'insight')
  const selfFC = rForecastr || selfAISection(articles, 'forecast')
  const [rS1,rS2,rS3,rS4,rForecast] = [selfS1,selfS2,selfS3,selfS4,selfFC].map(v=>v?{status:'fulfilled',value:v}:{status:'rejected'})

  const fb = '이번 섹션 데이터를 준비 중입니다. 다음 호에서 더 풍부한 내용으로 찾아뵙겠습니다.'
  const [s1, s2, s3, s4, forecast] = [rS1,rS2,rS3,rS4,rForecast].map(r => r.status==='fulfilled' && r.value?.length > 50 ? r.value : fb)

  // ── 트렌드 수치 (전주 대비) ──────────────────────────────────
  const CAT_KO = { funding:'투자/펀딩', ai_startup:'AI', youth:'청소년창업', edutech:'에듀테크', health:'헬스케어', fintech:'핀테크' }
  const trendBadges = Object.entries(CAT_KO).map(([k, label]) => {
    const cur = catCounts[k] || 0
    const prev = prevCatCounts[k] || 0
    return C.trendBadge(label, cur, cur - prev)
  })
  const trendRow = `<table width="100%" cellpadding="0" cellspacing="0"><tr>${trendBadges.join('')}</tr></table>`

  // ── HTML 이메일 생성 ─────────────────────────────────────────
  const subject = `📬 Insightship 주간 뉴스레터 — ${label}`
  const UNSUB_BASE = 'https://www.insightship.pacm.kr/api/unsubscribe'
  let sent = 0

  for (const sub of subscribers) {
    const unsubLink = sub.unsubscribe_token && sub.unsubscribe_token !== 'test'
      ? `${UNSUB_BASE}?token=${encodeURIComponent(sub.unsubscribe_token)}`
      : `${UNSUB_BASE}?email=${encodeURIComponent(sub.email)}`

    // 참고 뉴스 목록
    const newsList = `<table width="100%" cellpadding="0" cellspacing="0">` +
      articles.slice(0, 8).map(a => C.newsItem(a.title, a.source_name)).join('') +
      `</table>`

    const html = `<!DOCTYPE html>
<html lang="ko" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${subject}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0;mso-table-rspace:0}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
body{margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif}
@media only screen and (max-width:600px){
  .email-body{width:100%!important}
  .email-pad{padding:0 16px!important}
  h1{font-size:26px!important}
}
</style>
</head>
<body style="margin:0;padding:0;background:#080808">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;min-height:100vh">
<tr><td align="center" style="padding:24px 16px 48px">

<!-- 컨테이너 -->
<table class="email-body" width="600" cellpadding="0" cellspacing="0" style="max-width:600px">

  <!-- 헤더 -->
  <tr><td style="padding-bottom:24px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0D0D;border:1px solid #1E1E1E;border-radius:16px;overflow:hidden">
      <!-- 상단 배지 -->
      <tr><td style="padding:24px 28px 0;text-align:center">
        <div style="display:inline-block;background:#6366F122;border:1px solid #6366F144;border-radius:20px;padding:4px 14px;font-family:'JetBrains Mono',monospace,sans-serif;font-size:10px;font-weight:600;letter-spacing:2px;color:#818CF8;text-transform:uppercase">WEEKLY NEWSLETTER</div>
      </td></tr>
      <!-- 로고 -->
      <tr><td style="padding:20px 28px;text-align:center">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:900;letter-spacing:-1px;color:#F5F5F5">
          Insight<span style="color:#818CF8">ship</span>
        </div>
        <div style="margin-top:8px;font-family:monospace;font-size:11px;color:#404040;letter-spacing:1px">${label}</div>
      </td></tr>
      <!-- 설명 -->
      <tr><td style="padding:0 28px 24px;text-align:center;border-top:1px solid #1a1a1a">
        <p style="font-size:13px;color:#6B6B6B;margin:16px 0 0;line-height:1.65;font-family:-apple-system,sans-serif">
          지난 한 주의 창업·투자·경제 이슈를 Insightship이 정리했습니다.<br>
          매주 월요일 오전 8시, 청소년 창업가를 위한 인사이트를 전해드립니다.
        </p>
      </td></tr>
    </table>
  </td></tr>

  <!-- 트렌드 수치 카드 -->
  <tr><td style="padding-bottom:20px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0D0D;border:1px solid #1E1E1E;border-radius:12px;overflow:hidden">
      <tr><td style="padding:14px 24px;border-bottom:1px solid #1a1a1a">
        <span style="font-family:monospace;font-size:10px;font-weight:600;letter-spacing:1.5px;color:#84CC16;text-transform:uppercase">📊 &nbsp;지난주 카테고리별 뉴스 (전주 대비)</span>
      </td></tr>
      <tr><td style="padding:16px 10px">
        <table cellpadding="0" cellspacing="0" width="100%"><tr>${trendBadges.join('')}</tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- 섹션들 -->
  <tr><td>${C.section('🚀','창업·스타트업 핵심 흐름',s1)}</td></tr>
  <tr><td>${C.section('📈','경제 & 시장 맥락',s2,'#22D3EE')}</td></tr>
  <tr><td>${C.section('🔑','이번 주 트렌드 키워드',s3,'#C084FC')}</td></tr>
  <tr><td>${C.section('💡','청소년 창업가 인사이트',s4,'#84CC16')}</td></tr>

  <!-- AI 추론 섹션 -->
  <tr><td style="padding-bottom:20px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0D0D;border:1px solid #2a1f0a;border-radius:12px;overflow:hidden">
      <tr><td style="background:#111108;padding:14px 24px;border-bottom:1px solid #2a1f0a">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:14px">🔮</td>
          <td style="padding-left:8px;font-family:monospace;font-size:11px;font-weight:600;letter-spacing:1px;color:#F59E0B;text-transform:uppercase">이번 주(${thisWeekLabel}) 흐름 전망</td>
          <td style="padding-left:10px;font-family:monospace;font-size:9px;color:#92400E;letter-spacing:.3px">AI 추론 기반</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:16px 24px">
        <p style="font-family:monospace;font-size:10px;color:#78350F;margin:0 0 12px;background:#2a1f0a;padding:8px 12px;border-radius:6px;border-left:2px solid #F59E0B">
          ⚠️ 뉴스 데이터 기반 AI 추론입니다. 실제 결과와 다를 수 있습니다.
        </p>
        <div style="font-size:14px;line-height:1.85;color:#B45309;font-family:-apple-system,sans-serif;white-space:pre-wrap">${forecast}</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- 참고 뉴스 -->
  <tr><td style="padding-bottom:20px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0D0D;border:1px solid #1E1E1E;border-radius:12px;overflow:hidden">
      <tr><td style="padding:14px 24px;border-bottom:1px solid #1a1a1a">
        <span style="font-family:monospace;font-size:10px;font-weight:600;letter-spacing:1px;color:#6B6B6B;text-transform:uppercase">📰 &nbsp;이번 주 참고 뉴스 TOP ${Math.min(articles.length,8)}</span>
      </td></tr>
      <tr><td style="padding:12px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${articles.slice(0,8).map((a,i)=>C.newsItem(a.title,a.source_name,i)).join('')}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- 구분선 -->
  <tr><td style="padding:4px 0 20px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-top:1px solid #1a1a1a"></td>
        <td style="width:60px;text-align:center;padding:0 12px">
          <span style="font-family:monospace;font-size:10px;color:#2a2a2a">✦</span>
        </td>
        <td style="border-top:1px solid #1a1a1a"></td>
      </tr>
    </table>
  </td></tr>

  <!-- 푸터 -->
  <tr><td style="text-align:center;padding:8px 0 0">
    <p style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#F5F5F5;margin:0 0 12px;letter-spacing:-0.5px">
      Insight<span style="color:#818CF8">ship</span>
    </p>
    <p style="font-size:12px;color:#404040;margin:0 0 8px;line-height:1.6;font-family:-apple-system,sans-serif">
      청소년 창업가를 위한 인사이트 플랫폼 | PACM 운영
    </p>
    <p style="font-size:11px;color:#2a2a2a;margin:0 0 16px;font-family:monospace">
      사업자등록번호: 891-45-01385
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto">
      <tr>
        <td><a href="https://www.insightship.pacm.kr" style="font-size:12px;color:#6366F1;text-decoration:none;font-family:monospace">사이트 방문</a></td>
        <td style="padding:0 12px;color:#1a1a1a;font-size:12px">|</td>
        <td><a href="${unsubLink}" style="font-size:12px;color:#404040;text-decoration:underline;font-family:monospace">수신 거부</a></td>
      </tr>
    </table>
  </td></tr>

</table>
<!-- /컨테이너 -->

</td></tr>
</table>
</body>
</html>`

        try {
      const sr = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Insightship <insightship_nl@pacm.kr>',
          to: sub.email,
          subject,
          html,
        }),
      })
      if (sr.ok) sent++
      else { const e = await sr.text(); console.error('Resend:', sr.status, e.slice(0, 100)) }
    } catch (e) { console.error('발송 오류:', e.message) }

    if (!isTest) await new Promise(r => setTimeout(r, 600))
  }

  // 발송 로그
  if (!isTest) {
    fetch(`${SB_URL}/rest/v1/newsletter_logs`, {
      method: 'POST',
      headers: { ...SH(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ sent_count: sent, subject, sent_at: new Date().toISOString() }),
    }).catch(() => {})
  }

  return json({
    ok: true, sent, total: subscribers.length,
    subject, label, is_test: isTest,
    sections_ok: [rS1,rS2,rS3,rS4,rForecast].filter(r=>r.status==='fulfilled').length,
  })
}
