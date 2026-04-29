import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, ExternalLink, Clock, Calendar, AlertCircle,
  Bookmark, Share2, Eye, ChevronRight, Zap, BookOpen,
  Hash, ArrowUpRight, Check, TrendingUp, Lightbulb,
  ChevronDown, ChevronUp, MessageSquare
} from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useToggleBookmark, useIsBookmarked } from '../hooks/useData'
import { useAuthStore } from '../store'

/* ─── ACCENT COLOR MAP ───────────────────────────────────────────── */
const CAT_COLOR = {
  funding: '#F59E0B', investment: '#F59E0B',
  ai: '#818cf8', ai_startup: '#818cf8', tech: '#818cf8',
  edutech: '#38bdf8',
  youth: '#34d399', policy: '#a78bfa',
  entrepreneurship: '#60A5FA', startup: '#60A5FA',
  unicorn: '#fb7185',
  climate: '#86efac', esg: '#86efac',
  health: '#67e8f9',
  fintech: '#fb923c',
  general: '#9CA3AF',
}
const CAT_KO = {
  funding: '투자·펀딩', investment: '투자·펀딩',
  ai: 'AI·기술', ai_startup: 'AI·기술', tech: 'AI·기술',
  edutech: '에듀테크', youth: '청소년창업',
  policy: '정책·지원', entrepreneurship: '창업',
  startup: '창업', unicorn: '유니콘',
  climate: '기후테크', esg: 'ESG',
  health: '헬스케어', fintech: '핀테크', general: '뉴스',
}

/* ─── BOLD TEXT PARSER ───────────────────────────────────────────── */
function parseBold(text, k) {
  if (!text) return text
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  if (parts.length === 1) return text
  return parts.map((p, idx) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return (
        <strong key={`b-${k}-${idx}`} style={{ color: 'var(--t1)', fontWeight: 700 }}>
          {p.slice(2, -2)}
        </strong>
      )
    return p
  })
}

