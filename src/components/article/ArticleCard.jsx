import { useNavigate } from 'react-router-dom'
import { Eye, Heart, Bookmark, Clock, ArrowRight, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

const CAT_COLOR = {
  insight: '#3B82F6', trend: '#F59E0B', opinion: '#A855F7',
  magazine: '#06B6D4', story: '#10B981', news: '#60A5FA',
  ai: '#A855F7', funding: '#F59E0B', ai_startup: '#3B82F6',
  edutech: '#F97316', youth: '#10B981', entrepreneurship: '#06B6D4',
  unicorn: '#F59E0B', climate: '#10B981', health: '#F43F5E',
  fintech: '#6366F1', general: '#A1A1AA',
}
const CAT_KO = {
  insight: '인사이트', trend: '트렌드', opinion: '오피니언',
  magazine: '매거진', story: '스토리', news: '뉴스',
  ai: 'AI', funding: '투자', ai_startup: 'AI스타트업',
  edutech: '에듀테크', youth: '청소년창업', entrepreneurship: '창업',
  unicorn: '유니콘', climate: '기후테크', health: '헬스케어',
  fintech: '핀테크', general: '뉴스',
}

function catColor(cat) { return CAT_COLOR[cat] || '#3B82F6' }
function catLabel(cat) { return CAT_KO[cat] || cat || '아티클' }

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const diff = (Date.now() - d) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`
  try { return format(d, 'M월 d일', { locale: ko }) } catch { return '' }
}

// ── ARTICLE CARD (grid 3col)
export function ArticleCard({ article: a, onClick }) {
  const navigate = useNavigate()
  const go = () => onClick ? onClick(a) : navigate(`/article/${a.slug}`)
  const color = catColor(a.category || a.ai_category)

  return (
    <div
      onClick={go}
      className="card card-clickable"
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', cursor: 'pointer' }}
    >
      {/* Cover image */}
      {a.cover_image && (
        <div style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden', background: 'var(--bg3)' }}>
          <img
            src={a.cover_image}
            alt={a.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .4s ease', display: 'block' }}
            onMouseEnter={e => e.target.style.transform = 'scale(1.03)'}
            onMouseLeave={e => e.target.style.transform = 'scale(1)'}
            onError={e => { e.target.closest('div').style.display = 'none' }}
          />
        </div>
      )}
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {/* Category + time */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.08em',
            textTransform: 'uppercase', color: color,
            background: `${color}18`, border: `1px solid ${color}28`,
            padding: '2px 7px', borderRadius: 3,
          }}>
            {catLabel(a.category || a.ai_category)}
          </span>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={9} />{timeAgo(a.published_at || a.created_at)}
          </span>
        </div>

        {/* Title */}
        <h3 style={{
          fontFamily: 'var(--f-display)', fontSize: 14.5, fontWeight: 700,
          color: 'var(--t1)', lineHeight: 1.42, letterSpacing: '-0.01em',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {a.title}
        </h3>

        {/* Summary */}
        {a.summary && (
          <p style={{
            fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.65,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {a.summary}
          </p>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--b0)' }}>
          {a.source_name && (
            <span style={{ fontSize: 11, color: 'var(--t3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.source_name}
            </span>
          )}
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexShrink: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)' }}>
              <Eye size={10} />{(a.view_count || 0).toLocaleString()}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)' }}>
              <Heart size={10} />{a.like_count || 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ARTICLE HERO (main featured)
export function ArticleHero({ article: a, onClick }) {
  const navigate = useNavigate()
  const go = () => onClick ? onClick(a) : navigate(`/article/${a.slug}`)
  const color = catColor(a?.category || a?.ai_category)

  if (!a) return null

  return (
    <div
      onClick={go}
      style={{
        position: 'relative', cursor: 'pointer', overflow: 'hidden',
        minHeight: 360,
        background: a.cover_image
          ? 'var(--bg2)'
          : `linear-gradient(135deg, #050d1f 0%, #0a1628 100%)`,
      }}
    >
      {/* BG image */}
      {a.cover_image && (
        <>
          <img
            src={a.cover_image} alt={a.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: .45 }}
            onError={e => e.target.style.display = 'none'}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(5,5,5,.96) 0%, rgba(5,5,5,.5) 60%, transparent 100%)' }} />
        </>
      )}

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2, padding: '32px 28px 28px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        {/* Badge */}
        <div style={{ marginBottom: 14 }}>
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.12em',
            textTransform: 'uppercase', color: color,
            background: `${color}20`, border: `1px solid ${color}35`,
            padding: '3px 9px', borderRadius: 3,
          }}>
            FEATURED · {catLabel(a.category || a.ai_category)}
          </span>
        </div>

        {/* Title */}
        <h2 style={{
          fontFamily: 'var(--f-display)', fontSize: 'clamp(20px,2.8vw,28px)', fontWeight: 800,
          color: '#fff', lineHeight: 1.25, letterSpacing: '-0.02em', marginBottom: 12,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {a.title}
        </h2>

        {/* Summary */}
        {a.summary && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.65)', lineHeight: 1.65, marginBottom: 18,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {a.summary}
          </p>
        )}

        {/* Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {a.source_name && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'rgba(255,255,255,.45)' }}>{a.source_name}</span>}
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'rgba(255,255,255,.45)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={9} />{timeAgo(a.published_at || a.created_at)}
          </span>
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'rgba(255,255,255,.4)' }}>
              <Eye size={10} />{(a.view_count || 0).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Read more */}
        <div style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 5, color: color, fontSize: 12.5, fontWeight: 600 }}>
          자세히 읽기 <ArrowRight size={13} />
        </div>
      </div>
    </div>
  )
}

