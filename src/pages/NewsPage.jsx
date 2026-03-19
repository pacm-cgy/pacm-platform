import { useState, useCallback } from 'react'
import { ExternalLink, RefreshCw, Search, Filter } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useNewsArticles } from '../hooks/useData'
import { AdSlot } from '../components/ads/AdBanner'

const CATEGORY_COLORS = {
  funding: '#D4AF37', ai: '#38bdf8', ai_startup: '#38bdf8', edutech: '#f97316',
  youth: '#a78bfa', entrepreneurship: '#34d399', unicorn: '#f472b6',
  climate: '#4ade80', health: '#fb7185', fintech: '#60a5fa', general: '#9ca3af',
}
const CATEGORY_KO = {
  funding: '투자/펀딩', ai: 'AI', ai_startup: 'AI스타트업', edutech: '에듀테크',
  youth: '청소년창업', entrepreneurship: '창업', unicorn: '유니콘',
  climate: '기후테크', health: '헬스케어', fintech: '핀테크', general: '뉴스',
}

const FILTERS = ['전체', '투자/펀딩', 'AI', '창업', '청소년창업', '에듀테크', '헬스케어', '핀테크']

function NewsRow({ article }) {
  const date = article.published_at
    ? format(new Date(article.published_at), 'M월 d일', { locale: ko })
    : ''
  const catColor = CATEGORY_COLORS[article.ai_category] || '#9ca3af'
  const catKo = CATEGORY_KO[article.ai_category] || '뉴스'
  const targetUrl = article.source_url?.startsWith('http') ? article.source_url : null

  const handleClick = useCallback(() => {
    if (targetUrl) window.open(targetUrl, '_blank', 'noopener,noreferrer')
  }, [targetUrl])

  return (
    <article
      onClick={handleClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '14px',
        padding: '14px 0', borderBottom: '1px solid var(--c-border)',
        cursor: targetUrl ? 'pointer' : 'default',
        transition: 'background 0.12s',
        borderRadius: '2px',
      }}
      onMouseEnter={e => { if (targetUrl) e.currentTarget.style.background = 'var(--c-gray-1)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* 카테고리 도트 */}
      <div style={{ flexShrink: 0, paddingTop: '4px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: catColor }} />
      </div>

      {/* 제목 + 메타 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--f-serif)', fontSize: '15px', fontWeight: 600,
          lineHeight: 1.5, color: 'var(--c-paper)', marginBottom: '5px',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {article.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: catColor, letterSpacing: '0.5px' }}>
            {catKo}
          </span>
          {article.source_name && (
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>
              {article.source_name}
            </span>
          )}
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>
            {date}
          </span>
        </div>
      </div>

      {/* 외부 링크 아이콘 */}
      {targetUrl && (
        <div style={{ flexShrink: 0, paddingTop: '3px' }}>
          <ExternalLink size={13} color="var(--c-gray-5)" />
        </div>
      )}
    </article>
  )
}

export default function NewsPage() {
  const [activeFilter, setActiveFilter] = useState('전체')
  const [searchQuery, setSearchQuery] = useState('')
  const { data: articles = [], isLoading, refetch, isFetching } = useNewsArticles()

  const filtered = articles.filter(a => {
    const catKo = CATEGORY_KO[a.ai_category] || '뉴스'
    const matchFilter = activeFilter === '전체' || catKo === activeFilter ||
      (activeFilter === 'AI' && (a.ai_category === 'ai' || a.ai_category === 'ai_startup'))
    const matchSearch = !searchQuery || a.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.source_name?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchFilter && matchSearch
  })

  return (
    <div style={{ paddingBottom: '80px' }}>
      {/* 페이지 헤더 */}
      <div style={{ borderBottom: '1px solid var(--c-border)', padding: '40px 0 28px' }}>
        <div className="container">
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '3px', marginBottom: '10px' }}>
            STARTUP NEWS
          </div>
          <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,36px)', fontWeight: 700, marginBottom: '10px', color: 'var(--c-paper)' }}>
            창업 뉴스
          </h1>
          <p style={{ color: 'var(--c-muted)', fontSize: '14px' }}>
            국내외 스타트업·창업 생태계 최신 뉴스 — 헤드라인 클릭 시 원본 기사로 이동합니다
          </p>
        </div>
      </div>

      {/* 상단 광고 */}
      <div className="container" style={{ paddingTop: '20px' }}>
        <AdSlot position="content-top" />
      </div>

      <div className="container" style={{ paddingTop: '24px' }}>
        {/* 검색 + 새로고침 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--c-gray-5)' }} />
            <input
              type="text"
              placeholder="뉴스 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px 8px 30px',
                background: 'var(--c-gray-1)', border: '1px solid var(--c-border)',
                color: 'var(--c-paper)', fontSize: '13px', fontFamily: 'var(--f-sans)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            style={{ padding: '8px 14px', background: 'none', border: '1px solid var(--c-border)', color: 'var(--c-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontFamily: 'var(--f-mono)' }}
          >
            <RefreshCw size={12} style={{ animation: isFetching ? 'spin 0.8s linear infinite' : 'none' }} />
            새로고침
          </button>
        </div>

        {/* 카테고리 필터 */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '24px' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setActiveFilter(f)}
              style={{
                padding: '5px 12px', fontSize: '11px', fontFamily: 'var(--f-mono)',
                border: '1px solid', cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '0.5px',
                background: activeFilter === f ? 'var(--c-gold)' : 'transparent',
                borderColor: activeFilter === f ? 'var(--c-gold)' : 'var(--c-border)',
                color: activeFilter === f ? '#000' : 'var(--c-muted)',
              }}>
              {f}
            </button>
          ))}
        </div>

        {/* 뉴스 개수 */}
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)', marginBottom: '8px' }}>
          {filtered.length}개 뉴스
        </div>

        {/* 뉴스 목록 */}
        {isLoading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--c-muted)', fontFamily: 'var(--f-mono)', fontSize: '13px' }}>
            뉴스를 불러오는 중...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--c-muted)', fontFamily: 'var(--f-mono)', fontSize: '13px' }}>
            뉴스가 없습니다
          </div>
        ) : (
          <div>
            {filtered.map((article, idx) => (
              <div key={article.id}>
                <NewsRow article={article} />
                {/* 중간 광고 (30번째마다) */}
                {(idx + 1) % 30 === 0 && idx < filtered.length - 1 && (
                  <div style={{ padding: '16px 0' }}>
                    <AdSlot position="news-between" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 하단 광고 */}
        <div style={{ marginTop: '40px' }}>
          <AdSlot position="content-bottom" />
        </div>
      </div>
    </div>
  )
}