/* ─── LONGBLACK RENDERER v3 ──────────────────────────────────────── */
function LongBlackRenderer({ text, accent }) {
  if (!text) return null

  const lines    = text.split('\n')
  const elements = []
  let key          = 0
  let bulletBuffer = []
  let quoteBuffer  = []

  const flushBullets = () => {
    if (!bulletBuffer.length) return
    elements.push(
      <ul key={key++} style={{
        margin: '0 0 28px', paddingLeft: 0,
        listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {bulletBuffer.map((item, bi) => (
          <li key={bi} style={{
            display: 'flex', gap: 14, alignItems: 'flex-start',
            padding: '12px 16px',
            background: `${accent}08`,
            border: `1px solid ${accent}20`,
            borderLeft: `3px solid ${accent}`,
            borderRadius: 8,
          }}>
            <span style={{
              color: accent, flexShrink: 0, fontWeight: 900,
              fontSize: 13, marginTop: 3, lineHeight: 1.7,
            }}>→</span>
            <span style={{
              fontSize: 15.5, lineHeight: 1.88,
              color: 'var(--t1)', fontFamily: 'var(--f-sans)',
            }}>
              {parseBold(item, bi)}
            </span>
          </li>
        ))}
      </ul>
    )
    bulletBuffer = []
  }

  const flushQuotes = () => {
    if (!quoteBuffer.length) return
    const combined = quoteBuffer.join(' ')
    elements.push(
      <blockquote key={key++} style={{
        margin: '0 0 28px',
        padding: '18px 22px 18px 30px',
        background: `${accent}07`,
        border: `1px solid ${accent}22`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: '0 10px 10px 0',
        position: 'relative',
      }}>
        <span style={{
          position: 'absolute', top: 6, left: 8,
          fontSize: 36, color: `${accent}25`,
          fontFamily: 'Georgia, serif', lineHeight: 1,
          userSelect: 'none',
        }}>"</span>
        <p style={{
          fontSize: 15.5, lineHeight: 1.92,
          color: 'var(--t2)', fontStyle: 'italic',
          margin: 0, fontFamily: 'var(--f-sans)',
        }}>
          {parseBold(combined, key)}
        </p>
      </blockquote>
    )
    quoteBuffer = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.trim()

    if (!t) {
      flushBullets(); flushQuotes(); continue
    }

    // ── 구분선 ──
    if (t === '---' || t === '───────────────') {
      flushBullets(); flushQuotes()
      elements.push(
        <div key={key++} style={{
          display: 'flex', alignItems: 'center', gap: 16,
          margin: '44px 0 36px',
        }}>
          <div style={{
            flex: 1, height: 1,
            background: `linear-gradient(to right, ${accent}40, transparent)`,
          }} />
          <div style={{ display: 'flex', gap: 5 }}>
            {[1, 0.6, 0.3].map((op, i) => (
              <div key={i} style={{
                width: 4, height: 4, borderRadius: '50%',
                background: `${accent}`, opacity: op,
              }} />
            ))}
          </div>
          <div style={{
            flex: 1, height: 1,
            background: `linear-gradient(to left, ${accent}40, transparent)`,
          }} />
        </div>
      )
      continue
    }

    // ── 인용구 (>) ──
    if (t.startsWith('> ')) {
      flushBullets()
      quoteBuffer.push(t.slice(2))
      continue
    }
    flushQuotes()

    // ── 불릿 ──
    if (
      t.startsWith('• ') || t.startsWith('- ') ||
      t.startsWith('→ ') || t.startsWith('▶ ')
    ) {
      bulletBuffer.push(t.slice(2))
      continue
    }
    flushBullets()

    // ── H2 섹션 헤딩 (## 시작) ──
    if (t.startsWith('## ')) {
      const raw   = t.slice(3)
      const emoji = raw.match(/^[^\s\u0041-\u007A\uAC00-\uD7A3]+/)?.[0] || ''
      const label = raw.replace(/^[^\s\u0041-\u007A\uAC00-\uD7A3]+\s*/, '')
      elements.push(
        <div key={key++} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          margin: '40px 0 20px',
          paddingBottom: 14,
          borderBottom: `2px solid ${accent}22`,
        }}>
          {emoji && (
            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
          )}
          <h2 style={{
            fontFamily: 'var(--f-display)',
            fontSize: 'clamp(16px, 3vw, 21px)',
            fontWeight: 800, color: 'var(--t1)',
            margin: 0, letterSpacing: '-0.02em', lineHeight: 1.3,
          }}>{label}</h2>
        </div>
      )
      continue
    }

    // ── H3 (### 시작) ──
    if (t.startsWith('### ')) {
      elements.push(
        <h3 key={key++} style={{
          fontFamily: 'var(--f-mono)', fontSize: 11,
          fontWeight: 700, color: accent,
          margin: '26px 0 10px', letterSpacing: '1.5px',
          textTransform: 'uppercase',
        }}>{t.slice(4)}</h3>
      )
      continue
    }

    // ── Bold only line = 소제목 강조 블록 ──
    if (t.startsWith('**') && t.endsWith('**') && !t.slice(2, -2).includes('**') && t.length > 4) {
      const content = t.slice(2, -2)
      elements.push(
        <div key={key++} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          margin: '30px 0 14px',
          paddingLeft: 12,
          borderLeft: `3px solid ${accent}`,
        }}>
          <p style={{
            fontSize: 17, fontWeight: 800, color: 'var(--t1)',
            margin: 0, fontFamily: 'var(--f-display)',
            letterSpacing: '-0.01em', lineHeight: 1.4,
          }}>{content}</p>
        </div>
      )
      continue
    }

    // ── 이탤릭 (메타/안내) ──
    if (t.startsWith('*') && t.endsWith('*') && !t.startsWith('**')) {
      const c = t.slice(1, -1)
      if (c.startsWith('Insightship') || c.includes(' · ')) {
        elements.push(
          <div key={key++} style={{
            fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)',
            marginTop: 8, letterSpacing: '0.5px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Zap size={9} color={accent} />{c}
          </div>
        )
      } else {
        elements.push(
          <p key={key++} style={{
            fontSize: 14.5, lineHeight: 1.9, color: 'var(--t3)',
            fontStyle: 'italic', margin: '0 0 18px',
            padding: '12px 16px',
            background: 'var(--bg2)', borderRadius: 8,
            border: '1px solid var(--b1)',
            fontFamily: 'var(--f-sans)',
          }}>{parseBold(c, key)}</p>
        )
      }
      continue
    }

    // ── 일반 단락 ──
    elements.push(
      <p key={key++} style={{
        fontSize: 17,
        lineHeight: 2.08,
        color: 'var(--t1)',
        margin: '0 0 24px',
        fontFamily: 'var(--f-sans)',
        letterSpacing: '0.01em',
        wordBreak: 'keep-all',
        wordSpacing: '0.02em',
      }}>{parseBold(t, key)}</p>
    )
  }

  flushBullets()
  flushQuotes()

  return <div style={{ fontFamily: 'var(--f-sans)' }}>{elements}</div>
}

