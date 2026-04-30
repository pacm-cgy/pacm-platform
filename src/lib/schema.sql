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

-- ================================================================
-- PACM-AI MENTOR 지속 학습 스키마 (v3.0 추가)
-- ================================================================

-- ── AI 지식베이스 ────────────────────────────────────────────────
create table if not exists public.ai_knowledge (
  id          uuid primary key default uuid_generate_v4(),
  content     text not null,
  category    text not null default 'guide',
  source      text,
  keywords    text[] default '{}',
  quality     integer not null default 7 check (quality between 1 and 10),
  use_count   integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint content_len check (char_length(content) between 20 and 1000)
);
create index if not exists ai_knowledge_cat_idx on public.ai_knowledge(category, quality desc);
create index if not exists ai_knowledge_use_idx on public.ai_knowledge(use_count desc);

-- ── AI 멘토 대화 로그 (지속 학습용) ───────────────────────────────
create table if not exists public.mentor_chat_logs (
  id                 uuid primary key default uuid_generate_v4(),
  session_id         text not null,
  user_id            uuid references public.profiles(id) on delete set null,
  user_message       text not null,
  ai_response        text not null,
  intent_classified  text,
  feedback           text check (feedback in ('good','bad','neutral')),
  feedback_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists mentor_logs_session_idx on public.mentor_chat_logs(session_id);
create index if not exists mentor_logs_intent_idx  on public.mentor_chat_logs(intent_classified);
create index if not exists mentor_logs_feedback_idx on public.mentor_chat_logs(feedback) where feedback is not null;

-- ── AI 의도 통계 (취약 영역 탐지) ───────────────────────────────
create table if not exists public.mentor_intent_stats (
  id                uuid primary key default uuid_generate_v4(),
  intent            text not null,
  sample_query      text,
  needs_improvement boolean default false,
  created_at        timestamptz not null default now()
);
create index if not exists mentor_stats_intent_idx on public.mentor_intent_stats(intent, created_at desc);

-- ── 트렌드 키워드 (헤더 ticker용) ──────────────────────────────
create table if not exists public.trend_keywords (
  id         uuid primary key default uuid_generate_v4(),
  keyword    text not null,
  count      integer not null default 1,
  category   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trend_kw_count_idx on public.trend_keywords(count desc);

-- ── 알림 테이블 ────────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text,
  message    text not null,
  type       text default 'info',
  is_read    boolean default false,
  link       text,
  created_at timestamptz not null default now()
);
create index if not exists notif_user_idx on public.notifications(user_id, created_at desc);

-- ── 아이디어랩 ────────────────────────────────────────────────
create table if not exists public.ideas (
  id           uuid primary key default uuid_generate_v4(),
  author_id    uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  description  text not null,
  category     text not null default 'other',
  stage        text not null default 'idea',
  tags         text[] default '{}',
  like_count   integer not null default 0,
  view_count   integer not null default 0,
  is_public    boolean default true,
  is_deleted   boolean default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint title_len check (char_length(title) between 5 and 100),
  constraint desc_len  check (char_length(description) between 20 and 2000)
);
create index if not exists ideas_author_idx on public.ideas(author_id);
create index if not exists ideas_cat_idx    on public.ideas(category, created_at desc);

-- ── 아이디어 좋아요 ────────────────────────────────────────────
create table if not exists public.idea_likes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  idea_id    uuid not null references public.ideas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, idea_id)
);

-- ── 이벤트/챌린지 ──────────────────────────────────────────────
create table if not exists public.events (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  description     text,
  type            text not null default 'event',
  status          text not null default 'upcoming',
  start_date      date,
  end_date        date,
  location        text,
  prize           text,
  max_participants integer,
  participant_count integer not null default 0,
  tags            text[] default '{}',
  link            text,
  is_featured     boolean default false,
  created_at      timestamptz not null default now()
);
create index if not exists events_status_idx on public.events(status, start_date);

