import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { ArticleCard, ArticleCardSkeleton } from '../components/article/ArticleCard'
import { useArticles, useTrends } from '../hooks/useData'

const SECTORS = [
  { name:'AI / 머신러닝', pct:88 }, { name:'에듀테크', pct:72 },
  { name:'기후테크', pct:65 }, { name:'B2B SaaS', pct:58 },
  { name:'헬스케어', pct:45 }, { name:'핀테크', pct:38 },
]
const KEYWORDS = [
  { word:'AI 창업', count:2847 }, { word:'청소년 투자', count:1923 },
  { word:'에듀테크', count:1645 }, { word:'제로 캐피탈', count:1234 },
  { word:'임팩트 투자', count:987 }, { word:'소셜벤처', count:876 },
]

function StatCard({ label, value, unit, change }) {
  const up = change > 0
  const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus
  const color = change > 0 ? 'var(--c-green)' : change < 0 ? 'var(--c-red)' : 'var(--c-muted)'
  return (
    <div style={{ background:'var(--c-card)', padding:'28px', border:'1px solid var(--c-border)' }}>
      <div className="t-caption" style={{ letterSpacing:'2px', marginBottom:'8px' }}>{label}</div>
      <div style={{ fontFamily:'var(--f-serif)', fontSize:'30px', fontWeight:700, marginBottom:'4px' }}>
        {unit==='억원'?'₩':''}{Number(value).toLocaleString()}{unit!=='억원'?unit:'억'}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:'4px', fontFamily:'var(--f-mono)', fontSize:'11px', color }}>
        <Icon size={12}/> {Math.abs(change).toFixed(1)}% YoY
      </div>
    </div>
  )
}

export default function TrendPage() {
  const { data: trends = [] } = useTrends()
  const { data: articles = [], isLoading } = useArticles({ category:'trend', limit:6 })

  const STATS = trends.length > 0 ? trends.map(t=>({ label:t.metric_name, value:t.metric_value, unit:t.metric_unit, change:t.change_pct||0 })) : [
    { label:'신규 법인 설립 (월)', value:3847, unit:'개', change:12.4 },
    { label:'VC 투자 (월, 억원)', value:2341, unit:'억원', change:-3.2 },
    { label:'청소년 창업자 수', value:1127, unit:'명', change:67.3 },
    { label:'창업 동아리 수 (전국)', value:892, unit:'개', change:44.1 },
  ]

  return (
    <div style={{ paddingBottom:'64px' }}>
      <div style={{ padding:'40px 0 24px' }}>
        <div className="t-eyebrow" style={{ marginBottom:'8px' }}>TREND TRACKER</div>
        <h1 style={{ fontFamily:'var(--f-serif)', fontSize:'34px', fontWeight:700, marginBottom:'8px' }}>창업 트렌드 트래커</h1>
        <p style={{ color:'var(--c-muted)', fontSize:'14px', maxWidth:'560px' }}>한국 스타트업 생태계의 현재와 미래를 데이터로 추적합니다. 매주 업데이트.</p>
      </div>

      {/* Stat Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'2px', background:'var(--c-border)', border:'1px solid var(--c-border)', marginBottom:'2px' }}>
        {STATS.map((s,i)=><StatCard key={i} {...s}/>)}
      </div>

      {/* Sector + Keywords */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'2px', background:'var(--c-border)', border:'1px solid var(--c-border)', marginBottom:'36px' }}>
        <div style={{ background:'var(--c-card)', padding:'32px' }}>
          <div className="t-eyebrow" style={{ marginBottom:'20px' }}>HOT SECTORS · 2026 Q1</div>
          {SECTORS.map(s=>(
            <div key={s.name} style={{ marginBottom:'14px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'4px' }}>
                <span>{s.name}</span>
                <span style={{ fontFamily:'var(--f-mono)', color:'var(--c-gold)' }}>{s.pct}%</span>
              </div>
              <div style={{ height:'4px', background:'var(--c-cream)', borderRadius:'2px' }}>
                <div style={{ height:'100%', width:`${s.pct}%`, background:'var(--c-gold)', borderRadius:'2px', transition:'width 1s ease' }}/>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background:'var(--c-card)', padding:'32px' }}>
          <div className="t-eyebrow" style={{ marginBottom:'20px' }}>TOP KEYWORDS</div>
          {KEYWORDS.map((k,i)=>(
            <div key={k.word} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--c-border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <span style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-border)' }}>{String(i+1).padStart(2,'0')}</span>
                <span style={{ fontSize:'13px', fontWeight:500 }}>{k.word}</span>
              </div>
              <span style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-muted)' }}>{k.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Trend Articles */}
      <div className="section-header">
        <div className="section-title">트렌드 리포트</div>
      </div>
      {isLoading ? (
        <div className="grid-3 grid-bordered">{[0,1,2].map(i=><ArticleCardSkeleton key={i}/>)}</div>
      ) : articles.length > 0 ? (
        <div className="grid-3 grid-bordered">{articles.map(a=><ArticleCard key={a.id} article={a}/>)}</div>
      ) : (
        <div style={{ textAlign:'center', padding:'60px 0', color:'var(--c-muted)' }}>
          <div style={{ fontSize:'36px', marginBottom:'12px' }}>📊</div>
          <div>트렌드 리포트가 곧 공개됩니다</div>
        </div>
      )}

      <style>{`@media(max-width:900px){div[style*="repeat(4,1fr)"]{grid-template-columns:repeat(2,1fr)!important}div[style*="2fr 1fr"]{grid-template-columns:1fr!important}}`}</style>
    </div>
  )
}
