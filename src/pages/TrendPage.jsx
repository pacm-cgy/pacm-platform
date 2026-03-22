import { useState, useCallback, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus, BarChart2, ChevronDown, ChevronUp, ExternalLink, Zap } from 'lucide-react'
import { ArticleCard, ArticleCardSkeleton } from '../components/article/ArticleCard'
import { useArticles, useTrends, useNewsTrends } from '../hooks/useData'
import { useNavigate } from 'react-router-dom'

const SECTORS = [
  { name: 'AI / 머신러닝', note: '2024 가장 활발한 투자 분야', icon: '🤖', category: 'ai' },
  { name: '에듀테크', note: '청소년 타깃 급성장', icon: '📱', category: 'edutech' },
  { name: '기후테크/그린', note: 'ESG 트렌드 수혜', icon: '🌿', category: 'climate' },
  { name: 'B2B SaaS', note: '안정적 수익 모델 주목', icon: '💼', category: 'saas' },
  { name: '헬스케어 AI', note: '디지털 헬스 규제 완화', icon: '🏥', category: 'health' },
  { name: '핀테크', note: '마이데이터 2기 준비', icon: '💰', category: 'fintech' },
]

// ── 공통 마크다운 렌더러 ─────────────────────────────────────────
function renderMd(text) {
  if (!text) return null
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: '6px' }} />
    const parts = line.split(/\*\*([^*]+)\*\*/g)
    const isHeader = line.trim().startsWith('**') && line.trim().endsWith('**')
    return (
      <p key={i} style={{
        margin: isHeader ? '16px 0 6px' : '3px 0',
        lineHeight: 1.8,
        fontSize: '14px',
        color: isHeader ? 'var(--c-paper)' : 'var(--c-gray-7)',
      }}>
        {parts.map((part, j) =>
          j % 2 === 1
            ? <strong key={j} style={{ color: 'var(--c-paper)', fontWeight: 700 }}>{part}</strong>
            : part
        )}
      </p>
    )
  })
}

// ── 공통 AI 분석 패널 ────────────────────────────────────────────
function WhyPanel({ payload, label, onClose }) {
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
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (d.analysis) { setAnalysis(d.analysis); setSources(d.sources || []) }
      else setError('분석을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setDone(true)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
      setDone(true)
    } finally {
      setLoading(false)
    }
  }, [payload, done, loading])

  useEffect(() => { fetchAnalysis() }, [])

  return (
    <div style={{
      background: 'var(--c-gray-1)',
      border: '1px solid var(--c-gold)',
      borderTop: '3px solid var(--c-gold)',
      padding: '20px 22px',
      marginTop: '2px',
      animation: 'fadeInUp 0.2s ease',
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={14} color="var(--c-gold)" />
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gold)', letterSpacing: '1px' }}>
            AI 분석 · {label}
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--c-muted)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
      </div>

      {/* 로딩 */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px 0' }}>
          <div style={{ width: '18px', height: '18px', border: '2px solid var(--c-gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: 'var(--c-muted)', fontFamily: 'var(--f-mono)' }}>
            AI가 분석하고 있습니다...
          </span>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--c-red)', fontSize: '13px', padding: '10px 0' }}>
          <span>⚠️</span> {error}
          <button onClick={() => { setError(null); setDone(false); fetchAnalysis() }}
            style={{ marginLeft: '8px', background: 'none', border: '1px solid var(--c-red)', color: 'var(--c-red)', fontSize: '11px', padding: '2px 8px', cursor: 'pointer' }}>
            재시도
          </button>
        </div>
      )}

      {/* 분석 결과 */}
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
    </div>
  )
}

