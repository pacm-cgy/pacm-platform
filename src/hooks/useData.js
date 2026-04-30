import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, checkRateLimit } from '../lib/supabase'
import { useAuthStore } from '../store'

// ── ARTICLES ─────────────────────────────────────────────────────

export function useArticles({ category, featured, limit = 10, page = 0 } = {}) {
  return useQuery({
    queryKey: ['articles', { category, featured, limit, page }],
    queryFn: async () => {
      let q = supabase
        .from('articles')
        .select(`
          id, title, slug, excerpt, cover_image, category,
          tags, read_time, view_count, like_count, featured,
          published_at, created_at, source_name, source_url,
          profiles!author_id (id, display_name, avatar_url, startup_name)
        `)
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1)

      if (category) q = q.eq('category', category)
      if (featured) q = q.eq('featured', true)
      // 홈/카테고리 피드에서 자동수집 뉴스 제외 (뉴스 전용 페이지로 분리)
      if (!category || category !== 'news') {
        q = q.is('source_name', null)
      }

      const { data, error } = await q
      if (error) throw error
      return data
    },
    staleTime: 3 * 60 * 1000, // 3분 캐시
    gcTime: 10 * 60 * 1000,    // 10분 후 GC
  })
}


// ── NEWS (자동수집 뉴스 - source_name 있는 것) ───────────────────
export function useNewsArticles({ limit = 20, page = 0 } = {}) {
  return useQuery({
    queryKey: ['news', { limit, page }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select(`
          id, title, slug, excerpt, cover_image, category,
          tags, read_time, published_at, source_name, source_url, ai_category,
          profiles!author_id (id, display_name)
        `)
        .eq('status', 'published')
        .not('source_name', 'is', null)
        .order('published_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1)
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000, // 1시간마다 자동 갱신
  })
}

export function useArticle(slug) {
  return useQuery({
    queryKey: ['article', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select(`
          *,
          profiles!author_id (id, display_name, avatar_url, startup_name, bio),
        `)
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle()
      if (error) throw error

      // 조회수 증가 (fire & forget)
      try { await supabase.rpc('increment_view', { article_id: data.id }) } catch {}
      return data
    },
    enabled: !!slug,
    staleTime: 2 * 60 * 1000,
  })
}

export function useSearchArticles(query) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      if (!query?.trim()) return []
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, slug, excerpt, category, cover_image, published_at')
        .eq('status', 'published')
        .or(`title.ilike.%${query}%,excerpt.ilike.%${query}%`)
        .limit(10)
      if (error) throw error
      return data
    },
    enabled: !!query && query.length >= 2,
    staleTime: 30 * 1000,
  })
}

export function useLikeArticle() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async ({ articleId, liked }) => {
      if (!user) throw new Error('로그인이 필요합니다')
      checkRateLimit('like', 20, 60000)
      if (liked) {
        // 좋아요 취소
        await supabase.from('article_likes').delete()
          .match({ user_id: user.id, article_id: articleId })
        // like_count 감소
        const { data } = await supabase.from('articles').select('like_count').eq('id', articleId).maybeSingle()
        if (data) await supabase.from('articles').update({ like_count: Math.max(0, (data.like_count||0)-1) }).eq('id', articleId)
      } else {
        // 좋아요 추가
        const { error } = await supabase.from('article_likes').insert({ user_id: user.id, article_id: articleId })
        if (!error) {
          const { data } = await supabase.from('articles').select('like_count').eq('id', articleId).maybeSingle()
          if (data) await supabase.from('articles').update({ like_count: (data.like_count||0)+1 }).eq('id', articleId)
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['articles'] })
      qc.invalidateQueries({ queryKey: ['news'] })
    },
  })
}

// ── COMMUNITY POSTS ───────────────────────────────────────────────

export function usePosts({ postType, post_type, limit = 20, page = 0 } = {}) {
  const filterType = postType || post_type
  return useQuery({
    queryKey: ['posts', { filterType, limit, page }],
    queryFn: async () => {
      let q = supabase
        .from('community_posts')
        .select(`
          id, title, body, content, post_type, tags,
          view_count, like_count, reply_count, comment_count, is_pinned,
          created_at,
          profiles!author_id (id, display_name, avatar_url, startup_name, school)
        `)
        .eq('is_deleted', false)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1)

      const ft = postType || post_type
      if (ft && ft !== 'all') q = q.eq('post_type', ft)
      const { data, error } = await q
      if (error) throw error
      return data
    },
    staleTime: 60 * 1000,
  })
}

