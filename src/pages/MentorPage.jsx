import { useState, useRef, useEffect, useCallback } from 'react'
import { Helmet } from 'react-helmet-async'
import {
  BrainCircuit, Send, RefreshCw, Sparkles, ThumbsUp, ThumbsDown,
  Copy, Check, ChevronRight, MessageSquare, User, Bot,
  BookOpen, Shield, Rocket, Target, Lightbulb, Cpu, Activity,
  TrendingUp, Database, Zap, BarChart2, Clock, AlertCircle
} from 'lucide-react'
import { useAuthStore } from '../store'
import { useNavigate } from 'react-router-dom'

const SESSION_ID = `sess_${Date.now()}_${Math.random().toString(36).slice(2,8)}`

const STARTER_PROMPTS = [
  { icon:'💡', label:'아이디어 검증',  text:'제 창업 아이디어를 검증해 주세요: ' },
  { icon:'📋', label:'린 캔버스',      text:'린 캔버스 작성을 도와주세요. 제 아이디어는: ' },
  { icon:'🎯', label:'MVP 설계',       text:'MVP를 어떻게 설계해야 할지 알려주세요. 제 서비스는: ' },
  { icon:'💰', label:'수익 모델',      text:'다음 아이디어의 수익 모델을 제안해 주세요: ' },
  { icon:'📊', label:'시장 분석',      text:'TAM/SAM/SOM 시장 분석을 도와주세요. 분야는: ' },
  { icon:'🚀', label:'피치덱',         text:'투자자 피치덱 구성을 도와주세요. 제 스타트업은: ' },
  { icon:'🔬', label:'수익 시뮬레이션',text:'수익 시뮬레이션 해줘. 사용자 1000명, 전환율 5%, 단가 9900원' },
  { icon:'🏆', label:'정부 지원',      text:'청소년이 지원 가능한 창업 지원 프로그램을 알려주세요.' },
]

const LEAN_CANVAS = [
  { key:'problem',   label:'문제',          hint:'고객이 겪는 상위 3가지 고통점', icon:'🔴', color:'#F43F5E' },
  { key:'solution',  label:'해결책',        hint:'각 문제를 해결하는 핵심 기능',  icon:'💡', color:'#F59E0B' },
  { key:'uvp',       label:'고유 가치 제안',hint:'"왜 우리인가?" 한 문장으로',    icon:'⭐', color:'#3B82F6' },
  { key:'advantage', label:'경쟁 우위',     hint:'쉽게 복제할 수 없는 강점',     icon:'🛡️', color:'#10B981' },
  { key:'channels',  label:'채널',          hint:'고객에게 닿는 방법',           icon:'📡', color:'#A855F7' },
  { key:'segments',  label:'고객 세그먼트', hint:'초기 타깃 고객은?',            icon:'👥', color:'#06B6D4' },
  { key:'cost',      label:'비용 구조',     hint:'주요 지출 항목',              icon:'💸', color:'#F97316' },
  { key:'revenue',   label:'수익 구조',     hint:'돈을 버는 방법',              icon:'💰', color:'#22C55E' },
  { key:'metrics',   label:'핵심 지표',     hint:'성공을 측정하는 KPI',          icon:'📊', color:'#60A5FA' },
]

const SIM_EXAMPLES = [
  { label:'수익 시뮬레이션', text:'수익 시뮬레이션 해줘. 월 구독 9900원, 사용자 500명, 전환율 3%, 월 성장 15%' },
  { label:'시장 규모 계산', text:'시장 규모 시뮬레이션 해줘. 국내 고등학생 150만명 타깃, ARPU 월 5000원' },
  { label:'성장 시나리오', text:'성장 시나리오 시뮬레이션 해줘. 초기 사용자 100명, 월 성장률 20%' },
  { label:'리스크 분석', text:'리스크 시뮬레이션 해줘. AI 에듀테크 스타트업 초기 단계' },
]

const EXAMPLES = [
  { q:'청소년이 창업할 때 가장 중요한 것은?',    tag:'기초' },
  { q:'린 캔버스 9개 블록을 설명해주세요',       tag:'도구' },
  { q:'MVP를 빠르게 만드는 방법이 있나요?',      tag:'제품' },
  { q:'청소년이 투자받을 수 있는 방법은?',       tag:'투자' },
  { q:'창업 팀원을 어디서 찾나요?',             tag:'팀'   },
  { q:'정부 지원 창업 프로그램을 알려주세요',    tag:'지원' },
  { q:'수익 모델은 어떻게 정하나요?',           tag:'수익' },
  { q:'아이디어를 검증하는 방법은?',            tag:'검증' },
  { q:'시장 규모 시뮬레이션 해줘',              tag:'시뮬' },
  { q:'AI 스타트업 최신 투자 트렌드 조사해줘',   tag:'리서치' },
]

const INTENT_KO = {
  lean_canvas:'린캔버스', mvp:'MVP', idea_validation:'아이디어검증',
  revenue_model:'수익모델', pitch_deck:'피치덱', team_building:'팀구성',
  market_analysis:'시장분석', funding:'투자', government_support:'정부지원',
  startup_basics:'창업기초', marketing:'마케팅', legal_tax:'법률/세무',
  failure_lesson:'극복', simulation:'시뮬레이션', research_request:'리서치',
  greeting:'인사', general:'일반',
}

