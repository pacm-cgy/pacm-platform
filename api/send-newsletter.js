// 뉴스레터 발송 - 매주 월요일 KST 09:00
export const config = { runtime: 'edge' }

const SB_URL     = process.env.SUPABASE_URL
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_KEY = process.env.RESEND_API_KEY
const CRON_SECRET = process.env.CRON_SECRET
const GEMINI_KEY = process.env.GEMINI_API_KEY

const SH = () => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` })
const json = (d, s=200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })

function getKSTDate() { return new Date(Date.now() + 9*3600000).toISOString().slice(0,10) }

function getLastWeekRange() {
  const now = new Date(Date.now() + 9*3600000)
  const day = now.getDay() || 7
  const thisMonday = new Date(now); thisMonday.setDate(now.getDate()-(day-1)); thisMonday.setHours(0,0,0,0)
  const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate()-7)
  const lastSunday = new Date(thisMonday); lastSunday.setDate(thisMonday.getDate()-1); lastSunday.setHours(23,59,59,999)
  const fmt = d => `${d.getMonth()+1}월 ${d.getDate()}일`
  return {
    from: new Date(lastMonday.getTime()-9*3600000).toISOString(),
    to:   new Date(lastSunday.getTime()-9*3600000).toISOString(),
    label: `${fmt(lastMonday)} ~ ${fmt(lastSunday)}`,
  }
}

async function gemini(systemTxt, userTxt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemTxt }] },
        contents: [{ role: 'user', parts: [{ text: userTxt }] }],
        generationConfig: { maxOutputTokens: 1200, temperature: 0.5, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(20000),
    }
  )
  if (!r.ok) throw new Error(`Gemini ${r.status}`)
  const d = await r.json()
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  if (text.length < 100) throw new Error(`응답 너무 짧음`)
  return text
}

const SYSTEM = `Insightship 뉴스레터 에디터 규칙:
- 인사말/서론 없이 본문만 작성
- ~입니다/~했습니다 체
- 반드시 완전한 문장으로 마무리 (절대 끊기지 않게)
- 어려운 용어는 괄호 설명
- 수치·기업명·날짜 구체적 포함
- HTML 태그 없이 순수 텍스트만 출력
- 1,800~2,000자 이내 작성`

function sectionHtml(icon, title, content) {
  return `<div style="margin-bottom:28px;background:#1a1a18;border:1px solid #2a2a28;border-radius:2px;overflow:hidden">` +
    `<div style="background:#111110;padding:12px 22px;border-bottom:1px solid #2a2a28">` +
    `<span style="font-size:16px">${icon}</span>` +
    `<span style="color:#D4AF37;font-weight:700;font-size:13px;letter-spacing:1px;font-family:monospace;margin-left:8px">${title}</span>` +
    `</div>` +
    `<div style="padding:18px 22px;color:#c8c8c0;font-size:14px;line-height:1.9;white-space:pre-wrap">${content}</div>` +
    `</div>`
}

export default async function handler(req) {
  const auth = req.headers.get('authorization')
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron && auth !== `Bearer ${CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401)

  let isTest = false, testEmail = ''
  try {
    const rawUrl = req.url || ''
    const u = new URL(rawUrl.startsWith('http') ? rawUrl : `https://insightship.pacm.kr${rawUrl}`)
    isTest = u.searchParams.get('test') === 'true'
    testEmail = u.searchParams.get('email') || ''
  } catch {}
  if (isTest && !testEmail) return json({ error: 'email 파라미터 필요' }, 400)

  const { from, to, label } = getLastWeekRange()

  // 지난주 뉴스 (없으면 최근 뉴스로 대체)
  let articles = []
  const r1 = await fetch(
    `${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published&is_duplicate=neq.true&published_at=gte.${encodeURIComponent(from)}&published_at=lte.${encodeURIComponent(to)}&ai_summary=not.is.null&select=title,ai_summary,source_name&order=published_at.desc&limit=40`,
    { headers: SH() }
  )
  try { articles = await r1.json() } catch {}
  if (!articles?.length) {
    const r2 = await fetch(
      `${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published&ai_summary=not.is.null&select=title,ai_summary,source_name&order=published_at.desc&limit=40`,
      { headers: SH() }
    )
    try { articles = await r2.json() } catch {}
  }
  if (!articles?.length) return json({ error: '뉴스 없음' }, 200)

  // 구독자
  let subscribers = []
  if (isTest) {
    subscribers = [{ email: testEmail, unsubscribe_token: null }]
  } else {
    const rs = await fetch(`${SB_URL}/rest/v1/newsletter_subscribers?is_active=eq.true&select=email,unsubscribe_token`, { headers: SH() })
    try { subscribers = await rs.json() || [] } catch {}
  }
  if (!subscribers?.length) return json({ message: '활성 구독자 없음' }, 200)

  const kstDate = getKSTDate()
  const subject = `INSIGHTSHIP 주간 뉴스레터 — ${label}`

  const ctx = articles.slice(0,30).map((a,i) =>
    `${i+1}. [${a.source_name||''}] ${a.title}\n${(a.ai_summary||'').slice(0,180)}`
  ).join('\n\n')
  const base = `[${label} 주요 뉴스]\n${ctx}\n\n위 뉴스를 바탕으로 `

  // 4개 섹션 병렬 생성
  const [r_s1, r_s2, r_s3, r_s4] = await Promise.allSettled([
    gemini(SYSTEM, base + `한국 창업·스타트업 시장 흐름을 분석하세요. 주요 투자·펀딩 사례, 주목 스타트업, AI·헬스케어·핀테크·에듀테크 섹터별 동향을 수치와 기업명 중심으로 상세히 작성하세요. 1,800자 이상, 완전한 문장으로 마무리하세요.`),
    gemini(SYSTEM, base + `현재 한국 및 글로벌 경제 상황을 분석하세요. 금리·환율·물가·소비 동향, 주요 기업 실적, 투자 시장 흐름, 이것이 스타트업 생태계에 미치는 영향을 작성하세요. 1,800자 이상, 완전한 문장으로 마무리하세요.`),
    gemini(SYSTEM, base + `이번 주 핵심 이슈들이 왜 발생했는지 배경·원인을 분석하세요. 기술 트렌드, 정책 변화, 사회적 수요 변화 등 구조적 원인 중심으로 설명하세요. 청소년도 이해하도록 어려운 용어는 괄호 설명. 1,800자 이상, 완전한 문장으로 마무리하세요.`),
    gemini(SYSTEM, base + `현재 사회 변화와 창업 기회를 분석하세요. 인구 구조, 라이프스타일 트렌드, 기술 보급, 정부 정책 방향을 다루고, 청소년 창업가가 지금 주목해야 할 기회와 실천 인사이트 2~3가지를 포함하세요. 1,800자 이상, 완전한 문장으로 마무리하세요.`),
  ])

  const fallback = '이번 주 분석 데이터를 준비 중입니다. 다음 호에서 더 풍부한 내용으로 찾아뵙겠습니다.'
  const sec = [r_s1,r_s2,r_s3,r_s4].map(r => r.status==='fulfilled' ? r.value : fallback)

  // 개별 발송
  const UNSUB = 'https://www.insightship.pacm.kr/api/unsubscribe'
  let sent = 0

  for (const sub of subscribers) {
    const unsubLink = sub.unsubscribe_token
      ? `${UNSUB}?token=${encodeURIComponent(sub.unsubscribe_token)}`
      : `${UNSUB}?email=${encodeURIComponent(sub.email)}`

    const newsListHtml = articles.slice(0,10).map(a =>
      `<div style="font-size:12px;color:#6a6a60;padding:4px 0;border-bottom:1px solid #1e1e1c">` +
      `<span style="color:#a8a89e">${a.title}</span>` +
      (a.source_name ? `<span style="color:#D4AF3788;margin-left:8px">[${a.source_name}]</span>` : '') +
      `</div>`
    ).join('')

    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>` +
      `<body style="margin:0;padding:0;background:#0F0E0A;font-family:-apple-system,'Noto Sans KR',Arial,sans-serif">` +
      `<div style="max-width:640px;margin:0 auto;padding:20px">` +

      // 헤더
      `<div style="background:#111110;border:1px solid #2a2a28;padding:28px 32px;margin-bottom:4px;text-align:center">` +
      `<div style="font-size:24px;font-weight:800;letter-spacing:4px;color:#F0EEE8">INSIGHT<span style="color:#D4AF37">SHIP</span></div>` +
      `<div style="color:#6a6a60;font-size:11px;letter-spacing:2px;font-family:monospace;margin-top:6px">WEEKLY NEWSLETTER</div>` +
      `<div style="margin-top:12px;background:#1a1a18;border:1px solid #D4AF3766;display:inline-block;padding:6px 16px">` +
      `<span style="color:#D4AF37;font-size:12px;font-family:monospace">${label}</span></div></div>` +

      // 도입
      `<div style="background:#111110;border:1px solid #2a2a28;border-top:none;padding:14px 32px 18px;margin-bottom:20px;text-align:center">` +
      `<p style="color:#a8a89e;font-size:13px;margin:0;line-height:1.7">지난 한 주간의 창업·경제·사회 이슈를 Insightship이 정리했습니다.</p></div>` +

      // 4개 섹션
      sectionHtml('🚀', '창업·스타트업 시장 흐름', sec[0]) +
      sectionHtml('📊', '경제 동향 & 시장 분석', sec[1]) +
      sectionHtml('🔍', '이슈 배경 & 원인 분석', sec[2]) +
      sectionHtml('💡', '사회 변화 & 창업 기회', sec[3]) +

      // 참고 뉴스
      `<div style="margin-bottom:28px;background:#111110;border:1px solid #2a2a28;padding:18px 22px">` +
      `<div style="color:#6a6a60;font-size:11px;letter-spacing:2px;font-family:monospace;margin-bottom:10px">이번 주 참고 뉴스</div>` +
      newsListHtml + `</div>` +

      // 푸터
      `<div style="text-align:center;padding:24px;border-top:1px solid #1e1e1c">` +
      `<a href="https://www.insightship.pacm.kr" style="color:#D4AF37;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:1px">INSIGHTSHIP</a>` +
      `<p style="color:#4a4a48;font-size:11px;margin:12px 0 8px;line-height:1.7">` +
      `© ${new Date().getFullYear()} INSIGHTSHIP by PACM | 사업자등록번호: 891-45-01385</p>` +
      `<p style="margin:0"><a href="${unsubLink}" style="color:#4a4a48;font-size:11px;text-decoration:underline">수신 거부하기</a></p>` +
      `</div>` +

      `</div></body></html>`

    try {
      const sr = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Insightship <insightship_nl@pacm.kr>', to: sub.email, subject, html }),
      })
      if (sr.ok) sent++
      else { const e = await sr.text(); console.error('Resend:', sr.status, e.slice(0,100)) }
    } catch(e) { console.error('발송 오류:', e.message) }

    await new Promise(res => setTimeout(res, 600))
  }

  fetch(`${SB_URL}/rest/v1/newsletter_logs`, {
    method: 'POST',
    headers: { ...SH(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ sent_count: sent, subject, sent_at: new Date().toISOString() }),
  }).catch(() => {})

  return json({ sent, total: subscribers.length, subject, label, is_test: isTest })
}
