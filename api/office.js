/**
 * PACM AI OFFICE API v3
 * 자체 AI 엔진 전용 — 외부 API 완전 제거
 * SUPABASE_URL (서버사이드 환경변수) 사용
 */
// runtime: Node.js serverless

import { generateChat, generateText } from './ai-engine.js'

const SB_URL = process.env.SUPABASE_URL          // ← 서버사이드 env (VITE_ 제거)
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

const H = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
})

const DEPT_KO = {
  management:'경영부', planning:'기획부', dev:'개발부',
  design:'디자인부', qa:'QA팀', research:'AI연구소',
  marketing:'마케팅부', content:'콘텐츠부', security:'보안팀',
}
const DEPT_CODE = {
  '경영부':'management','기획부':'planning','개발부':'dev',
  '디자인부':'design','qa팀':'qa','qa':'qa','ai연구소':'research',
  '연구소':'research','마케팅부':'marketing','콘텐츠부':'content','보안팀':'security',
}

// 부서별 ai-engine 페르소나 username 매핑
const DEPT_USERNAME = {
  management: 'ai_max',
  planning:   'ai_aria',
  dev:        'ai_learn',
  design:     'ai_nova',
  qa:         'ai_tch_vega',
  research:   'ai_learn',
  marketing:  'ai_mgt_alba',
  content:    'ai_nova',
  security:   'ai_tch_vega',
}

// 부서별 에이전트 표시 정보 (AI 엔진이 생성하므로 persona는 메타데이터만)
const AGENTS = {
  management: { name:'Adonis', role:'경영 총괄 디렉터' },
  planning:   { name:'Prism',  role:'서비스 기획 리드' },
  dev:        { name:'Core',   role:'백엔드 리드' },
  design:     { name:'Luma',   role:'디자인 리드' },
  qa:         { name:'Shield', role:'QA 리드' },
  research:   { name:'Nova-AI',role:'AI 수석 연구원' },
  marketing:  { name:'Spark',  role:'마케팅 리드' },
  content:    { name:'Scout',  role:'콘텐츠 수집 에이전트' },
  security:   { name:'Cipher', role:'보안 리드' },
}

function ok(data) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
function err(msg, status = 400) {
  return new Response(JSON.stringify({ type: 'error', output: '❌ ' + msg }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function sbGet(path) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H() })
    if (!r.ok) return []
    return r.json().catch(() => [])
  } catch { return [] }
}
async function sbPost(table, data) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: 'POST', headers: H(), body: JSON.stringify(data),
    })
    return r.json().catch(() => null)
  } catch { return null }
}
async function sbPatch(table, filter, data) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
      method: 'PATCH', headers: H(), body: JSON.stringify(data),
    })
    return r.json().catch(() => null)
  } catch { return null }
}

