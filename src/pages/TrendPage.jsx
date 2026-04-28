import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Minus, BarChart2, Zap, RefreshCw,
  ChevronRight, Flame, Globe, BrainCircuit, BookOpen, ArrowUpRight,
  Calendar, Activity, Star, Sparkles, Target, Cpu, DollarSign,
  Users, Leaf, GraduationCap, Clock
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

const SECTORS = [
  { id:'ai_startup',  label:'AI 스타트업', color:'#A855F7', emoji:'🤖', icon:Cpu },
  { id:'edutech',     label:'에듀테크',     color:'#F97316', emoji:'📚', icon:GraduationCap },
  { id:'fintech',     label:'핀테크',       color:'#22C55E', emoji:'💳', icon:DollarSign },
  { id:'social',      label:'소셜임팩트',   color:'#06B6D4', emoji:'🌱', icon:Users },
  { id:'youth',       label:'청소년 창업',  color:'#F43F5E', emoji:'🚀', icon:Target },
  { id:'climate',     label:'기후테크',     color:'#10B981', emoji:'🌍', icon:Leaf },
]

/* ── Skeleton ──────────────────────────────────────── */
function Sk({ h=16, w='100%', r=6 }) {
  return <div style={{ height:h, width:w, background:'var(--bg3)',
    borderRadius:r, animation:'skPulse 1.6s ease-in-out infinite' }}/>
}

/* ── SVG Sparkline ─────────────────────────────────── */
function Sparkline({ pct, color }) {
  const base = [0.28,0.42,0.38,0.51,0.47,0.62,0.55,0.7,0.65,Math.min(Math.abs(pct||0)/100+0.45,1)]
  const h = 32, w = 100
  const points = base.map((v,i) => `${(i/(base.length-1))*w},${h*(1-v)}`).join(' ')
  const uid = `g${Math.abs(pct||0).toFixed(0)}_${color.replace('#','')}`
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${points} ${w},${h}`}
        fill={`url(#${uid})`}/>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={(base.length-1)/(base.length-1)*w}
        cy={h*(1-base[base.length-1])} r="2.5" fill={color}/>
    </svg>
  )
}

/* ── Snapshot card ─────────────────────────────────── */
function SnapCard({ snap, index }) {
  const [hov, setHov] = useState(false)
  if (!snap) return null
  const up = (snap.change_pct||0) > 0
  const down = (snap.change_pct||0) < 0
  const color = up ? '#22C55E' : down ? '#F43F5E' : '#666'
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus
  // category matching — DB stores Korean categories, SECTORS use English ids
  const sec = SECTORS.find(s=>
    s.id===snap.category ||
    snap.category?.includes(s.label) ||
    snap.metric_name?.includes(s.label)
  ) || SECTORS[index % SECTORS.length]
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ padding:'18px 20px', background:'var(--bg2)',
        border:`1px solid ${hov?sec.color+'45':'var(--b1)'}`,
        borderRadius:14, transition:'all .22s cubic-bezier(.4,0,.2,1)',
        transform:hov?'translateY(-4px)':'none',
        boxShadow:hov?`0 12px 40px rgba(0,0,0,.6),0 0 0 1px ${sec.color}22`:'none',
        animationDelay:`${index*60}ms`, position:'relative', overflow:'hidden' }}>
      {hov && <div style={{ position:'absolute', top:-30, right:-30, width:100, height:100,
        borderRadius:'50%', background:`radial-gradient(circle,${sec.color}12,transparent 70%)`,
        pointerEvents:'none' }}/>}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
            <span style={{ fontSize:17 }}>{sec.emoji}</span>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:sec.color,
              letterSpacing:'.1em', textTransform:'uppercase' }}>{sec.label}</span>
          </div>
          <div style={{ fontSize:11, color:'var(--t3)', marginBottom:4 }}>{snap.metric_name}</div>
          <div style={{ fontFamily:'var(--f-display)', fontSize:26, fontWeight:800,
            color:'var(--t1)', lineHeight:1, letterSpacing:'-.025em' }}>
            {snap.metric_unit==='억원'?'₩':''}{Number(snap.metric_value||snap.value||0).toLocaleString()}
            <span style={{ fontSize:13, color:'var(--t3)', fontWeight:400, marginLeft:4 }}>
              {snap.metric_unit==='억원'?'억':snap.metric_unit||snap.unit||'건'}
            </span>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 9px',
          borderRadius:7, background:`${color}12`, border:`1px solid ${color}28`,
          fontFamily:'var(--f-mono)', fontSize:11, color, fontWeight:700 }}>
          <Icon size={11}/>{Math.abs(snap.change_pct||0).toFixed(1)}%
        </div>
      </div>
      <Sparkline pct={snap.change_pct||0} color={sec.color}/>
    </div>
  )
}

