/**
 * api/setup.js — DB 설정 통합 라우터 v1.0
 * /api/setup-db, /api/db-setup, /api/db-setup-staff, /api/setup-rag, /api/add-knowledge
 */
export const config = { runtime: 'edge' }


const handleSetupDb = (() => {
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/setup-db.js — 전체 DB 초기화 v4                                ║
 * ║                                                                      ║
 * ║  POST : exec_sql RPC로 스키마 적용 → 실패 시 manual SQL 반환        ║
 * ║  GET  : 각 테이블/컬럼 존재 여부 확인 반환                          ║
 * ║                                                                      ║
 * ║  v4 변경:                                                            ║
 * ║  - Management API 완전 제거 (service_role 키로 항상 401)            ║
 * ║  - exec_sql RPC 방식으로 전환 (PostgREST 경유)                      ║
 * ║  - exec_sql 없으면 즉시 manual_sql 반환                             ║
 * ║  - AI 팀원 upsert: REST API INSERT ON CONFLICT 방식으로 전환        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */


const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const H = () => ({
  apikey:         SB_KEY,
  Authorization:  `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (d, s = 200) =>
  new Response(JSON.stringify(d, null, 2), {
    status: s, headers: { 'Content-Type': 'application/json', ...CORS },
  })

// ══════════════════════════════════════════════════════════════════════
// 인증
// ══════════════════════════════════════════════════════════════════════

async function checkAdminJWT(token) {
  if (!token || !SB_URL || !SB_KEY) return false
  try {
    // 1) token으로 user.id 조회
    const r1 = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r1.ok) return false
    const user = await r1.json().catch(() => null)
    if (!user?.id) return false
    // 2) service_role 키로 role 확인 (RLS 우회)
    const r2 = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    )
    if (!r2.ok) return false
    const rows = await r2.json().catch(() => [])
    return Array.isArray(rows) && rows[0]?.role === 'admin'
  } catch { return false }
}

// ══════════════════════════════════════════════════════════════════════
// SQL 상수
// ══════════════════════════════════════════════════════════════════════

// exec_sql RPC용 — 전체 스키마 DDL (단일 트랜잭션)
const SCHEMA_SQL = `
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspend_reason text;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS like_count integer DEFAULT 0;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments(id);
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_category text;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS read_time integer DEFAULT 3;
CREATE OR REPLACE FUNCTION public.increment_post_view(post_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.community_posts SET view_count = view_count + 1 WHERE id = post_id AND is_deleted = false; $$;
CREATE OR REPLACE FUNCTION public.update_reply_count() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP = 'INSERT' THEN UPDATE public.community_posts SET reply_count = reply_count + 1 WHERE id = NEW.post_id; ELSIF TG_OP = 'DELETE' THEN UPDATE public.community_posts SET reply_count = GREATEST(0, reply_count-1) WHERE id = OLD.post_id; END IF; RETURN NULL; END; $$;
DROP TRIGGER IF EXISTS comment_count_trigger ON public.comments;
CREATE TRIGGER comment_count_trigger AFTER INSERT OR DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.update_reply_count();
CREATE TABLE IF NOT EXISTS public.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, content text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000), is_read boolean DEFAULT false, created_at timestamptz DEFAULT now());
ALTER TABLE IF EXISTS public.messages ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.comment_likes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE, created_at timestamptz DEFAULT now(), UNIQUE(user_id, comment_id));
ALTER TABLE IF EXISTS public.comment_likes ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.ai_operations_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_type text NOT NULL, run_date date NOT NULL DEFAULT current_date, result text NOT NULL DEFAULT 'success', details text, engine text, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT ai_ops_result_check CHECK (result IN ('success','error','skipped')));
CREATE INDEX IF NOT EXISTS ai_ops_task_date_idx ON public.ai_operations_log(task_type, run_date DESC);
ALTER TABLE IF EXISTS public.ai_operations_log ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.newsletter_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject text, sent_count int NOT NULL DEFAULT 0, engine text, sent_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE IF EXISTS public.newsletter_logs ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.ai_notices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, post_id uuid REFERENCES public.community_posts(id) ON DELETE SET NULL, notice_date date NOT NULL DEFAULT current_date, day_of_week smallint, engine text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE IF EXISTS public.ai_notices ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.staff_chat_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room text NOT NULL DEFAULT 'general', sender_key text NOT NULL, sender_name text NOT NULL, sender_emoji text, sender_color text, sender_team text, message text NOT NULL CHECK (char_length(message) <= 2000), msg_type text NOT NULL DEFAULT 'chat', reply_to uuid REFERENCES public.staff_chat_messages(id) ON DELETE SET NULL, is_deleted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_scm_room_time ON public.staff_chat_messages(room, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scm_sender ON public.staff_chat_messages(sender_key);
ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scm_service_all ON public.staff_chat_messages;
CREATE POLICY scm_service_all ON public.staff_chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS scm_admin_all ON public.staff_chat_messages;
CREATE POLICY scm_admin_all ON public.staff_chat_messages FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
`.trim()

// AdminPage에서 직접 복사해 실행할 Manual SQL (exec_sql RPC 없을 때)
const MANUAL_SQL = SCHEMA_SQL

// AI 팀원 프로필 — REST API upsert용 (ON CONFLICT username)
const AI_TEAM_PROFILES = [
  { id:'00000000-0000-0000-0000-000000000001', email:'ai.aria@insightship.ai',  username:'ai_aria',  display_name:'ARIA',  bio:'Insightship 운영팀 총괄 AI입니다. 커뮤니티 공지, 토론 주제, 이벤트를 담당합니다.',                                                    role:'writer', is_verified:true, avatar_url:'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=aria&backgroundColor=0f0f1a&radius=50' },
  { id:'00000000-0000-0000-0000-000000000002', email:'ai.nova@insightship.ai',  username:'ai_nova',  display_name:'NOVA',  bio:'Insightship 편집장 AI입니다. 스타트업 뉴스를 분석해 인사이트 아티클, 창업 가이드, 칼럼을 씁니다.',                                      role:'writer', is_verified:true, avatar_url:'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=nova&backgroundColor=0f0f1a&radius=50' },
  { id:'00000000-0000-0000-0000-000000000003', email:'ai.lumi@insightship.ai',  username:'ai_lumi',  display_name:'LUMI',  bio:'Insightship AI 멘토 LUMI입니다. 창업 아이디어 검증, 린 캔버스, MVP 설계 등 창업의 모든 과정을 함께합니다.',                              role:'writer', is_verified:true, avatar_url:'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=lumi&backgroundColor=0f0f1a&radius=50' },
  { id:'00000000-0000-0000-0000-000000000004', email:'ai.pulse@insightship.ai', username:'ai_pulse', display_name:'PULSE', bio:'Insightship 뉴스 큐레이터 PULSE입니다. 매시간 스타트업 뉴스를 수집하고 AI 요약을 붙입니다.',                                           role:'writer', is_verified:true, avatar_url:'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=pulse&backgroundColor=0f0f1a&radius=50' },
  { id:'00000000-0000-0000-0000-000000000005', email:'ai.trend@insightship.ai', username:'ai_trend', display_name:'TREND', bio:'Insightship 트렌드 분석가 TREND입니다. 매 6시간마다 스타트업 시장의 트렌드를 분석합니다.',                                            role:'writer', is_verified:true, avatar_url:'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=trend&backgroundColor=0f0f1a&radius=50' },
  { id:'00000000-0000-0000-0000-000000000006', email:'ai.sage@insightship.ai',  username:'ai_sage',  display_name:'SAGE',  bio:'Insightship 리포트 작성 AI SAGE입니다. 매주 금요일 투자·시장·트렌드 종합 분석 리포트를 발행합니다.',                                   role:'writer', is_verified:true, avatar_url:'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=sage&backgroundColor=0f0f1a&radius=50' },
  { id:'00000000-0000-0000-0000-000000000007', email:'ai.echo@insightship.ai',  username:'ai_echo',  display_name:'ECHO',  bio:'Insightship 뉴스레터 에디터 ECHO입니다. 매주 월요일 아침, 창업·투자·시장 인사이트를 이메일로 전합니다.',                              role:'writer', is_verified:true, avatar_url:'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=echo&backgroundColor=0f0f1a&radius=50' },
  { id:'00000000-0000-0000-0000-000000000008', email:'ai.learn@insightship.ai', username:'ai_learn', display_name:'LEARN', bio:'Insightship AI 학습 엔지니어 LEARN입니다. 매일 피드백과 대화 패턴을 분석해 AI 멘토 LUMI를 진화시킵니다.',                          role:'writer', is_verified:true, avatar_url:'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=learn&backgroundColor=0f0f1a&radius=50' },
]

// ══════════════════════════════════════════════════════════════════════
// 헬퍼
// ══════════════════════════════════════════════════════════════════════

// exec_sql RPC 시도 — Supabase에 함수가 없으면 즉시 실패 반환
async function tryExecSql(sql) {
  if (!SB_URL || !SB_KEY) return { ok: false, reason: 'missing env' }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
      method:  'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body:    JSON.stringify({ sql }),
    })
    if (r.ok || r.status === 204) return { ok: true }
    const body = await r.text().catch(() => '')
    return { ok: false, status: r.status, reason: body.slice(0, 300) }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}

// AI 팀원 upsert — REST API (service_role 키로 RLS 우회)
async function upsertAITeam() {
  if (!SB_URL || !SB_KEY) return { ok: false, reason: 'missing env' }
  const results = []
  for (const profile of AI_TEAM_PROFILES) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/profiles`, {
        method:  'POST',
        headers: { ...H(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body:    JSON.stringify(profile),
      })
      results.push({ username: profile.username, status: r.status, ok: r.ok || r.status === 204 || r.status === 200 || r.status === 201 })
    } catch (e) {
      results.push({ username: profile.username, ok: false, error: e.message })
    }
  }
  const allOk = results.every(r => r.ok)
  return { ok: allOk, results }
}

