import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, Clock, Tag, Star, Search, ChevronRight,
  Zap, Award, Target, TrendingUp, Play, CheckCircle,
  BarChart2, Brain, Users, Rocket, X, ArrowRight,
  GraduationCap, Sparkles, Trophy, Lock
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store'

const CATEGORIES = [
  { key:'all',            label:'전체',         emoji:'📋' },
  { key:'startup_basics', label:'창업 기초',    emoji:'🚀' },
  { key:'ai_startup',     label:'AI × 창업',   emoji:'🤖' },
  { key:'investment',     label:'투자 이해',    emoji:'💰' },
  { key:'case_study',     label:'케이스 스터디',emoji:'📊' },
  { key:'marketing',      label:'마케팅',       emoji:'📣' },
  { key:'product',        label:'프로덕트',     emoji:'🎯' },
]

const LEVEL_BADGE = {
  beginner:     { label:'입문', color:'#22C55E', bg:'rgba(34,197,94,0.12)' },
  intermediate: { label:'중급', color:'#3B82F6', bg:'rgba(59,130,246,0.12)' },
  advanced:     { label:'심화', color:'#F43F5E', bg:'rgba(244,63,94,0.12)' },
}

const SAMPLE_COURSES = [
  {
    id:1, category:'startup_basics', level:'beginner',
    title:'창업이란 무엇인가? — 청소년 창업 완전 가이드',
    subtitle:'아이디어에서 MVP까지 30일 로드맵',
    summary:'창업을 처음 시작하는 청소년을 위한 완전 입문 가이드. 아이디어 발굴부터 첫 고객 확보까지 단계별로 안내합니다.',
    read_time:12, is_featured:true, tags:['창업입문','MVP','린스타트업'], icon:'🚀', color:'#3B82F6',
    content:['창업이란 새로운 가치를 만들어 고객에게 전달하는 과정입니다.','청소년 창업의 가장 큰 강점은 실패에 대한 부담이 적다는 것입니다.','MVP(최소 기능 제품)를 빠르게 만들고 테스트하는 것이 핵심입니다.'],
    quiz:[{q:'MVP의 의미는?',options:['최대 기능 제품','최소 기능 제품','최고 가치 제품','최신 버전 제품'],answer:1},{q:'린 스타트업의 핵심 원칙은?',options:['큰 자본','빠른 실험','완벽한 계획','많은 직원'],answer:1}]
  },
  {
    id:2, category:'ai_startup', level:'intermediate',
    title:'AI 스타트업 완전 분석 — 2026 생존 전략',
    subtitle:'ChatGPT 이후 시대의 AI 창업 기회',
    summary:'AI 기술이 민주화된 시대, 청소년 창업가가 AI를 활용해 경쟁력을 만드는 실질적 방법을 다룹니다.',
    read_time:15, is_featured:true, tags:['AI','스타트업','ChatGPT'], icon:'🤖', color:'#A855F7',
    content:['2026년 AI 도구는 개인 창업자의 팀원 역할을 합니다.','무료 AI 도구(Claude, GPT, Gemini)로 콘텐츠, 코드, 마케팅을 해결하세요.','AI를 활용한 차별화: 속도, 비용, 개인화가 핵심입니다.'],
    quiz:[{q:'AI 창업에서 가장 중요한 것은?',options:['기술력','문제 정의','자본','팀 규모'],answer:1}]
  },
  {
    id:3, category:'investment', level:'intermediate',
    title:'스타트업 투자 완전 이해 — VC부터 엔젤까지',
    subtitle:'시리즈A를 받기 위해 알아야 할 모든 것',
    summary:'투자 라운드의 종류, 투자자가 보는 기준, 텀시트 읽는 법 등 투자 유치의 모든 것을 청소년 눈높이로 설명합니다.',
    read_time:18, tags:['투자','VC','시리즈A'], icon:'💰', color:'#F59E0B',
    content:['투자 라운드: 프리시드 → 시드 → 시리즈A → B → C → IPO','VC(벤처캐피털)는 10개 중 1개의 대박을 기대하는 구조입니다.','트랙션(성장 증거)이 없으면 투자 유치는 어렵습니다.'],
    quiz:[{q:'시리즈A 투자의 특징은?',options:['아이디어 단계','초기 성장 증명 후','상장 준비','인수합병'],answer:1}]
  },
  {
    id:4, category:'case_study', level:'beginner',
    title:'토스가 처음부터 성공한 게 아니었다 — 실패에서 배우기',
    subtitle:'8번의 피봇 끝에 탄생한 핀테크 유니콘',
    summary:'현재 대한민국 대표 핀테크 기업 토스가 어떻게 실패를 반복하며 성장했는지, 청소년 창업가에게 주는 교훈을 분석합니다.',
    read_time:10, is_featured:true, tags:['토스','핀테크','피봇'], icon:'📊', color:'#06B6D4',
    content:['토스는 초기에 8번 이상 피봇(방향 전환)을 경험했습니다.','이승건 대표는 치과의사 출신으로 본업을 포기하고 창업했습니다.','"간편 송금"이라는 핵심 기능 하나로 10년간 집중했습니다.'],
    quiz:[{q:'피봇(Pivot)이란?',options:['사업 종료','방향 전환','투자 유치','상장'],answer:1}]
  },
  {
    id:5, category:'marketing', level:'beginner',
    title:'0원으로 첫 100명의 고객 확보하기',
    subtitle:'바이럴, 커뮤니티, SEO 무비용 마케팅 전략',
    summary:'자본이 없는 청소년 창업가도 실행할 수 있는 무비용 마케팅 방법 7가지를 소개합니다.',
    read_time:9, tags:['마케팅','그로스해킹','바이럴'], icon:'📣', color:'#22C55E',
    content:['커뮤니티 마케팅: 네이버 카페, 디스코드, 카카오톡 오픈채팅 활용','콘텐츠 마케팅: 블로그, 유튜브 쇼츠로 유기적 트래픽 확보','입소문 마케팅: 첫 사용자에게 감동을 주면 알아서 퍼집니다.'],
    quiz:[{q:'가장 비용이 적게 드는 마케팅은?',options:['광고','홍보대사','구전 마케팅','이벤트'],answer:2}]
  },
  {
    id:6, category:'product', level:'advanced',
    title:'청소년이 만든 앱이 100만 다운로드 된 비결',
    subtitle:'고등학생 창업팀의 프로덕트 빌딩 전략',
    summary:'실제 고등학생 팀이 학교 앱을 만들어 100만 다운로드를 달성한 과정과 프로덕트 빌딩 원칙을 공유합니다.',
    read_time:13, tags:['앱개발','프로덕트','성공사례'], icon:'🎯', color:'#F97316',
    content:['문제 → 해결책 → 검증 → 빌드 순서가 중요합니다.','학교 친구들이 곧 첫 번째 고객입니다. 주변에서 시작하세요.','완벽한 앱보다 빠른 출시가 더 중요합니다.'],
    quiz:[{q:'프로덕트 개발의 올바른 순서는?',options:['빌드→검증→출시','문제→해결책→검증→빌드','아이디어→앱출시','투자→개발'],answer:1}]
  },
]