/* ── 마크다운 렌더러 ─────────────────────────────────── */
function Md({ text }) {
  if (!text) return null
  return (<>
    {text.split('\n').map((line, i) => {
      if (!line.trim()) return <div key={i} style={{ height:6 }} />
      if (line.startsWith('## ')) {
        return <div key={i} style={{ fontSize:13, fontWeight:700, color:'var(--t1)', marginTop:14, marginBottom:5 }}>
          {line.slice(3).split(/\*\*(.*?)\*\*/g).map((p,j)=>j%2===1?<strong key={j}>{p}</strong>:p)}
        </div>
      }
      if (line.startsWith('→ ')) {
        const parts = line.slice(2).split(/\*\*(.*?)\*\*/g)
        return <div key={i} style={{ display:'flex', gap:6, marginBottom:4, paddingLeft:4 }}>
          <span style={{ color:'#A855F7', flexShrink:0, marginTop:1 }}>→</span>
          <span style={{ fontSize:13, color:'var(--t2)', lineHeight:1.7 }}>
            {parts.map((p,j)=>j%2===1?<strong key={j} style={{ color:'var(--t1)' }}>{p}</strong>:p)}
          </span>
        </div>
      }
      if (line.startsWith('• ')) {
        return <div key={i} style={{ display:'flex', gap:6, marginBottom:3, paddingLeft:4 }}>
          <span style={{ color:'#3B82F6', flexShrink:0 }}>•</span>
          <span style={{ fontSize:13, color:'var(--t2)', lineHeight:1.7 }}>{line.slice(2)}</span>
        </div>
      }
      const parts = line.split(/\*\*(.*?)\*\*/g)
      return <div key={i} style={{ fontSize:13.5, color:'var(--t2)', lineHeight:1.75, marginBottom:2 }}>
        {parts.map((p,j)=>j%2===1?<strong key={j} style={{ color:'var(--t1)' }}>{p}</strong>:p)}
      </div>
    })}
  </>)
}

/* ── 스트리밍 커서 ─────────────────────────────────── */
function Cursor() {
  return <span style={{ display:'inline-block', width:2, height:14, background:'#A855F7',
    borderRadius:1, marginLeft:2, animation:'blink .7s steps(1) infinite', verticalAlign:'middle' }}/>
}

/* ── 메시지 버블 ─────────────────────────────────── */
function Bubble({ msg, streaming }) {
  const [copied, setCopied] = useState(false)
  const [fb, setFb] = useState(null)
  const isUser = msg.role === 'user'

  const copy = () => {
    navigator.clipboard.writeText(msg.content)
    setCopied(true); setTimeout(()=>setCopied(false), 2000)
  }
  const sendFb = async (r) => {
    if (fb || !msg.logId) return
    setFb(r)
    try { await fetch('/api/ai-mentor-learn', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'feedback', logId:msg.logId, rating:r }) }) } catch {}
  }

  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start',
      flexDirection:isUser?'row-reverse':'row', marginBottom:20, animation:'fbUp .25s ease' }}>
      <div style={{ width:33, height:33, borderRadius:'50%', flexShrink:0, marginTop:2,
        background:isUser?'linear-gradient(135deg,#3B82F6,#1D4ED8)':'linear-gradient(135deg,#A855F7,#7C3AED)',
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow:isUser?'0 2px 10px rgba(59,130,246,.3)':'0 2px 10px rgba(168,85,247,.3)' }}>
        {isUser ? <User size={14} color="#fff"/> : <Bot size={14} color="#fff"/>}
      </div>
      <div style={{ maxWidth:'78%', minWidth:80 }}>
        {!isUser && <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#A855F7', letterSpacing:'.1em', marginBottom:4 }}>PACM-AI v4</div>}
        <div style={{ padding:'13px 16px',
          borderRadius:isUser?'16px 4px 16px 16px':'4px 16px 16px 16px',
          background:isUser?'linear-gradient(135deg,#3B82F6,#1D4ED8)':'var(--bg3)',
          border:isUser?'none':'1px solid var(--b2)',
          boxShadow:isUser?'0 4px 16px rgba(59,130,246,.2)':'var(--sh-sm)' }}>
          {isUser
            ? <div style={{ fontSize:14, color:'#fff', lineHeight:1.6 }}>{msg.content}</div>
            : <><Md text={msg.content}/>{streaming && <Cursor/>}</>
          }
        </div>
        {/* 메타 정보 + 액션 */}
        <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:5, paddingLeft:2, flexWrap:'wrap' }}>
          <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)' }}>
            {new Date(msg.ts).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}
          </span>
          {msg.intent && (
            <span style={{ fontFamily:'var(--f-mono)', fontSize:8, color:'#A855F7',
              background:'rgba(168,85,247,.1)', border:'1px solid rgba(168,85,247,.2)',
              borderRadius:3, padding:'1px 5px' }}>
              {INTENT_KO[msg.intent]||msg.intent}
            </span>
          )}
          {msg.sim && (
            <span style={{ fontFamily:'var(--f-mono)', fontSize:8, color:'#22C55E',
              background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.2)',
              borderRadius:3, padding:'1px 5px' }}>
              🔬 {msg.sim}
            </span>
          )}
          {msg.elapsed && (
            <span style={{ fontFamily:'var(--f-mono)', fontSize:8, color:'var(--t4)',
              background:'var(--bg4)', borderRadius:3, padding:'1px 5px' }}>
              {msg.elapsed}ms
            </span>
          )}
          {!isUser && !streaming && (
            <div style={{ display:'flex', gap:2, marginLeft:2 }}>
              <button onClick={copy} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--t4)',padding:'2px 4px',display:'flex',transition:'color .15s' }}
                onMouseEnter={e=>e.currentTarget.style.color='var(--t2)'}
                onMouseLeave={e=>e.currentTarget.style.color='var(--t4)'}>
                {copied?<Check size={11} color="#22C55E"/>:<Copy size={11}/>}
              </button>
              {msg.logId && <>
                <button onClick={()=>sendFb('good')}
                  style={{ background:fb==='good'?'rgba(34,197,94,.15)':'none',border:'none',cursor:'pointer',
                    color:fb==='good'?'#22C55E':'var(--t4)',padding:'2px 4px',display:'flex',transition:'all .15s',borderRadius:4 }}
                  onMouseEnter={e=>{if(!fb)e.currentTarget.style.color='#22C55E'}}
                  onMouseLeave={e=>{if(fb!=='good')e.currentTarget.style.color='var(--t4)'}}>
                  <ThumbsUp size={11}/>
                </button>
                <button onClick={()=>sendFb('bad')}
                  style={{ background:fb==='bad'?'rgba(244,63,94,.15)':'none',border:'none',cursor:'pointer',
                    color:fb==='bad'?'#F43F5E':'var(--t4)',padding:'2px 4px',display:'flex',transition:'all .15s',borderRadius:4 }}
                  onMouseEnter={e=>{if(!fb)e.currentTarget.style.color='#F43F5E'}}
                  onMouseLeave={e=>{if(fb!=='bad')e.currentTarget.style.color='var(--t4)'}}>
                  <ThumbsDown size={11}/>
                </button>
              </>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:16 }}>
      <div style={{ width:33, height:33, borderRadius:'50%', background:'linear-gradient(135deg,#A855F7,#7C3AED)',
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Bot size={14} color="#fff"/>
      </div>
      <div style={{ padding:'14px 18px', background:'var(--bg3)', border:'1px solid var(--b2)',
        borderRadius:'4px 16px 16px 16px', display:'flex', gap:5, alignItems:'center' }}>
        {[0,1,2].map(i=>(
          <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:'#A855F7',
            animation:`tp 1.4s ease-in-out ${i*.2}s infinite` }}/>
        ))}
        <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)', marginLeft:4 }}>사고 중…</span>
      </div>
    </div>
  )
}