-- ── 이벤트 참가 신청 ───────────────────────────────────────────
create table if not exists public.event_registrations (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  event_id   uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- ── 학습 퀴즈/배지 ────────────────────────────────────────────
create table if not exists public.badges (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  badge_type  text not null,
  badge_name  text not null,
  earned_at   timestamptz not null default now()
);
create index if not exists badges_user_idx on public.badges(user_id);

-- RLS 활성화
alter table public.ai_knowledge       enable row level security;
alter table public.mentor_chat_logs   enable row level security;
alter table public.mentor_intent_stats enable row level security;
alter table public.trend_keywords     enable row level security;
alter table public.notifications      enable row level security;
alter table public.ideas              enable row level security;
alter table public.idea_likes         enable row level security;
alter table public.events             enable row level security;
alter table public.event_registrations enable row level security;
alter table public.badges             enable row level security;

-- RLS 정책
create policy "ai_knowledge_read"   on public.ai_knowledge       for select using (true);
create policy "ai_knowledge_write"  on public.ai_knowledge       for all    using (true);
create policy "mentor_logs_insert"  on public.mentor_chat_logs   for insert with check (true);
create policy "mentor_logs_update"  on public.mentor_chat_logs   for update using (true);
create policy "mentor_stats_insert" on public.mentor_intent_stats for insert with check (true);
create policy "trend_kw_read"       on public.trend_keywords      for select using (true);
create policy "notif_read"          on public.notifications       for select using (auth.uid() = user_id);
create policy "notif_update"        on public.notifications       for update using (auth.uid() = user_id);
create policy "ideas_read"          on public.ideas               for select using (is_public and not is_deleted);
create policy "ideas_insert"        on public.ideas               for insert with check (auth.uid() = author_id);
create policy "ideas_update"        on public.ideas               for update using (auth.uid() = author_id);
create policy "idea_likes_all"      on public.idea_likes          for all    using (auth.uid() = user_id);
create policy "events_read"         on public.events              for select using (true);
create policy "event_reg_all"       on public.event_registrations for all    using (auth.uid() = user_id);
create policy "badges_read"         on public.badges              for select using (true);
create policy "badges_insert"       on public.badges              for insert with check (true);

-- ── 초기 AI 지식베이스 시드 데이터 ──────────────────────────────
insert into public.ai_knowledge (content, category, source, keywords, quality) values
('2024년 한국 AI 스타트업 투자액은 1조 2천억원으로 전년 대비 38.2% 급증했습니다. ChatGPT 등장 이후 VC(벤처캐피탈) 투자 심리가 개선됐고, 정부의 AI 스타트업 육성 정책이 맞물린 결과입니다.', 'market', 'seed', ARRAY['AI','투자','VC','스타트업','2024'], 9),
('에듀테크 시장은 2024년 7,500억원 규모로 전년 대비 21.4% 성장했습니다. AI 튜터링과 맞춤형 학습 수요가 급증했으며, 청소년 창업가들이 교육 현장의 불편함을 해결하는 에듀테크 창업이 유망합니다.', 'trend', 'seed', ARRAY['에듀테크','교육','AI튜터','청소년','성장'], 9),
('예비창업패키지는 창업 경험이 없는 예비 창업자를 위한 정부 지원 사업으로, 최대 1억원의 사업화 자금을 지원합니다. 만 39세 이하 청년이라면 추가 가점을 받을 수 있습니다.', 'policy', 'seed', ARRAY['예비창업패키지','정부지원','지원금','창업'], 9),
('린 스타트업(Lean Startup) 방법론의 핵심은 만들기-측정-학습(Build-Measure-Learn) 피드백 루프입니다. 완벽한 제품 대신 MVP(최소기능제품)로 빠르게 시장을 테스트하는 것이 핵심입니다.', 'guide', 'seed', ARRAY['린스타트업','MVP','피드백루프','방법론'], 9),
('시리즈A 투자는 일반적으로 제품-시장 적합성(PMF)이 검증된 후 받는 첫 번째 본격 투자 단계입니다. 평균 투자 금액은 10~50억원이며, 투자자들은 팀 구성, 성장 지표, 시장 크기를 중점적으로 봅니다.', 'market', 'seed', ARRAY['시리즈A','PMF','투자','성장'], 9),
('청소년 창업의 가장 큰 강점은 "잃을 것이 없다"는 것입니다. 실패해도 배움이 남고, 나이 어린 창업가의 스토리는 언론과 투자자 모두에게 강한 인상을 줍니다. 학교 친구들이 곧 첫 번째 사용자이자 최고의 테스트 그룹입니다.', 'guide', 'seed', ARRAY['청소년창업','강점','스토리'], 9),
('기후테크(ClimaTech) 분야는 2024년 ESG 투자 의무화로 가장 빠르게 성장하는 창업 분야 중 하나입니다. 탄소 발자국 계산기, 제로웨이스트 마켓플레이스, 친환경 소비 습관 앱 등이 주목받고 있습니다.', 'trend', 'seed', ARRAY['기후테크','ESG','친환경','탄소중립'], 8),
('피벗(Pivot)이란 초기 전략이 실패했을 때 핵심 비전은 유지하면서 전략이나 제품을 전환하는 것입니다. Slack은 원래 게임 회사, Instagram은 위치 기반 SNS였다가 피벗해 성공했습니다.', 'guide', 'seed', ARRAY['피벗','전략','실패','성공사례'], 8)
on conflict do nothing;


-- ════════════════════════════════════════════════════════════════
-- SCHEMA v2 — 메시지 + 아이디어 댓글 + 팔로우 테이블 추가
-- ════════════════════════════════════════════════════════════════

-- ── 아이디어 댓글 ──────────────────────────────────────────────
create table if not exists public.idea_comments (
  id         uuid primary key default uuid_generate_v4(),
  idea_id    uuid not null references public.ideas(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  content    text not null,
  is_deleted boolean default false,
  created_at timestamptz not null default now(),
  constraint idea_comment_len check (char_length(content) between 1 and 1000)
);
create index if not exists idea_comments_idea_idx on public.idea_comments(idea_id, created_at);

-- ── 1:1 메시지 대화방 ─────────────────────────────────────────
create table if not exists public.messages_conversations (
  id             uuid primary key default uuid_generate_v4(),
  participant_a  uuid not null references public.profiles(id) on delete cascade,
  participant_b  uuid not null references public.profiles(id) on delete cascade,
  context_type   text not null default 'general',  -- 'general' | 'scout'
  platform       text,
  last_msg_at    timestamptz default now(),
  created_at     timestamptz not null default now(),
  unique(participant_a, participant_b)
);
create index if not exists conv_a_idx on public.messages_conversations(participant_a);
create index if not exists conv_b_idx on public.messages_conversations(participant_b);

-- ── 메시지 ────────────────────────────────────────────────────
create table if not exists public.messages (
  id          uuid primary key default uuid_generate_v4(),
  conv_id     uuid not null references public.messages_conversations(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  content     text not null,
  is_read     boolean default false,
  created_at  timestamptz not null default now(),
  constraint msg_len check (char_length(content) between 1 and 2000)
);
create index if not exists messages_conv_idx on public.messages(conv_id, created_at);
create index if not exists messages_sender_idx on public.messages(sender_id);

-- ── 팔로우 ────────────────────────────────────────────────────
create table if not exists public.user_follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id != following_id)
);
create index if not exists follows_follower_idx  on public.user_follows(follower_id);
create index if not exists follows_following_idx on public.user_follows(following_id);

-- ── RLS 활성화 ─────────────────────────────────────────────────
alter table if exists public.idea_comments           enable row level security;
alter table if exists public.messages_conversations  enable row level security;
alter table if exists public.messages                enable row level security;
alter table if exists public.user_follows            enable row level security;

-- ── RLS 정책 ──────────────────────────────────────────────────
create policy if not exists "idea_comments_read"   on public.idea_comments
  for select using (not is_deleted);
create policy if not exists "idea_comments_insert" on public.idea_comments
  for insert with check (auth.uid() = author_id);
create policy if not exists "idea_comments_delete" on public.idea_comments
  for update using (auth.uid() = author_id);

create policy if not exists "conv_select" on public.messages_conversations
  for select using (auth.uid() = participant_a or auth.uid() = participant_b);
create policy if not exists "conv_insert" on public.messages_conversations
  for insert with check (auth.uid() = participant_a or auth.uid() = participant_b);
create policy if not exists "conv_update" on public.messages_conversations
  for update using (auth.uid() = participant_a or auth.uid() = participant_b);

create policy if not exists "messages_select" on public.messages
  for select using (
    exists (select 1 from public.messages_conversations c
      where c.id = conv_id
      and (c.participant_a = auth.uid() or c.participant_b = auth.uid()))
  );
create policy if not exists "messages_insert" on public.messages
  for insert with check (auth.uid() = sender_id);
create policy if not exists "messages_update" on public.messages
  for update using (
    exists (select 1 from public.messages_conversations c
      where c.id = conv_id
      and (c.participant_a = auth.uid() or c.participant_b = auth.uid()))
  );

create policy if not exists "follows_select" on public.user_follows
  for select using (true);
create policy if not exists "follows_insert" on public.user_follows
  for insert with check (auth.uid() = follower_id);
create policy if not exists "follows_delete" on public.user_follows
  for delete using (auth.uid() = follower_id);


-- ════════════════════════════════════════════════════════════════
-- SCHEMA v3 — AI 자율 운영 시스템 테이블
-- ai_operations_log, newsletter_logs, ai_notices
-- ════════════════════════════════════════════════════════════════

-- ── AI 운영 작업 로그 ─────────────────────────────────────────
create table if not exists public.ai_operations_log (
  id          uuid primary key default uuid_generate_v4(),
  task_type   text not null,            -- 'daily_notice','community_discussion','monthly_event','platform_monitoring','insight_article','startup_guide','editor_column' 등
  run_date    date not null default current_date,
  result      text not null default 'success', -- 'success' | 'error' | 'skipped'
  details     text,
  engine      text,                     -- 'ai-platform-operator-v1' | 'ai-content-writer-v1' 등
  created_at  timestamptz not null default now(),
  constraint ai_ops_result_check check (result in ('success','error','skipped'))
);
create index if not exists ai_ops_task_date_idx on public.ai_operations_log(task_type, run_date desc);
create index if not exists ai_ops_created_idx  on public.ai_operations_log(created_at desc);

-- ── 뉴스레터 발송 로그 ────────────────────────────────────────
create table if not exists public.newsletter_logs (
  id          uuid primary key default uuid_generate_v4(),
  subject     text,
  sent_count  int not null default 0,
  engine      text,
  sent_at     timestamptz not null default now()
);
create index if not exists newsletter_logs_sent_idx on public.newsletter_logs(sent_at desc);

-- ── AI 공지사항 (자율 발행 추적) ─────────────────────────────
create table if not exists public.ai_notices (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  post_id     uuid references public.community_posts(id) on delete set null,
  notice_date date not null default current_date,
  day_of_week smallint,                 -- 0=일 ~ 6=토
  engine      text,
  created_at  timestamptz not null default now()
);
create index if not exists ai_notices_date_idx on public.ai_notices(notice_date desc);

-- ── RLS (서비스 롤에서만 INSERT, 모두 SELECT 가능) ───────────
alter table if exists public.ai_operations_log  enable row level security;
alter table if exists public.newsletter_logs    enable row level security;
alter table if exists public.ai_notices         enable row level security;

create policy if not exists "ai_ops_read"      on public.ai_operations_log for select using (true);
create policy if not exists "ai_ops_insert"    on public.ai_operations_log for insert with check (true);
create policy if not exists "nl_logs_read"     on public.newsletter_logs    for select using (true);
create policy if not exists "nl_logs_insert"   on public.newsletter_logs    for insert with check (true);
create policy if not exists "ai_notices_read"  on public.ai_notices         for select using (true);
create policy if not exists "ai_notices_insert" on public.ai_notices        for insert with check (true);

-- ================================================================
-- Schema Extension v2.0 — Dev Permissions + Patch Notes
-- ================================================================

-- ── 개발팀 권한 관리 ──────────────────────────────────────────
create table if not exists public.dev_permissions (
  id          uuid primary key default uuid_generate_v4(),
  username    text not null,
  permission  text not null,           -- github_read / github_write / supabase_read / ...
  tier        smallint not null default 1,
  granted_by  text,
  expires_at  timestamptz not null,
  note        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique(username, permission)
);
create index if not exists dev_perm_username_idx  on public.dev_permissions(username);
create index if not exists dev_perm_expires_idx   on public.dev_permissions(expires_at);
create index if not exists dev_perm_tier_idx      on public.dev_permissions(tier);

-- ── 개발팀 권한 감사 로그 ─────────────────────────────────────
create table if not exists public.dev_permission_logs (
  id               uuid primary key default uuid_generate_v4(),
  action           text not null,       -- grant / revoke / grant_denied_high_tier
  target_username  text not null,
  permission       text not null,
  granted_by       text,
  note             text,
  created_at       timestamptz not null default now()
);
create index if not exists dev_perm_log_user_idx  on public.dev_permission_logs(target_username);
create index if not exists dev_perm_log_time_idx  on public.dev_permission_logs(created_at desc);

-- ── 패치노트 ─────────────────────────────────────────────────
create table if not exists public.patch_notes (
  id           uuid primary key default uuid_generate_v4(),
  version      text not null,           -- v1.0, v1.1 ...
  title        text not null,
  body         text not null,           -- 마크다운
  tags         text[] default '{}',
  changes      jsonb default '[]',      -- [{ type, desc }] 구조적 변경 목록
  is_published boolean not null default false,
  is_auto      boolean not null default false,
  author       text default 'admin',
  published_at timestamptz,
  updated_at   timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists patch_notes_pub_idx  on public.patch_notes(published_at desc);
create index if not exists patch_notes_ver_idx  on public.patch_notes(version);

-- ── RLS ──────────────────────────────────────────────────────
alter table if exists public.dev_permissions       enable row level security;
alter table if exists public.dev_permission_logs   enable row level security;
alter table if exists public.patch_notes           enable row level security;

-- dev_permissions: 서비스 롤만 쓰기, 모두 읽기
create policy if not exists "dev_perm_read"   on public.dev_permissions       for select using (true);
create policy if not exists "dev_perm_write"  on public.dev_permissions       for all    using (true) with check (true);
create policy if not exists "dev_log_read"    on public.dev_permission_logs   for select using (true);
create policy if not exists "dev_log_write"   on public.dev_permission_logs   for insert with check (true);
-- patch_notes: 공개 읽기, 서비스 롤 쓰기
create policy if not exists "patch_read"      on public.patch_notes           for select using (is_published = true);
create policy if not exists "patch_write"     on public.patch_notes           for all    using (true) with check (true);

-- ================================================================
-- Schema Extension v3.0 — Security Architecture (보안 설계도 구현)
-- ================================================================

-- ── 보안 감사 로그 테이블 (설계도 §7 Immutable Logging) ──────────
create table if not exists public.security_audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  action      text not null,
  user_id     uuid references auth.users(id) on delete set null,
  ip_address  text,
  severity    text not null default 'info'
                check (severity in ('critical','high','medium','low','info')),
  meta        jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists sal_created_idx   on public.security_audit_logs(created_at desc);
create index if not exists sal_severity_idx  on public.security_audit_logs(severity);
create index if not exists sal_user_idx      on public.security_audit_logs(user_id);
create index if not exists sal_ip_idx        on public.security_audit_logs(ip_address);
create index if not exists sal_action_idx    on public.security_audit_logs(action);

-- ── IP 차단 목록 (설계도 §4 DDoS / WAF 연동) ─────────────────────
create table if not exists public.blocked_ips (
  id          uuid primary key default uuid_generate_v4(),
  ip_address  text not null unique,
  reason      text not null,
  blocked_by  text,
  is_active   boolean not null default true,
  expires_at  timestamptz,
  blocked_at  timestamptz not null default now()
);
create index if not exists bip_ip_idx      on public.blocked_ips(ip_address);
create index if not exists bip_active_idx  on public.blocked_ips(is_active);
create index if not exists bip_exp_idx     on public.blocked_ips(expires_at);

-- ── 세션 추적 (설계도 §3 세션 고정 방지) ─────────────────────────
create table if not exists public.active_sessions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  ip_address      text,
  user_agent      text,
  last_active_at  timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists ses_user_idx    on public.active_sessions(user_id);
create index if not exists ses_ip_idx      on public.active_sessions(ip_address);
create index if not exists ses_active_idx  on public.active_sessions(last_active_at desc);

-- ── 로그인 실패 추적 (설계도 §3 계정 잠금 30분) ───────────────────
create table if not exists public.login_attempts (
  id          uuid primary key default uuid_generate_v4(),
  email       text,
  ip_address  text not null,
  success     boolean not null default false,
  user_agent  text,
  attempted_at timestamptz not null default now()
);
create index if not exists la_ip_idx    on public.login_attempts(ip_address);
create index if not exists la_email_idx on public.login_attempts(email);
create index if not exists la_time_idx  on public.login_attempts(attempted_at desc);

-- ── profiles 테이블 보안 컬럼 추가 (설계도 §6 ABAC) ──────────────
alter table if exists public.profiles
  add column if not exists is_ai_account  boolean not null default false,
  add column if not exists admin_locked   boolean not null default false,
  add column if not exists last_login_at  timestamptz,
  add column if not exists login_count    integer not null default 0,
  add column if not exists failed_logins  integer not null default 0,
  add column if not exists locked_until   timestamptz;

-- ── RLS 설정 ─────────────────────────────────────────────────────
alter table if exists public.security_audit_logs  enable row level security;
alter table if exists public.blocked_ips          enable row level security;
alter table if exists public.active_sessions      enable row level security;
alter table if exists public.login_attempts       enable row level security;

-- security_audit_logs: 서비스 롤만 읽기/쓰기 (일반 유저 접근 불가)
create policy if not exists "sal_service_read"
  on public.security_audit_logs for select
  using (auth.role() = 'service_role');
create policy if not exists "sal_service_write"
  on public.security_audit_logs for insert
  with check (true);

-- blocked_ips: 서비스 롤만 관리
create policy if not exists "bip_service_all"
  on public.blocked_ips for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- active_sessions: 자기 세션만 조회, 서비스 롤 전체
create policy if not exists "ses_own_read"
  on public.active_sessions for select
  using (auth.uid() = user_id or auth.role() = 'service_role');
create policy if not exists "ses_service_write"
  on public.active_sessions for all
  using (true) with check (true);

-- login_attempts: 서비스 롤만
create policy if not exists "la_service_all"
  on public.login_attempts for all
  using (auth.role() = 'service_role')
  with check (true);