// 테이블·컬럼 존재 여부 일괄 확인
async function runChecks() {
  const h = H()
  const checks = await Promise.allSettled([
    fetch(`${SB_URL}/rest/v1/profiles?select=is_suspended&limit=1`,                         { headers: h }).then(r => ({ col: 'profiles.is_suspended',     ok: r.status === 200 || r.status === 206 })),
    fetch(`${SB_URL}/rest/v1/comments?select=parent_id,like_count&limit=1`,                  { headers: h }).then(r => ({ col: 'comments.extra_cols',        ok: r.status === 200 || r.status === 206 })),
    fetch(`${SB_URL}/rest/v1/articles?select=ai_summary,ai_processed_at,ai_category,read_time&limit=1`, { headers: h }).then(r => ({ col: 'articles.ai_cols', ok: r.status === 200 || r.status === 206 })),
    fetch(`${SB_URL}/rest/v1/messages?limit=1`,                                              { headers: h }).then(r => ({ col: 'messages',                   ok: r.status === 200 || r.status === 206 })),
    fetch(`${SB_URL}/rest/v1/comment_likes?limit=1`,                                         { headers: h }).then(r => ({ col: 'comment_likes',              ok: r.status === 200 || r.status === 206 })),
    fetch(`${SB_URL}/rest/v1/ai_operations_log?limit=1`,                                     { headers: h }).then(r => ({ col: 'ai_operations_log',          ok: r.status === 200 || r.status === 206 })),
    fetch(`${SB_URL}/rest/v1/ai_notices?limit=1`,                                            { headers: h }).then(r => ({ col: 'ai_notices',                 ok: r.status === 200 || r.status === 206 })),
    fetch(`${SB_URL}/rest/v1/newsletter_logs?limit=1`,                                       { headers: h }).then(r => ({ col: 'newsletter_logs',            ok: r.status === 200 || r.status === 206 })),
    fetch(`${SB_URL}/rest/v1/staff_chat_messages?limit=1&select=id`,                         { headers: h }).then(r => ({ col: 'staff_chat_messages',        ok: r.status === 200 || r.status === 206 })),
    fetch(`${SB_URL}/rest/v1/profiles?username=eq.ai_aria&select=id&limit=1`,                { headers: h }).then(r => ({ col: 'ai_team_aria',               ok: r.status === 200 || r.status === 206 })),
  ])
  return checks.map(c => c.status === 'fulfilled' ? c.value : { col: '?', ok: false })
}