/* ── Weekly report card ────────────────────────────── */
function WeeklyCard({ rep }) {
  const navigate = useNavigate()
  const [hov, setHov] = useState(false)
  if (!rep) return null
  return (
    <div onClick={()=>navigate(`/article/${rep.slug||rep.id}`)}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ padding:'18px 20px', background:'var(--bg2)',
        border:`1px solid ${hov?'rgba(59,130,246,0.35)':'var(--b1)'}`,
        borderRadius:12, cursor:'pointer', transition:'all .22s cubic-bezier(.4,0,.2,1)',
        transform:hov?'translateY(-3px)':'none',
        boxShadow:hov?'0 10px 36px rgba(0,0,0,.55)':'none',
        display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
        <div style={{ width:33, height:33, borderRadius:9,
          background:'rgba(59,130,246,0.12)', border:'1px solid rgba(59,130,246,0.22)',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <BookOpen size={14} color="#3B82F6"/>
        </div>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#3B82F6',
          letterSpacing:'.1em' }}>WEEKLY REPORT</div>
      </div>
      <div style={{ fontSize:14, fontWeight:700, color:'var(--t1)', lineHeight:1.42,
        display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
        {rep.title}
      </div>
      <div style={{ fontSize:12, color:'var(--t3)', lineHeight:1.65,
        display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
        {rep.excerpt}
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}>
          {rep.published_at?format(new Date(rep.published_at),'M월 d일',{locale:ko}):
           rep.week_start?format(new Date(rep.week_start),'M월 d일',{locale:ko}):''}
        </span>
        <div style={{ display:'flex', alignItems:'center', gap:4,
          color:hov?'#3B82F6':'var(--t4)', fontSize:12, transition:'color .15s' }}>
          읽기 <ArrowUpRight size={11}/>
        </div>
      </div>
    </div>
  )
}

/* ── Keyword badge ─────────────────────────────────── */
function KwBadge({ kw, rank }) {
  const colors = ['#3B82F6','#A855F7','#22C55E','#F59E0B','#F43F5E','#06B6D4','#F97316','#818CF8']
  const c = colors[rank%colors.length]
  const isTop = rank<3
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5,
      padding:`${isTop?'6px 14px':'4px 11px'}`,
      background:`${c}10`, border:`1px solid ${c}28`,
      borderRadius:20, fontSize:isTop?14:12, color:c,
      fontFamily:'var(--f-sans)', fontWeight:isTop?700:500,
      cursor:'default', transition:'all .18s' }}
      onMouseEnter={e=>{ e.currentTarget.style.background=`${c}20`; e.currentTarget.style.transform='scale(1.06)'; e.currentTarget.style.boxShadow=`0 4px 14px ${c}30` }}
      onMouseLeave={e=>{ e.currentTarget.style.background=`${c}10`; e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>
      {isTop&&<span style={{ fontFamily:'var(--f-mono)', fontSize:8, opacity:.7 }}>#{rank+1}</span>}
      {kw}
      {isTop&&<Flame size={10} color={c}/>}
    </span>
  )
}

/* ── Safe trend hooks (no missing table crash) ─────── */
function useTrendSnapshots() {
  return useQuery({
    queryKey: ['trend_snapshots_page'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('trend_snapshots')
          .select('*')
          .order('snapshot_date', { ascending: false })
          .order('metric_value', { ascending: false })
          .limit(30)
        if (error) return []
        return data || []
      } catch { return [] }
    },
    staleTime: 30 * 60 * 1000,
    retry: false,
  })
}

function useWeeklyArticles(limit = 6) {
  return useQuery({
    queryKey: ['weekly_articles', limit],
    queryFn: async () => {
      try {
        // Try weekly_reports table first
        const { data: wr, error: wrErr } = await supabase
          .from('weekly_reports')
          .select('*')
          .order('week_start', { ascending: false })
          .limit(limit)
        if (!wrErr && wr?.length) return wr

        // Fallback: articles with AI 리포트 tag
        const { data: arts, error: artsErr } = await supabase
          .from('articles')
          .select('id,title,slug,excerpt,published_at,category,tags')
          .eq('status', 'published')
          .or('category.eq.trend,tags.cs.{AI리포트}')
          .order('published_at', { ascending: false })
          .limit(limit)
        if (!artsErr && arts?.length) return arts
        return []
      } catch { return [] }
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
}

function useWeeklyTrendsSafe() {
  return useQuery({
    queryKey: ['weekly_trends_safe'],
    queryFn: async () => {
      try {
        // Try weekly_trends table first
        const { data: wt, error: wtErr } = await supabase
          .from('weekly_trends')
          .select('keyword, rank, week_code')
          .order('week_code', { ascending: false })
          .order('rank', { ascending: true })
          .limit(10)
        if (!wtErr && wt?.length) {
          // Get latest week's keywords
          const latestWeek = wt[0].week_code
          const seen = new Set()
          return wt
            .filter(t => t.week_code === latestWeek)
            .filter(t => {
              const key = (t.keyword||'').toLowerCase()
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            .map(t => t.keyword)
            .slice(0, 5)
        }
        // Fallback: deduplicated metric_names from trend_snapshots
        const { data, error } = await supabase
          .from('trend_snapshots')
          .select('metric_name, metric_value, category, snapshot_date')
          .order('snapshot_date', { ascending: false })
          .order('metric_value', { ascending: false })
          .limit(20)
        if (error || !data?.length) return []
        const seen2 = new Set()
        return data
          .map(d => d.metric_name)
          .filter(n => {
            if (!n) return false
            const key = n.trim().toLowerCase()
            if (seen2.has(key)) return false
            seen2.add(key)
            return true
          })
          .slice(0, 5)
      } catch { return [] }
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
}

function useHotKeywords() {
  return useQuery({
    queryKey: ['hot_keywords_trend'],
    queryFn: async () => {
      try {
        // Try trend_keywords table first (dedicated keyword table)
        const { data: kw, error: kwErr } = await supabase
          .from('trend_keywords')
          .select('keyword, count')
          .order('count', { ascending: false })
          .limit(30)
        if (!kwErr && kw?.length) {
          // deduplicate by keyword string
          const seen = new Set()
          return kw.filter(k => {
            const key = (k.keyword||'').trim().toLowerCase()
            if (!key || seen.has(key)) return false
            seen.add(key)
            return true
          }).map(k => k.keyword).slice(0, 20)
        }
        // Fallback: metric_name from trend_snapshots, deduplicated
        const { data, error } = await supabase
          .from('trend_snapshots')
          .select('metric_name, metric_value, category')
          .order('metric_value', { ascending: false })
          .limit(40)
        if (error || !data?.length) return []
        const seen2 = new Set()
        return data
          .map(d => d.metric_name)
          .filter(n => {
            if (!n) return false
            const key = n.trim().toLowerCase()
            if (seen2.has(key)) return false
            seen2.add(key)
            return true
          })
          .slice(0, 20)
      } catch { return [] }
    },
    staleTime: 30 * 60 * 1000,
    retry: false,
  })
}

/* ── Main ─────────────────────────────────────────── */
export default function TrendPage() {
  const navigate = useNavigate()
  const [activeSector, setActiveSector] = useState('all')
  const [tab, setTab] = useState('indicators')

  const { data:snaps=[], isLoading:snapLoading } = useTrendSnapshots()
  const { data:wReports=[], isLoading:wRepLoading } = useWeeklyArticles(6)
  const { data:wTrends=[], isLoading:wTrendLoading } = useWeeklyTrendsSafe()
  const { data:hotKw=[], isLoading:kwLoading } = useHotKeywords()

  const filteredSnaps = activeSector==='all'
    ? snaps
    : snaps.filter(s=>{
        const sec = SECTORS.find(x=>x.id===activeSector)
        return s.category===activeSector ||
          s.category?.includes(sec?.label||'') ||
          s.metric_name?.includes(sec?.label||'')
      })

  return (
    <div style={{ maxWidth:'var(--max-w)', margin:'0 auto',
      padding:'0 var(--pad-x)', paddingBottom:80 }}>
      <Helmet>
        <title>트렌드 트래커 | Insightship — 청소년 창업 트렌드 분석</title>
        <meta name="description" content="AI·스타트업·에듀테크·핀테크 최신 트렌드와 시장 지표를 실시간으로 추적합니다. 청소년 창업가를 위한 인사이트."/>
        <meta property="og:title" content="트렌드 트래커 | Insightship"/>
        <meta property="og:description" content="창업 트렌드·시장 지표·주간 리포트를 한눈에 확인하세요"/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://insightship.vercel.app/trend"/>
        <meta name="twitter:card" content="summary"/>
        <meta name="twitter:title" content="트렌드 트래커 | Insightship"/>
        <meta name="twitter:description" content="청소년 창업가를 위한 최신 스타트업·AI 트렌드 분석"/>
        <link rel="canonical" href="https://insightship.vercel.app/trend"/>
      </Helmet>

      {/* ── PAGE HEADER ── */}
      <div style={{ padding:'36px 0 24px', borderBottom:'1px solid var(--b1)', marginBottom:32 }}>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between',
          gap:16, flexWrap:'wrap' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <div style={{ width:3, height:18, background:'linear-gradient(to bottom,#F59E0B,#D97706)',
                borderRadius:2 }}/>
              <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#F59E0B',
                letterSpacing:'.16em' }}>INSIGHTSHIP · TREND TRACKER</span>
              <span style={{ display:'flex', alignItems:'center', gap:3, fontSize:9,
                padding:'2px 7px', borderRadius:4, background:'rgba(34,197,94,0.1)',
                border:'1px solid rgba(34,197,94,0.25)', color:'#22C55E',
                fontFamily:'var(--f-mono)', fontWeight:700 }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:'#22C55E',
                  animation:'pulse 2s ease-in-out infinite', display:'inline-block' }}/>LIVE
              </span>
            </div>
            <h1 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(26px,4vw,38px)',
              fontWeight:900, color:'var(--t1)', lineHeight:1.1, marginBottom:8,
              letterSpacing:'-.03em' }}>트렌드 트래커</h1>
            <p style={{ fontSize:14, color:'var(--t2)', lineHeight:1.65, maxWidth:520 }}>
              청소년 창업 생태계의 실시간 시장 지표와 주간 인사이트를 한눈에.
            </p>
          </div>
          <div className="trend-stats" style={{ display:'flex', gap:12 }}>
            {[
              { label:'추적 지표', val:snaps.length+'개', color:'#F59E0B' },
              { label:'주간 리포트', val:(wReports?.length||0)+'개', color:'#3B82F6' },
              { label:'키워드', val:(hotKw?.length||0)+'개', color:'#A855F7' },
            ].map(s=>(
              <div key={s.label} style={{ padding:'12px 16px', background:'var(--bg2)',
                border:'1px solid var(--b1)', borderRadius:10, textAlign:'center' }}>
                <div style={{ fontFamily:'var(--f-display)', fontSize:20, fontWeight:800,
                  color:s.color, lineHeight:1 }}>{s.val}</div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)',
                  marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SECTOR FILTER ── */}
      <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4,
        marginBottom:28, scrollbarWidth:'none' }}>
        <button onClick={()=>setActiveSector('all')}
          style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
            background:activeSector==='all'?'var(--t1)':'var(--bg2)',
            border:`1px solid ${activeSector==='all'?'var(--t1)':'var(--b1)'}`,
            borderRadius:20, color:activeSector==='all'?'#000':'var(--t2)',
            fontSize:12, fontFamily:'var(--f-sans)', fontWeight:activeSector==='all'?700:400,
            cursor:'pointer', whiteSpace:'nowrap', transition:'all .18s', flexShrink:0 }}>
          📊 전체
        </button>
        {SECTORS.map(s=>(
          <button key={s.id} onClick={()=>setActiveSector(s.id)}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
              background:activeSector===s.id?s.color:'var(--bg2)',
              border:`1px solid ${activeSector===s.id?s.color:'var(--b1)'}`,
              borderRadius:20, color:activeSector===s.id?'#000':'var(--t2)',
              fontSize:12, fontFamily:'var(--f-sans)', fontWeight:activeSector===s.id?700:400,
              cursor:'pointer', whiteSpace:'nowrap', transition:'all .18s', flexShrink:0,
              boxShadow:activeSector===s.id?`0 4px 14px ${s.color}35`:'none' }}>
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      {/* ── MARKET INDICATORS GRID ── */}
      <div style={{ marginBottom:48 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:18 }}>
          <Activity size={16} color="#F59E0B"/>
          <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'#F59E0B',
            letterSpacing:'.1em', textTransform:'uppercase' }}>시장 지표</span>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6,
            fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)' }}>
            <Clock size={10}/>
            {snaps?.[0]?.snapshot_date
              ? `업데이트: ${format(new Date(snaps[0].snapshot_date),'M.d HH:mm',{locale:ko})}`
              : '자동 업데이트'}
          </div>
        </div>
        {snapLoading ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
            {Array(6).fill(0).map((_,i)=>(
              <div key={i} style={{ padding:18, background:'var(--bg2)',
                border:'1px solid var(--b1)', borderRadius:14,
                display:'flex', flexDirection:'column', gap:10 }}>
                <Sk h={10} w="50%" r={4}/><Sk h={11} w="70%" r={4}/>
                <Sk h={30} w="60%" r={6}/><Sk h={32} r={4}/>
              </div>
            ))}
          </div>
        ) : filteredSnaps.length===0 ? (
          <div style={{ textAlign:'center', padding:'64px 20px', color:'var(--t3)' }}>
            <BarChart2 size={52} style={{ marginBottom:16, opacity:.22 }}/>
            <div style={{ fontSize:15 }}>지표 데이터를 수집 중입니다...</div>
            <div style={{ fontSize:12, marginTop:6 }}>뉴스 파이프라인이 실행되면 자동으로 표시됩니다.</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
            {filteredSnaps.map((s,i)=><SnapCard key={s.id||i} snap={s} index={i}/>)}
          </div>
        )}
      </div>

      {/* ── 2-col: keywords + weekly trends ── */}
      <div className="trend-2col" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:28, marginBottom:48 }}>

        {/* Hot keywords */}
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:18 }}>
            <Flame size={15} color="#F43F5E"/>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'#F43F5E',
              letterSpacing:'.1em' }}>HOT KEYWORDS</span>
          </div>
          <div style={{ padding:'24px', background:'var(--bg2)', border:'1px solid var(--b1)',
            borderRadius:14, minHeight:180 }}>
            {kwLoading ? (
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {Array(14).fill(0).map((_,i)=><Sk key={i} h={30} w={`${55+i*8}px`} r={20}/>)}
              </div>
            ) : hotKw.length===0 ? (
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {['AI 스타트업','청소년 창업','투자 유치','에듀테크','핀테크',
                  '그린테크','유니콘','시리즈A','해커톤','MVP','린스타트업',
                  'SaaS','B2B','소셜임팩트'].map((kw,i)=>(
                  <KwBadge key={i} kw={kw} rank={i}/>
                ))}
              </div>
            ) : (
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {hotKw.slice(0,20).map((kw,i)=>(
                  <KwBadge key={i} kw={typeof kw==='string'?kw:kw.keyword||kw} rank={i}/>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Weekly trends */}
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:18 }}>
            <TrendingUp size={15} color="#22C55E"/>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'#22C55E',
              letterSpacing:'.1em' }}>WEEKLY TRENDS</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
            {wTrendLoading
              ? Array(5).fill(0).map((_,i)=>(
                  <div key={i} style={{ padding:'14px 16px', background:'var(--bg2)',
                    border:'1px solid var(--b1)', borderRadius:11,
                    display:'flex', flexDirection:'column', gap:6 }}>
                    <Sk h={10} w="60%" r={4}/><Sk h={14} r={4}/>
                  </div>
                ))
              : (wTrends?.length ? wTrends : [
                  'AI 스타트업 급성장','에듀테크 투자 확대',
                  '청소년 창업 지원 정책 강화','기후테크 주목','핀테크 규제 완화'
                ]).slice(0,5).map((wt,i)=>{
              const colors = ['#3B82F6','#A855F7','#22C55E','#F59E0B','#F43F5E']
              const c = colors[i%5]
              const label = typeof wt==='string'?wt:wt.keyword||wt.title||wt.metric_name
              return (
                <div key={i} style={{ padding:'14px 16px', background:'var(--bg2)',
                  border:'1px solid var(--b1)', borderRadius:11,
                  display:'flex', alignItems:'center', gap:12,
                  transition:'all .18s', cursor:'default' }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor=`${c}35`; e.currentTarget.style.background='var(--bg3)' }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--b1)'; e.currentTarget.style.background='var(--bg2)' }}>
                  <div style={{ width:26, height:26, borderRadius:'50%',
                    background:`${c}12`, border:`1px solid ${c}25`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontFamily:'var(--f-mono)', fontSize:10, color:c,
                    fontWeight:800, flexShrink:0 }}>{i+1}</div>
                  <span style={{ fontSize:13, color:'var(--t1)', flex:1,
                    fontWeight:500 }}>{label}</span>
                  <TrendingUp size={12} color={c}/>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── WEEKLY REPORTS ── */}
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <BookOpen size={15} color="#3B82F6"/>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'#3B82F6',
              letterSpacing:'.1em' }}>WEEKLY REPORTS</span>
          </div>
          <button onClick={()=>navigate('/insight')}
            style={{ display:'flex', alignItems:'center', gap:4, background:'none',
              border:'none', cursor:'pointer', color:'var(--t3)',
              fontSize:12, fontFamily:'var(--f-mono)' }}
            onMouseEnter={e=>e.currentTarget.style.color='var(--t1)'}
            onMouseLeave={e=>e.currentTarget.style.color='var(--t3)'}>
            전체 보기 <ChevronRight size={12}/>
          </button>
        </div>
        {wRepLoading ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:14 }}>
            {Array(4).fill(0).map((_,i)=>(
              <div key={i} style={{ padding:18, background:'var(--bg2)',
                border:'1px solid var(--b1)', borderRadius:12,
                display:'flex', flexDirection:'column', gap:10 }}>
                <Sk h={10} w="40%" r={4}/><Sk h={17} r={5}/><Sk h={12} r={4}/><Sk h={10} w="30%" r={4}/>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:14 }}>
            {(wReports||[]).map((r,i)=><WeeklyCard key={r.id||i} rep={r}/>)}
            {(!wReports||wReports.length===0) && (
              <div style={{ gridColumn:'1/-1', padding:'64px 20px',
                textAlign:'center', color:'var(--t3)' }}>
                <BookOpen size={44} style={{ marginBottom:14, opacity:.2 }}/>
                <div style={{ fontSize:15 }}>주간 리포트 준비 중...</div>
                <div style={{ fontSize:12, marginTop:6 }}>매주 금요일 밤 자동 생성됩니다.</div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes skPulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @media(max-width:768px){
          .trend-2col { grid-template-columns:1fr!important; }
          .trend-stats { flex-wrap:wrap!important; gap:8px!important; }
        }
        @media(max-width:480px){
          .sector-filter-scroll { gap:4px!important; }
        }
      `}</style>
    </div>
  )
}
