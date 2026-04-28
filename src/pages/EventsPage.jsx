import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays, Clock, MapPin, Users, Trophy, Zap, Filter,
  ChevronRight, ArrowRight, ExternalLink, Flame, Search,
  CheckCircle, X, Plus, Timer, Award, Target, Rocket, Globe,
  Star, Tag, AlertCircle
} from 'lucide-react'
import { useAuthStore } from '../store'
import { supabase } from '../lib/supabase'
import { format, differenceInDays, isPast, isFuture } from 'date-fns'
import { ko } from 'date-fns/locale'

const EVENT_TYPES = {
  challenge:   { label:'챌린지',  color:'#3B82F6', bg:'rgba(59,130,246,0.12)',  emoji:'🏆' },
  hackathon:   { label:'해커톤',  color:'#F43F5E', bg:'rgba(244,63,94,0.12)',   emoji:'💻' },
  competition: { label:'공모전',  color:'#F59E0B', bg:'rgba(245,158,11,0.12)',  emoji:'🥇' },
  workshop:    { label:'워크샵',  color:'#22C55E', bg:'rgba(34,197,94,0.12)',   emoji:'🎓' },
  meetup:      { label:'밋업',    color:'#A855F7', bg:'rgba(168,85,247,0.12)',  emoji:'🤝' },
  seminar:     { label:'세미나',  color:'#06B6D4', bg:'rgba(6,182,212,0.12)',   emoji:'📢' },
  event:       { label:'이벤트',  color:'#F43F5E', bg:'rgba(244,63,94,0.12)',   emoji:'🎉' },
}

const STATUS_CONFIG = {
  ongoing:  { label:'진행 중', color:'#22C55E', pulse:true },
  upcoming: { label:'예정',    color:'#F59E0B', pulse:false },
  ended:    { label:'종료',    color:'#555',    pulse:false },
}

/* ── 이벤트 status 계산 (DB 필드 or 날짜 기반) ─────────────── */
function computeStatus(ev) {
  if (ev.status && STATUS_CONFIG[ev.status]) return ev.status
  // tags나 body에서 힌트 추출
  const tags = ev.tags || []
  if (tags.includes('진행중') || tags.includes('ongoing')) return 'ongoing'
  if (tags.includes('종료') || tags.includes('ended'))   return 'ended'
  // 날짜 필드 기반 (startDate, endDate, start_date, end_date)
  const start = ev.startDate || ev.start_date
  const end   = ev.endDate   || ev.end_date
  if (start && end) {
    const now = new Date()
    if (isPast(new Date(end)))   return 'ended'
    if (isFuture(new Date(start))) return 'upcoming'
    return 'ongoing'
  }
  if (end && isPast(new Date(end)))   return 'ended'
  // default
  return 'upcoming'
}

/* ── 이벤트 색상 (type 기반 fallback) ──────────────────────── */
function computeColor(ev) {
  if (ev.color) return ev.color
  const type = EVENT_TYPES[ev.type] || EVENT_TYPES.event
  return type.color
}

/* ── Countdown ──────────────────────────────────────────────── */
function Countdown({ endDate }) {
  if (!endDate) return null
  const days = differenceInDays(new Date(endDate), new Date())
  if (days < 0) return null
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, fontFamily:'var(--f-mono)', fontSize:10, color:days<=7?'#F43F5E':'#F59E0B' }}>
      <Timer size={10}/>{days===0?'오늘 마감':`D-${days}`}
    </div>
  )
}

