import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search, X, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { supabase } from '../lib/supabase'

const CATEGORY_COLORS = {
  funding: '#D4AF37', ai: '#38bdf8', ai_startup: '#38bdf8', edutech: '#f97316',
  youth: '#a78bfa', entrepreneurship: '#34d399', unicorn: '#f472b6',
  climate: '#4ade80', health: '#fb7185', fintech: '#60a5fa', general: '#9ca3af',
}
const CATEGORY_KO = {
  funding: '투자/펀딩', ai: 'AI', ai_startup: 'AI', edutech: '에듀테크',
  youth: '청소년창업', entrepreneurship: '창업', unicorn: '유니콘',
  climate: '기후테크', health: '헬스케어', fintech: '핀테크', general: '일반',
}
const FILTERS = [
  { label: '전체', value: '전체' },
  { label: '투자/펀딩', value: '투자/펀딩' },
  { label: 'AI', value: 'AI' },
  { label: '창업', value: '창업' },
  { label: '청소년창업', value: '청소년창업' },
  { label: '에듀테크', value: '에듀테크' },
  { label: '헬스케어', value: '헬스케어' },
  { label: '핀테크', value: '핀테크' },
]
const PAGE_SIZE = 60

// 제목 클리닝 - [태그] 제거
function cleanTitle(title) {
  if (!title) return title
  return title.replace(/^\[[^\]]{1,20}\]\s*/g, '').trim()
}