// ── 지표 카드 (공공기관 데이터) ──────────────────────────────────
function TrendCard({ snapshot }) {
  const [showWhy, setShowWhy] = useState(false)
  const up   = (snapshot.change_pct || 0) > 0
  const down = (snapshot.change_pct || 0) < 0
  const Icon  = up ? TrendingUp : down ? TrendingDown : Minus
  const color = up ? 'var(--c-green)' : down ? 'var(--c-red)' : 'var(--c-muted)'
  const isNewsTrend = snapshot.source_name === '뉴스 트렌드 분석'

  const whyPayload = {
    metric_name: snapshot.metric_name,
    metric_value: snapshot.metric_value,
    metric_unit: snapshot.metric_unit,
    change_pct: snapshot.change_pct,
    category: snapshot.category,
    source_name: snapshot.source_name,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card" style={{ padding: '22px' }}>
        {isNewsTrend && (
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '9px', color: '#60a5fa', border: '1px solid #60a5fa', padding: '1px 6px', letterSpacing: '1px', display: 'inline-block', marginBottom: '8px' }}>뉴스 트렌드</span>
        )}
        <div className="t-caption" style={{ marginBottom: '6px' }}>{snapshot.metric_name}</div>
        <div style={{ fontFamily: 'var(--f-serif)', fontSize: '22px', fontWeight: 700, marginBottom: '6px' }}>
          {snapshot.metric_unit === '억원' ? '₩' : ''}{Number(snapshot.metric_value).toLocaleString()}{snapshot.metric_unit !== '억원' ? snapshot.metric_unit : '억'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--f-mono)', fontSize: '11px', color, marginBottom: '10px' }}>
          <Icon size={11} /> {Math.abs(snapshot.change_pct || 0).toFixed(1)}%{' '}
            {['AI분석','기술/IT','경제/창업','교육/창업','사회/창업','환경/에너지','헬스케어'].includes(snapshot.category)
              ? '전일대비' : '전월대비'}
        </div>
        {snapshot.source_name && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)', marginBottom: '12px', lineHeight: 1.4 }}>
            출처: {snapshot.source_url
              ? <a href={snapshot.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-gray-6)', textDecoration: 'none' }} onMouseEnter={e => e.currentTarget.style.color='var(--c-gold)'} onMouseLeave={e => e.currentTarget.style.color='var(--c-gray-6)'}>{snapshot.source_name}</a>
              : snapshot.source_name}
          </div>
        )}
        <WhyButton
          active={showWhy}
          onClick={() => setShowWhy(v => !v)}
          label={up ? '왜 상승했을까?' : down ? '왜 하락했을까?' : '왜 그럴까?'}
        />
      </div>
      {showWhy && <WhyPanel payload={whyPayload} label="공식 데이터 기반" onClose={() => setShowWhy(false)} />}
    </div>
  )
}

// ── 섹터 카드 (HOT SECTORS) ──────────────────────────────────────
function SectorCard({ sector, newsCount }) {
  const [showWhy, setShowWhy] = useState(false)

  const whyPayload = {
    type: 'sector',
    sector_name: sector.name,
    sector_note: sector.note,
    category: sector.category,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* 상단: 아이콘 + 이름 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>{sector.icon}</span>
            <div>
              <div style={{ fontFamily: 'var(--f-serif)', fontSize: '15px', fontWeight: 600 }}>{sector.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--c-muted)', marginTop: '2px' }}>{sector.note}</div>
            </div>
          </div>
          <BarChart2 size={16} color="var(--c-gold)" style={{ flexShrink: 0 }} />
        </div>
        {/* 뉴스 수치 */}
        {newsCount && (
          <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 0', borderTop:'1px solid var(--c-border)' }}>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:'13px', fontWeight:700, color: newsCount.change_pct > 0 ? 'var(--c-green)' : newsCount.change_pct < 0 ? 'var(--c-red)' : 'var(--c-paper)' }}>
              {newsCount.metric_value}건
            </span>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color: newsCount.change_pct > 0 ? 'var(--c-green)' : newsCount.change_pct < 0 ? 'var(--c-red)' : 'var(--c-gray-5)' }}>
              {newsCount.change_pct > 0 ? '▲' : newsCount.change_pct < 0 ? '▼' : '─'} {Math.abs(newsCount.change_pct || 0)}% 전일대비
            </span>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:'9px', color:'var(--c-gray-5)', marginLeft:'auto' }}>오늘</span>
          </div>
        )}
        {/* 왜 그럴까? 버튼 */}
        <WhyButton
          active={showWhy}
          onClick={() => setShowWhy(v => !v)}
          label="왜 트렌드가 되었을까?"
        />
      </div>
      {showWhy && <WhyPanel payload={whyPayload} label={sector.name} onClose={() => setShowWhy(false)} />}
    </div>
  )
}