/* ── 사고 과정 패널 ─────────────────────────────────── */
function ThinkingPanel({ intent, knowledge, articles, sim, elapsed, confidence }) {
  if (!intent) return null
  return (
    <div style={{ background:'rgba(168,85,247,.05)', border:'1px solid rgba(168,85,247,.15)',
      borderRadius:10, padding:'12px 14px', marginBottom:10, fontSize:11, fontFamily:'var(--f-mono)' }}>
      <div style={{ color:'#A855F7', marginBottom:8, fontWeight:700, fontSize:10, letterSpacing:'.1em' }}>
        ⚙️ AI 사고 과정
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        <span style={{ color:'var(--t3)' }}>의도:</span>
        <span style={{ color:'#A855F7' }}>{INTENT_KO[intent]||intent}</span>
        {confidence && <><span style={{ color:'var(--t4)' }}>|</span>
          <span style={{ color:'var(--t3)' }}>신뢰도:</span>
          <span style={{ color:'#22C55E' }}>{parseFloat(confidence).toFixed(0)}점</span></>}
        {knowledge > 0 && <><span style={{ color:'var(--t4)' }}>|</span>
          <span style={{ color:'var(--t3)' }}>지식:</span>
          <span style={{ color:'#3B82F6' }}>{knowledge}건</span></>}
        {articles > 0 && <><span style={{ color:'var(--t4)' }}>|</span>
          <span style={{ color:'var(--t3)' }}>아티클:</span>
          <span style={{ color:'#F97316' }}>{articles}건</span></>}
        {sim && <><span style={{ color:'var(--t4)' }}>|</span>
          <span style={{ color:'var(--t3)' }}>시뮬:</span>
          <span style={{ color:'#22C55E' }}>{sim}</span></>}
        {elapsed && <><span style={{ color:'var(--t4)' }}>|</span>
          <span style={{ color:'var(--t3)' }}>응답:</span>
          <span style={{ color:'#60A5FA' }}>{elapsed}ms</span></>}
      </div>
    </div>
  )
}

