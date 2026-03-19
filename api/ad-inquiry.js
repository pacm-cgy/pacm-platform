// 광고 문의 접수 + contact@pacm.kr 이메일 발송
export const config = { runtime: 'edge' }

const RESEND_KEY = process.env.RESEND_API_KEY
const SB_URL     = process.env.SUPABASE_URL
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: '잘못된 요청입니다' }), { status: 400 })
  }

  const { company, name, email, phone, package: pkg, message } = body

  // 필수 필드 검증
  if (!company || !email) {
    return new Response(JSON.stringify({ error: '회사명과 이메일은 필수입니다' }), { status: 400 })
  }

  // 이메일 형식 검증
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return new Response(JSON.stringify({ error: '올바른 이메일 주소를 입력해주세요' }), { status: 400 })
  }

  const H = {
    'Content-Type': 'application/json',
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
  }

  // 1) Supabase에 저장 시도 (실패해도 이메일은 발송)
  let dbSaved = false
  try {
    const dbRes = await fetch(`${SB_URL}/rest/v1/ad_inquiries`, {
      method: 'POST',
      headers: { ...H, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        company_name: company,
        contact_name: name || '',
        email,
        phone: phone || '',
        package_type: pkg || '문의',
        message: message || '',
        status: 'new',
      }),
    })
    dbSaved = dbRes.ok || dbRes.status === 201
  } catch {}

  // 2) Resend로 contact@pacm.kr에 알림 이메일 발송
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

  const adminEmailHtml = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><style>
  body { font-family: -apple-system, sans-serif; background:#0A0A09; color:#F0EDE6; margin:0; padding:0; }
  .wrap { max-width:600px; margin:0 auto; padding:40px 24px; }
  .badge { display:inline-block; background:#F97316; color:#000; font-size:11px; font-weight:700; padding:4px 10px; letter-spacing:1px; margin-bottom:24px; }
  h2 { font-size:22px; font-weight:700; margin:0 0 24px; }
  table { width:100%; border-collapse:collapse; }
  td { padding:12px 16px; border:1px solid #222220; font-size:14px; }
  td:first-child { background:#111110; color:#A8A89E; width:120px; white-space:nowrap; }
  .msg { background:#111110; border:1px solid #222220; padding:16px; font-size:14px; line-height:1.7; margin-top:8px; white-space:pre-wrap; }
  .footer { margin-top:32px; font-size:12px; color:#6B6860; border-top:1px solid #222220; padding-top:16px; }
</style></head>
<body>
<div class="wrap">
  <div class="badge">INSIGHTSHIP 광고 문의</div>
  <h2>새 광고 문의가 접수됐습니다</h2>
  <table>
    <tr><td>접수 시각</td><td>${now}</td></tr>
    <tr><td>회사/기관명</td><td><strong>${company}</strong></td></tr>
    <tr><td>담당자명</td><td>${name || '(미입력)'}</td></tr>
    <tr><td>이메일</td><td><a href="mailto:${email}" style="color:#F97316">${email}</a></td></tr>
    <tr><td>연락처</td><td>${phone || '(미입력)'}</td></tr>
    <tr><td>관심 패키지</td><td>${pkg || '(미선택)'}</td></tr>
  </table>
  ${message ? `<div style="margin-top:16px;font-size:13px;color:#A8A89E">문의 내용:</div><div class="msg">${message}</div>` : ''}
  <div class="footer">
    이 메일은 Insightship 광고 문의 폼에서 자동 발송됐습니다.<br>
    DB 저장: ${dbSaved ? '✅ 성공' : '⚠️ 실패 (수동 확인 필요)'}
  </div>
</div>
</body>
</html>`

  // 문의자에게 접수 확인 이메일
  const confirmHtml = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><style>
  body { font-family: -apple-system, sans-serif; background:#0A0A09; color:#F0EDE6; margin:0; padding:0; }
  .wrap { max-width:600px; margin:0 auto; padding:40px 24px; }
  .badge { display:inline-block; background:#F97316; color:#000; font-size:11px; font-weight:700; padding:4px 10px; letter-spacing:1px; margin-bottom:24px; }
  h2 { font-size:20px; font-weight:700; margin:0 0 16px; }
  p { color:#A8A89E; font-size:14px; line-height:1.8; }
  .cta { margin-top:28px; }
  .footer { margin-top:32px; font-size:12px; color:#6B6860; border-top:1px solid #222220; padding-top:16px; }
</style></head>
<body>
<div class="wrap">
  <div class="badge">INSIGHTSHIP</div>
  <h2>광고 문의가 접수됐습니다</h2>
  <p>${name ? name + '님,' : '안녕하세요,'} 광고 문의 주셔서 감사합니다.<br>
  <strong>${company}</strong>의 문의가 정상적으로 접수됐습니다.</p>
  <p>영업일 기준 <strong>2일 이내</strong>에 <strong>${email}</strong>로 답변 드리겠습니다.</p>
  <p>추가 문의사항은 <a href="mailto:contact@pacm.kr" style="color:#F97316">contact@pacm.kr</a>로 연락주세요.</p>
  <div class="footer">Insightship — 청소년 창업 플랫폼 | www.insightship.pacm.kr</div>
</div>
</body>
</html>`

  try {
    // 관리자 알림 + 문의자 확인 이메일 동시 발송
    const [adminRes, confirmRes] = await Promise.allSettled([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Insightship <contact@pacm.kr>',
          to: ['contact@pacm.kr'],
          subject: `[광고 문의] ${company} — ${pkg || '패키지 미선택'}`,
          html: adminEmailHtml,
          reply_to: email,
        }),
      }),
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Insightship <contact@pacm.kr>',
          to: [email],
          subject: '[Insightship] 광고 문의가 접수됐습니다',
          html: confirmHtml,
        }),
      }),
    ])

    let adminOk = false, adminErr = ''
    if (adminRes.status === 'fulfilled') {
      const adminJson = await adminRes.value.json()
      adminOk = !!adminJson.id
      if (!adminOk) adminErr = adminJson.message || adminJson.statusCode || JSON.stringify(adminJson).slice(0,100)
    } else {
      adminErr = String(adminRes.reason).slice(0,100)
    }
    const confirmOk = confirmRes.status === 'fulfilled' && confirmRes.value.ok

    return new Response(JSON.stringify({
      ok: true,
      db_saved: dbSaved,
      admin_email: adminOk ? 'sent' : 'failed',
      admin_error: adminErr || undefined,
      confirm_email: confirmOk ? 'sent' : 'failed',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: '이메일 발송 오류',
      db_saved: dbSaved,
    }), { status: 500 })
  }
}