/* ─── CHAPTER DETECTION ──────────────────────────────────────────── */
function detectChapters(text) {
  if (!text) return []
  const lines    = text.split('\n')
  const chapters = []
  let current    = { title: '도입', lines: [], emoji: '📖' }

  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('## ')) {
      if (current.lines.length > 0) chapters.push(current)
      const raw   = t.slice(3)
      const emoji = raw.match(/^[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}]/u)?.[0] || '•'
      const title = raw
        .replace(/^[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}]+\s*/u, '')
        .replace(/[:\s]+$/, '').trim()
      current = { title: title || '섹션', lines: [line], emoji }
    } else {
      current.lines.push(line)
    }
  }
  if (current.lines.length > 0) chapters.push(current)
  return chapters.filter(c => c.lines.some(l => l.trim()))
}

/* ─── DATA HOOK ──────────────────────────────────────────────────── */
function useNewsArticle(slug) {
  return useQuery({
    queryKey: ['news-detail', slug],
    queryFn: async () => {
      if (!slug) throw new Error('slug 없음')
      const { data, error } = await supabase
        .from('articles').select('*').eq('slug', slug).maybeSingle()
      if (error) throw error
      if (!data) throw new Error('기사를 찾을 수 없습니다')
      try { await supabase.rpc('increment_view', { article_id: data.id }) } catch {}
      return data
    },
    enabled: !!slug,
    retry: 1,
  })
}

/* ─── BOOKMARK BUTTON ────────────────────────────────────────────── */
function NewsBookmarkBtn({ articleId, accent }) {
  const { data: saved = false } = useIsBookmarked(articleId)
  const toggle = useToggleBookmark()
  const { user } = useAuthStore()

  return (
    <button
      aria-label={saved ? '북마크 해제' : '북마크 저장'}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px',
        background: saved ? `${accent}15` : 'var(--bg3)',
        border: `1px solid ${saved ? accent : 'var(--b1)'}`,
        borderRadius: 8,
        color: saved ? accent : 'var(--t3)',
        fontSize: 13, cursor: 'pointer',
        fontFamily: 'var(--f-sans)',
        transition: 'all 0.15s',
        fontWeight: saved ? 700 : 400,
      }}
      onClick={() => {
        if (!user) {
          if (window.confirm('로그인 후 북마크를 사용할 수 있습니다.\n로그인 페이지로 이동할까요?'))
            window.location.href = '/login'
          return
        }
        toggle.mutate({ articleId, isBookmarked: saved })
      }}
      disabled={toggle.isPending}>
      <Bookmark size={14} fill={saved ? 'currentColor' : 'none'} />
      {saved ? '저장됨' : '저장하기'}
    </button>
  )
}

/* ─── READING PROGRESS BAR ───────────────────────────────────────── */
function ReadingProgress({ accent }) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement
      const s  = el.scrollTop
      const h  = el.scrollHeight - el.clientHeight
      setProgress(h > 0 ? Math.min(100, (s / h) * 100) : 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      height: 3, zIndex: 9999, background: 'var(--bg3)',
    }}>
      <div style={{
        height: '100%',
        background: `linear-gradient(90deg, ${accent}, ${accent}aa)`,
        width: `${progress}%`,
        transition: 'width .1s linear',
        boxShadow: `0 0 8px ${accent}60`,
      }} />
    </div>
  )
}

