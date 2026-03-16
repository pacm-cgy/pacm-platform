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
    staleTime: 5 * 60 * 1000, // 5분 캐시
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
          id, title, slug, excerpt, ai_summary, cover_image, category,
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
        .single()
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
        await supabase.from('article_likes').delete()
          .match({ user_id: user.id, article_id: articleId })
      } else {
        await supabase.from('article_likes').insert(
          { user_id: user.id, article_id: articleId }
        )
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['articles'] }),
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
      checkRateLimit('create_post', 3, 60000)
      const bodyText = (body || content || '').trim()
      if (!bodyText) throw new Error('내용을 입력해주세요')
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
    onSuccess: (_, { postId }) => qc.invalidateQueries({ queryKey: ['comments', postId] }),
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
      const { error } = await supabase
        .from('newsletter_subscribers')
        .upsert({ email: email.toLowerCase().trim(), is_active: true }, { onConflict: 'email' })
      if (error) throw error
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
        reason: reason.trim().slice(10, 500),
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
    retry: false,
    enabled: !!user && !!articleId,
  })
}
