import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays, Clock, MapPin, Users, Trophy, Zap, Filter,
  ChevronRight, ArrowRight, ExternalLink, Flame, Search,
  CheckCircle, X, Plus, Timer, Award, Target, Rocket, Globe,
  Star, Tag, AlertCircle
} from 'lucide-react'
import { useAuthStore } from '../store'
import { format, differenceInDays } from 'date-fns'
import { ko } from 'date-fns/locale'

const EVENT_TYPES = {
  challenge:  { label:'챌린지',  color:'#3B82F6', bg:'rgba(59,130,246,0.12)',  emoji:'🏆' },
  hackathon:  { label:'해커톤',  color:'#F43F5E', bg:'rgba(244,63,94,0.12)',   emoji:'💻' },
  competition:{ label:'공모전',  color:'#F59E0B', bg:'rgba(245,158,11,0.12)',  emoji:'🥇' },
  workshop:   { label:'워크샵',  color:'#22C55E', bg:'rgba(34,197,94,0.12)',   emoji:'🎓' },
  meetup:     { label:'밋업',    color:'#A855F7', bg:'rgba(168,85,247,0.12)',  emoji:'🤝' },
  seminar:    { label:'세미나',  color:'#06B6D4', bg:'rgba(6,182,212,0.12)',   emoji:'📢' },
}

const STATUS_CONFIG = {
  ongoing:  { label:'진행 중', color:'#22C55E', pulse:true },
  upcoming: { label:'예정',    color:'#F59E0B', pulse:false },
  ended:    { label:'종료',    color:'#555',    pulse:false },
}

const MOCK_EVENTS = [
  {
    id:1, title:'PACM 창업 챌린지 S2 — AI로 사회 문제 해결하기',
    type:'challenge', status:'ongoing', emoji:'🚀',
    startDate:'2026-05-01', endDate:'2026-07-31',
    location:'온라인', participants:287, maxParticipants:500,
    prize:'최대 100만원 + 멘토링', color:'#3B82F6', featured:true,
    tags:['AI','창업','소셜임팩트'],
    description:'학교·지역사회의 문제를 AI로 해결하는 아이디어를 제출하세요. 우수 팀은 PACM 대표의 1:1 피드백과 메인 페이지 게재 기회를 드립니다.',
    organizer:'PACM', requirements:['중학생~대학생','팀 1~4명','아이디어 제출'],
  },
  {
    id:2, title:'청소년 해커톤 2026 — 48시간 창업 마라톤',
    type:'hackathon', status:'upcoming', emoji:'💻',
    startDate:'2026-08-12', endDate:'2026-08-14',
    location:'서울 강남구 (오프라인)', participants:45, maxParticipants:120,
    prize:'1등 50만원 · 2등 30만원 · 3등 10만원', color:'#F43F5E', featured:true,
    tags:['해커톤','개발','48시간'],
    description:'48시간 동안 팀을 이루어 실제 작동하는 MVP를 만들어보세요. 개발자, 디자이너, 기획자 모두 참가 가능합니다.',
    organizer:'INSIGHTSHIP × PACM', requirements:['만 14세~24세','팀 2~5명','노트북 지참'],
  },
  {
    id:3, title:'제4회 청소년 창업 아이디어 공모전',
    type:'competition', status:'upcoming', emoji:'🥇',
    startDate:'2026-06-01', endDate:'2026-07-15',
    location:'온라인 접수', participants:132, maxParticipants:300,
    prize:'대상 50만원 · 우수상 20만원 × 3팀', color:'#F59E0B',
    tags:['공모전','아이디어','상금'],
    description:'청소년의 시각으로 바라본 사회 문제와 창의적 해결 아이디어를 공모합니다. 학교 생활, 환경, 복지 등 모든 분야 가능.',
    organizer:'한국청소년창업재단', requirements:['중·고등학생','개인 또는 팀','A4 2장 이내'],
  },
  {
    id:4, title:'AI 창업 기초 워크샵 — 코드 없이 AI 서비스 만들기',
    type:'workshop', status:'upcoming', emoji:'🎓',
    startDate:'2026-06-21', endDate:'2026-06-21',
    location:'줌(Zoom) 온라인', participants:38, maxParticipants:50,
    prize:'수료증 발급', color:'#22C55E',
    tags:['AI','노코드','워크샵'],
    description:'ChatGPT, Claude 등 AI 도구를 활용해 코딩 없이 나만의 AI 서비스 프로토타입을 만드는 실전 워크샵.',
    organizer:'INSIGHTSHIP 학습팀', requirements:['누구나 참가 가능','노트북 필요','무료'],
  },
  {
    id:5, title:'창업가 밋업 — 나의 첫 번째 실패 이야기',
    type:'meetup', status:'upcoming', emoji:'🤝',
    startDate:'2026-07-05', endDate:'2026-07-05',
    location:'서울 마포구 카페', participants:22, maxParticipants:30,
    prize:'네트워킹', color:'#A855F7',
    tags:['밋업','네트워킹','실패 스토리'],
    description:'실제 창업을 경험한 청소년/청년 창업가들이 모여 실패 경험을 공유합니다.',
    organizer:'PACM 커뮤니티', requirements:['만 14세~25세','사전 신청 필수','무료'],
  },
  {
    id:6, title:'2026 스타트업 투자 트렌드 세미나',
    type:'seminar', status:'ended', emoji:'📢',
    startDate:'2026-04-10', endDate:'2026-04-10',
    location:'온라인 녹화본 제공', participants:215, maxParticipants:200,
    prize:'자료집 제공', color:'#06B6D4',
    tags:['투자','트렌드','세미나'],
    description:'2026년 스타트업 투자 환경 변화와 청소년 창업가가 알아야 할 투자 유치 전략을 다룬 세미나.',
    organizer:'INSIGHTSHIP 리서치팀', requirements:['누구나','사전 신청'],
  },
]

