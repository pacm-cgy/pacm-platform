-- ================================================================
-- PACM Database Schema v1.0
-- 모든 테이블에 RLS(Row Level Security) 적용
-- ================================================================

-- ── EXTENSIONS ──────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- 한국어 검색 지원

-- ── ENUMS ───────────────────────────────────────────────────────
create type article_category as enum (
  'insight', 'story', 'trend', 'magazine', 'community', 'opinion'
);
create type article_status as enum ('draft', 'published', 'archived');
create type user_role as enum ('reader', 'writer', 'admin');
create type project_status as enum ('open', 'coming_soon', 'closed');
create type post_type as enum ('question', 'feedback', 'recruit', 'free', 'notice');

-- ── PROFILES (users 확장) ────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  username      text unique not null,
  display_name  text,
  bio           text,
  avatar_url    text,
  role          user_role not null default 'reader',
  school        text,
  location      text,
  startup_name  text,
  is_verified   boolean default false,
  is_banned     boolean default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 보안: 개인정보 필드 제한
  constraint username_length check (char_length(username) between 3 and 30),
  constraint username_format check (username ~ '^[a-zA-Z0-9_]+$'),
  constraint bio_length check (char_length(bio) <= 500)
);

-- ── ARTICLES ────────────────────────────────────────────────────
create table public.articles (
  id            uuid primary key default uuid_generate_v4(),
  title         text not null,
  slug          text unique not null,
  excerpt       text,
  body          text not null,
  cover_image   text, -- Supabase Storage URL
  category      article_category not null,
  tags          text[] default '{}',
  status        article_status not null default 'draft',
  author_id     uuid not null references public.profiles(id),
  read_time     integer, -- 분 단위
  view_count    integer not null default 0,
  like_count    integer not null default 0,
  featured      boolean default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz,
  -- 보안: 길이 제한
  constraint title_length check (char_length(title) between 1 and 200),
  constraint excerpt_length check (char_length(excerpt) <= 500),
  constraint slug_format check (slug ~ '^[a-z0-9-]+$')
);

-- 전문 검색 인덱스
create index articles_search_idx on public.articles
  using gin(to_tsvector('simple', title || ' ' || coalesce(excerpt, '')));
create index articles_status_idx on public.articles(status, published_at desc);
create index articles_category_idx on public.articles(category, status);

-- ── ARTICLE IMAGES (이미지 첨부) ──────────────────────────────────
create table public.article_images (
  id          uuid primary key default uuid_generate_v4(),
  article_id  uuid references public.articles(id) on delete cascade,
  url         text not null,
  alt_text    text,
  order_index integer default 0,
  created_at  timestamptz not null default now()
);

-- ── ARTICLE LIKES ──────────────────────────────────────────────
create table public.article_likes (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  article_id  uuid not null references public.articles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, article_id)
);

-- ── BOOKMARKS ──────────────────────────────────────────────────
create table public.bookmarks (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  article_id  uuid not null references public.articles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, article_id)
);

-- ── COMMUNITY POSTS ─────────────────────────────────────────────
create table public.community_posts (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  body        text not null,
  post_type   post_type not null default 'free',
  author_id   uuid not null references public.profiles(id),
  tags        text[] default '{}',
  view_count  integer not null default 0,
  like_count  integer not null default 0,
  reply_count integer not null default 0,
  is_pinned   boolean default false,
  is_deleted  boolean default false, -- soft delete
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint title_length check (char_length(title) between 1 and 200),
  constraint body_length check (char_length(body) between 1 and 10000)
);

-- ── COMMENTS ────────────────────────────────────────────────────
create table public.comments (
  id          uuid primary key default uuid_generate_v4(),
  post_id     uuid not null references public.community_posts(id) on delete cascade,
  author_id   uuid not null references public.profiles(id),
  body        text not null,
  parent_id   uuid references public.comments(id), -- 대댓글
  is_deleted  boolean default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint body_length check (char_length(body) between 1 and 2000)
);

