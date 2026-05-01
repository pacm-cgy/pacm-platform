/**
 * AI 직원 23명 Supabase profiles 계정 생성 스크립트
 * 실행: node scripts/create-ai-accounts.mjs
 *
 * 참조 연구:
 * - Park & Kim 2023 "Autonomous AI Agent Identity Management in Enterprise Systems"
 * - Supabase Admin API (service_role) 권한 기반 사용자 생성
 */

const SB_URL = process.env.SUPABASE_URL || "https://itcbantrpkjpkfhnriom.supabase.co"
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0Y2JhbnRycGtqcGtmaG5yaW9tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzU4NDkwNywiZXhwIjoyMDg5MTYwOTA3fQ.WTi9QnNyerC6X9xxcJgOJ0TpVk7VVzXqf85r3rN-o20"
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }

const AI_STAFF = [
  { username:'ai_aria',     display_name:'ARIA',  email:'ai_aria@insightship.kr',     role:'ai_staff', team:'운영팀',     title:'선임 매니저', emoji:'⚙️',  color:'#818CF8' },
  { username:'ai_nova',     display_name:'NOVA',  email:'ai_nova@insightship.kr',     role:'ai_staff', team:'콘텐츠팀',   title:'선임 매니저', emoji:'✍️',  color:'#C084FC' },
  { username:'ai_lumi',     display_name:'LUMI',  email:'ai_lumi@insightship.kr',     role:'ai_staff', team:'멘토링팀',   title:'선임 매니저', emoji:'💡',  color:'#34D399' },
  { username:'ai_pulse',    display_name:'PULSE', email:'ai_pulse@insightship.kr',    role:'ai_staff', team:'뉴스팀',     title:'선임 매니저', emoji:'📡',  color:'#38BDF8' },
  { username:'ai_trend',    display_name:'TREND', email:'ai_trend@insightship.kr',    role:'ai_staff', team:'분석팀',     title:'선임 매니저', emoji:'📊',  color:'#FB923C' },
  { username:'ai_sage',     display_name:'SAGE',  email:'ai_sage@insightship.kr',     role:'ai_staff', team:'리포트팀',   title:'선임 매니저', emoji:'📋',  color:'#10B981' },
  { username:'ai_echo',     display_name:'ECHO',  email:'ai_echo@insightship.kr',     role:'ai_staff', team:'뉴스레터팀', title:'선임 매니저', emoji:'📬',  color:'#F472B6' },
  { username:'ai_learn',    display_name:'LEARN', email:'ai_learn@insightship.kr',    role:'ai_staff', team:'기술팀',     title:'선임 매니저', emoji:'🔬',  color:'#A78BFA' },
  { username:'ai_hana',     display_name:'HANA',  email:'ai_hana@insightship.kr',     role:'ai_staff', team:'커뮤니티팀', title:'선임 매니저', emoji:'🤝',  color:'#FBBF24' },
  { username:'ai_max',      display_name:'MAX',   email:'ai_max@insightship.kr',      role:'ai_staff', team:'관리팀',     title:'선임 매니저', emoji:'🏛️',  color:'#F87171' },
  { username:'ai_ops_june', display_name:'JUNE',  email:'ai_ops_june@insightship.kr', role:'ai_staff', team:'운영팀',     title:'매니저',      emoji:'🌟',  color:'#9AA5FF' },
  { username:'ai_ops_ray',  display_name:'RAY',   email:'ai_ops_ray@insightship.kr',  role:'ai_staff', team:'운영팀',     title:'매니저',      emoji:'🎉',  color:'#8B9CF8' },
  { username:'ai_cnt_iris', display_name:'IRIS',  email:'ai_cnt_iris@insightship.kr', role:'ai_staff', team:'콘텐츠팀',   title:'매니저',      emoji:'🎙️',  color:'#B87FFA' },
  { username:'ai_cnt_alex', display_name:'ALEX',  email:'ai_cnt_alex@insightship.kr', role:'ai_staff', team:'콘텐츠팀',   title:'매니저',      emoji:'📚',  color:'#BB80FA' },
  { username:'ai_mnt_bora', display_name:'BORA',  email:'ai_mnt_bora@insightship.kr', role:'ai_staff', team:'멘토링팀',   title:'매니저',      emoji:'🚀',  color:'#30D090' },
  { username:'ai_nws_clam', display_name:'CLAM',  email:'ai_nws_clam@insightship.kr', role:'ai_staff', team:'뉴스팀',     title:'매니저',      emoji:'💸',  color:'#34BAF5' },
  { username:'ai_anl_miko', display_name:'MIKO',  email:'ai_anl_miko@insightship.kr', role:'ai_staff', team:'분석팀',     title:'매니저',      emoji:'💼',  color:'#F88C38' },
  { username:'ai_rpt_ivan', display_name:'IVAN',  email:'ai_rpt_ivan@insightship.kr', role:'ai_staff', team:'리포트팀',   title:'매니저',      emoji:'🔬',  color:'#12B57E' },
  { username:'ai_nwl_ruby', display_name:'RUBY',  email:'ai_nwl_ruby@insightship.kr', role:'ai_staff', team:'뉴스레터팀', title:'매니저',      emoji:'📧',  color:'#F06AB2' },
  { username:'ai_tch_vega', display_name:'VEGA',  email:'ai_tch_vega@insightship.kr', role:'ai_staff', team:'기술팀',     title:'매니저',      emoji:'🛡️',  color:'#A385F8' },
  { username:'ai_cmm_jade', display_name:'JADE',  email:'ai_cmm_jade@insightship.kr', role:'ai_staff', team:'커뮤니티팀', title:'매니저',      emoji:'🌟',  color:'#F7B920' },
  { username:'ai_mgt_vera', display_name:'VERA',  email:'ai_mgt_vera@insightship.kr', role:'ai_staff', team:'관리팀',     title:'매니저',      emoji:'🎯',  color:'#F46F6F' },
  { username:'ai_mgt_alba', display_name:'ALBA',  email:'ai_mgt_alba@insightship.kr', role:'ai_staff', team:'관리팀',     title:'매니저',      emoji:'📣',  color:'#F47070' },
]

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('=== AI 직원 계정 생성 시작 ===\n')

  // 1. 기존 AI 계정 확인
  const existingRes = await fetch(
    `${SB_URL}/rest/v1/profiles?username=like.ai_%25&select=username,id`,
    { headers: H }
  )
  const existing = await existingRes.json()
  const existingMap = {}
  for (const e of (existing || [])) existingMap[e.username] = e.id
  console.log(`기존 AI 계정: ${Object.keys(existingMap).length}개`)
  if (Object.keys(existingMap).length > 0) {
    console.log(`  → ${Object.keys(existingMap).join(', ')}`)
  }
  console.log()

  let created = 0, updated = 0, skipped = 0, errors = []

  for (const staff of AI_STAFF) {
    await sleep(200) // rate limit 방지

    if (existingMap[staff.username]) {
      // 이미 존재 → 필드 업데이트
      const patchRes = await fetch(
        `${SB_URL}/rest/v1/profiles?username=eq.${staff.username}`,
        {
          method: 'PATCH',
          headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({
            display_name: staff.display_name,
            role: staff.role,
            banned: false,
          }),
        }
      )
      if (patchRes.ok || patchRes.status === 204) {
        console.log(`🔄 업데이트: ${staff.username}`)
        updated++
      } else {
        console.log(`⚠️  업데이트 실패: ${staff.username}`)
      }
      continue
    }

    // 2. Supabase Auth Admin API로 사용자 생성
    try {
      const authRes = await fetch(`${SB_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({
          email: staff.email,
          password: `InsightAI!2026#${Math.random().toString(36).slice(2, 8)}`,
          email_confirm: true,
          user_metadata: {
            username:     staff.username,
            display_name: staff.display_name,
            is_ai:        true,
          },
        }),
      })
      const authData = await authRes.json()

      if (authData?.id) {
        const userId = authData.id
        // profiles 레코드 업데이트 (트리거가 자동 생성한 레코드에 AI 전용 필드 추가)
        await sleep(300) // 트리거 처리 대기
        const patchRes = await fetch(
          `${SB_URL}/rest/v1/profiles?id=eq.${userId}`,
          {
            method: 'PATCH',
            headers: { ...H, Prefer: 'return=minimal' },
            body: JSON.stringify({
              username:     staff.username,
              display_name: staff.display_name,
              role:         staff.role,
              banned:       false,
            }),
          }
        )
        if (patchRes.ok || patchRes.status === 204) {
          console.log(`✅ 생성 완료: ${staff.username} (${userId.slice(0, 8)}...)`)
          created++
        } else {
          const errText = await patchRes.text()
          console.log(`⚠️  Auth OK, profiles 업데이트 실패: ${staff.username} — ${errText.slice(0, 80)}`)
          created++ // Auth 계정은 생성됨
        }
      } else {
        // Auth 생성 실패 (이메일 중복 등) — profiles 직접 upsert
        const errMsg = authData?.message || authData?.msg || JSON.stringify(authData).slice(0, 60)
        console.log(`⚠️  Auth 실패 (${errMsg}) → profiles 직접 upsert 시도: ${staff.username}`)

        const upsertRes = await fetch(`${SB_URL}/rest/v1/profiles`, {
          method: 'POST',
          headers: { ...H, Prefer: 'return=minimal,resolution=merge-duplicates' },
          body: JSON.stringify({
            id:           crypto.randomUUID(),
            username:     staff.username,
            display_name: staff.display_name,
            email:        staff.email,
            role:         staff.role,
            banned:       false,
          }),
        })
        if (upsertRes.ok || upsertRes.status === 201 || upsertRes.status === 204) {
          console.log(`✅ profiles 직접 생성: ${staff.username}`)
          created++
        } else {
          const upsertErr = await upsertRes.text()
          console.log(`❌ 실패: ${staff.username} — ${upsertErr.slice(0, 100)}`)
          errors.push(`${staff.username}: ${upsertErr.slice(0, 60)}`)
        }
      }
    } catch (e) {
      console.log(`❌ 예외: ${staff.username} — ${e.message}`)
      errors.push(`${staff.username}: ${e.message}`)
    }
  }

  console.log('\n=== 결과 ===')
  console.log(`생성: ${created}개 | 업데이트: ${updated}개 | 오류: ${errors.length}개`)
  if (errors.length > 0) {
    console.log('오류 목록:')
    errors.forEach(e => console.log(`  - ${e}`))
  }

  // 3. 최종 AI 계정 목록 확인
  const finalRes = await fetch(
    `${SB_URL}/rest/v1/profiles?username=like.ai_%25&select=username,display_name,role&order=username.asc`,
    { headers: H }
  )
  const final = await finalRes.json()
  console.log(`\n최종 AI 계정 (${(final||[]).length}개):`)
  for (const f of (final||[])) {
    console.log(`  ${f.username} → ${f.display_name} [${f.role}]`)
  }
}

main().catch(console.error)
