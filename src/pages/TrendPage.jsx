import { TrendingUp, TrendingDown, Minus, BarChart2, Clock } from 'lucide-react'
import { ArticleCard, ArticleCardSkeleton } from '../components/article/ArticleCard'
import { useArticles, useTrends } from '../hooks/useData'
import { useNavigate } from 'react-router-dom'

// 실제 공개 데이터 기반 섹터 (2024년 중소벤처기업부/스타트업 생태계 보고서)
const SECTORS = [
  { name: 'AI / 머신러닝', note: '2024 가장 활발한 투자 분야' },
  { name: '에듀테크', note: '청소년 타깃 급성장' },
  { name: '기후테크/그린', note: 'ESG 트렌드 수혜' },
  { name: 'B2B SaaS', note: '안정적 수익 모델 주목' },
  { name: '헬스케어 AI', note: '디지털 헬스 규제 완화' },
  { name: '핀테크', note: '마이데이터 2기 준비' },
]

function EmptyState({ icon = '📊', title, desc }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 20px', gap: '12px',
      border: '1px dashed var(--c-gray-4)', color: 'var(--c-muted)',
    }}>
      <span style={{ fontSize: '36px' }}>{icon}</span>
      <div style={{ fontFamily: 'var(--f-serif)', fontSize: '16px', color: 'var(--c-paper)' }}>{title}</div>
      {desc && <div style={{ fontSize: '13px', textAlign: 'center', maxWidth: '320px', lineHeight: 1.7 }}>{desc}</div>}
    </div>
  )
}

export default function TrendPage() {
  const navigate = useNavigate()
  const { data: trendArticles = [], isLoading } = useArticles({ category: 'trend', limit: 6 })
  const { data: snapshots = [] } = useTrends()

  return (
    <div style={{ paddingBottom: '80px' }}>
      {/* 헤더 */}
      <div style={{ padding: '40px 0 24px', borderBottom: '1px solid var(--c-gray-3)' }}>
        <div className="container">
          <div className="t-eyebrow" style={{ marginBottom: '8px' }}>TREND TRACKER</div>
          <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, marginBottom: '8px' }}>창업 트렌드 트래커</h1>
          <p style={{ color: 'var(--c-muted)', fontSize: '14px' }}>한국 스타트업 생태계의 흐름을 추적합니다.</p>
        </div>
      </div>

      <div className="container" style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', gap: '48px' }}>

        {/* 실시간 지표 - DB 데이터 있을 때만 */}
        {snapshots.length > 0 ? (
          <section>
            <div className="t-eyebrow" style={{ marginBottom: '16px' }}>LIVE METRICS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '2px' }}>
              {snapshots.map((s, i) => {
                const up = (s.change_pct || 0) > 0
                const down = (s.change_pct || 0) < 0
                const Icon = up ? TrendingUp : down ? TrendingDown : Minus
                const color = up ? 'var(--c-green)' : down ? 'var(--c-red)' : 'var(--c-muted)'
                return (
                  <div key={i} className="card" style={{ padding: '24px' }}>
                    <div className="t-caption" style={{ marginBottom: '6px' }}>{s.metric_name}</div>
                    <div style={{ fontFamily: 'var(--f-serif)', fontSize: '24px', fontWeight: 700, marginBottom: '6px' }}>
                      {Number(s.metric_value).toLocaleString()}{s.metric_unit}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--f-mono)', fontSize: '11px', color }}>
                      <Icon size={12} /> {Math.abs(s.change_pct || 0).toFixed(1)}% YoY
                    </div>
                    {s.source && (
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: '9px', color: 'var(--c-gray-5)', marginTop: '4px', lineHeight: 1.4 }}>
                        출처: {s.source_url ? <a href={s.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-gold)', textDecoration: 'none' }}>{s.source}</a> : s.source}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ) : (
          <section>
            <div className="t-eyebrow" style={{ marginBottom: '16px' }}>LIVE METRICS</div>
            <EmptyState icon="📈" title="지표 데이터 준비 중" desc="공신력 있는 기관 데이터를 연동 중입니다." />
          </section>
        )}

        {/* 주목 섹터 - 실제 근거 기반 */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div className="t-eyebrow">HOT SECTORS · 2024-2025</div>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>출처: 중소벤처기업부, 벤처캐피탈협회</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '2px' }}>
            {SECTORS.map((s, i) => (
              <div key={i} className="card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'var(--f-serif)', fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>{s.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--c-muted)' }}>{s.note}</div>
                </div>
                <BarChart2 size={18} color="var(--c-gold)" style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </section>

        {/* 트렌드 아티클 */}
        <section>
          <div className="t-eyebrow" style={{ marginBottom: '16px' }}>TREND REPORTS</div>
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '2px' }}>
              {[0,1,2].map(i => <ArticleCardSkeleton key={i} />)}
            </div>
          ) : trendArticles.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '2px' }}>
              {trendArticles.map(a => <ArticleCard key={a.id} article={a} onClick={() => navigate(`/article/${a.slug}`)} />)}
            </div>
          ) : (
            <EmptyState icon="📝" title="트렌드 리포트 준비 중" desc="곧 첫 번째 트렌드 분석 리포트가 공개됩니다." />
          )}
        </section>
      </div>
    </div>
  )
}