/* ─── TABLE OF CONTENTS ──────────────────────────────────────────── */
function ChapterToc({ chapters, accent }) {
  const [open, setOpen] = useState(true)
  if (!chapters || chapters.length <= 1) return null

  return (
    <nav
      aria-label="목차"
      style={{
        marginBottom: 36,
        background: 'var(--bg2)',
        border: `1px solid ${accent}20`,
        borderRadius: 12,
        overflow: 'hidden',
      }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          background: `${accent}08`,
          border: 'none', cursor: 'pointer',
          borderBottom: open ? `1px solid ${accent}15` : 'none',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookOpen size={14} color={accent} />
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 11,
            color: accent, letterSpacing: '1.5px', fontWeight: 700,
          }}>
            이 글의 목차
          </span>
        </div>
        {open
          ? <ChevronUp size={14} color="var(--t4)" />
          : <ChevronDown size={14} color="var(--t4)" />}
      </button>
      {open && (
        <div style={{ padding: '12px 18px 16px' }}>
          {chapters.map((ch, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 4px',
              borderBottom: i < chapters.length - 1 ? '1px solid var(--b0)' : 'none',
            }}>
              <span style={{
                fontFamily: 'var(--f-mono)', fontSize: 10,
                color: accent, minWidth: 24, fontWeight: 700,
                letterSpacing: '0.5px',
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{
                fontSize: 13, color: 'var(--t2)',
                fontFamily: 'var(--f-sans)', lineHeight: 1.4,
              }}>
                {ch.emoji && ch.emoji !== '📖' && (
                  <span style={{ marginRight: 5 }}>{ch.emoji}</span>
                )}
                {ch.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </nav>
  )
}

/* ─── SHARE BUTTON ───────────────────────────────────────────────── */
function ShareButton({ accent }) {
  const [state, setState] = useState('idle')

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url: window.location.href })
        setState('copied')
      } else {
        await navigator.clipboard.writeText(window.location.href)
        setState('copied')
      }
      setTimeout(() => setState('idle'), 2500)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2000)
    }
  }

  return (
    <button
      onClick={handleShare}
      aria-label="공유하기"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px',
        background: state === 'copied' ? `${accent}15` : 'var(--bg3)',
        border: `1px solid ${state === 'copied' ? accent : 'var(--b1)'}`,
        borderRadius: 8,
        color: state === 'copied' ? accent : 'var(--t3)',
        fontSize: 13, cursor: 'pointer',
        fontFamily: 'var(--f-sans)',
        transition: 'all 0.15s',
      }}>
      {state === 'copied' ? <Check size={14} /> : <Share2 size={14} />}
      {state === 'copied' ? '복사됨!' : state === 'error' ? '오류' : '공유하기'}
    </button>
  )
}

