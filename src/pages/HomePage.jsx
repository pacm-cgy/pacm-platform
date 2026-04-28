import { useState, useEffect, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, TrendingUp, TrendingDown, Minus, Zap, Users,
  BrainCircuit, Lightbulb, CalendarDays, GraduationCap, Flame,
  Rocket, Globe, BookOpen, Trophy, Star, ChevronRight,
  Newspaper, Target, Clock, Eye, Sparkles, RefreshCw,
  MessageCircle, Activity, ArrowUpRight, Hash, CheckCircle
} from 'lucide-react'
import {
  useArticles, useProjects, useTrends,
  useSubscribeNewsletter, usePinnedNotices
} from '../hooks/useData'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

/* ─── HELPERS ─────────────────────────────────────────────────── */
const CAT_COLOR = {
  insight:'#3B82F6', trend:'#F59E0B', community:'#22C55E',
  news:'#60A5FA', ai:'#A855F7', fintech:'#06B6D4', edutech:'#F97316',
  startup:'#3B82F6', default:'#3B82F6'
}
const cc = c => CAT_COLOR[c] || CAT_COLOR.default

// MOCK_TRENDS 제거됨 — 실제 DB 데이터만 사용 (useTrends hook)

/* ── Skeleton ────────────────────────────────────────────────── */
function Sk({ h=16, w='100%', r=6, mb=0 }) {
  return <div style={{ height:h, width:w, background:'var(--bg3)', borderRadius:r,
    marginBottom:mb, animation:'pulse 1.6s ease-in-out infinite', flexShrink:0 }}/>
}

/* ── Animated number ─────────────────────────────────────────── */
function AnimNum({ value, decimals=0 }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let start = 0; const end = Number(value) || 0
    if (!end) return
    const step = end / 30
    const timer = setInterval(() => {
      start += step
      if (start >= end) { setDisplay(end); clearInterval(timer) }
      else setDisplay(Math.floor(start))
    }, 30)
    return () => clearInterval(timer)
  }, [value])
  return <>{decimals > 0 ? display.toFixed(decimals) : display.toLocaleString()}</>
}

/* ── Sparkline ───────────────────────────────────────────────── */
function Sparkline({ pct, color }) {
  const vals = [0.3,0.5,0.45,0.6,0.4,0.65,0.55,0.75,0.8,Math.min(Math.abs(pct)/100+0.4,1)]
  return (
    <svg width="100%" height="28" viewBox="0 0 100 28" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {vals.map((v,i,arr) => {
        if (i === arr.length-1) return null
        const x1 = (i/(arr.length-1))*100, x2 = ((i+1)/(arr.length-1))*100
        const y1 = 28*(1-v), y2 = 28*(1-arr[i+1])
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={i===arr.length-2?color:`${color}60`} strokeWidth="1.5" strokeLinecap="round"/>
      })}
    </svg>
  )
}

/* ── Trend chip ──────────────────────────────────────────────── */
function TrendChip({ snap, index }) {
  const [hov, setHov] = useState(false)
  if (!snap) return null
  const up = snap.change_pct > 0, down = snap.change_pct < 0
  const color = up ? '#22C55E' : down ? '#F43F5E' : '#666'
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus
  const emoji = snap.category==='ai_startup'?'🤖':snap.category==='edutech'?'📚':snap.category==='fintech'?'💰':'📊'
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ padding:'16px 18px', background:hov?'var(--bg3)':'var(--bg2)',
        border:`1px solid ${hov?`${color}35`:'var(--b1)'}`,
        borderRadius:12, cursor:'default', transition:'all .22s cubic-bezier(.4,0,.2,1)',
        display:'flex', flexDirection:'column', gap:10,
        transform:hov?'translateY(-4px)':'none',
        boxShadow:hov?`0 12px 36px rgba(0,0,0,.6),0 0 0 1px ${color}20`:'none',
        animationDelay:`${index*80}ms` }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:18 }}>{emoji}</span>
          <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)',
            letterSpacing:'.08em', textTransform:'uppercase' }}>{snap.metric_name}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:3,
          fontFamily:'var(--f-mono)', fontSize:10, color,
          background:`${color}15`, padding:'3px 7px', borderRadius:5,
          border:`1px solid ${color}28` }}>
          <Icon size={9}/>{Math.abs(snap.change_pct||0).toFixed(1)}%
        </div>
      </div>
      <div>
        <div style={{ fontFamily:'var(--f-display)', fontSize:24, fontWeight:800,
          color:'var(--t1)', lineHeight:1, letterSpacing:'-0.03em' }}>
          {snap.metric_unit==='억원'?'₩':''}<AnimNum value={snap.metric_value}/>
          <span style={{ fontSize:12, fontWeight:400, color:'var(--t3)', marginLeft:3 }}>
            {snap.metric_unit!=='억원'?snap.metric_unit:'억'}
          </span>
        </div>
      </div>
      <Sparkline pct={snap.change_pct||0} color={color}/>
    </div>
  )
}

