// DB 초기화 - Supabase Management API 경유 (서버사이드)
export const config = { runtime: 'edge' }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

function getRef(url) {
  return url?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) return new Response('Unauthorized', { status: 401 })

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

  // 컬럼 추가 확인
  const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  const checks = await Promise.allSettled([
    fetch(`${SB_URL}/rest/v1/profiles?select=is_suspended&limit=1`, { headers: H }).then(r=>({ col:'is_suspended', ok: r.status===200 })),
    fetch(`${SB_URL}/rest/v1/comments?select=parent_id,like_count&limit=1`, { headers: H }).then(r=>({ col:'comments_extra', ok: r.status===200 })),
    fetch(`${SB_URL}/rest/v1/messages?limit=1`, { headers: H }).then(r=>({ col:'messages', ok: r.status===200 })),
    fetch(`${SB_URL}/rest/v1/comment_likes?limit=1`, { headers: H }).then(r=>({ col:'comment_likes', ok: r.status===200 })),
  ])
  for (const c of checks) {
    if (c.status === 'fulfilled') results.push(c.value)
  }

  return new Response(JSON.stringify({ ok: r.ok, results }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}