export function useCreatePost() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async ({ title, body, content, postType, post_type, tags }) => {
      if (!user) throw new Error('로그인이 필요합니다')
      const prof = useAuthStore.getState().profile
      if (prof?.is_suspended) {
        const until = prof.suspended_until ? new Date(prof.suspended_until) : null
        if (!until || until > new Date()) throw new Error('계정이 정지되어 게시글을 작성할 수 없습니다')
      }
      checkRateLimit('create_post', 3, 60000)
      const bodyText = (body || content || '').trim() || ' '  // NOT NULL 방지
      const { data, error } = await supabase.from('community_posts').insert({
        title: title.trim().slice(0, 200),
        body: bodyText.slice(0, 10000),
        content: bodyText.slice(0, 10000),
        post_type: postType || post_type || 'free',
        tags: (tags || []).slice(0, 10),
        author_id: user.id,
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  })
}

export function useComments(postId) {
  return useQuery({
    queryKey: ['comments', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          id, body, parent_id, created_at,
          profiles!author_id (id, display_name, avatar_url)
        `)
        .eq('post_id', postId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!postId,
    staleTime: 30 * 1000,
  })
}

export function useCreateComment() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async ({ postId, body, parentId }) => {
      if (!user) throw new Error('로그인이 필요합니다')
      const profC = useAuthStore.getState().profile
      if (profC?.is_suspended) {
        const untilC = profC.suspended_until ? new Date(profC.suspended_until) : null
        if (!untilC || untilC > new Date()) throw new Error('계정이 정지되어 댓글을 작성할 수 없습니다')
      }
      checkRateLimit('comment', 10, 60000)
      const { data, error } = await supabase.from('comments').insert({
        post_id: postId,
        body: body.trim().slice(0, 2000),
        parent_id: parentId || null,
        author_id: user.id,
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_, { postId }) => {
      qc.invalidateQueries({ queryKey: ['comments', postId] })
      qc.invalidateQueries({ queryKey: ['post', postId] })
      // reply_count 직접 증가 (트리거 없을 경우 폴백)
      supabase.from('community_posts')
        .select('reply_count').eq('id', postId).maybeSingle()
        .then(({ data }) => {
          if (data !== null) {
            supabase.from('community_posts')
              .update({ reply_count: (data?.reply_count || 0) + 1 })
              .eq('id', postId).then(() => {})
          }
        }).catch(() => {})
    },
  })
}

// ── PROJECTS ─────────────────────────────────────────────────────

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .in('status', ['open', 'coming_soon'])
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useApplyProject() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async ({ projectId, motivation }) => {
      if (!user) throw new Error('로그인이 필요합니다')
      checkRateLimit('apply', 5, 60000)
      const { error } = await supabase.from('project_applications').insert({
        project_id: projectId,
        user_id: user.id,
        motivation: (motivation || '').trim().slice(0, 1000),
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

// ── TREND ─────────────────────────────────────────────────────────

export function useTrends() {
  return useQuery({
    queryKey: ['trends'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trend_snapshots')
        .select('*')
        .order('snapshot_date', { ascending: false })
        .order('category')
        .limit(20)
      if (error) throw error
      return data
    },
    staleTime: 30 * 60 * 1000, // 30분 캐시
  })
}

// ── NEWSLETTER ────────────────────────────────────────────────────

export function useSubscribeNewsletter() {
  return useMutation({
    mutationFn: async (email) => {
      checkRateLimit('newsletter', 3, 60000)
      const emailRegex = /^[^@]+@[^@]+\.[^@]+$/
      if (!emailRegex.test(email)) throw new Error('올바른 이메일 주소를 입력해주세요')
      const emailLower = email.toLowerCase().trim()
      // 이미 있으면 업데이트, 없으면 삽입
      const { error } = await supabase
        .from('newsletter_subscribers')
        .upsert(
          { email: emailLower, is_active: true },
          { onConflict: 'email', ignoreDuplicates: false }
        )
      if (error) {
        // upsert 실패 시 insert 시도
        const { error: e2 } = await supabase
          .from('newsletter_subscribers')
          .insert({ email: emailLower, is_active: true })
        if (e2 && e2.code !== '23505') throw e2 // 중복 외 에러만 throw
      }
      return { success: true }
    },
  })
}

// ── REPORT ────────────────────────────────────────────────────────
export function useReport() {
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async ({ targetType, targetId, reason }) => {
      if (!user) throw new Error('로그인이 필요합니다')
      checkRateLimit('report', 5, 300000) // 5분에 5개
      const { error } = await supabase.from('reports').insert({
        reporter_id: user.id,
        target_type: targetType,
        target_id: targetId,
        reason: reason.trim().slice(0, 500),  // fix: 0부터 잘라야 함
      })
      if (error) throw error
    },
  })
}

export function useBookmarks() {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['bookmarks', user?.id],
    queryFn: async () => {
      if (!user) return []
      try {
        const { data, error } = await supabase
          .from('article_bookmarks')
          .select('article_id, articles(id,title,slug,excerpt,cover_image,category,published_at,source_name)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
        if (error) return []
        return data?.map(b => b.articles).filter(Boolean) || []
      } catch { return [] }
    },
    enabled: !!user,
    retry: false,
  })
}

export function useToggleBookmark() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async ({ articleId, isBookmarked }) => {
      if (!user) throw new Error('로그인이 필요합니다')
      if (isBookmarked) {
        const { error } = await supabase.from('article_bookmarks')
          .delete().eq('user_id', user.id).eq('article_id', articleId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('article_bookmarks')
          .insert({ user_id: user.id, article_id: articleId })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookmarks'] }),
  })
}

export function useIsBookmarked(articleId) {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['bookmark', articleId, user?.id],
    queryFn: async () => {
      if (!user || !articleId) return false
      try {
        const { data, error } = await supabase.from('article_bookmarks')
          .select('id').eq('user_id', user.id).eq('article_id', articleId).maybeSingle()
        if (error) return false
        return !!data
      } catch { return false }
    },
    retry: 1,
    retryDelay: 500,
    enabled: !!user && !!articleId,
  })
}

// ── PINNED NOTICES (홈 최상단 배너용) ──────────────────────────
export function usePinnedNotices() {
  return useQuery({
    queryKey: ['pinned_notices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_posts')
        .select('id, title, body, created_at')
        .eq('post_type', 'notice')
        .eq('is_pinned', true)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(3)
      if (error) return []
      return data || []
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  })
}

// ── NEWS-BASED TRENDS (뉴스 카테고리별 자동 트렌드) ──────────────
export function useNewsTrends() {
  return useQuery({
    queryKey: ['news_trends'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('trend_snapshots')
        .select('*')
        .in('category', ['경제/창업','기술/IT','교육/창업','사회/창업','환경/에너지','헬스케어','AI분석'])
        .gte('snapshot_date', yesterday)
        .order('metric_value', { ascending: false })
        .limit(20)
      if (error) return []
      return data || []
    },
    staleTime: 30 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  })
}

// ── WEEKLY REPORTS ────────────────────────────────────────────────
export function useWeeklyReports(limit = 12) {
  return useQuery({
    queryKey: ['weekly_reports', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_reports')
        .select('*')
        .order('week_start', { ascending: false })
        .limit(limit)
      if (error) return []
      return data || []
    },
    staleTime: 60 * 60 * 1000, // 1시간 캐시
  })
}

// ── TRENDS TABLE ──────────────────────────────────────────────────
export function useWeeklyTrends(limit = 4) {
  return useQuery({
    queryKey: ['weekly_trends', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trends')
        .select('*')
        .eq('period_type', 'weekly')
        .order('period_start', { ascending: false })
        .limit(limit)
      if (error) return []
      return data || []
    },
    staleTime: 60 * 60 * 1000,
  })
}

// ── USER BADGES ───────────────────────────────────────────────────
export function useUserBadges(userId) {
  return useQuery({
    queryKey: ['user_badges', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('user_badges')
        .select('*')
        .eq('user_id', userId)
        .order('earned_at', { ascending: false })
      if (error) return []
      return data || []
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  })
}

// ── FOLLOW FEED ───────────────────────────────────────────────────
export function useFollowFeed(userId, limit = 20) {
  return useQuery({
    queryKey: ['follow_feed', userId, limit],
    queryFn: async () => {
      if (!userId) return []
      // 팔로잉 목록 조회
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)
        .limit(100)
      if (!follows?.length) return []
      const ids = follows.map(f => f.following_id)
      const { data, error } = await supabase
        .from('community_posts')
        .select(`
          id, title, post_type, like_count, reply_count, created_at,
          profiles!author_id (id, display_name, avatar_url)
        `)
        .eq('is_deleted', false)
        .in('author_id', ids)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return []
      return data || []
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  })
}

// ── HOT POSTS ─────────────────────────────────────────────────────
export function useHotPosts(limit = 10) {
  return useQuery({
    queryKey: ['hot_posts', limit],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data, error } = await supabase
        .from('community_posts')
        .select(`
          id, title, post_type, view_count, like_count, reply_count, created_at,
          profiles!author_id (id, display_name, avatar_url)
        `)
        .eq('is_deleted', false)
        .gte('created_at', since)
        .order('like_count', { ascending: false })
        .limit(limit * 2)
      if (error) return []
      // 클라이언트 사이드 hot score 정렬
      return (data || [])
        .map(p => ({
          ...p,
          hot_score: (p.view_count || 0) * 0.3 + (p.like_count || 0) * 0.5 + (p.reply_count || 0) * 0.2,
        }))
        .sort((a, b) => b.hot_score - a.hot_score)
        .slice(0, limit)
    },
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  })
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────
export function useNotifications(userId) {
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) return []
      return data || []
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000, // 3분마다 갱신 (Supabase Realtime이 실시간 커버)
  })
}

export function useMarkNotifRead() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async (notifId) => {
      if (!user) return
      const q = notifId
        ? supabase.from('notifications').update({ is_read: true }).eq('id', notifId)
        : supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
      await q
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

// ── EVENTS ────────────────────────────────────────────────────────
export function useEvents({ status, limit = 20 } = {}) {
  return useQuery({
    queryKey: ['events', { status, limit }],
    queryFn: async () => {
      let q = supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) return []
      return data || []
    },
    staleTime: 10 * 60 * 1000,
  })
}

// ── IDEAS ─────────────────────────────────────────────────────────
export function useIdeas({ category, limit = 20, page = 0 } = {}) {
  return useQuery({
    queryKey: ['ideas', { category, limit, page }],
    queryFn: async () => {
      let q = supabase
        .from('startup_ideas')
        .select(`
          id, title, description, category, stage, tags, seeking_roles,
          like_count, comment_count, view_count, is_featured, created_at,
          profiles!author_id (id, display_name, avatar_url, school)
        `)
        .eq('is_deleted', false)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1)
      if (category && category !== 'all') q = q.eq('category', category)
      const { data, error } = await q
      if (error) return []
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── EduProgress (학습 진도 저장) ──────────────────────────────────
export function useEduProgress(userId) {
  return useQuery({
    queryKey: ['edu_progress', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('edu_progress')
        .select('*')
        .eq('user_id', userId)
      if (error) return []
      return data || []
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSaveEduProgress() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async ({ courseId, completed }) => {
      if (!user) return
      const { error } = await supabase.from('edu_progress').upsert({
        user_id: user.id,
        course_id: courseId,
        completed,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,course_id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['edu_progress'] }),
  })
}

// ── 관련 아티클 추천 (현재 보는 아티클 기반) ─────────────────────
export function useRelatedArticles(articleId, category, tags = [], limit = 4) {
  return useQuery({
    queryKey: ['related', articleId, category],
    queryFn: async () => {
      if (!articleId) return []
      try {
        // 1) 같은 카테고리 최신 아티클 (현재 글 제외)
        const { data: catData } = await supabase
          .from('articles')
          .select('id,title,slug,excerpt,cover_image,category,published_at,read_time,view_count')
          .eq('status','published')
          .eq('category', category)
          .neq('id', articleId)
          .is('source_name', null)
          .order('published_at', { ascending: false })
          .limit(limit * 2)
        const pool = catData || []

        // 2) 태그 매칭 스코어 계산
        const tagSet = new Set(tags || [])
        const scored = pool.map(a => {
          const aTags = a.tags || []
          const overlap = aTags.filter(t => tagSet.has(t)).length
          return { ...a, _score: overlap }
        }).sort((a, b) => b._score - a._score || new Date(b.published_at) - new Date(a.published_at))

        return scored.slice(0, limit)
      } catch { return [] }
    },
    enabled: !!articleId && !!category,
    staleTime: 10 * 60 * 1000,
  })
}

// ── 인기 아티클 (조회수 기반) ─────────────────────────────────────
export function usePopularArticles(category, limit = 5) {
  return useQuery({
    queryKey: ['popular', category, limit],
    queryFn: async () => {
      try {
        let q = supabase
          .from('articles')
          .select('id,title,slug,cover_image,category,published_at,view_count,read_time')
          .eq('status','published')
          .is('source_name', null)
          .order('view_count', { ascending: false })
          .limit(limit)
        if (category && category !== 'all') q = q.eq('category', category)
        const { data } = await q
        return data || []
      } catch { return [] }
    },
    staleTime: 15 * 60 * 1000,
  })
}

// ── 알림 생성 (관리자용 — 사용자에게 알림 전송) ──────────────────
export function useSendNotification() {
  return useMutation({
    mutationFn: async ({ userId, type, title, message, link }) => {
      const { error } = await supabase.from('notifications').insert({
        user_id: userId,
        type: type || 'system',
        title,
        message,
        link: link || null,
        is_read: false,
        created_at: new Date().toISOString(),
      })
      if (error) throw error
    },
  })
}