/* ── Hero card ───────────────────────────────────────────────── */
function HeroCard({ art, onClick }) {
  const [hov, setHov] = useState(false)
  if (!art) return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)',
      borderRadius:16, overflow:'hidden', height:'100%', minHeight:440 }}>
      <Sk h={230} r={0}/><div style={{ padding:22 }}>
        <Sk h={12} w="40%" mb={14}/><Sk h={24} mb={10}/><Sk h={22} w="80%" mb={18}/><Sk h={13} w="60%"/>
      </div>
    </div>
  )
  const c = cc(art.category)
  return (
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:'var(--bg2)', border:`1px solid ${hov?`${c}30`:'var(--b1)'}`,
        borderRadius:16, overflow:'hidden', cursor:'pointer', height:'100%',
        display:'flex', flexDirection:'column', transition:'all .28s cubic-bezier(.4,0,.2,1)',
        transform:hov?'translateY(-4px)':'none',
        boxShadow:hov?`0 20px 60px rgba(0,0,0,.7),0 0 0 1px ${c}20`:'none' }}>
      <div style={{ position:'relative', paddingTop:'52%', background:'var(--bg3)', overflow:'hidden', flexShrink:0 }}>
        {art.cover_image
          ? <img src={art.cover_image} alt={art.title}
              style={{ position:'absolute', inset:0, width:'100%', height:'100%',
                objectFit:'cover', transition:'transform .5s cubic-bezier(.4,0,.2,1)',
                transform:hov?'scale(1.06)':'scale(1)' }}/>
          : <div style={{ position:'absolute', inset:0,
              background:`linear-gradient(135deg,${c}25,var(--bg4))`,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Zap size={48} color={`${c}35`}/>
            </div>
        }
        <div style={{ position:'absolute', inset:0,
          background:'linear-gradient(to top,rgba(0,0,0,.85) 0%,rgba(0,0,0,.2) 50%,transparent 100%)' }}/>
        <div style={{ position:'absolute', top:14, left:14, display:'flex', gap:6 }}>
          <span style={{ fontSize:10, fontWeight:700, fontFamily:'var(--f-mono)',
            padding:'3px 9px', borderRadius:5, background:c, color:'#fff',
            letterSpacing:'.08em', textTransform:'uppercase' }}>
            {art.category||'INSIGHT'}
          </span>
          {art.featured && (
            <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:9,
              fontWeight:700, padding:'3px 8px', borderRadius:5,
              background:'rgba(245,158,11,0.9)', color:'#fff', fontFamily:'var(--f-mono)' }}>
              <Star size={8} fill="#fff" color="#fff"/>FEATURED
            </span>
          )}
        </div>
        {art.read_time && (
          <div style={{ position:'absolute', bottom:14, right:14,
            display:'flex', alignItems:'center', gap:4,
            background:'rgba(0,0,0,0.7)', padding:'3px 8px', borderRadius:5,
            backdropFilter:'blur(8px)' }}>
            <Clock size={9} color="rgba(255,255,255,0.7)"/>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'rgba(255,255,255,0.7)' }}>
              {art.read_time}분
            </span>
          </div>
        )}
      </div>
      <div style={{ padding:'20px 22px 22px', flex:1, display:'flex', flexDirection:'column', gap:10 }}>
        <h2 style={{ fontFamily:'var(--f-display)', fontSize:21, fontWeight:800,
          color:'var(--t1)', lineHeight:1.32, margin:0, letterSpacing:'-.03em' }}>
          {art.title}
        </h2>
        {art.excerpt && (
          <p style={{ fontFamily:'var(--f-sans)', fontSize:13, color:'var(--t2)',
            lineHeight:1.7, margin:0, display:'-webkit-box',
            WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
            {art.excerpt}
          </p>
        )}
        <div style={{ marginTop:'auto', display:'flex', alignItems:'center',
          gap:12, paddingTop:12, borderTop:'1px solid var(--b1)' }}>
          <div style={{ width:24, height:24, borderRadius:'50%', background:`${c}20`,
            border:`1px solid ${c}30`, display:'flex', alignItems:'center',
            justifyContent:'center', fontSize:10, color:c, fontWeight:800, flexShrink:0 }}>
            {(art.profiles?.display_name||'I')[0].toUpperCase()}
          </div>
          <span style={{ fontFamily:'var(--f-sans)', fontSize:12, color:'var(--t3)',
            flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {art.profiles?.display_name||'인사이트쉽'}
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:4,
            fontFamily:'var(--f-mono)', fontSize:10, color:hov?c:'var(--t4)', transition:'color .2s' }}>
            읽기 <ArrowUpRight size={10}/>
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Article row ─────────────────────────────────────────────── */
function ArticleRow({ art, rank, onClick }) {
  const [hov, setHov] = useState(false)
  if (!art) return <div style={{ padding:'12px 0', borderBottom:'1px solid var(--b0)',
    display:'flex', gap:12 }}><Sk h={12} w="80%"/></div>
  return (
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ display:'flex', gap:12, padding:'11px 0', cursor:'pointer',
        borderBottom:'1px solid var(--b0)', transition:'all .15s', alignItems:'flex-start',
        background:hov?'transparent':'transparent' }}>
      {rank && (
        <span style={{ fontFamily:'var(--f-mono)', fontSize:12, color:rank<=3?'#3B82F6':'var(--t4)',
          fontWeight:800, minWidth:18, marginTop:2, flexShrink:0 }}>
          {rank}
        </span>
      )}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:'var(--f-sans)', fontSize:13, fontWeight:500,
          color:hov?'var(--t1)':'var(--t2)', lineHeight:1.45, marginBottom:5,
          transition:'color .15s', display:'-webkit-box',
          WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {art.title}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <span style={{ fontFamily:'var(--f-mono)', fontSize:9,
            padding:'1px 6px', borderRadius:3, background:`${cc(art.category)}18`,
            color:cc(art.category), border:`1px solid ${cc(art.category)}28` }}>
            {art.category||'INSIGHT'}
          </span>
          {art.published_at && (
            <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)' }}>
              {format(new Date(art.published_at),'MM.dd',{locale:ko})}
            </span>
          )}
        </div>
      </div>
      {art.cover_image && (
        <div style={{ width:58, height:44, borderRadius:7, overflow:'hidden', flexShrink:0 }}>
          <img src={art.cover_image} alt="" style={{ width:'100%', height:'100%',
            objectFit:'cover', transition:'transform .3s',
            transform:hov?'scale(1.1)':'scale(1)' }}/>
        </div>
      )}
    </div>
  )
}