// ── 자체 AI 엔진 응답 생성 (외부 API 완전 제거) ──────────────────────
function generateAgentResponse(deptCode, task) {
  const username = DEPT_USERNAME[deptCode] || 'ai_aria'
  const agent    = AGENTS[deptCode] || { name: '담당자', role: '담당자' }
  const deptKo   = DEPT_KO[deptCode] || deptCode

  // generateText로 업무 응답 생성 (자체 AI 엔진)
  const generated = generateText(username, task, { type: 'chat', topic: task, room: 'ops' })

  if (generated) return generated

  // fallback — 페르소나 없을 경우 기본 템플릿
  const templates = [
    `[${agent.name}] "${task}" 업무를 접수했습니다. ${deptKo}에서 최우선으로 처리하겠습니다. 진행 상황은 업무 로그에 기록할게요.`,
    `[${agent.name}] 해당 업무 확인했습니다. "${task}" — ${deptKo} 차원에서 즉시 대응하겠습니다. 결과 보고 드리겠습니다.`,
    `[${agent.name}] "${task}" 관련 업무 지시 수령했습니다. 담당 팀과 조율해서 빠르게 처리하겠습니다.`,
  ]
  return templates[Math.floor(Date.now() / 1000) % templates.length]
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  // ── GET: 업무 목록 / 통계 조회 ───────────────────────────────────
  if (req.method === 'GET') {
    if (!SB_URL || !SB_KEY) return ok({ ok: true, service: 'PACM AI Office v3' })

    const url    = new URL(req.url)
    const action = url.searchParams.get('action') || 'tasks'

    if (action === 'tasks') {
      try {
        const tasks = await sbGet(
          'office_tasks?select=*,agent:office_agents(name,role,dept_code)&order=created_at.desc&limit=50'
        )
        return ok({ type: 'tasks', data: Array.isArray(tasks) ? tasks : [] })
      } catch { return ok({ type: 'tasks', data: [] }) }
    }

    if (action === 'stats') {
      try {
        const [tasks, agents] = await Promise.all([
          sbGet('office_tasks?select=status'),
          sbGet('office_agents?select=dept_code&is_active=eq.true'),
        ])
        const t = Array.isArray(tasks) ? tasks : []
        return ok({
          type:        'stats',
          total:       t.length,
          in_progress: t.filter(x => x.status === 'in_progress').length,
          done:        t.filter(x => x.status === 'done').length,
          pending:     t.filter(x => x.status === 'pending').length,
          agents:      Array.isArray(agents) ? agents.length : 0,
        })
      } catch { return ok({ type: 'stats', total: 0, in_progress: 0, done: 0, pending: 0, agents: 0 }) }
    }

    if (action === 'logs') {
      try {
        const logs = await sbGet(
          'office_work_logs?select=*,agent:office_agents(name)&order=created_at.desc&limit=30'
        )
        return ok({ type: 'logs', data: Array.isArray(logs) ? logs : [] })
      } catch { return ok({ type: 'logs', data: [] }) }
    }

    return ok({ ok: true, service: 'PACM AI Office v3', engine: 'self-ai' })
  }

  if (req.method !== 'POST') return err('Method not allowed', 405)

  if (!SB_URL || !SB_KEY) return err('Missing Supabase env', 500)

  let body
  try { body = await req.json() } catch { return err('JSON 파싱 실패') }

  const { action, cmd } = body

  // ── REST 액션: assign ─────────────────────────────────────────────
  if (action === 'assign') {
    const { dept, title, priority = 'normal' } = body
    const deptCode = DEPT_CODE[dept] || dept
    if (!deptCode || !title) return err('부서와 업무 내용이 필요합니다')

    const agents = await sbGet(`office_agents?dept_code=eq.${deptCode}&order=id&limit=1`)
    const agent  = Array.isArray(agents) ? agents[0] : null
    if (!agent) return err(`부서를 찾을 수 없습니다: ${dept}`)

    // 자체 AI 엔진으로 응답 생성
    const aiResp   = generateAgentResponse(deptCode, title)
    const taskData = {
      title, dept_code: deptCode, priority, status: 'in_progress',
      agent_id: agent.id, ai_response: aiResp, progress: 10,
      started_at: new Date().toISOString(), parallel: false,
    }
    const taskRes = await sbPost('office_tasks', taskData)
    const task    = Array.isArray(taskRes) ? taskRes[0] : taskRes

    if (task?.id) {
      await sbPost('office_work_logs', {
        task_id: task.id, agent_id: agent.id, dept_code: deptCode,
        action: '업무 접수', detail: title, output: aiResp,
      })
    }

    return ok({
      type:       'assign',
      output:     `✅ ${DEPT_KO[deptCode]} → ${agent.name}\n업무: ${title}\n\n${agent.name}:\n${aiResp}`,
      task,
      agent_name: agent.name,
    })
  }

  // ── REST 액션: complete ───────────────────────────────────────────
  if (action === 'complete') {
    const { task_id } = body
    if (!task_id) return err('task_id 필요')
    await sbPatch('office_tasks', `id=eq.${task_id}`, {
      status: 'done', progress: 100, completed_at: new Date().toISOString(),
    })
    return ok({ type: 'complete', output: '✅ 업무 완료 처리됨' })
  }

  // ── REST 액션: parallel ───────────────────────────────────────────
  if (action === 'parallel') {
    const { tasks } = body
    if (!tasks?.length) return err('tasks 배열 필요')
    const results = await Promise.all(tasks.map(async t => {
      const code  = DEPT_CODE[t.dept] || t.dept
      if (!code) return { error: `부서 미인식: ${t.dept}` }
      const agents = await sbGet(`office_agents?dept_code=eq.${code}&order=id&limit=1`)
      const agent  = Array.isArray(agents) ? agents[0] : null
      if (!agent) return { error: `에이전트 없음: ${t.dept}` }
      const aiResp = generateAgentResponse(code, t.title)
      const taskRes = await sbPost('office_tasks', {
        title: t.title, dept_code: code, priority: t.priority || 'normal',
        status: 'in_progress', agent_id: agent.id, ai_response: aiResp,
        progress: 10, parallel: true, started_at: new Date().toISOString(),
      })
      return { dept: DEPT_KO[code], agent: agent.name, title: t.title, aiResp, task: Array.isArray(taskRes) ? taskRes[0] : taskRes }
    }))
    return ok({
      type: 'parallel', results,
      output: results.map(r => r.error ? `❌ ${r.error}` : `✅ [${r.dept}] ${r.agent}: ${r.title}`).join('\n'),
    })
  }

  // ── 터미널 cmd 처리 ───────────────────────────────────────────────
  if (cmd !== undefined) {
    const raw   = (cmd || '').trim()
    const parts = raw.split(/\s+/)
    const c     = parts[0]?.toLowerCase()
    const now   = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

    if (!c || c === 'help') {
      return ok({ type: 'help', output: `⚡ PACM AI OFFICE TERMINAL v3\n${'━'.repeat(40)}\n\n  status                   전체 현황\n  ls                       부서 목록\n  ls [부서명]              직원 목록\n  assign [부서] [업무]     업무 배분 → AI 응답\n  call [직원명] [메시지]   직원 호출\n  parallel [부서 업무]|[부서 업무]  병렬 실행\n  report                   업무 현황\n  log                      최근 로그\n  help                     도움말\n\n예시:\n  assign 개발부 Sparkship 버그 수정\n  call Prism 온보딩 플로우 개선 방안\n  parallel 기획부 UX 검토|개발부 API 최적화\n${'━'.repeat(40)}` })
    }

    if (c === 'status') {
      const [tasks, agents] = await Promise.all([
        sbGet('office_tasks?select=status'),
        sbGet('office_agents?select=dept_code&is_active=eq.true'),
      ])
      const t = Array.isArray(tasks) ? tasks : []
      let out = `⚡ PACM AI OFFICE — ${now}\n${'━'.repeat(44)}\n\n부서: 9개 · 직원: ${Array.isArray(agents) ? agents.length : 90}명\n\n`
      for (const [code, ko] of Object.entries(DEPT_KO)) {
        const cnt = t.filter(x => x.dept_code === code).length
        out += `  ${ko.padEnd(7)}  업무 ${cnt}건\n`
      }
      out += `\n전체: ${t.length}건 | 진행: ${t.filter(x => x.status === 'in_progress').length}건 | 완료: ${t.filter(x => x.status === 'done').length}건\n${'━'.repeat(44)}`
      return ok({ type: 'status', output: out })
    }

    if (c === 'ls') {
      const deptIn = parts.slice(1).join(' ').toLowerCase()
      if (!deptIn) {
        let out = `\n부서 목록\n${'━'.repeat(38)}\n\n`
        for (const [code, ko] of Object.entries(DEPT_KO)) {
          const a = AGENTS[code]
          out += `  ${ko.padEnd(7)}  리드: ${a.name.padEnd(10)}  ${a.role}\n`
        }
        return ok({ type: 'ls', output: out })
      }
      const code = DEPT_CODE[deptIn]
      if (!code) return ok({ type: 'error', output: `부서를 찾을 수 없습니다: "${deptIn}"` })
      const agents = await sbGet(`office_agents?dept_code=eq.${code}&order=id&select=name,role`)
      const aList  = Array.isArray(agents) ? agents : []
      let out = `\n${DEPT_KO[code]} 직원 (${aList.length}명)\n${'━'.repeat(38)}\n\n`
      aList.forEach((a, i) => { out += `  ${(i + 1).toString().padStart(2)}. ${a.name.padEnd(12)} ${a.role}\n` })
      return ok({ type: 'ls', output: out })
    }

    if (c === 'assign') {
      const deptIn   = parts[1]?.toLowerCase()
      const title    = parts.slice(2).join(' ')
      const deptCode = DEPT_CODE[deptIn] || deptIn
      if (!title) return ok({ type: 'error', output: '사용법: assign [부서명] [업무내용]' })
      if (!DEPT_KO[deptCode]) return ok({ type: 'error', output: `부서 미인식: "${deptIn}"` })
      const agents = await sbGet(`office_agents?dept_code=eq.${deptCode}&order=id&limit=1`)
      const agent  = Array.isArray(agents) ? agents[0] : null
      if (!agent) return ok({ type: 'error', output: `에이전트 없음: ${deptIn}` })
      const aiResp  = generateAgentResponse(deptCode, title)
      const taskRes = await sbPost('office_tasks', {
        title, dept_code: deptCode, priority: 'normal', status: 'in_progress',
        agent_id: agent.id, ai_response: aiResp, progress: 10,
        started_at: new Date().toISOString(),
      })
      const task = Array.isArray(taskRes) ? taskRes[0] : taskRes
      if (task?.id) {
        await sbPost('office_work_logs', {
          task_id: task.id, agent_id: agent.id, dept_code: deptCode,
          action: '업무 접수', detail: title, output: aiResp,
        })
      }
      return ok({ type: 'assign', output: `✅ 업무 배분 완료\n${'━'.repeat(40)}\n  부서: ${DEPT_KO[deptCode]}\n  담당: ${agent.name} (${agent.role})\n  업무: ${title}\n  ID: ${task?.id?.slice(0, 8) || '?'}\n\n${agent.name}의 응답:\n${aiResp}` })
    }

    if (c === 'call') {
      const name = parts[1]
      const msg  = parts.slice(2).join(' ')
      if (!name || !msg) return ok({ type: 'error', output: '사용법: call [직원명] [메시지]' })
      const agents = await sbGet(`office_agents?name=ilike.${name}&limit=1`)
      const aList  = Array.isArray(agents) ? agents : []
      if (!aList.length) return ok({ type: 'error', output: `직원 미발견: ${name}` })
      const a    = aList[0]
      const resp = generateAgentResponse(a.dept_code, msg)
      return ok({ type: 'call', output: `📞 ${a.name} (${DEPT_KO[a.dept_code] || a.dept_code} / ${a.role})\n${'━'.repeat(40)}\n${resp}` })
    }

    if (c === 'parallel') {
      const taskStr  = raw.slice(9)
      const taskList = taskStr.split('|').map(t => t.trim()).filter(Boolean)
      if (taskList.length < 2) return ok({ type: 'error', output: '사용법: parallel [부서 업무]|[부서 업무]|...' })
      const results = await Promise.all(taskList.map(async t => {
        const tp    = t.split(/\s+/)
        const code  = DEPT_CODE[tp[0]?.toLowerCase()]
        const title = code ? tp.slice(1).join(' ') : t
        if (!code || !title) return { error: true, dept: tp[0], task: t }
        const agents = await sbGet(`office_agents?dept_code=eq.${code}&order=id&limit=1`)
        const agent  = Array.isArray(agents) ? agents[0] : null
        if (!agent) return { error: true, dept: code, task: title }
        const resp = generateAgentResponse(code, title)
        await sbPost('office_tasks', {
          title, dept_code: code, priority: 'normal', status: 'in_progress',
          agent_id: agent.id, ai_response: resp, progress: 10,
          parallel: true, started_at: new Date().toISOString(),
        })
        return { dept: DEPT_KO[code], agent: agent.name, task: title, resp }
      }))
      let out = `⚡ 병렬 업무 실행 (${results.length}개)\n${'━'.repeat(40)}\n\n`
      for (const r of results) {
        if (r.error) out += `❌ [${r.dept}] 처리 실패\n\n`
        else out += `✅ [${r.dept}] → ${r.agent}\n업무: ${r.task}\n${r.resp}\n\n`
      }
      out += '모든 업무가 동시에 시작됐습니다.'
      return ok({ type: 'parallel', output: out })
    }

    if (c === 'report') {
      const tasks = await sbGet('office_tasks?order=created_at.desc&limit=20&select=title,status,priority,dept_code,created_at')
      const t     = Array.isArray(tasks) ? tasks : []
      let out = `\n업무 현황 — ${now}\n${'━'.repeat(40)}\n\n`
      if (!t.length) out += '진행 중인 업무 없음\n'
      else t.forEach(x => {
        const age = Math.floor((Date.now() - new Date(x.created_at)) / 60000)
        out += `  [${x.status === 'done' ? '완료' : x.status === 'in_progress' ? '진행' : '대기'}] ${x.title.slice(0, 30).padEnd(30)} | ${DEPT_KO[x.dept_code] || x.dept_code} | ${age}분 전\n`
      })
      out += `\n총 ${t.length}건`
      return ok({ type: 'report', output: out })
    }

    if (c === 'log') {
      const logs = await sbGet('office_work_logs?order=created_at.desc&limit=10&select=action,detail,dept_code,created_at,agent:office_agents(name)')
      const l    = Array.isArray(logs) ? logs : []
      let out = `\n최근 업무 로그\n${'━'.repeat(38)}\n\n`
      l.forEach(x => {
        const t = new Date(x.created_at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })
        out += `  ${t} [${DEPT_KO[x.dept_code] || x.dept_code}] ${x.agent?.name || '?'} — ${x.action}: ${(x.detail || '').slice(0, 35)}\n`
      })
      if (!l.length) out += '로그 없음\n'
      return ok({ type: 'log', output: out })
    }

    return ok({ type: 'error', output: `알 수 없는 명령어: "${c}"\n"help"를 입력하세요` })
  }

  return err('action 또는 cmd 필요')
}
