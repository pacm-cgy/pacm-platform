// DB 함수/트리거 생성 (최초 1회 실행)
export const config = { runtime: 'edge' }

const SB_URL     = process.env.SUPABASE_URL
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req) {
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
