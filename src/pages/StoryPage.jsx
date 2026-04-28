import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useArticles } from '../hooks/useData'
import { ArticleCard, ArticleCardSkeleton } from '../components/article/ArticleCard'
import { Mic, Star, ArrowRight } from 'lucide-react'

const FILTERS = [
  { value: 'all',     label: '전체' },
  { value: 'teen',    label: '청소년 창업가' },
  { value: 'pivot',   label: '피벗 스토리' },
  { value: 'success', label: '성공 스토리' },
  { value: 'fail',    label: '실패와 교훈' },
]

export default function StoryPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const { data: stories = [], isLoading } = useArticles({ category: 'story', limit: 20 })

  const cover = stories[0]
  const rest  = stories.slice(1)

  return (
    <div style={{ paddingBottom: 80 }}>

      {/* ── 헤더 */}
      <div style={{ padding: '32px 0 24px' }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#60A5FA', letterSpacing: '3px', marginBottom: 8 }}>FOUNDER STORIES</div>
        <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, marginBottom: 10, lineHeight: 1.2, color: 'var(--t1)' }}>
          창업자의 이야기
        </h1>
        <p style={{ color: 'var(--t2)', fontSize: 14, maxWidth: 560, lineHeight: 1.8 }}>
          성공과 실패, 피벗과 인내. 실제 창업자들의 날 것의 이야기를 통해 창업의 현실을 배웁니다.
        </p>
      </div>

      {/* ── 필터 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid var(--b1)' }}>
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            style={{
              padding: '7px 16px',
              border: `1px solid ${filter === f.value ? '#3B82F6' : 'var(--b2)'}`,
              background: filter === f.value ? 'rgba(59,130,246,0.12)' : 'none',
              color: filter === f.value ? '#60A5FA' : 'var(--t3)',
              fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.5px',
              cursor: 'pointer', fontWeight: filter === f.value ? 700 : 400,
              transition: 'all 0.15s', minHeight: 36, borderRadius: 6,
            }}
            onMouseEnter={e => { if (filter !== f.value) { e.currentTarget.style.borderColor = 'var(--b3)'; e.currentTarget.style.color = 'var(--t2)' } }}
            onMouseLeave={e => { if (filter !== f.value) { e.currentTarget.style.borderColor = 'var(--b2)'; e.currentTarget.style.color = 'var(--t3)' } }}
          >{f.label}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid-3 grid-bordered">
          {[0,1,2,3].map(i => <ArticleCardSkeleton key={i} />)}
        </div>
      ) : stories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ fontSize: 52, marginBottom: 20 }}>🎙️</div>
          <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 22, marginBottom: 12, fontWeight: 700, color: 'var(--t1)' }}>
            첫 번째 창업자 스토리를 준비 중입니다
          </h2>
          <p style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.8, maxWidth: 420, margin: '0 auto 28px' }}>
            청소년 창업가, 스타트업 대표의 생생한 이야기가 곧 공개됩니다.
          </p>
          <a href="mailto:contact@pacm.kr" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <Mic size={14} /> 스토리 제보하기
          </a>
        </div>
      ) : (
        <>
          {/* ── 커버 스토리 */}
          {cover && (
            <div
              onClick={() => navigate(`/article/${cover.slug}`)}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px',
                gap: 0, marginBottom: 2, overflow: 'hidden',
                background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 10,
                cursor: 'pointer', transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--b2)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--b1)'}
            >
              <div style={{ padding: 'clamp(24px,4vw,44px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: '#60A5FA', letterSpacing: '3px' }}>COVER INTERVIEW</div>
                  <Star size={10} color="#F59E0B" fill="#F59E0B" />
                </div>
                <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(18px,3vw,24px)', fontWeight: 700, lineHeight: 1.3, marginBottom: 12, color: 'var(--t1)' }}>
                  {cover.title}
                </h2>
                <p style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.75, marginBottom: 20,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}>{cover.excerpt}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                    {cover.profiles?.avatar_url
                      ? <img src={cover.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : cover.profiles?.display_name?.[0] || 'A'}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{cover.profiles?.display_name || '편집부'}</div>
                    {cover.profiles?.startup_name && (
                      <div style={{ fontSize: 10, color: '#60A5FA', fontFamily: 'var(--f-mono)' }}>{cover.profiles.startup_name}</div>
                    )}
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: '#60A5FA', fontFamily: 'var(--f-mono)', fontSize: 11 }}>
                    읽기 <ArrowRight size={11} />
                  </div>
                </div>
              </div>
              <div style={{ background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220 }}>
                {cover.cover_image
                  ? <img src={cover.cover_image} alt={cover.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <span style={{ fontSize: 56 }}>🌱</span>}
              </div>
            </div>
          )}

          {/* ── 나머지 그리드 */}
          {rest.length > 0 && (
            <div className="grid-3 grid-bordered" style={{ marginTop: 2 }}>
              {rest.map(a => <ArticleCard key={a.id} article={a} />)}
            </div>
          )}
        </>
      )}

      <style>{`
        @media (max-width: 640px) {
          div[style*="minmax(0,1fr) 260px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
