import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  RefreshCw, Search, X, Zap, Clock, Eye,
  ArrowUpRight, TrendingUp, Hash, Calendar,
  BookOpen, Flame
} from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { supabase } from '../lib/supabase'

/* ─── CONSTANTS ──────────────────────────────────────────────────── */
const CATEGORY_COLORS = {
  funding: '#F59E0B', investment: '#F59E0B',
  ai: '#818cf8', ai_startup: '#818cf8', tech: '#818cf8',
  edutech: '#38bdf8',
  youth: '#34d399', policy: '#a78bfa',
  entrepreneurship: '#60A5FA', startup: '#60A5FA', general: '#9CA3AF',
  unicorn: '#fb7185', climate: '#86efac', esg: '#86efac',
  health: '#67e8f9', fintech: '#fb923c',
}
const CATEGORY_KO = {
  funding: '투자·펀딩', investment: '투자·펀딩',
  ai: 'AI·기술', ai_startup: 'AI·기술', tech: 'AI·기술',
  edutech: '에듀테크', youth: '청소년창업',
  entrepreneurship: '창업', startup: '창업', general: '뉴스',
  unicorn: '유니콘', climate: '기후테크', esg: 'ESG',
  health: '헬스케어', fintech: '핀테크', policy: '정책·지원',
}
const FILTERS = [
  { label: '전체', value: '전체' },
  { label: '투자·펀딩', value: '투자/펀딩' },
  { label: 'AI·기술', value: 'AI/기술' },
  { label: '창업', value: '창업' },
  { label: '청소년창업', value: '청소년창업' },
  { label: '에듀테크', value: '에듀테크' },
  { label: '헬스케어', value: '헬스케어' },
  { label: '핀테크', value: '핀테크' },
  { label: '기후테크', value: '기후테크' },
  { label: '정책·지원', value: '정책/지원' },
]
const FILTER_TO_CAT = {
  '투자/펀딩':  ['funding', 'unicorn', 'investment'],
  'AI/기술':    ['ai', 'ai_startup', 'tech'],
  '창업':       ['entrepreneurship', 'general', 'startup'],
  '청소년창업': ['youth'],
  '에듀테크':   ['edutech'],
  '헬스케어':   ['health'],
  '핀테크':     ['fintech'],
  '기후테크':   ['climate', 'esg'],
  '정책/지원':  ['policy'],
}
const PAGE_SIZE = 30

/* ─── HELPERS ────────────────────────────────────────────────────── */
function cleanTitle(t) {
  return (t || '').replace(/^\[[^\]]{1,20}\]\s*/g, '').trim()
}

function extractPreview(ai_summary) {
  if (!ai_summary) return ''
  const lines = ai_summary.split('\n').map(l => l.trim())
  for (const line of lines) {
    if (!line) continue
    if (line.startsWith('##') || line.startsWith('#')) continue
    if (line.startsWith('---')) continue
    if (line.startsWith('*') && line.endsWith('*')) continue
    if (line.startsWith('> ')) return line.slice(2).replace(/\*\*/g, '').slice(0, 120)
    if (line.startsWith('• ') || line.startsWith('- ')) continue
    if (line.length < 25) continue
    return line.replace(/\*\*/g, '').slice(0, 120)
  }
  return ''
}