// ══════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

async function _handleSetupDb_impl(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // ── GET: 상태 확인 ────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env vars' }, 500)
    const checks = await runChecks()
    const allOk  = checks.every(c => c.ok)
    return json({
      ok:      allOk,
      engine:  'setup-db-v4',
      checks,
      message: allOk ? '✅ 모든 테이블/컬럼 정상' : '⚠️ 일부 테이블/컬럼 없음 — POST로 초기화하세요',
    })
  }

  // ── POST: DB 초기화 ───────────────────────────────────────────────
  if (req.method === 'POST') {
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env vars' }, 500)

    const authHeader  = req.headers.get('authorization') || ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const isCron      = bearerToken === CRON_SECRET ||
      req.headers.get('x-cron-secret') === CRON_SECRET ||
      req.headers.get('x-vercel-cron') === '1'
    const isAdminJWT  = !isCron && bearerToken
      ? await checkAdminJWT(bearerToken)
      : false
    if (!isCron && !isAdminJWT) return json({ error: 'Unauthorized' }, 401)

    const results = []

    // 1) exec_sql RPC로 스키마 적용
    const schemaResult = await tryExecSql(SCHEMA_SQL)
    results.push({ op: 'schema_ddl', ...schemaResult })

    // 2) AI 팀원 upsert (REST API)
    const teamResult = await upsertAITeam()
    results.push({ op: 'ai_team_upsert', ok: teamResult.ok, detail: teamResult.results })

    // 3) 컬럼/테이블 존재 여부 확인
    const checks = await runChecks()
    const allChecksOk = checks.every(c => c.ok)

    // exec_sql RPC 없으면 manual SQL 안내
    const needsManual = !schemaResult.ok
    const overallOk   = schemaResult.ok && allChecksOk

    return json({
      ok:          overallOk,
      engine:      'setup-db-v4',
      schema_rpc:  schemaResult.ok,
      team_upsert: teamResult.ok,
      checks,
      results,
      // exec_sql RPC가 없거나 실패 시 — manual SQL 첨부
      ...(needsManual ? {
        manual_sql:   MANUAL_SQL,
        supabase_url: `https://supabase.com/dashboard/project/${SB_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || ''}/sql/new`,
        message: '⚠️ exec_sql RPC 없음 — manual_sql을 Supabase SQL Editor에서 직접 실행하세요',
      } : {
        message: overallOk
          ? '✅ DB 초기화 완료'
          : '⚠️ 일부 항목 실패 — checks 항목을 확인하세요',
      }),
      timestamp: new Date().toISOString(),
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}

  return _handleSetupDb_impl
})();

