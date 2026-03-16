import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { ArticleCard, ArticleHero, ArticleSideItem, ArticleMagItem, ArticleCardSkeleton } from '../components/article/ArticleCard'
import { useArticles, useNewsArticles, useProjects, useTrends, useSubscribeNewsletter } from '../hooks/useData'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

// ── TREND CARD ────────────────────────────────────────────────────
function TrendCard({ snapshot }) {
  if (!snapshot) return null
  const isUp = (snapshot.change_pct || 0) > 0
  const isDown = (snapshot.change_pct || 0) < 0
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus
  const color = isUp ? 'var(--c-green)' : isDown ? 'var(--c-red)' : 'var(--c-muted)'
  const ICONS = { ai_startup: '🤖', edutech: '📱', social: '🌱', youth: '💸' }

  return (
    <div className="card" style={{ padding: '20px 22px', cursor: 'pointer', transition: 'var(--t-fast)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-gray-1)'; e.currentTarget.style.borderColor = 'var(--c-gold)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--c-card)'; e.currentTarget.style.borderColor = 'var(--c-border)' }}
    >
      <div style={{ fontSize: '28px', marginBottom: '10px' }}>{ICONS[snapshot.category] || '📊'}</div>
      <div className="t-caption" style={{ marginBottom: '5px' }}>{snapshot.metric_name}</div>
      <div style={{ fontFamily: 'var(--f-serif)', fontSize: '21px', fontWeight: 700, marginBottom: '5px' }}>
        {snapshot.metric_unit === '억원' ? '₩' : ''}{Number(snapshot.metric_value).toLocaleString()}{snapshot.metric_unit !== '억원' ? snapshot.metric_unit : '억'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--f-mono)', fontSize: '11px', color }}>
        <Icon size={11} />
        {Math.abs(snapshot.change_pct || 0).toFixed(1)}% YoY
      </div>
    </div>
  )
}

// ── STORY CARD ────────────────────────────────────────────────────
function StoryCard({ article, onClick }) {
  const author = article.profiles
  return (
    <div className="card card-clickable" onClick={() => onClick?.(article)}
      style={{ padding: '24px', display: 'flex', gap: '18px', alignItems: 'flex-start' }}
    >
      <div className="avatar avatar-lg" style={{ background: 'var(--c-gold-dim)', color: 'var(--c-gold)', border: '1px solid #f9731630', flexShrink: 0 }}>
        {author?.avatar_url ? <img src={author.avatar_url} alt={author.display_name} /> : (author?.display_name?.[0] || 'A')}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--f-serif)', fontSize: '15px', fontWeight: 700, marginBottom: '2px' }}>
          {author?.display_name}
        </div>
        <div className="t-eyebrow" style={{ marginBottom: '10px', letterSpacing: '1px', fontSize: '9px' }}>
          {author?.startup_name}{article.profiles?.school ? ` · ${article.profiles.school}` : ''}
        </div>
        <div style={{ fontSize: '14px', color: 'var(--c-gray-7)', lineHeight: 1.65, fontStyle: 'italic', fontFamily: 'var(--f-serif)',
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
        }}>
          "{article.excerpt}"
        </div>
      </div>
    </div>
  )
}

// ── PROJECT CARD ──────────────────────────────────────────────────
function ProjectCard({ project, onClick }) {
  const statusLabel = project.status === 'open' ? 'RECRUITING' : project.status === 'coming_soon' ? 'COMING SOON' : 'CLOSED'
  const statusClass = project.status === 'open' ? 'badge-green' : project.status === 'coming_soon' ? 'badge-gold' : 'badge-gray'
  const deadline = project.deadline ? format(new Date(project.deadline), 'M/d', { locale: ko }) : null
  const dDay = project.deadline ? Math.ceil((new Date(project.deadline) - new Date()) / 86400000) : null

  return (
    <div className="card card-clickable" onClick={() => onClick?.(project)} style={{ padding: '22px' }}>
      <div className={`badge ${statusClass}`} style={{ marginBottom: '12px' }}>
        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'currentColor' }} />
        {statusLabel}
      </div>
      <h3 style={{ fontFamily: 'var(--f-serif)', fontSize: '16px', fontWeight: 700, lineHeight: 1.35, marginBottom: '6px' }}>
        {project.title}
      </h3>
      <div style={{ fontSize: '12px', color: 'var(--c-muted)', marginBottom: '10px' }}>
        📍 {project.company_name}{project.location ? ` · ${project.location}` : ''}{project.is_remote ? ' · 원격 가능' : ''}
      </div>
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {(project.tags || []).slice(0, 3).map(t => <span key={t} className="tag">{t}</span>)}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--c-muted)', lineHeight: 1.6, marginBottom: '14px',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
      }}>{project.description}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--c-border)', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)' }}>
        <span>{deadline ? `마감 ${dDay > 0 ? `D-${dDay}` : '마감'} · ${deadline}` : '마감 미정'}</span>
        <span style={{ color: 'var(--c-gold)' }}>지원 {project.applicant_count}명</span>
      </div>
    </div>
  )
}