function NewsRow({ article, index }) {
  const navigate = useNavigate()
  const date = article.published_at
    ? format(new Date(article.published_at), 'M월 d일', { locale: ko })
    : ''
  const catColor = CATEGORY_COLORS[article.ai_category] || '#9ca3af'
  const catKo = CATEGORY_KO[article.ai_category] || '뉴스'
  const cleanedTitle = cleanTitle(article.title)

  return (
    <article
      onClick={() => navigate(`/article/${article.slug}`)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '14px',
        padding: '13px 0', borderBottom: '1px solid var(--c-border)',
        cursor: 'pointer', transition: 'background 0.1s',
        margin: '0 -4px', padding: '13px 4px',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--c-gray-1)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* 색상 도트 */}
      <div style={{ flexShrink: 0, paddingTop: '7px' }}>
        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: catColor, opacity: 0.8 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 제목 */}
        <div style={{
          fontFamily: 'var(--f-serif)', fontSize: '15px', fontWeight: 600,
          lineHeight: 1.55, color: 'var(--c-paper)', marginBottom: '5px',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {cleanedTitle}
        </div>
        {/* 메타 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: '10px', letterSpacing: '0.3px',
            color: catColor, padding: '1px 5px', border: `1px solid ${catColor}44`,
          }}>
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
    </article>
  )
}

function NewsRowSkeleton() {
  return (
    <div style={{ padding: '13px 0', borderBottom: '1px solid var(--c-border)', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--c-gray-3)', flexShrink: 0, marginTop: '7px' }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton" style={{ height: '16px', width: '85%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '16px', width: '60%', marginBottom: '8px' }} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <div className="skeleton" style={{ height: '12px', width: '60px' }} />
          <div className="skeleton" style={{ height: '12px', width: '40px' }} />
        </div>
      </div>
    </div>
  )
}

export default function NewsPage() {
  const [activeFilter, setActiveFilter] = useState('전체')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [articles, setArticles] = useState([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const loaderRef = useRef(null)
  const searchRef = useRef(null)

  const FILTER_TO_CAT = {
    '투자/펀딩': ['funding', 'unicorn'],
    'AI': ['ai', 'ai_startup'],
    '창업': ['entrepreneurship', 'general'],
    '청소년창업': ['youth'],
    '에듀테크': ['edutech'],
    '헬스케어': ['health'],
    '핀테크': ['fintech'],
  }

  const fetchNews = useCallback(async (pageNum, filter, search, reset = false) => {
    if (isLoading) return
    setIsLoading(true)
    try {
      let q = supabase
        .from('articles')
        .select('id,title,slug,ai_category,source_name,published_at', { count: 'exact' })
        .eq('status', 'published')
        .not('source_name', 'is', null)
        .order('published_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

      if (filter !== '전체' && FILTER_TO_CAT[filter]) {
        q = q.in('ai_category', FILTER_TO_CAT[filter])
      }
      if (search.trim()) {
        q = q.ilike('title', `%${search.trim()}%`)
      }

      const { data, count, error } = await q
      if (error) throw error

      const newData = data || []
      if (reset) {
        // title 기준 중복 제거 (DB constraint 이전 데이터 대비 방어)
        const seen = new Set()
        const deduped = newData.filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true; })
        setArticles(deduped)
      } else {
        setArticles(prev => {
          const seen = new Set(prev.map(a => a.title))
          const deduped = newData.filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true; })
          return [...prev, ...deduped]
        })
      }
      if (pageNum === 0) setTotal(count || 0)
      setHasMore(newData.length === PAGE_SIZE)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading])

  // 초기 로드
  useEffect(() => {
    setPage(0)
    setArticles([])
    fetchNews(0, activeFilter, searchQuery, true)
  }, [activeFilter, searchQuery])

  // 무한스크롤
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !isLoading) {
        const next = page + 1
        setPage(next)
        fetchNews(next, activeFilter, searchQuery, false)
      }
    }, { threshold: 0.1 })
    if (loaderRef.current) obs.observe(loaderRef.current)
    return () => obs.disconnect()
  }, [hasMore, isLoading, page, activeFilter, searchQuery])

  const handleSearch = (e) => {
    e.preventDefault()
    setSearchQuery(searchInput)
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearchQuery('')
    searchRef.current?.focus()
  }

  const handleRefresh = () => {
    setPage(0)
    setArticles([])
    fetchNews(0, activeFilter, searchQuery, true)
  }

  return (
    <div style={{ paddingBottom: '100px' }}>
      {/* 헤더 */}
      <div style={{ padding: '28px 0 0', borderBottom: '1px solid var(--c-border)' }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--brand)', letterSpacing: '3px', marginBottom: '6px' }}>
                STARTUP NEWS
              </div>
              <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px,4vw,28px)', fontWeight: 700, marginBottom: '4px' }}>
                창업 뉴스
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--c-muted)' }}>
                국내외 스타트업·창업 생태계 최신 뉴스 — AI 요약으로 빠르게 읽기
              </p>
            </div>
            <button
              onClick={handleRefresh}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px solid var(--c-border)', color: 'var(--c-muted)', padding: '8px 12px', cursor: 'pointer', fontFamily: 'var(--f-mono)', fontSize: '11px', transition: 'all 0.12s', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-muted)' }}
            >
              <RefreshCw size={12} className={isLoading ? 'spin' : ''} />
              새로고침
            </button>
          </div>

          {/* 검색 */}
          <form onSubmit={handleSearch} style={{ marginBottom: '14px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--c-border)', background: 'var(--c-gray-1)', transition: 'border-color 0.15s' }}
              onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--brand)'}
              onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--c-border)'}
            >
              <Search size={14} color="var(--c-gray-5)" style={{ marginLeft: '12px', flexShrink: 0 }} />
              <input
                ref={searchRef}
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="뉴스 검색..."
                style={{ flex: 1, padding: '10px 10px', background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: 'var(--c-paper)' }}
              />
              {searchInput && (
                <button type="button" onClick={clearSearch} style={{ background: 'none', border: 'none', padding: '0 10px', cursor: 'pointer', color: 'var(--c-gray-5)', display: 'flex', alignItems: 'center' }}>
                  <X size={14} />
                </button>
              )}
              <button type="submit" style={{ background: 'var(--brand)', border: 'none', color: '#1a1814', padding: '10px 16px', cursor: 'pointer', fontFamily: 'var(--f-mono)', fontSize: '11px', letterSpacing: '0.5px', fontWeight: 700, flexShrink: 0, transition: 'opacity 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                검색
              </button>
            </div>
          </form>

          {/* 필터 탭 */}
          <div className="news-filter-wrap" style={{ display: 'flex', gap: '2px', overflowX: 'auto', paddingBottom: '0', scrollbarWidth: 'none' }}>
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setActiveFilter(f.value)}
                style={{
                  padding: '7px 14px', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--f-mono)', fontSize: '11px', letterSpacing: '0.3px',
                  whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.12s',
                  background: activeFilter === f.value ? 'var(--brand)' : 'var(--c-gray-2)',
                  color: activeFilter === f.value ? '#1a1814' : 'var(--c-muted)',
                  fontWeight: activeFilter === f.value ? 700 : 400,
                  borderBottom: activeFilter === f.value ? 'none' : '2px solid transparent',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 카운트 + 검색 상태 */}
      <div className="container" style={{ paddingTop: '14px', paddingBottom: '4px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)' }}>
          {searchQuery ? `"${searchQuery}" 검색 결과` : activeFilter !== '전체' ? `${activeFilter}` : '전체'} · {total.toLocaleString()}건
        </span>
        {searchQuery && (
          <button onClick={clearSearch} style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <X size={10} /> 검색 초기화
          </button>
        )}
      </div>

      {/* 뉴스 목록 */}
      <div className="container">
        {articles.length === 0 && !isLoading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--c-muted)' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: '15px', color: 'var(--c-paper)', marginBottom: '6px' }}>
              {searchQuery ? '검색 결과가 없습니다' : '뉴스가 없습니다'}
            </div>
            <div style={{ fontSize: '13px' }}>
              {searchQuery ? '다른 키워드로 검색해 보세요' : '잠시 후 다시 시도해 주세요'}
            </div>
          </div>
        ) : (
          <>
            {articles.map((a, i) => <NewsRow key={a.id} article={a} index={i} />)}
            {isLoading && Array.from({ length: 8 }).map((_, i) => <NewsRowSkeleton key={i} />)}
          </>
        )}
        <div ref={loaderRef} style={{ height: '40px' }} />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .spin { animation: spin 0.8s linear infinite }
        .news-filter-wrap::-webkit-scrollbar { display: none }
        .skeleton {
          background: linear-gradient(90deg, var(--c-gray-2) 25%, var(--c-gray-3) 50%, var(--c-gray-2) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
          border-radius: 2px;
        }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
      `}</style>
    </div>
  )
}
