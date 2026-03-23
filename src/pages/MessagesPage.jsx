import { useState, useEffect, useRef } from 'react'
import { Send, Search, Plus, ArrowLeft, MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store'
import { Link } from 'react-router-dom'

export default function MessagesPage() {
  const { user } = useAuthStore()
  const [convs, setConvs]       = useState([])
  const [activeConv, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const msgEndRef = useRef(null)

  useEffect(() => {
    if (user) loadConvs()
  }, [user])

  useEffect(() => {
    if (activeConv) {
      loadMessages(activeConv.id)
      const sub = supabase
        .channel(`msgs-${activeConv.id}`)
        .on('postgres_changes', {
          event:'INSERT', schema:'public', table:'messages',
          filter: `conv_id=eq.${activeConv.id}`
        }, payload => {
          setMessages(prev => [...prev, payload.new])
          setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
        })
        .subscribe()
      return () => sub.unsubscribe()
    }
  }, [activeConv])

  async function loadConvs() {
    const { data } = await supabase
      .from('messages_conversations')
      .select('*')
      .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
      .order('last_msg_at', { ascending: false })
    setConvs(data || [])
  }

  async function loadMessages(convId) {
    setLoading(true)
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conv_id', convId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoading(false)
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior:'smooth' }), 100)
    // 읽음 처리
    await supabase.from('messages')
      .update({ is_read: true })
      .eq('conv_id', convId)
      .neq('sender_id', user?.id)
  }

  async function sendMessage() {
    if (!input.trim() || !activeConv || !user) return
    const content = input.trim()
    setInput('')
    const { data } = await supabase.from('messages').insert({
      conv_id: activeConv.id,
      sender_id: user.id,
      content,
    }).select().single()
    if (data) {
      setMessages(prev => [...prev, data])
      await supabase.from('messages_conversations')
        .update({ last_msg_at: new Date().toISOString() })
        .eq('id', activeConv.id)
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
    }
  }

  if (!user) return (
    <div className="page-inner" style={{ textAlign:'center', paddingTop:80 }}>
      <MessageSquare size={48} color="var(--text-4)" style={{ margin:'0 auto 16px' }} />
      <h2 style={{ fontFamily:'var(--f-display)', marginBottom:8 }}>메시지</h2>
      <p style={{ color:'var(--text-3)', marginBottom:24 }}>로그인 후 메시지를 이용할 수 있습니다</p>
      <Link to="/login" className="btn btn-primary">로그인</Link>
    </div>
  )

  return (
    <div style={{ display:'flex', height:'calc(100vh - 32px - var(--nav-h))', maxHeight:700 }}>

      {/* 대화 목록 */}
      <div style={{
        width: activeConv ? 0 : '100%',
        maxWidth: 320,
        borderRight: '1px solid var(--line-1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'all 0.3s ease',
      }} className="conv-list-panel">

        <div style={{ padding:'16px', borderBottom:'1px solid var(--line-1)', display:'flex', alignItems:'center', gap:8 }}>
          <h2 style={{ fontFamily:'var(--f-display)', fontSize:18, fontWeight:700, flex:1 }}>메시지</h2>
          <button className="icon-btn"><Plus size={16} /></button>
        </div>

        <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--line-1)' }}>
          <div className="search-bar">
            <Search size={13} color="var(--text-4)" />
            <input placeholder="대화 검색..." />
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto' }}>
          {convs.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--text-3)', fontSize:13 }}>
              아직 대화가 없습니다
            </div>
          ) : convs.map(conv => (
            <div
              key={conv.id}
              onClick={() => setActive(conv)}
              style={{
                padding:'14px 16px',
                borderBottom:'1px solid var(--line-1)',
                cursor:'pointer',
                background: activeConv?.id === conv.id ? 'var(--brand-dim)' : 'transparent',
                transition:'background 0.15s',
                display:'flex', gap:12, alignItems:'center'
              }}
            >
              <div style={{
                width:40, height:40, borderRadius:'50%',
                background:'var(--bg-3)', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:700, fontSize:15, color:'var(--brand)'
              }}>
                {conv.context_type === 'scout' ? '🎯' : '💬'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13.5, fontWeight:600, color:'var(--text-1)', marginBottom:2 }}>
                  {conv.context_type === 'scout' ? '스카우트 문의' : '일반 메시지'}
                </div>
                <div style={{ fontSize:12, color:'var(--text-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {new Date(conv.last_msg_at).toLocaleString('ko-KR', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 메시지 뷰 */}
      {activeConv ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
          {/* 채팅 헤더 */}
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--line-1)', display:'flex', alignItems:'center', gap:12 }}>
            <button className="icon-btn" onClick={() => setActive(null)}>
              <ArrowLeft size={16} />
            </button>
            <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--bg-3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
              {activeConv.context_type === 'scout' ? '🎯' : '💬'}
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:600 }}>
                {activeConv.context_type === 'scout' ? '스카우트 문의' : '메시지'}
              </div>
              <div style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--f-mono)' }}>
                {activeConv.platform}
              </div>
            </div>
          </div>

          {/* 메시지 목록 */}
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:4 }}>
            {loading ? (
              <div style={{ textAlign:'center', color:'var(--text-3)', paddingTop:40 }}>로딩 중...</div>
            ) : messages.map(m => (
              <div key={m.id} className={`msg-bubble${m.sender_id === user?.id ? ' me' : ''}`}>
                {m.sender_id !== user?.id && (
                  <div className="msg-avatar" style={{ background:'var(--brand-dim)' }} />
                )}
                <div>
                  <div className="msg-content">{m.content}</div>
                  <div className="msg-time" style={{ textAlign: m.sender_id === user?.id ? 'right' : 'left' }}>
                    {new Date(m.created_at).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            <div ref={msgEndRef} />
          </div>

          {/* 입력창 */}
          <div style={{ padding:'12px 20px', borderTop:'1px solid var(--line-1)', display:'flex', gap:10 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
              placeholder="메시지를 입력하세요..."
              style={{ flex:1 }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={sendMessage}
              disabled={!input.trim()}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-3)', flexDirection:'column', gap:12 }}>
          <MessageSquare size={40} />
          <p style={{ fontSize:14 }}>대화를 선택하세요</p>
        </div>
      )}
    </div>
  )
}
