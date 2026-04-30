/**
 * src/components/StaffChatPopup.jsx
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  직원 전용 채팅방 팝업 v2.0 — admin role 전용                       ║
 * ║                                                                      ║
 * ║  보안:                                                               ║
 * ║  - 컴포넌트 자체 + App.jsx 양쪽에서 admin role 이중 검사             ║
 * ║  - lazy import로 번들에서 일반 유저 코드와 완전 분리                 ║
 * ║                                                                      ║
 * ║  기능:                                                               ║
 * ║  - 관리자 메시지 전송 → staff-chat-auto API로 직원 자동 반응 트리거  ║
 * ║  - 4개 채팅방 (general, ops, feedback, strategy)                    ║
 * ║  - 3초 폴링으로 실시간 메시지 수신                                  ║
 * ║  - 미읽음 뱃지, 최소화, 자동 스크롤                                 ║
 * ║  - 직원 아바타 색상, 메시지 타입 뱃지                               ║
 * ║  - 채팅방 침묵 감지 → 직원 자동 대화 시작 트리거                   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../store'
import { supabase } from '../lib/supabase'

// ── 채팅방 정의 ──────────────────────────────────────────────────────
const ROOMS = [
  { id: 'general',  label: '전체 채팅', emoji: '💬', color: '#60A5FA' },
  { id: 'ops',      label: '업무 지시', emoji: '📋', color: '#F59E0B' },
  { id: 'feedback', label: '피드백',    emoji: '📥', color: '#34D399' },
  { id: 'strategy', label: '전략 회의', emoji: '🎯', color: '#F472B6' },
]

// ── AI 직원 색상 맵 ─────────────────────────────────────────────────
const STAFF_COLORS = {
  ai_aria:  '#818CF8', ai_nova:  '#C084FC', ai_lumi:  '#34D399',
  ai_pulse: '#38BDF8', ai_trend: '#FB923C', ai_sage:  '#10B981',
  ai_echo:  '#F472B6', ai_learn: '#A78BFA', ai_hana:  '#FBBF24',
  ai_max:   '#F87171',
}

function getColor(username) {
  if (!username) return '#60A5FA'
  if (STAFF_COLORS[username]) return STAFF_COLORS[username]
  if (username.startsWith('ai_ops'))  return '#9AA5FF'
  if (username.startsWith('ai_cnt'))  return '#C084FC'
  if (username.startsWith('ai_mnt'))  return '#34D399'
  if (username.startsWith('ai_nws'))  return '#38BDF8'
  if (username.startsWith('ai_anl'))  return '#FB923C'
  if (username.startsWith('ai_rpt'))  return '#10B981'
  if (username.startsWith('ai_nwl'))  return '#F472B6'
  if (username.startsWith('ai_tch'))  return '#A78BFA'
  if (username.startsWith('ai_cmm'))  return '#FBBF24'
  if (username.startsWith('ai_mgt'))  return '#F87171'
  // 관리자 (비-AI)
  return '#60A5FA'
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function MsgTypeBadge({ type }) {
  if (!type || type === 'chat') return null
  const MAP = {
    task_directive:   { label: '업무지시',  color: '#F59E0B' },
    ai_auto:          { label: 'AI 자동',   color: '#818CF8' },
    feedback_handled: { label: '피드백처리', color: '#34D399' },
    notice:           { label: '공지',      color: '#F43F5E' },
    admin_message:    { label: '관리자',    color: '#60A5FA' },
  }
  const m = MAP[type]
  if (!m) return null
  return (
    <span style={{
      fontSize: 9, background: `${m.color}20`, color: m.color,
      border: `1px solid ${m.color}40`, borderRadius: 3,
      padding: '1px 5px', marginLeft: 4, fontFamily: 'var(--f-mono)',
    }}>
      {m.label}
    </span>
  )
}

// ── 타이핑 인디케이터 ───────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', padding: '4px 8px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: '#555',
          animation: `typingBounce 1.2s ${i * 0.2}s ease-in-out infinite`,
        }} />
      ))}
      <style>{`@keyframes typingBounce { 0%,60%,100% { transform:translateY(0) } 30% { transform:translateY(-5px) } }`}</style>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ══════════════════════════════════════════════════════════════════════

export default function StaffChatPopup() {
  const { profile } = useAuthStore()

  // ── 이중 admin 보안 검사 ────────────────────────────────────────
  if (!profile || profile.role !== 'admin') return null

  const [open,        setOpen]        = useState(false)
  const [room,        setRoom]        = useState('general')
  const [messages,    setMessages]    = useState([])
  const [input,       setInput]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [sending,     setSending]     = useState(false)
  const [unread,      setUnread]      = useState(0)
  const [minimized,   setMinimized]   = useState(false)
  const [aiTyping,    setAiTyping]    = useState(false)    // AI 직원 타이핑 표시
  const [autoMsg,     setAutoMsg]     = useState(null)     // 자동 반응 결과 표시
  const [tableSetup,  setTableSetup]  = useState(false)    // 테이블 초기화 중 표시
  const [tableNotReady, setTableNotReady] = useState(false) // 테이블 없음 — 안내 표시

  const bottomRef       = useRef(null)
  const msgListRef      = useRef(null)   // 스크롤 컨테이너 ref
  const pollRef         = useRef(null)
  const prevCountRef    = useRef(0)
  const roomRef         = useRef(room)   // 폴링에서 최신 room 참조
  const openRef         = useRef(open)   // 폴링에서 최신 open 참조
  const userScrolledRef = useRef(false)  // 사용자가 위로 스크롤했는지 (강제 스크롤 방지)
  const prevMsgLen      = useRef(0)      // 이전 메시지 수 (새 메시지 감지용)
  // 테이블 초기화 상태 추적 — 컴포넌트 생명주기 동안 1회만 ensureTable 실행
  const tableInitRef    = useRef(false)   // ensureTable 실행 중
  const tableMissingRef = useRef(false)   // 테이블 없음 확정 (반복 ensureTable 방지)

  // ref 동기화
  useEffect(() => { roomRef.current = room }, [room])
  useEffect(() => { openRef.current = open  }, [open])

  // ── admin JWT 헤더 반환 ──────────────────────────────────────────
  const getAuthHeader = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      return session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}
    } catch { return {} }
  }, [])

  // fetchMessages ref — 순환 참조 없이 ensureTable → fetchMessages 호출용
  const fetchMessagesRef = useRef(null)

  // ── 테이블 자동 생성 (table_missing 감지 시 1회만 호출) ────────
  // ★ 폴링마다 호출되지 않도록 tableInitRef / tableMissingRef 이중 가드
  const ensureTable = useCallback(async () => {
    if (tableInitRef.current) return          // 이미 진행 중
    if (!tableMissingRef.current) return      // 테이블 없음이 확인된 적 없음
    tableInitRef.current = true
    setTableSetup(true)
    try {
      const authH = await getAuthHeader()
      if (authH.Authorization) {
        const r = await fetch('/api/db-setup-staff', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', ...authH },
        })
        const d = await r.json().catch(() => ({}))
        if (d.ok || d.table_exists) {
          // 테이블 생성(또는 이미 존재) 확인 → 안내 해제 후 즉시 재조회
          tableMissingRef.current = false
          setTableNotReady(false)
          fetchMessagesRef.current?.(true)
        }
        // 실패해도 tableMissingRef 유지 → 버튼 재시도 시 다시 ensureTable 호출 가능
      }
    } catch (_) {}
    setTableSetup(false)
    tableInitRef.current = false
  }, [getAuthHeader])

  // ── 메시지 조회 ─────────────────────────────────────────────────
  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const currentRoom = roomRef.current
      const r = await fetch(`/api/staff-chat?room=${currentRoom}&limit=80`)
      const d = await r.json().catch(() => ({}))

      // table_missing=true → 테이블 없음 확정
      // tableMissingRef를 true로 세팅 후 ensureTable 1회만 호출
      if (d.table_missing === true || d.table_ready === false) {
        if (!tableMissingRef.current) {
          // 최초 감지 시에만 ensureTable 트리거
          tableMissingRef.current = true
          setTableNotReady(true)
          // 진행 중이 아닐 때만 ensureTable 호출 (중복 방지)
          if (!tableInitRef.current) ensureTable()
        }
        if (!silent) setLoading(false)
        return
      }
      // 테이블이 있음 확인되면 missing 상태 해제
      tableMissingRef.current = false
      setTableNotReady(false)

      if (Array.isArray(d.messages)) {
        setMessages(prev => {
          if (d.messages.length === 0 && prev.length > 0) return prev
          const realPrev = prev.filter(m => !m.id?.startsWith('optimistic-'))
          const newCount = d.messages.length - realPrev.length
          if (!openRef.current && newCount > 0) setUnread(u => u + newCount)
          return d.messages
        })
      }
    } catch (_) {}
    if (!silent) setLoading(false)
  }, [ensureTable])

  // 방 변경 시 메시지 로드
  useEffect(() => {
    setMessages([])
    prevCountRef.current = 0
    fetchMessages()
  }, [room])  // eslint-disable-line

  // fetchMessagesRef 동기화 — ensureTable에서 역참조용
  useEffect(() => {
    fetchMessagesRef.current = fetchMessages
  }, [fetchMessages])

  // 폴링 — open 상태에서만 실행, 팝업이 닫히면 폴링 중단하여 불필요한 요청 제거
  // 간격: open 시 4초 (3초→4초로 상향해 서버 부하 감소)
  useEffect(() => {
    if (!open) {
      clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(() => fetchMessages(true), 4000)
    return () => clearInterval(pollRef.current)
  }, [open, fetchMessages])

  // 새 메시지 시 자동 스크롤 — 사용자가 위로 스크롤 중이면 강제 이동하지 않음
  useEffect(() => {
    if (!open || minimized) return
    const newLen = messages.length
    if (newLen === 0) return

    // 사용자 스크롤 위치 확인 (하단 80px 이내면 팔로우, 아니면 유지)
    const container = msgListRef.current
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distFromBottom = scrollHeight - scrollTop - clientHeight
      const isNearBottom = distFromBottom < 80
      // 새 메시지가 실제로 추가됐을 때만 스크롤
      if (newLen > prevMsgLen.current && isNearBottom) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
      }
    } else if (newLen > prevMsgLen.current) {
      // 컨테이너 ref 없으면 처음 로드 시에만
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
    }
    prevMsgLen.current = newLen
  }, [messages, open, minimized])

  // 열면 읽음 처리
  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  // ── 관리자 메시지 전송 ─────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || sending) return
    const msg = input.trim()
    setSending(true)
    setInput('')

    try {
      // 1) Optimistic update — 즉시 화면에 표시 (DB 응답 기다리지 않음)
      const optimisticMsg = {
        id:           `optimistic-${Date.now()}`,
        room,
        sender_key:   profile.username || 'admin',
        sender_name:  profile.display_name || profile.username || '관리자',
        sender_emoji: '👤',
        sender_color: '#60A5FA',
        sender_team:  '관리자',
        message:      msg,
        msg_type:     'admin_message',
        created_at:   new Date().toISOString(),
      }
      setMessages(prev => [...prev, optimisticMsg])

      // 2) 서버에 실제 저장
      const authH = await getAuthHeader()
      const postRes = await fetch(`/api/staff-chat?room=${room}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({
          sender_key:   profile.username || 'admin',
          sender_name:  profile.display_name || profile.username || '관리자',
          sender_emoji: '👤',
          sender_color: '#60A5FA',
          sender_team:  '관리자',
          message:      msg,
          msg_type:     'admin_message',
        }),
      })
      const postData = await postRes.json().catch(() => ({}))

      if (postData.ok && postData.message) {
        // optimistic 메시지를 실제 서버 메시지로 교체 (id 교체)
        setMessages(prev => prev.map(m =>
          m.id === optimisticMsg.id ? postData.message : m
        ))
      } else {
        // 저장 실패 시 optimistic 메시지 제거 후 재조회
        setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
        await fetchMessages(true)
      }
      // 서버 상태 동기화 (AI 직원 반응 포함)
      setTimeout(() => fetchMessages(true), 500)

      // 2) staff-chat-auto API로 직원 자동 반응 트리거
      setAiTyping(true)
      const cronSecret = import.meta.env.VITE_CRON_SECRET
      const authH2 = await getAuthHeader()
      const autoHeaders = { 'Content-Type': 'application/json', ...authH2 }
      if (cronSecret) autoHeaders['x-cron-secret'] = cronSecret

      fetch('/api/staff-chat-auto', {
        method:  'POST',
        headers: autoHeaders,
        body: JSON.stringify({ action: 'admin_message', room, message: msg }),
      })
        .then(r => r.json())
        .then(d => {
          setAiTyping(false)
          if (d.handled > 0) {
            setAutoMsg(`${d.responders?.join(', ')} 이(가) 반응했어요`)
            setTimeout(() => setAutoMsg(null), 6000)
            // 1차 반응 확인
            fetchMessages(true)
            // 2차 웨이브(토론 이어받기) 확인 — 서버 측 2초 딜레이 고려
            setTimeout(() => fetchMessages(true), 4000)
          } else {
            fetchMessages(true)
          }
        })
        .catch(() => setAiTyping(false))

    } catch (_) { setSending(false) }
    setSending(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── 침묵 시 자연 대화 수동 트리거 ──────────────────────────────
  const triggerNaturalChat = async () => {
    setAiTyping(true)
    try {
      const cronSecret = import.meta.env.VITE_CRON_SECRET
      const authH3 = await getAuthHeader()
      const h = { 'Content-Type': 'application/json', ...authH3 }
      if (cronSecret) h['x-cron-secret'] = cronSecret
      const r = await fetch('/api/staff-chat-auto', {
        method: 'POST', headers: h,
        body: JSON.stringify({ action: 'initiate', room }),
      })
      const d = await r.json().catch(() => ({}))
      if (d.initiated) {
        setAutoMsg(`${d.initiator} 이(가) 대화를 시작했어요`)
        setTimeout(() => setAutoMsg(null), 4000)
        fetchMessages(true)
      }
    } catch (_) {}
    setAiTyping(false)
  }

  const currentRoom = ROOMS.find(r => r.id === room)

  return (
    <>
      {/* ── 플로팅 토글 버튼 ─────────────────────────────────── */}
      <button
        onClick={() => { setOpen(o => !o); setUnread(0) }}
        title="직원 채팅방 (admin 전용)"
        aria-label="직원 채팅방"
        style={{
          position: 'fixed', bottom: 80, right: 20, zIndex: 9998,
          width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(135deg,#3B82F6,#818CF8)',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .2s, box-shadow .2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(59,130,246,0.6)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)';   e.currentTarget.style.boxShadow = '0 4px 20px rgba(59,130,246,0.4)' }}
      >
        <span style={{ fontSize: 20 }}>💼</span>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            background: '#F43F5E', color: '#fff', borderRadius: '50%',
            width: 18, height: 18, fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--f-mono)',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* ── 채팅 팝업 ────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 136, right: 20, zIndex: 9999,
          width: 400, height: minimized ? 48 : 560,
          background: '#080810',
          border: '1px solid rgba(96,165,250,0.25)',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 48px rgba(0,0,0,0.8), 0 0 0 1px rgba(96,165,250,0.1)',
          transition: 'height .25s ease',
          overflow: 'hidden',
          fontFamily: 'var(--f-body,Pretendard,sans-serif)',
        }}>

          {/* ── 헤더 ──────────────────────────────────────────── */}
          <div
            onClick={() => setMinimized(m => !m)}
            style={{
              background: 'linear-gradient(135deg,#0d1b2e,#12102e)',
              borderBottom: '1px solid rgba(96,165,250,0.15)',
              padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', flexShrink: 0, userSelect: 'none',
            }}
          >
            <span style={{ fontSize: 14 }}>💼</span>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#93C5FD', fontWeight:700, letterSpacing:'1.5px' }}>
              STAFF ROOM
            </span>
            <span style={{ fontSize:11, color: currentRoom?.color, marginLeft:2 }}>
              {currentRoom?.emoji} {currentRoom?.label}
            </span>
            <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center' }}>
              {unread > 0 && (
                <span style={{ background:'#F43F5E', color:'#fff', borderRadius:'50%', width:15, height:15,
                  fontSize:9, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--f-mono)' }}>
                  {unread}
                </span>
              )}
              <button
                onClick={e => { e.stopPropagation(); triggerNaturalChat() }}
                title="직원 자연 대화 시작"
                style={{ background:'rgba(96,165,250,0.1)', border:'1px solid rgba(96,165,250,0.2)',
                  borderRadius:4, color:'#60A5FA', cursor:'pointer', fontSize:10, padding:'2px 6px',
                  fontFamily:'var(--f-mono)' }}
              >
                대화↑
              </button>
              <span style={{ color:'#60A5FA', fontSize:13 }}>{minimized ? '▲' : '▼'}</span>
              <button
                onClick={e => { e.stopPropagation(); setOpen(false) }}
                style={{ background:'none', border:'none', color:'#555', cursor:'pointer', fontSize:15, lineHeight:1 }}
              >
                ✕
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* ── 방 탭 ──────────────────────────────────────── */}
              <div style={{
                display: 'flex',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: 'rgba(255,255,255,0.015)',
                flexShrink: 0,
              }}>
                {ROOMS.map(r => (
                  <button key={r.id} onClick={() => setRoom(r.id)}
                    style={{
                      flex: 1, background: 'none', border: 'none',
                      borderBottom: room === r.id ? `2px solid ${r.color}` : '2px solid transparent',
                      color: room === r.id ? r.color : '#444',
                      padding: '6px 2px', cursor: 'pointer',
                      fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.5px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      transition: 'color .15s',
                    }}>
                    <span style={{ fontSize: 12 }}>{r.emoji}</span>
                    <span>{r.label}</span>
                  </button>
                ))}
              </div>

              {/* ── 테이블 없음 안내 배너 ──────────────────────── */}
              {tableNotReady && !tableSetup && (
                <div style={{
                  background: 'rgba(244,63,94,0.08)', borderBottom: '1px solid rgba(244,63,94,0.2)',
                  padding: '10px 14px', fontSize: 11, color: '#F87171',
                  flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, fontWeight:700 }}>
                    <span>⚠️</span>
                    <span>staff_chat_messages 테이블 없음</span>
                  </div>
                  <div style={{ fontSize:10, color:'#fca5a5', lineHeight:1.6 }}>
                    Supabase에 테이블을 생성해야 채팅이 활성화됩니다.<br/>
                    <strong>Admin 시스템 탭</strong>에서 SQL을 복사 후 Supabase SQL Editor에서 실행하세요.
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    <button
                      onClick={() => { tableInitRef.current = false; tableMissingRef.current = true; ensureTable() }}
                      style={{
                        background:'rgba(244,63,94,0.15)', border:'1px solid rgba(244,63,94,0.3)',
                        borderRadius:4, color:'#F87171', cursor:'pointer', fontSize:10, padding:'4px 10px',
                      }}
                    >
                      ⚙️ 자동 생성 재시도
                    </button>
                    <a href="/admin?tab=system"
                      style={{
                        background:'rgba(129,140,248,0.15)', border:'1px solid rgba(129,140,248,0.3)',
                        borderRadius:4, color:'#a78bfa', cursor:'pointer', fontSize:10, padding:'4px 10px',
                        textDecoration:'none', display:'inline-block'
                      }}
                    >
                      🔧 Admin 시스템 탭 이동
                    </a>
                    <a href="https://supabase.com/dashboard/project/itcbantrpkjpkfhnriom/sql/new"
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)',
                        borderRadius:4, color:'#4ade80', cursor:'pointer', fontSize:10, padding:'4px 10px',
                        textDecoration:'none', display:'inline-block'
                      }}
                    >
                      🔗 SQL Editor 열기
                    </a>
                  </div>
                </div>
              )}

              {/* ── 테이블 초기화 중 배너 ─────────────────────── */}
              {tableSetup && (
                <div style={{
                  background: 'rgba(251,191,36,0.08)', borderBottom: '1px solid rgba(251,191,36,0.2)',
                  padding: '5px 14px', fontSize: 10, color: '#FBBF24',
                  fontFamily: 'var(--f-mono)', letterSpacing: '0.5px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span>⚙️</span> 채팅 DB 초기화 중… (최초 1회)
                </div>
              )}

              {/* ── 자동 반응 알림 ─────────────────────────────── */}
              {autoMsg && (
                <div style={{
                  background: 'rgba(96,165,250,0.08)', borderBottom: '1px solid rgba(96,165,250,0.15)',
                  padding: '5px 14px', fontSize: 11, color: '#60A5FA',
                  fontFamily: 'var(--f-mono)', letterSpacing: '0.5px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span>✦</span> {autoMsg}
                </div>
              )}

              {/* ── 메시지 목록 ────────────────────────────────── */}
              <div
                ref={msgListRef}
                style={{
                  flex: 1, overflowY: 'auto', padding: '10px 12px',
                  display: 'flex', flexDirection: 'column', gap: 9,
                  scrollbarWidth: 'thin', scrollbarColor: '#222 transparent',
                }}>
                {loading && (
                  <div style={{ textAlign:'center', color:'#333', fontFamily:'var(--f-mono)', fontSize:10, padding:20 }}>
                    로딩 중…
                  </div>
                )}

                {!loading && messages.length === 0 && (
                  <div style={{ textAlign:'center', color:'#333', fontFamily:'var(--f-mono)', fontSize:10, padding:30, lineHeight:1.8 }}>
                    아직 메시지가 없습니다<br/>
                    <span style={{ color:'#444', fontSize:9 }}>위 "대화↑" 버튼으로 직원 대화를 시작할 수 있어요</span>
                  </div>
                )}

                {messages.map((msg, idx) => {
                  const isAdmin = !msg.sender_key?.startsWith('ai_')
                  const color   = getColor(msg.sender_key)
                  return (
                    <div key={msg.id || idx} style={{
                      display: 'flex', gap: 8, alignItems: 'flex-start',
                      // 관리자 메시지는 우측 정렬
                      flexDirection: isAdmin ? 'row-reverse' : 'row',
                    }}>
                      {/* 아바타 */}
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: `${color}18`,
                        border: `1px solid ${color}35`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12,
                      }}>
                        {msg.sender_emoji || '👤'}
                      </div>

                      <div style={{ flex: 1, minWidth: 0, maxWidth: '85%' }}>
                        {/* 발신자 정보 */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3,
                          flexDirection: isAdmin ? 'row-reverse' : 'row',
                        }}>
                          <span style={{ fontFamily:'var(--f-mono)', fontSize:10, fontWeight:700, color }}>
                            {msg.sender_name}
                          </span>
                          {!isAdmin && (
                            <span style={{ fontSize:9, color:'#3a3a4a', fontFamily:'var(--f-mono)' }}>
                              {msg.sender_team}
                            </span>
                          )}
                          <MsgTypeBadge type={msg.msg_type} />
                          <span style={{ marginLeft: isAdmin ? 0 : 'auto', marginRight: isAdmin ? 'auto' : 0,
                            fontSize:9, color:'#2a2a3a', fontFamily:'var(--f-mono)' }}>
                            {formatTime(msg.created_at)}
                          </span>
                        </div>

                        {/* 메시지 버블 */}
                        <div style={{
                          fontSize: 12, color: isAdmin ? '#D0E8FF' : '#B8B8C8',
                          lineHeight: 1.55,
                          background: isAdmin
                            ? 'linear-gradient(135deg,rgba(59,130,246,0.2),rgba(129,140,248,0.15))'
                            : 'rgba(255,255,255,0.035)',
                          borderRadius: isAdmin ? '12px 3px 12px 12px' : '3px 12px 12px 12px',
                          padding: '7px 11px',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          borderLeft: isAdmin ? 'none' : `2px solid ${color}25`,
                          borderRight: isAdmin ? `2px solid ${color}40` : 'none',
                        }}>
                          {msg.message}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* AI 타이핑 인디케이터 */}
                {aiTyping && (
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(129,140,248,0.15)',
                      border:'1px solid rgba(129,140,248,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>
                      ⚙️
                    </div>
                    <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:'3px 12px 12px 12px',
                      padding:'4px 10px', borderLeft:'2px solid rgba(129,140,248,0.3)' }}>
                      <TypingDots />
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* ── 입력창 ──────────────────────────────────────── */}
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.05)',
                padding: '8px 10px',
                display: 'flex', gap: 6, flexShrink: 0,
                background: 'rgba(255,255,255,0.015)',
              }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={`${currentRoom?.label}에 지시/공유 (Enter 전송, 직원들이 반응해요)`}
                  rows={2}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    color: '#D8D8E8',
                    fontSize: 12,
                    padding: '7px 11px',
                    resize: 'none',
                    outline: 'none',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                    transition: 'border-color .15s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(96,165,250,0.4)'}
                  onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  title="전송 (직원들이 자동으로 반응합니다)"
                  style={{
                    background: (sending || !input.trim())
                      ? '#0f0f1a'
                      : 'linear-gradient(135deg,#3B82F6,#818CF8)',
                    border: 'none', borderRadius: 10, padding: '0 14px',
                    color: (sending || !input.trim()) ? '#333' : '#fff',
                    cursor: (sending || !input.trim()) ? 'not-allowed' : 'pointer',
                    fontSize: 18, flexShrink: 0,
                    transition: 'background .2s',
                    minWidth: 40,
                  }}
                >
                  {sending ? '…' : '↑'}
                </button>
              </div>

              {/* ── 하단 힌트 ────────────────────────────────────── */}
              <div style={{
                padding: '4px 14px 6px',
                fontSize: 9, color: '#2a2a3a', fontFamily: 'var(--f-mono)',
                display: 'flex', justifyContent: 'space-between',
                flexShrink: 0,
              }}>
                <span>💼 admin 전용 채팅방</span>
                <span>메시지 전송 시 직원 자동 반응</span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
