/**
 * PACM AI OFFICE TERMINAL
 * POST /api/office
 * { "cmd": "명령어 문자열" }
 *
 * 지원 명령어:
 *   status              — 전체 오피스 현황
 *   ls [부서]            — 부서/직원 목록
 *   assign [부서] [업무]  — 업무 배분
 *   run [업무ID]         — 업무 실행
 *   report              — 진행 중 업무 리포트
 *   call [직원명] [메시지] — 특정 직원 호출
 *   parallel [업무1] | [업무2] ... — 병렬 실행
 *   help                — 명령어 목록
 */
export const config = { runtime: 'edge' }

const SB_URL = process.env.VITE_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const H = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }

const DEPT_KO = {
  management:'경영부', planning:'기획부', dev:'개발부',
  design:'디자인부', qa:'QA팀', research:'AI연구소',
  marketing:'마케팅부', content:'콘텐츠부', security:'보안팀'
}
const DEPT_CODE = {
  '경영부':'management','기획부':'planning','개발부':'dev',
  '디자인부':'design','qa팀':'qa','qateam':'qa','qa':'qa',
  'ai연구소':'research','연구부':'research','research':'research',
  '마케팅부':'marketing','콘텐츠부':'content','보안팀':'security'
}

async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H })
  return r.json()
}
async function sbPost(table, data) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify(data)
  })
  return r.json()
}
async function sbPatch(table, filter, data) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify(data)
  })
  return r.json()
}