/* ── Feature card ────────────────────────────────────────────── */
function FeatureCard({ icon:Icon, label, desc, color, path, badge, stat }) {
  const nav = useNavigate()
  const [hov, setHov] = useState(false)
  return (
    <div onClick={()=>nav(path)} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ padding:'20px', background:hov?'var(--bg3)':'var(--bg2)',
        border:`1px solid ${hov?`${color}35`:'var(--b1)'}`,
        borderRadius:14, cursor:'pointer', transition:'all .22s cubic-bezier(.4,0,.2,1)',
        display:'flex', flexDirection:'column', gap:14,
        transform:hov?'translateY(-3px)':'none',
        boxShadow:hov?`0 10px 36px rgba(0,0,0,.55),0 0 0 1px ${color}20`:'none',
        position:'relative', overflow:'hidden' }}>
      {hov && <div style={{ position:'absolute', top:-40, right:-40, width:120, height:120,
        borderRadius:'50%', background:`radial-gradient(circle,${color}12,transparent 70%)`,
        pointerEvents:'none' }}/>}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div style={{ width:40, height:40, borderRadius:11,
          background:`${color}15`, border:`1px solid ${color}28`,
          display:'flex', alignItems:'center', justifyContent:'center',
          transition:'all .2s', boxShadow:hov?`0 4px 16px ${color}35`:'none' }}>
          <Icon size={19} color={color}/>
        </div>
        {badge && (
          <span style={{ fontSize:9, fontWeight:700, fontFamily:'var(--f-mono)',
            padding:'2px 7px', borderRadius:4, background:`${color}18`,
            color, border:`1px solid ${color}30` }}>
            {badge}
          </span>
        )}
      </div>
      <div>
        <div style={{ fontFamily:'var(--f-sans)', fontSize:14, fontWeight:700,
          color:'var(--t1)', marginBottom:5 }}>{label}</div>
        <div style={{ fontFamily:'var(--f-sans)', fontSize:12, color:'var(--t3)', lineHeight:1.6 }}>{desc}</div>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:4,
          fontFamily:'var(--f-mono)', fontSize:10,
          color:hov?color:'var(--t4)', transition:'color .15s' }}>
          바로가기 <ArrowRight size={10}/>
        </div>
        {stat && <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)' }}>{stat}</span>}
      </div>
    </div>
  )
}

/* ── Project card ────────────────────────────────────────────── */
function ProjectCard({ proj, onClick }) {
  const [hov, setHov] = useState(false)
  if (!proj) return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:12, padding:16 }}>
      <Sk h={12} w="60%" mb={10}/><Sk h={16} mb={8}/><Sk h={12} w="80%"/>
    </div>
  )
  const roles = proj.required_roles?.slice(0,3)||[]
  return (
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:hov?'var(--bg3)':'var(--bg2)',
        border:`1px solid ${hov?'rgba(59,130,246,0.4)':'var(--b1)'}`,
        borderRadius:12, padding:'16px', cursor:'pointer', transition:'all .2s',
        transform:hov?'translateY(-2px)':'none' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 }}>
        <div style={{ width:36, height:36, borderRadius:9,
          background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.2)',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          boxShadow:hov?'0 4px 14px rgba(59,130,246,0.25)':'none', transition:'all .2s' }}>
          <Rocket size={16} color="#3B82F6"/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'var(--f-sans)', fontSize:13, fontWeight:700,
            color:'var(--t1)', marginBottom:3,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {proj.title}
          </div>
          <div style={{ fontFamily:'var(--f-sans)', fontSize:11, color:'var(--t3)',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {(proj.description||'').slice(0,55)}{(proj.description||'').length>55?'...':''}
          </div>
        </div>
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:10 }}>
        {roles.map((r,i) => (
          <span key={i} style={{ fontSize:10, fontFamily:'var(--f-mono)',
            padding:'2px 7px', borderRadius:4, background:'rgba(59,130,246,0.1)',
            color:'#60A5FA', border:'1px solid rgba(59,130,246,0.2)' }}>{r}</span>
        ))}
        {(proj.tech_stack||[]).slice(0,2).map((t,i) => (
          <span key={'t'+i} style={{ fontSize:10, fontFamily:'var(--f-mono)',
            padding:'2px 7px', borderRadius:4, background:'var(--bg4)',
            color:'var(--t3)', border:'1px solid var(--b1)' }}>{t}</span>
        ))}
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}>
          팀원 {proj.team_size||'?'}명 모집
        </span>
        <span style={{ fontSize:9, fontWeight:700, fontFamily:'var(--f-mono)',
          padding:'2px 7px', borderRadius:4, background:'rgba(34,197,94,0.1)',
          color:'#22C55E', border:'1px solid rgba(34,197,94,0.2)', display:'flex',
          alignItems:'center', gap:3 }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:'#22C55E',
            animation:'pulse 2s ease-in-out infinite', display:'inline-block' }}/>OPEN
        </span>
      </div>
    </div>
  )
}