/* ─── FEATURED CARD (Top story) ─────────────────────────────────── */
function FeaturedCard({ article }) {
  const navigate = useNavigate()
  const [hov, setHov] = useState(false)
  const accent = CATEGORY_COLORS[article.ai_category] || '#60A5FA'
  const catKo  = CATEGORY_KO[article.ai_category] || '뉴스'
  const preview = extractPreview(article.ai_summary)
  const hasLongform = article.ai_summary && article.ai_summary.length > 400

  return (
    <article
      onClick={() => navigate(`/news/${article.slug}`)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        marginBottom: 8,
        cursor: 'pointer',
        background: hov ? 'var(--bg2)' : 'var(--bg1)',
        border: `1px solid ${hov ? `${accent}35` : 'var(--b1)'}`,
        borderRadius: 16,
        overflow: 'hidden',
        transition: 'all 0.2s',
        display: 'grid',
        gridTemplateColumns: article.cover_image ? '1fr 1fr' : '1fr',
        boxShadow: hov ? `0 8px 32px ${accent}18` : 'none',
      }}
    >
      {/* 이미지 */}
      {article.cover_image && (
        <div style={{ position: 'relative', overflow: 'hidden', minHeight: 240 }}>
          <img
            src={article.cover_image}
            alt={article.title}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transition: 'transform 0.5s',
              transform: hov ? 'scale(1.04)' : 'scale(1)',
            }}
            onError={e => e.target.parentElement.style.display = 'none'}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to right, transparent 55%, rgba(0,0,0,0.8))',
          }} />
        </div>
      )}

      {/* 텍스트 */}
      <div style={{
        padding: '28px 30px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 9, color: accent,
            background: `${accent}15`, border: `1px solid ${accent}30`,
            padding: '3px 9px', borderRadius: 4, letterSpacing: '1px',
            textTransform: 'uppercase', fontWeight: 700,
          }}>{catKo}</span>
          {hasLongform && (
            <span style={{
              fontFamily: 'var(--f-mono)', fontSize: 9,
              padding: '3px 8px', borderRadius: 4,
              background: 'rgba(168,85,247,0.12)',
              border: '1px solid rgba(168,85,247,0.25)',
              color: '#A855F7', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <Zap size={8} /> AI 심층분석
            </span>
          )}
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--f-mono)', fontSize: 9,
            padding: '2px 7px', borderRadius: 4,
            background: 'rgba(251,215,0,0.1)',
            border: '1px solid rgba(251,215,0,0.3)',
            color: '#EAB308', fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <Flame size={8} /> 최신
          </span>
        </div>

        <h2 style={{
          fontFamily: 'var(--f-display)',
          fontSize: 'clamp(17px, 2.5vw, 24px)',
          fontWeight: 800, color: 'var(--t1)',
          lineHeight: 1.4, margin: 0,
          letterSpacing: '-0.02em', wordBreak: 'keep-all',
        }}>
          {cleanTitle(article.title)}
        </h2>

        {preview && (
          <p style={{
            fontSize: 13.5, color: 'var(--t3)', lineHeight: 1.8,
            margin: 0, fontStyle: 'italic',
            display: '-webkit-box', WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {preview}…
          </p>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          flexWrap: 'wrap', marginTop: 4,
        }}>
          {article.source_name && (
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)' }}>
              {article.source_name}
            </span>
          )}
          {article.published_at && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)',
            }}>
              <Calendar size={9} />
              {format(new Date(article.published_at), 'M월 d일', { locale: ko })}
            </span>
          )}
          {article.read_time && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)',
            }}>
              <Clock size={9} /> {article.read_time}분
            </span>
          )}
          <span style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
            color: hov ? accent : 'var(--t4)',
            fontSize: 12, fontWeight: 700, transition: 'color 0.15s',
          }}>
            읽기 <ArrowUpRight size={13} />
          </span>
        </div>
      </div>
    </article>
  )
}