// ── ARTICLE SIDE ITEM (vertical list)
export function ArticleSideItem({ article: a, onClick }) {
  const navigate = useNavigate()
  const go = () => onClick ? onClick(a) : navigate(`/article/${a.slug}`)
  const color = catColor(a?.category || a?.ai_category)

  return (
    <div
      onClick={go}
      style={{
        display: 'flex', gap: 12, padding: '14px 16px',
        cursor: 'pointer', flex: 1,
        background: 'var(--bg2)', transition: 'background .12s',
        borderBottom: '1px solid var(--b0)',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}
    >
      {/* Thumb */}
      {a.cover_image && (
        <div style={{ width: 60, height: 48, flexShrink: 0, borderRadius: 5, overflow: 'hidden', background: 'var(--bg3)' }}>
          <img src={a.cover_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.closest('div').style.display = 'none'} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 8.5, color, letterSpacing: '.06em', marginBottom: 4, textTransform: 'uppercase' }}>
          {catLabel(a.category || a.ai_category)}
        </div>
        <h4 style={{
          fontFamily: 'var(--f-sans)', fontSize: 12.5, fontWeight: 600, color: 'var(--t1)', lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          marginBottom: 4,
        }}>
          {a.title}
        </h4>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t3)' }}>
          {timeAgo(a.published_at || a.created_at)}
        </div>
      </div>
    </div>
  )
}

// ── ARTICLE CARD SKELETON
export function ArticleCardSkeleton() {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="skeleton skeleton-img" style={{ width: '100%', aspectRatio: '16/9' }} />
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="skeleton skeleton-text" style={{ width: 70 }} />
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-title" style={{ width: '75%' }} />
        <div className="skeleton skeleton-text" />
        <div className="skeleton skeleton-text" style={{ width: '60%' }} />
      </div>
    </div>
  )
}

// ── ARTICLE LIST ROW (for news page)
export function ArticleRow({ article: a, onClick }) {
  const navigate = useNavigate()
  const go = () => onClick ? onClick(a) : navigate(`/article/${a.slug}`)
  const color = catColor(a?.category || a?.ai_category)

  return (
    <div
      onClick={go}
      style={{
        display: 'flex', gap: 14, padding: '16px 0',
        borderBottom: '1px solid var(--b0)', cursor: 'pointer',
        transition: 'background .12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {a.cover_image && (
        <div style={{ width: 90, height: 62, flexShrink: 0, borderRadius: 7, overflow: 'hidden', background: 'var(--bg3)' }}>
          <img src={a.cover_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.closest('div').style.display = 'none'} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {catLabel(a.category || a.ai_category)}
          </span>
          {a.source_name && (
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>· {a.source_name}</span>
          )}
        </div>
        <h3 style={{
          fontFamily: 'var(--f-sans)', fontSize: 14, fontWeight: 600, color: 'var(--t1)',
          lineHeight: 1.4, marginBottom: 5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {a.title}
        </h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t3)' }}>
            {timeAgo(a.published_at || a.created_at)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t3)' }}>
            <Eye size={9} />{(a.view_count || 0).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}
