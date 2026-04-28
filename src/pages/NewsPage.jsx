import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search, X } from 'lucide-react'
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

function cleanTitle(title) {
  if (!title) return title
  return title.replace(/^\[[^\]]{1,20}\]\s*/g, '').trim()
}

function NewsRow({ article }) {
  const navigate = useNavigate()
  const date = article.published_at ? format(new Date(article.published_at), 'M월 d일', { locale: ko }) : ''
  const catKo = CATEGORY_KO[article.ai_category] || '뉴스'
  const cleanedTitle = cleanTitle(article.title)
  const accent = CATEGORY_COLORS[article.ai_category] || 'var(--t4)'

  return (
    <article
      onClick={() => navigate(`/article/${article.slug}`)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '13px 4px', borderBottom: '1px solid var(--b0)',
        cursor: 'pointer', transition: 'background 0.1s',
        margin: '0 -4px', borderRadius: 4,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ flexShrink: 0, paddingTop: 7 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent, opacity: 0.85 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--f-sans)', fontSize: 14.5, fontWeight: 600,
          lineHeight: 1.55, color: 'var(--t1)', marginBottom: 5,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {cleanedTitle}
        </div>
        {article.ai_summary && (() => {
          const lines = article.ai_summary.split('\n').filter(l => {
            const t = l.trim()
            return t && !t.startsWith('**') && !t.startsWith('*') && !t.startsWith('•') && !t.includes(' · ') && t.length > 20
          })
          const preview = lines[0] || ''
          return preview ? (
            <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.65, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {preview}
            </div>
          ) : null
        })()}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.3px',
            color: accent, background: CATEGORY_BG[article.ai_category] || 'transparent',
            padding: '1px 6px', border: `1px solid ${accent}55`, borderRadius: 3,
          }}>
            {catKo}
          </span>
          {article.ai_version && (
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)', letterSpacing: '0.05em' }}>AI</span>
          )}
          {article.source_name && (
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)' }}>{article.source_name}</span>
          )}
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)' }}>{date}</span>
        </div>
      </div>
    </article>
  )
}

