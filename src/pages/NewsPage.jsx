import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search, X, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { supabase } from '../lib/supabase'

const CATEGORY_COLORS = {
  funding: '#F59E0B', ai: '#818cf8', ai_startup: '#818cf8', edutech: '#38bdf8',
  youth: '#34d399', entrepreneurship: '#c4b5fd', unicorn: '#fb7185',
  climate: '#86efac', health: '#67e8f9', fintech: '#fb923c', general: '#9CA3AF',
}
const CATEGORY_BG = {
  funding: 'rgba(245,158,11,0.12)', ai: 'rgba(129,140,248,0.12)', ai_startup: 'rgba(129,140,248,0.12)',
  edutech: 'rgba(56,189,248,0.12)', youth: 'rgba(52,211,153,0.12)',
  entrepreneurship: 'rgba(196,181,253,0.12)', unicorn: 'rgba(251,113,133,0.12)',
  climate: 'rgba(134,239,172,0.12)', health: 'rgba(103,232,249,0.12)',
  fintech: 'rgba(251,146,60,0.12)', general: 'rgba(156,163,175,0.12)',
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
  const catKo = CATEGORY_KO[article.ai_category] || '뉴스'
  const cleanedTitle = cleanTitle(article.title)

  return (
    <article
      onClick={() => navigate(`/article/${article.slug}`)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '14px',
        padding: '13px 0', borderBottom: '1px solid var(--line-1)',
        cursor: 'pointer', transition: 'background 0.1s',
        margin: '0 -4px', padding: '13px 4px',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bw-900)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* 카테고리 컬러 도트 */}
      <div style={{ flexShrink: 0, paddingTop: '7px' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: CATEGORY_COLORS[article.ai_category] || 'var(--bw-400)', opacity: 0.9 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 제목 */}
        <div style={{
          fontFamily: 'var(--f-serif)', fontSize: '15px', fontWeight: 600,
          lineHeight: 1.55, color: 'var(--bw-white)', marginBottom: '5px',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {cleanedTitle}
        </div>
        {/* AI 요약 미리보기 - 핵심 내용 첫 줄 */}
        {article.ai_summary && (() => {
          const lines = article.ai_summary.split('\n').filter(l => {
            const t = l.trim()
            return t && !t.startsWith('**') && !t.startsWith('*') && !t.startsWith('•') && !t.includes(' · ') && t.length > 20
          })
          const preview = lines[0] || ''
          return preview ? (
            <div style={{ fontSize:'12px', color:'var(--bw-400)', lineHeight:1.65, marginBottom:'6px', overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
              {preview}
            </div>
          ) : null
        })()}
        {/* 메타 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: '10px', letterSpacing: '0.3px',
            color: CATEGORY_COLORS[article.ai_category] || 'var(--bw-400)',
            background: CATEGORY_BG[article.ai_category] || 'transparent',
            padding: '1px 6px',
            border: `1px solid ${(CATEGORY_COLORS[article.ai_category] || '#6B6B6B')}66`,
            borderRadius: '2px',
          }}>
            {catKo}
          </span>
          {article.ai_version && (
            <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--bw-700)', letterSpacing:'0.05em' }}>
              AI
            </span>
          )}
          {article.source_name && (
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--bw-600)' }}>
              {article.source_name}
            </span>
          )}
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--bw-600)' }}>
            {date}
          </span>
        </div>
      </div>
    </article>
  )
}

function NewsRowSkeleton() {
  return (
    <div style={{ padding: '13px 0', borderBottom: '1px solid var(--line-1)', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--bw-700)', flexShrink: 0, marginTop: '7px' }} />
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
        .select('id,title,slug,ai_category,source_name,published_at,ai_summary,ai_version', { count: 'exact' })
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
      <div style={{ padding: '28px 0 0', borderBottom: '1px solid var(--line-1)' }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--bw-white)', letterSpacing: '3px', marginBottom: '6px' }}>
                STARTUP NEWS
              </div>
              <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px,4vw,28px)', fontWeight: 700, marginBottom: '4px' }}>
                창업 뉴스
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--bw-500)' }}>
                국내외 스타트업·창업 생태계 최신 뉴스 — AI 요약으로 빠르게 읽기
              </p>
            </div>
            <button
              onClick={handleRefresh}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px solid var(--line-1)', color: 'var(--bw-500)', padding: '8px 12px', cursor: 'pointer', fontFamily: 'var(--f-mono)', fontSize: '11px', transition: 'all 0.12s', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--bw-white)'; e.currentTarget.style.color = 'var(--bw-white)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-1)'; e.currentTarget.style.color = 'var(--bw-500)' }}
            >
              <RefreshCw size={12} className={isLoading ? 'spin' : ''} />
              새로고침
            </button>
          </div>

          {/* 검색 */}
          <form onSubmit={handleSearch} style={{ marginBottom: '14px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--line-1)', background: 'var(--bw-900)', transition: 'border-color 0.15s' }}
              onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--bw-white)'}
              onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--line-1)'}
            >
              <Search size={14} color="var(--bw-500)" style={{ marginLeft: '12px', flexShrink: 0 }} />
              <input
                ref={searchRef}
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="뉴스 검색..."
                style={{ flex: 1, padding: '10px 10px', background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: 'var(--bw-white)' }}
              />
              {searchInput && (
                <button type="button" onClick={clearSearch} style={{ background: 'none', border: 'none', padding: '0 10px', cursor: 'pointer', color: 'var(--bw-500)', display: 'flex', alignItems: 'center' }}>
                  <X size={14} />
                </button>
              )}
              <button type="submit" style={{ background: 'var(--bw-white)', border: 'none', color: 'var(--bw-black)', padding: '10px 16px', cursor: 'pointer', fontFamily: 'var(--f-mono)', fontSize: '11px', letterSpacing: '0.5px', fontWeight: 700, flexShrink: 0, transition: 'opacity 0.12s' }}
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
                  background: activeFilter === f.value ? 'rgba(99,102,241,0.15)' : 'var(--bw-900)',
                  color: activeFilter === f.value ? '#a5b4fc' : 'var(--bw-500)',
                  fontWeight: activeFilter === f.value ? 700 : 400,
                  borderBottom: activeFilter === f.value ? '2px solid #6366F1' : '2px solid transparent',
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
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--bw-500)' }}>
          {searchQuery ? `"${searchQuery}" 검색 결과` : activeFilter !== '전체' ? `${activeFilter}` : '전체'} · {total.toLocaleString()}건
        </span>
        {searchQuery && (
          <button onClick={clearSearch} style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--bw-white)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <X size={10} /> 검색 초기화
          </button>
        )}
      </div>

      {/* 뉴스 목록 */}
      <div className="container">
        {articles.length === 0 && !isLoading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--bw-500)' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: '15px', color: 'var(--bw-white)', marginBottom: '6px' }}>
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
          background: linear-gradient(90deg, var(--bw-800) 25%, var(--bw-700) 50%, var(--bw-800) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
          border-radius: 2px;
        }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
      `}</style>
    </div>
  )
}
