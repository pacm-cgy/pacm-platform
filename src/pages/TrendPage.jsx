import { useState, useCallback, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus, BarChart2, ChevronDown, ChevronUp, ExternalLink, Zap } from 'lucide-react'
import { ArticleCard, ArticleCardSkeleton } from '../components/article/ArticleCard'
import { useArticles, useTrends } from '../hooks/useData'
import { useNavigate } from 'react-router-dom'

const SECTORS = [
  { name: 'AI / 머신러닝', note: '2024 가장 활발한 투자 분야' },
  { name: '에듀테크', note: '청소년 타깃 급성장' },
  { name: '기후테크/그린', note: 'ESG 트렌드 수혜' },
  { name: 'B2B SaaS', note: '안정적 수익 모델 주목' },
  { name: '헬스케어 AI', note: '디지털 헬스 규제 완화' },
  { name: '핀테크', note: '마이데이터 2기 준비' },
]

// ── 왜 그럴까? 분석 패널 ─────────────────────────────────────────
function WhyPanel({ snapshot, onClose }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [sources, setSources] = useState([])
  const [error, setError] = useState(null)

  const fetchAnalysis = useCallback(async () => {
    if (done || loading) return
    setLoading(true)
    try {
      const r = await fetch('/api/analyze-trend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metric_name: snapshot.metric_name,
          metric_value: snapshot.metric_value,
          metric_unit: snapshot.metric_unit,
          change_pct: snapshot.change_pct,
          category: snapshot.category,
          source_name: snapshot.source_name,
        }),
      })
      const d = await r.json()
      if (d.analysis) { setAnalysis(d.analysis); setSources(d.sources || []) }
      else setError('분석을 가져오지 못했습니다.')
      setDone(true)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
      setDone(true)
    } finally {
      setLoading(false)
    }
  }, [snapshot, done, loading])

  // 마운트 시 자동 분석
  useEffect(() => { fetchAnalysis() }, [])

  // 마크다운 볼드(**text**) → <strong> 간단 파서
  const renderMd = (text) => {
    if (!text) return null
    return text.split('\n').map((line, i) => {
      const parts = line.split(/\*\*([^*]+)\*\*/g)
      return (
        <p key={i} style={{ margin: line.startsWith('**') ? '14px 0 6px' : '4px 0', lineHeight: 1.75, fontSize: '14px', color: line.startsWith('**') ? 'var(--c-paper)' : 'var(--c-gray-7)' }}>
          {parts.map((part, j) => j % 2 === 1 ? <strong key={j} style={{ color: 'var(--c-paper)', fontWeight: 700 }}>{part}</strong> : part)}
        </p>
      )
    })
  }

  return (
    <div style={{
      background: 'var(--c-gray-1)',
      border: '1px solid var(--c-gold)',
      borderTop: '3px solid var(--c-gold)',
      padding: '20px 22px',
      marginTop: '2px',
      animation: 'fadeInUp 0.2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={14} color="var(--c-gold)" />
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gold)', letterSpacing: '1px' }}>
            AI 트렌드 분석 · 웹 서치 기반
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--c-muted)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px 0' }}>
          <div style={{ width: '18px', height: '18px', border: '2px solid var(--c-gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: 'var(--c-muted)', fontFamily: 'var(--f-mono)' }}>뉴스와 최신 데이터를 검색하고 있습니다...</span>
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--c-red)', fontSize: '13px', padding: '10px 0' }}>{error}</div>
      )}

      {analysis && (
        <div>
          <div style={{ marginBottom: '14px' }}>{renderMd(analysis)}</div>
          {sources.length > 0 && (
            <div style={{ borderTop: '1px solid var(--c-gray-3)', paddingTop: '12px', marginTop: '12px' }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)', letterSpacing: '1px', marginBottom: '8px' }}>참고 자료</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {sources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--c-gold)', textDecoration: 'none' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    <ExternalLink size={10} />
                    {s.title || s.url.split('/')[2]}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── 트렌드 카드 ──────────────────────────────────────────────────
function TrendCard({ snapshot }) {
  const [showWhy, setShowWhy] = useState(false)
  const up   = (snapshot.change_pct || 0) > 0
  const down = (snapshot.change_pct || 0) < 0
  const Icon  = up ? TrendingUp : down ? TrendingDown : Minus
  const color = up ? 'var(--c-green)' : down ? 'var(--c-red)' : 'var(--c-muted)'

  const isNewsTrend = snapshot.source_name === '뉴스 트렌드 분석'

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card" style={{ padding: '22px', transition: 'border-color 0.15s', borderBottom: showWhy ? '1px solid var(--c-gold)' : undefined }}>
        {/* 뱃지 */}
        {isNewsTrend && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '9px', color: '#60a5fa', border: '1px solid #60a5fa', padding: '1px 6px', letterSpacing: '1px' }}>뉴스 트렌드</span>
          </div>
        )}

        {/* 지표 */}
        <div className="t-caption" style={{ marginBottom: '6px' }}>{snapshot.metric_name}</div>
        <div style={{ fontFamily: 'var(--f-serif)', fontSize: '22px', fontWeight: 700, marginBottom: '6px' }}>
          {snapshot.metric_unit === '억원' || snapshot.metric_unit?.includes('억')
            ? '₩' : ''}{Number(snapshot.metric_value).toLocaleString()}{snapshot.metric_unit !== '억원' ? snapshot.metric_unit : '억'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--f-mono)', fontSize: '11px', color, marginBottom: '10px' }}>
          <Icon size={11} /> {Math.abs(snapshot.change_pct || 0).toFixed(1)}% YoY
        </div>

        {/* 출처 */}
        {snapshot.source_name && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)', marginBottom: '12px', lineHeight: 1.4 }}>
            출처: {snapshot.source_url
              ? <a href={snapshot.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-gray-6)', textDecoration: 'none' }} onMouseEnter={e => e.currentTarget.style.color='var(--c-gold)'} onMouseLeave={e => e.currentTarget.style.color='var(--c-gray-6)'}>{snapshot.source_name}</a>
              : snapshot.source_name}
          </div>
        )}

        {/* 왜 그럴까? 버튼 */}
        <button
          onClick={() => setShowWhy(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: showWhy ? 'var(--c-gold-dim)' : 'none',
            border: `1px solid ${showWhy ? 'var(--c-gold)' : 'var(--c-gray-3)'}`,
            color: showWhy ? 'var(--c-gold)' : 'var(--c-muted)',
            fontFamily: 'var(--f-mono)', fontSize: '11px', letterSpacing: '0.5px',
            padding: '5px 12px', cursor: 'pointer', transition: 'var(--t-fast)', minHeight: '30px',
          }}
          onMouseEnter={e => { if (!showWhy) { e.currentTarget.style.borderColor = 'var(--c-gold)'; e.currentTarget.style.color = 'var(--c-gold)' } }}
          onMouseLeave={e => { if (!showWhy) { e.currentTarget.style.borderColor = 'var(--c-gray-3)'; e.currentTarget.style.color = 'var(--c-muted)' } }}
        >
          <Zap size={11} />
          왜 그럴까?
          {showWhy ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>

      {/* 분석 패널 */}
      {showWhy && <WhyPanel snapshot={snapshot} onClose={() => setShowWhy(false)} />}
    </div>
  )
}

