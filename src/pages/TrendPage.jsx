import { useState, useCallback, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus, BarChart2, ChevronDown, ChevronUp,
         ExternalLink, Zap, Calendar, ArrowUp, ArrowDown, Minus as MinusIcon,
         FileText, RefreshCw } from 'lucide-react'
import { ArticleCard, ArticleCardSkeleton } from '../components/article/ArticleCard'
import { useArticles, useTrends, useNewsTrends, useWeeklyReports, useWeeklyTrends } from '../hooks/useData'
import { useNavigate } from 'react-router-dom'

// ── HOT SECTORS (정적 데이터) ──────────────────────────────────────
const SECTORS = [
  { name: 'AI / 머신러닝', note: '2026 가장 뜨거운 투자 분야', icon: '🤖', category: 'ai', color: '#818cf8' },
  { name: '에듀테크', note: '청소년 타깃 급성장 중', icon: '📱', category: 'edutech', color: '#34d399' },
  { name: '기후테크·그린', note: 'ESG 트렌드 + 탄소중립 수혜', icon: '🌿', category: 'climate', color: '#4ade80' },
  { name: 'B2B SaaS', note: '수익 모델 명확 → 투자자 선호', icon: '💼', category: 'saas', color: '#60a5fa' },
  { name: '헬스케어 AI', note: '디지털 헬스 규제 완화 효과', icon: '🏥', category: 'health', color: '#f472b6' },
  { name: '핀테크', note: '간편결제·BNPL 계속 성장', icon: '💰', category: 'fintech', color: '#fbbf24' },
]

const CATEGORY_COLORS = {
  'AI·테크': '#818cf8', '투자·금융': '#fbbf24', '창업·스타트업': '#f97316',
  '정책·지원': '#60a5fa', '글로벌': '#34d399', 'ESG·기후': '#4ade80',
  '핀테크': '#a78bfa', '에듀테크': '#fb923c', '헬스케어': '#f472b6', '기타': '#94a3b8',
}

// ── 마크다운 렌더러 ────────────────────────────────────────────────
function renderMd(text) {
  if (!text) return null
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: '6px' }} />
    if (line.startsWith('# ')) return (
      <h2 key={i} style={{ fontFamily:'var(--f-serif)', fontSize:'18px', fontWeight:700, margin:'16px 0 8px', color:'var(--c-paper)' }}>
        {line.slice(2)}
      </h2>
    )
    if (line.startsWith('## ')) return (
      <h3 key={i} style={{ fontFamily:'var(--f-serif)', fontSize:'15px', fontWeight:700, margin:'14px 0 6px', color:'var(--c-paper)' }}>
        {line.slice(3)}
      </h3>
    )
    if (line.startsWith('---')) return (
      <hr key={i} style={{ border:'none', borderTop:'1px solid var(--c-border)', margin:'12px 0' }} />
    )
    const parts = line.split(/\*\*([^*]+)\*\*/g)
    const isArrow = line.trim().startsWith('→')
    return (
      <p key={i} style={{
        margin: isArrow ? '4px 0' : '3px 0',
        lineHeight: 1.8, fontSize: '13px',
        color: isArrow ? 'var(--c-paper)' : 'var(--c-gray-7)',
        paddingLeft: isArrow ? '4px' : 0,
      }}>
        {parts.map((part, j) =>
          j % 2 === 1
            ? <strong key={j} style={{ color:'var(--c-paper)', fontWeight:700 }}>{part}</strong>
            : part
        )}
      </p>
    )
  })
}

// ── 키워드 뱃지 ───────────────────────────────────────────────────
function KeywordBadge({ word, count, category, rank, change, rising }) {
  const color = CATEGORY_COLORS[category] || '#94a3b8'
  const size = rank <= 3 ? 14 : rank <= 8 ? 13 : 12
  const opacity = rank <= 3 ? 1 : rank <= 8 ? 0.85 : 0.7
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      background: `${color}15`, border: `1px solid ${color}40`,
      padding: `${rank <= 3 ? '6px 12px' : '4px 10px'}`,
      margin: '3px',
      cursor: 'default', opacity,
    }}>
      {rank <= 3 && <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color, fontWeight:700 }}>#{rank}</span>}
      <span style={{ fontFamily:'var(--f-mono)', fontSize:`${size}px`, color, fontWeight: rank <= 3 ? 700 : 500 }}>
        {word}
      </span>
      <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-gray-5)' }}>
        {count}
      </span>
      {change && (
        <span style={{ fontSize:'10px', color: rising ? '#34d399' : '#f87171', fontFamily:'var(--f-mono)' }}>
          {rising ? '↑' : '↓'}{change}
        </span>
      )}
    </div>
  )
}

