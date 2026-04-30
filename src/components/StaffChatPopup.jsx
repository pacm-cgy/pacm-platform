/**
 * src/components/StaffChatPopup.jsx
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  직원 전용 채팅방 팝업 v7.0 — 레이스컨디션 완전 제거               ║
 * ║                                                                      ║
 * ║  v7 핵심 변경:                                                       ║
 * ║  1. debounce 제거 → 단순 단일 fetchingRef 잠금                     ║
 * ║  2. 방 전환 시: fetchingRef 강제 해제 + 토큰 증가 → 구 fetch 무효화║
 * ║  3. fetchMessages(silent, reset): reset=true → 빈배열 허용           ║
 * ║  4. 폴링: setInterval 대신 setTimeout 체인 → 누적 방지             ║
 * ║  5. AI 응답 후: 1초/4초 두 번만 재조회 (단순화)                    ║
 * ║  6. aiTyping: 25초 타임아웃 자동 해제                               ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../store'
import { supabase } from '../lib/supabase'

const ROOMS = [
  { id: 'general',  label: '전체 채팅', emoji: '💬', color: '#60A5FA' },
  { id: 'ops',      label: '업무 지시', emoji: '📋', color: '#F59E0B' },
  { id: 'feedback', label: '피드백',    emoji: '📥', color: '#34D399' },
  { id: 'strategy', label: '전략 회의', emoji: '🎯', color: '#F472B6' },
]

const STAFF_COLORS = {
  ai_aria:'#818CF8', ai_nova:'#C084FC', ai_lumi:'#34D399',
  ai_pulse:'#38BDF8', ai_trend:'#FB923C', ai_sage:'#10B981',
  ai_echo:'#F472B6', ai_learn:'#A78BFA', ai_hana:'#FBBF24',
  ai_max:'#F87171',
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
  return '#60A5FA'
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function MsgTypeBadge({ type }) {
  if (!type || type === 'chat') return null
  const MAP = {
    task_directive:   { label:'업무지시',  color:'#F59E0B' },
    ai_auto:          { label:'AI 자동',   color:'#818CF8' },
    feedback_handled: { label:'피드백처리',color:'#34D399' },
    notice:           { label:'공지',      color:'#F43F5E' },
    admin_message:    { label:'관리자',    color:'#60A5FA' },
  }
  const m = MAP[type]
  if (!m) return null
  return (
    <span style={{
      fontSize:9, background:`${m.color}20`, color:m.color,
      border:`1px solid ${m.color}40`, borderRadius:3,
      padding:'1px 5px', marginLeft:4, fontFamily:'var(--f-mono)',
    }}>
      {m.label}
    </span>
  )
}

function TypingDots() {
  return (
    <div style={{ display:'flex', gap:3, alignItems:'center', padding:'4px 8px' }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width:5, height:5, borderRadius:'50%', background:'#555',
          animation:`typingBounce 1.2s ${i*0.2}s ease-in-out infinite`,
        }}/>
      ))}
      <style>{`@keyframes typingBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}`}</style>
    </div>
  )
}

export default function StaffChatPopup() {
  const { profile } = useAuthStore()
  if (!profile || profile.role !== 'admin') return null

  const [open,          setOpen]          = useState(false)
  const [room,          setRoom]          = useState('general')
  const [messages,      setMessages]      = useState([])
  const [input,         setInput]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [sending,       setSending]       = useState(false)
  const [unread,        setUnread]        = useState(0)
  const [minimized,     setMinimized]     = useState(false)
  const [aiTyping,      setAiTyping]      = useState(false)
  const [autoMsg,       setAutoMsg]       = useState(null)
  const [tableNotReady, setTableNotReady] = useState(false)
  const [tableSetup,    setTableSetup]    = useState(false)

  const bottomRef       = useRef(null)
  const msgListRef      = useRef(null)
  const roomRef         = useRef('general')
  const openRef         = useRef(false)
  const fetchingRef     = useRef(false)      // ★ 단 하나의 잠금
  const fetchTokenRef   = useRef(0)          // ★ 방 전환 시 증가 → 이전 fetch 무효화
  const pollTimerRef    = useRef(null)       // setTimeout 체인 핸들
  const aiTimerRef      = useRef(null)       // aiTyping 자동 해제 타이머
  const prevMsgLen      = useRef(0)
  const scrollNeeded    = useRef(true)
  const optimisticIds   = useRef(new Set())
  const tableInitRef    = useRef(false)
  const tableMissingRef = useRef(false)
  const tableFailedRef  = useRef(false)
  const ensureTableRef  = useRef(null)

  useEffect(() => { roomRef.current = room }, [room])
  useEffect(() => { openRef.current = open }, [open])

  const getAuthHeader = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      return session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` } : {}
    } catch { return {} }
  }, [])

  // ────────────────────────────────────────────────────────────────────
  // fetchMessages — v7 완전 재작성
  // ★ debounce 없음: 즉시 실행 또는 즉시 스킵
  // ★ silent=true  → fetchingRef 잠금 검사 없이 실행 (폴링용)
  //   silent=false → 잠금 확인 후 실행 (UI 로딩 표시)
  // ★ reset=true   → 방 전환 직후: 빈 배열도 그대로 적용
  // ────────────────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (silent = false, reset = false) => {
    // ★ 핵심: silent=false(비-폴링)일 때만 잠금 확인
    if (!silent && fetchingRef.current) return
    if (!silent) {
      fetchingRef.current = true
      setLoading(true)
    }

    const currentRoom = roomRef.current
    const token = fetchTokenRef.current   // 이 fetch가 유효한 토큰 스냅샷

    try {
      let r
      try {
        r = await fetch(`/api/staff-chat?room=${currentRoom}&limit=80`)
      } catch (_) {
        // 네트워크 오류 → 기존 유지
        return
      }

      // ★ 방이 바뀌었거나 토큰이 증가했으면 이 응답은 무효
      if (token !== fetchTokenRef.current) return
      if (currentRoom !== roomRef.current) return

      // ★ 서버 오류(HTML 응답) → 기존 유지
      if (!r.ok) return

      let d
      try { d = await r.json() }
      catch (_) { return }  // JSON 파싱 실패 → 기존 유지

      // 토큰 재확인 (json() 완료 후 방 전환이 됐을 수도 있음)
      if (token !== fetchTokenRef.current) return
      if (currentRoom !== roomRef.current) return

      // 테이블 없음 감지
      if (d.table_missing === true || d.table_ready === false) {
        if (!tableMissingRef.current) {
          tableMissingRef.current = true
          setTableNotReady(true)
          if (!tableInitRef.current && !tableFailedRef.current) {
            ensureTableRef.current?.()
          }
        }
        return
      }
      tableMissingRef.current = false
      setTableNotReady(false)

      if (Array.isArray(d.messages)) {
        setMessages(prev => {
          const serverIds = new Set(d.messages.map(m => m.id))
          const pending = prev.filter(m =>
            optimisticIds.current.has(m.id) && !serverIds.has(m.id)
          )
          const merged = [...d.messages, ...pending]

          // ★ reset=false(폴링): 빈 배열이면 기존 유지 (일시 오류 방어)
          // ★ reset=true(방 전환): 빈 배열도 그대로 적용
          if (!reset && merged.length === 0 && prev.length > 0) return prev

          const prevReal = prev.filter(m => !optimisticIds.current.has(m.id))
          const newCount = d.messages.length - prevReal.length
          if (!openRef.current && newCount > 0) setUnread(u => u + newCount)
          if (newCount > 0 || merged.length !== prevMsgLen.current) {
            scrollNeeded.current = true
          }
          return merged
        })
      }
    } finally {
      // ★ 반드시 실행: 잠금 해제
      if (!silent) {
        fetchingRef.current = false
        setLoading(false)
      }
    }
  }, [])

  // ── 테이블 자동 생성 ────────────────────────────────────────────
  const ensureTable = useCallback(async () => {
    if (tableInitRef.current) return
    if (tableFailedRef.current) return
    if (!tableMissingRef.current) return
    tableInitRef.current = true
    setTableSetup(true)
    try {
      const authH = await getAuthHeader()
      if (!authH.Authorization) { tableFailedRef.current = true; return }
      const r = await fetch('/api/db-setup-staff', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', ...authH },
      })
      const d = await r.json().catch(() => ({}))
      if (d.ok || d.table_exists) {
        tableMissingRef.current = false
        tableFailedRef.current  = false
        setTableNotReady(false)
        await fetchMessages(true, true)
      } else {
        tableFailedRef.current = true
      }
    } catch (_) {
      tableFailedRef.current = true
    } finally {
      setTableSetup(false)
      tableInitRef.current = false
    }
  }, [getAuthHeader, fetchMessages])

  useEffect(() => { ensureTableRef.current = ensureTable }, [ensureTable])

  // ── 방 전환 ─────────────────────────────────────────────────────
  // ★ v7 핵심: 토큰 증가 → 진행 중 fetch 무효화 → fetchingRef 강제 해제
  useEffect(() => {
    fetchTokenRef.current += 1          // ★ 모든 이전 fetch 무효화
    fetchingRef.current = false         // ★ 잠금 강제 해제 (이전 fetch가 잠가뒀을 수도)
    setMessages([])
    optimisticIds.current.clear()
    prevMsgLen.current = 0
    scrollNeeded.current = true
    setLoading(false)

    // 폴링 타이머 리셋
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)

    // 즉시 최신 메시지 로드 (reset=true)
    fetchMessages(false, true)
  }, [room]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 폴링: setTimeout 체인 (누적 방지) ──────────────────────────
  useEffect(() => {
    if (!open) {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      return
    }

    const scheduleNext = () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      pollTimerRef.current = setTimeout(async () => {
        if (openRef.current) {
          await fetchMessages(true, false)  // silent=true → 잠금 없이
          scheduleNext()
        }
      }, 5000)
    }

    scheduleNext()
    return () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current) }
  }, [open, fetchMessages])

  // ── 자동 스크롤 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open || minimized) return
    const newLen = messages.length
    if (newLen === 0) return
    const container = msgListRef.current
    const nearBottom = !container ||
      container.scrollHeight - container.scrollTop - container.clientHeight < 100
    if (scrollNeeded.current && (nearBottom || newLen > prevMsgLen.current)) {
      setTimeout(() => bottomRef.current?.scrollIntoView({
        behavior: newLen <= 5 ? 'auto' : 'smooth'
      }), 60)
      scrollNeeded.current = false
    }
    prevMsgLen.current = newLen
  }, [messages, open, minimized])

  useEffect(() => {
    if (open) { setUnread(0); scrollNeeded.current = true }
  }, [open])

  // ── 메시지 전송 ─────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || sending) return
    const msg = input.trim()
    const roomSnap = roomRef.current
    const tokenSnap = fetchTokenRef.current
    setSending(true)
    setInput('')

    // 1) Optimistic 추가
    const optId = `opt-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
    const optMsg = {
      id: optId, room: roomSnap,
      sender_key: 'admin',
      sender_name: profile.display_name || profile.username || '관리자',
      sender_emoji:'👤', sender_color:'#60A5FA', sender_team:'관리자',
      message: msg, msg_type:'admin_message',
      created_at: new Date().toISOString(),
    }
    optimisticIds.current.add(optId)
    scrollNeeded.current = true
    setMessages(prev => [...prev, optMsg])

    try {
      // 2) 서버 저장
      const authH = await getAuthHeader()
      let saved = false
      let savedMsg = null
      try {
        const res = await fetch(`/api/staff-chat?room=${roomSnap}`, {
          method:'POST',
          headers:{ 'Content-Type':'application/json', ...authH },
          body: JSON.stringify({
            sender_key: 'admin',
            sender_name: profile.display_name || profile.username || '관리자',
            sender_emoji:'👤', sender_color:'#60A5FA', sender_team:'관리자',
            message: msg, msg_type:'admin_message',
          }),
        })
        if (res.ok) {
          let d = {}
          try { d = await res.json() } catch (_) {}
          if (d.ok && d.message) { saved = true; savedMsg = d.message }
        }
      } catch (_) {}

      if (saved && savedMsg) {
        optimisticIds.current.delete(optId)
        scrollNeeded.current = true
        setMessages(prev => prev.map(m => m.id === optId ? savedMsg : m))
      } else {
        optimisticIds.current.delete(optId)
        // silent 폴링에 맡김
      }

      // 3) AI 자동 반응 (fire-and-forget)
      setAiTyping(true)
      clearTimeout(aiTimerRef.current)
      aiTimerRef.current = setTimeout(() => setAiTyping(false), 25000)

      const authH2 = await getAuthHeader()
      fetch('/api/staff-chat-auto', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', ...authH2 },
        body: JSON.stringify({ action:'admin_message', room:roomSnap, message:msg }),
      })
        .then(r => {
          if (!r.ok) return {}
          return r.json().catch(() => ({}))
        })
        .then(d => {
          clearTimeout(aiTimerRef.current)
          setAiTyping(false)
          if (d.handled > 0 && d.responders?.length > 0) {
            setAutoMsg(`${d.responders.join(', ')} 이(가) 반응했어요`)
            setTimeout(() => setAutoMsg(null), 5000)
          }
          // AI 응답 완료 후 즉시 + 3.5초 후 재조회
          fetchMessages(true, false)
          setTimeout(() => {
            if (tokenSnap === fetchTokenRef.current) fetchMessages(true, false)
          }, 3500)
        })
        .catch(() => {
          clearTimeout(aiTimerRef.current)
          setAiTyping(false)
          fetchMessages(true, false)
        })

    } catch (_) {
      optimisticIds.current.delete(optId)
      setMessages(prev => prev.filter(m => m.id !== optId))
    } finally {
      setSending(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── 침묵 시 자연 대화 트리거 ───────────────────────────────────
  const triggerNaturalChat = async () => {
    setAiTyping(true)
    clearTimeout(aiTimerRef.current)
    aiTimerRef.current = setTimeout(() => setAiTyping(false), 25000)
    try {
      const authH = await getAuthHeader()
      const r = await fetch('/api/staff-chat-auto', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', ...authH },
        body: JSON.stringify({ action:'initiate', room:roomRef.current }),
      })
      const d = await r.json().catch(() => ({}))
      clearTimeout(aiTimerRef.current)
      setAiTyping(false)
      if (d.initiated) {
        setAutoMsg(`${d.initiator} 이(가) 대화를 시작했어요`)
        setTimeout(() => setAutoMsg(null), 4000)
        setTimeout(() => fetchMessages(true, false), 1500)
      }
    } catch (_) {
      clearTimeout(aiTimerRef.current)
      setAiTyping(false)
    }
  }

  const retryEnsureTable = () => {
    tableInitRef.current    = false
    tableFailedRef.current  = false
    tableMissingRef.current = true
    ensureTable()
  }

  const currentRoom = ROOMS.find(r => r.id === room)

  return (
    <>
      {/* ── 플로팅 버튼 ─────────────────────────────────────────── */}
      <button
        onClick={() => { setOpen(o => !o); setUnread(0) }}
        title="직원 채팅방 (admin 전용)"
        style={{
          position:'fixed', bottom:80, right:20, zIndex:9998,
          width:48, height:48, borderRadius:'50%',
          background:'linear-gradient(135deg,#3B82F6,#818CF8)',
          border:'none', cursor:'pointer',
          boxShadow:'0 4px 20px rgba(59,130,246,0.4)',
          display:'flex', alignItems:'center', justifyContent:'center',
          transition:'transform .2s, box-shadow .2s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform='scale(1.1)'
          e.currentTarget.style.boxShadow='0 6px 28px rgba(59,130,246,0.6)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform='scale(1)'
          e.currentTarget.style.boxShadow='0 4px 20px rgba(59,130,246,0.4)'
        }}
      >
        <span style={{ fontSize:20 }}>💼</span>
        {unread > 0 && (
          <span style={{
            position:'absolute', top:-2, right:-2,
            background:'#F43F5E', color:'#fff', borderRadius:'50%',
            width:18, height:18, fontSize:10, fontWeight:700,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* ── 채팅 팝업 ──────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position:'fixed', bottom:136, right:20, zIndex:9999,
          width:400, height:minimized ? 48 : 560,
          background:'#080810',
          border:'1px solid rgba(96,165,250,0.25)',
          borderRadius:16,
          display:'flex', flexDirection:'column',
          boxShadow:'0 12px 48px rgba(0,0,0,0.8), 0 0 0 1px rgba(96,165,250,0.1)',
          transition:'height .25s ease',
          overflow:'hidden',
          fontFamily:'var(--f-body,Pretendard,sans-serif)',
        }}>

          {/* ── 헤더 ───────────────────────────────────────────── */}
          <div
            onClick={() => setMinimized(m => !m)}
            style={{
              background:'linear-gradient(135deg,#0d1b2e,#12102e)',
              borderBottom:'1px solid rgba(96,165,250,0.15)',
              padding:'10px 14px',
              display:'flex', alignItems:'center', gap:8,
              cursor:'pointer', flexShrink:0, userSelect:'none',
            }}
          >
            <span style={{ fontSize:14 }}>💼</span>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#93C5FD', fontWeight:700, letterSpacing:'1.5px' }}>
              STAFF ROOM
            </span>
            <span style={{ fontSize:11, color:currentRoom?.color, marginLeft:2 }}>
              {currentRoom?.emoji} {currentRoom?.label}
            </span>
            <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center' }}>
              {unread > 0 && (
                <span style={{
                  background:'#F43F5E', color:'#fff', borderRadius:'50%',
                  width:15, height:15, fontSize:9,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {unread}
                </span>
              )}
              <button
                onClick={e => { e.stopPropagation(); triggerNaturalChat() }}
                title="직원 자연 대화 시작"
                style={{
                  background:'rgba(96,165,250,0.1)', border:'1px solid rgba(96,165,250,0.2)',
                  borderRadius:4, color:'#60A5FA', cursor:'pointer', fontSize:10,
                  padding:'2px 6px', fontFamily:'var(--f-mono)',
                }}
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
                display:'flex',
                borderBottom:'1px solid rgba(255,255,255,0.05)',
                background:'rgba(255,255,255,0.015)',
                flexShrink:0,
              }}>
                {ROOMS.map(r => (
                  <button key={r.id} onClick={() => setRoom(r.id)}
                    style={{
                      flex:1, background:'none', border:'none',
                      borderBottom: room === r.id ? `2px solid ${r.color}` : '2px solid transparent',
                      color: room === r.id ? r.color : '#444',
                      padding:'6px 2px', cursor:'pointer',
                      fontFamily:'var(--f-mono)', fontSize:9, letterSpacing:'0.5px',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                      transition:'color .15s',
                    }}>
                    <span style={{ fontSize:12 }}>{r.emoji}</span>
                    <span>{r.label}</span>
                  </button>
                ))}
              </div>

              {/* ── 배너들 ──────────────────────────────────────── */}
              {tableNotReady && !tableSetup && (
                <div style={{
                  background:'rgba(244,63,94,0.08)', borderBottom:'1px solid rgba(244,63,94,0.2)',
                  padding:'10px 14px', fontSize:11, color:'#F87171',
                  flexShrink:0, display:'flex', flexDirection:'column', gap:8,
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, fontWeight:700 }}>
                    <span>⚠️</span><span>staff_chat_messages 테이블 없음</span>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={retryEnsureTable} style={{
                      background:'rgba(244,63,94,0.15)', border:'1px solid rgba(244,63,94,0.3)',
                      borderRadius:4, color:'#F87171', cursor:'pointer', fontSize:10, padding:'4px 10px',
                    }}>
                      ⚙️ 자동 생성 재시도
                    </button>
                  </div>
                </div>
              )}
              {tableSetup && (
                <div style={{
                  background:'rgba(251,191,36,0.08)', borderBottom:'1px solid rgba(251,191,36,0.2)',
                  padding:'5px 14px', fontSize:10, color:'#FBBF24',
                  fontFamily:'var(--f-mono)', flexShrink:0,
                  display:'flex', alignItems:'center', gap:6,
                }}>
                  <span>⚙️</span> 채팅 DB 초기화 중…
                </div>
              )}
              {autoMsg && (
                <div style={{
                  background:'rgba(96,165,250,0.08)', borderBottom:'1px solid rgba(96,165,250,0.15)',
                  padding:'5px 14px', fontSize:11, color:'#60A5FA',
                  fontFamily:'var(--f-mono)', flexShrink:0,
                  display:'flex', alignItems:'center', gap:6,
                }}>
                  <span>✦</span> {autoMsg}
                </div>
              )}

              {/* ── 메시지 목록 ─────────────────────────────────── */}
              <div
                ref={msgListRef}
                style={{
                  flex:1, overflowY:'auto', padding:'10px 12px',
                  display:'flex', flexDirection:'column', gap:9,
                  scrollbarWidth:'thin', scrollbarColor:'#222 transparent',
                }}
              >
                {loading && messages.length === 0 && (
                  <div style={{ textAlign:'center', color:'#333', fontFamily:'var(--f-mono)', fontSize:10, padding:20 }}>
                    로딩 중…
                  </div>
                )}
                {!loading && messages.length === 0 && (
                  <div style={{ textAlign:'center', color:'#333', fontFamily:'var(--f-mono)', fontSize:10, padding:30, lineHeight:1.8 }}>
                    아직 메시지가 없습니다<br/>
                    <span style={{ color:'#444', fontSize:9 }}>위 「대화↑」 버튼으로 직원 대화를 시작할 수 있어요</span>
                  </div>
                )}

                {messages.map((msg, idx) => {
                  const isAdmin = !msg.sender_key?.startsWith('ai_')
                  const color = getColor(msg.sender_key)
                  const isPending = optimisticIds.current.has(msg.id)
                  return (
                    <div key={msg.id || `msg-${idx}`} style={{
                      display:'flex', gap:8, alignItems:'flex-start',
                      flexDirection: isAdmin ? 'row-reverse' : 'row',
                      opacity: isPending ? 0.65 : 1,
                      transition:'opacity .3s',
                    }}>
                      <div style={{
                        width:28, height:28, borderRadius:'50%', flexShrink:0,
                        background:`${color}18`, border:`1px solid ${color}35`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:12,
                      }}>
                        {msg.sender_emoji || '👤'}
                      </div>
                      <div style={{ flex:1, minWidth:0, maxWidth:'85%' }}>
                        <div style={{
                          display:'flex', alignItems:'center', gap:5, marginBottom:3,
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
                          <MsgTypeBadge type={msg.msg_type}/>
                          <span style={{
                            marginLeft: isAdmin ? 0 : 'auto',
                            marginRight: isAdmin ? 'auto' : 0,
                            fontSize:9, color:'#2a2a3a', fontFamily:'var(--f-mono)',
                          }}>
                            {isPending ? '전송 중…' : formatTime(msg.created_at)}
                          </span>
                        </div>
                        <div style={{
                          fontSize:12, color: isAdmin ? '#D0E8FF' : '#B8B8C8',
                          lineHeight:1.55,
                          background: isAdmin
                            ? 'linear-gradient(135deg,rgba(59,130,246,0.2),rgba(129,140,248,0.15))'
                            : 'rgba(255,255,255,0.035)',
                          borderRadius: isAdmin ? '12px 3px 12px 12px' : '3px 12px 12px 12px',
                          padding:'7px 11px',
                          whiteSpace:'pre-wrap', wordBreak:'break-word',
                          borderLeft:  isAdmin ? 'none' : `2px solid ${color}25`,
                          borderRight: isAdmin ? `2px solid ${color}40` : 'none',
                        }}>
                          {msg.message}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {aiTyping && (
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <div style={{
                      width:28, height:28, borderRadius:'50%',
                      background:'rgba(129,140,248,0.15)',
                      border:'1px solid rgba(129,140,248,0.3)',
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:12,
                    }}>
                      ⚙️
                    </div>
                    <div style={{
                      background:'rgba(255,255,255,0.04)',
                      borderRadius:'3px 12px 12px 12px',
                      padding:'4px 10px',
                      borderLeft:'2px solid rgba(129,140,248,0.3)',
                    }}>
                      <TypingDots/>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} style={{ height:1 }}/>
              </div>

              {/* ── 입력창 ──────────────────────────────────────── */}
              <div style={{
                borderTop:'1px solid rgba(255,255,255,0.05)',
                padding:'8px 10px',
                display:'flex', gap:6, flexShrink:0,
                background:'rgba(255,255,255,0.015)',
              }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={`${currentRoom?.label}에 지시/공유 (Enter 전송)`}
                  rows={2}
                  style={{
                    flex:1, background:'rgba(255,255,255,0.04)',
                    border:'1px solid rgba(255,255,255,0.08)',
                    borderRadius:10, color:'#D8D8E8', fontSize:12,
                    padding:'7px 11px', resize:'none', outline:'none',
                    fontFamily:'inherit', lineHeight:1.5,
                  }}
                  onFocus={e => e.target.style.borderColor='rgba(96,165,250,0.4)'}
                  onBlur={e  => e.target.style.borderColor='rgba(255,255,255,0.08)'}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  style={{
                    background: (sending || !input.trim())
                      ? '#0f0f1a'
                      : 'linear-gradient(135deg,#3B82F6,#818CF8)',
                    border:'none', borderRadius:10, padding:'0 14px',
                    color: (sending || !input.trim()) ? '#333' : '#fff',
                    cursor: (sending || !input.trim()) ? 'not-allowed' : 'pointer',
                    fontSize:18, flexShrink:0,
                  }}
                >
                  {sending ? '…' : '↑'}
                </button>
              </div>

              <div style={{
                padding:'4px 14px 6px', fontSize:9, color:'#2a2a3a',
                fontFamily:'var(--f-mono)', display:'flex', justifyContent:'space-between',
                flexShrink:0,
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