const handleDbSetup = (() => {
// DB 함수/트리거 생성 (최초 1회 실행)


const SB_URL     = process.env.SUPABASE_URL
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

async function _handleDbSetup_impl(req) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const H = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  }

  // Supabase pg REST - rpc 방식으로 SQL 실행
  // CREATE FUNCTION을 직접 실행하는 RPC 생성
  const sqls = [
    // 1. increment_post_view
    `CREATE OR REPLACE FUNCTION public.increment_post_view(post_id uuid)
     RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
       UPDATE public.community_posts
       SET view_count = view_count + 1
       WHERE id = post_id AND is_deleted = false;
     $$`,

    // 2. increment_view (articles)
    `CREATE OR REPLACE FUNCTION public.increment_view(article_id uuid)
     RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
       UPDATE public.articles
       SET view_count = COALESCE(view_count, 0) + 1
       WHERE id = article_id AND status = 'published';
     $$`,

    // 3. update_reply_count 트리거 함수
    `CREATE OR REPLACE FUNCTION public.update_reply_count()
     RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN
       IF TG_OP = 'INSERT' THEN
         UPDATE public.community_posts
         SET reply_count = reply_count + 1
         WHERE id = NEW.post_id;
       ELSIF TG_OP = 'DELETE' THEN
         UPDATE public.community_posts
         SET reply_count = GREATEST(0, reply_count - 1)
         WHERE id = OLD.post_id;
       END IF;
       RETURN NULL;
     END;
     $$`,

    // 4. 트리거 재생성
    `DROP TRIGGER IF EXISTS comment_count_trigger ON public.comments`,

    `CREATE TRIGGER comment_count_trigger
     AFTER INSERT OR DELETE ON public.comments
     FOR EACH ROW EXECUTE FUNCTION public.update_reply_count()`,

    // 5. 기존 reply_count 동기화
    `UPDATE public.community_posts cp
     SET reply_count = (
       SELECT COUNT(*) FROM public.comments c
       WHERE c.post_id = cp.id
     )`,
  ]

  const results = []

  // Supabase postgres endpoint (beta)
  for (const sql of sqls) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/`, {
        method: 'POST',
        headers: { ...H, 'Prefer': 'params=single-object' },
        body: JSON.stringify({ query: sql }),
      })
      results.push({ sql: sql.slice(0, 50), status: r.status })
    } catch (e) {
      results.push({ sql: sql.slice(0, 50), error: e.message })
    }
  }

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

  return _handleDbSetup_impl
})();

const handleDbSetupStaff = (() => {
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/db-setup-staff.js — staff_chat_messages 테이블 초기화 v3       ║
 * ║                                                                      ║
 * ║  GET  : 테이블 존재 여부 + manual SQL 항상 반환                     ║
 * ║  POST : exec_sql RPC 시도 → 실패 시 즉시 manual SQL + 안내 반환    ║
 * ║                                                                      ║
 * ║  v3 변경:                                                            ║
 * ║  - Management API 완전 제거 (service_role 키로 항상 401)            ║
 * ║  - exec_sql RPC 1회만 시도, 없으면 즉시 수동 안내로 전환           ║
 * ║  - GET/POST 모두 manual_sql 항상 반환 (테이블 없을 때)             ║
 * ║  - AdminPage에서 SQL 즉시 표시 + 원클릭 복사 지원                  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */


const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const SUPABASE_PROJECT_ID = 'itcbantrpkjpkfhnriom'
const SUPABASE_SQL_URL    = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/sql/new`

const H = () => ({
  apikey:         SB_KEY,
  Authorization:  `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (d, s = 200) =>
  new Response(JSON.stringify(d, null, 2), {
    status: s, headers: { 'Content-Type': 'application/json', ...CORS },
  })

// ══════════════════════════════════════════════════════════════════════
// SQL 상수
// ══════════════════════════════════════════════════════════════════════

const MANUAL_SQL = `-- Supabase SQL Editor에서 실행하세요
-- 프로젝트: https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/sql/new

CREATE TABLE IF NOT EXISTS public.staff_chat_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room          text        NOT NULL DEFAULT 'general',
  sender_key    text        NOT NULL,
  sender_name   text        NOT NULL,
  sender_emoji  text,
  sender_color  text,
  sender_team   text,
  message       text        NOT NULL CHECK (char_length(message) <= 2000),
  msg_type      text        NOT NULL DEFAULT 'chat',
  reply_to      uuid        REFERENCES public.staff_chat_messages(id) ON DELETE SET NULL,
  is_deleted    boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scm_room_time
  ON public.staff_chat_messages(room, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scm_sender
  ON public.staff_chat_messages(sender_key);
ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scm_service_all ON public.staff_chat_messages;
CREATE POLICY scm_service_all ON public.staff_chat_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS scm_admin_all ON public.staff_chat_messages;
CREATE POLICY scm_admin_all ON public.staff_chat_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );`

// exec_sql RPC용 — 단일 트랜잭션으로 전체 DDL
const DDL_FOR_RPC = `
CREATE TABLE IF NOT EXISTS public.staff_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room text NOT NULL DEFAULT 'general',
  sender_key text NOT NULL,
  sender_name text NOT NULL,
  sender_emoji text,
  sender_color text,
  sender_team text,
  message text NOT NULL CHECK (char_length(message) <= 2000),
  msg_type text NOT NULL DEFAULT 'chat',
  reply_to uuid REFERENCES public.staff_chat_messages(id) ON DELETE SET NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scm_room_time ON public.staff_chat_messages(room, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scm_sender ON public.staff_chat_messages(sender_key);
ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scm_service_all ON public.staff_chat_messages;
CREATE POLICY scm_service_all ON public.staff_chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS scm_admin_all ON public.staff_chat_messages;
CREATE POLICY scm_admin_all ON public.staff_chat_messages FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
`.trim()

// ══════════════════════════════════════════════════════════════════════
// 헬퍼
// ══════════════════════════════════════════════════════════════════════

async function tableExists() {
  if (!SB_URL || !SB_KEY) return false
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/staff_chat_messages?limit=1&select=id`,
      { headers: H() }
    )
    // 200 또는 206 → 존재, 404/400/PGRST → 없음
    if (r.status === 200 || r.status === 206) return true
    if (r.status === 404 || r.status === 400) return false
    // 그 외(401 등) → 키 문제지 테이블 자체는 있을 수 있음
    return r.status < 500
  } catch { return false }
}

async function checkAdminJWT(token) {
  if (!token || !SB_URL || !SB_KEY) return false
  try {
    // 1) token으로 user.id 조회 (Supabase Auth)
    const r1 = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r1.ok) return false
    const user = await r1.json().catch(() => null)
    if (!user?.id) return false
    // 2) service_role 키로 해당 user.id의 role 확인 (RLS 우회)
    const r2 = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    )
    if (!r2.ok) return false
    const rows = await r2.json().catch(() => [])
    return Array.isArray(rows) && rows[0]?.role === 'admin'
  } catch { return false }
}

