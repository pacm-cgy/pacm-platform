import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AdSlot } from '../components/ads/AdBanner'
import { ArticleCard, ArticleCardSkeleton } from '../components/article/ArticleCard'
import { useArticles } from '../hooks/useData'

const CATS = [
  { id: 'all', label: '전체' }, { id: 'insight', label: '창업 기초' },
  { id: 'trend', label: '성장 전략' }, { id: 'opinion', label: '투자/자금' },
  { id: 'magazine', label: '제품 개발' }, { id: 'story', label: '시장 분석' },
]

export default function InsightPage() {
  const { category } = useParams()
  const navigate = useNavigate()
  const [active, setActive] = useState(category || 'all')
  const { data: articles = [], isLoading } = useArticles({ category: active === 'all' ? null : active, limit: 12 })

  return (
    <div style={{ paddingBottom: '64px' }}>
      <div style={{ padding: '32px 0 20px' }}>
        <div className="t-eyebrow" style={{ marginBottom: '8px' }}>PACM INSIGHT</div>
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px, 5vw, 34px)', fontWeight: 700, marginBottom: '8px' }}>창업 인사이트</h1>
        <p style={{ color: 'var(--c-muted)', fontSize: '14px', maxWidth: '560px' }}>아이디어부터 스케일업까지. 매주 깊이 있는 분석과 실전 가이드를 제공합니다.</p>
      </div>
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--c-border)', marginBottom: '28px' }}>
        {CATS.map(c => (
          <button key={c.id} onClick={() => setActive(c.id)}
            style={{ padding: '10px 18px', background: 'none', border: 'none', borderBottom: `2px solid ${active === c.id ? 'var(--c-gold)' : 'transparent'}`, marginBottom: '-2px', fontFamily: 'var(--f-mono)', fontSize: '12px', letterSpacing: '1px', color: active === c.id ? 'var(--c-paper)' : 'var(--c-muted)', cursor: 'pointer', fontWeight: active === c.id ? 700 : 400 }}
          >{c.label}</button>
        ))}
      </div>
      {isLoading ? (
        <div className="grid-3 grid-bordered">{[0,1,2,3,4,5].map(i => <ArticleCardSkeleton key={i} />)}</div>
      ) : articles.length > 0 ? (
        <div className="grid-3 grid-bordered">{articles.map(a => <ArticleCard key={a.id} article={a} />)}</div>
      ) : (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--c-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📝</div>
          <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px' }}>아직 게시된 아티클이 없습니다</div>
          <div style={{ fontSize: '14px', marginTop: '8px' }}>곧 새로운 인사이트가 공개됩니다</div>
        </div>
      )}
    </div>
  )
}
