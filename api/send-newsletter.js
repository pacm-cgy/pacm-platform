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

// Gemini 폴백 체인 (무료): 2.0-flash → 1.5-flash → 1.5-flash-8b
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
]

async function gemini(system, user, maxTokens = 1500) {
  let lastError = null
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
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.6,
            },
          }),
          signal: AbortSignal.timeout(25000),
        }
      )
      // 429 쿼터 초과 시 다음 모델로
      if (r.status === 429) { lastError = new Error(`${model} 쿼터초과`); continue }
      if (!r.ok) { lastError = new Error(`${model} ${r.status}`); continue }
      const d = await r.json()
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
      if (text.length > 50) return text
      lastError = new Error(`${model} 응답 짧음`)
    } catch(e) {
      lastError = e
    }
    // 모델 간 500ms 대기
    await new Promise(r => setTimeout(r, 500))
  }
  throw lastError || new Error('모든 모델 실패')
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

// HTML 이메일 컴포넌트
const C = {
  // 섹션 박스
  section: (icon, title, body, accentColor='#D4AF37') =>
    `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #2a2a28;border-radius:4px;overflow:hidden">` +
    `<tr><td style="background:#13120f;padding:12px 24px;border-bottom:1px solid #2a2a28">` +
    `<span style="font-size:15px;vertical-align:middle">${icon}</span>` +
    `<span style="color:${accentColor};font-weight:700;font-size:12px;letter-spacing:1.5px;font-family:monospace;margin-left:8px;vertical-align:middle">${title}</span>` +
    `</td></tr>` +
    `<tr><td style="background:#0f0e0a;padding:20px 24px;color:#c5c3b8;font-size:14px;line-height:1.95;white-space:pre-wrap;word-break:keep-all">${body}</td></tr>` +
    `</table>`,

  // 구분선
  divider: () => `<div style="border-top:1px solid #1e1e1c;margin:4px 0"></div>`,

  // 뉴스 아이템
  newsItem: (title, source) =>
    `<tr><td style="padding:7px 0;border-bottom:1px solid #1a1a18;font-size:13px;color:#9a9890;line-height:1.5">` +
    `${title}${source ? ` <span style="color:#D4AF3766;font-size:11px">[${source}]</span>` : ''}` +
    `</td></tr>`,

  // 트렌드 뱃지
  trendBadge: (cat, count, change) => {
    const up = change > 0, down = change < 0
    const color = up ? '#34d399' : down ? '#f87171' : '#9ca3af'
    const arrow = up ? '▲' : down ? '▼' : '─'
    return `<td style="padding:6px 10px;text-align:center">` +
      `<div style="background:#13120f;border:1px solid #2a2a28;border-radius:3px;padding:8px 12px;min-width:80px">` +
      `<div style="color:#a8a89e;font-size:10px;font-family:monospace;letter-spacing:0.5px;margin-bottom:4px">${cat}</div>` +
      `<div style="color:#F0EEE8;font-size:16px;font-weight:700">${count}</div>` +
      `<div style="color:${color};font-size:10px;font-family:monospace;margin-top:2px">${arrow} ${Math.abs(change)}건</div>` +
      `</div></td>`
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
  async function tryGemini(system, prompt) {
    try { return await gemini(system, prompt) }
    catch(e) { console.error('Gemini 오류:', e.message); return null }
  }

  const rS1r = await tryGemini(SYSTEM_NEWS, basePrompt +
      `지난 한 주간(${label}) 한국 창업·스타트업 생태계의 핵심 흐름을 정리하세요. ` +
      `주요 투자·펀딩 사례(금액·기업명·라운드 포함), 눈에 띄는 스타트업, AI·헬스케어·핀테크·에듀테크 섹터 동향을 ` +
      `구체적 수치와 함께 서술하세요. 청소년 창업가가 '이번 주 이런 일이 있었구나'를 느낄 수 있도록 생생하게 작성하세요. 500~600자.`),

  const rS2r = await tryGemini(SYSTEM_NEWS, basePrompt +
      `지난주(${label}) 경제·시장 동향이 스타트업 생태계에 어떤 영향을 미쳤는지 분석하세요. ` +
      `투자 심리, 금리·환율 영향, 주요 정책 변화를 포함하되, ` +
      `청소년 독자가 이해할 수 있도록 쉽게 설명하세요. 400~500자.`),

  const rS3r = await tryGemini(SYSTEM_NEWS, basePrompt +
      `지난주(${label}) 뉴스에서 반복적으로 등장한 핵심 키워드 3~4개를 선정하고, ` +
      `각각이 왜 주목받는지 배경과 의미를 설명하세요. ` +
      `형식: "키워드명 — 설명" 형태로 한 줄씩. 300~400자.`),

  const rS4r = await tryGemini(SYSTEM_NEWS, basePrompt +
      `지난주 동향에서 청소년 창업가가 실제로 참고할 수 있는 인사이트 2~3가지를 도출하세요. ` +
      `'무엇을 배울 수 있는가', '어떻게 적용할 수 있는가'를 구체적 예시와 함께 작성하세요. 400~500자.`),

  const rForecastr = await tryGemini(SYSTEM_FORECAST, basePrompt +
      `지난주(${label}) 데이터를 바탕으로 이번 주(${thisWeekLabel}) 창업 생태계 흐름을 추론하세요. ` +
      `예상되는 투자·정책 발표, 주목할 섹터, 리스크 요인을 포함하세요. ` +
      `반드시 "AI 추론:"으로 시작하고, 이 내용이 뉴스 데이터 기반 AI 추론임을 명시하세요. 300~400자.`, 600),
  const [rS1,rS2,rS3,rS4,rForecast] = [rS1r,rS2r,rS3r,rS4r,rForecastr].map(v=>v?{status:'fulfilled',value:v}:{status:'rejected'})

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
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0a0908;font-family:-apple-system,'Noto Sans KR',Arial,sans-serif;color:#c5c3b8">
<div style="max-width:620px;margin:0 auto;padding:16px">

  <!-- 헤더 -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px">
    <tr>
      <td style="background:#111110;border:1px solid #2a2a28;padding:32px;text-align:center;border-radius:4px 4px 0 0">
        <div style="font-size:26px;font-weight:800;letter-spacing:5px;color:#F0EEE8;font-family:monospace">
          INSIGHT<span style="color:#D4AF37">SHIP</span>
        </div>
        <div style="color:#6a6a60;font-size:10px;letter-spacing:3px;font-family:monospace;margin-top:6px">WEEKLY NEWSLETTER</div>
        <div style="margin-top:14px;display:inline-block;background:#1a1a18;border:1px solid #D4AF3755;padding:7px 20px;border-radius:2px">
          <span style="color:#D4AF37;font-size:13px;font-family:monospace;letter-spacing:0.5px">${label} 주간 리뷰</span>
        </div>
      </td>
    </tr>
    <tr>
      <td style="background:#0f0e0a;border:1px solid #2a2a28;border-top:none;padding:14px 32px;text-align:center;border-radius:0 0 4px 4px">
        <p style="color:#888680;font-size:13px;margin:0;line-height:1.7">
          지난 한 주간의 창업·투자·경제 이슈를 Insightship이 정리했습니다.<br>
          매주 월요일 오전 8시, 한 주를 시작하는 인사이트를 전해드립니다.
        </p>
      </td>
    </tr>
  </table>

  <div style="height:16px"></div>

  <!-- 트렌드 수치 (전주 대비) -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #2a2a28;border-radius:4px;overflow:hidden">
    <tr>
      <td style="background:#13120f;padding:11px 24px;border-bottom:1px solid #2a2a28">
        <span style="font-size:14px;vertical-align:middle">📊</span>
        <span style="color:#D4AF37;font-weight:700;font-size:11px;letter-spacing:1.5px;font-family:monospace;margin-left:8px;vertical-align:middle">지난주 카테고리별 뉴스 수 (전주 대비)</span>
      </td>
    </tr>
    <tr><td style="background:#0f0e0a;padding:14px 12px">${trendRow}</td></tr>
  </table>

  <!-- 섹션1: 창업·스타트업 핵심 흐름 -->
  ${C.section('🚀', `지난주(${label}) 창업·스타트업 핵심 흐름`, s1)}

  <!-- 섹션2: 경제 & 시장 맥락 -->
  ${C.section('📈', '경제 & 시장 맥락', s2, '#60a5fa')}

  <!-- 섹션3: 주목할 트렌드 키워드 -->
  ${C.section('🔑', '이번 주 주목할 키워드', s3, '#a78bfa')}

  <!-- 섹션4: 청소년 창업가 인사이트 -->
  ${C.section('💡', '청소년 창업가를 위한 인사이트', s4, '#34d399')}

  <!-- 섹션5: 이번주 흐름 AI 추론 -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #3b2e1a;border-radius:4px;overflow:hidden">
    <tr>
      <td style="background:#1a140a;padding:12px 24px;border-bottom:1px solid #3b2e1a">
        <span style="font-size:14px;vertical-align:middle">🔮</span>
        <span style="color:#f97316;font-weight:700;font-size:11px;letter-spacing:1.5px;font-family:monospace;margin-left:8px;vertical-align:middle">이번 주(${thisWeekLabel}) 흐름 전망</span>
        <span style="color:#9a5a20;font-size:10px;font-family:monospace;margin-left:8px">AI 추론 기반</span>
      </td>
    </tr>
    <tr>
      <td style="background:#100d08;padding:18px 24px">
        <p style="color:#9a8060;font-size:11px;font-family:monospace;margin:0 0 10px 0;letter-spacing:0.3px">
          ⚠️ 아래 내용은 뉴스 데이터를 바탕으로 AI가 추론한 예측입니다. 실제 결과와 다를 수 있습니다.
        </p>
        <div style="color:#c8a07a;font-size:14px;line-height:1.95;white-space:pre-wrap;word-break:keep-all">${forecast}</div>
      </td>
    </tr>
  </table>

  <!-- 참고 뉴스 -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #2a2a28;border-radius:4px;overflow:hidden">
    <tr>
      <td style="background:#13120f;padding:11px 24px;border-bottom:1px solid #2a2a28">
        <span style="color:#6a6a60;font-size:11px;letter-spacing:1.5px;font-family:monospace">📰 이번 주 참고 뉴스 TOP 8</span>
      </td>
    </tr>
    <tr><td style="background:#0f0e0a;padding:12px 24px">${newsList}</td></tr>
  </table>

  <!-- 푸터 -->
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:24px;text-align:center;border-top:1px solid #1e1e1c">
        <a href="https://www.insightship.pacm.kr" style="color:#D4AF37;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:2px;font-family:monospace">
          INSIGHTSHIP
        </a>
        <p style="color:#4a4a48;font-size:11px;margin:10px 0 6px;line-height:1.7">
          청소년 창업가를 위한 인사이트 플랫폼 | PACM 운영<br>
          사업자등록번호: 891-45-01385
        </p>
        <p style="margin:0">
          <a href="https://www.insightship.pacm.kr" style="color:#5a5a58;font-size:11px;text-decoration:none;margin:0 8px">사이트 방문</a>
          <span style="color:#2a2a28">|</span>
          <a href="${unsubLink}" style="color:#5a5a58;font-size:11px;text-decoration:underline;margin:0 8px">수신 거부</a>
        </p>
      </td>
    </tr>
  </table>

</div>
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