/* ── Apply Modal ────────────────────────────────────────────── */
function ApplyModal({ event, onClose, user }) {
  const navigate = useNavigate()
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [message, setMessage] = useState('')
  const [done, setDone]       = useState(false)
  const color = computeColor(event)

  if (!user) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
        onClick={e=>e.target===e.currentTarget&&onClose()}>
        <div style={{ width:'100%', maxWidth:400, background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:14, padding:32, textAlign:'center' }}>
          <AlertCircle size={40} color="#F59E0B" style={{ marginBottom:16 }}/>
          <div style={{ fontFamily:'var(--f-display)', fontSize:18, fontWeight:700, color:'var(--t1)', marginBottom:10 }}>로그인이 필요합니다</div>
          <p style={{ color:'var(--t2)', fontSize:13, marginBottom:24, lineHeight:1.7 }}>이벤트에 신청하려면 먼저 로그인해 주세요.</p>
          <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
            <button onClick={onClose} style={{ padding:'9px 18px', background:'var(--bg4)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t2)', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)' }}>취소</button>
            <button onClick={()=>navigate('/login')} style={{ padding:'9px 18px', background:'linear-gradient(135deg,#3B82F6,#1D4ED8)', border:'none', borderRadius:8, color:'#fff', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)', fontWeight:600 }}>로그인</button>
          </div>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
        onClick={e=>e.target===e.currentTarget&&onClose()}>
        <div style={{ width:'100%', maxWidth:400, background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:14, padding:32, textAlign:'center' }}>
          <CheckCircle size={48} color="#22C55E" style={{ marginBottom:16 }}/>
          <div style={{ fontFamily:'var(--f-display)', fontSize:20, fontWeight:700, color:'var(--t1)', marginBottom:10 }}>신청 완료!</div>
          <p style={{ color:'var(--t2)', fontSize:13, marginBottom:24, lineHeight:1.7 }}>
            <strong>{event.title}</strong>에 신청이 접수되었습니다.<br/>이메일로 상세 안내를 보내드립니다.
          </p>
          <button onClick={onClose} style={{ padding:'10px 28px', background:'linear-gradient(135deg,#22C55E,#16A34A)', border:'none', borderRadius:9, color:'#fff', fontSize:14, cursor:'pointer', fontFamily:'var(--f-sans)', fontWeight:700 }}>확인</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:'100%', maxWidth:520, background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:14, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,.85)' }}>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--b1)', background:`linear-gradient(135deg,${color}10,transparent)`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:color, letterSpacing:'.1em', marginBottom:4 }}>{(EVENT_TYPES[event.type]||EVENT_TYPES.event)?.label?.toUpperCase()} 신청</div>
            <div style={{ fontFamily:'var(--f-display)', fontSize:16, fontWeight:700, color:'var(--t1)', lineHeight:1.3 }}>{event.title}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t3)', padding:4 }}><X size={18}/></button>
        </div>
        <div style={{ padding:'22px', display:'flex', flexDirection:'column', gap:16 }}>
          {[{label:'이름/닉네임',val:name,set:setName,ph:'본인 이름 또는 닉네임'},{label:'이메일',val:email,set:setEmail,ph:'연락 가능한 이메일'}].map((f,i)=>(
            <div key={i}>
              <div style={{ fontFamily:'var(--f-sans)', fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:6 }}>{f.label}</div>
              <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                style={{ width:'100%', padding:'10px 14px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontFamily:'var(--f-sans)', fontSize:14, outline:'none', boxSizing:'border-box', transition:'border-color .15s' }}
                onFocus={e=>e.target.style.borderColor=`${color}50`} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
            </div>
          ))}
          <div>
            <div style={{ fontFamily:'var(--f-sans)', fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:6 }}>참가 동기 (선택)</div>
            <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="간략한 참가 동기나 팀 소개를 적어주세요" rows={3}
              style={{ width:'100%', padding:'10px 14px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontFamily:'var(--f-sans)', fontSize:14, outline:'none', resize:'vertical', boxSizing:'border-box', lineHeight:1.65, transition:'border-color .15s' }}
              onFocus={e=>e.target.style.borderColor=`${color}50`} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ padding:'9px 18px', background:'var(--bg4)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t2)', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)' }}>취소</button>
            <button onClick={()=>{ if(!name.trim()||!email.trim()) return; setDone(true) }}
              style={{ padding:'9px 18px', background:`linear-gradient(135deg,${color},${color}CC)`, border:'none', borderRadius:8, color:'#fff', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)', fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
              <CheckCircle size={13}/> 신청하기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Event Card (DB community_post 기반) ────────────────────── */
function EventCard({ event, onApply }) {
  const [hov, setHov] = useState(false)
  const type    = EVENT_TYPES[event.type] || EVENT_TYPES.event
  const status  = STATUS_CONFIG[computeStatus(event)] || STATUS_CONFIG.upcoming
  const color   = computeColor(event)
  const isEnded = computeStatus(event) === 'ended'
  const endDate = event.endDate || event.end_date
  const startDate = event.startDate || event.start_date
  const fillPct = event.maxParticipants
    ? Math.min(100, Math.round(((event.participants||0)/event.maxParticipants)*100))
    : 0
  const emoji = event.emoji || type.emoji

  return (
    <div
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background:'var(--bg2)', border:`1px solid ${hov&&!isEnded?color+'40':'var(--b1)'}`,
        borderRadius:14, overflow:'hidden', cursor:'default', transition:'all .22s',
        transform:hov&&!isEnded?'translateY(-4px)':'none',
        boxShadow:hov&&!isEnded?`0 12px 36px rgba(0,0,0,.55),0 0 0 1px ${color}20`:'none',
        opacity:isEnded?.7:1, display:'flex', flexDirection:'column',
      }}>
      {/* Top accent bar */}
      <div style={{ height:4, background:isEnded?'var(--bg4)':`linear-gradient(90deg,${color},${color}80)` }}/>
      <div style={{ padding:'18px 20px', flex:1, display:'flex', flexDirection:'column', gap:12 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <div style={{ fontSize:26, lineHeight:1, flexShrink:0 }}>{emoji}</div>
            <div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                <span style={{ fontSize:9, padding:'2px 8px', borderRadius:3, background:type.bg, color:type.color, fontFamily:'var(--f-mono)', fontWeight:700 }}>{type.label}</span>
                <span style={{ fontSize:9, padding:'2px 8px', borderRadius:3, background:`${status.color}15`, color:status.color, fontFamily:'var(--f-mono)', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                  {status.pulse && <span style={{ width:5, height:5, borderRadius:'50%', background:status.color, animation:'statusPulse 1.5s ease-in-out infinite' }}/>}
                  {status.label}
                </span>
                {event.is_pinned && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:3, background:'rgba(245,158,11,.15)', color:'#F59E0B', fontFamily:'var(--f-mono)' }}>📌 공지</span>}
              </div>
              <h3 style={{ fontFamily:'var(--f-display)', fontSize:15, fontWeight:700, color:'var(--t1)', lineHeight:1.35, margin:0 }}>{event.title}</h3>
            </div>
          </div>
          {!isEnded && endDate && <Countdown endDate={endDate}/>}
        </div>

        {/* Description */}
        <p style={{ fontSize:12.5, color:'var(--t3)', lineHeight:1.65, margin:0,
          display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {event.description || (event.body||'').replace(/\*\*/g,'').slice(0,160)}
        </p>

        {/* Meta info */}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {startDate && endDate && (
            <div style={{ display:'flex', alignItems:'center', gap:7, fontFamily:'var(--f-mono)', fontSize:10.5, color:'var(--t3)' }}>
              <CalendarDays size={11} color="var(--t4)"/>
              {format(new Date(startDate),'M월 d일',{locale:ko})} ~ {format(new Date(endDate),'M월 d일',{locale:ko})}
            </div>
          )}
          {event.location && (
            <div style={{ display:'flex', alignItems:'center', gap:7, fontFamily:'var(--f-mono)', fontSize:10.5, color:'var(--t3)' }}>
              <MapPin size={11} color="var(--t4)"/> {event.location}
            </div>
          )}
          {event.prize && (
            <div style={{ display:'flex', alignItems:'center', gap:7, fontFamily:'var(--f-mono)', fontSize:10.5, color:'var(--t3)' }}>
              <Trophy size={11} color="var(--t4)"/> {event.prize}
            </div>
          )}
          {!startDate && event.created_at && (
            <div style={{ display:'flex', alignItems:'center', gap:7, fontFamily:'var(--f-mono)', fontSize:10.5, color:'var(--t4)' }}>
              <Clock size={11} color="var(--t4)"/>
              {format(new Date(event.created_at),'yyyy.MM.dd',{locale:ko})} 등록
            </div>
          )}
        </div>

        {/* Participants progress */}
        {event.maxParticipants > 0 && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'var(--f-mono)', fontSize:9.5, color:'var(--t4)', marginBottom:5 }}>
              <span><Users size={10} style={{ verticalAlign:'middle', marginRight:3 }}/>{event.participants||0}/{event.maxParticipants}명 참가</span>
              <span style={{ color:fillPct>80?'#F43F5E':'var(--t4)' }}>{fillPct}%</span>
            </div>
            <div style={{ height:3, background:'var(--bg4)', borderRadius:2, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${fillPct}%`, background:fillPct>80?'#F43F5E':color, borderRadius:2, transition:'width .6s ease' }}/>
            </div>
          </div>
        )}

        {/* Tags */}
        {(event.tags||[]).length > 0 && (
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {(event.tags||[]).slice(0,5).map(t=>(
              <span key={t} style={{ fontSize:10, padding:'2px 8px', borderRadius:4, background:`${color}10`, border:`1px solid ${color}20`, color:color, fontFamily:'var(--f-mono)' }}>#{t}</span>
            ))}
          </div>
        )}

        {/* CTA */}
        {!isEnded ? (
          <button onClick={()=>onApply(event)}
            style={{ padding:'10px', background:`linear-gradient(135deg,${color},${color}CC)`, border:'none', borderRadius:9, color:'#fff', fontSize:13, fontFamily:'var(--f-sans)', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7, transition:'opacity .15s', marginTop:'auto' }}
            onMouseEnter={e=>e.currentTarget.style.opacity='.85'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            <Rocket size={13}/> {computeStatus(event)==='ongoing'?'지금 참가하기':'사전 신청하기'}
          </button>
        ) : (
          <div style={{ padding:'10px', background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:9, fontSize:13, fontFamily:'var(--f-mono)', color:'var(--t4)', textAlign:'center', marginTop:'auto' }}>
            이벤트 종료
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main ───────────────────────────────────────────────────── */
export default function EventsPage() {
  const { user }  = useAuthStore()
  const navigate  = useNavigate()
  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState('all')
  const [applyEvent, setApplyEvent]       = useState(null)
  const [events, setEvents]               = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)

  useEffect(() => {
    setEventsLoading(true)
    supabase
      .from('community_posts')
      .select('id,title,body,tags,created_at,author_id,is_pinned,post_type')
      .eq('post_type', 'event')
      .eq('is_deleted', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data }) => {
        setEvents(data || [])
        setEventsLoading(false)
      })
      .catch(() => setEventsLoading(false))
  }, [])

  /* ── 통계 계산 ── */
  const ongoingCount  = events.filter(e=>computeStatus(e)==='ongoing').length
  const upcomingCount = events.filter(e=>computeStatus(e)==='upcoming').length
  const endedCount    = events.filter(e=>computeStatus(e)==='ended').length

  /* ── 필터 ── */
  const filtered = events.filter(e => {
    const matchSearch = !search || e.title.toLowerCase().includes(search.toLowerCase()) ||
      (e.body||'').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter==='all' || computeStatus(e)===statusFilter
    return matchSearch && matchStatus
  })

  const STATUS_FILTERS = [
    { key:'all',      label:'전체',     count: events.length },
    { key:'ongoing',  label:'진행 중',  count: ongoingCount },
    { key:'upcoming', label:'예정',     count: upcomingCount },
    { key:'ended',    label:'종료',     count: endedCount },
  ]

  return (
    <div style={{ minHeight:'100vh', paddingBottom:80 }}>
      <Helmet>
        <title>이벤트 & 챌린지 | Insightship — 청소년 창업 이벤트</title>
        <meta name="description" content="공모전, 해커톤, 워크샵, 밋업까지. 청소년 창업가를 위한 모든 이벤트와 챌린지를 한 곳에서 확인하고 신청하세요."/>
        <meta property="og:title" content="이벤트 & 챌린지 | Insightship"/>
        <meta property="og:description" content="청소년 창업가를 위한 공모전·해커톤·워크샵 총집합"/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://insightship.vercel.app/events"/>
        <meta name="twitter:card" content="summary"/>
        <meta name="twitter:title" content="이벤트 & 챌린지 | Insightship"/>
        <link rel="canonical" href="https://insightship.vercel.app/events"/>
      </Helmet>

      {/* ── HEADER ── */}
      <div style={{ background:'linear-gradient(180deg,rgba(244,63,94,0.07) 0%,transparent 100%)', borderBottom:'1px solid var(--b1)', padding:'32px var(--pad-x) 24px' }}>
        <div style={{ maxWidth:'var(--max-w)', margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20, flexWrap:'wrap' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:42, height:42, borderRadius:11, background:'rgba(244,63,94,0.15)', border:'1px solid rgba(244,63,94,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <CalendarDays size={20} color="#F43F5E"/>
                </div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#F43F5E', letterSpacing:'.16em' }}>INSIGHTSHIP · EVENTS & CHALLENGES</div>
              </div>
              <h1 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(24px,4vw,32px)', fontWeight:700, color:'var(--t1)', lineHeight:1.1, marginBottom:8 }}>이벤트 & 챌린지</h1>
              <p style={{ color:'var(--t2)', fontSize:13.5, lineHeight:1.65, maxWidth:480, margin:0 }}>공모전, 해커톤, 워크샵, 밋업까지. 청소년 창업가를 위한 모든 이벤트를 한 곳에서.</p>
            </div>

            {/* Stats */}
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              {[
                { label:'진행 중', value:ongoingCount,  color:'#22C55E' },
                { label:'예정',    value:upcomingCount, color:'#F59E0B' },
                { label:'전체',    value:events.length, color:'#3B82F6' },
              ].map((s,i)=>(
                <div key={i} style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:11, padding:'12px 18px', textAlign:'center', minWidth:64 }}>
                  <div style={{ fontFamily:'var(--f-display)', fontSize:24, fontWeight:700, color:s.color, lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:10, color:'var(--t4)', marginTop:4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:'var(--max-w)', margin:'0 auto', padding:'28px var(--pad-x)' }}>

        {/* Search + Filter row */}
        <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ position:'relative', flex:1, minWidth:200, maxWidth:360 }}>
            <Search size={13} color="var(--t4)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="이벤트 검색..."
              style={{ width:'100%', padding:'8px 12px 8px 30px', background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t1)', fontSize:12, fontFamily:'var(--f-sans)', outline:'none', boxSizing:'border-box', transition:'border-color .15s' }}
              onFocus={e=>e.currentTarget.style.borderColor='rgba(244,63,94,0.4)'}
              onBlur={e=>e.currentTarget.style.borderColor='var(--b1)'}/>
          </div>

          {/* Status filter pills */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {STATUS_FILTERS.map(f=>(
              <button key={f.key} onClick={()=>setStatusFilter(f.key)}
                style={{ padding:'6px 13px', borderRadius:20, border:`1px solid ${statusFilter===f.key?'#F43F5E':'var(--b1)'}`,
                  background:statusFilter===f.key?'rgba(244,63,94,0.12)':'var(--bg2)',
                  color:statusFilter===f.key?'#F43F5E':'var(--t3)',
                  fontSize:11, fontFamily:'var(--f-sans)', fontWeight:statusFilter===f.key?700:400,
                  cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s', display:'flex', alignItems:'center', gap:5 }}>
                {f.label}
                <span style={{ fontSize:9, opacity:.7, fontFamily:'var(--f-mono)' }}>({f.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <div style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t4)', marginBottom:16 }}>
          {eventsLoading ? '로딩 중...' : `${filtered.length}개의 이벤트`}
          {search && ` — "${search}" 검색 결과`}
        </div>

        {/* Grid */}
        {eventsLoading ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
            {Array(6).fill(0).map((_,i)=>(
              <div key={i} style={{ padding:20, background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:14, display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ height:4, background:'var(--bg3)', borderRadius:2 }}/>
                <div style={{ height:16, background:'var(--bg3)', borderRadius:4, animation:'skPulse 1.6s infinite', width:'70%' }}/>
                <div style={{ height:12, background:'var(--bg3)', borderRadius:4, animation:'skPulse 1.6s infinite' }}/>
                <div style={{ height:12, background:'var(--bg3)', borderRadius:4, animation:'skPulse 1.6s infinite', width:'55%' }}/>
              </div>
            ))}
          </div>
        ) : filtered.length===0 ? (
          <div style={{ textAlign:'center', padding:'80px 20px', color:'var(--t3)' }}>
            <CalendarDays size={52} style={{ marginBottom:16, opacity:.2 }}/>
            <div style={{ fontSize:16, fontWeight:600, color:'var(--t2)', marginBottom:8 }}>
              {search ? `"${search}"에 해당하는 이벤트가 없습니다` : '등록된 이벤트가 없습니다'}
            </div>
            <div style={{ fontSize:13, color:'var(--t4)', lineHeight:1.65 }}>
              {statusFilter !== 'all'
                ? <><button onClick={()=>setStatusFilter('all')} style={{ background:'none',border:'none',cursor:'pointer',color:'#F43F5E',fontFamily:'var(--f-sans)',fontSize:13 }}>전체 보기</button>로 필터를 초기화해 보세요.</>
                : '이벤트가 곧 업데이트됩니다. 파트너 문의를 통해 이벤트를 등록하세요.'}
            </div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
            {filtered.map(e => (
              <EventCard key={e.id} event={e} onApply={setApplyEvent}/>
            ))}
          </div>
        )}

        {/* Submit CTA */}
        <div style={{ marginTop:40, padding:'28px 32px', background:'linear-gradient(135deg,rgba(244,63,94,0.07),rgba(245,158,11,0.04))', border:'1px solid rgba(244,63,94,0.2)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <Plus size={15} color="#F43F5E"/>
              <span style={{ fontSize:15, fontWeight:700, color:'var(--t1)' }}>이벤트를 등록하고 싶으신가요?</span>
            </div>
            <p style={{ fontSize:13, color:'var(--t3)', margin:0 }}>청소년 창업 관련 이벤트를 INSIGHTSHIP에 무료로 게재할 수 있습니다.</p>
          </div>
          <button onClick={()=>navigate('/connect')}
            style={{ padding:'11px 22px', background:'rgba(244,63,94,0.15)', border:'1px solid rgba(244,63,94,0.3)', borderRadius:9, color:'#F43F5E', fontSize:13, fontFamily:'var(--f-sans)', fontWeight:700, cursor:'pointer', transition:'all .15s' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(244,63,94,0.25)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(244,63,94,0.15)'}>
            파트너 문의 →
          </button>
        </div>
      </div>

      {/* Apply Modal */}
      {applyEvent && <ApplyModal event={applyEvent} onClose={()=>setApplyEvent(null)} user={user}/>}

      <style>{`
        @keyframes statusPulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.35)}}
        @keyframes skPulse{0%,100%{opacity:1}50%{opacity:.5}}
        @media(max-width:600px){
          div[style*="minmax(300px"]{grid-template-columns:1fr!important;}
        }
      `}</style>
    </div>
  )
}