-- ── PROJECTS (기업연결) ──────────────────────────────────────────
create table public.projects (
  id            uuid primary key default uuid_generate_v4(),
  title         text not null,
  description   text not null,
  company_name  text not null,
  company_logo  text,
  location      text,
  is_remote     boolean default false,
  tags          text[] default '{}',
  status        project_status not null default 'coming_soon',
  deadline      date,
  applicant_count integer not null default 0,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── PROJECT APPLICATIONS ─────────────────────────────────────────
create table public.project_applications (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  motivation  text,
  status      text not null default 'pending', -- pending/accepted/rejected
  created_at  timestamptz not null default now(),
  unique(project_id, user_id)
);

-- ── NEWSLETTER SUBSCRIBERS ────────────────────────────────────────
create table public.newsletter_subscribers (
  id          uuid primary key default uuid_generate_v4(),
  email       text unique not null,
  is_active   boolean default true,
  -- 보안: 이메일 인증 토큰
  verify_token text,
  verified_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint email_format check (email ~ '^[^@]+@[^@]+\.[^@]+$')
);

-- ── TREND DATA ────────────────────────────────────────────────────
create table public.trend_snapshots (
  id            uuid primary key default uuid_generate_v4(),
  snapshot_date date not null default current_date,
  category      text not null,
  metric_name   text not null,
  metric_value  numeric,
  metric_unit   text,
  change_pct    numeric, -- 전월 대비 변화율
  created_at    timestamptz not null default now(),
  unique(snapshot_date, category, metric_name)
);

-- ── AUDIT LOG (보안: 관리자 행동 기록) ─────────────────────────────
create table public.audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.profiles(id),
  action      text not null,
  table_name  text,
  record_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- ── REPORT (신고 시스템) ─────────────────────────────────────────
create table public.reports (
  id          uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references public.profiles(id),
  target_type text not null, -- 'post', 'comment', 'profile'
  target_id   uuid not null,
  reason      text not null,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  constraint reason_length check (char_length(reason) between 10 and 500)
);

-- ================================================================
-- ROW LEVEL SECURITY (RLS) — 핵심 보안
-- ================================================================

-- 모든 테이블 RLS 활성화
alter table public.profiles enable row level security;
alter table public.articles enable row level security;
alter table public.article_images enable row level security;
alter table public.article_likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.community_posts enable row level security;
alter table public.comments enable row level security;
alter table public.projects enable row level security;
alter table public.project_applications enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.trend_snapshots enable row level security;
alter table public.audit_logs enable row level security;
alter table public.reports enable row level security;

-- ── PROFILES RLS ────────────────────────────────────────────────
-- 누구나 프로필 읽기 가능 (is_banned 제외)
create policy "profiles_select" on public.profiles
  for select using (not is_banned);
-- 본인만 자기 프로필 수정
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id);
-- 신규 가입 시 insert (트리거로 자동 생성)
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

-- ── ARTICLES RLS ────────────────────────────────────────────────
-- 발행된 글은 누구나 읽기 가능
create policy "articles_select_published" on public.articles
  for select using (status = 'published');
-- 관리자/작가는 초안 포함 모두 읽기
create policy "articles_select_admin" on public.articles
  for select using (
    auth.uid() in (
      select id from public.profiles where role in ('admin', 'writer')
    )
  );
-- 관리자/작가만 글 작성
create policy "articles_insert" on public.articles
  for insert with check (
    auth.uid() in (
      select id from public.profiles where role in ('admin', 'writer')
    )
  );
-- 본인 글 또는 관리자만 수정
create policy "articles_update" on public.articles
  for update using (
    author_id = auth.uid() or
    auth.uid() in (select id from public.profiles where role = 'admin')
  );
-- 관리자만 삭제
create policy "articles_delete" on public.articles
  for delete using (
    auth.uid() in (select id from public.profiles where role = 'admin')
  );

-- ── COMMUNITY POSTS RLS ─────────────────────────────────────────
create policy "posts_select" on public.community_posts
  for select using (not is_deleted or
    auth.uid() in (select id from public.profiles where role = 'admin'));
create policy "posts_insert" on public.community_posts
  for insert with check (auth.uid() = author_id and
    auth.uid() in (select id from public.profiles where not is_banned));
create policy "posts_update" on public.community_posts
  for update using (author_id = auth.uid() or
    auth.uid() in (select id from public.profiles where role = 'admin'));
create policy "posts_delete" on public.community_posts
  for delete using (
    auth.uid() in (select id from public.profiles where role = 'admin'));

-- ── COMMENTS RLS ────────────────────────────────────────────────
create policy "comments_select" on public.comments
  for select using (not is_deleted);
create policy "comments_insert" on public.comments
  for insert with check (auth.uid() = author_id and
    auth.uid() in (select id from public.profiles where not is_banned));
create policy "comments_update" on public.comments
  for update using (author_id = auth.uid());
create policy "comments_delete" on public.comments
  for delete using (
    auth.uid() in (select id from public.profiles where role = 'admin'));

