// DB 초기화 - Supabase Management API 경유 (서버사이드)
export const config = { runtime: 'edge' }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

function getRef(url) {
  return url?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
}

async function checkAdminJWT(token) {
  if (!token || !SB_URL || !SB_KEY) return false
  try {
    const r1 = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r1.ok) return false
    const user = await r1.json()
    if (!user?.id) return false
    const r2 = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,role&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    )
    if (!r2.ok) return false
    const rows = await r2.json()
    return Array.isArray(rows) && rows[0]?.role === 'admin'
  } catch { return false }
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const auth = req.headers.get('authorization')
  const isCron = auth === `Bearer ${CRON_SECRET}`
  const isJWT  = auth?.startsWith('Bearer ') && auth !== `Bearer ${CRON_SECRET}`
    ? await checkAdminJWT(auth.slice(7))
    : false
  if (!isCron && !isJWT) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const PROJECT_REF = getRef(SB_URL)
  const results = []

  const sql = `
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspend_reason text;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS like_count integer DEFAULT 0;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments(id);
CREATE OR REPLACE FUNCTION public.increment_post_view(post_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.community_posts SET view_count = view_count + 1 WHERE id = post_id AND is_deleted = false; $$;
CREATE OR REPLACE FUNCTION public.update_reply_count() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP = 'INSERT' THEN UPDATE public.community_posts SET reply_count = reply_count + 1 WHERE id = NEW.post_id; ELSIF TG_OP = 'DELETE' THEN UPDATE public.community_posts SET reply_count = GREATEST(0, reply_count-1) WHERE id = OLD.post_id; END IF; RETURN NULL; END; $$;
DROP TRIGGER IF EXISTS comment_count_trigger ON public.comments;
CREATE TRIGGER comment_count_trigger AFTER INSERT OR DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.update_reply_count();
CREATE TABLE IF NOT EXISTS public.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, content text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000), is_read boolean DEFAULT false, created_at timestamptz DEFAULT now());
ALTER TABLE IF EXISTS public.messages ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.comment_likes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE, created_at timestamptz DEFAULT now(), UNIQUE(user_id, comment_id));
ALTER TABLE IF EXISTS public.comment_likes ENABLE ROW LEVEL SECURITY;
UPDATE public.community_posts cp SET reply_count = (SELECT COUNT(*) FROM public.comments c WHERE c.post_id = cp.id);
CREATE TABLE IF NOT EXISTS public.ai_operations_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_type text NOT NULL, run_date date NOT NULL DEFAULT current_date, result text NOT NULL DEFAULT 'success', details text, engine text, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT ai_ops_result_check CHECK (result IN ('success','error','skipped')));
CREATE INDEX IF NOT EXISTS ai_ops_task_date_idx ON public.ai_operations_log(task_type, run_date DESC);
ALTER TABLE IF EXISTS public.ai_operations_log ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.newsletter_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject text, sent_count int NOT NULL DEFAULT 0, engine text, sent_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE IF EXISTS public.newsletter_logs ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.ai_notices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, post_id uuid REFERENCES public.community_posts(id) ON DELETE SET NULL, notice_date date NOT NULL DEFAULT current_date, day_of_week smallint, engine text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE IF EXISTS public.ai_notices ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.staff_chat_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room text NOT NULL DEFAULT 'general', sender_key text NOT NULL, sender_name text NOT NULL, sender_emoji text, sender_color text, sender_team text, message text NOT NULL, msg_type text NOT NULL DEFAULT 'chat', reply_to uuid REFERENCES public.staff_chat_messages(id) ON DELETE SET NULL, is_deleted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_scm_room_time ON public.staff_chat_messages(room, created_at DESC);
ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scm_service_all ON public.staff_chat_messages;
CREATE POLICY scm_service_all ON public.staff_chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS scm_admin_all ON public.staff_chat_messages;
CREATE POLICY scm_admin_all ON public.staff_chat_messages FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_category text;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS read_time integer DEFAULT 3;
  `.trim()

  // Management API 호출
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await r.text()
  results.push({ op: 'management_api', status: r.status, resp: text.slice(0, 300) })

  // ── AI 운영팀 프로필 upsert ──────────────────────────────────────
  // 8명의 AI 팀원 프로필을 profiles 테이블에 자동 생성합니다.
  // (auth.users 없이 직접 삽입 — service_role key 필요)
  const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }

  // AI 팀원 8명 — Management API SQL upsert (email NOT NULL 포함)
  const aiTeamSql = [
    `INSERT INTO public.profiles (id,email,username,display_name,bio,role,is_verified,avatar_url) VALUES`,
    `('00000000-0000-0000-0000-000000000001','ai.aria@insightship.ai','ai_aria','ARIA','Insightship 운영팀 총괄 AI입니다. 커뮤니티 공지, 토론 주제, 이벤트를 담당합니다.','writer',true,'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=aria&backgroundColor=0f0f1a&radius=50'),`,
    `('00000000-0000-0000-0000-000000000002','ai.nova@insightship.ai','ai_nova','NOVA','Insightship 편집장 AI입니다. 스타트업 뉴스를 분석해 인사이트 아티클, 창업 가이드, 칼럼을 씁니다.','writer',true,'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=nova&backgroundColor=0f0f1a&radius=50'),`,
    `('00000000-0000-0000-0000-000000000003','ai.lumi@insightship.ai','ai_lumi','LUMI','Insightship AI 멘토 LUMI입니다. 창업 아이디어 검증, 린 캔버스, MVP 설계 등 창업의 모든 과정을 함께합니다.','writer',true,'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=lumi&backgroundColor=0f0f1a&radius=50'),`,
    `('00000000-0000-0000-0000-000000000004','ai.pulse@insightship.ai','ai_pulse','PULSE','Insightship 뉴스 큐레이터 PULSE입니다. 매시간 스타트업 뉴스를 수집하고 AI 요약을 붙입니다.','writer',true,'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=pulse&backgroundColor=0f0f1a&radius=50'),`,
    `('00000000-0000-0000-0000-000000000005','ai.trend@insightship.ai','ai_trend','TREND','Insightship 트렌드 분석가 TREND입니다. 매 6시간마다 스타트업 시장의 트렌드를 분석합니다.','writer',true,'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=trend&backgroundColor=0f0f1a&radius=50'),`,
    `('00000000-0000-0000-0000-000000000006','ai.sage@insightship.ai','ai_sage','SAGE','Insightship 리포트 작성 AI SAGE입니다. 매주 금요일 투자·시장·트렌드 종합 분석 리포트를 발행합니다.','writer',true,'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=sage&backgroundColor=0f0f1a&radius=50'),`,
    `('00000000-0000-0000-0000-000000000007','ai.echo@insightship.ai','ai_echo','ECHO','Insightship 뉴스레터 에디터 ECHO입니다. 매주 월요일 아침, 창업·투자·시장 인사이트를 이메일로 전합니다.','writer',true,'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=echo&backgroundColor=0f0f1a&radius=50'),`,
    `('00000000-0000-0000-0000-000000000008','ai.learn@insightship.ai','ai_learn','LEARN','Insightship AI 학습 엔지니어 LEARN입니다. 매일 피드백과 대화 패턴을 분석해 AI 멘토 LUMI를 진화시킵니다.','writer',true,'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=learn&backgroundColor=0f0f1a&radius=50')`,
    `ON CONFLICT (username) DO UPDATE SET`,
    `  display_name=EXCLUDED.display_name, bio=EXCLUDED.bio,`,
    `  is_verified=EXCLUDED.is_verified, avatar_url=EXCLUDED.avatar_url, role=EXCLUDED.role;`,
  ].join('\n')

  const teamR = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: aiTeamSql }),
  })
  const teamText = await teamR.text()
  results.push({ op: 'ai_team_profiles', status: teamR.status, resp: teamText.slice(0, 200) })

  // ── 컬럼 추가 확인 ─────────────────────────────────────────────────
  const checks = await Promise.allSettled([
    fetch(`${SB_URL}/rest/v1/profiles?select=is_suspended&limit=1`, { headers: H }).then(r=>({ col:'is_suspended', ok: r.status===200 })),
    fetch(`${SB_URL}/rest/v1/comments?select=parent_id,like_count&limit=1`, { headers: H }).then(r=>({ col:'comments_extra', ok: r.status===200 })),
    fetch(`${SB_URL}/rest/v1/messages?limit=1`, { headers: H }).then(r=>({ col:'messages', ok: r.status===200 })),
    fetch(`${SB_URL}/rest/v1/comment_likes?limit=1`, { headers: H }).then(r=>({ col:'comment_likes', ok: r.status===200 })),
    fetch(`${SB_URL}/rest/v1/ai_operations_log?limit=1`, { headers: H }).then(r=>({ col:'ai_operations_log', ok: r.status===200 })),
    fetch(`${SB_URL}/rest/v1/ai_notices?limit=1`, { headers: H }).then(r=>({ col:'ai_notices', ok: r.status===200 })),
    fetch(`${SB_URL}/rest/v1/newsletter_logs?limit=1`, { headers: H }).then(r=>({ col:'newsletter_logs', ok: r.status===200 })),
    fetch(`${SB_URL}/rest/v1/profiles?username=eq.ai_aria&select=id,username&limit=1`, { headers: H }).then(r=>({ col:'ai_team_aria', ok: r.status===200 })),
    fetch(`${SB_URL}/rest/v1/articles?select=ai_summary,ai_processed_at,ai_category,read_time&limit=1`, { headers: H }).then(r=>({ col:'articles_ai_cols', ok: r.status===200 })),
  ])
  for (const c of checks) {
    if (c.status === 'fulfilled') results.push(c.value)
  }

  return new Response(JSON.stringify({ ok: r.ok, results }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}