/* ─── FLOATING ACTION BAR ────────────────────────────────────────── */
function FloatingBar({ article, accent, progress }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 350)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!visible) return null

  return (
    <div
      role="toolbar"
      aria-label="읽기 도구"
      style={{
        position: 'fixed', bottom: 24, left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        background: 'var(--bg1)',
        border: '1px solid var(--b2)',
        borderRadius: 100,
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(12px)',
        animation: 'slideUp 0.25s ease',
      }}>
      {/* 진행률 */}
      <div style={{
        fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <div style={{
          width: 36, height: 3, borderRadius: 2,
          background: 'var(--bg3)', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: accent, transition: 'width 0.1s',
          }} />
        </div>
        <span>{Math.round(progress)}%</span>
      </div>
      <div style={{ width: 1, height: 16, background: 'var(--b1)' }} />
      <ShareButton accent={accent} />
      <NewsBookmarkBtn articleId={article?.id} accent={accent} />
    </div>
  )
}

/* ─── RELATED ARTICLES ───────────────────────────────────────────── */
function RelatedSuggestion({ currentSlug, accent }) {
  const [articles, setArticles] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    const fetchRelated = async () => {
      const { data } = await supabase
        .from('articles')
        .select('id,title,slug,ai_category,published_at,read_time,ai_summary')
        .eq('status', 'published')
        .neq('slug', currentSlug)
        .limit(4)
        .order('published_at', { ascending: false })
      if (data) setArticles(data)
    }
    fetchRelated()
  }, [currentSlug])

  if (!articles.length) return null

  return (
    <section aria-label="더 읽어보기" style={{
      marginTop: 48, paddingTop: 32,
      borderTop: '1px solid var(--b1)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
      }}>
        <TrendingUp size={15} color={accent} />
        <span style={{
          fontFamily: 'var(--f-mono)', fontSize: 11,
          color: accent, letterSpacing: '1.5px', fontWeight: 700,
        }}>
          더 읽어보기
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {articles.map(a => {
          const aAccent = CAT_COLOR[a.ai_category] || '#60A5FA'
          const hasLongform = a.ai_summary && a.ai_summary.length > 400
          return (
            <div
              key={a.id}
              onClick={() => navigate(`/news/${a.slug}`)}
              role="link"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navigate(`/news/${a.slug}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                background: 'var(--bg2)',
                border: '1px solid var(--b1)',
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = `${aAccent}40`
                e.currentTarget.style.background = 'var(--bg3)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--b1)'
                e.currentTarget.style.background = 'var(--bg2)'
              }}
            >
              <div style={{
                width: 4, height: 40, borderRadius: 2,
                background: aAccent, flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: 'var(--t1)',
                  lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {a.title}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
                }}>
                  {a.read_time && (
                    <span style={{
                      fontFamily: 'var(--f-mono)', fontSize: 10,
                      color: 'var(--t4)', display: 'flex', alignItems: 'center', gap: 2,
                    }}>
                      <Clock size={9} /> {a.read_time}분
                    </span>
                  )}
                  {hasLongform && (
                    <span style={{
                      fontFamily: 'var(--f-mono)', fontSize: 9,
                      padding: '1px 6px', borderRadius: 3,
                      background: 'rgba(168,85,247,0.1)',
                      border: '1px solid rgba(168,85,247,0.2)',
                      color: '#A855F7', fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: 2,
                    }}>
                      <Zap size={7} /> AI
                    </span>
                  )}
                </div>
              </div>
              <ArrowUpRight size={14} color="var(--t4)" style={{ flexShrink: 0 }} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ─── AI LONGFORM BADGE ──────────────────────────────────────────── */
function InsightNote({ accent }) {
  return (
    <div style={{
      display: 'flex', gap: 14, alignItems: 'flex-start',
      padding: '16px 20px',
      background: `${accent}06`,
      border: `1px solid ${accent}20`,
      borderRadius: 10,
      marginBottom: 28,
    }}>
      <Lightbulb size={16} color={accent} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <div style={{
          fontFamily: 'var(--f-mono)', fontSize: 9,
          color: accent, letterSpacing: '1.5px', marginBottom: 5, fontWeight: 700,
        }}>
          INSIGHTSHIP AI LONGFORM v10
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.72, color: 'var(--t3)', margin: 0 }}>
          이 콘텐츠는 원문 기사를 바탕으로{' '}
          <strong style={{ color: 'var(--t2)' }}>Insightship 자체 AI 엔진(v10)</strong>이
          청소년 눈높이에 맞춰 배경·시장·인사이트를 추가해 재구성한 롱폼입니다.
          원문과 다른 해석·배경 정보가 포함될 수 있으며, 사실 확인은 원문을 참고하세요.
        </p>
      </div>
    </div>
  )
}

/* ─── MAIN PAGE ──────────────────────────────────────────────────── */
export default function NewsDetailPage() {
  const { slug }   = useParams()
  const navigate   = useNavigate()
  const [progress, setProgress] = useState(0)
  const { data: article, isLoading, isError } = useNewsArticle(slug)

  // 스크롤 진행률
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement
      const s  = el.scrollTop
      const h  = el.scrollHeight - el.clientHeight
      setProgress(h > 0 ? Math.min(100, (s / h) * 100) : 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* ── Loading ── */
  if (isLoading) return (
    <div style={{
      minHeight: '70vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 36, height: 36,
          border: '3px solid var(--bg3)',
          borderTopColor: '#60A5FA',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <span style={{
          fontFamily: 'var(--f-mono)', color: 'var(--t4)', fontSize: 12,
        }}>불러오는 중...</span>
      </div>
    </div>
  )

  /* ── Error ── */
  if (isError || !article) return (
    <div style={{
      minHeight: '70vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16,
      padding: '40px 20px', textAlign: 'center',
    }}>
      <AlertCircle size={44} color="var(--t4)" />
      <div style={{
        fontFamily: 'var(--f-display)', fontSize: 20,
        color: 'var(--t1)', fontWeight: 700,
      }}>
        기사를 찾을 수 없습니다
      </div>
      <p style={{ fontSize: 14, color: 'var(--t3)' }}>
        삭제됐거나 주소가 잘못됐을 수 있습니다.
      </p>
      <button
        onClick={() => navigate('/news')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '10px 20px',
          background: 'var(--bg3)', border: '1px solid var(--b2)',
          borderRadius: 8, color: 'var(--t1)', cursor: 'pointer', fontSize: 14,
        }}>
        <ArrowLeft size={14} /> 뉴스 목록으로
      </button>
    </div>
  )

  /* ── Data prep ── */
  const accent      = CAT_COLOR[article.ai_category] || '#60A5FA'
  const catKo       = CAT_KO[article.ai_category] || '뉴스'
  const hasLongform = article.ai_summary && article.ai_summary.length >= 400

  const mainContent = hasLongform
    ? article.ai_summary
    : (article.body || article.excerpt || '')
        .replace(/\n?원문 보기:.*$/m, '')
        .replace(/ⓒ.*?재배포\s*금지/g, '')
        .replace(/저작권자.*?금지/g, '')
        .replace(/무단\s*전재.*?금지/g, '')
        .replace(/\[사진\]|\[영상\]|\[표\]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim()

  const readMin    = Math.max(3, Math.round(mainContent.length / 280))
  const chapters   = detectChapters(mainContent)
  const hasChapters = chapters.length > 2

  const date = article.published_at
    ? format(new Date(article.published_at), 'yyyy년 M월 d일', { locale: ko })
    : ''

  return (
    <>
      <ReadingProgress accent={accent} />
      <FloatingBar article={article} accent={accent} progress={progress} />

      <Helmet>
        <title>
          {article.title ? `${article.title.slice(0, 55)} | Insightship` : '뉴스 | Insightship'}
        </title>
        <meta
          name="description"
          content={article.excerpt || article.ai_summary?.slice(0, 120) || '청소년 창업 뉴스'}
        />
        <meta property="og:title" content={article.title || 'Insightship 뉴스'} />
        <meta property="og:description" content={article.excerpt?.slice(0, 120) || ''} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`https://www.insightship.pacm.kr/news/${slug}`} />
        {article.cover_image && (
          <meta property="og:image" content={article.cover_image} />
        )}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={article.title || 'Insightship 뉴스'} />
        <link rel="canonical" href={`https://www.insightship.pacm.kr/news/${slug}`} />
      </Helmet>

      <div style={{ paddingBottom: 100 }}>

        {/* ── BREADCRUMB ─────────────────────────────────── */}
        <nav
          aria-label="이동 경로"
          style={{
            borderBottom: '1px solid var(--b1)',
            padding: '12px 0',
            background: 'var(--bg1)',
          }}>
          <div className="container">
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'var(--f-mono)', fontSize: 11,
            }}>
              <button
                onClick={() => navigate('/news')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'none', border: 'none',
                  color: 'var(--t3)', fontSize: 12,
                  cursor: 'pointer', transition: 'color 0.12s',
                  fontFamily: 'var(--f-mono)', padding: 0,
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--t1)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}>
                <ArrowLeft size={13} /> 뉴스
              </button>
              <ChevronRight size={10} color="var(--t4)" />
              <span style={{
                color: 'var(--t4)', maxWidth: 280,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {article.title?.slice(0, 36)}{article.title?.length > 36 ? '…' : ''}
              </span>
            </div>
          </div>
        </nav>

        {/* ── ARTICLE BODY ───────────────────────────────── */}
        <main>
          <div className="container" style={{
            maxWidth: 'min(740px, 100%)',
            margin: '0 auto',
            padding: '44px var(--pad-x) 0',
          }}>

            {/* 카테고리 배지 & 태그 */}
            <div style={{
              display: 'flex', gap: 6, marginBottom: 18,
              flexWrap: 'wrap', alignItems: 'center',
            }}>
              {article.ai_category && (
                <span style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10, color: accent,
                  background: `${accent}15`, border: `1px solid ${accent}30`,
                  padding: '4px 10px', borderRadius: 4, letterSpacing: '1px',
                  textTransform: 'uppercase', fontWeight: 700,
                }}>
                  {catKo}
                </span>
              )}
              {article.tags
                ?.filter(t => t !== '뉴스' && t !== article.ai_category)
                .slice(0, 4)
                .map(tag => (
                  <span key={tag} style={{
                    fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)',
                    background: 'var(--bg3)', border: '1px solid var(--b1)',
                    padding: '3px 8px', borderRadius: 4,
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    <Hash size={8} />{tag}
                  </span>
                ))
              }
            </div>

            {/* 제목 */}
            <h1 style={{
              fontFamily: 'var(--f-display)',
              fontSize: 'clamp(22px, 4vw, 34px)',
              fontWeight: 800, lineHeight: 1.35,
              marginBottom: 24, color: 'var(--t1)',
              letterSpacing: '-0.025em', wordBreak: 'keep-all',
            }}>
              {article.title}
            </h1>

            {/* 메타 정보 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              marginBottom: 28, paddingBottom: 22,
              borderBottom: `1px solid var(--b1)`,
              flexWrap: 'wrap',
            }}>
              {article.source_name && (
                <span style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10, color: accent,
                  background: `${accent}12`, border: `1px solid ${accent}25`,
                  padding: '3px 10px', borderRadius: 4, fontWeight: 700,
                }}>
                  {article.source_name}
                </span>
              )}
              {date && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--t3)',
                }}>
                  <Calendar size={11} /> {date}
                </span>
              )}
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--t3)',
              }}>
                <Clock size={11} /> {readMin}분 읽기
              </span>
              {article.view_count > 0 && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--t4)',
                }}>
                  <Eye size={11} /> {article.view_count.toLocaleString()}
                </span>
              )}
              {hasLongform && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontFamily: 'var(--f-mono)', fontSize: 9,
                  padding: '3px 9px', borderRadius: 4,
                  background: 'rgba(168,85,247,0.12)',
                  border: '1px solid rgba(168,85,247,0.3)',
                  color: '#A855F7', fontWeight: 700,
                }}>
                  <Zap size={9} /> AI 심층분석
                </span>
              )}
            </div>

            {/* 커버 이미지 */}
            {article.cover_image && (
              <div style={{
                marginBottom: 36, overflow: 'hidden',
                borderRadius: 14, border: '1px solid var(--b1)',
              }}>
                <img
                  src={article.cover_image}
                  alt={article.title}
                  style={{
                    width: '100%', maxHeight: 460,
                    objectFit: 'cover', display: 'block',
                  }}
                  onError={e => e.target.parentElement.style.display = 'none'}
                />
              </div>
            )}

            {/* 발췌문 (커버 없을 때) */}
            {!article.cover_image && article.excerpt && article.excerpt.length > 30 && (
              <div style={{
                padding: '18px 22px',
                background: `${accent}08`,
                border: `1px solid ${accent}20`,
                borderLeft: `4px solid ${accent}`,
                borderRadius: '0 10px 10px 0',
                marginBottom: 32,
                fontSize: 16, lineHeight: 1.9,
                color: 'var(--t2)', fontStyle: 'italic',
                fontFamily: 'var(--f-sans)',
              }}>
                {article.excerpt}
              </div>
            )}

            {/* AI 롱폼 안내 배지 */}
            {hasLongform && <InsightNote accent={accent} />}

            {/* 목차 */}
            {hasLongform && hasChapters && (
              <ChapterToc chapters={chapters} accent={accent} />
            )}

            {/* 본문 */}
            <article style={{ marginBottom: 52 }}>
              {hasLongform ? (
                <LongBlackRenderer text={mainContent} accent={accent} />
              ) : (
                <div>
                  {mainContent
                    .split('\n')
                    .filter(p => p.trim() && p.length > 10)
                    .slice(0, 30)
                    .map((para, i) => (
                      <p key={i} style={{
                        fontSize: 17, lineHeight: 2.05,
                        color: 'var(--t1)', marginBottom: 22,
                        fontFamily: 'var(--f-sans)', wordBreak: 'keep-all',
                      }}>
                        {para}
                      </p>
                    ))
                  }
                  {!mainContent && (
                    <div style={{
                      padding: '40px 20px', textAlign: 'center', color: 'var(--t3)',
                    }}>
                      <BookOpen size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
                      <p>본문 내용은 원문에서 확인해 주세요.</p>
                    </div>
                  )}
                </div>
              )}
            </article>

            {/* 출처 카드 */}
            {article.source_url?.startsWith('http') && (
              <div style={{
                padding: '22px 26px',
                background: 'var(--bg2)',
                border: `1px solid ${accent}20`,
                borderRadius: 14,
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 16,
                flexWrap: 'wrap', marginBottom: 16,
              }}>
                <div>
                  <div style={{
                    fontFamily: 'var(--f-mono)', fontSize: 10,
                    color: accent, letterSpacing: '2px',
                    marginBottom: 6, fontWeight: 700,
                  }}>
                    원문 출처
                  </div>
                  <div style={{ fontSize: 15, color: 'var(--t1)', fontWeight: 700 }}>
                    {article.source_name || '원문 기사'}
                  </div>
                  <div style={{
                    fontFamily: 'var(--f-mono)', fontSize: 11,
                    color: 'var(--t4)', marginTop: 4,
                  }}>
                    원문에서 전체 내용을 확인하세요
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <ShareButton accent={accent} />
                  <NewsBookmarkBtn articleId={article?.id} accent={accent} />
                  <a
                    href={article.source_url}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px',
                      background: accent,
                      border: 'none', borderRadius: 8,
                      color: '#000', fontSize: 13, fontWeight: 700,
                      textDecoration: 'none', cursor: 'pointer',
                      transition: 'opacity 0.15s',
                      fontFamily: 'var(--f-sans)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                    원문 읽기 <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            )}

            {/* 관련 아티클 */}
            <RelatedSuggestion currentSlug={slug} accent={accent} />

            {/* 하단 내비 */}
            <div style={{
              paddingTop: 32, marginTop: 8,
              borderTop: '1px solid var(--b1)',
              display: 'flex', gap: 10, flexWrap: 'wrap',
            }}>
              <button
                onClick={() => navigate('/news')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 16px',
                  background: 'var(--bg3)', border: '1px solid var(--b1)',
                  borderRadius: 8, color: 'var(--t2)', fontSize: 13,
                  cursor: 'pointer', fontFamily: 'var(--f-sans)',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--b2)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--b1)'}>
                <ArrowLeft size={13} /> 뉴스 목록
              </button>
              <button
                onClick={() => navigate('/insight')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 16px',
                  background: 'var(--bg3)', border: '1px solid var(--b1)',
                  borderRadius: 8, color: 'var(--t2)', fontSize: 13,
                  cursor: 'pointer', fontFamily: 'var(--f-sans)',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--b2)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--b1)'}>
                <BookOpen size={13} /> 인사이트 보기 <ArrowUpRight size={12} />
              </button>
            </div>

          </div>
        </main>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg) }
          to   { transform: rotate(360deg) }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(12px) }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) }
        }
        @media(max-width: 640px) {
          .container {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }
        }
      `}</style>
    </>
  )
}
