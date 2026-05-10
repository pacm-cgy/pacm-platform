import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Search, Plus, ArrowLeft, MessageSquare, X, User, Check, CheckCheck, Loader2, Users } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

/* ── 새 대화 시작 모달 ─────────────────────────────────────────────── */
function NewConvModal({ user, onClose, onCreated }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(null) // userId

  async function searchUsers(q) {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const { data } = await supabase.from('profiles')
      .select('id,username,display_name,avatar_url,school,startup_name')
      .neq('id', user.id)
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(10)
    setResults(data || [])
    setSearching(false)
  }

  async function startConv(targetUser) {
    setCreating(targetUser.id)
    try {
      // 기존 대화방 확인
      const { data: existing } = await supabase.from('messages_conversations')
        .select('id')
        .or(`and(participant_a.eq.${user.id},participant_b.eq.${targetUser.id}),and(participant_a.eq.${targetUser.id},participant_b.eq.${user.id})`)
        .maybeSingle()
      let convId
      if (existing) {
        convId = existing.id
      } else {
        const { data: newConv, error } = await supabase.from('messages_conversations')
          .insert({ participant_a: user.id, participant_b: targetUser.id, context_type:'general' })
          .select().single()
        if (error) throw error
        convId = newConv.id
      }
      onCreated(convId)
      onClose()
    } catch {}
    setCreating(null)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:'100%', maxWidth:420, background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:14, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,.85)' }}>
        <div style={{ padding:'18px 20px', borderBottom:'1px solid var(--b1)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Users size={16} color="#3B82F6"/>
            <span style={{ fontFamily:'var(--f-display)', fontSize:15, fontWeight:700, color:'var(--t1)' }}>새 대화 시작</span>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t3)', padding:4 }}><X size={16}/></button>
        </div>
        <div style={{ padding:16 }}>
          <div style={{ position:'relative', marginBottom:12 }}>
            <Search size={13} color="var(--t4)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }}/>
            <input
              autoFocus
              value={query}
              onChange={e=>{ setQuery(e.target.value); searchUsers(e.target.value) }}
              placeholder="사용자 이름 또는 닉네임 검색..."
              style={{ width:'100%', padding:'10px 12px 10px 32px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:9, color:'var(--t1)', fontSize:13, fontFamily:'var(--f-sans)', outline:'none', boxSizing:'border-box', transition:'border-color .15s' }}
              onFocus={e=>e.target.style.borderColor='rgba(59,130,246,.4)'} onBlur={e=>e.target.style.borderColor='var(--b2)'}
            />
            {searching && <Loader2 size={13} color="var(--t4)" style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', animation:'spin 1s linear infinite' }}/>}
          </div>
          {results.length === 0 && query.trim() && !searching && (
            <div style={{ textAlign:'center', padding:'24px 0', color:'var(--t4)', fontSize:13 }}>검색 결과가 없습니다</div>
          )}
          {!query.trim() && (
            <div style={{ textAlign:'center', padding:'24px 0', color:'var(--t4)', fontSize:12 }}>닉네임이나 이름으로 검색하세요</div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:300, overflowY:'auto' }}>
            {results.map(u => (
              <div key={u.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 12px', background:'var(--bg3)', borderRadius:9, border:'1px solid var(--b1)', cursor:'pointer', transition:'all .15s' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(59,130,246,.35)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='var(--b1)'}>
                <div style={{ width:38, height:38, borderRadius:'50%', background:'var(--bg4)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                  {u.avatar_url
                    ? <img src={u.avatar_url} style={{ width:38, height:38, objectFit:'cover' }} alt=""/>
                    : <User size={18} color="var(--t4)"/>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--t1)' }}>{u.display_name || u.username}</div>
                  <div style={{ fontSize:11, color:'var(--t3)', fontFamily:'var(--f-mono)' }}>@{u.username} {u.school ? `· ${u.school}` : ''}</div>
                </div>
                <button
                  onClick={()=>startConv(u)}
                  disabled={creating === u.id}
                  style={{ padding:'6px 14px', background:'rgba(59,130,246,.12)', border:'1px solid rgba(59,130,246,.3)', borderRadius:7, color:'#3B82F6', fontSize:12, fontFamily:'var(--f-sans)', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
                  {creating === u.id ? <Loader2 size={11} style={{ animation:'spin 1s linear infinite' }}/> : <MessageSquare size={12}/>}
                  대화하기
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 타이핑 인디케이터 도트 애니메이션 ─────────────────────────────── */
function TypingDots() {
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:8, padding:'4px 0' }}>
      <div style={{ width:26, height:26, borderRadius:'50%', background:'var(--blue-dim)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <User size={12} color="var(--blue)"/>
      </div>
      <div style={{ padding:'10px 14px', borderRadius:'14px 14px 14px 3px', background:'var(--bg3)', border:'1px solid var(--b1)', display:'flex', alignItems:'center', gap:4 }}>
        <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--t3)', display:'inline-block', animation:'typingBounce 1.2s ease-in-out infinite' }}/>
        <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--t3)', display:'inline-block', animation:'typingBounce 1.2s ease-in-out 0.2s infinite' }}/>
        <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--t3)', display:'inline-block', animation:'typingBounce 1.2s ease-in-out 0.4s infinite' }}/>
      </div>
    </div>
  )
}

/* ── 읽음 수신 아이콘 ──────────────────────────────────────────────── */
function ReadReceipt({ isRead, isSending }) {
  if (isSending) return <Loader2 size={10} color="rgba(255,255,255,.5)" style={{ animation:'spin 1s linear infinite' }}/>
  if (isRead)   return <CheckCheck size={10} color="#22C55E"/>
  return <Check size={10} color="rgba(255,255,255,.5)"/>
}

/* ── 메인 컴포넌트 ─────────────────────────────────────────────────── */
export default function MessagesPage() {
  const { user } = useAuthStore()
  const [convs, setConvs]         = useState([])
  const [activeConv, setActive]   = useState(null)
  const [otherUser, setOtherUser] = useState(null)
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [convsLoading, setConvsLoading] = useState(true)
  const [showNew, setShowNew]     = useState(false)
  const [convSearch, setConvSearch] = useState('')
  const [unreadCounts, setUnreadCounts] = useState({})

  // ── 타이핑 인디케이터 상태 ─────────────────────────────────────────
  const [isTyping, setIsTyping]         = useState(false)   // 상대방이 입력 중인지
  const [myTypingTimer, setMyTypingTimer] = useState(null)  // 내 타이핑 타이머 ref
  const presenceChannelRef = useRef(null)                    // Presence 채널 ref

  const msgEndRef  = useRef(null)
  const inputRef   = useRef(null)

  // 대화 목록 로드
  const loadConvs = useCallback(async () => {
    if (!user) return
    setConvsLoading(true)
    const { data } = await supabase
      .from('messages_conversations')
      .select(`
        *,
        profile_a:profiles!messages_conversations_participant_a_fkey(id,username,display_name,avatar_url,school),
        profile_b:profiles!messages_conversations_participant_b_fkey(id,username,display_name,avatar_url,school)
      `)
      .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
      .order('last_msg_at', { ascending: false })
    setConvs(data || [])
    setConvsLoading(false)

    // 미읽음 카운트
    if (data?.length) {
      const counts = {}
      await Promise.all(data.map(async conv => {
        const { count } = await supabase.from('messages')
          .select('id', { count:'exact', head:true })
          .eq('conv_id', conv.id)
          .eq('is_read', false)
          .neq('sender_id', user.id)
        counts[conv.id] = count || 0
      }))
      setUnreadCounts(counts)
    }
  }, [user])

  useEffect(() => { loadConvs() }, [loadConvs])

  // ── 활성 대화방 실시간 구독 (메시지 INSERT) ────────────────────────
  useEffect(() => {
    if (!activeConv) return
    loadMessages(activeConv.id)

    const msgSub = supabase
      .channel(`msgs-${activeConv.id}`)
      .on('postgres_changes', {
        event:'INSERT', schema:'public', table:'messages',
        filter:`conv_id=eq.${activeConv.id}`
      }, payload => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev
          return [...prev, payload.new]
        })
        setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
        // 상대방 메시지 → 즉시 읽음 처리
        if (payload.new.sender_id !== user?.id) {
          supabase.from('messages').update({ is_read:true }).eq('id', payload.new.id).then(()=>{})
          setUnreadCounts(prev => ({ ...prev, [activeConv.id]: 0 }))
        }
      })
      // ── 내 메시지의 is_read 업데이트 실시간 반영 ──
      .on('postgres_changes', {
        event:'UPDATE', schema:'public', table:'messages',
        filter:`conv_id=eq.${activeConv.id}`
      }, payload => {
        setMessages(prev => prev.map(m =>
          m.id === payload.new.id ? { ...m, is_read: payload.new.is_read } : m
        ))
      })
      .subscribe()

    return () => msgSub.unsubscribe()
  }, [activeConv, user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Presence 채널 — 타이핑 인디케이터 ─────────────────────────────
  useEffect(() => {
    if (!activeConv || !user) {
      // 이전 presence 채널 정리
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current)
        presenceChannelRef.current = null
      }
      setIsTyping(false)
      return
    }

    const channelName = `typing:${activeConv.id}`
    const ch = supabase.channel(channelName, {
      config: { presence: { key: user.id } }
    })

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState()
      // 나 외의 사용자가 typing:true 상태이면 인디케이터 표시
      const othersTyping = Object.entries(state)
        .filter(([key]) => key !== user.id)
        .some(([, presences]) => presences.some(p => p.typing === true))
      setIsTyping(othersTyping)
    })

    ch.on('presence', { event: 'join' }, ({ newPresences }) => {
      const otherTyping = newPresences
        .filter(p => p.user_id !== user.id)
        .some(p => p.typing === true)
      if (otherTyping) setIsTyping(true)
    })

    ch.on('presence', { event: 'leave' }, () => {
      const state = ch.presenceState()
      const othersTyping = Object.entries(state)
        .filter(([key]) => key !== user.id)
        .some(([, presences]) => presences.some(p => p.typing === true))
      setIsTyping(othersTyping)
    })

    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ user_id: user.id, typing: false })
      }
    })

    presenceChannelRef.current = ch

    return () => {
      supabase.removeChannel(ch)
      presenceChannelRef.current = null
      setIsTyping(false)
    }
  }, [activeConv, user])

  // ── 입력창 변경 → Presence typing 상태 브로드캐스트 ───────────────
  function handleInputChange(e) {
    setInput(e.target.value)
    broadcastTyping(e.target.value.length > 0)
  }

  function broadcastTyping(typing) {
    const ch = presenceChannelRef.current
    if (!ch || !user) return
    // 기존 타이머 초기화
    if (myTypingTimer) clearTimeout(myTypingTimer)
    ch.track({ user_id: user.id, typing })
    if (typing) {
      // 3초 후 자동으로 typing: false 브로드캐스트
      const timer = setTimeout(() => {
        ch.track({ user_id: user.id, typing: false })
      }, 3000)
      setMyTypingTimer(timer)
    }
  }

  // ── 메시지 로드 + 읽음 처리 ───────────────────────────────────────
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
    // 읽음 처리 — 상대방 메시지 전부 is_read=true
    await supabase.from('messages')
      .update({ is_read: true })
      .eq('conv_id', convId)
      .neq('sender_id', user?.id)
      .eq('is_read', false)
    setUnreadCounts(prev => ({ ...prev, [convId]: 0 }))
  }

  async function selectConv(conv) {
    setActive(conv)
    setIsTyping(false)
    const other = conv.participant_a === user?.id ? conv.profile_b : conv.profile_a
    setOtherUser(other)
    inputRef.current?.focus()
  }

  // ── 메시지 전송 ───────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || !activeConv || !user) return
    const content = input.trim()
    setInput('')
    // 타이핑 상태 즉시 해제
    broadcastTyping(false)
    if (myTypingTimer) { clearTimeout(myTypingTimer); setMyTypingTimer(null) }

    // 낙관적 업데이트 (sending 플래그 추가)
    const tempId = `temp-${Date.now()}`
    const tempMsg = {
      id: tempId,
      conv_id: activeConv.id,
      sender_id: user.id,
      content,
      is_read: false,
      _sending: true,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior:'smooth' }), 50)

    const { data, error } = await supabase
      .from('messages')
      .insert({ conv_id:activeConv.id, sender_id:user.id, content })
      .select().single()

    if (!error && data) {
      setMessages(prev => prev.map(m => m.id === tempId ? data : m))
      // 대화방 last_msg_at 업데이트
      await supabase.from('messages_conversations')
        .update({ last_msg_at: data.created_at })
        .eq('id', activeConv.id)
      loadConvs()
    } else {
      // 전송 실패 → 에러 표시
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _error: true, _sending: false } : m))
    }
  }

  function getOtherProfile(conv) {
    if (!conv || !user) return null
    return conv.participant_a === user.id ? conv.profile_b : conv.profile_a
  }

  const filteredConvs = convSearch.trim()
    ? convs.filter(c => {
        const other = getOtherProfile(c)
        return other?.display_name?.toLowerCase().includes(convSearch.toLowerCase())
          || other?.username?.toLowerCase().includes(convSearch.toLowerCase())
      })
    : convs

  const totalUnread = Object.values(unreadCounts).reduce((a,b)=>a+b, 0)

  if (!user) return (
    <div style={{ textAlign:'center', paddingTop:80, paddingBottom:80 }}>
      <MessageSquare size={48} color="var(--t4)" style={{ margin:'0 auto 16px' }}/>
      <h2 style={{ fontFamily:'var(--f-display)', marginBottom:8, color:'var(--t1)' }}>메시지</h2>
      <p style={{ color:'var(--t3)', marginBottom:24, fontSize:14 }}>로그인 후 메시지를 이용할 수 있습니다</p>
      <Link to="/login" className="btn btn-primary">로그인</Link>
    </div>
  )

  return (
    <div style={{ minHeight:'calc(100vh - var(--hdr-h) - 32px)', paddingBottom:40 }}>
      <Helmet>
        <title>메시지 | Insightship</title>
        <meta name="description" content="Insightship 메시지 — 청소년 창업가들과 1:1로 소통하세요."/>
        <meta name="robots" content="noindex"/>
        <link rel="canonical" href="https://insightship.vercel.app/messages"/>
      </Helmet>

      {/* 페이지 헤더 */}
      <div style={{ padding:'28px var(--pad-x) 20px', borderBottom:'1px solid var(--b1)', background:'linear-gradient(180deg,rgba(59,130,246,.05) 0%,transparent 100%)' }}>
        <div style={{ maxWidth:'var(--max-w)', margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:'rgba(59,130,246,.12)', border:'1px solid rgba(59,130,246,.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <MessageSquare size={18} color="#3B82F6"/>
            </div>
            <div>
              <h1 style={{ fontFamily:'var(--f-display)', fontSize:22, fontWeight:700, color:'var(--t1)', margin:0 }}>
                메시지
                {totalUnread > 0 && (
                  <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', marginLeft:8, minWidth:20, height:20, borderRadius:10, background:'#3B82F6', color:'#fff', fontSize:11, fontFamily:'var(--f-mono)', fontWeight:700 }}>{totalUnread}</span>
                )}
              </h1>
              <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>1:1 실시간 메시지</div>
            </div>
          </div>
          <button onClick={()=>setShowNew(true)}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 16px', background:'linear-gradient(135deg,#3B82F6,#1D4ED8)', border:'none', borderRadius:9, color:'#fff', fontSize:13, fontFamily:'var(--f-sans)', fontWeight:600, cursor:'pointer', boxShadow:'0 4px 14px rgba(59,130,246,.3)' }}>
            <Plus size={14}/> 새 대화
          </button>
        </div>
      </div>

      <div style={{ maxWidth:'var(--max-w)', margin:'0 auto', padding:'20px var(--pad-x)' }}>
        <div style={{ display:'flex', height:'calc(100vh - 280px)', minHeight:500, maxHeight:720, background:'var(--bg1)', border:'1px solid var(--b1)', borderRadius:14, overflow:'hidden' }}>

          {/* ── 대화 목록 사이드바 ── */}
          <div style={{
            width: activeConv ? 0 : '100%',
            maxWidth: 320, minWidth: activeConv ? 0 : 280,
            borderRight: '1px solid var(--b1)',
            display: 'flex', flexDirection:'column',
            overflow: 'hidden', flexShrink:0,
            transition: 'all 0.25s ease',
          }}>
            {/* 검색 */}
            <div style={{ padding:'14px 14px 10px', borderBottom:'1px solid var(--b1)' }}>
              <div style={{ position:'relative' }}>
                <Search size={12} color="var(--t4)" style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)' }}/>
                <input
                  value={convSearch} onChange={e=>setConvSearch(e.target.value)}
                  placeholder="대화 검색..."
                  style={{ width:'100%', padding:'8px 10px 8px 28px', background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t1)', fontSize:12, fontFamily:'var(--f-sans)', outline:'none', boxSizing:'border-box' }}
                />
              </div>
            </div>

            {/* 대화 목록 */}
            <div style={{ flex:1, overflowY:'auto' }}>
              {convsLoading ? (
                Array(4).fill(0).map((_,i) => (
                  <div key={i} style={{ padding:'13px 14px', borderBottom:'1px solid var(--b0)', display:'flex', gap:10 }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--bg4)', flexShrink:0, animation:'pulse 1.5s infinite' }}/>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6, justifyContent:'center' }}>
                      <div style={{ width:'60%', height:13, borderRadius:4, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
                      <div style={{ width:'80%', height:11, borderRadius:4, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
                    </div>
                  </div>
                ))
              ) : filteredConvs.length === 0 ? (
                <div style={{ padding:32, textAlign:'center', color:'var(--t3)', fontSize:13 }}>
                  {convs.length === 0 ? (
                    <>
                      <MessageSquare size={32} style={{ margin:'0 auto 12px', opacity:.25 }}/>
                      <div>대화가 없습니다</div>
                      <div style={{ fontSize:11, marginTop:6, color:'var(--t4)' }}>새 대화 버튼을 눌러 시작하세요</div>
                    </>
                  ) : '검색 결과가 없습니다'}
                </div>
              ) : filteredConvs.map(conv => {
                const other = getOtherProfile(conv)
                const unread = unreadCounts[conv.id] || 0
                const isActive = activeConv?.id === conv.id
                return (
                  <div key={conv.id} onClick={()=>selectConv(conv)}
                    style={{
                      padding:'13px 14px', borderBottom:'1px solid var(--b0)',
                      cursor:'pointer', transition:'background .1s',
                      background: isActive ? 'var(--blue-dim)' : 'transparent',
                      display:'flex', gap:11, alignItems:'center',
                    }}
                    onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background='var(--bg3)' }}
                    onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background='transparent' }}>
                    <div style={{ position:'relative', flexShrink:0 }}>
                      <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--bg4)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', border:'1px solid var(--b1)' }}>
                        {other?.avatar_url
                          ? <img src={other.avatar_url} style={{ width:40, height:40, objectFit:'cover' }} alt=""/>
                          : <User size={18} color="var(--t4)"/>}
                      </div>
                      {unread > 0 && (
                        <div style={{ position:'absolute', top:-2, right:-2, minWidth:17, height:17, borderRadius:9, background:'#3B82F6', color:'#fff', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--f-mono)', fontWeight:700, border:'2px solid var(--bg1)' }}>
                          {unread > 9 ? '9+' : unread}
                        </div>
                      )}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6, marginBottom:2 }}>
                        <div style={{ fontSize:13, fontWeight: unread > 0 ? 700 : 600, color:'var(--t1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {other?.display_name || other?.username || '알 수 없음'}
                        </div>
                        {conv.last_msg_at && (
                          <div style={{ fontSize:10, color:'var(--t4)', fontFamily:'var(--f-mono)', flexShrink:0 }}>
                            {format(new Date(conv.last_msg_at), 'M/d', { locale:ko })}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:'var(--t3)', fontFamily:'var(--f-mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {other?.school || '@' + (other?.username || '')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── 메시지 뷰 ── */}
          {activeConv ? (
            <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
              {/* 채팅 헤더 */}
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--b1)', display:'flex', alignItems:'center', gap:12, background:'var(--bg2)', flexShrink:0 }}>
                <button onClick={()=>{ setActive(null); setOtherUser(null); setMessages([]); setIsTyping(false) }}
                  style={{ background:'none', border:'1px solid var(--b1)', color:'var(--t2)', width:30, height:30, borderRadius:7, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <ArrowLeft size={14}/>
                </button>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--bg4)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', border:'1px solid var(--b1)', flexShrink:0 }}>
                  {otherUser?.avatar_url
                    ? <img src={otherUser.avatar_url} style={{ width:36, height:36, objectFit:'cover' }} alt=""/>
                    : <User size={16} color="var(--t4)"/>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--t1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {otherUser?.display_name || otherUser?.username || '알 수 없음'}
                  </div>
                  {/* 타이핑 인디케이터 — 헤더 서브텍스트 */}
                  {isTyping ? (
                    <div style={{ fontSize:11, color:'#3B82F6', fontFamily:'var(--f-mono)', display:'flex', alignItems:'center', gap:4 }}>
                      <span style={{ display:'inline-flex', gap:2 }}>
                        <span style={{ width:4, height:4, borderRadius:'50%', background:'#3B82F6', display:'inline-block', animation:'typingBounce 1.2s ease-in-out infinite' }}/>
                        <span style={{ width:4, height:4, borderRadius:'50%', background:'#3B82F6', display:'inline-block', animation:'typingBounce 1.2s ease-in-out 0.2s infinite' }}/>
                        <span style={{ width:4, height:4, borderRadius:'50%', background:'#3B82F6', display:'inline-block', animation:'typingBounce 1.2s ease-in-out 0.4s infinite' }}/>
                      </span>
                      입력 중...
                    </div>
                  ) : (
                    otherUser?.school && (
                      <div style={{ fontSize:11, color:'var(--t3)', fontFamily:'var(--f-mono)' }}>{otherUser.school}</div>
                    )
                  )}
                </div>
                <div style={{ fontSize:9, padding:'3px 8px', borderRadius:4, background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.2)', color:'#22C55E', fontFamily:'var(--f-mono)', flexShrink:0 }}>● LIVE</div>
              </div>

              {/* 메시지 목록 */}
              <div style={{ flex:1, overflowY:'auto', padding:'16px 18px', display:'flex', flexDirection:'column', gap:6, background:'var(--bg1)' }}>
                {loading ? (
                  <div style={{ textAlign:'center', color:'var(--t3)', paddingTop:40, fontSize:13 }}>
                    <Loader2 size={20} style={{ animation:'spin 1s linear infinite', margin:'0 auto 8px', display:'block' }}/>
                    불러오는 중...
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign:'center', color:'var(--t4)', paddingTop:60, fontSize:13 }}>
                    <MessageSquare size={32} style={{ margin:'0 auto 12px', opacity:.2 }}/>
                    <div>아직 메시지가 없습니다</div>
                    <div style={{ fontSize:11, marginTop:6 }}>첫 메시지를 보내보세요!</div>
                  </div>
                ) : messages.map((m, idx) => {
                  const isMe = m.sender_id === user?.id
                  const isSending = !!m._sending
                  const isError   = !!m._error
                  const showDate = idx === 0 || (
                    new Date(m.created_at).toDateString() !== new Date(messages[idx-1].created_at).toDateString()
                  )
                  return (
                    <div key={m.id}>
                      {showDate && (
                        <div style={{ textAlign:'center', margin:'10px 0', fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}>
                          {format(new Date(m.created_at), 'M월 d일 (E)', { locale:ko })}
                        </div>
                      )}
                      <div style={{ display:'flex', flexDirection:isMe?'row-reverse':'row', gap:8, alignItems:'flex-end' }}>
                        {!isMe && (
                          <div style={{ width:26, height:26, borderRadius:'50%', background:'var(--blue-dim)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                            {otherUser?.avatar_url
                              ? <img src={otherUser.avatar_url} style={{ width:26, height:26, objectFit:'cover' }} alt=""/>
                              : <User size={12} color="var(--blue)"/>}
                          </div>
                        )}
                        <div style={{ maxWidth:'72%' }}>
                          <div style={{
                            padding:'10px 14px',
                            borderRadius: isMe ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                            background: isError ? 'rgba(244,63,94,.6)'
                              : isSending ? 'rgba(59,130,246,.5)'
                              : isMe ? '#3B82F6' : 'var(--bg3)',
                            border: isMe ? 'none' : '1px solid var(--b1)',
                            color: isMe ? '#fff' : 'var(--t1)',
                            fontSize: 13.5, lineHeight: 1.6,
                            wordBreak: 'break-word',
                            opacity: isSending ? 0.8 : 1,
                            transition: 'all .2s',
                          }}>
                            {m.content}
                          </div>
                          {/* 시간 + 읽음 수신 */}
                          <div style={{ fontSize:10, color:'var(--t4)', fontFamily:'var(--f-mono)', marginTop:3, display:'flex', alignItems:'center', gap:4, justifyContent:isMe?'flex-end':'flex-start' }}>
                            {isError && <span style={{ color:'#F43F5E', fontSize:9 }}>전송 실패</span>}
                            {!isError && format(new Date(m.created_at), 'HH:mm', { locale:ko })}
                            {isMe && !isError && (
                              <ReadReceipt isRead={m.is_read} isSending={isSending}/>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* 타이핑 인디케이터 — 메시지 목록 하단 */}
                {isTyping && <TypingDots/>}

                <div ref={msgEndRef}/>
              </div>

              {/* 입력창 */}
              <div style={{ padding:'12px 16px', borderTop:'1px solid var(--b1)', display:'flex', gap:9, background:'var(--bg2)', flexShrink:0 }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),sendMessage())}
                  onBlur={()=>broadcastTyping(false)}
                  placeholder="메시지를 입력하세요... (Enter 전송)"
                  style={{ flex:1, padding:'11px 14px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:10, color:'var(--t1)', fontSize:13.5, fontFamily:'var(--f-sans)', outline:'none', transition:'border-color .15s' }}
                  onFocus={e=>e.target.style.borderColor='rgba(59,130,246,.4)'}
                />
                <button
                  onClick={sendMessage} disabled={!input.trim()}
                  style={{ padding:'0 16px', background:input.trim()?'linear-gradient(135deg,#3B82F6,#1D4ED8)':'var(--bg4)', border:'none', borderRadius:10, cursor:input.trim()?'pointer':'not-allowed', display:'flex', alignItems:'center', transition:'all .15s', boxShadow:input.trim()?'0 3px 12px rgba(59,130,246,.3)':'none' }}>
                  <Send size={15} color={input.trim()?'#fff':'var(--t4)'}/>
                </button>
              </div>
            </div>
          ) : (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--t3)', flexDirection:'column', gap:14 }}>
              <div style={{ width:64, height:64, borderRadius:16, background:'rgba(59,130,246,.07)', border:'1px solid rgba(59,130,246,.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <MessageSquare size={28} color="rgba(59,130,246,.4)"/>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:15, fontWeight:600, color:'var(--t2)', marginBottom:6 }}>대화를 선택하세요</div>
                <div style={{ fontSize:13, color:'var(--t4)' }}>왼쪽에서 대화를 선택하거나 새 대화를 시작하세요</div>
              </div>
              <button onClick={()=>setShowNew(true)}
                style={{ padding:'10px 20px', background:'rgba(59,130,246,.12)', border:'1px solid rgba(59,130,246,.25)', borderRadius:9, color:'#3B82F6', fontSize:13, fontFamily:'var(--f-sans)', fontWeight:600, cursor:'pointer' }}>
                <Plus size={13} style={{ marginRight:6, verticalAlign:'middle' }}/>새 대화 시작
              </button>
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <NewConvModal
          user={user}
          onClose={()=>setShowNew(false)}
          onCreated={async convId => {
            await loadConvs()
            const { data } = await supabase
              .from('messages_conversations')
              .select(`
                *,
                profile_a:profiles!messages_conversations_participant_a_fkey(id,username,display_name,avatar_url,school),
                profile_b:profiles!messages_conversations_participant_b_fkey(id,username,display_name,avatar_url,school)
              `)
              .eq('id', convId)
              .single()
            if (data) selectConv(data)
          }}
        />
      )}

      <style>{`
        @keyframes spin        { to { transform:rotate(360deg) } }
        @keyframes pulse       { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes typingBounce {
          0%,60%,100% { transform:translateY(0); opacity:.4 }
          30%          { transform:translateY(-5px); opacity:1 }
        }
      `}</style>
    </div>
  )
}
