import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { AdSlot } from '../components/ads/AdBanner'
import { ArticleCard, ArticleCardSkeleton } from '../components/article/ArticleCard'
import { useArticles } from '../hooks/useData'

const CATS = [
  { id: 'all',       label: '전체' },
  { id: 'insight',   label: '창업 기초' },
  { id: 'trend',     label: '성장 전략' },
  { id: 'opinion',   label: '투자/자금' },
  { id: 'magazine',  label: '제품 개발' },
  { id: 'story',     label: '시장 분석' },
]

export default function InsightPage() {
  const { category } = useParams()
  const [active, setActive] = useState(category || 'all')
  const { data: articles = [], isLoading } = useArticles({
    category: active === 'all' ? null : active,
    limit: 12,
  })

  return (
    <div style={{ paddingBottom: '72px' }}>
      {/* 헤더 */}
      <div style={{ padding: '32px 0 24px' }}>
        <div className="t-eyebrow" style={{ marginBottom: '8px' }}>PACM INSIGHT</div>
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px, 5vw, 34px)', fontWeight: 700, marginBottom: '8px', lineHeight: 1.2 }}>
          창업 인사이트
        </h1>
        <p style={{ color: 'var(--c-muted)', fontSize: '14px', maxWidth: '560px', lineHeight: 1.7 }}>
          아이디어부터 스케일업까지. 매주 깊이 있는 분석과 실전 가이드를 제공합니다.
        </p>
      </div>

      {/* 탭바 */}
      <div className="tab-bar" style={{ marginBottom: '28px' }}>
        {CATS.map(c => (
          <button key={c.id}
            className={`tab-item${active === c.id ? ' active' : ''}`}
            onClick={() => setActive(c.id)}
          >{c.label}</button>
        ))}
      </div>

      <AdSlot slot="insight-top" />

      {/* 콘텐츠 */}
      {isLoading ? (
        <div className="grid-3 grid-bordered">
          {[0,1,2,3,4,5].map(i => <ArticleCardSkeleton key={i} />)}
        </div>
      ) : articles.length > 0 ? (
        <div className="grid-3 grid-bordered">
          {articles.map(a => <ArticleCard key={a.id} article={a} />)}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-muted)' }}>
          <div style={{ fontSize: '44px', marginBottom: '18px' }}>📝</div>
          <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px', color: 'var(--c-paper)', marginBottom: '8px' }}>
            아직 게시된 아티클이 없습니다
          </div>
          <div style={{ fontSize: '14px', lineHeight: 1.7 }}>
            곧 새로운 인사이트가 공개됩니다
          </div>
        </div>
      )}
    </div>
  )
}
