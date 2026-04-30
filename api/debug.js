/**
 * api/debug.js — Vercel Node.js 24 정밀 진단 엔드포인트
 * staff-chat.js / staff-chat-auto.js 500 에러 원인 캡처용
 * ★ 배포 후 즉시 삭제 예정
 */
export const config = { maxDuration: 10 }

export default async function handler(req) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const result = {
    node_version: process.version,
    platform: process.platform,
    env_present: {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      CRON_SECRET: !!process.env.CRON_SECRET,
    },
    tests: {},
  }

  // Test 1: staff-chat.js 직접 임포트
  try {
    const mod = await import('./staff-chat.js')
    result.tests.staff_chat_import = { ok: true, exports: Object.keys(mod) }

    // GET 핸들러 직접 호출
    try {
      const testReq = new Request(
        `${req.url.replace('/api/debug', '/api/staff-chat')}?room=general&limit=1`,
        { method: 'GET', headers: req.headers }
      )
      const res = await mod.default(testReq)
      const body = await res.json().catch(e => ({ parse_error: e.message }))
      result.tests.staff_chat_get = {
        ok: res.status < 500,
        status: res.status,
        body_keys: Object.keys(body),
        error: body.error || null,
      }
    } catch (e) {
      result.tests.staff_chat_get = { ok: false, error: e.message, stack: e.stack?.split('\n').slice(0, 6) }
    }
  } catch (e) {
    result.tests.staff_chat_import = {
      ok: false,
      error: e.message,
      name: e.constructor?.name,
      stack: e.stack?.split('\n').slice(0, 8),
    }
  }

  // Test 2: staff-chat-auto.js 직접 임포트
  try {
    const mod = await import('./staff-chat-auto.js')
    result.tests.staff_chat_auto_import = { ok: true, exports: Object.keys(mod) }

    try {
      const testReq = new Request(
        `${req.url.replace('/api/debug', '/api/staff-chat-auto')}?action=status`,
        { method: 'GET', headers: req.headers }
      )
      const res = await mod.default(testReq)
      const body = await res.json().catch(e => ({ parse_error: e.message }))
      result.tests.staff_chat_auto_get = {
        ok: res.status < 500,
        status: res.status,
        body_keys: body ? Object.keys(body) : [],
        error: body?.error || null,
      }
    } catch (e) {
      result.tests.staff_chat_auto_get = { ok: false, error: e.message, stack: e.stack?.split('\n').slice(0, 6) }
    }
  } catch (e) {
    result.tests.staff_chat_auto_import = {
      ok: false,
      error: e.message,
      name: e.constructor?.name,
      stack: e.stack?.split('\n').slice(0, 8),
    }
  }

  // Test 3: _staff-brain.js 직접 임포트
  try {
    const mod = await import('./_staff-brain.js')
    const exports_list = Object.keys(mod)
    result.tests.staff_brain_import = { ok: true, export_count: exports_list.length, exports: exports_list }
  } catch (e) {
    result.tests.staff_brain_import = {
      ok: false,
      error: e.message,
      name: e.constructor?.name,
      stack: e.stack?.split('\n').slice(0, 8),
    }
  }

  // Test 4: _staff-persona-engine.js 직접 임포트
  try {
    const mod = await import('./_staff-persona-engine.js')
    const exports_list = Object.keys(mod)
    result.tests.staff_persona_import = { ok: true, export_count: exports_list.length, exports: exports_list }
  } catch (e) {
    result.tests.staff_persona_import = {
      ok: false,
      error: e.message,
      name: e.constructor?.name,
      stack: e.stack?.split('\n').slice(0, 8),
    }
  }

  // Test 5: Supabase 연결 테스트
  try {
    const sbUrl = process.env.SUPABASE_URL
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (sbUrl && sbKey) {
      const r = await fetch(`${sbUrl}/rest/v1/staff_chat_messages?limit=0&select=id`, {
        method: 'HEAD',
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      })
      result.tests.supabase_staff_chat_table = {
        ok: r.status < 500,
        status: r.status,
        table_exists: r.status === 200 || r.status === 204,
      }
    } else {
      result.tests.supabase_staff_chat_table = { ok: false, error: 'Missing SUPABASE env vars' }
    }
  } catch (e) {
    result.tests.supabase_staff_chat_table = { ok: false, error: e.message }
  }

  const allOk = Object.values(result.tests).every(t => t.ok)
  return new Response(JSON.stringify(result, null, 2), {
    status: allOk ? 200 : 207,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
