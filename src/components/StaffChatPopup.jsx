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

  const [open,      setOpen]      = useState(false)
  const [room,      setRoom]      = useState('general')
  const [messages,  setMessages]  = useState([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [sending,   setSending]   = useState(false)
  const [unread,    setUnread]    = useState(0)
  const [minimized, setMinimized] = useState(false)
  const [aiTyping,  setAiTyping]  = useState(false)    // AI 직원 타이핑 표시
  const [autoMsg,   setAutoMsg]   = useState(null)     // 자동 반응 결과 표시

  const bottomRef  = useRef(null)
  const pollRef    = useRef(null)
  const prevCountRef = useRef(0)

  // ── CRON_SECRET 없이도 admin 토큰으로 호출 가능하게 ─────────────
  const getAuthHeader = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      return session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}
    } catch { return {} }
  }, [])

  // ── 메시지 조회 ─────────────────────────────────────────────────
  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await fetch(`/api/staff-chat?room=${room}&limit=80`)
      const d = await r.json().catch(() => ({}))
      if (Array.isArray(d.messages)) {
        setMessages(prev => {
          const newCount = d.messages.length - prev.length
          if (!open && newCount > 0) setUnread(u => u + newCount)
          return d.messages
        })
      }
    } catch (_) {}
    if (!silent) setLoading(false)
  }, [room, open])

  // 방 변경 시 메시지 로드
  useEffect(() => {
    setMessages([])
    prevCountRef.current = 0
    fetchMessages()
  }, [room])  // eslint-disable-line

  // 폴링 — 3초마다 (5초에서 단축)
  useEffect(() => {
    pollRef.current = setInterval(() => fetchMessages(true), 3000)
    return () => clearInterval(pollRef.current)
  }, [fetchMessages])

  // 새 메시지 시 자동 스크롤
  useEffect(() => {
    if (open && !minimized && messages.length > 0) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
    }
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
      // 1) 관리자 메시지 먼저 채팅방에 삽입
      await fetch(`/api/staff-chat?room=${room}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
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
      await fetchMessages(true)

      // 2) staff-chat-auto API로 직원 자동 반응 트리거
      setAiTyping(true)
      const cronSecret = import.meta.env.VITE_CRON_SECRET
      const autoHeaders = { 'Content-Type': 'application/json' }
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
            setTimeout(() => setAutoMsg(null), 4000)
          }
          fetchMessages(true)
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
      const h = { 'Content-Type': 'application/json' }
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
              <div style={{
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