// ── NEWSLETTER ────────────────────────────────────────────────────
function Newsletter() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const subscribe = useSubscribeNewsletter()

  const handleSubmit = async (e) => {
    e.preventDefault(); setErr('')
    try { await subscribe.mutateAsync(email); setDone(true) }
    catch (e) { setErr(e.message) }
  }

  return (
    <section style={{ background: 'var(--c-gray-1)', padding: '52px var(--pad-x)', border: '1px solid var(--c-border)', textAlign: 'center' }}>
      <div className="t-eyebrow" style={{ marginBottom: '14px' }}>PACM WEEKLY</div>
      <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 700, marginBottom: '10px', lineHeight: 1.3 }}>
        매주 월요일 아침,<br />창업 인사이트를 받아보세요
      </h2>
      <p style={{ color: 'var(--c-muted)', fontSize: '14px', maxWidth: '400px', margin: '0 auto 28px', lineHeight: 1.7 }}>
        구독자들이 매주 받는 뉴스레터 — 트렌드, 인사이트, 기회가 담깁니다.
      </p>
      {done ? (
        <div style={{ color: 'var(--c-green)', fontFamily: 'var(--f-serif)', fontSize: '16px' }}>
          ✓ 구독이 완료되었습니다! 다음 발행일에 인사이트를 보내드릴게요.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="newsletter-form" style={{ display: 'flex', gap: '2px', maxWidth: '420px', margin: '0 auto', flexWrap: 'wrap' }}>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="이메일 주소를 입력하세요" required style={{ flex: '1 1 200px' }} />
          <button type="submit" className="btn btn-ink" disabled={subscribe.isPending} style={{ flexShrink: 0 }}>
            {subscribe.isPending ? '처리 중...' : '무료 구독'}
          </button>
        </form>
      )}
      {err && <div style={{ color: 'var(--c-red)', fontSize: '12px', marginTop: '10px' }}>{err}</div>}
    </section>
  )
}