/* ─── NEWS CARD ──────────────────────────────────────────────────── */
function NewsCard({ article }) {
  const navigate = useNavigate()
  const [hov, setHov] = useState(false)
  const accent   = CATEGORY_COLORS[article.ai_category] || '#9CA3AF'
  const catKo    = CATEGORY_KO[article.ai_category] || '뉴스'
  const preview  = extractPreview(article.ai_summary)
  const date     = article.published_at
    ? format(new Date(article.published_at), 'M월 d일', { locale: ko }) : ''
  const hasLongform = article.ai_summary && article.ai_summary.length > 400

  return (
    <article
      onClick={() => navigate(`/news/${article.slug}`)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', gap: 0,
        background: hov ? 'var(--bg2)' : 'var(--bg1)',
        border: `1px solid ${hov ? `${accent}25` : 'var(--b1)'}`,
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.15s',
        overflow: 'hidden',
      }}
    >
      {/* 왼쪽 액센트 바 */}
      <div style={{
        width: 3,
        background: hov ? accent : 'transparent',
        transition: 'background 0.15s', flexShrink: 0,
      }} />

      {/* 썸네일 (있으면) */}
      {article.cover_image && (
        <div style={{ width: 100, flexShrink: 0, overflow: 'hidden' }}>
          <img
            src={article.cover_image}
            alt=""
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transition: 'transform 0.4s',
              transform: hov ? 'scale(1.06)' : 'scale(1)',
            }}
            onError={e => e.target.parentElement.style.display = 'none'}
          />
        </div>
      )}

      {/* 본문 */}
      <div style={{ flex: 1, padding: '13px 15px', minWidth: 0 }}>
        {/* 배지 row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 6, flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 9, color: accent,
            background: `${accent}15`, border: `1px solid ${accent}25`,
            padding: '2px 7px', borderRadius: 3,
            letterSpacing: '0.5px', fontWeight: 700,
          }}>{catKo}</span>
          {hasLongform && (
            <span style={{
              fontFamily: 'var(--f-mono)', fontSize: 9,
              padding: '2px 6px', borderRadius: 3,
              background: 'rgba(168,85,247,0.1)',
              border: '1px solid rgba(168,85,247,0.2)',
              color: '#A855F7', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 2,
            }}>
              <Zap size={7} /> 심층
            </span>
          )}
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)',
          }}>{date}</span>
        </div>

        {/* 제목 */}
        <h3 style={{
          fontSize: 14.5, fontWeight: 700,
          color: 'var(--t1)', lineHeight: 1.5,
          margin: '0 0 5px',
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
          wordBreak: 'keep-all',
        }}>
          {cleanTitle(article.title)}
        </h3>

        {/* 미리보기 */}
        {preview && (
          <p style={{
            fontSize: 12.5, color: 'var(--t3)', lineHeight: 1.65,
            margin: '0 0 7px',
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {preview}
          </p>
        )}

        {/* 하단 메타 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {article.source_name && (
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)' }}>
              {article.source_name}
            </span>
          )}
          {article.read_time && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 2,
              fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)',
            }}>
              <Clock size={9} /> {article.read_time}분
            </span>
          )}
          {article.view_count > 0 && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 2,
              fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)',
            }}>
              <Eye size={9} /> {article.view_count.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

/* ─── SKELETON ───────────────────────────────────────────────────── */
function SkCard() {
  return (
    <div style={{
      background: 'var(--bg1)', border: '1px solid var(--b1)',
      borderRadius: 12, overflow: 'hidden', display: 'flex', gap: 0,
    }}>
      <div style={{ width: 3, background: 'var(--bg3)' }} />
      <div style={{ flex: 1, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div className="sk" style={{ height: 14, width: 60, borderRadius: 3 }} />
          <div className="sk" style={{ height: 14, width: 40, borderRadius: 3, marginLeft: 'auto' }} />
        </div>
        <div className="sk" style={{ height: 18, width: '90%', borderRadius: 4 }} />
        <div className="sk" style={{ height: 14, width: '70%', borderRadius: 4 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="sk" style={{ height: 11, width: 50, borderRadius: 3 }} />
          <div className="sk" style={{ height: 11, width: 40, borderRadius: 3 }} />
        </div>
      </div>
    </div>
  )
}

/* ─── MAIN PAGE ──────────────────────────────────────────────────── */
export default function NewsPage() {
  const location = useLocation()
  const initQ = new URLSearchParams(location.search).get('q') || ''
  const [activeFilter, setActiveFilter] = useState('전체')
  const [searchQuery,  setSearchQuery]  = useState(initQ)
  const [searchInput,  setSearchInput]  = useState(initQ)
  const [articles,     setArticles]     = useState([])
  const [page,         setPage]         = useState(0)
  const [hasMore,      setHasMore]      = useState(true)
  const [isLoading,    setIsLoading]    = useState(false)
  const [total,        setTotal]        = useState(0)
  const loaderRef  = useRef(null)
  const searchRef  = useRef(null)
  const debounceRef = useRef(null)

  // isLoadingRef: useCallback 내부에서 stale closure 없이 최신 isLoading 참조
  const isLoadingRef = useRef(false)

  const fetchNews = useCallback(async (pageNum, filter, search, reset = false) => {
    // isLoadingRef 로 중복 호출 방지 (isLoading state를 deps에서 제거 → 루프 해소)
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    setIsLoading(true)
    try {
      let q = supabase
        .from('articles')
        .select(
          'id,title,slug,ai_category,source_name,published_at,cover_image,read_time,view_count',
          { count: 'exact' }
        )
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
      const dedup = arr => {
        const seen = new Set()
        return arr.filter(a => {
          if (seen.has(a.id)) return false
          seen.add(a.id); return true
        })
      }

      if (reset) {
        setArticles(dedup(newData))
      } else {
        setArticles(prev => dedup([...prev, ...newData]))
      }
      if (pageNum === 0) setTotal(count || 0)
      setHasMore(newData.length === PAGE_SIZE)
    } catch (e) {
      console.error(e)
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
    }
  }, [])  // deps 비움 — isLoading 제거로 stale closure 루프 해소

  // 필터·검색 변경 시 리셋
  useEffect(() => {
    setPage(0); setArticles([])
    fetchNews(0, activeFilter, searchQuery, true)
  }, [activeFilter, searchQuery, fetchNews])

  // 무한 스크롤
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !isLoadingRef.current) {
        setPage(prev => {
          const next = prev + 1
          fetchNews(next, activeFilter, searchQuery, false)
          return next
        })
      }
    }, { threshold: 0.1 })
    if (loaderRef.current) obs.observe(loaderRef.current)
    return () => obs.disconnect()
  }, [hasMore, activeFilter, searchQuery, fetchNews])

  // 검색 입력 변경 → 디바운스 300ms
  const handleInputChange = e => {
    const val = e.target.value
    setSearchInput(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearchQuery(val)
    }, 300)
  }

  const handleSearch   = e => { e.preventDefault(); clearTimeout(debounceRef.current); setSearchQuery(searchInput) }
  const clearSearch    = () => {
    clearTimeout(debounceRef.current)
    setSearchInput(''); setSearchQuery('')
    searchRef.current?.focus()
  }
  const handleRefresh  = () => {
    setPage(0); setArticles([])
    fetchNews(0, activeFilter, searchQuery, true)
  }

  const featuredArticle = articles[0]
  const restArticles    = articles.slice(1)

  return (
    <div style={{ paddingBottom: 100 }}>
      <Helmet>
        <title>창업 뉴스 | Insightship — 스타트업·AI 최신 뉴스</title>
        <meta name="description" content="국내외 스타트업·AI·핀테크·에듀테크 최신 뉴스를 AI 심층분석으로 읽어보세요. 청소년 창업가를 위한 뉴스 큐레이션." />
        <meta property="og:title" content="창업 뉴스 | Insightship" />
        <meta property="og:description" content="스타트업·AI·핀테크 최신 뉴스 — AI 심층분석으로 깊이 읽기" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.insightship.pacm.kr/news" />
        <meta name="twitter:card" content="summary" />
        <link rel="canonical" href="https://www.insightship.pacm.kr/news" />
      </Helmet>

      {/* ── 헤더 ──────────────────────────────────────────── */}
      <div style={{ padding: '28px 0 0', borderBottom: '1px solid var(--b1)' }}>
        <div className="container">

          {/* 타이틀 row */}
          <div style={{
            display: 'flex', alignItems: 'flex-end',
            justifyContent: 'space-between', gap: 12,
            marginBottom: 18, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{
                fontFamily: 'var(--f-mono)', fontSize: 9, color: '#60A5FA',
                letterSpacing: '3px', marginBottom: 8,
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.2)',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 4,
              }}>
                <TrendingUp size={9} /> STARTUP NEWS
              </div>
              <h1 style={{
                fontFamily: 'var(--f-display)',
                fontSize: 'clamp(20px, 4vw, 28px)',
                fontWeight: 800, margin: '0 0 4px',
                color: 'var(--t1)', letterSpacing: '-0.02em',
              }}>
                창업 뉴스
              </h1>
              <p style={{ fontSize: 13, color: 'var(--t3)', margin: 0 }}>
                국내외 스타트업·AI·창업 생태계 최신 소식 — AI 심층분석과 함께 읽기
              </p>
            </div>
            <button
              onClick={handleRefresh}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: '1px solid var(--b2)',
                color: 'var(--t3)', padding: '8px 14px', cursor: 'pointer',
                fontFamily: 'var(--f-mono)', fontSize: 11, borderRadius: 8,
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--b3)'
                e.currentTarget.style.color = 'var(--t1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--b2)'
                e.currentTarget.style.color = 'var(--t3)'
              }}>
              <RefreshCw size={12} className={isLoading ? 'spin' : ''} />
              새로고침
            </button>
          </div>

          {/* 검색 */}
          <form onSubmit={handleSearch} style={{ marginBottom: 14 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center',
                border: '1px solid var(--b1)', background: 'var(--bg2)',
                borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.15s',
              }}
              onFocusCapture={e => e.currentTarget.style.borderColor = '#60A5FA50'}
              onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--b1)'}
            >
              <Search size={14} color="var(--t3)" style={{ marginLeft: 14, flexShrink: 0 }} />
              <input
                ref={searchRef}
                value={searchInput}
                onChange={handleInputChange}
                placeholder="뉴스 제목 검색..."
                style={{
                  flex: 1, padding: '11px 10px',
                  background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 14, color: 'var(--t1)',
                }}
              />
              {searchInput && (
                <button
                  type="button" onClick={clearSearch}
                  style={{
                    background: 'none', border: 'none', padding: '0 10px',
                    cursor: 'pointer', color: 'var(--t3)',
                    display: 'flex', alignItems: 'center',
                  }}>
                  <X size={14} />
                </button>
              )}
              <button
                type="submit"
                style={{
                  background: '#3B82F6', border: 'none', color: '#fff',
                  padding: '11px 18px', cursor: 'pointer',
                  fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 700,
                  flexShrink: 0, transition: 'opacity 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                검색
              </button>
            </div>
          </form>

          {/* 필터 탭 */}
          <div style={{
            display: 'flex', gap: 2, overflowX: 'auto',
            scrollbarWidth: 'none', paddingBottom: 1,
          }}>
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setActiveFilter(f.value)}
                style={{
                  padding: '9px 14px', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.3px',
                  whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.12s',
                  background: activeFilter === f.value ? 'rgba(59,130,246,0.1)' : 'transparent',
                  color: activeFilter === f.value ? '#60A5FA' : 'var(--t3)',
                  fontWeight: activeFilter === f.value ? 700 : 400,
                  borderBottom: activeFilter === f.value ? '2px solid #3B82F6' : '2px solid transparent',
                  borderRadius: '4px 4px 0 0',
                }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 카운트 ── */}
      <div className="container" style={{
        paddingTop: 14, paddingBottom: 6,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--t4)' }}>
          {searchQuery
            ? `"${searchQuery}" 검색 결과`
            : activeFilter !== '전체' ? activeFilter : '전체 뉴스'
          } · {' '}
          <strong style={{ color: 'var(--t3)' }}>{total.toLocaleString()}</strong>건
        </span>
        {searchQuery && (
          <button
            onClick={clearSearch}
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)',
              background: 'none', border: '1px solid var(--b1)', cursor: 'pointer',
              padding: '2px 8px', borderRadius: 4,
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
            <X size={9} /> 초기화
          </button>
        )}
      </div>

      {/* ── 뉴스 목록 ── */}
      <div className="container">
        {articles.length === 0 && !isLoading ? (
          <div style={{ padding: '70px 0', textAlign: 'center', color: 'var(--t3)' }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🔍</div>
            <div style={{
              fontFamily: 'var(--f-display)', fontSize: 16,
              color: 'var(--t1)', marginBottom: 8, fontWeight: 700,
            }}>
              {searchQuery ? '검색 결과가 없습니다' : '뉴스가 없습니다'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--t3)' }}>
              {searchQuery ? '다른 키워드로 검색해 보세요' : '잠시 후 다시 시도해 주세요'}
            </div>
          </div>
        ) : (
          <>
            {/* 첫 번째 = 피처드 카드 */}
            {featuredArticle && <FeaturedCard article={featuredArticle} />}

            {/* 나머지 = 카드 그리드 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
              gap: 8, marginTop: 8,
            }}>
              {restArticles.map(a => <NewsCard key={a.id} article={a} />)}
              {isLoading && Array.from({ length: 6 }).map((_, i) => <SkCard key={`sk-${i}`} />)}
            </div>
          </>
        )}
        <div ref={loaderRef} style={{ height: 48 }} />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .spin { animation: spin 0.8s linear infinite }
        @keyframes skPulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        .sk { background: var(--bg3); animation: skPulse 1.6s ease-in-out infinite; }
        div[style*="overflow-x: auto"]::-webkit-scrollbar { display: none }
        @media(max-width: 640px) {
          article[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
          .container { padding-left: 16px !important; padding-right: 16px !important; }
        }
      `}</style>
    </div>
  )
}
