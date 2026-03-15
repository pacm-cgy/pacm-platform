import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useArticles, useNewsArticles } from '../hooks/useData'
import { ArticleCardSkeleton } from '../components/article/ArticleCard'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ExternalLink, Clock, RefreshCw } from 'lucide-react'

const TAG_FILTERS = ['전체', '청소년창업', '스타트업투자', '창업인사이트', 'AI스타트업', '유니콘']

function NewsItem({ article }) {
  const navigate = useNavigate()
  const date = article.published_at
    ? format(new Date(article.published_at), 'M월 d일 HH:mm', { locale: ko })
    : ''

  return (
    <article
      style={{
        padding: '20px 24px',
        borderBottom: '1px solid var(--c-gray-3)',
        display: 'flex', gap: '16px', alignItems: 'flex-start',
        cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--c-gray-2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      onClick={() => navigate(`/article/${article.slug}`)}
    >
      {/* 태그/카테고리 인디케이터 */}
      <div style={{ width: '3px', background: 'var(--c-gold)', alignSelf: 'stretch', flexShrink: 0, borderRadius: '2px' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
          {article.tags?.filter(t => t !== '뉴스').map(t => (
            <span key={t} style={{
              fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)',
              letterSpacing: '1px', background: 'var(--c-gold-dim)', padding: '2px 6px',
            }}>{t}</span>
          ))}
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>
            {date}
          </span>
        </div>

        <h3 style={{
          fontFamily: 'var(--f-serif)', fontSize: '16px', fontWeight: 700,
          lineHeight: 1.4, marginBottom: '6px', color: 'var(--c-paper)',
        }}>{article.title}</h3>

        {article.excerpt && (
          <p style={{
            fontSize: '13px', color: 'var(--c-muted)', lineHeight: 1.6,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            marginBottom: '8px',
          }}>{article.excerpt}</p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {article.source_name && (
            <span className="source-badge">출처 · {article.source_name}</span>
          )}
          {article.source_url && (
            <a
              href={article.source_url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', gap: '3px', fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)' }}
            >
              원문 <ExternalLink size={10} />
            </a>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>
            <Clock size={10} /> {article.read_time || 2}분
          </span>
        </div>
      </div>
    </article>
  )
}

export default function NewsPage() {
  const [activeTag, setActiveTag] = useState('전체')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  const { data: articles = [], isLoading, refetch, isFetching } = useNewsArticles({
    limit: PAGE_SIZE,
    page,
  })

  const filtered = activeTag === '전체'
    ? articles
    : articles.filter(a => a.tags?.includes(activeTag))

  return (
    <div style={{ paddingBottom: '64px' }}>
      {/* 헤더 */}
      <div style={{ borderBottom: '1px solid var(--c-gray-3)', padding: '32px 0 24px' }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div className="t-eyebrow" style={{ marginBottom: '8px' }}>LIVE NEWS</div>
              <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: '32px', fontWeight: 700 }}>
                창업 뉴스
              </h1>
              <p style={{ color: 'var(--c-muted)', fontSize: '13px', marginTop: '8px' }}>
                매시간 자동 업데이트 · 구글 뉴스 기반 창업/스타트업 최신 소식
              </p>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'none', border: '1px solid var(--c-gray-3)',
                color: 'var(--c-muted)', fontSize: '12px', fontFamily: 'var(--f-mono)',
                padding: '8px 14px', cursor: 'pointer', transition: 'var(--t-fast)',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--c-gold)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--c-gray-3)'}
            >
              <RefreshCw size={12} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
              새로고침
            </button>
          </div>

          {/* 태그 필터 */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
            {TAG_FILTERS.map(tag => (
              <button
                key={tag}
                onClick={() => { setActiveTag(tag); setPage(0) }}
                style={{
                  padding: '5px 14px',
                  background: activeTag === tag ? 'var(--c-gold)' : 'transparent',
                  color: activeTag === tag ? 'var(--c-black)' : 'var(--c-muted)',
                  border: `1px solid ${activeTag === tag ? 'var(--c-gold)' : 'var(--c-gray-3)'}`,
                  fontFamily: 'var(--f-mono)', fontSize: '11px', letterSpacing: '1px',
                  cursor: 'pointer', transition: 'var(--t-fast)',
                }}
              >{tag}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 뉴스 목록 */}
      <div className="container" style={{ marginTop: '0' }}>
        {/* 실시간 인디케이터 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '12px 24px', borderBottom: '1px solid var(--c-gray-3)',
          fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)',
        }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--c-green)', animation: 'shimmer 2s infinite' }} />
          LIVE · 매시간 자동 업데이트 중
          <span style={{ marginLeft: 'auto' }}>{filtered.length}건</span>
        </div>

        {isLoading ? (
          <div style={{ padding: '24px' }}>
            {[...Array(5)].map((_, i) => <ArticleCardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-muted)' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>📰</div>
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px', marginBottom: '8px' }}>
              아직 뉴스가 없습니다
            </div>
            <div style={{ fontSize: '13px' }}>
              매시간 자동으로 업데이트됩니다<br />
              Vercel Cron이 실행되면 뉴스가 표시됩니다
            </div>
          </div>
        ) : (
          <>
            {filtered.map(article => (
              <NewsItem key={article.id} article={article} />
            ))}

            {/* 페이지네이션 */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '32px' }}>
              {page > 0 && (
                <button onClick={() => setPage(p => p - 1)} className="btn btn-outline btn-sm">← 이전</button>
              )}
              {articles.length === PAGE_SIZE && (
                <button onClick={() => setPage(p => p + 1)} className="btn btn-outline btn-sm">다음 →</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