// AI 에이전트 실제 응답 생성 (Anthropic API)
async function agentRespond(agent, task) {
  if (!ANTHROPIC_KEY) {
    return `[${agent.name}] ${task} 업무를 접수했습니다. 처리를 시작합니다.`
  }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: agent.system_prompt + '\n\n반드시 한국어로 답변. 담당자로서 업무를 구체적으로 어떻게 처리할지 2~4문장으로 답변.',
        messages: [{ role: 'user', content: `업무 지시: ${task}` }]
      })
    })
    const d = await r.json()
    return d.content?.[0]?.text || `[${agent.name}] 업무 접수 완료.`
  } catch(e) {
    return `[${agent.name}] ${task} — 접수 완료. 처리 중입니다.`
  }
}

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      }
    })
  }

  if (req.method === 'GET') {
    // 헬스체크
    return new Response(JSON.stringify({ ok: true, service: 'PACM AI Office Terminal' }), { status: 200 })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let body
  try { body = await req.json() } catch { return new Response('Bad request', { status: 400 }) }

  const raw = (body.cmd || '').trim()
  const parts = raw.split(/\s+/)
  const cmd = parts[0]?.toLowerCase()

  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

  // ── help
  if (!cmd || cmd === 'help') {
    return json({
      type: 'help',
      output: `
⚡ PACM AI OFFICE TERMINAL v1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
명령어 목록:

  status                    전체 오피스 현황
  ls                        부서 목록
  ls [부서명]               해당 부서 직원 목록
  assign [부서] [업무내용]  부서에 업무 배분
  call [직원명] [메시지]    특정 직원 호출
  run [업무ID]              업무 실행
  report                    진행 중 업무 현황
  parallel [업무1]|[업무2]  병렬 업무 실행
  log                       최근 업무 로그
  help                      이 화면

예시:
  assign 개발부 Sparkship 이미지 업로드 버그 수정
  call Core DB 스키마 최적화 검토 요청
  parallel 기획부 사용자 플로우 검토|개발부 API 성능 개선
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    })
  }

  // ── status
  if (cmd === 'status') {
    const [depts, agents, tasks] = await Promise.all([
      sbGet('office_departments?order=code&is_active=eq.true'),
      sbGet('office_agents?select=dept_code&is_active=eq.true'),
      sbGet('office_tasks?status=in.(pending,in_progress)&order=created_at.desc&limit=5')
    ])
    const countByDept = {}
    for (const a of agents) countByDept[a.dept_code] = (countByDept[a.dept_code]||0)+1

    let out = `⚡ PACM AI OFFICE — ${now}\n${'━'.repeat(44)}\n\n`
    out += `📋 부서 현황 (${depts.length}개 부서, 총 ${agents.length}명)\n\n`
    for (const d of depts) {
      const cnt = countByDept[d.code] || 0
      out += `  ${d.name_ko.padEnd(8)} [${cnt.toString().padStart(2)}명] — ${d.description.slice(0,25)}\n`
    }
    out += `\n🔄 진행 중 업무 (${tasks.length}건)\n\n`
    if (tasks.length === 0) {
      out += '  대기 중인 업무 없음\n'
    } else {
      for (const t of tasks) {
        out += `  [${t.priority.toUpperCase()}] ${t.title.slice(0,35)} — ${t.status}\n`
      }
    }
    out += `\n${'━'.repeat(44)}`
    return json({ type: 'status', output: out })
  }

  // ── ls
  if (cmd === 'ls') {
    const deptInput = parts.slice(1).join(' ').toLowerCase()
    const deptCode = DEPT_CODE[deptInput]

    if (!deptInput) {
      // 전체 부서 목록
      const depts = await sbGet('office_departments?order=code&is_active=eq.true')
      let out = `\n📂 부서 목록\n${'━'.repeat(40)}\n\n`
      for (const d of depts) {
        out += `  ${d.code.padEnd(12)} ${d.name_ko.padEnd(8)} — ${d.description.slice(0,28)}\n`
      }
      out += `\n사용법: ls [부서명]  예) ls 개발부`
      return json({ type: 'ls', output: out })
    }

    if (!deptCode) {
      return json({ type: 'error', output: `❌ 부서를 찾을 수 없습니다: "${deptInput}"\n사용 가능: 경영부, 기획부, 개발부, 디자인부, qa팀, ai연구소, 마케팅부, 콘텐츠부, 보안팀` })
    }

    const agents = await sbGet(`office_agents?dept_code=eq.${deptCode}&order=id&is_active=eq.true`)
    let out = `\n👥 ${DEPT_KO[deptCode]} 직원 (${agents.length}명)\n${'━'.repeat(44)}\n\n`
    for (const a of agents) {
      out += `  ${a.name.padEnd(12)} ${a.role.slice(0,18).padEnd(18)} ${(a.specialty||[]).slice(0,2).join(', ')}\n`
    }
    return json({ type: 'ls', output: out })
  }

  // ── assign
  if (cmd === 'assign') {
    const deptInput = parts[1]?.toLowerCase()
    const taskTitle = parts.slice(2).join(' ')
    const deptCode = DEPT_CODE[deptInput] || deptInput

    if (!taskTitle) return json({ type: 'error', output: '사용법: assign [부서명] [업무내용]' })

    // 해당 부서 리드(첫 번째 직원) 찾기
    const agents = await sbGet(`office_agents?dept_code=eq.${deptCode}&order=id&limit=1`)
    if (!agents.length) return json({ type: 'error', output: `❌ 부서를 찾을 수 없습니다: ${deptInput}` })

    const lead = agents[0]

    // 업무 생성
    const [task] = await sbPost('office_tasks', {
      title: taskTitle,
      dept_code: deptCode,
      agent_id: lead.id,
      status: 'in_progress',
      priority: 'normal',
      started_at: new Date().toISOString()
    })

    // 에이전트 AI 응답
    const response = await agentRespond(lead, taskTitle)

    // 작업 로그
    await sbPost('office_work_logs', {
      task_id: task?.id,
      agent_id: lead.id,
      dept_code: deptCode,
      action: '업무 접수',
      detail: taskTitle,
      output: response
    })

    let out = `\n✅ 업무 배분 완료\n${'━'.repeat(44)}\n`
    out += `  부서: ${DEPT_KO[deptCode] || deptCode}\n`
    out += `  담당: ${lead.name} (${lead.role})\n`
    out += `  업무: ${taskTitle}\n`
    out += `  ID: ${task?.id?.slice(0,8) || 'N/A'}\n\n`
    out += `💬 ${lead.name}:\n${response}`
    return json({ type: 'assign', output: out, task_id: task?.id })
  }

  // ── call
  if (cmd === 'call') {
    const agentName = parts[1]
    const message = parts.slice(2).join(' ')

    if (!agentName || !message) return json({ type: 'error', output: '사용법: call [직원명] [메시지]' })

    const agents = await sbGet(`office_agents?name=ilike.${agentName}&limit=1`)
    if (!agents.length) return json({ type: 'error', output: `❌ 직원을 찾을 수 없습니다: ${agentName}` })

    const agent = agents[0]
    const response = await agentRespond(agent, message)

    // 로그 기록
    await sbPost('office_work_logs', {
      agent_id: agent.id,
      dept_code: agent.dept_code,
      action: '직접 호출',
      detail: message,
      output: response
    })

    let out = `\n📞 ${agent.name} (${DEPT_KO[agent.dept_code]} / ${agent.role})\n${'━'.repeat(44)}\n\n`
    out += `💬 ${response}`
    return json({ type: 'call', output: out })
  }

  // ── parallel
  if (cmd === 'parallel') {
    const taskStr = raw.slice(9) // "parallel " 이후
    const taskList = taskStr.split('|').map(t => t.trim()).filter(Boolean)

    if (taskList.length < 2) return json({ type: 'error', output: '사용법: parallel [부서 업무1]|[부서 업무2]|...' })

    let out = `\n⚡ 병렬 업무 실행 (${taskList.length}개)\n${'━'.repeat(44)}\n\n`
    const results = []

    // 모든 업무 병렬 처리
    const promises = taskList.map(async (t) => {
      const tParts = t.trim().split(/\s+/)
      const dCode = DEPT_CODE[tParts[0]?.toLowerCase()]
      const tTitle = dCode ? tParts.slice(1).join(' ') : t

      if (!dCode || !tTitle) return { dept: tParts[0], task: t, error: '부서 인식 실패' }

      const agents = await sbGet(`office_agents?dept_code=eq.${dCode}&order=id&limit=1`)
      if (!agents.length) return { dept: dCode, task: tTitle, error: '부서 없음' }

      const lead = agents[0]
      const response = await agentRespond(lead, tTitle)

      await sbPost('office_tasks', {
        title: tTitle, dept_code: dCode, agent_id: lead.id,
        status: 'in_progress', parallel: true,
        started_at: new Date().toISOString()
      })

      return { dept: DEPT_KO[dCode], agent: lead.name, task: tTitle, response }
    })

    const outcomes = await Promise.all(promises)

    for (const o of outcomes) {
      if (o.error) {
        out += `  ❌ [${o.dept}] ${o.error}\n\n`
      } else {
        out += `  ✅ [${o.dept}] → ${o.agent}\n`
        out += `  업무: ${o.task}\n`
        out += `  💬 ${o.response.slice(0, 120)}...\n\n`
      }
    }

    out += `${'━'.repeat(44)}\n모든 업무가 동시에 시작됐습니다.`
    return json({ type: 'parallel', output: out })
  }

  // ── report
  if (cmd === 'report') {
    const tasks = await sbGet('office_tasks?status=in.(pending,in_progress,review)&order=created_at.desc&limit=20&select=*,logs:office_work_logs(count)')
    let out = `\n📊 업무 현황 리포트 — ${now}\n${'━'.repeat(44)}\n\n`

    if (!tasks.length) {
      out += '  진행 중인 업무 없음\n'
    } else {
      for (const t of tasks) {
        const deptKo = DEPT_KO[t.dept_code] || t.dept_code
        out += `  [${t.priority.toUpperCase().padEnd(6)}] ${t.title.slice(0,30).padEnd(30)} | ${deptKo} | ${t.status}\n`
      }
    }
    out += `\n총 ${tasks.length}건 진행 중`
    return json({ type: 'report', output: out })
  }

  // ── log
  if (cmd === 'log') {
    const logs = await sbGet('office_work_logs?order=created_at.desc&limit=10&select=*,agent:office_agents(name,dept_code)')
    let out = `\n📋 최근 업무 로그\n${'━'.repeat(44)}\n\n`
    for (const l of logs) {
      const agent = l.agent
      const dept = agent ? DEPT_KO[agent.dept_code] : '?'
      const t = new Date(l.created_at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })
      out += `  ${t} [${dept}] ${agent?.name || '?'} — ${l.action}: ${l.detail?.slice(0,40)}\n`
    }
    return json({ type: 'log', output: out })
  }

  return json({ type: 'error', output: `❌ 알 수 없는 명령어: "${cmd}"\n"help"를 입력하면 명령어 목록을 볼 수 있습니다.` })
}

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

function json(data) {
  return cors(new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  }))
}
