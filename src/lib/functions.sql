-- ================================================================
-- PACM Database Functions & RPCs v1.0
-- Supabase Dashboard > SQL Editor 에서 실행
-- ================================================================

-- ── 조회수 증가 (RPC) ────────────────────────────────────────────
create or replace function public.increment_view(article_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.articles
  set view_count = view_count + 1
  where id = article_id and status = 'published';
end;
$$;

-- ── 게시글 좋아요 토글 (RPC) ─────────────────────────────────────
create or replace function public.toggle_post_like(p_post_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  already_liked boolean;
begin
  select exists(
    select 1 from public.article_likes
    where article_id = p_post_id and user_id = p_user_id
  ) into already_liked;

  if already_liked then
    delete from public.article_likes
    where article_id = p_post_id and user_id = p_user_id;
    update public.articles set like_count = greatest(0, like_count - 1)
    where id = p_post_id;
    return false;
  else
    insert into public.article_likes (article_id, user_id)
    values (p_post_id, p_user_id)
    on conflict do nothing;
    update public.articles set like_count = like_count + 1
    where id = p_post_id;
    return true;
  end if;
end;
$$;

-- ── 프로젝트 지원자 수 자동 업데이트 ────────────────────────────
create or replace function public.update_applicant_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update public.projects
    set applicant_count = applicant_count + 1
    where id = new.project_id;
  elsif TG_OP = 'DELETE' then
    update public.projects
    set applicant_count = greatest(0, applicant_count - 1)
    where id = old.project_id;
  end if;
  return null;
end;
$$;

create trigger project_applicant_count
  after insert or delete on public.project_applications
  for each row execute function public.update_applicant_count();

-- ── 관리자 전용: 통계 조회 ────────────────────────────────────────
create or replace function public.get_admin_stats()
returns json language plpgsql security definer set search_path = public as $$
declare
  result json;
begin
  -- 관리자만 접근 가능
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Access denied';
  end if;

  select json_build_object(
    'total_articles',     (select count(*) from public.articles),
    'published_articles', (select count(*) from public.articles where status = 'published'),
    'total_posts',        (select count(*) from public.community_posts where not is_deleted),
    'total_users',        (select count(*) from public.profiles),
    'total_subscribers',  (select count(*) from public.newsletter_subscribers where is_active),
    'pending_reports',    (select count(*) from public.reports where status = 'pending'),
    'total_projects',     (select count(*) from public.projects),
    'open_projects',      (select count(*) from public.projects where status = 'open')
  ) into result;

  return result;
end;
$$;

-- ── 검색 함수 (전문 검색) ────────────────────────────────────────
create or replace function public.search_articles(query text, lim int default 10)
returns table (
  id uuid, title text, slug text, excerpt text,
  category article_category, cover_image text, published_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  return query
  select
    a.id, a.title, a.slug, a.excerpt,
    a.category, a.cover_image, a.published_at
  from public.articles a
  where
    a.status = 'published' and
    (
      a.title ilike '%' || query || '%' or
      a.excerpt ilike '%' || query || '%' or
      query = any(a.tags)
    )
  order by a.published_at desc
  limit lim;
end;
$$;

-- ── Storage 버킷 생성 (대시보드 SQL에서 실행) ────────────────────
-- Storage 버킷은 Supabase Dashboard에서 직접 생성하거나 아래 실행:
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('article-images', 'article-images', true, 5242880,
     array['image/jpeg','image/png','image/webp','image/gif']),
    ('avatars', 'avatars', true, 2097152,
     array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;
exception when others then
  -- 이미 존재하면 무시
  null;
end;
$$;

-- ── Storage RLS 정책 ──────────────────────────────────────────────
-- article-images: 누구나 읽기, admin/writer만 업로드
create policy "article_images_public_read" on storage.objects
  for select using (bucket_id in ('article-images', 'avatars'));

create policy "article_images_auth_insert" on storage.objects
  for insert with check (
    bucket_id = 'article-images' and
    auth.uid() in (
      select id from public.profiles where role in ('admin', 'writer')
    )
  );

create policy "avatars_auth_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.role() = 'authenticated'
  );

create policy "article_images_admin_delete" on storage.objects
  for delete using (
    bucket_id in ('article-images', 'avatars') and
    auth.uid() in (
      select id from public.profiles where role = 'admin'
    )
  );

-- ── 초기 Admin 계정 설정 가이드 ──────────────────────────────────
-- 1. Supabase Dashboard > Authentication > Users > "Add User"
--    Email: admin@pacm.kr, Password: (강력한 비밀번호)
--
-- 2. 아래 SQL로 해당 유저를 admin으로 승격:
--    update public.profiles
--    set role = 'admin'
--    where email = 'admin@pacm.kr';
--
-- 3. (선택) 가입 이후 이메일 인증 없이 바로 사용하려면:
--    update auth.users
--    set email_confirmed_at = now()
--    where email = 'admin@pacm.kr';
