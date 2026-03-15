import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useArticle(slug) {
  return useQuery({
    queryKey: ['article', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select(`
          *,
          profiles!author_id(id, display_name, avatar_url, startup_name, bio, school),
          article_images(id, url, alt_text, order_index)
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