/* ── News card ───────────────────────────────────────────────── */
function NewsCard({ item, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:hov?'var(--bg3)':'var(--bg2)',
        border:`1px solid ${hov?'var(--b2)':'var(--b1)'}`,
        borderRadius:11, overflow:'hidden', cursor:'pointer',
        transition:'all .2s', transform:hov?'translateY(-2px)':'none' }}>
      <div style={{ height:86, background:'var(--bg3)', overflow:'hidden' }}>
        {item.cover_image
          ? <img src={item.cover_image} alt="" style={{ width:'100%', height:'100%',
              objectFit:'cover', transition:'transform .35s',
              transform:hov?'scale(1.07)':'scale(1)' }}/>
          : <div style={{ width:'100%', height:'100%', background:'var(--bg4)',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Newspaper size={20} color="var(--t4)"/>
            </div>
        }
      </div>
      <div style={{ padding:'10px 13px' }}>
        <div style={{ fontFamily:'var(--f-sans)', fontSize:12, fontWeight:600,
          color:'var(--t1)', lineHeight:1.45, marginBottom:5,
          display:'-webkit-box', WebkitLineClamp:2,
          WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {item.title}
        </div>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)' }}>
          {item.source_name} · {item.published_at?format(new Date(item.published_at),'MM.dd'):''}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   HERO SECTION
═══════════════════════════════════════════════════════════════ */
function HeroSection({ navigate }) {
  const [typed, setTyped] = useState('')
  const words = ['창업 인사이트', 'AI 멘토링', '시장 트렌드', '아이디어 랩', '팀 빌딩', '피치덱 작성', '투자 분석', '린 캔버스']
  const [wordIdx, setWordIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const word = words[wordIdx]
    const timer = setTimeout(() => {
      if (!deleting) {
        if (charIdx < word.length) { setTyped(word.slice(0, charIdx+1)); setCharIdx(c=>c+1) }
        else { setTimeout(() => setDeleting(true), 1800) }
      } else {
        if (charIdx > 0) { setTyped(word.slice(0, charIdx-1)); setCharIdx(c=>c-1) }
        else { setDeleting(false); setWordIdx(i=>(i+1)%words.length) }
      }
    }, deleting ? 60 : 90)
    return () => clearTimeout(timer)
  }, [charIdx, deleting, wordIdx])

  return (
    <section style={{ padding:'56px var(--pad-x) 0', maxWidth:'var(--max-w)', margin:'0 auto' }}>
      <div style={{ textAlign:'center', maxWidth:760, margin:'0 auto 48px', position:'relative' }}>
        {/* Ambient glow effects */}
        <div style={{ position:'absolute', top:-80, left:'50%', transform:'translateX(-50%)', width:600, height:300,
          background:'radial-gradient(ellipse,rgba(59,130,246,0.08) 0%,transparent 70%)', pointerEvents:'none', zIndex:0 }}/>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, marginBottom:18,
          padding:'5px 14px', background:'rgba(59,130,246,0.1)',
          border:'1px solid rgba(59,130,246,0.25)', borderRadius:20, position:'relative', zIndex:1 }}>
          <Sparkles size={13} color="#3B82F6"/>
          <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#3B82F6', letterSpacing:'.1em' }}>
            INSIGHTSHIP PLATFORM v9 · 2026
          </span>
        </div>
        <h1 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(34px,5.5vw,66px)',
          fontWeight:900, color:'var(--t1)', lineHeight:1.12,
          letterSpacing:'-.035em', margin:'0 0 14px', position:'relative', zIndex:1 }}>
          청소년 창업가를 위한<br/>
          <span style={{ color:'#3B82F6', position:'relative' }}>
            {typed}<span style={{ borderRight:'2px solid #3B82F6', animation:'blink 1s step-end infinite',
              marginLeft:1, display:'inline-block', height:'0.85em', verticalAlign:'middle' }}/>
          </span>
        </h1>
        <p style={{ fontFamily:'var(--f-sans)', fontSize:16, color:'var(--t2)', lineHeight:1.75,
          maxWidth:500, margin:'0 auto 28px' }}>
          자체 개발 AI가 실시간으로 리서치·분석·시뮬레이션을 수행합니다.<br/>외부 API 비용 0원, 완전 자립형 청소년 창업 플랫폼.
        </p>
        <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
          <button onClick={()=>navigate('/mentor')}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 24px',
              background:'linear-gradient(135deg,#3B82F6,#1D4ED8)', border:'none',
              borderRadius:10, color:'#fff', fontSize:14, fontFamily:'var(--f-sans)',
              fontWeight:700, cursor:'pointer', transition:'all .2s',
              boxShadow:'0 4px 20px rgba(59,130,246,0.4)' }}
            onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 28px rgba(59,130,246,0.5)' }}
            onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='0 4px 20px rgba(59,130,246,0.4)' }}>
            <BrainCircuit size={16}/> AI 멘토 시작하기
          </button>
          <button onClick={()=>navigate('/insight')}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 24px',
              background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:10,
              color:'var(--t1)', fontSize:14, fontFamily:'var(--f-sans)',
              fontWeight:600, cursor:'pointer', transition:'all .2s' }}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor='var(--b3)'; e.currentTarget.style.background='var(--bg3)' }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--b2)'; e.currentTarget.style.background='var(--bg2)' }}>
            인사이트 보기 <ChevronRight size={14}/>
          </button>
          <button onClick={()=>navigate('/trend')}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 24px',
              background:'transparent', border:'1px solid rgba(245,158,11,0.35)', borderRadius:10,
              color:'#F59E0B', fontSize:14, fontFamily:'var(--f-sans)',
              fontWeight:600, cursor:'pointer', transition:'all .2s' }}
            onMouseEnter={e=>{ e.currentTarget.style.background='rgba(245,158,11,0.08)'; e.currentTarget.style.borderColor='rgba(245,158,11,0.6)' }}
            onMouseLeave={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='rgba(245,158,11,0.35)' }}>
            📊 트렌드 보기
          </button>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════ */
