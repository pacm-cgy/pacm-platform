// DB 초기화 API - 필요한 함수/트리거/테이블 생성
// Supabase Dashboard > SQL Editor에서 실행하거나 이 API 호출
export const config = { runtime: 'edge' }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) return new Response('Unauthorized', { status: 401 })

  const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
  const results = []

  const log = (op, ok, detail='') => results.push({ op, ok, detail })

  // 1) reply_count 동기화 (댓글 수 기준)
  try {
    const cr = await fetch(`${SB_URL}/rest/v1/comments?select=post_id&limit=1000`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
    const comments = await cr.json()
    const counts = {}
    for (const c of (Array.isArray(comments) ? comments : [])) {
      counts[c.post_id] = (counts[c.post_id] || 0) + 1
    }
    let updated = 0
    for (const [postId, cnt] of Object.entries(counts)) {
      const u = await fetch(`${SB_URL}/rest/v1/community_posts?id=eq.${postId}`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ reply_count: cnt })
      })
      if (u.ok || u.status === 204) updated++
    }
    log('sync_reply_count', true, `${updated}개 게시글 동기화`)
  } catch(e) { log('sync_reply_count', false, e.message) }

  // 2) messages 테이블 생성 시도
  try {
    const r = await fetch(`${SB_URL}/rest/v1/messages?limit=1`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
    if (r.status === 200) {
      log('messages_table', true, '이미 존재')
    } else {
      // 테이블이 없으면 생성 불가 (DDL은 SQL Editor에서 직접 실행)
      log('messages_table', false, 'SQL Editor에서 생성 필요 (아래 SQL 참고)')
    }
  } catch(e) { log('messages_table', false, e.message) }

  // 3) comment_likes 테이블 확인
  try {
    const r = await fetch(`${SB_URL}/rest/v1/comment_likes?limit=1`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
    log('comment_likes_table', r.status === 200, r.status === 200 ? '이미 존재' : 'SQL Editor에서 생성 필요')
  } catch(e) { log('comment_likes_table', false, e.message) }

  // 4) profiles.is_suspended 컬럼 확인
  try {
    const r = await fetch(`${SB_URL}/rest/v1/profiles?select=is_suspended&limit=1`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
    log('profiles_is_suspended', r.status === 200, r.status === 200 ? '컬럼 존재' : 'SQL Editor에서 추가 필요')
  } catch(e) { log('profiles_is_suspended', false, e.message) }

  // 5) comments.parent_id, like_count 확인
  try {
    const r = await fetch(`${SB_URL}/rest/v1/comments?select=parent_id,like_count&limit=1`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
    log('comments_extra_cols', r.status === 200, r.status === 200 ? '컬럼 존재' : 'SQL Editor에서 추가 필요')
  } catch(e) { log('comments_extra_cols', false, e.message) }

  // 필요한 SQL 목록 반환
  const requiredSQL = `
-- Supabase Dashboard > SQL Editor에서 실행하세요

-- 1. increment_post_view RPC
CREATE OR REPLACE FUNCTION public.increment_post_view(post_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.community_posts SET view_count = view_count + 1
  WHERE id = post_id AND is_deleted = false;
$$;

-- 2. reply_count 트리거
CREATE OR REPLACE FUNCTION public.update_reply_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts SET reply_count = reply_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts SET reply_count = GREATEST(0, reply_count-1) WHERE id = OLD.post_id;
  END IF; RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS comment_count_trigger ON public.comments;
CREATE TRIGGER comment_count_trigger
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.update_reply_count();

-- 3. 메시지 테이블
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select" ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "messages_insert" ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- 4. comment_likes 테이블
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, comment_id)
);
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comment_likes_all" ON public.comment_likes
  USING (true) WITH CHECK (auth.uid() = user_id);

-- 5. 컬럼 추가
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS like_count integer DEFAULT 0;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspend_reason text;
  `.trim()

  return new Response(JSON.stringify({
    ok: true,
    results,
    required_sql: requiredSQL,
    message: 'SQL Editor에서 required_sql을 실행하면 모든 기능이 활성화됩니다.'
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
