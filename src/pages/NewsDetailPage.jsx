import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Clock, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { validateSlug } from '../lib/security'

function useNewsArticle(slug) {
  return useQuery({
    queryKey: ['news-detail', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .single()
      if (error) throw error
      // 조회수 증가
      supabase.rpc('increment_view', { article_id: data.id }).catch(() => {})
      return data
    },
    enabled: !!slug,
  })
}

export default function NewsDetailPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { data: article, isLoading, isError } = useNewsArticle(slug)

  if (isLoading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'var(--f-mono)', color: 'var(--c-muted)', fontSize: '13px' }}>로딩 중...</div>
    </div>
  )

  if (isError || !article) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '40px' }}>📰</div>
      <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px' }}>기사를 찾을 수 없습니다</div>
      <button onClick={() => navigate('/news')} className="btn btn-outline btn-sm">뉴스 목록으로</button>
    </div>
  )

  const date = article.published_at 
    ? format(new Date(article.published_at), 'yyyy년 M월 d일 HH:mm', { locale: ko })
    : ''

  return (
    <div style={{ paddingBottom: '80px' }}>
      {/* 상단 헤더 */}
      <div style={{ borderBottom: '1px solid var(--c-gray-3)', padding: '16px 0', marginBottom: '0' }}>
        <div className="container">
          <button onClick={() => navigate('/news')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: 'var(--c-muted)', fontSize: '13px', fontFamily: 'var(--f-mono)', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--c-gold)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--c-muted)'}
          >
            <ArrowLeft size={14} /> 뉴스 목록
          </button>
        </div>
      </div>

      <div className="container" style={{ maxWidth: '780px', margin: '0 auto', padding: '40px var(--pad-x)' }}>
        {/* 카테고리/태그 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {article.tags?.filter(t => t !== '뉴스').map(t => (
            <span key={t} style={{
              fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)',
              background: 'var(--c-gold-dim)', padding: '3px 8px', letterSpacing: '1px',
            }}>{t}</span>
          ))}
        </div>

        {/* 제목 */}
        <h1 style={{
          fontFamily: 'var(--f-serif)', fontSize: 'clamp(22px, 4vw, 32px)',
          fontWeight: 700, lineHeight: 1.35, marginBottom: '20px', color: 'var(--c-paper)',
        }}>{article.title}</h1>

        {/* 메타 정보 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px', paddingBottom: '20px', borderBottom: '1px solid var(--c-gray-3)', flexWrap: 'wrap' }}>
          {article.source_name && (
            <span className="source-badge" style={{ fontSize: '11px' }}>
              출처 · {article.source_name}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)' }}>
            <Calendar size={11} /> {date}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)' }}>
            <Clock size={11} /> {article.read_time || 2}분 읽기
          </span>
        </div>

        {/* 커버 이미지 */}
        {article.cover_image && (
          <div style={{ marginBottom: '32px', borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--c-gray-3)' }}>
            <img
              src={article.cover_image}
              alt={article.title}
              style={{ width: '100%', maxHeight: '400px', objectFit: 'cover', display: 'block' }}
              onError={e => e.target.parentElement.style.display = 'none'}
            />
          </div>
        )}

        {/* 본문 */}
        <div style={{
          fontFamily: 'var(--f-serif)', fontSize: '17px', lineHeight: 1.9,
          color: 'var(--c-paper)', marginBottom: '40px',
        }}>
          {article.excerpt && (
            <p style={{ marginBottom: '1.4em', fontSize: '18px', fontWeight: 400, color: 'var(--c-paper)', opacity: 0.9 }}>
              {article.excerpt}
            </p>
          )}

          {/* 본문에서 원문 링크 제거하고 표시 */}
          {article.body && article.body !== article.excerpt && (
            <div style={{ color: 'var(--c-muted)', fontSize: '15px', lineHeight: 1.8 }}>
              {article.body
                .replace(`\n\n원문 보기: ${article.source_url}`, '')
                .replace(`${article.excerpt}\n\n`, '')
                .split('\n')
                .filter(line => line.trim())
                .map((line, i) => <p key={i} style={{ marginBottom: '1em' }}>{line}</p>)
              }
            </div>
          )}
        </div>

        {/* 원문 보기 버튼 */}
        {article.source_url && (
          <div style={{
            padding: '24px', background: 'var(--c-gray-2)', border: '1px solid var(--c-gray-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gold)', letterSpacing: '2px', marginBottom: '4px' }}>ORIGINAL SOURCE</div>
              <div style={{ fontSize: '13px', color: 'var(--c-muted)' }}>{article.source_name}</div>
            </div>
            <a
              href={article.source_url?.startsWith("http") ? article.source_url : "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-gold"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
            >
              원문 전체 읽기 <ExternalLink size={14} />
            </a>
          </div>
        )}

        {/* 관련 뉴스로 돌아가기 */}
        <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid var(--c-gray-3)' }}>
          <button onClick={() => navigate('/news')} className="btn btn-outline">
            <ArrowLeft size={14} /> 뉴스 목록으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  )
}
