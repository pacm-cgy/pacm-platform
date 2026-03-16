import { AdSlot } from '../components/ads/AdBanner'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, ExternalLink, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useNewsArticles } from '../hooks/useData'

const TAG_FILTERS = ['전체', '청소년창업', '스타트업투자', '창업인사이트', 'AI스타트업', '유니콘', '성공사례']

const CATEGORY_COLORS = {
  funding:          ['#1a2f1a', '#2d5a2d'],
  ai:               ['#0f1f2e', '#1a3a5c'],
  ai_startup:       ['#0f1f2e', '#1a3a5c'],
  edutech:          ['#2a1a0f', '#5c3a1a'],
  youth:            ['#1a0f2a', '#3a1a5c'],
  entrepreneurship: ['#1e1a0f', '#3a3010'],
  unicorn:          ['#0f2a1a', '#1a5c3a'],
  climate:          ['#0f2a0f', '#1a4a1a'],
  health:           ['#2a0f1a', '#5c1a3a'],
  fintech:          ['#0f1a2a', '#1a3050'],
  general:          ['#1a1a1a', '#2a2a2a'],
}
const CATEGORY_ICONS = {
  funding: '📈', ai: '🤖', ai_startup: '🤖', edutech: '📚',
  youth: '🚀', entrepreneurship: '💡', unicorn: '🦄',
  climate: '🌱', health: '❤️', fintech: '💰', general: '📰',
}
const CATEGORY_KO = {
  funding: '투자/펀딩', ai: 'AI', ai_startup: 'AI스타트업', edutech: '에듀테크',
  youth: '청소년창업', entrepreneurship: '창업', unicorn: '유니콘',
  climate: '기후테크', health: '헬스케어', fintech: '핀테크', general: '일반',
}

