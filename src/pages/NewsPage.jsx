import { useState, useCallback, useRef, useEffect } from 'react'
import { ExternalLink, RefreshCw, Search } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { supabase } from '../lib/supabase'

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
const PAGE_SIZE = 60

function NewsRow({ article }) {
  const date = article.published_at
    ? format(new Date(article.published_at), 'M월 d일', { locale: ko })
    : ''
  const catColor = CATEGORY_COLORS[article.ai_category] || '#9ca3af'
  const catKo = CATEGORY_KO[article.ai_category] || '뉴스'
  const targetUrl = article.source_url?.startsWith('http') ? article.source_url : null

  return (
    <article
      onClick={() => { if (targetUrl) window.open(targetUrl, '_blank', 'noopener,noreferrer') }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '14px',
        padding: '14px 0', borderBottom: '1px solid var(--c-border)',
        cursor: targetUrl ? 'pointer' : 'default', transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (targetUrl) e.currentTarget.style.background = 'var(--c-gray-1)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ flexShrink: 0, paddingTop: '6px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: catColor }} />
      </div>
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
      {targetUrl && (
        <div style={{ flexShrink: 0, paddingTop: '5px' }}>
          <ExternalLink size={13} color="var(--c-gray-5)" />
        </div>
      )}
    </article>
  )
}

export default function NewsPage() {
  const [activeFilter, setActiveFilter] = useState('전체')
  const [searchQuery, setSearchQuery] = useState('')
  const [articles, setArticles] = useState([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const loaderRef = useRef(null)

  const fetchNews = useCallback(async (pageNum, filter, search, reset = false) => {
    setIsLoading(true)
    try {
      let q = supabase
        .from('articles')
        .select('id,title,slug,published_at,source_name,source_url,ai_category', { count: 'exact' })
        .eq('status', 'published')
        .not('source_name', 'is', null)
        .order('published_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

      // 카테고리 필터
      if (filter === '투자/펀딩') q = q.eq('ai_category', 'funding')
      else if (filter === 'AI') q = q.in('ai_category', ['ai', 'ai_startup'])
      else if (filter === '창업') q = q.in('ai_category', ['entrepreneurship', 'general'])
      else if (filter === '청소년창업') q = q.eq('ai_category', 'youth')
      else if (filter === '에듀테크') q = q.eq('ai_category', 'edutech')
      else if (filter === '헬스케어') q = q.eq('ai_category', 'health')
      else if (filter === '핀테크') q = q.eq('ai_category', 'fintech')

      // 검색
      if (search.trim()) q = q.ilike('title', `%${search.trim()}%`)

      const { data, error, count } = await q
      if (error) throw error

      const newItems = data || []
      if (reset) {
        setArticles(newItems)
      } else {
        setArticles(prev => [...prev, ...newItems])
      }
      setTotal(count || 0)
      setHasMore(newItems.length === PAGE_SIZE)
    } catch (e) {
      console.error('뉴스 로드 오류:', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 필터/검색 변경 시 초기화
  useEffect(() => {
    setPage(0)
    setHasMore(true)
    fetchNews(0, activeFilter, searchQuery, true)
  }, [activeFilter, fetchNews]) // searchQuery는 debounce 후 처리

  // 검색어 debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0)
      setHasMore(true)
      fetchNews(0, activeFilter, searchQuery, true)
    }, 400)
    return () => clearTimeout(t)
  }, [searchQuery]) // eslint-disable-line

  // 무한 스크롤 - Intersection Observer
  useEffect(() => {
    if (!loaderRef.current) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          const nextPage = page + 1
          setPage(nextPage)
          fetchNews(nextPage, activeFilter, searchQuery, false)
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    )
    observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [hasMore, isLoading, page, activeFilter, searchQuery, fetchNews])

  return (
    <div style={{ paddingBottom: '80px' }}>
      {/* 헤더 */}
      <div style={{ borderBottom: '1px solid var(--c-border)', padding: '40px 0 28px' }}>
        <div className="container">
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '3px', marginBottom: '10px' }}>
            STARTUP NEWS
          </div>
          <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,36px)', fontWeight: 700, marginBottom: '10px' }}>
            창업 뉴스
          </h1>
          <p style={{ color: 'var(--c-muted)', fontSize: '14px' }}>
            국내외 스타트업·창업 생태계 최신 뉴스 — 헤드라인 클릭 시 원본 기사로 이동합니다
          </p>
        </div>
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
            onClick={() => { setPage(0); setHasMore(true); fetchNews(0, activeFilter, searchQuery, true) }}
            disabled={isLoading}
            style={{ padding: '8px 14px', background: 'none', border: '1px solid var(--c-border)', color: 'var(--c-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontFamily: 'var(--f-mono)' }}
          >
            <RefreshCw size={12} style={{ animation: isLoading ? 'spin 0.8s linear infinite' : 'none' }} />
            새로고침
          </button>
        </div>

        {/* 카테고리 필터 */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
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

        {/* 뉴스 수 */}
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)', marginBottom: '8px' }}>
          {total > 0 ? `총 ${total.toLocaleString()}개 뉴스` : ''}
        </div>

        {/* 뉴스 목록 */}
        {articles.length === 0 && !isLoading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--c-muted)', fontFamily: 'var(--f-mono)', fontSize: '13px' }}>
            뉴스가 없습니다
          </div>
        ) : (
          <div>
            {articles.map(article => (
              <NewsRow key={article.id} article={article} />
            ))}
          </div>
        )}

        {/* 무한 스크롤 트리거 */}
        <div ref={loaderRef} style={{ padding: '20px 0', textAlign: 'center' }}>
          {isLoading && (
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)' }}>
              불러오는 중...
            </div>
          )}
          {!hasMore && articles.length > 0 && (
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)' }}>
              모든 뉴스를 불러왔습니다
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
