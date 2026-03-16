import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useArticles } from '../hooks/useData'
import { ArticleCard, ArticleCardSkeleton } from '../components/article/ArticleCard'
import { AdSlot } from '../components/ads/AdBanner'
import { Mic, Star, ArrowRight } from 'lucide-react'

export default function StoryPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const { data: stories = [], isLoading } = useArticles({ category: 'story', limit: 20 })

  const filters = [
    { value: 'all',     label: '전체' },
    { value: 'teen',    label: '청소년 창업가' },
    { value: 'pivot',   label: '피벗 스토리' },
    { value: 'success', label: '성공 스토리' },
    { value: 'fail',    label: '실패와 교훈' },
  ]

  const cover = stories[0]
  const rest = stories.slice(1)

  return (
    <div style={{ paddingBottom: '80px' }}>
      {/* 헤더 */}
      <div style={{ padding: '40px 0 28px' }} className="container">
        <div className="t-eyebrow" style={{ marginBottom: '8px' }}>FOUNDER STORIES</div>
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, marginBottom: '12px' }}>
          창업자의 이야기
        </h1>
        <p style={{ color: 'var(--c-muted)', fontSize: '14px', maxWidth: '560px', lineHeight: 1.8 }}>
          성공과 실패, 피벗과 인내. 실제 창업자들의 날 것의 이야기를 통해 창업의 현실을 배웁니다.
        </p>
      </div>

      <div className="container">
        {/* 필터 */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '28px', paddingBottom: '20px', borderBottom: '1px solid var(--c-gray-3)' }}>
          {filters.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              style={{
                padding: '6px 16px', border: '1px solid',
                borderColor: filter === f.value ? 'var(--c-gold)' : 'var(--c-gray-3)',
                background: filter === f.value ? 'var(--c-gold)' : 'none',
                color: filter === f.value ? 'var(--c-ink)' : 'var(--c-muted)',
                fontFamily: 'var(--f-mono)', fontSize: '11px', cursor: 'pointer',
                fontWeight: filter === f.value ? 700 : 400,
                transition: 'var(--t-fast)',
              }}
            >{f.label}</button>
          ))}
        </div>

        <AdSlot position="content-top" />

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: '2px' }}>
            {[0,1,2,3].map(i => <ArticleCardSkeleton key={i} />)}
          </div>
        ) : stories.length === 0 ? (
          /* 콘텐츠 없을 때 안내 */
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎙️</div>
            <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: '22px', marginBottom: '12px' }}>
              첫 번째 창업자 스토리를 준비 중입니다
            </h2>
            <p style={{ color: 'var(--c-muted)', fontSize: '14px', lineHeight: 1.8, maxWidth: '420px', margin: '0 auto 28px' }}>
              청소년 창업가, 스타트업 대표의 생생한 이야기가 곧 공개됩니다.
              인터뷰 제보나 참여 신청은 아래로 문의해주세요.
            </p>
            <a href="mailto:contact@pacm.kr" className="btn btn-gold" style={{ textDecoration: 'none', display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
              <Mic size={14} /> 스토리 제보하기
            </a>
          </div>
        ) : (
          <>
            {/* 커버 스토리 */}
            {cover && (
              <div
                className="card card-clickable"
                onClick={() => navigate(`/article/${cover.slug}`)}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 0, marginBottom: '2px', overflow: 'hidden' }}
              >
                <div style={{ padding: 'clamp(24px,4vw,48px)', background: 'var(--c-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <div className="t-eyebrow">COVER INTERVIEW</div>
                    <Star size={12} style={{ color: 'var(--c-gold)' }} />
                  </div>
                  <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(18px,3vw,26px)', fontWeight: 700, lineHeight: 1.3, marginBottom: '14px' }}>
                    {cover.title}
                  </h2>
                  <p style={{ color: 'var(--c-muted)', fontSize: '14px', lineHeight: 1.8, marginBottom: '20px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {cover.excerpt}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="avatar avatar-sm">
                      {cover.profiles?.avatar_url
                        ? <img src={cover.profiles.avatar_url} alt="" />
                        : cover.profiles?.display_name?.[0] || 'A'}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{cover.profiles?.display_name || '편집부'}</div>
                      {cover.profiles?.startup_name && (
                        <div style={{ fontSize: '11px', color: 'var(--c-gold)', fontFamily: 'var(--f-mono)' }}>{cover.profiles.startup_name}</div>
                      )}
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--c-gold)', fontFamily: 'var(--f-mono)', fontSize: '11px' }}>
                      읽기 <ArrowRight size={12} />
                    </div>
                  </div>
                </div>
                <div style={{ background: 'var(--c-gray-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '240px' }}>
                  {cover.cover_image
                    ? <img src={cover.cover_image} alt={cover.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '64px' }}>🌱</span>}
                </div>
              </div>
            )}

            {/* 나머지 스토리 그리드 */}
            {rest.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px,100%), 1fr))', gap: '2px', marginTop: '2px' }}>
                {rest.map(a => <ArticleCard key={a.id} article={a} />)}
              </div>
            )}
          </>
        )}

        <AdSlot position="content-bottom" />
      </div>
    </div>
  )
}