function NewsRowSkeleton() {
  return (
    <div style={{ padding: '13px 0', borderBottom: '1px solid var(--b0)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--bg5)', flexShrink: 0, marginTop: 7 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton" style={{ height: 16, width: '85%', marginBottom: 8, borderRadius: 3 }} />
        <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 8, borderRadius: 3 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="skeleton" style={{ height: 12, width: 60, borderRadius: 3 }} />
          <div className="skeleton" style={{ height: 12, width: 40, borderRadius: 3 }} />
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

      if (filter !== '전체' && FILTER_TO_CAT[filter]) q = q.in('ai_category', FILTER_TO_CAT[filter])
      if (search.trim()) q = q.ilike('title', `%${search.trim()}%`)

      const { data, count, error } = await q
      if (error) throw error

      const newData = data || []
      if (reset) {
        const seen = new Set()
        setArticles(newData.filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true }))
      } else {
        setArticles(prev => {
          const seen = new Set(prev.map(a => a.title))
          return [...prev, ...newData.filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true })]
        })
      }
      if (pageNum === 0) setTotal(count || 0)
      setHasMore(newData.length === PAGE_SIZE)
    } catch (e) { console.error(e) }
    finally { setIsLoading(false) }
  }, [isLoading])

  useEffect(() => {
    setPage(0); setArticles([])
    fetchNews(0, activeFilter, searchQuery, true)
  }, [activeFilter, searchQuery])

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !isLoading) {
        const next = page + 1; setPage(next)
        fetchNews(next, activeFilter, searchQuery, false)
      }
    }, { threshold: 0.1 })
    if (loaderRef.current) obs.observe(loaderRef.current)
    return () => obs.disconnect()
  }, [hasMore, isLoading, page, activeFilter, searchQuery])

  const handleSearch = e => { e.preventDefault(); setSearchQuery(searchInput) }
  const clearSearch = () => { setSearchInput(''); setSearchQuery(''); searchRef.current?.focus() }
  const handleRefresh = () => { setPage(0); setArticles([]); fetchNews(0, activeFilter, searchQuery, true) }

  return (
    <div style={{ paddingBottom: 100 }}>

      {/* ── 헤더 */}
      <div style={{ padding: '28px 0 0', borderBottom: '1px solid var(--b1)' }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#60A5FA', letterSpacing: '3px', marginBottom: 6, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', display: 'inline-block', padding: '3px 10px', borderRadius: 3 }}>
                STARTUP NEWS
              </div>
              <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(20px,4vw,28px)', fontWeight: 700, marginBottom: 4, color: 'var(--t1)', marginTop: 10 }}>
                창업 뉴스
              </h1>
              <p style={{ fontSize: 13, color: 'var(--t2)' }}>
                국내외 스타트업·창업 생태계 최신 뉴스 — AI 요약으로 빠르게 읽기
              </p>
            </div>
            <button
              onClick={handleRefresh}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--b2)', color: 'var(--t3)', padding: '8px 12px', cursor: 'pointer', fontFamily: 'var(--f-mono)', fontSize: 11, transition: 'all 0.12s', flexShrink: 0, borderRadius: 6 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--b3)'; e.currentTarget.style.color = 'var(--t1)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--b2)'; e.currentTarget.style.color = 'var(--t3)' }}
            >
              <RefreshCw size={12} className={isLoading ? 'spin' : ''} />
              새로고침
            </button>
          </div>

          {/* ── 검색 */}
          <form onSubmit={handleSearch} style={{ marginBottom: 12 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--b1)', background: 'var(--bg2)', borderRadius: 8, transition: 'border-color 0.15s', overflow: 'hidden' }}
              onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--b3)'}
              onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--b1)'}
            >
              <Search size={14} color="var(--t3)" style={{ marginLeft: 12, flexShrink: 0 }} />
              <input
                ref={searchRef}
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="뉴스 검색..."
                style={{ flex: 1, padding: '10px 10px', background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--t1)' }}
              />
              {searchInput && (
                <button type="button" onClick={clearSearch} style={{ background: 'none', border: 'none', padding: '0 10px', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center' }}>
                  <X size={14} />
                </button>
              )}
              <button
                type="submit"
                style={{ background: 'var(--t1)', border: 'none', color: 'var(--bg0)', padding: '10px 16px', cursor: 'pointer', fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.5px', fontWeight: 700, flexShrink: 0, transition: 'opacity 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                검색
              </button>
            </div>
          </form>

          {/* ── 필터 탭 */}
          <div className="news-filter-wrap" style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setActiveFilter(f.value)}
                style={{
                  padding: '8px 14px', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.3px',
                  whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.12s',
                  background: activeFilter === f.value ? 'rgba(59,130,246,0.12)' : 'transparent',
                  color: activeFilter === f.value ? '#60A5FA' : 'var(--t3)',
                  fontWeight: activeFilter === f.value ? 700 : 400,
                  borderBottom: activeFilter === f.value ? '2px solid #3B82F6' : '2px solid transparent',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 카운트 + 검색 상태 */}
      <div className="container" style={{ paddingTop: 14, paddingBottom: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--t3)' }}>
          {searchQuery ? `"${searchQuery}" 검색 결과` : activeFilter !== '전체' ? activeFilter : '전체'} · {total.toLocaleString()}건
        </span>
        {searchQuery && (
          <button onClick={clearSearch} style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            <X size={10} /> 검색 초기화
          </button>
        )}
      </div>

      {/* ── 뉴스 목록 */}
      <div className="container">
        {articles.length === 0 && !isLoading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--t3)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 15, color: 'var(--t1)', marginBottom: 6 }}>
              {searchQuery ? '검색 결과가 없습니다' : '뉴스가 없습니다'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--t3)' }}>
              {searchQuery ? '다른 키워드로 검색해 보세요' : '잠시 후 다시 시도해 주세요'}
            </div>
          </div>
        ) : (
          <>
            {articles.map((a, i) => <NewsRow key={a.id} article={a} index={i} />)}
            {isLoading && Array.from({ length: 8 }).map((_, i) => <NewsRowSkeleton key={i} />)}
          </>
        )}
        <div ref={loaderRef} style={{ height: 40 }} />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .spin { animation: spin 0.8s linear infinite }
        .news-filter-wrap::-webkit-scrollbar { display: none }
      `}</style>
    </div>
  )
}