// ── 왜 그럴까? 버튼 (공통) ───────────────────────────────────────
function WhyButton({ active, onClick, label = '왜 그럴까?' }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        background: active ? 'rgba(249,115,22,0.1)' : 'none',
        border: `1px solid ${active ? 'var(--c-gold)' : 'var(--c-gray-3)'}`,
        color: active ? 'var(--c-gold)' : 'var(--c-muted)',
        fontFamily: 'var(--f-mono)', fontSize: '11px', letterSpacing: '0.5px',
        padding: '5px 12px', cursor: 'pointer', transition: 'var(--t-fast)', minHeight: '30px',
        alignSelf: 'flex-start',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--c-gold)'; e.currentTarget.style.color = 'var(--c-gold)' } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--c-gray-3)'; e.currentTarget.style.color = 'var(--c-muted)' } }}
    >
      <Zap size={11} />
      {label}
      {active ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
    </button>
  )
}

// ── TREND PAGE ────────────────────────────────────────────────────
export default function TrendPage() {
  const navigate = useNavigate()
  const { data: trendArticles = [], isLoading } = useArticles({ category: 'trend', limit: 6 })
  const { data: snapshots = [] } = useTrends()

  const { data: newsTrends = [] } = useNewsTrends()
  const officialSnaps = snapshots  // 어드민이 수동 입력한 공식 지표
  const newsSnaps     = newsTrends // 뉴스 기반 자동 업데이트 트렌드

  return (
    <div style={{ paddingBottom: '80px' }}>
      {/* 헤더 */}
      <div style={{ padding: '32px 0 20px', borderBottom: '1px solid var(--c-border)' }}>
        <div className="t-eyebrow" style={{ marginBottom: '8px' }}>TREND TRACKER</div>
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, marginBottom: '8px', lineHeight: 1.2 }}>
          창업 트렌드 트래커
        </h1>
        <p style={{ color: 'var(--c-muted)', fontSize: '14px', lineHeight: 1.7 }}>
          한국 스타트업 생태계의 흐름을 추적합니다.
          각 지표와 섹터의 <strong style={{ color: 'var(--c-gold)', fontWeight: 600 }}>왜 그럴까?</strong>를 눌러 AI 분석을 받아보세요.
        </p>
      </div>

      <div style={{ marginTop: '36px', display: 'flex', flexDirection: 'column', gap: '48px' }}>

        {/* 공공기관 공식 지표 */}
        {officialSnaps.length > 0 && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--c-border)' }}>
              <div className="t-eyebrow">LIVE METRICS · 공공기관 공식 데이터</div>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>중기부, 벤처캐피탈협회 등</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)' }}>
              {officialSnaps.map((s, i) => (
                <div key={i} style={{ background: 'var(--c-card)' }}>
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
              <div className="t-eyebrow">뉴스 트렌드 · 실시간 자동 업데이트</div>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: '9px', color: '#60a5fa', border: '1px solid #60a5fa', padding: '1px 6px' }}>LIVE</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)' }}>
              {newsSnaps.map((s, i) => (
                <div key={i} style={{ background: 'var(--c-card)' }}>
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

        {/* HOT SECTORS — 왜 그럴까? 탭 포함 */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--c-border)' }}>
            <div className="t-eyebrow">HOT SECTORS · 2024-2025</div>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>출처: 중소벤처기업부, 벤처캐피탈협회</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)' }}>
            {SECTORS.map((s, i) => {
              const newsCount = newsTrends.find(t =>
                t.category?.toLowerCase()?.includes(s.category) ||
                t.metric_name?.toLowerCase()?.includes(s.category)
              )
              return (
                <div key={i} style={{ background: 'var(--c-card)' }}>
                  <SectorCard sector={s} newsCount={newsCount} />
                </div>
              )
            })}
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
        @keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        @media (max-width: 768px) {
          div[style*="minmax(240px"] { grid-template-columns: repeat(2,1fr) !important; }
          div[style*="minmax(280px"] { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          div[style*="minmax(240px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