/* ── 린 캔버스 탭 ─────────────────────────────────── */
function LeanCanvasTab({ onSend }) {
  const [d, setD] = useState({})
  const [ok, setOk] = useState(false)
  const go = () => {
    const filled = LEAN_CANVAS.filter(b=>d[b.key]?.trim())
    if (!filled.length) return
    onSend('제가 작성한 린 캔버스를 검토하고 피드백 주세요:\n\n' + filled.map(b=>`**${b.label}:** ${d[b.key]}`).join('\n'))
    setOk(true); setTimeout(()=>setOk(false),3000)
  }
  return (
    <div>
      <div style={{ padding:'12px 16px', background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.15)',
        borderRadius:10, fontSize:13, color:'var(--t2)', lineHeight:1.7, marginBottom:18 }}>
        📋 각 항목을 채우고 <strong style={{ color:'#3B82F6' }}>AI 피드백 받기</strong> 버튼을 누르면 PACM-AI가 전체 검토해 드립니다.
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
        {LEAN_CANVAS.map(b=>(
          <div key={b.key} style={{ background:'var(--bg2)', border:`1px solid ${b.color}22`,
            borderRadius:10, overflow:'hidden', transition:'border-color .2s' }}
            onFocusCapture={e=>e.currentTarget.style.borderColor=`${b.color}55`}
            onBlurCapture={e=>e.currentTarget.style.borderColor=`${b.color}22`}>
            <div style={{ padding:'9px 12px', borderBottom:`1px solid ${b.color}18`,
              display:'flex', alignItems:'center', gap:7, background:`${b.color}09` }}>
              <span>{b.icon}</span>
              <span style={{ fontSize:11, fontWeight:700, color:b.color }}>{b.label}</span>
            </div>
            <textarea value={d[b.key]||''} onChange={e=>setD(p=>({...p,[b.key]:e.target.value}))}
              placeholder={b.hint}
              style={{ width:'100%', minHeight:88, padding:'10px 12px', background:'transparent',
                border:'none', outline:'none', resize:'none', fontSize:12, color:'var(--t2)',
                fontFamily:'var(--f-sans)', lineHeight:1.65, boxSizing:'border-box' }}/>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'center', gap:10, marginTop:18 }}>
        <button onClick={go} style={{ padding:'11px 28px',
          background:ok?'rgba(34,197,94,.2)':'linear-gradient(135deg,#A855F7,#7C3AED)',
          border:ok?'1px solid #22C55E':'none', borderRadius:8,
          color:ok?'#22C55E':'#fff', fontSize:13, fontFamily:'var(--f-sans)', fontWeight:600,
          cursor:'pointer', display:'flex', alignItems:'center', gap:7, transition:'all .2s' }}>
          {ok?<><Check size={14}/>전송됨!</>:<><Sparkles size={14}/>AI 피드백 받기</>}
        </button>
        <button onClick={()=>setD({})} style={{ padding:'11px 20px', background:'var(--bg3)',
          border:'1px solid var(--b2)', borderRadius:8, color:'var(--t2)', fontSize:13,
          fontFamily:'var(--f-sans)', cursor:'pointer' }}>초기화</button>
      </div>
    </div>
  )
}