// ── HOME PAGE ─────────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate()

  const { data: allArticles = [], isLoading: loadingArticles } = useArticles({ limit: 20 })
  const { data: featuredArticles = [] } = useArticles({ featured: true, limit: 4 })
  const { data: projects = [], isLoading: loadingProjects } = useProjects()
  const { data: newsArticles = [] } = useNewsArticles({ limit: 30 })
  const { data: trends = [] } = useTrends()

  const coverArticle   = featuredArticles[0] || allArticles[0]
  const sideArticles   = featuredArticles.slice(1, 4).length ? featuredArticles.slice(1, 4) : allArticles.slice(1, 4)
  const todayInsight   = allArticles.filter(a => a.category === 'insight').slice(0, 3)
  const magazineFeature = allArticles.filter(a => a.category === 'magazine')[0]
  const magazineList   = allArticles.filter(a => a.category === 'magazine').slice(1, 5)
  const storyArticles  = allArticles.filter(a => a.category === 'story').slice(0, 4)
  const openProjects   = projects.filter(p => p.status === 'open').slice(0, 3)

  const openPanel = (article) => navigate(`/article/${article.slug}`)

  const TRENDING = [...new Set(
    (newsArticles || []).flatMap(a => a.tags || []).filter(t => t !== '뉴스')
  )].slice(0, 6)

  return (
    <div style={{ paddingBottom: '72px' }}>

      {/* ── HERO GRID */}
      <section style={{ paddingTop: '36px' }}>
        <div className="hero-grid" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: '2px',
          background: 'var(--c-border)',
          border: '1px solid var(--c-border)',
        }}>
          {/* Lead */}
          {loadingArticles ? (
            <div className="card" style={{ padding: '44px' }}>
              <div className="skeleton skeleton-text" style={{ width: '120px', height: '10px', marginBottom: '16px' }} />
              <div className="skeleton skeleton-text" style={{ height: '32px', marginBottom: '8px' }} />
              <div className="skeleton skeleton-text" style={{ height: '32px', width: '70%', marginBottom: '16px' }} />
              <div className="skeleton skeleton-text" style={{ width: '80%' }} />
              <div className="skeleton skeleton-text" style={{ width: '60%' }} />
            </div>
          ) : coverArticle ? (
            <ArticleHero article={coverArticle} onClick={openPanel} />
          ) : null}

          {/* Sidebar */}
          <div className="hero-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {sideArticles.length > 0 ? sideArticles.map(a => (
              <ArticleSideItem key={a.id} article={a} onClick={openPanel} />
            )) : [0, 1, 2].map(i => (
              <div key={i} className="card" style={{ padding: '20px 22px', flex: 1 }}>
                <div className="skeleton skeleton-text" style={{ width: '60px', height: '10px', marginBottom: '8px' }} />
                <div className="skeleton skeleton-text" style={{ height: '14px' }} />
                <div className="skeleton skeleton-text" style={{ width: '80%' }} />
              </div>
            ))}
          </div>

          {/* Trending bar */}
          {TRENDING.length > 0 && (
            <div className="trending-bar" style={{ gridColumn: '1 / -1', background: 'var(--c-ink)', padding: '14px 40px', display: 'flex', alignItems: 'center', gap: '24px', overflow: 'hidden', borderTop: '1px solid var(--c-border)' }}>
              <div className="t-eyebrow" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>TRENDING</div>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'nowrap', overflow: 'hidden' }}>
                {TRENDING.map((t, i) => (
                  <button key={t} onClick={() => navigate('/news')}
                    style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: 'var(--c-gray-6)', fontSize: '12px', fontFamily: 'var(--f-sans)', transition: 'color 0.15s', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--c-paper)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--c-gray-6)'}
                  >
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)' }}>{String(i + 1).padStart(2, '0')}</span>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── TODAY'S INSIGHT */}
      <section style={{ paddingTop: '52px' }}>
        <div className="section-header">
          <div className="section-title">오늘의 인사이트</div>
          <button className="btn btn-ghost" onClick={() => navigate('/insight')}>전체 보기 <ChevronRight size={13} /></button>
        </div>
        {loadingArticles ? (
          <div className="grid-3 grid-bordered">
            {[0, 1, 2].map(i => <ArticleCardSkeleton key={i} />)}
          </div>
        ) : todayInsight.length > 0 ? (
          <div className="grid-3 grid-bordered">
            {todayInsight.map(a => <ArticleCard key={a.id} article={a} onClick={openPanel} />)}
          </div>
        ) : (
          <div style={{ padding: '44px', textAlign: 'center', color: 'var(--c-muted)', border: '1px dashed var(--c-gray-3)', borderRadius: 'var(--r-sm)' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>📝</div>
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: '15px', color: 'var(--c-paper)', marginBottom: '4px' }}>인사이트 아티클 준비 중</div>
            <div style={{ fontSize: '12px' }}>곧 새로운 창업 인사이트가 공개됩니다</div>
          </div>
        )}
      </section>

      {/* ── MAGAZINE */}
      <section style={{ paddingTop: '52px' }}>
        <div className="section-header">
          <div className="section-title">이번 주 매거진</div>
          <button className="btn btn-ghost" onClick={() => navigate('/story')}>전체 보기 <ChevronRight size={13} /></button>
        </div>
        <div className="magazine-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)' }}>
          {magazineFeature ? (
            <div onClick={() => openPanel(magazineFeature)}
              style={{ background: 'var(--c-ink)', color: 'var(--c-paper)', padding: '44px', cursor: 'pointer', minHeight: '360px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', overflow: 'hidden', transition: 'var(--t-fast)' }}
              onMouseEnter={e => e.currentTarget.style.background = '#181814'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--c-ink)'}
            >
              {magazineFeature.cover_image && (
                <img src={magazineFeature.cover_image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }} />
              )}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <span style={{ background: 'var(--c-gold)', color: 'var(--c-ink)', fontFamily: 'var(--f-mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '2px', padding: '4px 10px', marginBottom: '14px', display: 'inline-block' }}>COVER FEATURE</span>
                <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 700, lineHeight: 1.25, marginBottom: '10px' }}>{magazineFeature.title}</h2>
                <p style={{ color: 'var(--c-gray-7)', fontSize: '13px', lineHeight: 1.65, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{magazineFeature.excerpt}</p>
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--c-gray-1)', minHeight: '360px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--c-muted)' }}>
              <span style={{ fontSize: '32px' }}>📖</span>
              <span style={{ fontFamily: 'var(--f-serif)', fontSize: '15px', color: 'var(--c-paper)' }}>매거진 준비 중</span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {magazineList.length > 0 ? magazineList.map((a, i) => (
              <ArticleMagItem key={a.id} article={a} number={i + 1} onClick={openPanel} />
            )) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--c-muted)', fontSize: '12px', fontFamily: 'var(--f-mono)' }}>준비 중</div>
            )}
          </div>
        </div>
      </section>

      {/* ── TREND TRACKER */}
      <section style={{ paddingTop: '52px' }}>
        <div className="section-header">
          <div className="section-title">창업 트렌드 트래커</div>
          <button className="btn btn-ghost" onClick={() => navigate('/trend')}>자세히 보기 <ChevronRight size={13} /></button>
        </div>
        <div className="grid-4 grid-bordered">
          {trends.length > 0 ? trends.slice(0, 8).map(t => <TrendCard key={t.id} snapshot={t} />) : (
            <div style={{ gridColumn: '1/-1', padding: '44px', textAlign: 'center', color: 'var(--c-muted)' }}>
              <span style={{ fontSize: '28px', display: 'block', marginBottom: '10px' }}>📈</span>
              <span style={{ fontFamily: 'var(--f-serif)', fontSize: '15px', color: 'var(--c-paper)' }}>트렌드 지표 준비 중</span>
            </div>
          )}
        </div>
      </section>

      {/* ── FOUNDER STORIES */}
      <section style={{ paddingTop: '52px' }}>
        <div className="section-header">
          <div className="section-title">창업자 스토리</div>
          <button className="btn btn-ghost" onClick={() => navigate('/story')}>전체 보기 <ChevronRight size={13} /></button>
        </div>
        <div className="grid-2 grid-bordered">
          {storyArticles.length > 0 ? storyArticles.map(a => <StoryCard key={a.id} article={a} onClick={openPanel} />) : (
            <div style={{ background: 'var(--c-card)', padding: '44px', gridColumn: '1/-1', textAlign: 'center', color: 'var(--c-muted)' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>🎙️</div>
              <div>창업자 스토리가 곧 공개됩니다</div>
            </div>
          )}
        </div>
      </section>

      {/* ── CONNECT BANNER */}
      <section style={{ marginTop: '52px' }}>
        <div style={{ background: 'var(--c-gray-1)', padding: '40px var(--pad-x)', border: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 700, marginBottom: '8px' }}>
              기업과 <span style={{ color: 'var(--c-gold)' }}>청소년 창업가</span>를 연결합니다
            </h2>
            <p style={{ color: 'var(--c-muted)', fontSize: '14px', maxWidth: '480px', lineHeight: 1.7 }}>
              실제 프로젝트를 통해 경험을 쌓고, 기업은 신선한 시각의 인재를 만납니다.
            </p>
          </div>
          <div className="connect-btn-group" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-gold" onClick={() => navigate('/connect')}>프로젝트 보기</button>
            <button className="btn btn-outline">기업 파트너 신청</button>
          </div>
        </div>
      </section>

      {/* ── OPEN PROJECTS */}
      {openProjects.length > 0 && (
        <section style={{ paddingTop: '4px' }}>
          <div className="grid-3 grid-bordered">
            {openProjects.map(p => <ProjectCard key={p.id} project={p} onClick={() => navigate('/connect')} />)}
          </div>
        </section>
      )}

      {/* ── NEWSLETTER */}
      <section style={{ paddingTop: '52px' }}>
        <Newsletter />
      </section>

      {/* Responsive */}
      <style>{`
        /* 태블릿 */
        @media (max-width: 900px) {
          section > div[style*="gridTemplateColumns: 1fr 320px"],
          section > div[style*="gridTemplateColumns: 2fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
        /* 모바일 */
        @media (max-width: 768px) {
          section > div[style*="gridTemplateColumns: 1fr 320px"],
          section > div[style*="gridTemplateColumns: 2fr 1fr"],
          section > div[style*="gridTemplateColumns: repeat(3"],
          section > div[style*="gridTemplateColumns: repeat(4"] {
            grid-template-columns: 1fr !important;
          }
          /* 트렌딩 바 패딩 */
          div[style*="padding: '14px 40px'"] {
            padding: 12px 16px !important;
          }
          /* 매거진 featrure 패딩 */
          div[style*="padding: '44px'"] {
            padding: 24px !important;
          }
          /* Connect banner 버튼 */
          div[style*="justifyContent: 'space-between'"] > div {
            width: 100%;
          }
          /* grid-4 트렌드 */
          .grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .grid-4 { grid-template-columns: 1fr !important; }
          /* 뉴스레터 폼 세로 정렬 */
          form[style*="flexWrap: 'wrap'"] {
            flex-direction: column !important;
          }
          form[style*="flexWrap: 'wrap'"] input {
            width: 100% !important;
          }
          form[style*="flexWrap: 'wrap'"] button {
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  )
}
