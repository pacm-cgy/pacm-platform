import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, ExternalLink, RefreshCw, Image } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useNewsArticles } from '../hooks/useData'

const TAG_FILTERS = ['전체', '청소년창업', '스타트업투자', '창업인사이트', 'AI스타트업', '유니콘', '성공사례']

function NewsCard({ article }) {
  const navigate = useNavigate()
  const date = article.published_at
    ? format(new Date(article.published_at), 'M월 d일 HH:mm', { locale: ko })
    : ''
  const [imgError, setImgError] = useState(false)

  return (
    <article
      onClick={() => navigate(`/news/${article.slug}`)}
      style={{
        background: 'var(--c-card)', border: '1px solid var(--c-gray-3)',
        cursor: 'pointer', transition: 'var(--t-fast)',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-gold)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-gray-3)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* 이미지 */}
      <div style={{ width: '100%', aspectRatio: '16/9', background: 'var(--c-gray-2)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
        {article.cover_image && !imgError ? (
          <img
            src={article.cover_image}
            alt={article.title}
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px', background: 'linear-gradient(135deg, var(--c-gray-2) 0%, var(--c-gray-3) 100%)' }}>
            <div style={{ width: '40px', height: '40px', border: '1px solid var(--c-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
              <Image size={16} color="var(--c-gold)" />
            </div>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '9px', color: 'var(--c-gray-6)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              {article.source_name?.replace('.com','').replace('.co.kr','').slice(0, 12) || 'NEWS'}
            </span>
          </div>
        )}
        {/* 태그 오버레이 */}
        <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {article.tags?.filter(t => t !== '뉴스').slice(0, 1).map(t => (
            <span key={t} style={{
              fontFamily: 'var(--f-mono)', fontSize: '9px', color: 'var(--c-black)',
              background: 'var(--c-gold)', padding: '2px 6px', letterSpacing: '1px',
            }}>{t}</span>
          ))}
        </div>
      </div>

      {/* 내용 */}
      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h3 style={{
          fontFamily: 'var(--f-serif)', fontSize: '15px', fontWeight: 700,
          lineHeight: 1.4, color: 'var(--c-paper)', flex: 1,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{article.title}</h3>

        {article.excerpt && (
          <p style={{
            fontSize: '12px', color: 'var(--c-muted)', lineHeight: 1.6,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{article.excerpt}</p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--c-gray-3)', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {article.source_name && (
              <span className="source-badge">{article.source_name.slice(0, 12)}</span>
            )}
          </div>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>
            {date}
          </span>
        </div>
      </div>
    </article>
  )
}

export default function NewsPage() {
  const navigate = useNavigate()
  const [activeTag, setActiveTag] = useState('전체')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 24

  const { data: articles = [], isLoading, refetch, isFetching } = useNewsArticles({
    limit: PAGE_SIZE, page,
  })

  const filtered = activeTag === '전체'
    ? articles
    : articles.filter(a => a.tags?.includes(activeTag))

  return (
    <div style={{ paddingBottom: '64px' }}>
      {/* 헤더 */}
      <div style={{ borderBottom: '1px solid var(--c-gray-3)', padding: '32px 0 24px' }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div className="t-eyebrow" style={{ marginBottom: '8px' }}>LIVE NEWS</div>
              <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 700, color: 'var(--c-paper)' }}>
                창업 뉴스
              </h1>
              <p style={{ color: 'var(--c-muted)', fontSize: '13px', marginTop: '8px' }}>
                매일 자동 업데이트 · 네이버 뉴스 기반 창업/스타트업 최신 소식
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
              <button key={tag} onClick={() => { setActiveTag(tag); setPage(0) }}
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

      {/* 뉴스 그리드 */}
      <div className="container" style={{ marginTop: '32px' }}>
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '2px' }}>
            {[...Array(12)].map((_, i) => (
              <div key={i} className="card skeleton" style={{ aspectRatio: '3/4' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-muted)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📰</div>
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px', marginBottom: '8px' }}>뉴스가 없습니다</div>
            <div style={{ fontSize: '13px', lineHeight: 1.8 }}>
              Vercel 환경변수에 <code style={{ background: 'var(--c-gray-2)', padding: '2px 6px', fontFamily: 'var(--f-mono)', fontSize: '12px' }}>NAVER_CLIENT_ID</code>와<br />
              <code style={{ background: 'var(--c-gray-2)', padding: '2px 6px', fontFamily: 'var(--f-mono)', fontSize: '12px' }}>NAVER_CLIENT_SECRET</code>을 설정해주세요
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--c-green)' }} />
                LIVE · {filtered.length}건
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '2px' }}>
              {filtered.map(article => <NewsCard key={article.id} article={article} />)}
            </div>

            {/* 페이지네이션 */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '40px 0 0' }}>
              {page > 0 && <button onClick={() => setPage(p => p - 1)} className="btn btn-outline btn-sm">← 이전</button>}
              {articles.length === PAGE_SIZE && <button onClick={() => setPage(p => p + 1)} className="btn btn-outline btn-sm">다음 →</button>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