// ── 카테고리 바 차트 ────────────────────────────────────────────────
function CategoryBar({ categories, total }) {
  if (!categories || !total) return null
  const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const max = sorted[0]?.[1] || 1

  const catNames = {
    investment: '투자·금융', tech: '기술·AI', youth: '청소년', policy: '정책',
    startup: '창업', esg: 'ESG', fintech: '핀테크', edutech: '에듀테크',
    food: '식품', health: '헬스케어',
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
      {sorted.map(([cat, count]) => {
        const pct = Math.round(count/total*100)
        const width = Math.round(count/max*100)
        const color = CATEGORY_COLORS[catNames[cat]] || '#94a3b8'
        return (
          <div key={cat} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'70px', fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-muted)', flexShrink:0, textAlign:'right' }}>
              {catNames[cat] || cat}
            </div>
            <div style={{ flex:1, background:'var(--c-gray-2)', height:'8px' }}>
              <div style={{ width:`${width}%`, height:'100%', background:color, transition:'width 0.5s ease' }} />
            </div>
            <div style={{ width:'48px', fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-paper)' }}>
              {count}건 <span style={{ color:'var(--c-gray-5)' }}>{pct}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 주간 보고서 카드 ─────────────────────────────────────────────────
function WeeklyReportCard({ report, onSelect, selected }) {
  const ws = report.week_start?.slice(0, 10) || ''
  const we = report.week_end?.slice(0, 10) || ''
  const wsShort = ws.slice(5).replace('-', '/')
  const weShort = we.slice(5).replace('-', '/')

  let topCats = []
  try { topCats = Object.entries(JSON.parse(report.top_categories || '{}')).slice(0, 3) } catch {}

  const catNames = {
    investment: '투자', tech: 'AI·테크', youth: '청소년', policy: '정책',
    startup: '창업', esg: 'ESG', fintech: '핀테크', edutech: '에듀테크',
    food: '식품', health: '헬스케어',
  }

  return (
    <button
      onClick={() => onSelect(report)}
      style={{
        width: '100%', textAlign: 'left', padding: '18px 20px',
        background: selected ? 'var(--c-gray-2)' : 'var(--c-card)',
        border: selected ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
        cursor: 'pointer', transition: 'var(--t-fast)',
      }}
      onMouseEnter={e => { if (!selected) { e.currentTarget.style.borderColor='var(--c-gray-4)' } }}
      onMouseLeave={e => { if (!selected) { e.currentTarget.style.borderColor='var(--c-border)' } }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:'12px', color: selected ? 'var(--c-gold)' : 'var(--c-paper)', fontWeight:700 }}>
          {wsShort} ~ {weShort}
        </div>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-gray-5)' }}>
          {report.article_count}건
        </div>
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
        {topCats.map(([cat, count]) => (
          <span key={cat} style={{
            fontFamily:'var(--f-mono)', fontSize:'10px',
            background:'var(--c-gray-3)', color:'var(--c-gray-7)',
            padding:'2px 6px',
          }}>
            {catNames[cat] || cat} {count}
          </span>
        ))}
      </div>
    </button>
  )
}

// ── 주간 트렌드 패널 ─────────────────────────────────────────────────
function WeeklyTrendPanel({ trendData }) {
  if (!trendData) return null

  let keywords = []
  let rising = []
  let declining = []
  let categories = {}
  let hotTopics = []

  try { keywords = JSON.parse(trendData.keywords || '[]') } catch {}
  try { rising = JSON.parse(trendData.rising_keywords || '[]') } catch {}
  try { declining = JSON.parse(trendData.declining_keywords || '[]') } catch {}
  try { categories = JSON.parse(trendData.categories || '{}') } catch {}
  try { hotTopics = JSON.parse(trendData.hot_topics || '[]') } catch {}

  const ps = trendData.period_start?.slice(0, 10) || ''
  const pe = trendData.period_end?.slice(0, 10) || ''

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'24px' }}>

      {/* 기간 헤더 */}
      <div style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-gold)', letterSpacing:'1px' }}>
        📅 {ps} ~ {pe} · {trendData.total_articles}건 분석
      </div>

      {/* 키워드 클라우드 */}
      {keywords.length > 0 && (
        <div>
          <div className="t-eyebrow" style={{ marginBottom:'12px' }}>이번 주 핵심 키워드</div>
          <div style={{ lineHeight:2 }}>
            {keywords.slice(0, 25).map((k, i) => (
              <KeywordBadge key={i} word={k.word} count={k.count} category={k.category} rank={i+1} />
            ))}
          </div>
        </div>
      )}

      {/* 상승/하락 키워드 */}
      {(rising.length > 0 || declining.length > 0) && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'10px' }}>
              <ArrowUp size={12} color="#34d399" />
              <span className="t-eyebrow" style={{ color:'#34d399' }}>상승 키워드</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {rising.slice(0, 6).map((k, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ fontFamily:'var(--f-mono)', fontSize:'12px', color:'var(--c-paper)', flex:1 }}>{k.word}</span>
                  <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'#34d399', background:'#34d39915', padding:'1px 6px' }}>
                    {k.change}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'10px' }}>
              <ArrowDown size={12} color="#f87171" />
              <span className="t-eyebrow" style={{ color:'#f87171' }}>하락 키워드</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {declining.slice(0, 6).map((k, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ fontFamily:'var(--f-mono)', fontSize:'12px', color:'var(--c-paper)', flex:1 }}>{k.word}</span>
                  <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'#f87171', background:'#f8717115', padding:'1px 6px' }}>
                    {k.change}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 카테고리 분포 */}
      {Object.keys(categories).length > 0 && (
        <div>
          <div className="t-eyebrow" style={{ marginBottom:'12px' }}>분야별 분포</div>
          <CategoryBar categories={categories} total={trendData.total_articles} />
        </div>
      )}

      {/* 핫 토픽 */}
      {hotTopics.length > 0 && (
        <div>
          <div className="t-eyebrow" style={{ marginBottom:'12px' }}>이번 주 핫 토픽 TOP 5</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
            {hotTopics.slice(0, 5).map((t, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'var(--c-gray-1)', borderLeft:'3px solid var(--c-gold)' }}>
                <span style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-gold)', fontWeight:700, flexShrink:0 }}>
                  {i+1}
                </span>
                <span style={{ fontSize:'13px', color:'var(--c-paper)', flex:1, lineHeight:1.4 }}>{t.title}</span>
                <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-gray-5)', flexShrink:0 }}>{t.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 섹터 카드 ────────────────────────────────────────────────────────
function SectorCard({ sector }) {
  return (
    <div className="card" style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'10px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
        <span style={{ fontSize:'24px' }}>{sector.icon}</span>
        <div>
          <div style={{ fontFamily:'var(--f-serif)', fontSize:'15px', fontWeight:600, color:'var(--c-paper)' }}>
            {sector.name}
          </div>
          <div style={{ fontSize:'12px', color:'var(--c-muted)', marginTop:'2px' }}>{sector.note}</div>
        </div>
      </div>
      <div style={{
        height:'3px', background:`linear-gradient(90deg, ${sector.color}, ${sector.color}40)`,
        marginTop:'4px',
      }} />
    </div>
  )
}

// ── TREND PAGE ────────────────────────────────────────────────────────
export default function TrendPage() {
  const navigate = useNavigate()
  const [selectedReport, setSelectedReport] = useState(null)
  const [selectedTrend, setSelectedTrend] = useState(null)
  const [reportTab, setReportTab] = useState('trend')  // 'trend' | 'report'

  const { data: trendArticles = [], isLoading: articlesLoading } = useArticles({ category:'trend', limit:6 })
  const { data: weeklyReports = [], isLoading: reportsLoading } = useWeeklyReports(12)
  const { data: weeklyTrends = [], isLoading: trendsLoading } = useWeeklyTrends(8)

  // 최신 트렌드 자동 선택
  useEffect(() => {
    if (weeklyTrends.length > 0 && !selectedTrend) {
      setSelectedTrend(weeklyTrends[0])
    }
  }, [weeklyTrends])

  useEffect(() => {
    if (weeklyReports.length > 0 && !selectedReport) {
      setSelectedReport(weeklyReports[0])
    }
  }, [weeklyReports])

  const noData = weeklyTrends.length === 0 && weeklyReports.length === 0

  return (
    <div style={{ paddingBottom:'80px' }}>

      {/* 헤더 */}
      <div style={{ padding:'32px 0 20px', borderBottom:'1px solid var(--c-border)' }}>
        <div className="t-eyebrow" style={{ marginBottom:'8px' }}>TREND TRACKER</div>
        <h1 style={{ fontFamily:'var(--f-serif)', fontSize:'clamp(24px,4vw,34px)', fontWeight:700, marginBottom:'8px', lineHeight:1.2 }}>
          창업 트렌드 트래커
        </h1>
        <p style={{ color:'var(--c-muted)', fontSize:'14px', lineHeight:1.7, maxWidth:'600px' }}>
          한국 스타트업 생태계의 주간 흐름을 분석합니다.
          매주 수백 건의 뉴스에서 키워드·트렌드·핫 토픽을 자동 추출합니다.
        </p>
      </div>

      <div style={{ marginTop:'36px', display:'flex', flexDirection:'column', gap:'48px' }}>

        {/* HOT SECTORS */}
        <section>
          <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:'16px', paddingBottom:'12px', borderBottom:'1px solid var(--c-border)' }}>
            <div className="t-eyebrow">HOT SECTORS · 2026</div>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-gray-5)' }}>AI 분석 기반</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:'2px', background:'var(--c-border)', border:'1px solid var(--c-border)' }}>
            {SECTORS.map((s, i) => (
              <div key={i} style={{ background:'var(--c-card)' }}>
                <SectorCard sector={s} />
              </div>
            ))}
          </div>
        </section>

        {/* 주간 트렌드 분석 */}
        <section>
          {/* 탭 */}
          <div style={{ display:'flex', borderBottom:'1px solid var(--c-border)', marginBottom:'24px' }}>
            {[
              { id:'trend', label:'📈 주간 키워드 트렌드', icon:null },
              { id:'report', label:'📋 주간 보고서', icon:null },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setReportTab(tab.id)}
                style={{
                  padding:'10px 20px', background:'none', border:'none',
                  borderBottom: reportTab === tab.id ? '2px solid var(--c-gold)' : '2px solid transparent',
                  color: reportTab === tab.id ? 'var(--c-gold)' : 'var(--c-muted)',
                  fontFamily:'var(--f-mono)', fontSize:'12px', cursor:'pointer',
                  letterSpacing:'0.5px', transition:'var(--t-fast)',
                  marginBottom:'-1px',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 트렌드 탭 */}
          {reportTab === 'trend' && (
            <>
              {trendsLoading ? (
                <div style={{ padding:'40px', textAlign:'center', color:'var(--c-muted)' }}>
                  <RefreshCw size={20} style={{ animation:'spin 1s linear infinite' }} />
                  <div style={{ marginTop:'10px', fontFamily:'var(--f-mono)', fontSize:'12px' }}>트렌드 데이터 로딩 중...</div>
                </div>
              ) : weeklyTrends.length === 0 ? (
                <div style={{ padding:'60px 20px', textAlign:'center', border:'1px dashed var(--c-gray-3)' }}>
                  <div style={{ fontSize:'40px', marginBottom:'14px' }}>📊</div>
                  <div style={{ fontFamily:'var(--f-serif)', fontSize:'17px', color:'var(--c-paper)', marginBottom:'8px' }}>
                    주간 트렌드 데이터 준비 중
                  </div>
                  <div style={{ fontSize:'13px', color:'var(--c-muted)', lineHeight:1.7, maxWidth:'380px', margin:'0 auto' }}>
                    매주 월요일 자동으로 지난 주 뉴스를 분석하여<br/>
                    키워드 트렌드, 상승/하락 키워드, 핫 토픽을 생성합니다.
                  </div>
                  <div style={{ marginTop:'20px', fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-gray-5)', padding:'10px 16px', background:'var(--c-gray-1)', display:'inline-block' }}>
                    ⚡ 첫 번째 트렌드 데이터는 다음 월요일에 생성됩니다
                  </div>
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:'2px', background:'var(--c-border)' }}>
                  {/* 주차 선택 */}
                  <div style={{ background:'var(--c-card)', display:'flex', flexDirection:'column', gap:'1px', background:'var(--c-border)' }}>
                    {weeklyTrends.map((t, i) => {
                      const ps = t.period_start?.slice(5).replace('-', '/') || ''
                      const pe = t.period_end?.slice(5).replace('-', '/') || ''
                      const sel = selectedTrend?.id === t.id
                      return (
                        <button key={i} onClick={() => setSelectedTrend(t)} style={{
                          padding:'14px 16px', background: sel ? 'var(--c-gray-2)' : 'var(--c-card)',
                          border:'none', borderLeft: sel ? '3px solid var(--c-gold)' : '3px solid transparent',
                          cursor:'pointer', textAlign:'left', transition:'var(--t-fast)',
                        }}>
                          <div style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color: sel ? 'var(--c-gold)' : 'var(--c-paper)', fontWeight: sel ? 700 : 400 }}>
                            {ps} ~ {pe}
                          </div>
                          <div style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-gray-5)', marginTop:'3px' }}>
                            {t.total_articles}건
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* 트렌드 상세 */}
                  <div style={{ background:'var(--c-card)', padding:'24px' }}>
                    {selectedTrend
                      ? <WeeklyTrendPanel trendData={selectedTrend} />
                      : <div style={{ color:'var(--c-muted)', fontFamily:'var(--f-mono)', fontSize:'12px' }}>주차를 선택해주세요</div>
                    }
                  </div>
                </div>
              )}
            </>
          )}

          {/* 보고서 탭 */}
          {reportTab === 'report' && (
            <>
              {reportsLoading ? (
                <div style={{ padding:'40px', textAlign:'center', color:'var(--c-muted)' }}>
                  <RefreshCw size={20} style={{ animation:'spin 1s linear infinite' }} />
                  <div style={{ marginTop:'10px', fontFamily:'var(--f-mono)', fontSize:'12px' }}>보고서 로딩 중...</div>
                </div>
              ) : weeklyReports.length === 0 ? (
                <div style={{ padding:'60px 20px', textAlign:'center', border:'1px dashed var(--c-gray-3)' }}>
                  <div style={{ fontSize:'40px', marginBottom:'14px' }}>📋</div>
                  <div style={{ fontFamily:'var(--f-serif)', fontSize:'17px', color:'var(--c-paper)', marginBottom:'8px' }}>
                    주간 보고서 없음
                  </div>
                  <div style={{ fontSize:'13px', color:'var(--c-muted)', lineHeight:1.7, maxWidth:'400px', margin:'0 auto' }}>
                    주간 보고서는 매주 월요일 자동 생성됩니다.<br/>
                    지난 7일간의 뉴스를 분석한 인사이트 요약입니다.<br/><br/>
                    <strong style={{ color:'var(--c-paper)' }}>4월 이전 보고서가 없는 이유:</strong><br/>
                    주간 보고서 시스템이 2026년 4월에 새로 구축되었습니다.
                  </div>
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:'2px', background:'var(--c-border)' }}>
                  {/* 보고서 목록 */}
                  <div style={{ display:'flex', flexDirection:'column', gap:'1px', background:'var(--c-border)' }}>
                    {weeklyReports.map((r, i) => (
                      <WeeklyReportCard
                        key={i} report={r}
                        onSelect={setSelectedReport}
                        selected={selectedReport?.id === r.id}
                      />
                    ))}
                  </div>

                  {/* 보고서 본문 */}
                  <div style={{ background:'var(--c-card)', padding:'28px', maxHeight:'600px', overflowY:'auto' }}>
                    {selectedReport ? (
                      <div>
                        {renderMd(selectedReport.summary_markdown)}
                      </div>
                    ) : (
                      <div style={{ color:'var(--c-muted)', fontFamily:'var(--f-mono)', fontSize:'12px' }}>
                        보고서를 선택해주세요
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* 트렌드 뉴스 (기존 기사 기반) */}
        <section>
          <div style={{ marginBottom:'16px', paddingBottom:'12px', borderBottom:'1px solid var(--c-border)' }}>
            <div className="t-eyebrow" style={{ marginBottom:'4px' }}>TREND ARTICLES</div>
            <div style={{ fontSize:'12px', color:'var(--c-muted)', fontFamily:'var(--f-mono)' }}>
              AI가 선별한 트렌드 관련 뉴스
            </div>
          </div>
          {articlesLoading ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'2px', background:'var(--c-border)', border:'1px solid var(--c-border)' }}>
              {[0,1,2].map(i => <ArticleCardSkeleton key={i} />)}
            </div>
          ) : trendArticles.length > 0 ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'2px', background:'var(--c-border)', border:'1px solid var(--c-border)' }}>
              {trendArticles.map(a => (
                <ArticleCard key={a.id} article={a} onClick={() => navigate(`/article/${a.slug}`)} />
              ))}
            </div>
          ) : (
            <div style={{ padding:'48px 20px', textAlign:'center', border:'1px dashed var(--c-gray-3)', color:'var(--c-muted)' }}>
              <div style={{ fontSize:'28px', marginBottom:'10px' }}>📝</div>
              <div style={{ fontFamily:'var(--f-serif)', fontSize:'15px', color:'var(--c-paper)', marginBottom:'4px' }}>
                트렌드 아티클 준비 중
              </div>
              <div style={{ fontSize:'13px' }}>관련 뉴스가 분류되면 여기에 표시됩니다.</div>
            </div>
          )}
        </section>

      </div>

      <style>{`
        @keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        @media (max-width: 768px) {
          div[style*="gridTemplateColumns: '200px 1fr'"],
          div[style*="200px 1fr"] { 
            grid-template-columns: 1fr !important;
          }
          div[style*="220px 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