const FEATURES = [
  { icon:BrainCircuit, label:'AI 멘토', desc:'24시간 응답하는 자체 AI 창업 멘토. 아이디어 검증부터 피치덱까지', color:'#A855F7', path:'/mentor', badge:'AI', stat:'외부API 0원' },
  { icon:Lightbulb, label:'아이디어 랩', desc:'아이디어 공유·피드백·팀 매칭까지 한 번에', color:'#06B6D4', path:'/ideas' },
  { icon:GraduationCap, label:'학습 센터', desc:'퀴즈·배지로 창업 스킬을 게임처럼 쌓으세요', color:'#F97316', path:'/edu' },
  { icon:CalendarDays, label:'이벤트', desc:'해커톤, 피칭, 네트워킹 — 실전 경험의 장', color:'#F43F5E', path:'/events', badge:'HOT' },
  { icon:Users, label:'커뮤니티', desc:'청소년 창업가들의 진짜 질문과 답변', color:'#22C55E', path:'/community' },
  { icon:TrendingUp, label:'트렌드', desc:'AI·핀테크·에듀테크 실시간 시장 데이터', color:'#F59E0B', path:'/trend' },
]

// MOCK_PROJECTS 제거됨 — 실제 DB 데이터만 사용 (useProjects hook)

export default function HomePage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [subDone, setSubDone] = useState(false)
  const [subCount, setSubCount] = useState(47)
  const [notice, setNotice] = useState(null)
  const [newsItems, setNewsItems] = useState([])
  const [newsLoading, setNewsLoading] = useState(true)
  const [statsVisible, setStatsVisible] = useState(false)
  const statsRef = useRef(null)

  const { data: articles=[], isLoading:artLoading } = useArticles({ limit:9 })
  const { data: projects=[], isLoading:projLoading } = useProjects()
  const { data: trends=[], isLoading:trendLoading } = useTrends()
  const { data: notices=[] } = usePinnedNotices()
  const subscribe = useSubscribeNewsletter()

  useEffect(() => { if (notices?.length) setNotice(notices[0]) }, [notices])

  useEffect(() => {
    supabase.from('newsletter_subscribers')
      .select('id',{count:'exact',head:true})
      .then(({count}) => { if (count) setSubCount(count) }).catch(()=>{})

    supabase.from('articles')
      .select('id,title,slug,category,published_at,cover_image,source_name')
      .not('source_name','is',null)
      .eq('status','published')
      .order('published_at',{ascending:false})
      .limit(6)
      .then(({data}) => { if (data) setNewsItems(data); setNewsLoading(false) })
      .catch(() => setNewsLoading(false))
  }, [])

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStatsVisible(true) }, { threshold:0.2 })
    if (statsRef.current) obs.observe(statsRef.current)
    return () => obs.disconnect()
  }, [])

  const handleSubscribe = async e => {
    e.preventDefault()
    if (!email.trim()) return
    try { await subscribe.mutateAsync(email); setSubDone(true); setSubCount(p=>p+1) } catch {}
  }

  const goArt = art => navigate(`/article/${art.slug||art.id}`)
  const hero = articles[0]
  const sideArts = articles.slice(1,5)
  const gridArts = articles.slice(5,9)
  const trendData = (trends?.length ? trends : []).slice(0,4)
  // projData: 'recruiting' or 'open' or 'coming_soon' — no mock fallback
  const projData = (projects?.filter(p=>['recruiting','open','coming_soon'].includes(p.status)) || []).slice(0,3)

  return (
    <div style={{ background:'var(--bg0)', minHeight:'100vh' }}>
      <Helmet>
        <title>Insightship — 청소년 창업 플랫폼</title>
        <meta name="description" content="청소년 창업가를 위한 인사이트 미디어 플랫폼. AI 멘토, 트렌드 분석, 아이디어랩, 커뮤니티까지 — 창업의 모든 것을 Insightship에서."/>
        <meta property="og:title" content="Insightship — 청소년 창업 플랫폼"/>
        <meta property="og:description" content="청소년 창업가를 위한 AI 멘토·인사이트·트렌드·커뮤니티 플랫폼"/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://insightship.vercel.app"/>
        <meta property="og:image" content="https://insightship.vercel.app/icons/icon-512.png"/>
        <meta name="twitter:card" content="summary_large_image"/>
        <meta name="twitter:title" content="Insightship — 청소년 창업 플랫폼"/>
        <meta name="twitter:description" content="청소년 창업가를 위한 AI 멘토·인사이트·트렌드·커뮤니티"/>
        <meta name="twitter:image" content="https://insightship.vercel.app/icons/icon-512.png"/>
        <link rel="canonical" href="https://insightship.vercel.app"/>
      </Helmet>

      {/* ── NOTICE BAR ─────────────────────────────────────── */}
      {notice && (
        <div style={{ background:'linear-gradient(90deg,rgba(59,130,246,0.12),rgba(59,130,246,0.06))',
          borderBottom:'1px solid rgba(59,130,246,0.2)',
          padding:'9px var(--pad-x)', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:10, fontWeight:700, fontFamily:'var(--f-mono)',
            padding:'2px 7px', borderRadius:4, background:'#3B82F6', color:'#fff' }}>공지</span>
          <span style={{ fontFamily:'var(--f-sans)', fontSize:13, color:'var(--t2)', flex:1 }}>{notice.title}</span>
          <button onClick={()=>setNotice(null)}
            style={{ background:'none', border:'none', color:'var(--t4)', cursor:'pointer', fontSize:16, padding:4, lineHeight:1 }}>×</button>
        </div>
      )}

      {/* ── HERO SECTION ───────────────────────────────────── */}
      <HeroSection navigate={navigate}/>

      {/* ── STATS ROW ──────────────────────────────────────── */}
      <div ref={statsRef} style={{ maxWidth:'var(--max-w)', margin:'0 auto',
        padding:'0 var(--pad-x)', marginBottom:0 }}>
        <div className="home-stats-grid" style={{ padding:'24px 0 32px', borderBottom:'1px solid var(--b1)' }}>
          {[
            { val:statsVisible?'18,400+':'0', label:'청소년 창업가', icon:Users, color:'#3B82F6' },
            { val:statsVisible?'1,200+':'0', label:'인사이트 아티클', icon:BookOpen, color:'#A855F7' },
            { val:statsVisible?'AI 자립형':'—', label:'자체 개발 엔진', icon:BrainCircuit, color:'#22C55E' },
            { val:statsVisible?'₩0':'—', label:'외부 API 비용', icon:Sparkles, color:'#F59E0B' },
          ].map((s,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12,
              padding:'14px 16px', background:'var(--bg2)', border:'1px solid var(--b1)',
              borderRadius:12, transition:'all .3s', animationDelay:`${i*100}ms` }}>
              <div style={{ width:36, height:36, borderRadius:9, background:`${s.color}12`,
                border:`1px solid ${s.color}22`, display:'flex', alignItems:'center',
                justifyContent:'center', flexShrink:0 }}>
                <s.icon size={17} color={s.color}/>
              </div>
              <div>
                <div style={{ fontFamily:'var(--f-display)', fontSize:20, fontWeight:800,
                  color:'var(--t1)', lineHeight:1, letterSpacing:'-.02em' }}>
                  {s.val}{s.unit||''}
                </div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)',
                  letterSpacing:'.06em', marginTop:2 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TREND CHIPS ────────────────────────────────────── */}
      <section style={{ padding:'32px var(--pad-x) 0', maxWidth:'var(--max-w)', margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:3, height:20, background:'linear-gradient(to bottom,#F59E0B,#D97706)', borderRadius:2 }}/>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'#F59E0B', letterSpacing:'.12em' }}>MARKET INDICATORS</span>
          </div>
          <button onClick={()=>navigate('/trend')}
            style={{ display:'flex', alignItems:'center', gap:5, fontFamily:'var(--f-mono)',
              fontSize:10, color:'var(--t3)', background:'none', border:'none',
              cursor:'pointer', letterSpacing:'.06em' }}
            onMouseEnter={e=>e.currentTarget.style.color='var(--t1)'}
            onMouseLeave={e=>e.currentTarget.style.color='var(--t3)'}>
            트렌드 전체 <ChevronRight size={12}/>
          </button>
        </div>
        <div className="home-trends-grid">
          {trendLoading
            ? Array(4).fill(0).map((_,i)=>(
                <div key={i} style={{ padding:'18px', background:'var(--bg2)',
                  border:'1px solid var(--b1)', borderRadius:12,
                  display:'flex', flexDirection:'column', gap:10 }}>
                  <Sk h={10} w="60%" mb={8}/><Sk h={26} w="70%" mb={6}/><Sk h={28}/>
                </div>
              ))
            : trendData.map((s,i)=><TrendChip key={i} snap={s} index={i}/>)
          }
        </div>
      </section>

      {/* ── TODAY'S INSIGHTS ───────────────────────────────── */}
      <section style={{ padding:'0 var(--pad-x)', maxWidth:'var(--max-w)', margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:3, height:20, background:'linear-gradient(to bottom,#3B82F6,#1D4ED8)', borderRadius:2 }}/>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'#3B82F6', letterSpacing:'.12em' }}>TODAY'S INSIGHTS</span>
          </div>
          <button onClick={()=>navigate('/insight')}
            style={{ display:'flex', alignItems:'center', gap:5, fontFamily:'var(--f-mono)',
              fontSize:10, color:'var(--t3)', background:'none', border:'none', cursor:'pointer', letterSpacing:'.06em' }}
            onMouseEnter={e=>e.currentTarget.style.color='var(--t1)'}
            onMouseLeave={e=>e.currentTarget.style.color='var(--t3)'}>
            전체 보기 <ChevronRight size={12}/>
          </button>
        </div>

        {/* Hero + sidebar grid */}
        <div className="home-hero-grid">
          <div style={{ minHeight:440 }}>
            <HeroCard art={artLoading?null:hero} onClick={()=>hero&&goArt(hero)}/>
          </div>
          <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)',
            borderRadius:16, padding:'18px 20px', display:'flex', flexDirection:'column' }}>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t3)',
              letterSpacing:'.12em', marginBottom:16, textTransform:'uppercase' }}>
              최신 아티클
            </div>
            <div style={{ flex:1 }}>
              {artLoading
                ? Array(4).fill(0).map((_,i)=>(
                    <div key={i} style={{ padding:'12px 0', borderBottom:'1px solid var(--b0)',
                      display:'flex', gap:12, alignItems:'center' }}>
                      <Sk h={12} w="80%"/>
                    </div>
                  ))
                : sideArts.map((art,i)=>(
                    <ArticleRow key={art.id} art={art} rank={i+2} onClick={()=>goArt(art)}/>
                  ))
              }
            </div>
            <button onClick={()=>navigate('/insight')}
              style={{ marginTop:16, padding:'9px', background:'rgba(59,130,246,0.08)',
                border:'1px solid rgba(59,130,246,0.2)', borderRadius:8,
                color:'#3B82F6', fontSize:12, fontFamily:'var(--f-sans)',
                fontWeight:600, cursor:'pointer', transition:'all .15s' }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(59,130,246,0.15)'}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(59,130,246,0.08)'}>
              더 많은 인사이트 →
            </button>
          </div>
        </div>

        {/* 2×2 grid articles */}
        {gridArts.length > 0 && (
          <div className="home-articles-grid">
            {(artLoading?Array(4).fill(null):gridArts).map((art,i) => {
              if (!art) return (
                <div key={i} style={{ background:'var(--bg2)', border:'1px solid var(--b1)',
                  borderRadius:12, overflow:'hidden' }}>
                  <Sk h={120} r={0}/><div style={{ padding:14 }}>
                    <Sk h={10} w="40%" mb={8}/><Sk h={16} mb={6}/><Sk h={13} w="70%"/>
                  </div>
                </div>
              )
              const c = cc(art.category)
              return (
                <div key={art.id} onClick={()=>goArt(art)}
                  className="art-grid-card"
                  style={{ background:'var(--bg2)', border:'1px solid var(--b1)',
                    borderRadius:12, overflow:'hidden', cursor:'pointer', transition:'all .22s' }}>
                  <div style={{ height:110, background:'var(--bg3)', overflow:'hidden', position:'relative' }}>
                    {art.cover_image
                      ? <img src={art.cover_image} alt="" style={{ width:'100%', height:'100%',
                          objectFit:'cover', transition:'transform .35s' }}/>
                      : <div style={{ width:'100%', height:'100%',
                          background:`linear-gradient(135deg,${c}18,var(--bg4))`,
                          display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Zap size={28} color={`${c}35`}/>
                        </div>
                    }
                  </div>
                  <div style={{ padding:'12px 14px' }}>
                    <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:c,
                      marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>
                      {art.category}
                    </div>
                    <div style={{ fontFamily:'var(--f-sans)', fontSize:13, fontWeight:600,
                      color:'var(--t1)', lineHeight:1.4, display:'-webkit-box',
                      WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                      {art.title}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── FEATURES ───────────────────────────────────────── */}
      <section style={{ padding:'0 var(--pad-x) 48px', maxWidth:'var(--max-w)', margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:3, height:20, background:'linear-gradient(to bottom,#A855F7,#7C3AED)', borderRadius:2 }}/>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'#A855F7', letterSpacing:'.12em' }}>PLATFORM FEATURES</span>
          </div>
        </div>
        <div className="home-features-grid">
          {FEATURES.map(f => <FeatureCard key={f.label} {...f}/>)}
        </div>
      </section>

      {/* ── 2COL: PROJECTS + NEWS ───────────────────────────── */}
      <section style={{ padding:'0 var(--pad-x) 48px', maxWidth:'var(--max-w)', margin:'0 auto' }}>
        <div className="home-2col">

          {/* Projects */}
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:3, height:18, background:'linear-gradient(to bottom,#22C55E,#16A34A)', borderRadius:2 }}/>
                <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'#22C55E', letterSpacing:'.1em' }}>팀 모집</span>
              </div>
              <button onClick={()=>navigate('/ideas')}
                style={{ display:'flex', alignItems:'center', gap:4, fontFamily:'var(--f-mono)',
                  fontSize:10, color:'var(--t3)', background:'none', border:'none', cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.color='var(--t1)'}
                onMouseLeave={e=>e.currentTarget.style.color='var(--t3)'}>
                더 보기 <ChevronRight size={11}/>
              </button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {projLoading
                ? Array(3).fill(0).map((_,i)=>(
                    <div key={i} style={{ background:'var(--bg2)', border:'1px solid var(--b1)',
                      borderRadius:12, padding:16 }}>
                      <Sk h={12} w="60%" mb={10}/><Sk h={16} mb={8}/><Sk h={12} w="80%"/>
                    </div>
                  ))
                : projData.map(p=><ProjectCard key={p.id} proj={p} onClick={()=>navigate('/ideas')}/>)
              }
            </div>
          </div>

          {/* News */}
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:3, height:18, background:'linear-gradient(to bottom,#60A5FA,#3B82F6)', borderRadius:2 }}/>
                <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'#60A5FA', letterSpacing:'.1em' }}>최신 뉴스</span>
              </div>
              <button onClick={()=>navigate('/news')}
                style={{ display:'flex', alignItems:'center', gap:4, fontFamily:'var(--f-mono)',
                  fontSize:10, color:'var(--t3)', background:'none', border:'none', cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.color='var(--t1)'}
                onMouseLeave={e=>e.currentTarget.style.color='var(--t3)'}>
                더 보기 <ChevronRight size={11}/>
              </button>
            </div>
            <div className="home-news-grid">
              {newsLoading
                ? Array(6).fill(0).map((_,i)=>(
                    <div key={i} style={{ background:'var(--bg2)', border:'1px solid var(--b1)',
                      borderRadius:11, overflow:'hidden' }}>
                      <Sk h={86} r={0}/><div style={{ padding:'10px 13px' }}>
                        <Sk h={12} mb={6}/><Sk h={9} w="60%"/>
                      </div>
                    </div>
                  ))
                : newsItems.slice(0,6).map(item=>(
                    <NewsCard key={item.id} item={item} onClick={()=>navigate(`/article/${item.slug||item.id}`)}/>
                  ))
              }
            </div>
          </div>
        </div>
      </section>

      {/* ── NEWSLETTER ──────────────────────────────────────── */}
      <section style={{ padding:'0 var(--pad-x) 60px', maxWidth:'var(--max-w)', margin:'0 auto' }}>
        <div style={{ background:'linear-gradient(135deg,rgba(59,130,246,0.12),rgba(168,85,247,0.08))',
          border:'1px solid rgba(59,130,246,0.2)', borderRadius:20,
          padding:'40px 48px', textAlign:'center', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:-60, left:-60, width:200, height:200,
            borderRadius:'50%', background:'radial-gradient(circle,rgba(59,130,246,0.15),transparent 70%)',
            pointerEvents:'none' }}/>
          <div style={{ position:'absolute', bottom:-40, right:-40, width:160, height:160,
            borderRadius:'50%', background:'radial-gradient(circle,rgba(168,85,247,0.12),transparent 70%)',
            pointerEvents:'none' }}/>
          <div style={{ position:'relative' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginBottom:14,
              padding:'4px 12px', background:'rgba(59,130,246,0.12)',
              border:'1px solid rgba(59,130,246,0.25)', borderRadius:16 }}>
              <Sparkles size={12} color="#3B82F6"/>
              <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#3B82F6', letterSpacing:'.1em' }}>
                WEEKLY NEWSLETTER
              </span>
            </div>
            <h3 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(20px,3vw,30px)',
              fontWeight:800, color:'var(--t1)', marginBottom:8, letterSpacing:'-.02em' }}>
              매주 금요일, 최고의 인사이트를 받아보세요
            </h3>
            <p style={{ fontFamily:'var(--f-sans)', fontSize:14, color:'var(--t2)',
              lineHeight:1.7, marginBottom:24, maxWidth:480, margin:'0 auto 24px' }}>
              AI가 큐레이션한 스타트업 트렌드, 투자 분석, 청소년 창업 사례를 매주 정리해 드립니다.
            </p>
            {subDone ? (
              <div style={{ display:'inline-flex', alignItems:'center', gap:8,
                padding:'12px 24px', background:'rgba(34,197,94,0.12)',
                border:'1px solid rgba(34,197,94,0.3)', borderRadius:10 }}>
                <CheckCircle size={16} color="#22C55E"/>
                <span style={{ fontFamily:'var(--f-sans)', fontSize:14, color:'#22C55E', fontWeight:600 }}>
                  구독 완료! 금요일에 뵐게요 🎉
                </span>
              </div>
            ) : (
              <form onSubmit={handleSubscribe}
                style={{ display:'flex', gap:8, maxWidth:400, margin:'0 auto' }}>
                <input value={email} onChange={e=>setEmail(e.target.value)}
                  type="email" placeholder="이메일을 입력하세요" required
                  style={{ flex:1, padding:'12px 16px', background:'var(--bg2)',
                    border:'1px solid var(--b2)', borderRadius:10, color:'var(--t1)',
                    fontSize:14, fontFamily:'var(--f-sans)', outline:'none', transition:'border-color .2s' }}
                  onFocus={e=>e.target.style.borderColor='rgba(59,130,246,0.5)'}
                  onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
                <button type="submit"
                  style={{ padding:'12px 20px', background:'linear-gradient(135deg,#3B82F6,#1D4ED8)',
                    border:'none', borderRadius:10, color:'#fff', fontSize:14,
                    fontFamily:'var(--f-sans)', fontWeight:700, cursor:'pointer',
                    transition:'opacity .15s', whiteSpace:'nowrap',
                    boxShadow:'0 4px 16px rgba(59,130,246,0.35)' }}
                  onMouseEnter={e=>e.currentTarget.style.opacity='.85'}
                  onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                  구독 →
                </button>
              </form>
            )}
            <p style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)',
              marginTop:14, letterSpacing:'.04em' }}>
              {subCount.toLocaleString()}명이 이미 구독 중 · 언제든 해지 가능
            </p>
          </div>
        </div>
      </section>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes skPulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        .art-grid-card:hover { transform:translateY(-3px)!important; border-color:var(--b2)!important; box-shadow:0 8px 28px rgba(0,0,0,0.5); }
        .art-grid-card:hover img { transform:scale(1.07); }
        .home-stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; padding:24px 0 32px; border-bottom:1px solid var(--b1); }
        .home-trends-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:40px; }
        .home-hero-grid { display:grid; grid-template-columns:1fr 320px; gap:16px; margin-bottom:40px; }
        .home-articles-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:48px; }
        .home-features-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
        .home-2col { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
        .home-news-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
        @media(max-width:1100px){
          .home-stats-grid { grid-template-columns:repeat(2,1fr)!important; }
          .home-trends-grid { grid-template-columns:repeat(2,1fr)!important; }
          .home-articles-grid { grid-template-columns:repeat(2,1fr)!important; }
          .home-features-grid { grid-template-columns:repeat(2,1fr)!important; }
          .home-news-grid { grid-template-columns:repeat(2,1fr)!important; }
        }
        @media(max-width:768px){
          .home-stats-grid { grid-template-columns:repeat(2,1fr)!important; gap:8px!important; }
          .home-trends-grid { grid-template-columns:repeat(2,1fr)!important; }
          .home-hero-grid { grid-template-columns:1fr!important; }
          .home-articles-grid { grid-template-columns:repeat(2,1fr)!important; }
          .home-features-grid { grid-template-columns:1fr!important; }
          .home-2col { grid-template-columns:1fr!important; }
          .home-news-grid { grid-template-columns:repeat(2,1fr)!important; }
        }
        @media(max-width:480px){
          .home-stats-grid { grid-template-columns:repeat(2,1fr)!important; }
          .home-articles-grid { grid-template-columns:1fr!important; }
          .home-news-grid { grid-template-columns:1fr!important; }
        }
      \`}</style>
    </div>
  )
}