function NewsCard({ article }) {
  const navigate = useNavigate()
  const date = article.published_at
    ? format(new Date(article.published_at), 'M월 d일 HH:mm', { locale: ko })
    : ''
  const isPollinations = article.cover_image?.includes('pollinations.ai')
  const [imgError, setImgError] = useState(false)
  const colors = CATEGORY_COLORS[article.ai_category] || CATEGORY_COLORS.general
  const icon = CATEGORY_ICONS[article.ai_category] || '📰'
  const catKo = CATEGORY_KO[article.ai_category] || '뉴스'

  return (
    <article
      onClick={() => navigate(`/news/${article.slug}`)}
      style={{
        background: 'var(--c-card)',
        border: '1px solid var(--c-border)',
        cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--c-gold)'
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--c-border)'
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* 썸네일 */}
      <div style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
        {article.cover_image && !imgError && !isPollinations ? (
          <img
            src={article.cover_image}
            alt={article.title}
            onError={() => setImgError(true)}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.3s ease' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px'
          }}>
            <span style={{ fontSize: '30px', opacity: 0.75 }}>{icon}</span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              {article.source_name?.replace('.com', '').replace('.co.kr', '').slice(0, 14) || 'NEWS'}
            </span>
          </div>
        )}
        {/* 카테고리 배지 */}
        <div style={{ position: 'absolute', top: '8px', left: '8px' }}>
          <span style={{
            background: 'rgba(10,10,9,0.8)', backdropFilter: 'blur(4px)',
            color: 'var(--c-gold)', fontFamily: 'var(--f-mono)', fontSize: '10px',
            padding: '3px 7px', letterSpacing: '1px', border: '1px solid rgba(249,115,22,0.3)',
          }}>{catKo}</span>
        </div>
      </div>

      {/* 본문 */}
      <div style={{ padding: '16px 18px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h3 style={{
          fontFamily: 'var(--f-serif)', fontSize: '15px', fontWeight: 700, lineHeight: 1.4, color: 'var(--c-paper)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{article.title}</h3>

        {article.ai_summary && article.ai_summary !== '(중복)' && (
          <p style={{
            fontSize: '13px', color: 'var(--c-gray-7)', lineHeight: 1.65, flex: 1,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{article.ai_summary}</p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--c-border)' }}>
          <div style={{ display: 'flex', align: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gold)', fontWeight: 700 }}>
              {article.source_name?.replace('www.', '').split('.')[0].toUpperCase() || 'NEWS'}
            </span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)' }}>{date}</span>
          </div>
          {article.source_url && (
            <a href={article.source_url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: 'var(--c-muted)', transition: 'color 0.15s', padding: '2px' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--c-gold)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--c-muted)'}
            ><ExternalLink size={12} /></a>
          )}
        </div>
      </div>
    </article>
  )
}

function NewsCardSkeleton() {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="skeleton" style={{ aspectRatio: '16/9', width: '100%' }} />
      <div style={{ padding: '16px 18px 18px' }}>
        <div className="skeleton skeleton-text" style={{ width: '80%', height: '15px', marginBottom: '8px' }} />
        <div className="skeleton skeleton-text" style={{ height: '13px' }} />
        <div className="skeleton skeleton-text" style={{ width: '70%', height: '13px' }} />
      </div>
    </div>
  )
}

export default function NewsPage() {
  const navigate = useNavigate()
  const [activeTag, setActiveTag] = useState('전체')
  const { data: articles = [], isLoading, refetch, isFetching } = useNewsArticles({ limit: 60 })

  const filtered = activeTag === '전체'
    ? articles
    : articles.filter(a => (a.tags || []).includes(activeTag))

  return (
    <div style={{ paddingBottom: '64px' }}>
      {/* 헤더 */}
      <div style={{ padding: '36px 0 24px' }}>
        <div className="t-eyebrow" style={{ marginBottom: '8px' }}>LIVE NEWS</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 700, marginBottom: '6px', lineHeight: 1.2 }}>
              창업 뉴스
            </h1>
            <p style={{ color: 'var(--c-muted)', fontSize: '14px' }}>
              {articles.length > 0 ? `${articles.length}개 기사 · AI가 청소년 맞춤으로 정리한 뉴스` : '최신 창업 뉴스를 AI가 청소년 맞춤으로 정리합니다'}
            </p>
          </div>
          <button onClick={() => refetch()} disabled={isFetching}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px solid var(--c-gray-3)', color: 'var(--c-muted)', padding: '7px 14px', fontSize: '12px', fontFamily: 'var(--f-mono)', cursor: 'pointer', transition: 'var(--t-fast)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-gold)'; e.currentTarget.style.color = 'var(--c-gold)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-gray-3)'; e.currentTarget.style.color = 'var(--c-muted)' }}
          >
            <RefreshCw size={12} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
            새로고침
          </button>
        </div>
      </div>

      {/* 태그 필터 */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--c-border)' }}>
        {TAG_FILTERS.map(tag => (
          <button key={tag} onClick={() => setActiveTag(tag)}
            style={{
              padding: '6px 14px', background: activeTag === tag ? 'var(--c-gold)' : 'none',
              border: `1px solid ${activeTag === tag ? 'var(--c-gold)' : 'var(--c-gray-3)'}`,
              color: activeTag === tag ? '#0A0A09' : 'var(--c-muted)',
              fontFamily: 'var(--f-mono)', fontSize: '11px', letterSpacing: '0.5px',
              cursor: 'pointer', transition: 'var(--t-fast)', fontWeight: activeTag === tag ? 700 : 400,
              minHeight: '34px',
            }}
            onMouseEnter={e => { if (activeTag !== tag) { e.currentTarget.style.borderColor = 'var(--c-gold)'; e.currentTarget.style.color = 'var(--c-gold)' } }}
            onMouseLeave={e => { if (activeTag !== tag) { e.currentTarget.style.borderColor = 'var(--c-gray-3)'; e.currentTarget.style.color = 'var(--c-muted)' } }}
          >{tag}</button>
        ))}
      </div>

      <AdSlot slot="news-top" />

      {/* 뉴스 그리드 */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)' }}>
          {[...Array(12)].map((_, i) => <NewsCardSkeleton key={i} />)}
        </div>
      ) : filtered.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)' }}>
          {filtered.map(a => <NewsCard key={a.id} article={a} />)}
        </div>
      ) : (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--c-muted)', border: '1px dashed var(--c-gray-3)' }}>
          <div style={{ fontSize: '36px', marginBottom: '14px' }}>📰</div>
          <div style={{ fontFamily: 'var(--f-serif)', fontSize: '16px', color: 'var(--c-paper)', marginBottom: '6px' }}>해당 태그의 기사가 없습니다</div>
          <button onClick={() => setActiveTag('전체')} className="btn btn-gold btn-sm" style={{ marginTop: '14px' }}>전체 보기</button>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @media (max-width: 900px) {
          div[style*="repeat(3, 1fr)"] { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 560px) {
          div[style*="repeat(3, 1fr)"],
          div[style*="repeat(2, 1fr)"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
