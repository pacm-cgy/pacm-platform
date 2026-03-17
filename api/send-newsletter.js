// AI 뉴스레터 자동 발송 - 매주 월요일 KST 09:00 (UTC 00:00)
// nodejs runtime - 120초 제한
export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const SUPABASE_URL      = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY    = process.env.RESEND_API_KEY
const CRON_SECRET       = process.env.CRON_SECRET
const GEMINI_KEY        = process.env.GEMINI_API_KEY

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  })
}

async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.4,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(20000),
    }
  )
  if (!res.ok) throw new Error(`Gemini ${res.status}`)
  const d = await res.json()
  return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
}

function getKSTDate() {
  const now = new Date()
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function getLastWeekRange() {
  const now = new Date()
  // 이번 주 월요일
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  // 7일 전부터 오늘까지
  const weekAgo = new Date(monday)
  weekAgo.setDate(monday.getDate() - 7)
  return { from: weekAgo.toISOString(), to: now.toISOString() }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  // 인증
  const authHeader = req.headers.get('authorization')
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron && authHeader !== `Bearer ${CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // 파라미터 파싱 (nodejs에서 안전하게)
  let isTest = false, testEmail = ''
  try {
    const rawUrl = req.url || ''
    const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://insightship.pacm.kr${rawUrl}`
    const u = new URL(fullUrl)
    isTest = u.searchParams.get('test') === 'true'
    testEmail = u.searchParams.get('email') || ''
  } catch {}
  if (isTest && !testEmail) return json({ error: 'email 파라미터 필요' }, 400)

  const SH = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  }

  // 지난 1주 뉴스 가져오기
  const { from, to } = getLastWeekRange()
  const newsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?category=eq.news&status=eq.published&is_duplicate=neq.true&published_at=gte.${encodeURIComponent(from)}&published_at=lte.${encodeURIComponent(to)}&ai_summary=not.is.null&select=title,ai_summary,source_name,source_url&order=published_at.desc&limit=20`,
    { headers: SH }
  )
  let articles = []
  try { articles = await newsRes.json() } catch {}

  // 뉴스가 없으면 최근 20개로 대체
  if (!articles?.length) {
    const r2 = await fetch(
      `${SUPABASE_URL}/rest/v1/articles?category=eq.news&status=eq.published&ai_summary=not.is.null&select=title,ai_summary,source_name,source_url&order=published_at.desc&limit=20`,
      { headers: SH }
    )
    try { articles = await r2.json() } catch {}
  }
  if (!articles?.length) return json({ error: '발송할 뉴스 없음' }, 200)

  // 구독자 목록
  let subscribers = []
  if (isTest) {
    subscribers = [{ email: testEmail }]
  } else {
    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/newsletter_subscribers?is_active=eq.true&select=email`,
      { headers: SH }
    )
    try { subscribers = (await subRes.json()) || [] } catch {}
  }
  if (!subscribers?.length) return json({ message: isTest ? '구독자 없음' : '활성 구독자 없음' }, 200)

  const kstDate = getKSTDate()
  let newsletterHtml = ''

  // 테스트 모드: AI 없이 즉시 HTML 생성 (25초 제한)
  // 실제 발송: AI 생성
  if (isTest) {
    newsletterHtml = `<h2 style="font-size:18px;border-bottom:2px solid #D4AF37;padding-bottom:8px">이번 주 주요 창업 뉴스</h2>
${articles.slice(0,8).map(a => `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #eee">
  <h3 style="font-size:14px;margin:0 0 6px;color:#1a1a18">${a.title}</h3>
  <p style="margin:0 0 6px;color:#555;font-size:13px;line-height:1.6">${(a.ai_summary||'').slice(0,200)}</p>
  ${a.source_name ? `<span style="font-size:11px;color:#D4AF37">출처: ${a.source_name}</span>` : ''}
</div>`).join('')}
<div style="background:#f5f3ee;padding:16px;margin-top:20px;border-left:3px solid #D4AF37">
  <strong style="font-size:13px">이번 주 창업 인사이트</strong>
  <p style="margin:8px 0 0;font-size:13px;color:#444">창업은 아이디어보다 실행이 중요합니다. 이번 주 뉴스에서 본 스타트업들처럼, 작은 것부터 시작해 빠르게 테스트해보세요.</p>
</div>`
  } else {
    // 실제 발송: AI로 생성
    const articleList = articles.slice(0, 15).map((a, i) =>
      `${i + 1}. ${a.title}\n   ${(a.ai_summary || '').slice(0, 100)}`
    ).join('\n')
    const prompt = `Insightship 주간 뉴스레터. 청소년(중고생) 독자. 이번 주 뉴스:\n${articleList}\n\n핵심 트렌드 3가지(각 2문장), 마지막에 창업 인사이트 1개. HTML 형식(<h2><p><ul><li>). 어려운 용어 괄호 설명. 800자 이내.`
    try { newsletterHtml = await callGemini(prompt) } catch {}
    if (!newsletterHtml) {
      newsletterHtml = `<h2>이번 주 창업 뉴스</h2>${articles.slice(0,6).map(a => `<div style="margin-bottom:16px"><h3 style="font-size:14px">${a.title}</h3><p style="font-size:13px;color:#555">${(a.ai_summary||'').slice(0,150)}</p></div>`).join('')}`
    }
  }

  const subject = `📰 Insightship 주간 창업 뉴스 (${kstDate})`
  const emails = subscribers.map(s => s.email).filter(Boolean)

  // Resend 발송
  const BATCH = 50
  let sent = 0
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH)
    try {
      const sendRes = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map(to => ({
          from: 'Insightship <insightship_nl@pacm.kr>',
          to,
          subject,
          html: `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,'Noto Sans KR',sans-serif;background:#f5f3ee;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #d4cfc5">
    <div style="background:#0a0a09;padding:24px 32px">
      <div style="color:#fff;font-weight:800;font-size:18px;letter-spacing:2px">
        INSIGHT<span style="color:#D4AF37">SHIP</span>
        <span style="color:#888;font-size:12px;margin-left:12px">${kstDate}</span>
      </div>
    </div>
    <div style="padding:32px;color:#0f0e0a;line-height:1.8">${newsletterHtml}</div>
    <div style="background:#f5f3ee;padding:20px 32px;border-top:1px solid #d4cfc5;font-size:11px;color:#888">
      <p>© ${new Date().getFullYear()} INSIGHTSHIP by PACM | <a href="https://www.insightship.pacm.kr" style="color:#D4AF37">insightship.pacm.kr</a></p>
    </div>
  </div>
</body></html>`,
        }))),

      })
      const resendBody = await sendRes.text()
      if (sendRes.ok) {
        sent += batch.length
      } else {
        // 오류 내용을 응답에 포함
        return json({ sent: 0, total: emails.length, subject, is_test: isTest, resend_error: resendBody.slice(0, 300), resend_status: sendRes.status }, 200)
      }
    } catch(e) { console.error('발송 실패:', e.message) }
  }

  // 발송 기록 (실패해도 무시)
  fetch(`${SUPABASE_URL}/rest/v1/newsletter_logs`, {
    method: 'POST',
    headers: { ...SH, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ sent_count: sent, subject, sent_at: new Date().toISOString() }),
  }).catch(() => {})

  return json({ sent, total: emails.length, subject, is_test: isTest })
}