-- ── LIKES / BOOKMARKS RLS ────────────────────────────────────────
create policy "likes_all" on public.article_likes
  for all using (auth.uid() = user_id);
create policy "bookmarks_all" on public.bookmarks
  for all using (auth.uid() = user_id);

-- ── PROJECTS RLS ────────────────────────────────────────────────
create policy "projects_select" on public.projects
  for select using (true);
create policy "projects_modify" on public.projects
  for all using (
    auth.uid() in (select id from public.profiles where role = 'admin'));

-- ── PROJECT APPLICATIONS RLS ─────────────────────────────────────
create policy "applications_select" on public.project_applications
  for select using (user_id = auth.uid() or
    auth.uid() in (select id from public.profiles where role = 'admin'));
create policy "applications_insert" on public.project_applications
  for insert with check (auth.uid() = user_id);

-- ── NEWSLETTER RLS ───────────────────────────────────────────────
create policy "newsletter_insert" on public.newsletter_subscribers
  for insert with check (true); -- 누구나 구독 가능
create policy "newsletter_select_admin" on public.newsletter_subscribers
  for select using (
    auth.uid() in (select id from public.profiles where role = 'admin'));

-- ── TREND SNAPSHOTS RLS ──────────────────────────────────────────
create policy "trends_select" on public.trend_snapshots
  for select using (true);
create policy "trends_modify" on public.trend_snapshots
  for all using (
    auth.uid() in (select id from public.profiles where role = 'admin'));

-- ── AUDIT LOGS RLS ───────────────────────────────────────────────
create policy "audit_select_admin" on public.audit_logs
  for select using (
    auth.uid() in (select id from public.profiles where role = 'admin'));
create policy "audit_insert" on public.audit_logs
  for insert with check (true);

-- ── REPORTS RLS ──────────────────────────────────────────────────
create policy "reports_insert" on public.reports
  for insert with check (auth.uid() = reporter_id);
create policy "reports_select_admin" on public.reports
  for select using (
    auth.uid() in (select id from public.profiles where role = 'admin'));

-- ================================================================
-- TRIGGERS
-- ================================================================

-- 신규 가입 시 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, username, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', '새 회원')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at 자동 갱신
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger articles_updated_at before update on public.articles
  for each row execute function public.update_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at();
create trigger posts_updated_at before update on public.community_posts
  for each row execute function public.update_updated_at();

-- 게시글 발행 시 published_at 설정
create or replace function public.handle_article_publish()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and old.status != 'published' then
    new.published_at = now();
  end if;
  return new;
end;
$$;

create trigger article_publish_trigger before update on public.articles
  for each row execute function public.handle_article_publish();

-- 댓글 수 자동 집계
create or replace function public.update_reply_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update public.community_posts set reply_count = reply_count + 1
    where id = new.post_id;
  elsif TG_OP = 'DELETE' then
    update public.community_posts set reply_count = greatest(0, reply_count - 1)
    where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger comment_count_trigger
  after insert or delete on public.comments
  for each row execute function public.update_reply_count();

-- ================================================================
-- STORAGE BUCKETS
-- ================================================================
-- Supabase Dashboard에서 실행:
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values ('article-images', 'article-images', true, 5242880,
--   array['image/jpeg','image/png','image/webp','image/gif']);
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values ('avatars', 'avatars', true, 2097152,
--   array['image/jpeg','image/png','image/webp']);

-- Storage RLS
create policy "article_images_select" on storage.objects
  for select using (bucket_id = 'article-images');
create policy "article_images_insert" on storage.objects
  for insert with check (
    bucket_id = 'article-images' and
    auth.uid() in (select id from public.profiles where role in ('admin', 'writer'))
  );
create policy "article_images_delete" on storage.objects
  for delete using (
    bucket_id = 'article-images' and
    auth.uid() in (select id from public.profiles where role = 'admin')
  );

create policy "avatars_select" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and
    auth.role() = 'authenticated'
  );

-- ================================================================
-- TEST DATA (개발용 — 배포 전 삭제)
-- ================================================================
-- insert into public.trend_snapshots
--   (snapshot_date, category, metric_name, metric_value, metric_unit, change_pct)
-- values
--   (current_date, 'ai_startup',  '신규 법인', 847, '개', 38.2),
--   (current_date, 'edutech',     '투자 규모', 2300, '억원', 21.4),
--   (current_date, 'social',      '소셜임팩트 스타트업', 234, '개', 55.1),
--   (current_date, 'youth',       '청소년 창업자', 1127, '명', 67.3);
