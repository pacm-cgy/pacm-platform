// 파트너십 문의 접수 + contact@pacm.kr 이메일 발송
export const config = { runtime: 'edge' }

const RESEND_KEY = process.env.RESEND_API_KEY
const SB_URL     = process.env.SUPABASE_URL
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  let body
  try { body = await req.json() }
  catch { return new Response(JSON.stringify({ error: '잘못된 요청' }), { status: 400 }) }

  const { company_name, contact_name, email, phone, inquiry_type, message } = body

  if (!company_name || !contact_name || !email || !message) {
    return new Response(JSON.stringify({ error: '필수 항목을 모두 입력해주세요' }), { status: 400 })
  }

  const H = {
    'Content-Type': 'application/json',
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
  }

  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  const typeLabel = {
    partnership: '기업 파트너십', project: '프로젝트 의뢰',
    recruitment: '인재 발굴', sponsorship: '후원/협찬', other: '기타'
  }[inquiry_type] || inquiry_type

  // 1) Supabase 저장
  let dbSaved = false
  try {
    const dbRes = await fetch(`${SB_URL}/rest/v1/partner_inquiries`, {
      method: 'POST',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ company_name, contact_name, email, phone: phone || '', inquiry_type: inquiry_type || 'partnership', message, status: 'pending' }),
    })
    dbSaved = dbRes.ok
  } catch {}

  // 2) 관리자 알림 이메일
  const adminHtml = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<style>body{font-family:-apple-system,sans-serif;background:#080808;color:#F5F5F5;margin:0;padding:0}
.wrap{max-width:600px;margin:0 auto;padding:40px 24px}
.badge{display:inline-block;background:#6366F1;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;letter-spacing:1px;margin-bottom:24px;border-radius:4px}
h2{font-size:22px;font-weight:700;margin:0 0 24px}
table{width:100%;border-collapse:collapse}
td{padding:12px 16px;border:1px solid #1e1e1e;font-size:14px}
td:first-child{background:#141414;color:#6B6B6B;width:120px;white-space:nowrap}
.msg{background:#141414;border:1px solid #1e1e1e;padding:16px;font-size:14px;line-height:1.7;margin-top:8px;white-space:pre-wrap;border-radius:6px}
.footer{margin-top:32px;font-size:12px;color:#6B6B6B;border-top:1px solid #1e1e1e;padding-top:16px}
a{color:#818CF8}</style></head>
<body><div class="wrap">
<div class="badge">PACM CONNECT — 파트너십 문의</div>
<h2>새 파트너십 문의가 접수됐습니다</h2>
<table>
<tr><td>접수 시각</td><td>${now}</td></tr>
<tr><td>회사명</td><td><strong>${company_name}</strong></td></tr>
<tr><td>담당자명</td><td>${contact_name}</td></tr>
<tr><td>이메일</td><td><a href="mailto:${email}">${email}</a></td></tr>
<tr><td>연락처</td><td>${phone || '(미입력)'}</td></tr>
<tr><td>문의 유형</td><td>${typeLabel}</td></tr>
</table>
<div style="margin-top:16px;font-size:13px;color:#6B6B6B">문의 내용:</div>
<div class="msg">${message}</div>
<div class="footer">DB 저장: ${dbSaved ? '✅ 성공' : '⚠️ 실패 (수동확인 필요)'}<br>
Insightship — www.insightship.pacm.kr</div>
</div></body></html>`

  // 3) 문의자 확인 이메일
  const confirmHtml = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<style>body{font-family:-apple-system,sans-serif;background:#080808;color:#F5F5F5;margin:0;padding:0}
.wrap{max-width:600px;margin:0 auto;padding:40px 24px}
.badge{display:inline-block;background:#6366F1;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;letter-spacing:1px;margin-bottom:24px;border-radius:4px}
h2{font-size:20px;font-weight:700;margin:0 0 16px}
p{color:#A1A1A1;font-size:14px;line-height:1.8}
.footer{margin-top:32px;font-size:12px;color:#6B6B6B;border-top:1px solid #1e1e1e;padding-top:16px}
a{color:#818CF8}</style></head>
<body><div class="wrap">
<div class="badge">PACM CONNECT</div>
<h2>파트너십 문의가 접수됐습니다</h2>
<p>${contact_name}님, 문의 주셔서 감사합니다.<br>
<strong>${company_name}</strong>의 ${typeLabel} 문의가 정상 접수됐습니다.</p>
<p>영업일 기준 <strong>2일 이내</strong>에 <strong>${email}</strong>로 답변 드리겠습니다.<br>
추가 문의는 <a href="mailto:contact@pacm.kr">contact@pacm.kr</a>로 연락주세요.</p>
<div class="footer">Insightship — 청소년 창업 플랫폼 | www.insightship.pacm.kr</div>
</div></body></html>`

  try {
    const [adminRes, confirmRes] = await Promise.allSettled([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Insightship <contact@pacm.kr>',
          to: ['contact@pacm.kr'],
          subject: `[파트너십 문의] ${company_name} — ${typeLabel}`,
          html: adminHtml,
          reply_to: email,
        }),
      }),
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Insightship <contact@pacm.kr>',
          to: [email],
          subject: '[Insightship] 파트너십 문의가 접수됐습니다',
          html: confirmHtml,
        }),
      }),
    ])

    const adminOk = adminRes.status === 'fulfilled' && (await adminRes.value.json()).id
    const confirmOk = confirmRes.status === 'fulfilled' && confirmRes.value.ok

    return new Response(JSON.stringify({
      ok: true, db_saved: dbSaved,
      admin_email: adminOk ? 'sent' : 'failed',
      confirm_email: confirmOk ? 'sent' : 'failed',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch(e) {
    return new Response(JSON.stringify({ ok: false, error: e.message, db_saved: dbSaved }), { status: 500 })
  }
}