// ── TREND PAGE ───────────────────────────────────────────────────
export default function TrendPage() {
  const navigate = useNavigate()
  const { data: trendArticles = [], isLoading } = useArticles({ category: 'trend', limit: 6 })
  const { data: snapshots = [] } = useTrends()

  // 공공기관 vs 뉴스 트렌드 분리
  const officialSnaps = snapshots.filter(s => s.source_name !== '뉴스 트렌드 분석')
  const newsSnaps     = snapshots.filter(s => s.source_name === '뉴스 트렌드 분석')

  return (
    <div style={{ paddingBottom: '80px' }}>
      {/* 헤더 */}
      <div style={{ padding: '32px 0 20px', borderBottom: '1px solid var(--c-border)' }}>
        <div className="t-eyebrow" style={{ marginBottom: '8px' }}>TREND TRACKER</div>
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, marginBottom: '8px', lineHeight: 1.2 }}>
          창업 트렌드 트래커
        </h1>
        <p style={{ color: 'var(--c-muted)', fontSize: '14px', lineHeight: 1.7 }}>
          한국 스타트업 생태계의 흐름을 추적합니다. 각 지표의 <strong style={{ color: 'var(--c-gold)', fontWeight: 600 }}>왜 그럴까?</strong>를 눌러 AI 분석을 받아보세요.
        </p>
      </div>

      <div style={{ marginTop: '36px', display: 'flex', flexDirection: 'column', gap: '48px' }}>

        {/* 공공기관 공식 지표 */}
        {officialSnaps.length > 0 && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--c-border)' }}>
              <div className="t-eyebrow">LIVE METRICS · 공공기관 공식 데이터</div>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>
                중기부, 벤처캐피탈협회 등
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)' }}>
              {officialSnaps.map((s, i) => (
                <div key={i} style={{ background: 'var(--c-card)', display: 'flex', flexDirection: 'column' }}>
                  <TrendCard snapshot={s} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 뉴스 기반 트렌드 */}
        {newsSnaps.length > 0 && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--c-border)' }}>
              <div className="t-eyebrow">뉴스 트렌드 · AI 자동 분석</div>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: '9px', color: '#60a5fa', border: '1px solid #60a5fa', padding: '1px 6px' }}>AUTO</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)' }}>
              {newsSnaps.map((s, i) => (
                <div key={i} style={{ background: 'var(--c-card)', display: 'flex', flexDirection: 'column' }}>
                  <TrendCard snapshot={s} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 데이터 없을 때 */}
        {snapshots.length === 0 && (
          <section>
            <div className="t-eyebrow" style={{ marginBottom: '16px' }}>LIVE METRICS</div>
            <div style={{ padding: '60px 20px', textAlign: 'center', border: '1px dashed var(--c-gray-3)', color: 'var(--c-muted)' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>📈</div>
              <div style={{ fontFamily: 'var(--f-serif)', fontSize: '16px', color: 'var(--c-paper)', marginBottom: '6px' }}>지표 데이터 준비 중</div>
              <div style={{ fontSize: '13px' }}>공신력 있는 기관 데이터를 연동 중입니다.</div>
            </div>
          </section>
        )}

        {/* 주목 섹터 */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--c-border)' }}>
            <div className="t-eyebrow">HOT SECTORS · 2024-2025</div>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>출처: 중소벤처기업부, 벤처캐피탈협회</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)' }}>
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

        {/* 트렌드 리포트 */}
        <section>
          <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--c-border)' }}>
            <div className="t-eyebrow" style={{ marginBottom: '4px' }}>TREND REPORTS</div>
            <div style={{ fontSize: '12px', color: 'var(--c-muted)', fontFamily: 'var(--f-mono)' }}>AI 자동 생성 + 운영자 큐레이션</div>
          </div>
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)' }}>
              {[0,1,2].map(i => <ArticleCardSkeleton key={i} />)}
            </div>
          ) : trendArticles.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)' }}>
              {trendArticles.map(a => <ArticleCard key={a.id} article={a} onClick={() => navigate(`/article/${a.slug}`)} />)}
            </div>
          ) : (
            <div style={{ padding: '48px 20px', textAlign: 'center', border: '1px dashed var(--c-gray-3)', color: 'var(--c-muted)' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>📝</div>
              <div style={{ fontFamily: 'var(--f-serif)', fontSize: '15px', color: 'var(--c-paper)', marginBottom: '4px' }}>트렌드 리포트 준비 중</div>
              <div style={{ fontSize: '13px' }}>곧 첫 번째 트렌드 분석 리포트가 공개됩니다.</div>
            </div>
          )}
        </section>
      </div>

      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @media (max-width: 768px) {
          div[style*="minmax(240px"] { grid-template-columns: repeat(2,1fr) !important; }
          div[style*="minmax(260px"] { grid-template-columns: 1fr !important; }
          div[style*="minmax(280px"] { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          div[style*="minmax(240px"],
          div[style*="minmax(260px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