// exec_sql RPC — Supabase에 미리 만들어 둔 경우만 동작
async function tryExecSqlRpc() {
  if (!SB_URL || !SB_KEY) return { ok: false, reason: 'missing env' }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
      method:  'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body:    JSON.stringify({ sql: DDL_FOR_RPC }),
    })
    if (r.ok || r.status === 204) return { ok: true, method: 'exec_sql_rpc' }
    const body = await r.text().catch(() => '')
    return { ok: false, status: r.status, reason: body.slice(0, 200) }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}

// ══════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

async function _handleDbSetupStaff_impl(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // ── GET: 상태 확인 ────────────────────────────────────────────────
  if (req.method === 'GET') {
    const exists = await tableExists()
    return json({
      ok:           true,
      engine:       'db-setup-staff-v3',
      table_exists: exists,
      table:        'staff_chat_messages',
      // 테이블 없을 때 항상 manual_sql 반환 (AdminPage가 즉시 표시)
      manual_sql:   exists ? null : MANUAL_SQL,
      supabase_url: SUPABASE_SQL_URL,
      message:      exists
        ? '✅ staff_chat_messages 테이블 정상'
        : '⚠️ 테이블 없음 — 아래 SQL을 Supabase SQL Editor에서 실행하세요',
    })
  }

  // ── POST: 테이블 생성 시도 ────────────────────────────────────────
  if (req.method === 'POST') {
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env vars' }, 500)

    const authHeader  = req.headers.get('authorization') || ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const isCron =
      authHeader === `Bearer ${CRON_SECRET}` ||
      req.headers.get('x-cron-secret') === CRON_SECRET ||
      req.headers.get('x-vercel-cron') === '1'
    const isAdminJWT = (!isCron && bearerToken)
      ? await checkAdminJWT(bearerToken) : false
    if (!isCron && !isAdminJWT) return json({ error: 'Unauthorized' }, 401)

    // 이미 존재하면 즉시 성공
    if (await tableExists()) {
      return json({
        ok:           true,
        engine:       'db-setup-staff-v3',
        table_exists: true,
        message:      '✅ staff_chat_messages 테이블이 이미 존재합니다',
        timestamp:    new Date().toISOString(),
      })
    }

    // exec_sql RPC 시도 (Supabase에 함수가 있는 경우만 성공)
    const rpcResult = await tryExecSqlRpc()

    if (rpcResult.ok) {
      // RPC 성공 → 재확인
      const nowExists = await tableExists()
      return json({
        ok:           nowExists,
        engine:       'db-setup-staff-v3',
        table_exists: nowExists,
        method:       'exec_sql_rpc',
        message:      nowExists
          ? '✅ exec_sql RPC로 테이블 생성 완료!'
          : '⚠️ RPC 실행됐으나 테이블 확인 실패 — 수동 SQL을 실행하세요',
        manual_sql:   nowExists ? null : MANUAL_SQL,
        supabase_url: SUPABASE_SQL_URL,
        timestamp:    new Date().toISOString(),
      })
    }

    // ── 모든 자동화 실패 → 즉시 수동 SQL 안내 ──────────────────────
    return json({
      ok:           false,
      engine:       'db-setup-staff-v3',
      table_exists: false,
      method:       'manual_required',
      // 실패 이유 (디버깅용)
      rpc_result:   rpcResult,
      message:      '❌ 자동 생성 불가 — Supabase SQL Editor에서 아래 SQL을 직접 실행하세요 (30초면 완료)',
      manual_sql:   MANUAL_SQL,
      supabase_url: SUPABASE_SQL_URL,
      steps: [
        `1. 아래 "SQL Editor 열기" 버튼 클릭`,
        `2. manual_sql 전체를 복사하여 SQL Editor에 붙여넣기`,
        `3. Run (F5 또는 Ctrl+Enter) 실행`,
        `4. "테이블 확인" 버튼으로 생성 확인`,
      ],
      timestamp: new Date().toISOString(),
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}

  return _handleDbSetupStaff_impl
})();

const handleSetupRag = (() => {
// RAG 테이블 초기화 (1회 실행용)

const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

async function _handleSetupRag_impl(req) {
  if (req.headers.get('authorization') !== 'Bearer ' + CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }
  const results = []

  // Supabase rpc로 SQL 실행
  async function sql(query) {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ sql: query })
    })
    return { status: r.status, ok: r.ok }
  }

  // 1. ai_knowledge 테이블 (없으면 생성)
  const knowledgeData = [
    {
      content: '2024년 한국 AI 스타트업 투자액은 1조 2천억원으로 전년 대비 38.2% 급증했습니다. ChatGPT 등장 이후 VC(벤처캐피탈) 투자 심리가 크게 개선됐고, 정부의 AI 스타트업 육성 정책이 맞물린 결과입니다.',
      category: 'trend', source: '정보통신기획평가원 AI산업실태조사 2024',
      keywords: ['AI', '투자', 'VC', '스타트업'], quality: 9
    },
    {
      content: '에듀테크 시장은 2024년 7,500억원 규모로 전년 대비 21.4% 성장했습니다. AI 튜터링과 맞춤형 학습 솔루션 수요가 급증했으며, 청소년 창업가들이 교육 현장의 불편함을 해결하는 에듀테크 창업이 유망합니다.',
      category: 'trend', source: '한국에듀테크산업협회 2024',
      keywords: ['에듀테크', '교육', 'AI튜터', '청소년'], quality: 9
    },
    {
      content: '한국 VC 투자 생태계는 2024년 6조 7천억원의 신규 투자가 이루어졌습니다. AI/ML 18%, 바이오헬스 15%, 에듀테크 11% 순입니다. 시드(초기) 투자는 평균 3~5억원이며, 팀 구성과 문제 해결력을 가장 중요하게 봅니다.',
      category: 'market', source: '한국벤처캐피탈협회 2024',
      keywords: ['VC', '투자', '시드투자', '벤처'], quality: 9
    },
    {
      content: '기후테크 스타트업에 대한 관심이 급증하고 있습니다. ESG 경영 의무화로 기업들이 탄소중립 솔루션을 찾고 있으며, 친환경 소비를 돕는 B2C 서비스도 주목받습니다.',
      category: 'trend', source: '중소벤처기업부 2024',
      keywords: ['기후테크', 'ESG', '탄소중립', '친환경'], quality: 9
    },
    {
      content: '청소년 창업의 첫 단계는 문제 발견입니다. 내가 직접 불편함을 느끼는 것, 친구들이 공통으로 겪는 어려움에서 아이디어를 찾으세요. 성공한 청소년 창업가들은 대부분 자신의 경험에서 시작했습니다.',
      category: 'insight', source: 'Insightship 창업 가이드',
      keywords: ['청소년창업', '아이디어', '문제발견'], quality: 9
    },
  ]

  // ai_knowledge에 직접 INSERT (테이블은 SQL 에디터로 생성 필요)
  const insertR = await fetch(`${SB_URL}/rest/v1/ai_knowledge`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify(knowledgeData)
  })
  results.push({ step: 'insert_knowledge', status: insertR.status })

  // ai_feedback 테이블 존재 확인
  const fbCheck = await fetch(`${SB_URL}/rest/v1/ai_feedback?limit=1`, { headers: H })
  results.push({ step: 'feedback_table', status: fbCheck.status })

  return new Response(JSON.stringify({ results, timestamp: new Date().toISOString() }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}

  return _handleSetupRag_impl
})();

