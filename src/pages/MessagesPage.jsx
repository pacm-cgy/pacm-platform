import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store'
import { Send, ArrowLeft, User } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

export default function MessagesPage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const toId = params.get('to')

  const [threads, setThreads] = useState([])   // 대화 목록
  const [activeThread, setActiveThread] = useState(null) // 선택된 상대방
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [threadProfile, setThreadProfile] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!user) navigate('/')
  }, [user])

  // 대화 목록 로드
  useEffect(() => {
    if (!user) return
    loadThreads()
  }, [user])

  // to 파라미터로 직접 오면 해당 유저와 대화 열기
  useEffect(() => {
    if (toId && user && toId !== user.id) {
      setActiveThread(toId)
      supabase.from('profiles').select('id,display_name,avatar_url,username').eq('id', toId).maybeSingle()
        .then(({ data }) => setThreadProfile(data))
    }
  }, [toId, user])

  // 메시지 로드
  useEffect(() => {
    if (!activeThread || !user) return
    loadMessages(activeThread)
    // 읽음 처리
    supabase.from('messages').update({ is_read: true })
      .eq('receiver_id', user.id).eq('sender_id', activeThread).eq('is_read', false)
      .then(() => {})
  }, [activeThread, user])

  // 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadThreads() {
    setLoading(true)
    const { data: sent } = await supabase.from('messages')
      .select('sender_id,receiver_id,content,created_at,is_read')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false }).limit(200)

    if (!sent) { setLoading(false); return }

    // 상대방별로 그룹화
    const threadMap = {}
    for (const m of sent) {
      const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id
      if (!threadMap[otherId]) threadMap[otherId] = { lastMsg: m, unread: 0, otherId }
      if (m.receiver_id === user.id && !m.is_read) threadMap[otherId].unread++
    }

    // 상대방 프로필 로드
    const otherIds = Object.keys(threadMap)
    if (!otherIds.length) { setThreads([]); setLoading(false); return }

    const { data: profiles } = await supabase.from('profiles')
      .select('id,display_name,avatar_url,username').in('id', otherIds)
    const profileMap = {}
    for (const p of (profiles||[])) profileMap[p.id] = p

    const result = Object.values(threadMap).map(t => ({ ...t, profile: profileMap[t.otherId] }))
      .sort((a,b) => new Date(b.lastMsg.created_at) - new Date(a.lastMsg.created_at))

    setThreads(result)
    setLoading(false)
  }

  async function loadMessages(otherId) {
    const { data } = await supabase.from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true }).limit(100)
    setMessages(data || [])
  }

  async function sendMessage() {
    if (!input.trim() || !activeThread || sending) return
    setSending(true)
    const content = input.trim().slice(0, 2000)
    setInput('')
    const { data, error } = await supabase.from('messages').insert({
      sender_id: user.id, receiver_id: activeThread, content
    }).select().single()
    if (!error && data) {
      setMessages(prev => [...prev, data])
      loadThreads()
    } else if (error?.code === '42P01') {
      alert('메시지 기능을 사용하려면 관리자가 DB를 초기화해야 합니다.\n어드민 대시보드 > DB 초기화 실행')
      setInput(content)
    }
    setSending(false)
  }

  function selectThread(otherId, prof) {
    setActiveThread(otherId)
    setThreadProfile(prof)
  }

  if (!user) return null

  return (
    <div style={{ display:'flex', height:'calc(100vh - 130px)', maxWidth:'900px', margin:'0 auto', border:'1px solid var(--c-border)', borderTop:'none' }}>
      {/* 대화 목록 */}
      <div style={{ width:'260px', flexShrink:0, borderRight:'1px solid var(--c-border)', overflowY:'auto', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px', borderBottom:'1px solid var(--c-border)', fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-gold)', letterSpacing:'2px' }}>
          MESSAGES
        </div>
        {loading ? (
          <div style={{ padding:'20px', color:'var(--c-muted)', fontSize:'12px' }}>로딩 중...</div>
        ) : threads.length === 0 ? (
          <div style={{ padding:'20px', color:'var(--c-muted)', fontSize:'12px' }}>대화가 없습니다</div>
        ) : threads.map(t => (
          <div key={t.otherId}
            onClick={() => selectThread(t.otherId, t.profile)}
            style={{ padding:'14px 16px', cursor:'pointer', borderBottom:'1px solid var(--c-border)', background: activeThread===t.otherId ? 'var(--c-gray-1)' : 'transparent', transition:'background 0.1s' }}>
            <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
              <div className="avatar" style={{ width:'34px', height:'34px', fontSize:'13px', flexShrink:0 }}>
                {t.profile?.avatar_url ? <img src={t.profile.avatar_url} alt=""/> : t.profile?.display_name?.[0]||'U'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'13px', fontWeight:600, display:'flex', justifyContent:'space-between' }}>
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.profile?.display_name||'알 수 없음'}</span>
                  {t.unread > 0 && <span style={{ background:'var(--c-gold)', color:'#000', fontSize:'10px', fontWeight:700, borderRadius:'10px', padding:'1px 6px', flexShrink:0, marginLeft:'4px' }}>{t.unread}</span>}
                </div>
                <div style={{ fontSize:'11px', color:'var(--c-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:'2px' }}>
                  {t.lastMsg.content?.slice(0,30)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 채팅 영역 */}
      {activeThread ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
          {/* 헤더 */}
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--c-border)', display:'flex', alignItems:'center', gap:'10px' }}>
            <div className="avatar" style={{ width:'32px', height:'32px', fontSize:'13px' }}>
              {threadProfile?.avatar_url ? <img src={threadProfile.avatar_url} alt=""/> : threadProfile?.display_name?.[0]||'U'}
            </div>
            <div>
              <div style={{ fontSize:'14px', fontWeight:600 }}>{threadProfile?.display_name||'알 수 없음'}</div>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-muted)' }}>@{threadProfile?.username}</div>
            </div>
            <button onClick={() => navigate(`/profile/${activeThread}`)} className="btn btn-ghost btn-sm" style={{ marginLeft:'auto', gap:'4px' }}>
              <User size={12}/> 프로필
            </button>
          </div>

          {/* 메시지 목록 */}
          <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:'10px' }}>
            {messages.map(m => {
              const isMine = m.sender_id === user.id
              return (
                <div key={m.id} style={{ display:'flex', justifyContent:isMine?'flex-end':'flex-start' }}>
                  <div style={{
                    maxWidth:'70%', padding:'10px 14px', fontSize:'14px', lineHeight:1.6,
                    background: isMine ? 'var(--c-gold)' : 'var(--c-gray-2)',
                    color: isMine ? '#000' : 'var(--c-paper)',
                    borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    wordBreak:'break-word',
                  }}>
                    {m.content}
                    <div style={{ fontSize:'10px', color:isMine?'rgba(0,0,0,0.5)':'var(--c-gray-5)', marginTop:'4px', textAlign:isMine?'right':'left', fontFamily:'var(--f-mono)' }}>
                      {format(new Date(m.created_at), 'H:mm', { locale: ko })}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef}/>
          </div>

          {/* 입력창 */}
          <div style={{ padding:'12px 16px', borderTop:'1px solid var(--c-border)', display:'flex', gap:'8px' }}>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="메시지를 입력하세요..." maxLength={2000}
              style={{ flex:1, padding:'10px 14px', background:'var(--c-gray-1)', border:'1px solid var(--c-border)', color:'var(--c-paper)', fontSize:'14px', fontFamily:'var(--f-sans)', outline:'none' }}
            />
            <button onClick={sendMessage} disabled={sending || !input.trim()} className="btn btn-gold" style={{ padding:'10px 16px' }}>
              <Send size={15}/>
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--c-muted)', fontSize:'14px', flexDirection:'column', gap:'8px' }}>
          <MessageCircle size={36} color="var(--c-gray-4)"/>
          <span>대화를 선택하세요</span>
        </div>
      )}
    </div>
  )
}

function MessageCircle({ size, color }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color||'currentColor'} strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
}