/* ── Countdown ────────────────────────────────────────────────────── */
function Countdown({ endDate }) {
  const days = differenceInDays(new Date(endDate), new Date())
  if (days < 0) return null
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, fontFamily:'var(--f-mono)', fontSize:10, color:days<=7?'#F43F5E':'#F59E0B' }}>
      <Timer size={10}/>{days===0?'오늘 마감':`D-${days}`}
    </div>
  )
}

/* ── Apply Modal ──────────────────────────────────────────────────── */
function ApplyModal({ event, onClose, user }) {
  const navigate = useNavigate()
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [message, setMessage] = useState('')
  const [done, setDone]       = useState(false)

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
        <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--b1)', background:`linear-gradient(135deg,${event.color}10,transparent)`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:event.color, letterSpacing:'.1em', marginBottom:4 }}>{EVENT_TYPES[event.type]?.label?.toUpperCase()} 신청</div>
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
                onFocus={e=>e.target.style.borderColor=`${event.color}50`} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
            </div>
          ))}
          <div>
            <div style={{ fontFamily:'var(--f-sans)', fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:6 }}>참가 동기 (선택)</div>
            <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="간략한 참가 동기나 팀 소개를 적어주세요" rows={3}
              style={{ width:'100%', padding:'10px 14px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontFamily:'var(--f-sans)', fontSize:14, outline:'none', resize:'vertical', boxSizing:'border-box', lineHeight:1.65, transition:'border-color .15s' }}
              onFocus={e=>e.target.style.borderColor=`${event.color}50`} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ padding:'9px 18px', background:'var(--bg4)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t2)', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)' }}>취소</button>
            <button onClick={()=>{ if(!name.trim()||!email.trim()) return; setDone(true) }}
              style={{ padding:'9px 18px', background:`linear-gradient(135deg,${event.color},${event.color}CC)`, border:'none', borderRadius:8, color:'#fff', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)', fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
              <CheckCircle size={13}/> 신청하기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Event Card ───────────────────────────────────────────────────── */
function EventCard({ event, onApply }) {
  const [hov, setHov] = useState(false)
  const type   = EVENT_TYPES[event.type] || EVENT_TYPES.challenge
  const status = STATUS_CONFIG[event.status] || STATUS_CONFIG.upcoming
  const fillPct = event.maxParticipants ? Math.min(100, Math.round((event.participants/event.maxParticipants)*100)) : 0
  const isEnded = event.status === 'ended'

  return (
    <div
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background:'var(--bg2)', border:`1px solid ${hov&&!isEnded?event.color+'40':'var(--b1)'}`,
        borderRadius:14, overflow:'hidden', cursor:'default', transition:'all .22s',
        transform:hov&&!isEnded?'translateY(-4px)':'none',
        boxShadow:hov&&!isEnded?`0 12px 36px rgba(0,0,0,.55),0 0 0 1px ${event.color}20`:'none',
        opacity:isEnded?.7:1, display:'flex', flexDirection:'column',
      }}>
      {/* Top bar */}
      <div style={{ height:4, background:isEnded?'var(--bg4)':`linear-gradient(90deg,${event.color},${event.color}80)` }}/>
      <div style={{ padding:'18px 20px', flex:1, display:'flex', flexDirection:'column', gap:12 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <div style={{ fontSize:28, lineHeight:1, flexShrink:0 }}>{event.emoji}</div>
            <div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                <span style={{ fontSize:9, padding:'2px 8px', borderRadius:3, background:type.bg, color:type.color, fontFamily:'var(--f-mono)', fontWeight:700 }}>{type.label}</span>
                <span style={{ fontSize:9, padding:'2px 8px', borderRadius:3, background:`${status.color}15`, color:status.color, fontFamily:'var(--f-mono)', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                  {status.pulse && <span style={{ width:5, height:5, borderRadius:'50%', background:status.color, animation:'statusPulse 1.5s ease-in-out infinite' }}/>}
                  {status.label}
                </span>
              </div>
              <h3 style={{ fontFamily:'var(--f-display)', fontSize:15, fontWeight:700, color:'var(--t1)', lineHeight:1.35, margin:0 }}>{event.title}</h3>
            </div>
          </div>
          {!isEnded && <Countdown endDate={event.endDate}/>}
        </div>

        {/* Description */}
        <p style={{ fontSize:12.5, color:'var(--t3)', lineHeight:1.65, margin:0,
          display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {event.description}
        </p>

        {/* Meta info */}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {[
            { icon:CalendarDays, v:`${format(new Date(event.startDate),'M월 d일',{locale:ko})} ~ ${format(new Date(event.endDate),'M월 d일',{locale:ko})}` },
            { icon:MapPin,       v:event.location },
            { icon:Trophy,       v:event.prize },
          ].map(({icon:Icon,v},i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:7, fontFamily:'var(--f-mono)', fontSize:10.5, color:'var(--t3)' }}>
              <Icon size={11} color="var(--t4)"/> {v}
            </div>
          ))}
        </div>

        {/* Participants progress */}
        {event.maxParticipants && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'var(--f-mono)', fontSize:9.5, color:'var(--t4)', marginBottom:5 }}>
              <span><Users size={10} style={{ verticalAlign:'middle', marginRight:3 }}/>{event.participants}/{event.maxParticipants}명 참가</span>
              <span style={{ color:fillPct>80?'#F43F5E':'var(--t4)' }}>{fillPct}%</span>
            </div>
            <div style={{ height:3, background:'var(--bg4)', borderRadius:2, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${fillPct}%`, background:fillPct>80?'#F43F5E':event.color, borderRadius:2, transition:'width .6s ease' }}/>
            </div>
          </div>
        )}

        {/* Tags */}
        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          {event.tags?.map(t=>(
            <span key={t} style={{ fontSize:10, padding:'2px 8px', borderRadius:4, background:`${event.color}10`, border:`1px solid ${event.color}20`, color:event.color, fontFamily:'var(--f-mono)' }}>#{t}</span>
          ))}
        </div>

        {/* CTA */}
        {!isEnded ? (
          <button onClick={()=>onApply(event)}
            style={{ padding:'10px', background:`linear-gradient(135deg,${event.color},${event.color}CC)`, border:'none', borderRadius:9, color:'#fff', fontSize:13, fontFamily:'var(--f-sans)', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7, transition:'opacity .15s' }}
            onMouseEnter={e=>e.currentTarget.style.opacity='.85'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            <Rocket size={13}/> {event.status==='ongoing'?'지금 참가하기':'사전 신청하기'}
          </button>
        ) : (
          <div style={{ padding:'10px', background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:9, fontSize:13, fontFamily:'var(--f-mono)', color:'var(--t4)', textAlign:'center' }}>
            이벤트 종료
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────────── */
export default function EventsPage() {
  const { user }  = useAuthStore()
  const navigate  = useNavigate()
  const [filter, setFilter]       = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch]         = useState('')
  const [applyEvent, setApplyEvent] = useState(null)

  const STATUS_FILTERS = [
    { key:'all',     label:'전체' },
    { key:'ongoing', label:'🔴 진행 중' },
    { key:'upcoming',label:'🟡 예정' },
    { key:'ended',   label:'⚫ 종료' },
  ]

  const filtered = MOCK_EVENTS.filter(e => {
    const matchStatus = filter==='all'||e.status===filter
    const matchType   = typeFilter==='all'||e.type===typeFilter
    const matchSearch = !search||e.title.toLowerCase().includes(search.toLowerCase())||e.description.includes(search)
    return matchStatus&&matchType&&matchSearch
  })

  const featured = MOCK_EVENTS.filter(e=>e.featured&&e.status!=='ended')
  const ongoing  = MOCK_EVENTS.filter(e=>e.status==='ongoing').length
  const upcoming = MOCK_EVENTS.filter(e=>e.status==='upcoming').length

  return (
    <div style={{ minHeight:'100vh', paddingBottom:80 }}>
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
            <div style={{ display:'flex', gap:12 }}>
              {[
                { label:'진행 중', value:ongoing,           color:'#22C55E' },
                { label:'예정',    value:upcoming,          color:'#F59E0B' },
                { label:'전체',    value:MOCK_EVENTS.length, color:'#3B82F6' },
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
        {/* Featured */}
        {featured.length>0 && filter==='all' && (
          <div style={{ marginBottom:36 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
              <Flame size={16} color="#F43F5E"/>
              <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'#F43F5E', letterSpacing:'.1em' }}>주목 이벤트</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:16 }}>
              {featured.map(e=><EventCard key={e.id} event={e} onApply={setApplyEvent}/>)}
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {STATUS_FILTERS.map(f=>(
              <button key={f.key} onClick={()=>setFilter(f.key)}
                style={{ padding:'7px 14px', borderRadius:8, cursor:'pointer', fontFamily:'var(--f-sans)', fontSize:12, fontWeight:filter===f.key?600:400,
                  background:filter===f.key?'rgba(244,63,94,0.12)':'var(--bg2)', color:filter===f.key?'#F43F5E':'var(--t3)',
                  border:`1px solid ${filter===f.key?'rgba(244,63,94,0.3)':'var(--b1)'}`, transition:'all .15s' }}>
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
              style={{ padding:'7px 12px', background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t2)', fontSize:12, fontFamily:'var(--f-sans)', outline:'none', cursor:'pointer' }}>
              <option value="all">모든 유형</option>
              {Object.entries(EVENT_TYPES).map(([k,v])=>(
                <option key={k} value={k}>{v.emoji} {v.label}</option>
              ))}
            </select>
            <div style={{ position:'relative' }}>
              <Search size={13} color="var(--t4)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="이벤트 검색..."
                style={{ padding:'7px 12px 7px 30px', background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t1)', fontSize:12, fontFamily:'var(--f-sans)', outline:'none', width:160, transition:'border-color .15s' }}
                onFocus={e=>e.currentTarget.style.borderColor='rgba(244,63,94,0.4)'}
                onBlur={e=>e.currentTarget.style.borderColor='var(--b1)'}/>
            </div>
          </div>
        </div>

        {/* Count */}
        <div style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t4)', marginBottom:14 }}>{filtered.length}개의 이벤트</div>

        {/* Grid */}
        {filtered.length===0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t3)' }}>
            <CalendarDays size={40} style={{ marginBottom:16, opacity:.25 }}/>
            <div style={{ fontSize:15 }}>해당 조건의 이벤트가 없습니다.</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
            {filtered.map(e=><EventCard key={e.id} event={e} onApply={setApplyEvent}/>)}
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

      {applyEvent && <ApplyModal event={applyEvent} onClose={()=>setApplyEvent(null)} user={user}/>}

      <style>{`@keyframes statusPulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.35)}}`}</style>
    </div>
  )
}