const handleAddKnowledge = (() => {
// 지속 학습: AI 지식베이스에 새 데이터 추가
// 뉴스 요약 완료 후 자동 실행되어 RAG 지식베이스를 갱신
// 임베딩 없이 텍스트 기반 지식 저장 (외부 API 없음)


const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

async function _handleAddKnowledge_impl(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }

  // 최근 3일치 요약된 뉴스 중 아직 지식베이스에 없는 것
  const since = new Date(Date.now() - 3 * 86400000).toISOString()
  const r = await fetch(
    `${SB_URL}/rest/v1/articles?ai_summary=not.is.null&published_at=gte.${since}&select=id,title,ai_summary,ai_category,tags,source_name&order=published_at.desc&limit=20`,
    { headers: H }
  )
  const articles = await r.json()
  if (!articles?.length) return new Response(JSON.stringify({ message: '추가할 기사 없음' }), { status: 200 })

  let added = 0

  for (const a of articles) {
    if (!a.ai_summary || a.ai_summary.length < 50) continue

    // 이미 있는지 확인 (source로 중복 방지)
    const exists = await fetch(
      `${SB_URL}/rest/v1/ai_knowledge?source=eq.article:${a.id}&limit=1`,
      { headers: H }
    )
    const ex = await exists.json()
    if (ex?.length > 0) continue

    const content = `${a.title}\n${a.ai_summary}`

    // 임베딩 없이 텍스트 기반으로 저장 (자체 RAG용 텍스트 검색 활용)
    const insertR = await fetch(`${SB_URL}/rest/v1/ai_knowledge`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        content,
        embedding: null,   // 임베딩 비활성화 (외부 API 없음)
        category:  a.ai_category === 'startup' ? 'trend' : (a.ai_category || 'news'),
        source:    `article:${a.id}`,
        keywords:  a.tags || [],
        quality:   6,      // 뉴스 자동 추가는 6점 (운영자 수동 추가는 9점)
      }),
    })
    if (insertR.ok || insertR.status === 201) added++

    await new Promise(res => setTimeout(res, 200))
  }

  return new Response(JSON.stringify({
    processed:  articles.length,
    added,
    model:      'insightship-ai-v1-no-embedding',
    timestamp:  new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

  return _handleAddKnowledge_impl
})();

export default async function handler(req) {
  const url  = new URL(req.url)
  const path = url.pathname

  if (path.endsWith('/setup-db'))       return handleSetupDb(req)
  if (path.endsWith('/db-setup-staff')) return handleDbSetupStaff(req)
  if (path.endsWith('/db-setup'))       return handleDbSetup(req)
  if (path.endsWith('/setup-rag'))      return handleSetupRag(req)
  if (path.endsWith('/add-knowledge'))  return handleAddKnowledge(req)

  return new Response(JSON.stringify({ service: 'setup-router', version: '1.0' }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
