/**
 * src/components/StaffChatPopup.jsx
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  직원 전용 채팅방 팝업 v5.0 — admin role 전용                       ║
 * ║                                                                      ║
 * ║  v5 버그픽스:                                                        ║
 * ║  1. fetchMessages: r.ok 체크 추가 (HTML 응답 시 기존 메시지 유지)   ║
 * ║  2. fetchMessages: JSON 파싱 별도 try/catch (Unexpected token 방지) ║
 * ║  3. fetchMessages: finally 블록으로 fetchingRef 잠금 해제 보장      ║
 * ║  4. fetchMessages: 빈 배열 반환 시 기존 메시지 유지                 ║
 * ║  5. sendMessage: postRes.ok 체크 + JSON 파싱 별도 try/catch         ║
 * ║  6. sendMessage: 저장 실패 시 optimistic 유지 후 폴링에 위임        ║
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
    task_directive:   { label: '업무지시',   color: '#F59E0B' },
    ai_auto:          { label: 'AI 자동',    color: '#818CF8' },
    feedback_handled: { label: '피드백처리', color: '#34D399' },
    notice:           { label: '공지',       color: '#F43F5E' },
    admin_message:    { label: '관리자',     color: '#60A5FA' },
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

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', padding: '4px 8px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: '50%', background: '#555',
          animation: `typingBounce 1.2s ${i * 0.2}s ease-in-out infinite`,
        }} />
      ))}
      <style>{`@keyframes typingBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}`}</style>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ══════════════════════════════════════════════════════════════════════
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
  const [tableSetup,    setTableSetup]    = useState(false)
  const [tableNotReady, setTableNotReady] = useState(false)

  const bottomRef        = useRef(null)
  const msgListRef       = useRef(null)
  const pollRef          = useRef(null)
  const roomRef          = useRef(room)
  const openRef          = useRef(open)

  // ★ v4 핵심: optimistic 메시지 관리
  const optimisticIds    = useRef(new Set())

  // ★ v4 핵심: fetchMessages 중복 호출 방지 — in-flight 플래그
  const fetchingRef      = useRef(false)
  // debounce 타이머
  const fetchDebounceRef = useRef(null)

  // ★ v4 핵심: ensureTable 무한루프 방지 — 실패 후 영구 잠금
  const tableInitRef     = useRef(false)   // 현재 초기화 중
  const tableMissingRef  = useRef(false)   // 테이블 없음 감지됨
  const tableFailedRef   = useRef(false)   // ★ 초기화 실패 → 재시도 금지
  const ensureTableRef   = useRef(null)

  // 이전 메시지 수 (스크롤용)
  const prevMsgLenRef    = useRef(0)
  const shouldScrollRef  = useRef(true)    // ★ 최초 로드 + 신규 메시지 시 스크롤

  useEffect(() => { roomRef.current = room }, [room])
  useEffect(() => { openRef.current = open }, [open])

  // ── admin JWT 헤더 반환 ──────────────────────────────────────────
  const getAuthHeader = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      return session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}
    } catch { return {} }
  }, [])

  // ── 메시지 조회 ─────────────────────────────────────────────────
  // ★ v5: debounce + in-flight 방지 + r.ok 체크 + finally로 잠금 해제 보장
  const fetchMessages = useCallback((silent = false, resetFlag = false) => {
    // debounce: 짧은 시간 내 여러 호출은 마지막 1개만 실행
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)
    fetchDebounceRef.current = setTimeout(async () => {
      // in-flight 중이면 스킵
      if (fetchingRef.current) return
      fetchingRef.current = true
      if (!silent) setLoading(true)

      try {
        const currentRoom = roomRef.current

        // ★ v5: fetch 자체를 try/catch로 분리 — 네트워크 에러 처리
        let r
        try {
          r = await fetch(`/api/staff-chat?room=${currentRoom}&limit=80`)
        } catch (_netErr) {
          // 네트워크 에러 → 기존 메시지 유지, 조용히 종료
          return
        }

        // ★ v5: r.ok 체크 — 서버 오류(500/503 등) HTML 응답 시 기존 메시지 유지
        if (!r.ok) return

        // ★ v5: JSON 파싱을 별도 try/catch — "Unexpected token 'A'" 에러 방지
        let d
        try {
          d = await r.json()
        } catch (_parseErr) {
          // "A server error occurred" 같은 HTML 응답 → 기존 메시지 유지
          return
        }

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

        // 테이블 정상
        tableMissingRef.current = false
        setTableNotReady(false)

        if (Array.isArray(d.messages)) {
          setMessages(prev => {
            const serverIds = new Set(d.messages.map(m => m.id))
            // pending optimistic 메시지 보존
            const pending   = prev.filter(m =>
              optimisticIds.current.has(m.id) && !serverIds.has(m.id)
            )
            const merged = [...d.messages, ...pending]

            // ★ v6: 빈배열 유지 방어 — 방 전환(resetFlag=true)이면 새 방 빈 상태 그대로 표시
            // 일반 폴링에서만 빈배열 유지 방어 적용
            if (!resetFlag && merged.length === 0 && prev.length > 0) return prev

            // 새 메시지 감지 → unread 증가
            const prevReal = prev.filter(m => !optimisticIds.current.has(m.id))
            const newCount = d.messages.length - prevReal.length
            if (!openRef.current && newCount > 0) setUnread(u => u + newCount)

            // 새 메시지 있으면 스크롤
            if (newCount > 0 || merged.length !== prevMsgLenRef.current) {
              shouldScrollRef.current = true
            }

            return merged
          })
        }
      } finally {
        // ★ v5: finally 보장 — 어떤 경로로 종료돼도 잠금 해제
        if (!silent) setLoading(false)
        fetchingRef.current = false
      }
    }, silent ? 80 : 0)
  }, [])

  // ── 테이블 자동 생성 ────────────────────────────────────────────
  const ensureTable = useCallback(async () => {
    if (tableInitRef.current) return      // 이미 진행 중
    if (tableFailedRef.current) return    // ★ v4: 실패 후 재시도 금지
    if (!tableMissingRef.current) return

    tableInitRef.current = true
    setTableSetup(true)
    try {
      const authH = await getAuthHeader()
      if (!authH.Authorization) {
        tableFailedRef.current = true     // 인증 실패 → 재시도 금지
        return
      }
      const r = await fetch('/api/db-setup-staff', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
      })
      const d = await r.json().catch(() => ({}))
      if (d.ok || d.table_exists) {
        tableMissingRef.current = false
        tableFailedRef.current  = false
        setTableNotReady(false)
        fetchMessages(true)
      } else {
        // ★ v4: 실패 시 영구 잠금 (무한 루프 방지)
        tableFailedRef.current = true
      }
    } catch (_) {
      tableFailedRef.current = true       // ★ v4: 예외 시에도 영구 잠금
    } finally {
      setTableSetup(false)
      tableInitRef.current = false
    }
  }, [getAuthHeader, fetchMessages])

  // ensureTable ref 동기화
  useEffect(() => { ensureTableRef.current = ensureTable }, [ensureTable])

  // ── 방 변경 시 메시지 로드 ──────────────────────────────────────
  useEffect(() => {
    setMessages([])
    optimisticIds.current.clear()
    prevMsgLenRef.current  = 0
    shouldScrollRef.current = true
    fetchingRef.current    = false  // ★ v4: 방 변경 시 in-flight 리셋
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)
    fetchMessages(false, true)  // ★ v6: resetFlag=true → 빈 방이어도 이전 메시지 복원 방지
  }, [room]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 폴링 — open 상태에서만 ──────────────────────────────────────
  useEffect(() => {
    if (!open) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(() => fetchMessages(true), 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [open, fetchMessages])

  // ── 새 메시지 자동 스크롤 ───────────────────────────────────────
  // ★ v4: shouldScrollRef로 불필요한 스크롤 방지
  useEffect(() => {
    if (!open || minimized) return
    const newLen = messages.length
    if (newLen === 0) return

    const container = msgListRef.current
    const isAtBottom = !container ||
      (container.scrollHeight - container.scrollTop - container.clientHeight < 100)

    // 새 메시지 있고 (바닥 근처이거나 최초 로드)이면 스크롤
    if (shouldScrollRef.current && (isAtBottom || newLen > prevMsgLenRef.current)) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: newLen <= 5 ? 'auto' : 'smooth' })
      }, 60)
      shouldScrollRef.current = false
    }
    prevMsgLenRef.current = newLen
  }, [messages, open, minimized])

  useEffect(() => {
    if (open) { setUnread(0); shouldScrollRef.current = true }
  }, [open])

  // ── 관리자 메시지 전송 ─────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || sending) return
    const msg      = input.trim()
    const roomSnap = roomRef.current
    setSending(true)
    setInput('')

    // 1) Optimistic 메시지 추가
    const optimisticId  = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const optimisticMsg = {
      id:           optimisticId,
      room:         roomSnap,
      sender_key:   'admin',
      sender_name:  profile.display_name || profile.username || '관리자',
      sender_emoji: '👤',
      sender_color: '#60A5FA',
      sender_team:  '관리자',
      message:      msg,
      msg_type:     'admin_message',
      created_at:   new Date().toISOString(),
    }
    optimisticIds.current.add(optimisticId)
    shouldScrollRef.current = true
    setMessages(prev => [...prev, optimisticMsg])

    try {
      // 2) 서버 저장
      const authH   = await getAuthHeader()
      const postRes = await fetch(`/api/staff-chat?room=${roomSnap}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({
          sender_key:   'admin',
          sender_name:  profile.display_name || profile.username || '관리자',
          sender_emoji: '👤',
          sender_color: '#60A5FA',
          sender_team:  '관리자',
          message:      msg,
          msg_type:     'admin_message',
        }),
      })
      // ★ v5: postRes.ok 체크 + JSON 파싱 별도 try/catch
      let postData = {}
      if (postRes.ok) {
        try { postData = await postRes.json() } catch (_) {}
      }

      if (postData.ok && postData.message) {
        // ★ v5: optimistic → 서버 메시지 즉시 교체
        optimisticIds.current.delete(optimisticId)
        shouldScrollRef.current = true
        setMessages(prev => prev.map(m =>
          m.id === optimisticId ? postData.message : m
        ))
      } else {
        // ★ v5: 저장 실패 시 optimistic 메시지를 '전송 실패' 상태로 표시하고
        // 다음 폴링(4s)에서 자연스럽게 정리되도록 함 (즉시 제거 → 빈 화면 방지)
        // optimisticIds에서 제거하여 다음 fetch 시 서버 메시지로 대체되도록
        optimisticIds.current.delete(optimisticId)
        // 즉시 fetchMessages 호출하여 실제 서버 상태와 동기화
        setTimeout(() => fetchMessages(true), 300)
      }

      // 3) staff-chat-auto 트리거 (fire & forget)
      setAiTyping(true)
      const authH2 = await getAuthHeader()
      fetch('/api/staff-chat-auto', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authH2 },
        body: JSON.stringify({ action: 'admin_message', room: roomSnap, message: msg }),
      })
        .then(async r => {
          // ★ v5: r.ok 체크 후 JSON 파싱
          if (!r.ok) return {}
          try { return await r.json() } catch (_) { return {} }
        })
        .then(d => {
          setAiTyping(false)
          if (d.handled > 0) {
            setAutoMsg(`${d.responders?.join(', ')} 이(가) 반응했어요`)
            setTimeout(() => setAutoMsg(null), 6000)
          }
          // AI 응답 후 fetchMessages로 동기화
          fetchMessages(true)
        })
        .catch(() => {
          setAiTyping(false)
          fetchMessages(true)
        })

    } catch (_) {
      // ★ v5: 전송 오류 시 optimistic 제거 후 서버 동기화
      optimisticIds.current.delete(optimisticId)
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      setTimeout(() => fetchMessages(true), 300)
    } finally {
      setSending(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── 침묵 시 자연 대화 트리거 ────────────────────────────────────
  const triggerNaturalChat = async () => {
    setAiTyping(true)
    try {
      const authH = await getAuthHeader()
      const r = await fetch('/api/staff-chat-auto', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ action: 'initiate', room: roomRef.current }),
      })
      const d = await r.json().catch(() => ({}))
      if (d.initiated) {
        setAutoMsg(`${d.initiator} 이(가) 대화를 시작했어요`)
        setTimeout(() => setAutoMsg(null), 4000)
        setTimeout(() => fetchMessages(true), 1500)
      }
    } catch (_) {}
    setAiTyping(false)
  }

  // ── 수동 ensureTable 재시도 ──────────────────────────────────────
  const retryEnsureTable = () => {
    tableInitRef.current   = false
    tableFailedRef.current = false
    tableMissingRef.current = true
    ensureTable()
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
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.1)'
          e.currentTarget.style.boxShadow = '0 6px 28px rgba(59,130,246,0.6)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(59,130,246,0.4)'
        }}
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
                <span style={{
                  background:'#F43F5E', color:'#fff', borderRadius:'50%',
                  width:15, height:15, fontSize:9,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontFamily:'var(--f-mono)',
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
                    <span>⚠️</span><span>staff_chat_messages 테이블 없음</span>
                  </div>
                  <div style={{ fontSize:10, color:'#fca5a5', lineHeight:1.6 }}>
                    Supabase에 테이블을 생성해야 채팅이 활성화됩니다.
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    <button
                      onClick={retryEnsureTable}
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
                        textDecoration:'none', display:'inline-block',
                      }}
                    >
                      🔧 Admin 시스템 탭
                    </a>
                  </div>
                </div>
              )}

              {tableSetup && (
                <div style={{
                  background: 'rgba(251,191,36,0.08)', borderBottom: '1px solid rgba(251,191,36,0.2)',
                  padding: '5px 14px', fontSize: 10, color: '#FBBF24',
                  fontFamily: 'var(--f-mono)', letterSpacing: '0.5px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span>⚙️</span> 채팅 DB 초기화 중…
                </div>
              )}

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
                    <span style={{ color:'#444', fontSize:9 }}>위 "대화↑" 버튼으로 직원 대화를 시작할 수 있어요</span>
                  </div>
                )}

                {messages.map((msg, idx) => {
                  const isAdmin   = !msg.sender_key?.startsWith('ai_')
                  const color     = getColor(msg.sender_key)
                  const isPending = optimisticIds.current.has(msg.id)
                  return (
                    <div key={msg.id || `msg-${idx}`} style={{
                      display: 'flex', gap: 8, alignItems: 'flex-start',
                      flexDirection: isAdmin ? 'row-reverse' : 'row',
                      opacity: isPending ? 0.65 : 1,
                      transition: 'opacity .3s',
                    }}>
                      {/* 아바타 */}
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: `${color}18`, border: `1px solid ${color}35`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12,
                      }}>
                        {msg.sender_emoji || '👤'}
                      </div>

                      <div style={{ flex: 1, minWidth: 0, maxWidth: '85%' }}>
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
                          <span style={{
                            marginLeft: isAdmin ? 0 : 'auto',
                            marginRight: isAdmin ? 'auto' : 0,
                            fontSize:9, color:'#2a2a3a', fontFamily:'var(--f-mono)',
                          }}>
                            {isPending ? '전송 중…' : formatTime(msg.created_at)}
                          </span>
                        </div>

                        <div style={{
                          fontSize: 12, color: isAdmin ? '#D0E8FF' : '#B8B8C8',
                          lineHeight: 1.55,
                          background: isAdmin
                            ? 'linear-gradient(135deg,rgba(59,130,246,0.2),rgba(129,140,248,0.15))'
                            : 'rgba(255,255,255,0.035)',
                          borderRadius: isAdmin ? '12px 3px 12px 12px' : '3px 12px 12px 12px',
                          padding: '7px 11px',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          borderLeft:  isAdmin ? 'none'                  : `2px solid ${color}25`,
                          borderRight: isAdmin ? `2px solid ${color}40`  : 'none',
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
                      <TypingDots />
                    </div>
                  </div>
                )}

                <div ref={bottomRef} style={{ height: 1 }} />
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
                  placeholder={`${currentRoom?.label}에 지시/공유 (Enter 전송)`}
                  rows={2}
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10, color: '#D8D8E8', fontSize: 12,
                    padding: '7px 11px', resize: 'none', outline: 'none',
                    fontFamily: 'inherit', lineHeight: 1.5, transition: 'border-color .15s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(96,165,250,0.4)'}
                  onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  title="전송"
                  style={{
                    background: (sending || !input.trim())
                      ? '#0f0f1a'
                      : 'linear-gradient(135deg,#3B82F6,#818CF8)',
                    border: 'none', borderRadius: 10, padding: '0 14px',
                    color: (sending || !input.trim()) ? '#333' : '#fff',
                    cursor: (sending || !input.trim()) ? 'not-allowed' : 'pointer',
                    fontSize: 18, flexShrink: 0, transition: 'background .2s', minWidth: 40,
                  }}
                >
                  {sending ? '…' : '↑'}
                </button>
              </div>

              <div style={{
                padding: '4px 14px 6px', fontSize: 9, color: '#2a2a3a',
                fontFamily: 'var(--f-mono)', display: 'flex', justifyContent: 'space-between',
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
