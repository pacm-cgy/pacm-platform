/**
 * src/components/StaffChatPopup.jsx
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  직원 전용 채팅방 팝업 — admin role 유저에게만 표시                  ║
 * ║  플랫폼 어디서나 우하단 플로팅 버튼으로 접근 가능                   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../store'
import { supabase } from '../lib/supabase'

const ROOMS = [
  { id: 'general',  label: '전체 채팅',  emoji: '💬', color: '#60A5FA' },
  { id: 'ops',      label: '업무 지시',  emoji: '📋', color: '#F59E0B' },
  { id: 'feedback', label: '피드백',     emoji: '📥', color: '#34D399' },
  { id: 'strategy', label: '전략 회의',  emoji: '🎯', color: '#F472B6' },
]

// AI 직원 색상 맵
const STAFF_COLORS = {
  ai_aria: '#818CF8', ai_nova: '#C084FC', ai_lumi: '#34D399',
  ai_pulse: '#38BDF8', ai_trend: '#FB923C', ai_sage: '#10B981',
  ai_echo: '#F472B6', ai_learn: '#A78BFA', ai_hana: '#FBBF24',
  ai_max: '#F87171',
}

function getColor(username) {
  if (!username) return '#60A5FA'
  if (STAFF_COLORS[username]) return STAFF_COLORS[username]
  // 기타 AI 직원 — username prefix로 색상 결정
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
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function MsgTypeBadge({ type }) {
  if (!type || type === 'chat') return null
  const MAP = {
    task_directive:   { label: '업무지시', color: '#F59E0B' },
    ai_auto:          { label: 'AI 자동', color: '#818CF8' },
    feedback_handled: { label: '피드백처리', color: '#34D399' },
    notice:           { label: '공지',    color: '#F43F5E' },
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

export default function StaffChatPopup() {
  const { profile } = useAuthStore()
  const [open, setOpen]         = useState(false)
  const [room, setRoom]         = useState('general')
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [sending, setSending]   = useState(false)
  const [unread, setUnread]     = useState(0)
  const [minimized, setMinimized] = useState(false)
  const bottomRef = useRef(null)
  const pollRef   = useRef(null)

  // 관리자만 표시
  if (!profile || profile.role !== 'admin') return null

  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await fetch(`/api/staff-chat?room=${room}&limit=60`)
      const d = await r.json()
      if (d.messages) {
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
    fetchMessages()
  }, [room])

  // 폴링 — 5초마다
  useEffect(() => {
    pollRef.current = setInterval(() => fetchMessages(true), 5000)
    return () => clearInterval(pollRef.current)
  }, [fetchMessages])

  // 새 메시지 시 스크롤
  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [messages, open, minimized])

  // 열면 읽음 처리
  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  const sendMessage = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      // 관리자가 직접 보내는 메시지는 관리자 본인 정보로 전송
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`/api/staff-chat?room=${room}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_key:   profile.username || 'admin',
          sender_name:  profile.display_name || 'Admin',
          sender_emoji: '👤',
          sender_color: '#60A5FA',
          sender_team:  '관리자',
          message:      input.trim(),
          msg_type:     'chat',
        }),
      })
      setInput('')
      await fetchMessages(true)
    } catch (_) {}
    setSending(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const currentRoom = ROOMS.find(r => r.id === room)

  return (
    <>
      {/* 플로팅 토글 버튼 */}
      <button
        onClick={() => { setOpen(o => !o); setUnread(0) }}
        title="직원 채팅방"
        style={{
          position: 'fixed', bottom: 80, right: 20, zIndex: 9998,
          width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(135deg,#3B82F6,#818CF8)',
          border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .2s, box-shadow .2s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
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

      {/* 채팅 팝업 */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 136, right: 20, zIndex: 9999,
          width: 380, height: minimized ? 48 : 520,
          background: 'var(--bg1,#0A0A0A)',
          border: '1px solid rgba(96,165,250,0.3)',
          borderRadius: 14, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          transition: 'height .25s ease',
          overflow: 'hidden',
          fontFamily: 'var(--f-body,Pretendard,sans-serif)',
        }}>

          {/* 헤더 */}
          <div style={{
            background: 'linear-gradient(135deg,#1e3a5f,#1a1a2e)',
            borderBottom: '1px solid rgba(96,165,250,0.2)',
            padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
            cursor: 'pointer', flexShrink: 0,
          }}
            onClick={() => setMinimized(m => !m)}
          >
            <span style={{ fontSize: 15 }}>💼</span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: '#93C5FD', fontWeight: 700, letterSpacing: '1px' }}>
              STAFF ROOM
            </span>
            <span style={{ fontSize: 12, color: currentRoom?.color, marginLeft: 4 }}>
              {currentRoom?.emoji} {currentRoom?.label}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {unread > 0 && (
                <span style={{ background: '#F43F5E', color: '#fff', borderRadius: '50%', width: 16, height: 16,
                  fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--f-mono)' }}>
                  {unread}
                </span>
              )}
              <span style={{ color: '#60A5FA', fontSize: 14 }}>{minimized ? '▲' : '▼'}</span>
              <button onClick={e => { e.stopPropagation(); setOpen(false) }}
                style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
                ✕
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* 방 탭 */}
              <div style={{
                display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.02)', flexShrink: 0,
              }}>
                {ROOMS.map(r => (
                  <button key={r.id} onClick={() => setRoom(r.id)}
                    style={{
                      flex: 1, background: 'none', border: 'none',
                      borderBottom: room === r.id ? `2px solid ${r.color}` : '2px solid transparent',
                      color: room === r.id ? r.color : '#555',
                      padding: '6px 4px', cursor: 'pointer',
                      fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.5px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}>
                    <span style={{ fontSize: 13 }}>{r.emoji}</span>
                    <span>{r.label}</span>
                  </button>
                ))}
              </div>

              {/* 메시지 목록 */}
              <div style={{
                flex: 1, overflowY: 'auto', padding: '10px 12px',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                {loading && (
                  <div style={{ textAlign: 'center', color: '#444', fontFamily: 'var(--f-mono)', fontSize: 11, padding: 20 }}>
                    로딩 중…
                  </div>
                )}
                {!loading && messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#444', fontFamily: 'var(--f-mono)', fontSize: 11, padding: 30 }}>
                    아직 메시지가 없습니다
                  </div>
                )}
                {messages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    {/* 아바타 */}
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: `${getColor(msg.sender_key)}20`,
                      border: `1px solid ${getColor(msg.sender_key)}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13,
                    }}>
                      {msg.sender_emoji || '👤'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 700,
                          color: getColor(msg.sender_key) }}>
                          {msg.sender_name}
                        </span>
                        <span style={{ fontSize: 9, color: '#444', fontFamily: 'var(--f-mono)' }}>
                          {msg.sender_team}
                        </span>
                        <MsgTypeBadge type={msg.msg_type} />
                        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#333', fontFamily: 'var(--f-mono)' }}>
                          {formatTime(msg.created_at)}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 12, color: '#C0C0C0', lineHeight: 1.5,
                        background: 'rgba(255,255,255,0.04)', borderRadius: 8,
                        padding: '6px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        borderLeft: `2px solid ${getColor(msg.sender_key)}30`,
                      }}>
                        {msg.message}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* 입력창 */}
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                padding: '8px 10px', display: 'flex', gap: 6, flexShrink: 0,
                background: 'rgba(255,255,255,0.02)',
              }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={`${currentRoom?.label}에 메시지 입력… (Enter 전송)`}
                  rows={2}
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                    color: '#E0E0E0', fontSize: 12, padding: '6px 10px',
                    resize: 'none', outline: 'none', fontFamily: 'inherit',
                    lineHeight: 1.4,
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  style={{
                    background: sending || !input.trim() ? '#1a1a2e' : 'linear-gradient(135deg,#3B82F6,#818CF8)',
                    border: 'none', borderRadius: 8, padding: '0 12px',
                    color: sending || !input.trim() ? '#444' : '#fff',
                    cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                    fontSize: 16, flexShrink: 0,
                  }}>
                  {sending ? '…' : '↑'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
