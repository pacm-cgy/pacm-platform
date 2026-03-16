import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Clock, Calendar, AlertCircle, Bookmark } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useToggleBookmark, useIsBookmarked } from '../hooks/useData'
import { useAuthStore } from '../store'

function useNewsArticle(slug) {
  return useQuery({
    queryKey: ['news-detail', slug],
    queryFn: async () => {
      if (!slug) throw new Error('slug 없음')
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()  // single() → maybeSingle() (0 rows 에러 방지)
      if (error) throw error
      if (!data) throw new Error('기사를 찾을 수 없습니다')
      // 조회수 증가 (에러 무시)
      try { await supabase.rpc('increment_view', { article_id: data.id }) } catch {}
      return data
    },
    enabled: !!slug,
    retry: 1,
  })
}

function NewsBookmarkBtn({ articleId }) {
  const { data: saved = false } = useIsBookmarked(articleId)
  const toggle = useToggleBookmark()
  const { user } = useAuthStore()
  return (
    <button className="btn btn-outline"
      style={{ gap:'6px', color: saved?'var(--c-gold)':undefined, borderColor: saved?'var(--c-gold)':undefined }}
      onClick={() => { if(!user){ const confirmed = window.confirm('로그인 후 북마크를 사용할 수 있습니다.\n로그인 페이지로 이동할까요?'); if(confirmed) { const auth = document.querySelector('[data-testid="login-btn"]'); auth?.click(); } return }; toggle.mutate({articleId,isBookmarked:saved}) }}
      disabled={toggle.isPending}>
      <Bookmark size={14} fill={saved?'currentColor':'none'} />
      {saved ? '저장됨' : '저장'}
    </button>
  )
}

export default function NewsDetailPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { data: article, isLoading, isError, error } = useNewsArticle(slug)

  if (isLoading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'var(--f-mono)', color: 'var(--c-muted)', fontSize: '13px' }}>불러오는 중...</div>
    </div>
  )

  if (isError || !article) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', padding: '40px 20px' }}>
      <AlertCircle size={40} color="var(--c-gray-4)" />
      <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px', color: 'var(--c-paper)' }}>기사를 찾을 수 없습니다</div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: '12px', color: 'var(--c-muted)' }}>{slug}</div>
      <button onClick={() => navigate('/news')} className="btn btn-outline btn-sm">← 뉴스 목록으로</button>
    </div>
  )

  const date = article.published_at
    ? format(new Date(article.published_at), 'yyyy년 M월 d일 HH:mm', { locale: ko })
    : ''

  // body에서 "원문 보기: URL" 부분 제거
  const cleanBody = (article.body || article.excerpt || '')
    ? (article.body || article.excerpt || '')
        .replace(`\n\n원문 보기: ${article.source_url}`, '')
        .replace(article.excerpt || '', '')
        .trim()
    : ''

  return (
    <div style={{ paddingBottom: '80px' }}>
      {/* 헤더 */}
      <div style={{ borderBottom: '1px solid var(--c-gray-3)', padding: '14px 0' }}>
        <div className="container">
          <button onClick={() => navigate('/news')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: 'var(--c-muted)', fontSize: '13px', fontFamily: 'var(--f-mono)', cursor: 'pointer', transition: 'var(--t-fast)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--c-gold)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--c-muted)'}
          >
            <ArrowLeft size={14} /> 뉴스 목록
          </button>
        </div>
      </div>

      <div className="container" style={{ maxWidth: '760px', margin: '0 auto', padding: '48px var(--pad-x) 0' }}>
        {/* 태그 */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {article.tags?.filter(t => t !== '뉴스').map(t => (
            <span key={t} style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', background: 'var(--c-gold-dim)', padding: '3px 8px', letterSpacing: '1px' }}>
              {t}
            </span>
          ))}
        </div>

        {/* 제목 */}
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px,4vw,30px)', fontWeight: 700, lineHeight: 1.4, marginBottom: '20px', color: 'var(--c-paper)' }}>
          {article.title}
        </h1>

        {/* 메타 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '32px', paddingBottom: '20px', borderBottom: '1px solid var(--c-gray-3)', flexWrap: 'wrap' }}>
          {article.source_name && (
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', border: '1px solid var(--c-gold-dim)', padding: '2px 8px' }}>
              {article.source_name}
            </span>
          )}
          {date && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)' }}>
              <Calendar size={11} /> {date}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)' }}>
            <Clock size={11} /> {article.read_time || 2}분 읽기
          </span>
        </div>

        {/* 커버 이미지 */}
        {article.cover_image && (
          <div style={{ marginBottom: '32px', overflow: 'hidden', border: '1px solid var(--c-gray-3)' }}>
            <img src={article.cover_image} alt={article.title}
              style={{ width: '100%', maxHeight: '420px', objectFit: 'cover', display: 'block' }}
              onError={e => e.target.parentElement.style.display = 'none'}
            />
          </div>
        )}

        {/* 본문 */}
        <div style={{ fontFamily: 'var(--f-serif)', fontSize: '17px', lineHeight: 1.9, color: 'var(--c-paper)', marginBottom: '48px' }}>
          {/* excerpt (요약) */}
          {article.excerpt && (
            <p style={{ fontSize: '18px', lineHeight: 1.8, marginBottom: '24px', color: 'var(--c-paper)' }}>
              {article.excerpt}
            </p>
          )}
          {/* 추가 본문 */}
          {cleanBody && cleanBody !== article.excerpt && cleanBody.length > 20 && (
            <div style={{ color: 'var(--c-muted)', fontSize: '15px', lineHeight: 1.85, marginTop: '16px' }}>
              {cleanBody.split('\n').filter(l => l.trim()).map((line, i) => (
                <p key={i} style={{ marginBottom: '1em' }}>{line}</p>
              ))}
            </div>
          )}
        </div>

        {/* 원문 보기 */}
        {article.source_url?.startsWith('http') && (
          <div style={{
            padding: '24px 28px', background: 'var(--c-gray-2)', border: '1px solid var(--c-gray-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '2px', marginBottom: '4px' }}>ORIGINAL SOURCE</div>
              <div style={{ fontSize: '13px', color: 'var(--c-muted)' }}>{article.source_name || '원문 기사'}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <NewsBookmarkBtn articleId={article?.id} />
              <a href={article.source_url} target="_blank" rel="noopener noreferrer"
                className="btn btn-gold"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
                원문 전체 읽기 <ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}

        {/* 돌아가기 */}
        <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid var(--c-gray-3)' }}>
          <button onClick={() => navigate('/news')} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={14} /> 뉴스 목록으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  )
}