/* ── Skeleton ─────────────────────────────────────────────────────── */
function Sk({ h=16, w='100%', r=6 }) {
  return <div style={{ height:h, width:w, background:'var(--bg3)', borderRadius:r, animation:'skPulse 1.6s ease-in-out infinite' }}/>
}

/* ── Course Modal ─────────────────────────────────────────────────── */
function CourseModal({ course, onClose, onComplete }) {
  const [quizAnswers, setQuizAnswers] = useState({})
  const [quizDone, setQuizDone]       = useState(false)
  const [quizScore, setQuizScore]     = useState(0)
  const [step, setStep]               = useState('content') // content | quiz | done

  const handleQuizSubmit = () => {
    let score = 0
    course.quiz?.forEach((q, i) => {
      if (quizAnswers[i] === q.answer) score++
    })
    setQuizScore(score)
    setQuizDone(true)
    setStep('done')
    if (score === course.quiz?.length) onComplete(course.id)
  }

  const lv = LEVEL_BADGE[course.level] || LEVEL_BADGE.beginner

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, overflowY:'auto' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:'100%', maxWidth:640, background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:16, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,.85)', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--b1)', background:`linear-gradient(135deg,${course.color}10,transparent)`, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ fontSize:32 }}>{course.icon}</div>
              <div>
                <div style={{ display:'flex', gap:6, marginBottom:6 }}>
                  <span style={{ fontSize:9, padding:'2px 7px', borderRadius:3, background:lv.bg, color:lv.color, fontFamily:'var(--f-mono)', fontWeight:700 }}>{lv.label}</span>
                  <span style={{ fontSize:9, padding:'2px 7px', borderRadius:3, background:'var(--bg3)', color:'var(--t3)', fontFamily:'var(--f-mono)' }}>{course.read_time}분</span>
                </div>
                <h2 style={{ fontFamily:'var(--f-display)', fontSize:17, fontWeight:700, color:'var(--t1)', lineHeight:1.35, margin:0 }}>{course.title}</h2>
              </div>
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t3)', padding:4, flexShrink:0 }}><X size={18}/></button>
          </div>
          {/* Step tabs */}
          <div style={{ display:'flex', gap:0, marginTop:16, background:'var(--bg3)', borderRadius:8, overflow:'hidden' }}>
            {[{id:'content',label:'📖 강의'},{id:'quiz',label:'✏️ 퀴즈'},{id:'done',label:'🎉 완료'}].map((s,i)=>(
              <button key={s.id} onClick={()=>step!=='done'&&s.id!=='done'&&setStep(s.id)}
                style={{ flex:1, padding:'8px', background:step===s.id?course.color:'transparent', border:'none', cursor:step!=='done'&&s.id!=='done'?'pointer':'default', fontFamily:'var(--f-sans)', fontSize:12, color:step===s.id?'#fff':'var(--t3)', fontWeight:step===s.id?600:400, transition:'all .15s' }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding:'24px', overflowY:'auto', flex:1 }}>
          {step==='content' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <p style={{ fontSize:14, lineHeight:1.8, color:'var(--t2)', margin:0 }}>{course.summary}</p>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {course.content.map((c,i)=>(
                  <div key={i} style={{ display:'flex', gap:12, padding:'14px 16px', background:'var(--bg3)', borderRadius:9, borderLeft:`3px solid ${course.color}` }}>
                    <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:course.color, fontWeight:700, flexShrink:0, marginTop:1 }}>0{i+1}</span>
                    <span style={{ fontSize:14, color:'var(--t1)', lineHeight:1.65 }}>{c}</span>
                  </div>
                ))}
              </div>
              {course.tags?.length>0 && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {course.tags.map(t=>(
                    <span key={t} style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:`${course.color}12`, border:`1px solid ${course.color}25`, color:course.color, fontFamily:'var(--f-mono)' }}>#{t}</span>
                  ))}
                </div>
              )}
              <button onClick={()=>setStep('quiz')}
                style={{ padding:'12px', background:`linear-gradient(135deg,${course.color},${course.color}CC)`, border:'none', borderRadius:9, color:'#fff', fontSize:14, fontFamily:'var(--f-sans)', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'opacity .15s' }}
                onMouseEnter={e=>e.currentTarget.style.opacity='.85'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                퀴즈 풀기 →
              </button>
            </div>
          )}

          {step==='quiz' && !quizDone && (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)', letterSpacing:'.1em' }}>
                {course.quiz?.length}개 문항
              </div>
              {course.quiz?.map((q,i)=>(
                <div key={i} style={{ background:'var(--bg3)', borderRadius:10, padding:'18px 20px' }}>
                  <div style={{ fontFamily:'var(--f-sans)', fontSize:14.5, fontWeight:600, color:'var(--t1)', marginBottom:14, lineHeight:1.5 }}>Q{i+1}. {q.q}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {q.options.map((opt,j)=>(
                      <button key={j} onClick={()=>setQuizAnswers(a=>({...a,[i]:j}))}
                        style={{ padding:'10px 14px', background:quizAnswers[i]===j?`${course.color}18`:'var(--bg2)', border:`1px solid ${quizAnswers[i]===j?course.color:'var(--b1)'}`, borderRadius:8, color:quizAnswers[i]===j?course.color:'var(--t2)', fontSize:13, fontFamily:'var(--f-sans)', cursor:'pointer', textAlign:'left', transition:'all .15s' }}>
                        {String.fromCharCode(65+j)}. {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={handleQuizSubmit} disabled={Object.keys(quizAnswers).length<(course.quiz?.length||0)}
                style={{ padding:'12px', background:Object.keys(quizAnswers).length>=(course.quiz?.length||0)?`linear-gradient(135deg,${course.color},${course.color}CC)`:'var(--bg4)', border:'none', borderRadius:9, color:Object.keys(quizAnswers).length>=(course.quiz?.length||0)?'#fff':'var(--t4)', fontSize:14, fontFamily:'var(--f-sans)', fontWeight:700, cursor:'pointer', transition:'all .15s' }}>
                제출하기
              </button>
            </div>
          )}

          {step==='done' && (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ fontSize:52, marginBottom:16 }}>{quizScore===course.quiz?.length?'🎉':'👏'}</div>
              <div style={{ fontFamily:'var(--f-display)', fontSize:22, fontWeight:700, color:'var(--t1)', marginBottom:8 }}>
                {quizScore===course.quiz?.length?'완벽해요!':'수고했습니다!'}
              </div>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:14, color:course.color, marginBottom:20 }}>
                {quizScore} / {course.quiz?.length} 정답
              </div>
              {quizScore===course.quiz?.length && (
                <div style={{ padding:'16px', background:`${course.color}10`, border:`1px solid ${course.color}25`, borderRadius:10, marginBottom:20 }}>
                  <div style={{ fontSize:20, marginBottom:6 }}>🏆</div>
                  <div style={{ fontSize:14, fontWeight:700, color:course.color }}>강의 완료 배지 획득!</div>
                </div>
              )}
              <button onClick={onClose}
                style={{ padding:'11px 28px', background:`linear-gradient(135deg,${course.color},${course.color}CC)`, border:'none', borderRadius:9, color:'#fff', fontSize:14, fontFamily:'var(--f-sans)', fontWeight:700, cursor:'pointer' }}>
                완료
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Course Card ──────────────────────────────────────────────────── */
function CourseCard({ course, completed, onClick }) {
  const [hov, setHov] = useState(false)
  const lv = LEVEL_BADGE[course.level] || LEVEL_BADGE.beginner
  return (
    <div
      onClick={() => onClick(course)}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background:'var(--bg2)', border:`1px solid ${hov?course.color+'40':'var(--b1)'}`,
        borderRadius:14, overflow:'hidden', cursor:'pointer', transition:'all .2s',
        transform:hov?'translateY(-4px)':'none',
        boxShadow:hov?`0 10px 36px rgba(0,0,0,.55),0 0 0 1px ${course.color}15`:'none',
        position:'relative', display:'flex', flexDirection:'column',
      }}>
      {/* Top accent bar */}
      <div style={{ height:3, background:`linear-gradient(90deg,${course.color},${course.color}80)` }}/>
      {/* Featured badge */}
      {course.is_featured && (
        <div style={{ position:'absolute', top:12, right:12, fontSize:9, padding:'2px 7px', borderRadius:3, background:'rgba(255,215,0,0.15)', border:'1px solid rgba(255,215,0,0.3)', color:'#FFD700', fontFamily:'var(--f-mono)', fontWeight:700 }}>★ 추천</div>
      )}
      {completed && (
        <div style={{ position:'absolute', top:12, right:course.is_featured?80:12 }}>
          <CheckCircle size={18} color="#22C55E"/>
        </div>
      )}
      <div style={{ padding:'18px 18px 16px', flex:1, display:'flex', flexDirection:'column', gap:10 }}>
        {/* Icon + level */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:28 }}>{course.icon}</div>
          <span style={{ fontSize:9, padding:'2px 8px', borderRadius:4, background:lv.bg, color:lv.color, fontFamily:'var(--f-mono)', fontWeight:700 }}>{lv.label}</span>
        </div>
        {/* Title */}
        <h3 style={{ fontFamily:'var(--f-display)', fontSize:15, fontWeight:700, color:'var(--t1)', lineHeight:1.4, margin:0, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {course.title}
        </h3>
        <p style={{ fontSize:12.5, color:'var(--t3)', lineHeight:1.6, margin:0, flex:1, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {course.summary}
        </p>
        {/* Tags */}
        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          {course.tags?.slice(0,2).map(t=>(
            <span key={t} style={{ fontSize:10, padding:'2px 7px', borderRadius:4, background:`${course.color}10`, border:`1px solid ${course.color}20`, color:course.color, fontFamily:'var(--f-mono)' }}>#{t}</span>
          ))}
        </div>
        {/* Footer */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--b0)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:4, fontFamily:'var(--f-mono)', fontSize:9.5, color:'var(--t4)' }}>
            <Clock size={10}/>{course.read_time}분
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11.5, color:course.color, fontWeight:600 }}>
            {completed?<><CheckCircle size={11}/> 완료</>:<>학습하기 <ChevronRight size={11}/></>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────────── */
export default function EduPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [category, setCategory]   = useState('all')
  const [search, setSearch]       = useState('')
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [completed, setCompleted] = useState(new Set())
  const [dbCourses, setDbCourses] = useState(null)  // null = not yet fetched

  useEffect(() => {
    if (user) {
      try {
        const saved = localStorage.getItem(`edu_completed_${user.id}`)
        if (saved) setCompleted(new Set(JSON.parse(saved)))
      } catch {}
    }
  }, [user])

  // DB-first: try loading courses from `edu_courses` table
  useEffect(() => {
    supabase
      .from('edu_courses')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .limit(50)
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) setDbCourses(data)
        else setDbCourses([])  // table doesn't exist or empty → use SAMPLE_COURSES
      })
      .catch(() => setDbCourses([]))
  }, [])

  const handleComplete = courseId => {
    const newSet = new Set([...completed, courseId])
    setCompleted(newSet)
    if (user) localStorage.setItem(`edu_completed_${user.id}`, JSON.stringify([...newSet]))
  }

  // Use DB courses if available, else fall back to SAMPLE_COURSES
  const courses  = (dbCourses && dbCourses.length > 0) ? dbCourses : SAMPLE_COURSES
  const filtered = courses.filter(c => {
    const matchCat    = category === 'all' || c.category === category
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.summary.includes(search)
    return matchCat && matchSearch
  })

  const totalDone    = completed.size
  const totalCourses = courses.length
  const pct = totalCourses ? Math.round((totalDone/totalCourses)*100) : 0
  const totalMins = courses.reduce((a,c)=>a+(completed.has(c.id)?c.read_time:0),0)

  return (
    <div style={{ minHeight:'100vh', paddingBottom:80 }}>
      <Helmet>
        <title>학습센터 | Insightship — 청소년 창업 학습</title>
        <meta name="description" content="창업 기초, AI 스타트업, 투자 이해, 케이스 스터디까지. 청소년 창업가를 위한 무료 강의와 퀴즈로 창업 스킬을 키워보세요."/>
        <meta property="og:title" content="학습센터 | Insightship"/>
        <meta property="og:description" content="퀴즈·배지로 창업 스킬을 게임처럼 쌓아보세요 — 무료 청소년 창업 학습 플랫폼"/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://insightship.vercel.app/edu"/>
        <meta name="twitter:card" content="summary"/>
        <meta name="twitter:title" content="학습센터 | Insightship"/>
        <meta name="twitter:description" content="청소년 창업가를 위한 무료 강의와 퀴즈"/>
        <link rel="canonical" href="https://insightship.vercel.app/edu"/>
      </Helmet>
      {/* ── HEADER ── */}
      <div style={{ background:'linear-gradient(180deg,rgba(249,115,22,0.07) 0%,transparent 100%)', borderBottom:'1px solid var(--b1)', padding:'32px var(--pad-x) 0' }}>
        <div style={{ maxWidth:'var(--max-w)', margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20, flexWrap:'wrap', marginBottom:24 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:42, height:42, borderRadius:11, background:'rgba(249,115,22,0.15)', border:'1px solid rgba(249,115,22,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <GraduationCap size={20} color="#F97316"/>
                </div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#F97316', letterSpacing:'.16em' }}>INSIGHTSHIP · LEARNING CENTER</div>
              </div>
              <h1 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(24px,4vw,32px)', fontWeight:700, color:'var(--t1)', lineHeight:1.1, marginBottom:8 }}>학습센터</h1>
              <p style={{ color:'var(--t2)', fontSize:13.5, lineHeight:1.65, maxWidth:480, margin:0 }}>청소년 창업에 필요한 핵심 지식을 쉽게 배우고, 퀴즈로 이해도를 확인하세요.</p>
            </div>

            {/* Progress card */}
            <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:14, padding:'18px 22px', minWidth:210 }}>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t3)', letterSpacing:'.1em', marginBottom:10 }}>나의 학습 진도</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:10 }}>
                <span style={{ fontFamily:'var(--f-display)', fontSize:32, fontWeight:700, color:'#F97316', lineHeight:1 }}>{pct}%</span>
                <span style={{ fontSize:12, color:'var(--t3)' }}>{totalDone}/{totalCourses}개</span>
              </div>
              <div style={{ height:5, background:'var(--bg4)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#F97316,#F59E0B)', borderRadius:3, transition:'width .8s ease' }}/>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:1, background:'var(--b1)', borderTop:'1px solid var(--b1)', borderRadius:'8px 8px 0 0', overflow:'hidden' }}>
            {[
              { icon:BookOpen,  label:'전체 강의',  value:`${courses.length}개`,       color:'#F97316' },
              { icon:CheckCircle,label:'완료',      value:`${totalDone}개`,             color:'#22C55E' },
              { icon:Trophy,    label:'획득 배지',  value:`${Math.floor(totalDone*1.5)}개`, color:'#F59E0B' },
              { icon:Clock,     label:'학습 시간',  value:`${totalMins}분`,             color:'#3B82F6' },
            ].map((s,i)=>(
              <div key={i} style={{ background:'var(--bg2)', padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:`${s.color}12`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <s.icon size={14} color={s.color}/>
                </div>
                <div>
                  <div style={{ fontFamily:'var(--f-mono)', fontSize:15, fontWeight:700, color:s.color, lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:10, color:'var(--t4)', marginTop:2 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:'var(--max-w)', margin:'0 auto', padding:'28px var(--pad-x)' }}>
        {/* Filters */}
        <div style={{ display:'flex', gap:12, marginBottom:24, flexWrap:'wrap', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {CATEGORIES.map(c=>(
              <button key={c.key} onClick={()=>setCategory(c.key)}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:`1px solid ${category===c.key?'rgba(249,115,22,0.4)':'var(--b1)'}`, cursor:'pointer', fontFamily:'var(--f-sans)', fontSize:12, fontWeight:category===c.key?600:400,
                  background:category===c.key?'rgba(249,115,22,0.12)':'var(--bg2)', color:category===c.key?'#F97316':'var(--t3)', transition:'all .15s' }}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          <div style={{ position:'relative' }}>
            <Search size={13} color="var(--t4)" style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)' }}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="강의 검색..."
              style={{ padding:'8px 14px 8px 34px', background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t1)', fontSize:13, fontFamily:'var(--f-sans)', outline:'none', width:180, transition:'border-color .15s' }}
              onFocus={e=>e.currentTarget.style.borderColor='rgba(249,115,22,0.4)'}
              onBlur={e=>e.currentTarget.style.borderColor='var(--b1)'}/>
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t3)' }}>
            <BookOpen size={40} style={{ marginBottom:16, opacity:.25 }}/>
            <div style={{ fontSize:15 }}>해당 카테고리의 강의가 준비 중입니다.</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16, marginBottom:40 }}>
            {filtered.map(c=><CourseCard key={c.id} course={c} completed={completed.has(c.id)} onClick={setSelectedCourse}/>)}
          </div>
        )}

        {/* CTA */}
        <div style={{ padding:'28px 32px', background:'linear-gradient(135deg,rgba(249,115,22,0.08),rgba(245,158,11,0.05))', border:'1px solid rgba(249,115,22,0.2)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
          <div>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#F97316', letterSpacing:'.1em', marginBottom:6 }}>🔜 더 많은 콘텐츠</div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--t1)', marginBottom:4 }}>강의와 퀴즈가 매주 추가됩니다</div>
            <p style={{ fontSize:13, color:'var(--t3)', margin:0 }}>원하는 강의 주제를 커뮤니티에서 제안해 주세요!</p>
          </div>
          <button onClick={()=>navigate('/community')}
            style={{ padding:'11px 22px', background:'rgba(249,115,22,0.15)', border:'1px solid rgba(249,115,22,0.3)', borderRadius:9, color:'#F97316', fontSize:13, fontFamily:'var(--f-sans)', fontWeight:700, cursor:'pointer' }}>
            강의 제안하기 →
          </button>
        </div>
      </div>

      {selectedCourse && <CourseModal course={selectedCourse} onClose={()=>setSelectedCourse(null)} onComplete={handleComplete}/>}
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  )
}