/* ── 시뮬레이션 탭 ─────────────────────────────────── */
function SimulationTab({ onSend }) {
  const [type, setType] = useState('revenue')
  const [params, setParams] = useState({ users:1000, convRate:5, price:9900, growth:15 })

  const TYPES = [
    { id:'revenue', label:'💰 수익 시뮬레이션', desc:'월별 MRR·ARR 예측' },
    { id:'market',  label:'📊 시장 규모',       desc:'TAM/SAM/SOM 자동 계산' },
    { id:'growth',  label:'📈 성장 시나리오',   desc:'3가지 시나리오 비교' },
    { id:'risk',    label:'⚠️ 리스크 분석',     desc:'실패 요인 시뮬레이션' },
  ]

  const buildPrompt = () => {
    if (type==='revenue') return `수익 시뮬레이션 해줘. 초기 사용자 ${params.users}명, 전환율 ${params.convRate}%, 단가 ${params.price}원, 월 성장률 ${params.growth}%`
    if (type==='market')  return `시장 규모 시뮬레이션 해줘. 타깃 인구 ${params.users}만명, ARPU 월 ${params.price}원`
    if (type==='growth')  return `성장 시나리오 시뮬레이션 해줘. 초기 사용자 ${params.users}명, 기본 성장률 ${params.growth}%`
    return `리스크 시뮬레이션 해줘. 스타트업 초기 단계 위험 분석`
  }

  return (
    <div>
      <div style={{ padding:'12px 16px', background:'rgba(34,197,94,.06)', border:'1px solid rgba(34,197,94,.15)',
        borderRadius:10, fontSize:13, color:'var(--t2)', lineHeight:1.7, marginBottom:18 }}>
        🔬 PACM-AI 시뮬레이션 엔진 — 외부 API 없이 자체 알고리즘으로 계산합니다.
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:20 }}>
        {TYPES.map(t=>(
          <button key={t.id} onClick={()=>setType(t.id)}
            style={{ padding:'12px 14px', background:type===t.id?'rgba(34,197,94,.12)':'var(--bg2)',
              border:`1px solid ${type===t.id?'rgba(34,197,94,.35)':'var(--b1)'}`,
              borderRadius:10, textAlign:'left', cursor:'pointer', transition:'all .15s' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--t1)', marginBottom:3 }}>{t.label}</div>
            <div style={{ fontSize:11, color:'var(--t3)', fontFamily:'var(--f-mono)' }}>{t.desc}</div>
          </button>
        ))}
      </div>
      {type==='revenue' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
          {[
            { key:'users', label:'초기 사용자 수', unit:'명', min:10, max:100000 },
            { key:'convRate', label:'유료 전환율', unit:'%', min:0.1, max:50, step:0.1 },
            { key:'price', label:'월 구독 단가', unit:'원', min:100, max:99900 },
            { key:'growth', label:'월 성장률', unit:'%', min:0, max:200 },
          ].map(f=>(
            <div key={f.key}>
              <label style={{ fontSize:11, color:'var(--t3)', fontFamily:'var(--f-mono)', marginBottom:5, display:'block' }}>{f.label}</label>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="number" value={params[f.key]} min={f.min} max={f.max} step={f.step||1}
                  onChange={e=>setParams(p=>({...p,[f.key]:+e.target.value}))}
                  style={{ flex:1, padding:'8px 10px', background:'var(--bg3)', border:'1px solid var(--b2)',
                    borderRadius:7, color:'var(--t1)', fontSize:13, fontFamily:'var(--f-sans)', outline:'none' }}/>
                <span style={{ fontSize:11, color:'var(--t3)', minWidth:20 }}>{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {type==='market' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
          {[
            { key:'users', label:'타깃 인구', unit:'만명' },
            { key:'price', label:'월 ARPU', unit:'원' },
          ].map(f=>(
            <div key={f.key}>
              <label style={{ fontSize:11, color:'var(--t3)', fontFamily:'var(--f-mono)', marginBottom:5, display:'block' }}>{f.label}</label>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="number" value={params[f.key]}
                  onChange={e=>setParams(p=>({...p,[f.key]:+e.target.value}))}
                  style={{ flex:1, padding:'8px 10px', background:'var(--bg3)', border:'1px solid var(--b2)',
                    borderRadius:7, color:'var(--t1)', fontSize:13, fontFamily:'var(--f-sans)', outline:'none' }}/>
                <span style={{ fontSize:11, color:'var(--t3)', minWidth:20 }}>{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {(type==='growth'||type==='risk') && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
          {[
            { key:'users', label:'초기 사용자', unit:'명' },
            { key:'growth', label:'기본 성장률', unit:'%' },
          ].map(f=>(
            <div key={f.key}>
              <label style={{ fontSize:11, color:'var(--t3)', fontFamily:'var(--f-mono)', marginBottom:5, display:'block' }}>{f.label}</label>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="number" value={params[f.key]}
                  onChange={e=>setParams(p=>({...p,[f.key]:+e.target.value}))}
                  style={{ flex:1, padding:'8px 10px', background:'var(--bg3)', border:'1px solid var(--b2)',
                    borderRadius:7, color:'var(--t1)', fontSize:13, fontFamily:'var(--f-sans)', outline:'none' }}/>
                <span style={{ fontSize:11, color:'var(--t3)', minWidth:20 }}>{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {SIM_EXAMPLES.map((ex,i)=>(
        <button key={i} onClick={()=>onSend(ex.text)}
          style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px',
            background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, marginBottom:6,
            cursor:'pointer', color:'var(--t2)', fontSize:12, fontFamily:'var(--f-sans)', transition:'all .15s' }}
          onMouseEnter={e=>{ e.currentTarget.style.borderColor='rgba(34,197,94,.35)'; e.currentTarget.style.color='var(--t1)' }}
          onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--b1)'; e.currentTarget.style.color='var(--t2)' }}>
          <span style={{ marginRight:8, fontFamily:'var(--f-mono)', fontSize:10, color:'#22C55E' }}>예시</span>{ex.label}
        </button>
      ))}
      <button onClick={()=>onSend(buildPrompt())}
        style={{ width:'100%', padding:'13px', marginTop:10,
          background:'linear-gradient(135deg,#22C55E,#16A34A)', border:'none', borderRadius:10,
          color:'#fff', fontSize:14, fontFamily:'var(--f-sans)', fontWeight:600,
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        <BarChart2 size={15}/> 지금 시뮬레이션 실행
      </button>
    </div>
  )
}

/* ── 메인 컴포넌트 ─────────────────────────────────── */
export default function MentorPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [msgs, setMsgs] = useState([{
    role:'assistant',
    content:'안녕하세요! 👋 저는 **PACM-AI 멘토 v4**입니다.\n\n청소년 창업가를 위한 24시간 **완전 자체 AI** — 외부 API 없이 자체 엔진으로 동작합니다.\n\n→ 💡 **아이디어 검증** · **린 캔버스** · **MVP 설계**\n→ 💰 **수익 모델** · **시장 분석** · **피치덱**\n→ 🔬 **수익/시장/성장 시뮬레이션** (실시간 계산)\n→ 🔍 **자체 리서치** — DB 다중 소스 실시간 탐색\n→ 👥 **팀 구성** · **정부 지원** · **창업 고민**\n\n무엇이든 물어보세요!',
    ts:Date.now(), logId:null, intent:null,
  }])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [streaming, setStreaming]  = useState(false)
  const [tab, setTab]             = useState('chat')
  const [sessionMsgs, setSessionMsgs] = useState(0)
  const [knowledgeUsed, setKnowledgeUsed] = useState(0)
  const [lastThinking, setLastThinking]   = useState(null)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(()=>{ bottomRef.current?.scrollIntoView({ behavior:'smooth' }) },[msgs, loading])

  /* ── 스트리밍 send ─────────────────────── */
  const send = useCallback(async (text) => {
    const t = (text || input).trim()
    if (!t || loading) return
    const userMsg = { role:'user', content:t, ts:Date.now() }
    setMsgs(p=>[...p, userMsg])
    setInput('')
    setLoading(true)
    setLastThinking(null)

    try {
      const history = [...msgs, userMsg].slice(-12).map(m=>({ role:m.role, content:m.content }))
      const res = await fetch('/api/ai-mentor', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ messages:history, sessionId:SESSION_ID, userId:user?.id||null, stream:true }),
      })
      if (!res.ok) throw new Error('api error')

      const contentType = res.headers.get('content-type') || ''

      // ── 스트리밍 응답 처리 (SSE)
      if (contentType.includes('text/event-stream')) {
        setStreaming(true)
        setLoading(false)

        // 빈 AI 메시지 먼저 추가
        const aiMsgId = Date.now()
        setMsgs(p=>[...p, { id:aiMsgId, role:'assistant', content:'', ts:Date.now(), logId:null, intent:null, streaming:true }])

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let metaInfo = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream:true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const chunk = JSON.parse(line.slice(6))
              if (chunk.type === 'meta') {
                metaInfo = chunk
                setLastThinking({ intent:chunk.intent, confidence:chunk.intent_confidence,
                  knowledge:chunk.knowledge_used, articles:chunk.articles_used, sim:chunk.simulation })
              } else if (chunk.type === 'text') {
                setMsgs(p => p.map(m => m.id === aiMsgId
                  ? { ...m, content: m.content + chunk.text }
                  : m))
              } else if (chunk.type === 'done') {
                setMsgs(p => p.map(m => m.id === aiMsgId
                  ? { ...m, logId:chunk.logId, intent:metaInfo?.intent||null,
                      sim:metaInfo?.simulation||null, elapsed:chunk.elapsed_ms, streaming:false }
                  : m))
                setKnowledgeUsed(v=>Math.max(v, metaInfo?.knowledge_used||0))
                setSessionMsgs(v=>v+1)
                if (metaInfo?.elapsed_ms) {
                  setLastThinking(prev=>prev?{...prev, elapsed:metaInfo.elapsed_ms}:prev)
                }
              }
            } catch {}
          }
        }
        setStreaming(false)

      } else {
        // ── 비스트리밍 폴백
        const data = await res.json()
        setMsgs(p=>[...p, {
          role:'assistant', content:data.reply||'응답을 생성할 수 없습니다.',
          ts:Date.now(), logId:data.logId||null, intent:data.intent||null,
          sim:data.simulation||null, elapsed:data.elapsed_ms||null,
        }])
        setLastThinking({ intent:data.intent, confidence:data.intent_confidence,
          knowledge:data.knowledge_used, articles:data.articles_used,
          sim:data.simulation, elapsed:data.elapsed_ms })
        setSessionMsgs(p=>p+1)
        setKnowledgeUsed(p=>Math.max(p, data.knowledge_used||0))
        setLoading(false)
      }
    } catch {
      setMsgs(p=>[...p, {
        role:'assistant',
        content:'일시적인 오류가 발생했습니다.\n→ 인터넷 연결을 확인해 주세요\n→ 잠시 후 다시 시도해 주세요',
        ts:Date.now(), logId:null, intent:null,
      }])
      setLoading(false)
      setStreaming(false)
    }
  }, [input, loading, msgs, user])

  const reset = () => {
    setMsgs([{ role:'assistant', content:'새 대화를 시작합니다! 무엇이든 물어보세요. 🚀', ts:Date.now(), logId:null, intent:null }])
    setInput('')
    setLastThinking(null)
  }

  const TABS = [
    { id:'chat',       label:'💬 AI 멘토 채팅' },
    { id:'simulation', label:'🔬 시뮬레이션' },
    { id:'canvas',     label:'📋 린 캔버스' },
    { id:'examples',   label:'📚 예시 질문' },
  ]

  return (
    <div style={{ paddingBottom:80 }}>
      <Helmet>
        <title>AI 멘토 | Insightship — 청소년 창업 AI 코치</title>
        <meta name="description" content="PACM-AI 멘토가 아이디어 검증, 린 캔버스, MVP 설계, 수익 시뮬레이션까지 24시간 무료로 도와줍니다. 외부 API 없는 완전 자체 AI 엔진."/>
        <meta property="og:title" content="AI 멘토 | Insightship"/>
        <meta property="og:description" content="청소년 창업가를 위한 24시간 무료 AI 멘토 — 아이디어 검증부터 피치덱까지"/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://insightship.vercel.app/mentor"/>
        <meta name="twitter:card" content="summary"/>
        <meta name="twitter:title" content="AI 멘토 | Insightship"/>
        <meta name="twitter:description" content="PACM-AI v4 — 청소년 창업 전용 자체 AI 코치. 외부 API 비용 0원."/>
        <link rel="canonical" href="https://insightship.vercel.app/mentor"/>
      </Helmet>
      {/* ── 헤더 ── */}
      <div style={{ padding:'36px 0 28px', borderBottom:'1px solid var(--b1)', marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
          <div style={{ width:52, height:52, borderRadius:14,
            background:'linear-gradient(135deg,rgba(168,85,247,.22),rgba(124,58,237,.12))',
            border:'1px solid rgba(168,85,247,.35)', display:'flex', alignItems:'center',
            justifyContent:'center', flexShrink:0, boxShadow:'0 4px 20px rgba(168,85,247,.2)' }}>
            <BrainCircuit size={26} color="#A855F7"/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5, flexWrap:'wrap' }}>
              <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#A855F7', letterSpacing:'.14em' }}>PACM-AI MENTOR ENGINE v4</span>
              <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, background:'rgba(34,197,94,.12)',
                border:'1px solid rgba(34,197,94,.25)', color:'#22C55E', fontFamily:'var(--f-mono)', fontWeight:700 }}>● LIVE</span>
              <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, background:'rgba(168,85,247,.1)',
                border:'1px solid rgba(168,85,247,.2)', color:'#A855F7', fontFamily:'var(--f-mono)' }}>외부API 0원</span>
              <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, background:'rgba(59,130,246,.1)',
                border:'1px solid rgba(59,130,246,.2)', color:'#3B82F6', fontFamily:'var(--f-mono)' }}>지속학습</span>
              <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, background:'rgba(34,197,94,.1)',
                border:'1px solid rgba(34,197,94,.2)', color:'#22C55E', fontFamily:'var(--f-mono)' }}>스트리밍</span>
            </div>
            <h1 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(22px,4vw,32px)', fontWeight:800,
              color:'var(--t1)', lineHeight:1.15, marginBottom:8, letterSpacing:'-0.03em' }}>
              AI 창업 멘토
            </h1>
            <p style={{ color:'var(--t2)', fontSize:14, maxWidth:580, lineHeight:1.75 }}>
              24시간 응답하는 청소년 전문 창업 멘토. BM25 지식 검색 · 자체 리서치 엔진 ·
              시뮬레이션 계산 · 피드백 지속 학습 — 완전 자체 AI.
            </p>
          </div>
          {/* 스탯 */}
          <div style={{ display:'flex', gap:10, flexShrink:0, flexWrap:'wrap' }}>
            {[
              { icon:<MessageSquare size={13}/>, label:'이 세션', val:sessionMsgs,    c:'#A855F7' },
              { icon:<Database size={13}/>,      label:'지식 활용', val:knowledgeUsed, c:'#3B82F6' },
              { icon:<Shield size={13}/>,        label:'외부 API', val:'0원',          c:'#22C55E' },
              { icon:<Zap size={13}/>,           label:'스트리밍', val:'ON',           c:'#F59E0B' },
            ].map(s=>(
              <div key={s.label} style={{ padding:'10px 14px', background:'var(--bg2)',
                border:'1px solid var(--b1)', borderRadius:10, textAlign:'center', minWidth:76 }}>
                <div style={{ color:s.c, display:'flex', justifyContent:'center', marginBottom:4 }}>{s.icon}</div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:17, fontWeight:700, color:'var(--t1)' }}>{s.val}</div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)', marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 탭 ── */}
      <div className="tab-bar" style={{ marginBottom:24 }}>
        {TABS.map(t=>(
          <button key={t.id} className={`tab-item${tab===t.id?' active':''}`} onClick={()=>setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ── 채팅 ── */}
      {tab==='chat' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:20, alignItems:'start' }} className="mentor-grid">
          <div>
            {/* 사고과정 패널 */}
            <ThinkingPanel
              intent={lastThinking?.intent}
              confidence={lastThinking?.confidence}
              knowledge={lastThinking?.knowledge}
              articles={lastThinking?.articles}
              sim={lastThinking?.sim}
              elapsed={lastThinking?.elapsed}
            />

            {/* 채팅창 */}
            <div style={{ background:'var(--bg1)', border:'1px solid var(--b1)', borderRadius:14,
              padding:20, minHeight:420, maxHeight:560, overflowY:'auto', marginBottom:10,
              scrollbarWidth:'thin' }}>
              {msgs.map((m,i)=>(
                <Bubble key={m.id||i} msg={m} streaming={m.streaming && streaming}/>
              ))}
              {loading && !streaming && <TypingDots/>}
              <div ref={bottomRef}/>
            </div>

            {/* 빠른 질문 칩 */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
              {STARTER_PROMPTS.map(p=>(
                <button key={p.label} onClick={()=>{ setInput(p.text); inputRef.current?.focus() }}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px',
                    background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:6,
                    color:'var(--t3)', fontSize:12, fontFamily:'var(--f-sans)', cursor:'pointer',
                    transition:'all .15s', whiteSpace:'nowrap' }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor='rgba(168,85,247,.4)'; e.currentTarget.style.color='#A855F7'; e.currentTarget.style.background='rgba(168,85,247,.07)' }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--b1)'; e.currentTarget.style.color='var(--t3)'; e.currentTarget.style.background='var(--bg3)' }}>
                  <span>{p.icon}</span>{p.label}
                </button>
              ))}
            </div>

            {/* 입력 */}
            <div style={{ display:'flex', gap:8 }}>
              <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&!loading&&send()}
                placeholder="창업에 대해 무엇이든 물어보세요... (Enter 전송)"
                disabled={loading||streaming}
                style={{ flex:1, padding:'12px 16px', background:'var(--bg2)', border:'1px solid var(--b2)',
                  borderRadius:10, color:'var(--t1)', fontSize:14, fontFamily:'var(--f-sans)',
                  outline:'none', transition:'border-color .2s' }}
                onFocus={e=>e.target.style.borderColor='rgba(168,85,247,.5)'}
                onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
              <button onClick={()=>send()} disabled={loading||streaming||!input.trim()}
                style={{ padding:'0 18px',
                  background:input.trim()&&!loading&&!streaming?'linear-gradient(135deg,#A855F7,#7C3AED)':'var(--bg4)',
                  border:'none', borderRadius:10,
                  cursor:input.trim()&&!loading&&!streaming?'pointer':'not-allowed',
                  display:'flex', alignItems:'center', transition:'all .15s',
                  boxShadow:input.trim()&&!loading&&!streaming?'0 4px 14px rgba(168,85,247,.3)':'none' }}>
                <Send size={16} color={input.trim()&&!loading&&!streaming?'#fff':'var(--t4)'}/>
              </button>
              <button onClick={reset} title="초기화"
                style={{ padding:'0 12px', background:'var(--bg3)', border:'1px solid var(--b1)',
                  borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center',
                  color:'var(--t3)', transition:'all .15s' }}
                onMouseEnter={e=>{ e.currentTarget.style.color='var(--t1)'; e.currentTarget.style.borderColor='var(--b3)' }}
                onMouseLeave={e=>{ e.currentTarget.style.color='var(--t3)'; e.currentTarget.style.borderColor='var(--b1)' }}>
                <RefreshCw size={14}/>
              </button>
            </div>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)', marginTop:7, textAlign:'center' }}>
              PACM-AI v4 · 완전 자체 엔진 · BM25 검색 · 지식그래프 · 시뮬레이션 · 피드백 학습 · 외부API 0원
            </div>
          </div>

          {/* ── 사이드바 */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:12, padding:18 }}>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t3)', letterSpacing:'.14em', marginBottom:14, textTransform:'uppercase' }}>AI 전문 영역</div>
              {[
                { e:'💡', l:'아이디어 검증', c:'#F59E0B' }, { e:'📋', l:'린 캔버스',   c:'#3B82F6' },
                { e:'🎯', l:'MVP 전략',      c:'#A855F7' }, { e:'💰', l:'수익 모델',   c:'#10B981' },
                { e:'📊', l:'시장 분석',     c:'#F43F5E' }, { e:'🔬', l:'시뮬레이션',  c:'#22C55E' },
                { e:'🚀', l:'피치덱',        c:'#06B6D4' }, { e:'🏆', l:'정부 지원',   c:'#A3E635' },
              ].map(x=>(
                <div key={x.l} style={{ display:'flex', alignItems:'center', gap:9, padding:'6px 0', borderBottom:'1px solid var(--b0)' }}>
                  <span style={{ fontSize:13 }}>{x.e}</span>
                  <span style={{ fontSize:12, color:'var(--t2)', flex:1 }}>{x.l}</span>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:x.c, boxShadow:`0 0 6px ${x.c}80` }}/>
                </div>
              ))}
            </div>

            <div style={{ background:'linear-gradient(135deg,rgba(168,85,247,.08),rgba(124,58,237,.04))',
              border:'1px solid rgba(168,85,247,.2)', borderRadius:12, padding:16 }}>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#A855F7', letterSpacing:'.1em', marginBottom:12 }}>⚙️ 엔진 정보</div>
              {[
                ['아키텍처','BM25 + 지식그래프'],
                ['의도 분류','16개 카테고리'],
                ['리서치','DB 4소스 탐색'],
                ['시뮬레이션','5종 자동 계산'],
                ['응답 방식','실시간 스트리밍'],
                ['자동 학습','매일 03:00 AM'],
              ].map(([k,v])=>(
                <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid rgba(168,85,247,.08)' }}>
                  <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}>{k}</span>
                  <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#A855F7' }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:12, padding:16 }}>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t3)', letterSpacing:'.1em', marginBottom:10 }}>💬 커뮤니티</div>
              <p style={{ fontSize:12, color:'var(--t2)', lineHeight:1.65, marginBottom:12 }}>
                실제 창업가들의 생생한 조언도 받아보세요.
              </p>
              <button onClick={()=>navigate('/community')}
                style={{ width:'100%', padding:'9px', background:'rgba(168,85,247,.12)',
                  border:'1px solid rgba(168,85,247,.25)', borderRadius:8,
                  color:'#A855F7', fontSize:12, fontFamily:'var(--f-sans)', cursor:'pointer',
                  fontWeight:600, transition:'all .15s' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(168,85,247,.22)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(168,85,247,.12)'}>
                커뮤니티 이동 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 시뮬레이션 탭 ── */}
      {tab==='simulation' && (
        <SimulationTab onSend={t=>{ setTab('chat'); setTimeout(()=>send(t),80) }}/>
      )}

      {/* ── 린 캔버스 탭 ── */}
      {tab==='canvas' && (
        <LeanCanvasTab onSend={t=>{ setTab('chat'); setTimeout(()=>send(t),80) }}/>
      )}

      {/* ── 예시 질문 탭 ── */}
      {tab==='examples' && (
        <div>
          <div style={{ padding:'12px 16px', background:'rgba(168,85,247,.06)',
            border:'1px solid rgba(168,85,247,.18)', borderRadius:10,
            fontSize:13, color:'var(--t2)', lineHeight:1.7, marginBottom:20 }}>
            💡 클릭하면 바로 AI에게 질문합니다. 🔬가 붙은 항목은 시뮬레이션을 실행합니다.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
            {EXAMPLES.map((qa,i)=>(
              <button key={i} onClick={()=>{ setTab('chat'); setTimeout(()=>send(qa.q),80) }}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 18px',
                  background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:12,
                  cursor:'pointer', textAlign:'left', transition:'all .18s' }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor='rgba(168,85,247,.4)'; e.currentTarget.style.background='var(--bg3)'; e.currentTarget.style.transform='translateY(-1px)' }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--b1)'; e.currentTarget.style.background='var(--bg2)'; e.currentTarget.style.transform='none' }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'rgba(168,85,247,.12)',
                  border:'1px solid rgba(168,85,247,.2)', display:'flex', alignItems:'center',
                  justifyContent:'center', flexShrink:0 }}>
                  <MessageSquare size={15} color="#A855F7"/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--t1)', lineHeight:1.45, marginBottom:4 }}>{qa.q}</div>
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:4,
                    background:'rgba(168,85,247,.1)', color:'#A855F7', fontFamily:'var(--f-mono)' }}>{qa.tag}</span>
                </div>
                <ChevronRight size={14} color="var(--t4)" style={{ flexShrink:0 }}/>
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes tp { 0%,80%,100%{opacity:.25;transform:scale(.9)} 40%{opacity:1;transform:scale(1.1)} }
        @keyframes fbUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @media(max-width:900px){ .mentor-grid{grid-template-columns:1fr!important} }
      `}</style>
    </div>
  )
}
