import { generateSlug } from '../utils/slug'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useAuthStore } from '../store'
import { supabase } from '../lib/supabase'
import {
  BarChart2, FileText, Users, Newspaper, RefreshCw, Loader, Zap,
  Bell, Calendar, AlertTriangle, Edit2, Trash2, Shield, Flag,
  CheckCircle, XCircle, Eye, Settings, ChevronDown, ChevronUp,
  Search, UserX, UserCheck, MessageSquare, TrendingUp, Database,
  Lock, Unlock, AlertOctagon, MoreVertical, Activity, Bot,
  Play, Pause, Terminal, Radio, Star, Award, Briefcase,
  Hash, Clock, ToggleLeft, ToggleRight, Send, PieChart,
  Globe, Heart, Layers, Cpu, Wifi, WifiOff, ChevronRight,
  Download, Upload, Filter, RotateCcw, Target, Inbox,
  MessageCircle, ShieldCheck, ShieldOff, Inbox as InboxIcon
} from 'lucide-react'

// ── 탭 정의 ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard',  label: '대시보드',    icon: BarChart2 },
  { id: 'articles',   label: '아티클 관리', icon: FileText  },
  { id: 'users',      label: '유저 관리',   icon: Users     },
  { id: 'reports',    label: '신고 처리',   icon: Flag      },
  { id: 'community',  label: '커뮤니티',    icon: MessageSquare },
  { id: 'staffchat',  label: '직원 채팅',   icon: MessageCircle },
  { id: 'feedback',   label: '피드백 관리', icon: Inbox     },
  { id: 'security',   label: '보안 관리',   icon: ShieldCheck },
  { id: 'teams',      label: 'AI 팀',       icon: Bot       },
  { id: 'workers',    label: '워커 제어',   icon: Activity  },
  { id: 'ops',        label: '자동 운영',   icon: Zap       },
  { id: 'cron',       label: '시스템',      icon: Settings  },
  { id: 'devperms',   label: '개발팀 권한', icon: Lock      },
  { id: 'patchnotes', label: '패치노트',    icon: FileText  },
]

// ── 채팅방 상수 ──────────────────────────────────────────────────────
const CHAT_ROOMS = [
  { id: 'general',  label: '전체 채팅',  emoji: '💬', color: '#60A5FA' },
  { id: 'ops',      label: '업무 지시',  emoji: '📋', color: '#F59E0B' },
  { id: 'feedback', label: '피드백',     emoji: '📥', color: '#34D399' },
  { id: 'strategy', label: '전략 회의',  emoji: '🎯', color: '#F472B6' },
]

const AI_STAFF_COLORS = {
  ai_aria:'#818CF8', ai_nova:'#C084FC', ai_lumi:'#34D399',
  ai_pulse:'#38BDF8', ai_trend:'#FB923C', ai_sage:'#10B981',
  ai_echo:'#F472B6', ai_learn:'#A78BFA', ai_hana:'#FBBF24', ai_max:'#F87171',
}
function staffColor(username) {
  if (!username) return '#60A5FA'
  if (AI_STAFF_COLORS[username]) return AI_STAFF_COLORS[username]
  if (username.startsWith('ai_ops')) return '#9AA5FF'
  if (username.startsWith('ai_cnt')) return '#C084FC'
  if (username.startsWith('ai_mnt')) return '#34D399'
  if (username.startsWith('ai_nws')) return '#38BDF8'
  if (username.startsWith('ai_anl')) return '#FB923C'
  if (username.startsWith('ai_rpt')) return '#10B981'
  if (username.startsWith('ai_nwl')) return '#F472B6'
  if (username.startsWith('ai_tch')) return '#A78BFA'
  if (username.startsWith('ai_cmm')) return '#FBBF24'
  if (username.startsWith('ai_mgt')) return '#F87171'
  return '#60A5FA'
}
function fmtTime(ts) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

// ── 공통 컴포넌트 ─────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color = '#F59E0B', sub, onClick }) {
  return (
    <div onClick={onClick}
      style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10, padding:20,
        display:'flex', alignItems:'center', gap:16, cursor: onClick ? 'pointer' : 'default',
        transition:'border-color .2s', ':hover': onClick ? { borderColor: color } : {} }}>
      <div style={{ width:42, height:42, background:`${color}15`, border:`1px solid ${color}25`,
        borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Icon size={18} color={color}/>
      </div>
      <div>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:22, fontWeight:700, color:'var(--t1)' }}>{value ?? '—'}</div>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)', letterSpacing:'1px' }}>{label}</div>
        {sub && <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color, marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  )
}

function Badge({ children, color = '#60A5FA' }) {
  return (
    <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color, background:`${color}15`,
      border:`1px solid ${color}30`, padding:'2px 7px', borderRadius:4 }}>
      {children}
    </span>
  )
}

function Msg({ msg }) {
  if (!msg) return null
  const ok = msg.startsWith('✅')
  return <div style={{ fontFamily:'var(--f-mono)', fontSize:12,
    color: ok ? '#22C55E' : '#F43F5E', marginTop:8 }}>{msg}</div>
}

function SectionHeader({ icon: Icon, label, color = '#60A5FA', children }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
      {Icon && <Icon size={13} color={color}/>}
      <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color, letterSpacing:'2px' }}>{label}</span>
      {children && <div style={{ marginLeft:'auto' }}>{children}</div>}
    </div>
  )
}

function Panel({ children, style }) {
  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10,
      padding:20, ...style }}>
      {children}
    </div>
  )
}

// ── AI 작성 보조 ──────────────────────────────────────────────────────
function AIAssistant({ context, onInsert }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [prompt, setPrompt] = useState('')

  const analyze = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`/api/admin-ai?prompt=${encodeURIComponent(prompt)}&context=${encodeURIComponent(context || '')}`, {
        headers: { Authorization: 'Bearer ' + (session?.access_token || '') }
      })
      const d = await r.json()
      setResult(d.result || '결과 없음')
    } catch { setResult('AI 분석 실패.') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:10, padding:20, marginBottom:20 }}>
      <SectionHeader icon={Zap} label="AI 작성 보조" color="#F59E0B"/>
      <div style={{ display:'flex', gap:8, marginBottom:8 }}>
        <input value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&analyze()}
          placeholder="분석 요청 입력…" className="input" style={{ flex:1, fontSize:13 }}/>
        <button onClick={analyze} disabled={loading} className="btn btn-primary btn-sm" style={{ whiteSpace:'nowrap', gap:5 }}>
          {loading ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> : <Zap size={12}/>} 분석
        </button>
      </div>
      {result && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8,
          padding:14, fontSize:13, lineHeight:1.8, color:'var(--t1)', maxHeight:200, overflowY:'auto', whiteSpace:'pre-wrap' }}>
          {result}
          <button onClick={()=>onInsert?.(result)} className="btn btn-ghost btn-sm" style={{ marginTop:8, display:'block' }}>
            본문에 삽입
          </button>
        </div>
      )}
    </div>
  )
}

// ── 아티클 작성 패널 ──────────────────────────────────────────────────
function WritePanel({ onClose, editItem }) {
  const { profile } = useAuthStore()
  const isEdit = !!editItem
  const [form, setForm] = useState({
    title: editItem?.title || '',
    body: editItem?.body || editItem?.ai_summary || '',
    category: editItem?.category || 'insight',
    excerpt: editItem?.excerpt || '',
    status: editItem?.status || 'draft',
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async (status = form.status) => {
    if (!form.title.trim() || !form.body.trim()) { setMsg('제목과 본문을 입력하세요'); return }
    setSaving(true)
    try {
      if (isEdit) {
        const { error } = await supabase.from('articles').update({
          title: form.title.trim(), body: form.body.trim(),
          excerpt: (form.excerpt || form.body.slice(0, 200)).trim(),
          category: form.category, status,
          published_at: status === 'published' ? (editItem.published_at || new Date().toISOString()) : null,
        }).eq('id', editItem.id)
        if (error) throw error
        setMsg('✅ 수정 완료!')
        setTimeout(onClose, 1000)
      } else {
        const slug = generateSlug(form.title, 'article')
        const { error } = await supabase.from('articles').insert({
          title: form.title.trim(), slug, body: form.body.trim(),
          excerpt: (form.excerpt || form.body.slice(0, 200)).trim(),
          category: form.category, author_id: profile?.id, status,
          published_at: status === 'published' ? new Date().toISOString() : null,
        })
        if (error) throw error
        setMsg(status === 'published' ? '✅ 발행 완료!' : '✅ 임시저장 완료')
        if (status === 'published') setTimeout(onClose, 1200)
      }
    } catch (e) { setMsg('❌ ' + e.message?.slice(0, 80)) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'var(--bg0)', zIndex:1000, overflow:'auto', padding:'24px var(--pad-x)' }}>
      <div style={{ maxWidth:900, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#60A5FA', letterSpacing:'2px', marginBottom:4 }}>
              {isEdit ? 'EDIT ARTICLE' : 'NEW ARTICLE'}
            </div>
            <h2 style={{ fontFamily:'var(--f-display)', fontSize:20, fontWeight:700, color:'var(--t1)' }}>
              {isEdit ? '아티클 수정' : '아티클 작성'}
            </h2>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => save('draft')} disabled={saving} className="btn btn-ghost btn-sm">임시저장</button>
            <button onClick={() => save('published')} disabled={saving} className="btn btn-primary btn-sm">발행</button>
            <button onClick={onClose} className="btn btn-ghost btn-sm">닫기</button>
          </div>
        </div>
        <AIAssistant context={form.title} onInsert={text => setForm(f => ({ ...f, body: f.body + '\n\n' + text }))}/>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
            placeholder="제목" className="input"
            style={{ fontFamily:'var(--f-display)', fontSize:18, fontWeight:700, padding:'14px 16px' }}/>
          <div style={{ display:'flex', gap:10 }}>
            <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="input" style={{ flex:1 }}>
              <option value="insight">INSIGHT</option>
              <option value="story">FOUNDER STORY</option>
              <option value="trend">TREND</option>
              <option value="opinion">OPINION</option>
              <option value="news">NEWS</option>
              <option value="magazine">MAGAZINE</option>
            </select>
            <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="input" style={{ flex:1 }}>
              <option value="draft">임시저장</option>
              <option value="published">발행됨</option>
            </select>
          </div>
          <textarea value={form.excerpt} onChange={e=>setForm(f=>({...f,excerpt:e.target.value}))}
            placeholder="요약 (미입력 시 본문 앞 200자)" rows={2} className="input" style={{ resize:'vertical' }}/>
          <textarea value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))}
            placeholder="본문 (마크다운 지원)" rows={24}
            className="input" style={{ fontSize:15, lineHeight:1.9, resize:'vertical' }}/>
        </div>
        <Msg msg={msg}/>
      </div>
    </div>
  )
}

// ── 아티클 관리 탭 ────────────────────────────────────────────────────
function ArticlesTab() {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editItem, setEditItem] = useState(null)
  const [page, setPage] = useState(0)
  const PER = 20

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('articles')
      .select('id,title,category,status,published_at,view_count,source_name,ai_summary', { count:'exact' })
      .order('published_at', { ascending: false }).range(page * PER, page * PER + PER - 1)
    if (filter === 'published') q = q.eq('status','published')
    else if (filter === 'draft') q = q.eq('status','draft')
    else if (filter === 'news') q = q.not('source_name','is',null)
    else if (filter === 'article') q = q.is('source_name',null)
    if (search.trim()) q = q.ilike('title', `%${search.trim()}%`)
    const { data, error } = await q
    if (!error) setArticles(data || [])
    setLoading(false)
  }, [filter, search, page])

  useEffect(() => { load() }, [load])

  const deleteArticle = async (id) => {
    if (!window.confirm('아티클을 삭제하시겠습니까?')) return
    await supabase.from('articles').delete().eq('id', id)
    load()
  }
  const toggleStatus = async (item) => {
    const next = item.status === 'published' ? 'draft' : 'published'
    await supabase.from('articles').update({
      status: next,
      published_at: next === 'published' ? new Date().toISOString() : null
    }).eq('id', item.id)
    load()
  }

  return (
    <div>
      {editItem && <WritePanel onClose={() => { setEditItem(null); load() }} editItem={editItem}/>}
      <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--t4)' }}/>
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}
            placeholder="제목 검색…" className="input" style={{ paddingLeft:32, fontSize:13 }}/>
        </div>
        {['all','published','draft','news','article'].map(f=>(
          <button key={f} onClick={()=>{setFilter(f);setPage(0)}}
            className={`btn btn-sm ${filter===f?'btn-primary':'btn-ghost'}`} style={{ fontSize:11 }}>
            {f==='all'?'전체':f==='published'?'발행됨':f==='draft'?'임시저장':f==='news'?'뉴스':'아티클'}
          </button>
        ))}
        <button onClick={() => setEditItem({})} className="btn btn-primary btn-sm" style={{ gap:5 }}>
          <FileText size={12}/> 새 아티클
        </button>
      </div>
      <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--b1)', background:'var(--bg3)' }}>
              {['제목','카테고리','상태','발행일','조회','액션'].map(h=>(
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)', letterSpacing:'1px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding:32, textAlign:'center', color:'var(--t4)' }}>
                <Loader size={16} style={{ animation:'spin 1s linear infinite' }}/></td></tr>
            ) : articles.length === 0 ? (
              <tr><td colSpan={6} style={{ padding:32, textAlign:'center', color:'var(--t4)', fontSize:13 }}>결과 없음</td></tr>
            ) : articles.map(a => (
              <tr key={a.id} style={{ borderBottom:'1px solid var(--b1)' }}>
                <td style={{ padding:'10px 14px', maxWidth:300 }}>
                  <div style={{ fontSize:13, color:'var(--t1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.title}</div>
                  {a.source_name && <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)', marginTop:2 }}>{a.source_name}</div>}
                </td>
                <td style={{ padding:'10px 14px' }}><Badge color="#3B82F6">{a.category||'—'}</Badge></td>
                <td style={{ padding:'10px 14px' }}>
                  <Badge color={a.status==='published'?'#22C55E':'#F59E0B'}>
                    {a.status==='published'?'발행':'임시저장'}
                  </Badge>
                </td>
                <td style={{ padding:'10px 14px', fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)' }}>
                  {a.published_at ? new Date(a.published_at).toLocaleDateString('ko-KR') : '—'}
                </td>
                <td style={{ padding:'10px 14px', fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)' }}>
                  {a.view_count || 0}
                </td>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => setEditItem(a)} title="수정"
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#60A5FA', padding:4 }}>
                      <Edit2 size={13}/>
                    </button>
                    <button onClick={() => toggleStatus(a)} title={a.status==='published'?'내리기':'발행'}
                      style={{ background:'none', border:'none', cursor:'pointer', color: a.status==='published'?'#F59E0B':'#22C55E', padding:4 }}>
                      {a.status==='published' ? <EyeOff size={13}/> : <Eye size={13}/>}
                    </button>
                    <button onClick={() => deleteArticle(a.id)} title="삭제"
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#F43F5E', padding:4 }}>
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display:'flex', gap:8, marginTop:14, justifyContent:'center' }}>
        <button onClick={() => setPage(p=>Math.max(0,p-1))} disabled={page===0} className="btn btn-ghost btn-sm">← 이전</button>
        <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)', alignSelf:'center' }}>페이지 {page+1}</span>
        <button onClick={() => setPage(p=>p+1)} disabled={articles.length < PER} className="btn btn-ghost btn-sm">다음 →</button>
      </div>
    </div>
  )
}

// ── 유저 관리 탭 ──────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [actionMsg, setActionMsg] = useState({})
  const [page, setPage] = useState(0)
  const PER = 30

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('profiles')
      .select('id,display_name,username,role,is_banned,created_at,bio,school,startup_name,is_verified,avatar_url')
      .order('created_at', { ascending:false })
      .range(page * PER, page * PER + PER - 1)
    if (search.trim()) q = q.or(`display_name.ilike.%${search}%,username.ilike.%${search}%`)
    if (roleFilter !== 'all') q = q.eq('role', roleFilter)
    const { data } = await q
    setUsers(data || [])
    setLoading(false)
  }, [search, roleFilter, page])

  useEffect(() => { load() }, [load])

  const setMsg = (id, msg) => setActionMsg(p => ({ ...p, [id]: msg }))

  const callAdminAction = async (action, id, data) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ action, id, data }),
    })
    return res.json()
  }

  const banUser = async (user) => {
    const ban = !user.is_banned
    if (!window.confirm(`${user.display_name || user.username}을(를) ${ban ? '정지' : '정지 해제'}하시겠습니까?`)) return
    setMsg(user.id, '처리 중…')
    const d = await callAdminAction('ban_user', user.id, { banned: ban })
    setMsg(user.id, d.ok ? (ban ? '✅ 정지됨' : '✅ 해제됨') : `❌ ${d.error?.slice(0,40)}`)
    setTimeout(load, 400)
  }

  const changeRole = async (user, role) => {
    setMsg(user.id, '처리 중…')
    const d = await callAdminAction('change_role', user.id, { role })
    setMsg(user.id, d.ok ? `✅ ${role}로 변경됨` : `❌ ${d.error?.slice(0,40)}`)
    setTimeout(load, 400)
  }

  // AI 계정 필터링
  const isAIAccount = (u) => u.username?.startsWith('ai_') || false
  const aiCount = users.filter(isAIAccount).length

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--t4)' }}/>
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}
            placeholder="이름/아이디 검색…" className="input" style={{ paddingLeft:32, fontSize:13 }}/>
        </div>
        {['all','admin','writer','reader'].map(r=>(
          <button key={r} onClick={()=>{setRoleFilter(r);setPage(0)}}
            className={`btn btn-sm ${roleFilter===r?'btn-primary':'btn-ghost'}`} style={{ fontSize:11 }}>
            {r==='all'?'전체':r}
          </button>
        ))}
        {aiCount > 0 && <Badge color="#818CF8">AI 계정 {aiCount}개</Badge>}
      </div>

      <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--b1)', background:'var(--bg3)' }}>
              {['이름','아이디','역할','상태','가입일','액션'].map(h=>(
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)', letterSpacing:'1px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding:32, textAlign:'center' }}>
                <Loader size={16} style={{ animation:'spin 1s linear infinite' }}/></td></tr>
            ) : users.map(u => (
              <tr key={u.id} style={{ borderBottom:'1px solid var(--b1)',
                background: isAIAccount(u) ? 'rgba(129,140,248,0.03)' : 'transparent' }}>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {u.avatar_url
                      ? <img src={u.avatar_url} style={{ width:24, height:24, borderRadius:'50%', flexShrink:0 }} alt=""/>
                      : <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--bg3)', flexShrink:0 }}/>}
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--t1)', display:'flex', alignItems:'center', gap:5 }}>
                        {u.display_name || '(이름없음)'}
                        {u.is_verified && <span style={{ color:'#60A5FA', fontSize:10 }}>✓</span>}
                        {isAIAccount(u) && <Badge color="#818CF8">AI</Badge>}
                      </div>
                      {u.startup_name && <div style={{ fontSize:11, color:'var(--t4)' }}>{u.startup_name}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ padding:'10px 14px', fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)' }}>{u.username || '—'}</td>
                <td style={{ padding:'10px 14px' }}>
                  <select value={u.role||'reader'} onChange={e=>changeRole(u,e.target.value)}
                    style={{ background:'var(--bg3)', border:'1px solid var(--b1)', color:'var(--t1)',
                      padding:'3px 6px', fontSize:11, fontFamily:'var(--f-mono)', borderRadius:4 }}>
                    <option value="reader">reader</option>
                    <option value="writer">writer</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td style={{ padding:'10px 14px' }}>
                  {u.is_banned ? <Badge color="#F43F5E">정지됨</Badge> : <Badge color="#22C55E">활성</Badge>}
                </td>
                <td style={{ padding:'10px 14px', fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)' }}>
                  {new Date(u.created_at).toLocaleDateString('ko-KR')}
                </td>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    {!isAIAccount(u) && (
                      <button onClick={()=>banUser(u)} title={u.is_banned?'정지 해제':'정지'}
                        style={{ background:'none', border:'none', cursor:'pointer', color: u.is_banned?'#22C55E':'#F43F5E', padding:4 }}>
                        {u.is_banned ? <UserCheck size={14}/> : <UserX size={14}/>}
                      </button>
                    )}
                    {actionMsg[u.id] && (
                      <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color: actionMsg[u.id].startsWith('✅')?'#22C55E':'#F43F5E' }}>
                        {actionMsg[u.id]}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display:'flex', gap:8, marginTop:14, justifyContent:'center' }}>
        <button onClick={() => setPage(p=>Math.max(0,p-1))} disabled={page===0} className="btn btn-ghost btn-sm">← 이전</button>
        <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)', alignSelf:'center' }}>페이지 {page+1}</span>
        <button onClick={() => setPage(p=>p+1)} disabled={users.length < PER} className="btn btn-ghost btn-sm">다음 →</button>
      </div>
    </div>
  )
}

// ── 신고 처리 탭 ──────────────────────────────────────────────────────
function ReportsTab() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [actionMsg, setActionMsg] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('reports')
      .select('id,target_type,target_id,reason,status,created_at,reporter_id,profiles!reporter_id(display_name,username)')
      .order('created_at', { ascending:false }).limit(50)
    if (filter !== 'all') q = q.eq('status', filter)
    const { data } = await q
    setReports(data || [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const setMsg = (id, msg) => setActionMsg(p => ({ ...p, [id]: msg }))

  const handleReport = async (report, action) => {
    setMsg(report.id, '처리 중…')
    try {
      // service_role 경유 (RLS 우회) — admin-action API 호출
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          action: 'handle_report',
          id: report.id,
          data: {
            action,
            target_type: report.target_type,
            target_id:   report.target_id,
          },
        }),
      })
      const d = await res.json()
      if (d.ok) {
        setMsg(report.id, action === 'dismissed' ? '✅ 기각됨' : action === 'delete_content' ? '✅ 콘텐츠 삭제 & 처리됨' : '✅ 처리됨')
      } else {
        setMsg(report.id, `❌ ${d.error?.slice(0,60) || '처리 실패'}`)
      }
    } catch(e) {
      setMsg(report.id, `❌ ${e.message?.slice(0,50)}`)
    }
    setTimeout(load, 800)
  }

  const STATUS_COLOR = { pending:'#F59E0B', resolved:'#22C55E', dismissed:'var(--t4)' }
  const STATUS_LABEL = { pending:'대기중', resolved:'처리됨', dismissed:'기각됨' }

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:18, alignItems:'center' }}>
        <Flag size={14} color="#F43F5E"/>
        <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)', letterSpacing:'2px' }}>REPORTS</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          {['all','pending','resolved','dismissed'].map(s=>(
            <button key={s} onClick={()=>setFilter(s)}
              className={`btn btn-sm ${filter===s?'btn-primary':'btn-ghost'}`} style={{ fontSize:11 }}>
              {s==='all'?'전체':STATUS_LABEL[s]||s}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:40 }}><Loader size={20} style={{ animation:'spin 1s linear infinite' }}/></div>
      ) : reports.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--t4)', fontSize:13 }}>
          {filter === 'pending' ? '처리 대기 중인 신고가 없습니다 ✅' : '신고 내역이 없습니다'}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {reports.map(r => (
            <div key={r.id} style={{ background:'var(--bg2)', border:`1px solid ${r.status==='pending'?'rgba(244,63,94,0.25)':'var(--b1)'}`, borderRadius:10, padding:18 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8, flexWrap:'wrap' }}>
                    <Badge color={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]||r.status}</Badge>
                    <Badge color="#60A5FA">{r.target_type === 'post' ? '게시글' : '댓글'}</Badge>
                    <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}>
                      신고자: {r.profiles?.display_name || r.profiles?.username || '알 수 없음'}
                    </span>
                    <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)', marginLeft:'auto' }}>
                      {new Date(r.created_at).toLocaleDateString('ko-KR')} {new Date(r.created_at).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}
                    </span>
                  </div>
                  <div style={{ fontSize:14, color:'var(--t1)', lineHeight:1.6, background:'var(--bg3)', borderRadius:6, padding:'10px 14px' }}>
                    <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)', marginBottom:4, display:'block' }}>신고 사유</span>
                    {r.reason}
                  </div>
                  <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)', marginTop:6 }}>
                    대상 ID: {r.target_id?.slice(0,8)}…
                  </div>
                </div>
                {r.status === 'pending' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:6, minWidth:120 }}>
                    <button onClick={() => handleReport(r, 'delete_content')}
                      className="btn btn-sm" style={{ background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.3)', color:'#F43F5E', gap:5, fontSize:11 }}>
                      <Trash2 size={11}/> 콘텐츠 삭제
                    </button>
                    <button onClick={() => handleReport(r, 'resolved')}
                      className="btn btn-sm btn-ghost" style={{ gap:5, fontSize:11, color:'#22C55E', borderColor:'rgba(34,197,94,0.3)' }}>
                      <CheckCircle size={11}/> 처리 완료
                    </button>
                    <button onClick={() => handleReport(r, 'dismissed')}
                      className="btn btn-sm btn-ghost" style={{ gap:5, fontSize:11, color:'var(--t4)' }}>
                      <XCircle size={11}/> 기각
                    </button>
                  </div>
                )}
              </div>
              {actionMsg[r.id] && <Msg msg={actionMsg[r.id]}/>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 커뮤니티 관리 탭 ──────────────────────────────────────────────────
function CommunityTab() {
  const { profile } = useAuthStore()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [noticeForm, setNoticeForm] = useState({ title:'', body:'', maintenanceDate:'', type:'maintenance', timeRange:'' })
  const [noticeSaving, setNoticeSaving] = useState(false)
  const [noticeMsg, setNoticeMsg] = useState('')
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [quickPostForm, setQuickPostForm] = useState({ title:'', body:'', type:'notice' })
  const [quickPosting, setQuickPosting] = useState(false)
  const [quickMsg, setQuickMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('community_posts')
      .select('id,title,post_type,is_deleted,is_pinned,like_count,reply_count,view_count,created_at,author_id,profiles!author_id(display_name,username)')
      .order('created_at', { ascending:false }).limit(40)
    if (filter === 'notice') q = q.eq('post_type','notice')
    else if (filter === 'deleted') q = q.eq('is_deleted',true)
    else if (filter === 'pinned') q = q.eq('is_pinned',true)
    else q = q.eq('is_deleted',false)
    const { data } = await q
    setPosts(data || [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const toggleDelete = async (post) => {
    await supabase.from('community_posts').update({ is_deleted: !post.is_deleted }).eq('id', post.id)
    load()
  }
  const togglePin = async (post) => {
    await supabase.from('community_posts').update({ is_pinned: !post.is_pinned }).eq('id', post.id)
    load()
  }

  const postMaintenanceNotice = async () => {
    if (!noticeForm.title.trim() || !noticeForm.body.trim() || !noticeForm.maintenanceDate) {
      setNoticeMsg('❌ 제목, 내용, 점검 예정일을 모두 입력하세요.'); return
    }
    const maintenanceDate = new Date(noticeForm.maintenanceDate)
    const daysUntil = Math.ceil((maintenanceDate - new Date()) / 86400000)
    if (daysUntil < 7) { setNoticeMsg(`❌ 최소 7일 전에 게시해야 합니다. (현재 D-${daysUntil})`); return }
    setNoticeSaving(true); setNoticeMsg('')
    try {
      const TYPE_LABELS = { maintenance:'시스템 점검', qa:'QA 점검', update:'업데이트 배포', emergency:'긴급 점검' }
      const typeLabel = TYPE_LABELS[noticeForm.type]
      const dateStr = maintenanceDate.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' })
      const dayOfWeek = maintenanceDate.toLocaleDateString('ko-KR', { weekday:'long' })
      const timeStr = noticeForm.timeRange?.trim() ? `\n⏰ **점검 시간**: ${noticeForm.timeRange.trim()}` : ''
      const fullBody = `📅 **점검 예정일**: ${dateStr} (${dayOfWeek})${timeStr}\n🔧 **점검 유형**: ${typeLabel}\n\n${noticeForm.body.trim()}\n\n---\n*정기 월간 점검 D-${daysUntil}일 전 공지입니다.*`
      const { error } = await supabase.from('community_posts').insert({
        title: noticeForm.title.trim(), body: fullBody, content: fullBody,
        post_type:'notice', is_pinned:true, author_id: profile?.id,
        tags: ['점검공지','월간점검'],
      })
      if (error) throw error
      setNoticeMsg(`✅ 점검 공지가 게시되었습니다! (D-${daysUntil})`)
      setNoticeForm({ title:'', body:'', maintenanceDate:'', type:'maintenance', timeRange:'' })
      setTimeout(() => setNoticeOpen(false), 2000)
      load()
    } catch(e) { setNoticeMsg('❌ ' + (e.message?.slice(0,80)||'오류')) }
    finally { setNoticeSaving(false) }
  }

  const postQuickNotice = async () => {
    if (!quickPostForm.title.trim() || !quickPostForm.body.trim()) {
      setQuickMsg('❌ 제목과 내용을 입력하세요.'); return
    }
    setQuickPosting(true); setQuickMsg('')
    try {
      const { error } = await supabase.from('community_posts').insert({
        title: quickPostForm.title.trim(),
        body: quickPostForm.body.trim(),
        content: quickPostForm.body.trim(),
        post_type: quickPostForm.type,
        is_pinned: quickPostForm.type === 'notice',
        author_id: profile?.id,
        is_deleted: false,
        tags: ['관리자공지'],
      })
      if (error) throw error
      setQuickMsg('✅ 게시 완료!')
      setQuickPostForm({ title:'', body:'', type:'notice' })
      load()
    } catch(e) { setQuickMsg('❌ ' + (e.message?.slice(0,80)||'오류')) }
    finally { setQuickPosting(false) }
  }

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap', alignItems:'center' }}>
        {['all','notice','pinned','deleted'].map(f=>(
          <button key={f} onClick={()=>setFilter(f)}
            className={`btn btn-sm ${filter===f?'btn-primary':'btn-ghost'}`} style={{ fontSize:11 }}>
            {f==='all'?'전체':f==='notice'?'공지글':f==='pinned'?'고정글':'삭제됨'}
          </button>
        ))}
        <button onClick={()=>setNoticeOpen(p=>!p)} className="btn btn-ghost btn-sm"
          style={{ marginLeft:'auto', gap:5, color:'#F59E0B', borderColor:'rgba(245,158,11,0.3)' }}>
          <Bell size={12}/> 점검 공지
        </button>
      </div>

      {/* 빠른 공지 작성 */}
      <Panel style={{ marginBottom:16 }}>
        <SectionHeader icon={Send} label="빠른 공지 작성" color="#A855F7"/>
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, marginBottom:8 }}>
          <input value={quickPostForm.title} onChange={e=>setQuickPostForm(f=>({...f,title:e.target.value}))}
            placeholder="공지 제목 *" className="input" style={{ fontSize:13 }}/>
          <select value={quickPostForm.type} onChange={e=>setQuickPostForm(f=>({...f,type:e.target.value}))}
            className="input" style={{ fontSize:12, width:120 }}>
            <option value="notice">공지</option>
            <option value="discussion">토론</option>
            <option value="tips">팁</option>
            <option value="news">뉴스</option>
          </select>
        </div>
        <textarea value={quickPostForm.body} onChange={e=>setQuickPostForm(f=>({...f,body:e.target.value}))}
          placeholder="공지 내용 *" rows={3} className="input" style={{ fontSize:13, resize:'vertical', marginBottom:8 }}/>
        <button onClick={postQuickNotice} disabled={quickPosting} className="btn btn-primary btn-sm" style={{ gap:5 }}>
          {quickPosting ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> : <Send size={12}/>}
          게시
        </button>
        <Msg msg={quickMsg}/>
      </Panel>

      {/* 점검 공지 */}
      {noticeOpen && (
        <div style={{ background:'var(--bg2)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:10, padding:20, marginBottom:20 }}>
          <SectionHeader icon={Bell} label="월간 점검 공지 — 최소 7일 전 게시" color="#F59E0B"/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
            <input value={noticeForm.title} onChange={e=>setNoticeForm(f=>({...f,title:e.target.value}))}
              placeholder="공지 제목 *" className="input" style={{ fontSize:13 }}/>
            <input type="date" value={noticeForm.maintenanceDate}
              onChange={e=>setNoticeForm(f=>({...f,maintenanceDate:e.target.value}))}
              min={new Date(Date.now()+7*86400000).toISOString().slice(0,10)}
              className="input" style={{ fontSize:13 }}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
            <select value={noticeForm.type} onChange={e=>setNoticeForm(f=>({...f,type:e.target.value}))} className="input" style={{ fontSize:13 }}>
              <option value="maintenance">시스템 점검</option>
              <option value="qa">QA 점검</option>
              <option value="update">업데이트 배포</option>
              <option value="emergency">긴급 점검</option>
            </select>
            <input value={noticeForm.timeRange||''} onChange={e=>setNoticeForm(f=>({...f,timeRange:e.target.value}))}
              placeholder="점검 시간대 (예: 02:00~06:00)" className="input" style={{ fontSize:13 }}/>
          </div>
          <textarea value={noticeForm.body} onChange={e=>setNoticeForm(f=>({...f,body:e.target.value}))}
            placeholder="공지 내용 *" rows={3} className="input" style={{ fontSize:13, resize:'vertical', marginBottom:10 }}/>
          {noticeForm.maintenanceDate && (() => {
            const d = Math.ceil((new Date(noticeForm.maintenanceDate) - new Date()) / 86400000)
            return d > 0 ? (
              <div style={{ fontFamily:'var(--f-mono)', fontSize:11, color: d>=7?'#22C55E':'#F43F5E', marginBottom:10 }}>
                <Calendar size={10}/> {d>=7 ? `✅ D-${d} — 7일 규정 충족` : `❌ D-${d} — ${7-d}일 부족`}
              </div>
            ) : null
          })()}
          <button onClick={postMaintenanceNotice} disabled={noticeSaving}
            className="btn btn-primary btn-sm" style={{ gap:5 }}>
            {noticeSaving ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> : <Bell size={12}/>}
            {noticeSaving ? '게시 중…' : '공지 게시'}
          </button>
          <Msg msg={noticeMsg}/>
        </div>
      )}

      <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--b1)', background:'var(--bg3)' }}>
              {['제목','유형','작성자','좋아요','댓글','상태','액션'].map(h=>(
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)', letterSpacing:'1px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding:32, textAlign:'center' }}>
                <Loader size={16} style={{ animation:'spin 1s linear infinite' }}/></td></tr>
            ) : posts.map(p => (
              <tr key={p.id} style={{ borderBottom:'1px solid var(--b1)', opacity: p.is_deleted ? 0.5 : 1 }}>
                <td style={{ padding:'10px 14px', maxWidth:240 }}>
                  <div style={{ fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.title}</div>
                </td>
                <td style={{ padding:'10px 14px' }}><Badge color="#A855F7">{p.post_type}</Badge></td>
                <td style={{ padding:'10px 14px', fontSize:12, color:'var(--t3)' }}>{p.profiles?.display_name||'—'}</td>
                <td style={{ padding:'10px 14px', fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)' }}>{p.like_count||0}</td>
                <td style={{ padding:'10px 14px', fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)' }}>{p.reply_count||0}</td>
                <td style={{ padding:'10px 14px' }}>
                  {p.is_pinned && <Badge color="#F59E0B">📌 고정</Badge>}
                  {p.is_deleted && <Badge color="#F43F5E">삭제됨</Badge>}
                  {!p.is_pinned && !p.is_deleted && <Badge color="#22C55E">정상</Badge>}
                </td>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={()=>togglePin(p)} title={p.is_pinned?'고정 해제':'고정'}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#F59E0B', padding:4, fontSize:12 }}>📌</button>
                    <button onClick={()=>toggleDelete(p)} title={p.is_deleted?'복구':'삭제'}
                      style={{ background:'none', border:'none', cursor:'pointer', color: p.is_deleted?'#22C55E':'#F43F5E', padding:4 }}>
                      {p.is_deleted ? <Eye size={13}/> : <Trash2 size={13}/>}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// AI 팀 관리 탭 (신규)
// ══════════════════════════════════════════════════════════════════════

const TEAM_COLORS = {
  operations:'#818CF8', content:'#C084FC', mentoring:'#34D399', news:'#38BDF8',
  analytics:'#FB923C', report:'#10B981', newsletter:'#F472B6', tech:'#A78BFA',
  community:'#FBBF24', management:'#F87171',
}
const TEAM_NAMES = {
  operations:'운영팀', content:'콘텐츠팀', mentoring:'멘토링팀', news:'뉴스팀',
  analytics:'분석팀', report:'리포트팀', newsletter:'뉴스레터팀', tech:'기술팀',
  community:'커뮤니티팀', management:'관리팀',
}
const TEAM_EMOJIS = {
  operations:'⚙️', content:'✍️', mentoring:'💡', news:'📡',
  analytics:'📊', report:'📋', newsletter:'📬', tech:'🔬',
  community:'🤝', management:'🏛️',
}

function TeamsTab() {
  const [teamData, setTeamData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [accountStatus, setAccountStatus] = useState({})
  const [checkingAccounts, setCheckingAccounts] = useState(false)

  const loadTeamData = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/ai-team')
      const d = await r.json()
      setTeamData(d)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadTeamData() }, [loadTeamData])

  const checkAccounts = async () => {
    setCheckingAccounts(true)
    try {
      const r = await fetch('/api/staff-auth')
      const d = await r.json()
      // d.accounts가 있으면 상태 반영
      const status = {}
      if (d.accounts) {
        d.accounts.forEach(a => { status[a.username] = !a.needs_lock })
      }
      setAccountStatus(status)
    } catch { /* ignore */ }
    setCheckingAccounts(false)
  }

  const syncAccounts = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/ai-team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (session?.access_token || ''),
        },
      })
      const d = await r.json()
      if (d.summary) {
        setSyncMsg(`✅ 동기화 완료 — 생성 ${d.summary.created}, 업데이트 ${d.summary.updated}, 오류 ${d.summary.errors}`)
      } else {
        setSyncMsg('✅ 동기화 요청 완료')
      }
      loadTeamData()
    } catch(e) { setSyncMsg('❌ ' + e.message?.slice(0,60)) }
    finally { setSyncing(false) }
  }

  if (loading) return <div style={{ textAlign:'center', padding:60 }}><Loader size={20} style={{ animation:'spin 1s linear infinite' }}/></div>

  const teams = teamData?.teams || []
  const selectedTeamMembers = selectedTeam ? (teamData?.teams?.find(t => t.id === selectedTeam) || null) : null

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#818CF8', letterSpacing:'2px', marginBottom:4 }}>AI TEAM SYSTEM</div>
          <div style={{ fontSize:13, color:'var(--t2)' }}>
            총 <strong style={{ color:'var(--t1)' }}>{teamData?.total_members || 100}명</strong> ·{' '}
            <strong style={{ color:'var(--t1)' }}>{teamData?.total_teams || 10}개</strong> 팀 · 팀당 10명 구성
          </div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={checkAccounts} disabled={checkingAccounts} className="btn btn-ghost btn-sm" style={{ gap:5 }}>
            {checkingAccounts ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> : <Database size={12}/>}
            계정 현황 확인
          </button>
          <button onClick={syncAccounts} disabled={syncing} className="btn btn-primary btn-sm" style={{ gap:5 }}>
            {syncing ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> : <RefreshCw size={12}/>}
            {syncing ? '동기화 중…' : '계정 동기화'}
          </button>
        </div>
      </div>
      {syncMsg && <Msg msg={syncMsg}/>}

      {/* 팀 그리드 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12, marginBottom:24 }}>
        {teams.map(team => {
          const color = TEAM_COLORS[team.id] || '#60A5FA'
          const isSelected = selectedTeam === team.id
          return (
            <div key={team.id} onClick={() => setSelectedTeam(isSelected ? null : team.id)}
              style={{ background:'var(--bg2)', border:`1px solid ${isSelected ? color : 'var(--b1)'}`,
                borderRadius:10, padding:16, cursor:'pointer', transition:'border-color .2s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:36, height:36, background:`${color}15`, border:`1px solid ${color}25`,
                  borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
                  {TEAM_EMOJIS[team.id] || '👥'}
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--t1)' }}>{team.name}</div>
                  <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}>{team.name_en}</div>
                </div>
                <div style={{ marginLeft:'auto', fontFamily:'var(--f-mono)', fontSize:20, fontWeight:700, color }}>
                  {team.member_count}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Badge color={color}>팀장: {team.lead}</Badge>
                <Badge color="#60A5FA">Senior Manager</Badge>
              </div>
            </div>
          )
        })}
      </div>

      {/* 선택 팀 상세 */}
      {selectedTeam && (
        <Panel>
          <SectionHeader icon={Users} label={`${TEAM_NAMES[selectedTeam] || selectedTeam} 멤버 상세`} color={TEAM_COLORS[selectedTeam] || '#60A5FA'}/>
          <TeamMemberDetail teamId={selectedTeam}/>
        </Panel>
      )}
    </div>
  )
}

function TeamMemberDetail({ teamId }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/ai-team?team=${teamId}`)
        const d = await r.json()
        setMembers(d.memberDetails || [])
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  }, [teamId])

  if (loading) return <div style={{ textAlign:'center', padding:20 }}><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/></div>
  if (!members.length) return <div style={{ color:'var(--t4)', fontSize:13 }}>멤버 정보 없음</div>

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:10 }}>
      {members.map(m => (
        <div key={m.id} style={{ background:'var(--bg3)', borderRadius:8, padding:12,
          border: m.is_lead ? `1px solid ${TEAM_COLORS[teamId]}40` : '1px solid var(--b2)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <img src={m._avatar_url} alt="" style={{ width:32, height:32, borderRadius:'50%', flexShrink:0 }}
              onError={e => { e.target.style.display='none' }}/>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--t1)', display:'flex', alignItems:'center', gap:5 }}>
                {m.display_name}
                {m.is_lead && <Star size={10} color={TEAM_COLORS[teamId]} fill={TEAM_COLORS[teamId]}/>}
              </div>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color: m.is_lead ? TEAM_COLORS[teamId] : 'var(--t4)' }}>
                {m.title}
              </div>
            </div>
          </div>
          <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)', marginBottom:4 }}>
            @{m.account?.username}
          </div>
          <div style={{ fontSize:11, color:'var(--t3)', lineHeight:1.5 }}>
            {m.bio?.slice(0, 80)}…
          </div>
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// AI 멘토 분석 패널 — 대시보드 인라인 위젯
// ══════════════════════════════════════════════════════════════════════

function MentorAnalysisPanel({ onTabChange }) {
  const [mentorStats, setMentorStats] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [recentSessions, setRecent]   = useState([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        // 멘토링 work_logs 집계
        const { data: wl } = await supabase.from('work_logs')
          .select('member_username,member_name,team,task_type,created_at,status')
          .eq('team', 'mentoring')
          .order('created_at', { ascending: false })
          .limit(200)

        // ai_mentor_sessions 테이블 (없을 수도 있음 — graceful)
        const { data: sessions } = await supabase.from('mentor_sessions')
          .select('id,user_id,created_at,mentor_persona,feedback_score')
          .order('created_at', { ascending: false })
          .limit(10)

        // 집계 계산
        const today = new Date().toDateString()
        const todayMentor   = (wl||[]).filter(l => new Date(l.created_at).toDateString() === today).length
        const weekAgo       = new Date(Date.now() - 7*24*60*60*1000)
        const weeklyMentor  = (wl||[]).filter(l => new Date(l.created_at) >= weekAgo).length
        const mentorMembers = [...new Set((wl||[]).map(l => l.member_username))].length

        // 유형별 카운트 (task_type)
        const typeCount = {}
        for (const l of (wl||[])) {
          const t = l.task_type || 'other'
          typeCount[t] = (typeCount[t] || 0) + 1
        }

        setMentorStats({ todayMentor, weeklyMentor, mentorMembers, typeCount, total: (wl||[]).length })
        setRecent(sessions || [])
      } catch { /* DB 없을 시 무시 */ }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div style={{ marginBottom:32, padding:'20px 0', textAlign:'center', color:'var(--t4)', fontSize:12 }}>
        <Loader size={14} style={{ animation:'spin 1s linear infinite', display:'inline-block', marginRight:6 }}/>
        멘토링 데이터 로딩 중...
      </div>
    )
  }

  if (!mentorStats) return null

  const TOP_TYPES = Object.entries(mentorStats.typeCount).sort(([,a],[,b])=>b-a).slice(0,5)

  return (
    <div style={{ marginBottom:32 }}>
      {/* 헤더 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:7, background:'rgba(52,211,153,.12)', border:'1px solid rgba(52,211,153,.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Award size={14} color="#34D399"/>
          </div>
          <div>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#34D399', letterSpacing:'2px' }}>AI MENTOR ANALYSIS</div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--t1)' }}>멘토링팀 활동 분석</div>
          </div>
        </div>
        <button onClick={() => onTabChange('workers')}
          className="btn btn-ghost btn-sm" style={{ fontSize:11, gap:4 }}>
          <ChevronRight size={11}/> 워커 탭에서 보기
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12 }}>
        {/* 멘토링 지표 카드 */}
        <div style={{ background:'var(--bg2)', border:'1px solid rgba(52,211,153,.2)', borderRadius:11, padding:'16px 18px' }}>
          <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)', letterSpacing:'1px', marginBottom:12 }}>MENTORING KPIs</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            {[
              { label:'오늘', value: mentorStats.todayMentor, color:'#34D399' },
              { label:'이번 주', value: mentorStats.weeklyMentor, color:'#F59E0B' },
              { label:'멘토 수', value: mentorStats.mentorMembers, color:'#818CF8' },
            ].map((s,i) => (
              <div key={i} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:'var(--f-display)', fontSize:22, fontWeight:700, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:10, color:'var(--t4)', marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 작업 유형 분포 */}
        <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:11, padding:'16px 18px' }}>
          <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)', letterSpacing:'1px', marginBottom:12 }}>TASK TYPE DISTRIBUTION</div>
          {TOP_TYPES.length === 0 ? (
            <div style={{ color:'var(--t4)', fontSize:12, textAlign:'center', padding:'10px 0' }}>데이터 없음</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {TOP_TYPES.map(([type, count]) => {
                const pct = Math.round((count / mentorStats.total) * 100)
                return (
                  <div key={type}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:11, color:'var(--t2)', fontFamily:'var(--f-mono)' }}>{type}</span>
                      <span style={{ fontSize:10, color:'var(--t4)', fontFamily:'var(--f-mono)' }}>{count} ({pct}%)</span>
                    </div>
                    <div style={{ height:3, background:'var(--bg4)', borderRadius:2 }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:'#34D399', borderRadius:2, transition:'width .5s' }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 최근 멘토링 세션 (mentor_sessions 테이블) */}
        {recentSessions.length > 0 && (
          <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:11, padding:'16px 18px' }}>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)', letterSpacing:'1px', marginBottom:12 }}>RECENT SESSIONS</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {recentSessions.slice(0,5).map(s => (
                <div key={s.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'1px solid var(--b0)' }}>
                  <div style={{ fontSize:16, flexShrink:0 }}>💡</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'var(--t1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {s.mentor_persona || 'LUMI'}
                    </div>
                    <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)' }}>
                      {new Date(s.created_at).toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                    </div>
                  </div>
                  {s.feedback_score != null && (
                    <div style={{ fontSize:10, padding:'2px 7px', borderRadius:4, background:'rgba(245,158,11,.1)', color:'#F59E0B', fontFamily:'var(--f-mono)', flexShrink:0 }}>
                      ★ {s.feedback_score}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// AI 워커 제어 탭 (신규)
// ══════════════════════════════════════════════════════════════════════

function WorkersTab() {
  const [workerStatus, setWorkerStatus]   = useState(null)
  const [running, setRunning]             = useState(false)
  const [result, setResult]               = useState(null)
  const [logs, setLogs]                   = useState([])
  const [loadingLogs, setLoadingLogs]     = useState(false)
  const [targetWorker, setTargetWorker]   = useState('')
  const [liveStats, setLiveStats]         = useState(null)   // 팀별 작업 통계
  const [autoRefresh, setAutoRefresh]     = useState(false)  // 자동 새로고침
  const [logFilter, setLogFilter]         = useState('all')  // 팀 필터
  const logsEndRef = useRef(null)
  const autoRefreshRef = useRef(null)

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/ai-workers')
      const d = await r.json()
      setWorkerStatus(d)
    } catch { /* ignore */ }
  }, [])

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const { data } = await supabase.from('work_logs')
        .select('member_username,member_name,team,title,task_type,task,status,created_at')
        .order('created_at', { ascending:false })
        .limit(100)
      setLogs(data || [])
      // ── 라이브 팀별 통계 계산 ──────────────────────────────────
      if (data?.length) {
        const teamMap = {}
        const typeMap = {}
        for (const log of data) {
          // 팀별 카운트
          const t = log.team || 'unknown'
          teamMap[t] = (teamMap[t] || 0) + 1
          // 작업 유형별 카운트
          const ty = log.task_type || 'unknown'
          typeMap[ty] = (typeMap[ty] || 0) + 1
        }
        // 오늘 작업 수
        const todayStr = new Date().toDateString()
        const todayCount = data.filter(l =>
          new Date(l.created_at).toDateString() === todayStr
        ).length
        // 성공/실패율
        const doneCount  = data.filter(l => l.status === 'done'   || !l.status).length
        const failCount  = data.filter(l => l.status === 'failed').length
        const skipCount  = data.filter(l => l.status === 'skipped').length
        setLiveStats({ teamMap, typeMap, todayCount, doneCount, failCount, skipCount, total: data.length })
      }
    } catch { /* ignore */ }
    setLoadingLogs(false)
  }, [])

  useEffect(() => {
    loadStatus()
    loadLogs()
  }, [loadStatus, loadLogs])

  // ── 자동 새로고침 (30초 간격) ──────────────────────────────────
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => {
        loadStatus()
        loadLogs()
      }, 30_000)
    } else {
      clearInterval(autoRefreshRef.current)
    }
    return () => clearInterval(autoRefreshRef.current)
  }, [autoRefresh, loadStatus, loadLogs])

  // ── 실시간 work_logs 구독 ──────────────────────────────────────
  useEffect(() => {
    const sub = supabase
      .channel('work_logs_live')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'work_logs' }, payload => {
        setLogs(prev => [payload.new, ...prev].slice(0, 100))
        setLiveStats(prev => prev ? {
          ...prev,
          total: prev.total + 1,
          todayCount: prev.todayCount + 1,
          teamMap: { ...prev.teamMap, [payload.new.team||'unknown']: (prev.teamMap[payload.new.team||'unknown']||0)+1 },
          doneCount: (payload.new.status === 'failed' ? prev.doneCount : prev.doneCount + 1),
          failCount: (payload.new.status === 'failed' ? prev.failCount + 1 : prev.failCount),
        } : prev)
      })
      .subscribe()
    return () => sub.unsubscribe()
  }, [])

  const runWorkers = async (opts = {}) => {
    setRunning(true)
    setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const body = {}
      if (opts.forceAll) body.force_all = true
      if (opts.target) body.target = opts.target
      const r = await fetch('/api/ai-workers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-cron': '1',
          Authorization: 'Bearer ' + (session?.access_token || ''),
        },
        body: JSON.stringify(body),
      })
      // ★ BUG FIX: 서버가 HTML/텍스트 에러 반환 시 JSON 파싱 실패 방지
      const text = await r.text()
      let d
      try { d = JSON.parse(text) }
      catch { d = { error: `서버 응답 오류 (HTTP ${r.status}): ${text.slice(0, 120)}` } }
      setResult(d)
      setTimeout(loadLogs, 1500)
    } catch(e) { setResult({ error: e.message }) }
    finally { setRunning(false) }
  }

  const TEAM_KEYS = {
    operations: ['ARIA','OPS_JUNE','OPS_RAY','OPS_MINA','OPS_KEN','OPS_TARA','OPS_FINN','OPS_DANA','OPS_ZARA','OPS_LEON'],
    content:    ['NOVA','CNT_IRIS','CNT_ALEX','CNT_VIVI','CNT_OWEN','CNT_LENA','CNT_SETH','CNT_FAYE','CNT_BREN','CNT_NIKA'],
    mentoring:  ['LUMI','MNT_SAGE2','MNT_COLE','MNT_YUNA','MNT_JAKE','MNT_ROMI','MNT_PARK','MNT_ELLE','MNT_WREN','MNT_TINO'],
    news:       ['PULSE','NWS_CLAM','NWS_VERO','NWS_MONT','NWS_SKYE','NWS_RIKU','NWS_POLA','NWS_ALAN','NWS_BETH','NWS_COLE2'],
    management: ['MAX','MGT_VERA','MGT_FINN2','MGT_ALBA','MGT_DUSK','MGT_LORE','MGT_CROW','MGT_OPAL','MGT_WICK','MGT_ROME'],
  }

  const ACTIVITY_COLOR = { night:'#60A5FA', morning:'#34D399', peak:'#F59E0B', evening:'#A855F7', late:'#F87171' }
  const ACTIVITY_LABEL = { night:'야간 조용', morning:'아침 준비', peak:'활발한 업무', evening:'저녁 활동', late:'늦은 밤' }
  const TEAM_COLOR_MAP = {
    operations:'#818CF8', content:'#C084FC', mentoring:'#34D399',
    news:'#38BDF8', management:'#F87171', unknown:'#60A5FA',
  }
  const TEAM_LABEL_MAP = {
    operations:'운영팀', content:'콘텐츠팀', mentoring:'멘토링팀',
    news:'뉴스팀', management:'경영팀', unknown:'기타',
  }
  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.team === logFilter)

  return (
    <div>
      {/* ── 실시간 상태 헤더 ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#818CF8', letterSpacing:'2px' }}>AI WORKER ENGINE — LIVE DASHBOARD</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={() => { loadStatus(); loadLogs() }}
            className="btn btn-ghost btn-sm" style={{ gap:4, fontSize:11 }}>
            <RefreshCw size={10}/> 새로고침
          </button>
          <button onClick={() => setAutoRefresh(v => !v)}
            className="btn btn-ghost btn-sm"
            style={{ gap:4, fontSize:11, color: autoRefresh ? '#22C55E' : 'var(--t3)', borderColor: autoRefresh ? 'rgba(34,197,94,.3)' : undefined }}>
            {autoRefresh ? <><Wifi size={10}/> 자동 ON</> : <><WifiOff size={10}/> 자동 OFF</>}
          </button>
        </div>
      </div>

      {/* 상태 표시 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10, marginBottom:16 }}>
        <StatCard label="총 워커" value={workerStatus?.total_workers || 100} icon={Bot} color="#818CF8"/>
        <StatCard label="이번 실행" value={workerStatus?.workers_this_run || '—'} icon={Activity} color="#22C55E"/>
        <StatCard label="활동 레벨" value={ACTIVITY_LABEL[workerStatus?.current_activity_level] || '—'}
          icon={Radio} color={ACTIVITY_COLOR[workerStatus?.current_activity_level] || '#60A5FA'}/>
        <StatCard label="오늘 작업" value={liveStats?.todayCount ?? '—'} icon={Clock} color="#F59E0B"/>
        <StatCard label="성공" value={liveStats?.doneCount ?? '—'} icon={CheckCircle} color="#22C55E"
          sub={liveStats ? `${Math.round((liveStats.doneCount/Math.max(1,liveStats.total))*100)}%` : undefined}/>
        <StatCard label="실패" value={liveStats?.failCount ?? 0} icon={XCircle} color="#F43F5E"/>
      </div>

      {/* ── 팀별 작업 분포 ── */}
      {liveStats?.teamMap && (
        <Panel style={{ marginBottom:16 }}>
          <SectionHeader icon={Bot} label="팀별 작업 분포 (최근 100건)" color="#818CF8">
            <select value={logFilter} onChange={e=>setLogFilter(e.target.value)}
              style={{ fontSize:11, padding:'3px 8px', background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:6, color:'var(--t2)', cursor:'pointer' }}>
              <option value="all">전체</option>
              {Object.keys(TEAM_LABEL_MAP).map(k => (
                <option key={k} value={k}>{TEAM_LABEL_MAP[k]}</option>
              ))}
            </select>
          </SectionHeader>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {Object.entries(liveStats.teamMap)
              .sort(([,a],[,b]) => b-a)
              .map(([team, count]) => {
                const pct = Math.round((count / liveStats.total) * 100)
                const color = TEAM_COLOR_MAP[team] || '#60A5FA'
                return (
                  <div key={team} style={{ flex:1, minWidth:120, background:`${color}10`, border:`1px solid ${color}25`, borderRadius:9, padding:'10px 14px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ fontSize:11, fontWeight:600, color }}>{TEAM_LABEL_MAP[team]||team}</span>
                      <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)' }}>{count}건</span>
                    </div>
                    <div style={{ height:4, background:'var(--bg4)', borderRadius:2, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:2, transition:'width .5s' }}/>
                    </div>
                    <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)', marginTop:4 }}>{pct}%</div>
                  </div>
                )
              })}
          </div>
        </Panel>
      )}
      {/* ── 작업 유형 태그 클라우드 ── */}
      {liveStats?.typeMap && (
        <div style={{ marginBottom:16, display:'flex', gap:6, flexWrap:'wrap' }}>
          {Object.entries(liveStats.typeMap)
            .sort(([,a],[,b]) => b-a).slice(0, 12)
            .map(([type, count]) => (
              <span key={type} style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:'var(--bg3)',
                border:'1px solid var(--b1)', color:'var(--t2)', fontFamily:'var(--f-mono)' }}>
                {type} <span style={{ color:'#818CF8', fontWeight:700 }}>{count}</span>
              </span>
            ))}
        </div>
      )}

      {/* 제어 버튼 */}
      <Panel style={{ marginBottom:16 }}>
        <SectionHeader icon={Cpu} label="워커 실행 제어" color="#818CF8"/>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14 }}>
          <button onClick={() => runWorkers()} disabled={running} className="btn btn-primary btn-sm" style={{ gap:5 }}>
            {running ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> : <Play size={12}/>}
            {running ? '실행 중…' : '스케줄 실행 (자동)'}
          </button>
          <button onClick={() => runWorkers({ forceAll: true })} disabled={running}
            className="btn btn-ghost btn-sm" style={{ gap:5, color:'#F59E0B', borderColor:'rgba(245,158,11,0.3)' }}>
            <Zap size={12}/> 전체 실행 (100명)
          </button>
        </div>

        {/* 특정 워커 실행 */}
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <select value={targetWorker} onChange={e=>setTargetWorker(e.target.value)}
            className="input" style={{ flex:1, fontSize:12 }}>
            <option value="">— 특정 워커 선택 —</option>
            {Object.entries(TEAM_KEYS).map(([team, keys]) =>
              keys.map(k => <option key={k} value={k}>{k} ({TEAM_NAMES[team]})</option>)
            )}
          </select>
          <button onClick={() => targetWorker && runWorkers({ target: targetWorker })}
            disabled={running || !targetWorker} className="btn btn-ghost btn-sm" style={{ gap:5 }}>
            <ChevronRight size={12}/> 단독 실행
          </button>
        </div>

        {/* 실행 결과 */}
        {result && (
          <div style={{ background:'var(--bg3)', borderRadius:8, padding:14, fontFamily:'var(--f-mono)',
            fontSize:11, color:'var(--t2)', maxHeight:260, overflowY:'auto', marginTop:10 }}>
            <div style={{ color: result.error ? '#F43F5E' : '#22C55E', marginBottom:6, fontSize:12 }}>
              {result.error ? `❌ ${result.error}` :
                `✅ 완료 — 실행 ${result.summary?.done || 0} / 스킵 ${result.summary?.skipped || 0} / 오류 ${result.summary?.errors || 0} · ${result.elapsed_ms}ms · ${result.activity_level || ''}`}
            </div>
            {result.results && (
              <pre style={{ margin:0, fontSize:10, overflowX:'auto' }}>
                {JSON.stringify(result.results, null, 2).slice(0, 1200)}
              </pre>
            )}
          </div>
        )}
      </Panel>

      {/* 활동 로그 */}
      <Panel>
        <SectionHeader icon={Clock} label="최근 활동 로그 (work_logs)" color="#60A5FA">
          <button onClick={loadLogs} disabled={loadingLogs} className="btn btn-ghost btn-sm" style={{ gap:4 }}>
            {loadingLogs ? <Loader size={10} style={{ animation:'spin 1s linear infinite' }}/> : <RefreshCw size={10}/>}
            새로고침
          </button>
        </SectionHeader>
        <div style={{ maxHeight:400, overflowY:'auto' }}>
          {loadingLogs ? (
            <div style={{ textAlign:'center', padding:20 }}><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/></div>
          ) : logs.length === 0 ? (
            <div style={{ color:'var(--t4)', fontSize:13, textAlign:'center', padding:20 }}>
              아직 로그가 없습니다. work_logs 테이블이 필요합니다.
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--b1)' }}>
                  {['직원','팀','작업유형','내용','시각'].map(h=>(
                    <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)', letterSpacing:'1px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid var(--b2)' }}>
                    <td style={{ padding:'8px 12px', fontSize:12, fontWeight:600, color:'var(--t1)' }}>{log.member_name}</td>
                    <td style={{ padding:'8px 12px' }}>
                      <Badge color={TEAM_COLORS[log.team] || '#60A5FA'}>{log.team}</Badge>
                    </td>
                    <td style={{ padding:'8px 12px' }}>
                      <Badge color="#A855F7">{log.task_type}</Badge>
                    </td>
                    <td style={{ padding:'8px 12px', fontSize:12, color:'var(--t3)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {log.task}
                    </td>
                    <td style={{ padding:'8px 12px', fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}>
                      {new Date(log.created_at).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div ref={logsEndRef}/>
      </Panel>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 자동 운영 탭 (신규)
// ══════════════════════════════════════════════════════════════════════

function OpsTab() {
  const [opsStatus, setOpsStatus] = useState(null)
  const [running, setRunning] = useState('')
  const [results, setResults] = useState({})

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/auto-ops')
      const d = await r.json()
      setOpsStatus(d)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const runOp = async (ops, label) => {
    setRunning(label)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const body = Array.isArray(ops) ? { ops } : { ops: [ops] }
      const r = await fetch('/api/auto-ops', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-cron': '1',
          Authorization: 'Bearer ' + (session?.access_token || ''),
        },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      setResults(prev => ({ ...prev, [label]: d }))
    } catch(e) { setResults(prev => ({ ...prev, [label]: { error: e.message } })) }
    finally { setRunning('') }
  }

  const runAllScheduled = async () => {
    setRunning('all')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/auto-ops', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-cron': '1',
          Authorization: 'Bearer ' + (session?.access_token || ''),
        },
        body: JSON.stringify({}),
      })
      const d = await r.json()
      setResults(prev => ({ ...prev, all: d }))
    } catch(e) { setResults(prev => ({ ...prev, all: { error: e.message } })) }
    finally { setRunning('') }
  }

  const OPS_LIST = [
    { key: 'weekly_strategy', label: '주간 전략 리포트',     color: '#F87171', icon: Target },
    { key: 'pr_campaign',     label: 'PR 캠페인',            color: '#F472B6', icon: Globe  },
    { key: 'community_event', label: '커뮤니티 이벤트 기획', color: '#FBBF24', icon: Star   },
    { key: 'news_highlight',  label: '뉴스 하이라이트',      color: '#38BDF8', icon: Newspaper },
    { key: 'weekly_kpi',      label: '주간 KPI 리포트',      color: '#10B981', icon: PieChart },
    { key: 'faq_post',        label: 'FAQ 게시',             color: '#34D399', icon: Inbox  },
    { key: 'growth_analysis', label: '성장 분석',            color: '#FB923C', icon: TrendingUp },
    { key: 'partnership',     label: '파트너십 기획',        color: '#A78BFA', icon: Briefcase },
  ]

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#F59E0B', letterSpacing:'2px', marginBottom:4 }}>AUTO OPS ENGINE v1</div>
          <div style={{ fontSize:13, color:'var(--t2)' }}>
            현재 예약된 OPS: <strong style={{ color:'var(--t1)' }}>{opsStatus?.scheduled_now?.join(', ') || '로딩 중…'}</strong>
          </div>
        </div>
        <button onClick={runAllScheduled} disabled={!!running}
          className="btn btn-primary btn-sm" style={{ marginLeft:'auto', gap:5 }}>
          {running === 'all' ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> : <Zap size={12}/>}
          {running === 'all' ? '실행 중…' : '스케줄 자동 실행'}
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
        {OPS_LIST.map(op => {
          const Icon = op.icon
          const opResult = results[op.label]
          const isRunning = running === op.label
          return (
            <Panel key={op.key}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <div style={{ width:36, height:36, background:`${op.color}15`, border:`1px solid ${op.color}25`,
                  borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon size={16} color={op.color}/>
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--t1)' }}>{op.label}</div>
                  <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)', letterSpacing:'1px' }}>{op.key}</div>
                </div>
              </div>
              <button onClick={() => runOp(op.key, op.label)} disabled={!!running}
                className="btn btn-ghost btn-sm" style={{ width:'100%', gap:5, justifyContent:'center',
                  color: op.color, borderColor: `${op.color}30` }}>
                {isRunning ? <Loader size={11} style={{ animation:'spin 1s linear infinite' }}/> : <Play size={11}/>}
                {isRunning ? '실행 중…' : '실행'}
              </button>
              {opResult && (
                <div style={{ marginTop:8, fontFamily:'var(--f-mono)', fontSize:10,
                  color: opResult.error ? '#F43F5E' : '#22C55E' }}>
                  {opResult.error ? `❌ ${opResult.error.slice(0,50)}` :
                    `✅ ${opResult.ok !== false ? '완료' : '일부 실패'} — ${opResult.elapsed_ms || 0}ms`}
                </div>
              )}
            </Panel>
          )
        })}
      </div>

      {/* 전체 결과 */}
      {results.all && (
        <Panel style={{ marginTop:16 }}>
          <SectionHeader icon={Terminal} label="실행 결과" color="#A855F7"/>
          <pre style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t2)',
            whiteSpace:'pre-wrap', maxHeight:300, overflowY:'auto', margin:0 }}>
            {JSON.stringify(results.all, null, 2).slice(0, 2000)}
          </pre>
        </Panel>
      )}
    </div>
  )
}

// ── 시스템 탭 ─────────────────────────────────────────────────────────
function SystemTab({ stats, onRefresh }) {
  const [runningCron, setRunningCron] = useState('')
  const [cronResult, setCronResult] = useState('')
  const [nlTestEmail, setNlTestEmail] = useState('')
  const [nlSending, setNlSending] = useState(false)
  const [nlResult, setNlResult] = useState('')
  const [dbSetupRunning, setDbSetupRunning] = useState(false)
  const [dbSetupResult, setDbSetupResult] = useState(null)
  const [articlesMigrateRunning, setArticlesMigrateRunning] = useState(false)
  const [articlesMigrateResult, setArticlesMigrateResult] = useState(null)

  // ── 뉴스 재처리 상태 ──────────────────────────────────────────────────
  const [reprocessStatus, setReprocessStatus] = useState(null)       // GET 현황
  const [reprocessLoading, setReprocessLoading] = useState(false)    // 현황 로딩
  const [reprocessRunning, setReprocessRunning] = useState(false)    // 배치 실행 중
  const [reprocessResult, setReprocessResult] = useState(null)       // 배치 결과
  const [reprocessOffset, setReprocessOffset] = useState(0)          // 현재 오프셋
  const [reprocessBatch, setReprocessBatch] = useState(40)           // 배치 크기
  const [reprocessForce, setReprocessForce] = useState(false)        // 강제 전체

  const loadReprocessStatus = async () => {
    setReprocessLoading(true)
    try {
      const r = await fetch('/api/reprocess-all-news')
      const d = await r.json()
      setReprocessStatus(d)
    } catch (e) {
      setReprocessStatus({ error: e.message })
    }
    setReprocessLoading(false)
  }

  const runReprocess = async (resetOffset = false) => {
    setReprocessRunning(true)
    setReprocessResult(null)
    const currentOffset = resetOffset ? 0 : reprocessOffset
    if (resetOffset) setReprocessOffset(0)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/reprocess-all-news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ batch: reprocessBatch, offset: currentOffset, force: reprocessForce }),
      })
      const d = await r.json()
      setReprocessResult(d)
      if (d.next_offset !== undefined) setReprocessOffset(d.next_offset)
      // 현황 갱신
      await loadReprocessStatus()
    } catch (e) {
      setReprocessResult({ error: e.message })
    }
    setReprocessRunning(false)
  }

  // 컴포넌트 마운트 시 현황 자동 조회
  const [reprocessAutoLoaded, setReprocessAutoLoaded] = useState(false)

  // ── articles 컬럼 추가 (PGRST204 해결) ─────────────────────────────
  const runArticlesMigrate = async () => {
    setArticlesMigrateRunning(true)
    setArticlesMigrateResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/setup-db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
      })
      const d = await r.json()
      setArticlesMigrateResult(d)
    } catch (e) {
      setArticlesMigrateResult({ ok: false, error: e.message })
    }
    setArticlesMigrateRunning(false)
  }

  // ── 직원채팅 DB 초기화 ──────────────────────────────────────────────
  const runDbSetup = async () => {
    setDbSetupRunning(true)
    setDbSetupResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/db-setup-staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
      })
      const d = await r.json()
      setDbSetupResult(d)
    } catch (e) {
      setDbSetupResult({ ok: false, message: '❌ 오류: ' + e.message })
    }
    setDbSetupRunning(false)
  }

  const runCron = async (path, label) => {
    setRunningCron(label)
    setCronResult('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'x-vercel-cron':'1', Authorization:'Bearer '+(session?.access_token||'') },
      })
      const d = await r.json()
      setCronResult(`✅ ${label} 완료:\n${JSON.stringify(d, null, 2).slice(0, 800)}`)
    } catch (e) { setCronResult('❌ 오류: ' + e.message) }
    finally { setRunningCron(''); onRefresh() }
  }

  const sendNewsletterTest = async () => {
    if (!nlTestEmail.trim()) return
    setNlSending(true); setNlResult('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`/api/send-newsletter?test=true&email=${encodeURIComponent(nlTestEmail.trim())}`, {
        method: 'POST',
        headers: { Authorization:'Bearer '+(session?.access_token||'') },
      })
      const d = await r.json()
      if (d.ok || d.sent !== undefined) {
        setNlResult(`✅ 테스트 뉴스레터 발송 완료 (${nlTestEmail}) — 발송:${d.sent||1}, 실패:${d.failed||0}`)
      } else {
        setNlResult(`❌ ${d.error || JSON.stringify(d).slice(0,100)}`)
      }
    } catch(e) { setNlResult('❌ ' + e.message) }
    setNlSending(false)
  }

  const CRONS = [
    { label:'뉴스 수집',      path:'/api/fetch-news',           color:'#22C55E' },
    { label:'AI 요약',        path:'/api/summarize-news',        color:'#A855F7' },
    { label:'롱폼 재처리',    path:'/api/reprocess-all-news',   color:'#3B82F6' },
    { label:'트렌드 추출',    path:'/api/extract-news-trends',  color:'#F97316' },
    { label:'AI 리포트',      path:'/api/generate-report',      color:'#F59E0B' },
    { label:'AI 콘텐츠',      path:'/api/ai-content-writer',    color:'#8B5CF6' },
    { label:'플랫폼 운영',    path:'/api/ai-platform-operator', color:'#60A5FA' },
    { label:'LEARN',          path:'/api/ai-mentor-learn',      color:'#34D399' },
    { label:'배지 시스템',    path:'/api/badge-system',         color:'#F59E0B' },
    { label:'AI 계정 동기화', path:'/api/ai-team',              color:'#818CF8' },
    { label:'AI 워커 실행',   path:'/api/ai-workers',           color:'#FB923C' },
    { label:'자동 운영',      path:'/api/auto-ops',             color:'#F472B6' },
  ]

  return (
    <div>
      {/* ── articles 컬럼 추가 (PGRST204 해결) ─────────────────────── */}
      <Panel style={{ marginBottom:20, border:'1px solid rgba(234,179,8,0.35)' }}>
        <SectionHeader icon={Database} label="articles AI 컬럼 추가 (PGRST204 해결)" color="#EAB308"/>
        <div style={{ fontSize:12, color:'var(--t3)', marginBottom:10 }}>
          <code style={{ color:'#FDE047', background:'#0f172a', padding:'2px 6px', borderRadius:4 }}>ai_summary</code>{', '}
          <code style={{ color:'#FDE047', background:'#0f172a', padding:'2px 6px', borderRadius:4 }}>ai_processed_at</code>{', '}
          <code style={{ color:'#FDE047', background:'#0f172a', padding:'2px 6px', borderRadius:4 }}>ai_category</code>{', '}
          <code style={{ color:'#FDE047', background:'#0f172a', padding:'2px 6px', borderRadius:4 }}>read_time</code>{' '}
          컬럼이 articles 테이블에 없으면 PGRST204 에러가 발생합니다. 아래 버튼으로 추가하거나 직접 SQL을 실행하세요.
        </div>
        <details style={{ marginBottom:10 }}>
          <summary style={{ fontSize:11, color:'var(--t3)', cursor:'pointer' }}>SQL 직접 실행 (Supabase SQL Editor)</summary>
          <pre style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#FDE047', background:'#0f0f1a',
            padding:'10px 12px', borderRadius:6, margin:'6px 0', overflowX:'auto', whiteSpace:'pre-wrap' }}>
{`ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_category text;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS read_time integer DEFAULT 3;`}
          </pre>
          <div style={{ display:'flex', gap:8 }}>
            <button
              onClick={() => {
                const sql = `ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_summary text;\nALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz;\nALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_category text;\nALTER TABLE public.articles ADD COLUMN IF NOT EXISTS read_time integer DEFAULT 3;`
                navigator.clipboard?.writeText(sql).then(()=>alert('복사 완료! Supabase SQL Editor에 붙여넣기하세요.'))
              }}
              className="btn btn-ghost btn-sm" style={{ fontSize:10, gap:4 }}>📋 SQL 복사</button>
            <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer"
              className="btn btn-ghost btn-sm" style={{ fontSize:10, gap:4 }}>🔗 SQL Editor 열기</a>
          </div>
        </details>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginTop:4 }}>
          <button onClick={runArticlesMigrate} disabled={articlesMigrateRunning}
            className="btn btn-warning btn-sm"
            style={{ gap:5, background:'linear-gradient(135deg,#D97706,#F59E0B)', color:'#000', fontWeight:600 }}>
            {articlesMigrateRunning
              ? <><span style={{ display:'inline-block', animation:'spin 1s linear infinite' }}>⏳</span> 실행 중…</>
              : <>🔧 컬럼 자동 추가 (setup-db)</>}
          </button>
          <span style={{ fontSize:10, color:'var(--t4)' }}>* CRON_SECRET 환경변수 또는 admin 계정으로만 실행 가능</span>
        </div>
        {articlesMigrateResult && (
          <div style={{ marginTop:8, padding:10, borderRadius:6, fontSize:11,
            background: articlesMigrateResult.ok ? '#052e1640' : '#1e0a0a60',
            border: `1px solid ${articlesMigrateResult.ok ? '#22c55e30' : '#f43f5e30'}` }}>
            <div style={{ fontWeight:600, marginBottom:4,
              color: articlesMigrateResult.ok ? '#4ade80' : '#f87171' }}>
              {articlesMigrateResult.ok
                ? '✅ DB 초기화 완료 — 이제 재처리 배치를 실행하세요.'
                : (articlesMigrateResult.message || `❌ 실패: ${articlesMigrateResult.error || '알 수 없는 오류'}`)}
            </div>
            {/* exec_sql RPC 없을 때 — manual SQL 표시 */}
            {!articlesMigrateResult.schema_rpc && articlesMigrateResult.manual_sql && (
              <div style={{ marginTop:6 }}>
                <div style={{ color:'#fbbf24', marginBottom:4 }}>
                  ⚠ exec_sql RPC 없음 — 아래 SQL을 Supabase SQL Editor에서 직접 실행하세요:
                </div>
                <pre style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#94a3b8',
                  background:'#0a0a14', border:'1px solid #334155', borderRadius:4,
                  padding:'6px 8px', whiteSpace:'pre-wrap', maxHeight:160, overflowY:'auto',
                  userSelect:'all', margin:'0 0 4px' }}>
                  {articlesMigrateResult.manual_sql}
                </pre>
                <div style={{ display:'flex', gap:6 }}>
                  <button
                    onClick={() => navigator.clipboard?.writeText(articlesMigrateResult.manual_sql)
                      .then(() => alert('복사 완료! Supabase SQL Editor에 붙여넣기하세요.'))}
                    className="btn btn-ghost btn-sm" style={{ fontSize:10 }}>📋 SQL 복사</button>
                  <a href={articlesMigrateResult.supabase_url || 'https://supabase.com/dashboard'}
                    target="_blank" rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm" style={{ fontSize:10 }}>🔗 SQL Editor 열기</a>
                </div>
              </div>
            )}
            {/* 체크 결과 */}
            {articlesMigrateResult.checks?.length > 0 && (
              <details style={{ marginTop:6 }}>
                <summary style={{ fontSize:10, color:'var(--t3)', cursor:'pointer' }}>테이블/컬럼 확인 결과</summary>
                <div style={{ marginTop:4, display:'flex', flexWrap:'wrap', gap:4 }}>
                  {articlesMigrateResult.checks.map((c, i) => (
                    <span key={i} style={{ fontSize:9, padding:'2px 5px', borderRadius:3,
                      background: c.ok ? '#052e1660' : '#3f0f0f60',
                      color: c.ok ? '#4ade80' : '#f87171',
                      border: `1px solid ${c.ok ? '#22c55e30' : '#f43f5e30'}` }}>
                      {c.ok ? '✅' : '❌'} {c.col}
                    </span>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </Panel>

      {/* ── 뉴스 v15 재처리 패널 ─────────────────────────────────── */}
      <Panel style={{ marginBottom:20, border:'1px solid rgba(59,130,246,0.3)' }}>
        <SectionHeader icon={RefreshCw} label="뉴스 AI 롱폼 재처리 (v15)" color="#3B82F6"/>
        <div style={{ fontSize:12, color:'var(--t3)', marginBottom:12 }}>
          본문 있으면 BM25 키문장 추출, 없으면 NER 완전 기반 동적 생성 —{' '}
          <code style={{ color:'#93C5FD', background:'#0f172a', padding:'2px 6px', borderRadius:4 }}>insightship-longform-v15</code>{' '}
          엔진으로 모든 기사를 재처리합니다. 배치 단위로 실행하세요.
        </div>

        {/* 현황 조회 */}
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
          <button onClick={async () => { setReprocessAutoLoaded(true); await loadReprocessStatus() }}
            disabled={reprocessLoading} className="btn btn-ghost btn-sm" style={{ gap:5 }}>
            {reprocessLoading
              ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/>
              : <Activity size={12}/>}
            현황 조회
          </button>
          {reprocessStatus && !reprocessStatus.error && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {[
                { label:'전체',     value: reprocessStatus.total_articles,  color:'#9ca3af' },
                { label:'v15완료',  value: reprocessStatus.v15_done,        color:'#22C55E' },
                { label:'v14완료',  value: reprocessStatus.v14_done,        color:'#a78bfa' },
                { label:'미처리',   value: reprocessStatus.no_summary,      color:'#F43F5E' },
                { label:'재처리필요', value: reprocessStatus.needs_reprocess, color:'#3B82F6' },
              ].map(s => (
                <span key={s.label} style={{
                  display:'inline-flex', alignItems:'center', gap:4,
                  background:'var(--bg2)', border:'1px solid var(--b1)',
                  borderRadius:4, padding:'3px 8px', fontSize:11,
                }}>
                  <span style={{ color: s.color, fontWeight:700 }}>{(s.value ?? '—').toLocaleString()}</span>
                  <span style={{ color:'var(--t3)' }}>{s.label}</span>
                </span>
              ))}
              <span style={{
                display:'inline-flex', alignItems:'center', gap:4,
                background: reprocessStatus.progress_pct >= 100 ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)',
                border: `1px solid ${reprocessStatus.progress_pct >= 100 ? '#22c55e40' : '#3b82f640'}`,
                borderRadius:4, padding:'3px 8px', fontSize:11, fontWeight:700,
                color: reprocessStatus.progress_pct >= 100 ? '#4ade80' : '#60a5fa',
              }}>
                {reprocessStatus.progress_pct}% 완료
              </span>
            </div>
          )}
          {reprocessStatus?.error && (
            <span style={{ fontSize:11, color:'#f87171' }}>❌ {reprocessStatus.error}</span>
          )}
        </div>

        {/* 배치 설정 */}
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
          <label style={{ fontSize:11, color:'var(--t3)', display:'flex', alignItems:'center', gap:5 }}>
            배치 크기:
            <select value={reprocessBatch} onChange={e => setReprocessBatch(Number(e.target.value))}
              style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:4,
                color:'var(--t1)', fontSize:11, padding:'2px 6px' }}>
              {[20,40,60].map(n => <option key={n} value={n}>{n}건</option>)}
            </select>
          </label>
          <label style={{ fontSize:11, color:'var(--t3)', display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
            <input type="checkbox" checked={reprocessForce}
              onChange={e => setReprocessForce(e.target.checked)}
              style={{ cursor:'pointer' }}/>
            강제 전체 (v15 포함 재처리)
          </label>
          <span style={{ fontSize:11, color:'var(--t3)' }}>
            offset: <code style={{ color:'#93C5FD' }}>{reprocessOffset}</code>
          </span>
          <button onClick={() => setReprocessOffset(0)}
            className="btn btn-ghost btn-sm" style={{ fontSize:10, gap:4, padding:'3px 8px' }}>
            <RotateCcw size={10}/> offset 초기화
          </button>
        </div>

        {/* 실행 버튼 */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => runReprocess(false)}
            disabled={reprocessRunning || reprocessLoading} className="btn btn-primary btn-sm"
            style={{ gap:5, background:'linear-gradient(135deg,#1d4ed8,#3B82F6)' }}>
            {reprocessRunning
              ? <><Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> 재처리 중…</>
              : <><Play size={12}/> 배치 실행 (offset {reprocessOffset})</>}
          </button>
          <button onClick={() => runReprocess(true)}
            disabled={reprocessRunning || reprocessLoading} className="btn btn-ghost btn-sm"
            style={{ gap:5, fontSize:11 }}>
            <RotateCcw size={11}/> 처음부터 재처리
          </button>
        </div>

        {/* 실행 결과 */}
        {reprocessResult && (
          <div style={{ marginTop:12, padding:10, borderRadius:6,
            background: reprocessResult.error ? '#3f0f0f40' : '#052e1640',
            border: `1px solid ${reprocessResult.error ? '#f43f5e30' : '#22c55e30'}` }}>
            {reprocessResult.error ? (
              <div style={{ fontSize:12, color:'#f87171' }}>❌ {reprocessResult.error}</div>
            ) : (
              <div style={{ fontSize:12 }}>
                <div style={{ fontWeight:700, color:'#4ade80', marginBottom:6 }}>
                  ✅ 처리 완료 — {reprocessResult.done}/{reprocessResult.processed}건 성공
                  {reprocessResult.failed > 0 && <span style={{ color:'#fbbf24', marginLeft:8 }}>⚠ 실패 {reprocessResult.failed}건</span>}
                </div>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap', color:'var(--t3)' }}>
                  <span>남은 기사: <strong style={{ color:'#93c5fd' }}>{(reprocessResult.remaining ?? '—').toLocaleString()}</strong></span>
                  <span>다음 offset: <code style={{ color:'#93C5FD', fontSize:11 }}>{reprocessResult.next_offset}</code></span>
                  <span>엔진: <code style={{ color:'#a78bfa', fontSize:11 }}>{reprocessResult.engine}</code></span>
                </div>
                {reprocessResult.errors?.length > 0 && (
                  <details style={{ marginTop:6 }}>
                    <summary style={{ fontSize:10, color:'var(--t3)', cursor:'pointer' }}>오류 상세</summary>
                    <pre style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#f87171',
                      maxHeight:80, overflowY:'auto', margin:'4px 0 0' }}>
                      {reprocessResult.errors.join('\n')}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* ── 직원채팅 DB 초기화 패널 ─────────────────────────────── */}
      <Panel style={{ marginBottom:20, border: dbSetupResult?.ok === false ? '1px solid #F43F5E40' : '1px solid rgba(99,102,241,0.3)' }}>
        <SectionHeader icon={Database} label="직원채팅 DB 초기화" color="#818CF8"/>
        <div style={{ fontSize:12, color:'var(--t3)', marginBottom:12 }}>
          <code style={{ color:'#93C5FD', background:'#0f172a', padding:'2px 6px', borderRadius:4 }}>staff_chat_messages</code> 테이블이 없으면 직원 채팅이 동작하지 않습니다.
          자동 생성 실패 시 아래 SQL을 Supabase SQL Editor에서 직접 실행하세요.
        </div>

        {/* SQL 항상 표시 (클릭 한 번으로 복사 가능) */}
        <details style={{ marginBottom:10 }}>
          <summary style={{ fontSize:11, color:'#a78bfa', cursor:'pointer', userSelect:'none' }}>
            📋 테이블 생성 SQL 보기 / 복사
          </summary>
          <pre style={{
            fontFamily:'var(--f-mono)', fontSize:10, color:'#94a3b8',
            background:'#0a0a14', border:'1px solid #334155', borderRadius:4,
            padding:'8px 10px', whiteSpace:'pre-wrap', maxHeight:200, overflowY:'auto',
            userSelect:'all', cursor:'text', margin:'6px 0 0'
          }}>{`CREATE TABLE IF NOT EXISTS public.staff_chat_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room          text        NOT NULL DEFAULT 'general',
  sender_key    text        NOT NULL,
  sender_name   text        NOT NULL,
  sender_emoji  text,
  sender_color  text,
  sender_team   text,
  message       text        NOT NULL CHECK (char_length(message) <= 2000),
  msg_type      text        NOT NULL DEFAULT 'chat',
  reply_to      uuid        REFERENCES public.staff_chat_messages(id) ON DELETE SET NULL,
  is_deleted    boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scm_room_time ON public.staff_chat_messages(room, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scm_sender ON public.staff_chat_messages(sender_key);
ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scm_service_all ON public.staff_chat_messages;
CREATE POLICY scm_service_all ON public.staff_chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS scm_admin_all ON public.staff_chat_messages;
CREATE POLICY scm_admin_all ON public.staff_chat_messages FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);`}</pre>
          <div style={{ display:'flex', gap:8, marginTop:6 }}>
            <button
              onClick={() => {
                const sql = `CREATE TABLE IF NOT EXISTS public.staff_chat_messages (\n  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),\n  room          text        NOT NULL DEFAULT 'general',\n  sender_key    text        NOT NULL,\n  sender_name   text        NOT NULL,\n  sender_emoji  text,\n  sender_color  text,\n  sender_team   text,\n  message       text        NOT NULL CHECK (char_length(message) <= 2000),\n  msg_type      text        NOT NULL DEFAULT 'chat',\n  reply_to      uuid        REFERENCES public.staff_chat_messages(id) ON DELETE SET NULL,\n  is_deleted    boolean     NOT NULL DEFAULT false,\n  created_at    timestamptz NOT NULL DEFAULT now()\n);\nCREATE INDEX IF NOT EXISTS idx_scm_room_time ON public.staff_chat_messages(room, created_at DESC);\nCREATE INDEX IF NOT EXISTS idx_scm_sender ON public.staff_chat_messages(sender_key);\nALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS scm_service_all ON public.staff_chat_messages;\nCREATE POLICY scm_service_all ON public.staff_chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true);\nDROP POLICY IF EXISTS scm_admin_all ON public.staff_chat_messages;\nCREATE POLICY scm_admin_all ON public.staff_chat_messages FOR ALL USING (\n  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')\n);`
                navigator.clipboard?.writeText(sql).then(()=>alert('복사 완료! Supabase SQL Editor에 붙여넣기하세요.'))
              }}
              className="btn btn-ghost btn-sm" style={{ fontSize:10, gap:4 }}>
              📋 SQL 복사
            </button>
            <a href="https://supabase.com/dashboard/project/itcbantrpkjpkfhnriom/sql/new"
              target="_blank" rel="noopener noreferrer"
              className="btn btn-ghost btn-sm" style={{ fontSize:10, gap:4 }}>
              🔗 SQL Editor 열기
            </a>
          </div>
        </details>

        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={runDbSetup} disabled={dbSetupRunning} className="btn btn-primary btn-sm"
            style={{ gap:5, background:'linear-gradient(135deg,#4F46E5,#818CF8)' }}>
            {dbSetupRunning
              ? <><Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> 초기화 중…</>
              : <><Database size={12}/> 테이블 자동 생성</>}
          </button>
          <a href="https://supabase.com/dashboard/project/itcbantrpkjpkfhnriom/sql/new"
            target="_blank" rel="noopener noreferrer"
            className="btn btn-ghost btn-sm" style={{ gap:5, fontSize:11 }}>
            <Globe size={11}/> SQL Editor 바로가기
          </a>
        </div>
        {dbSetupResult && (
          <div style={{ marginTop:12, padding:10, borderRadius:6,
            background: dbSetupResult.ok ? '#052e1640' : '#3f0f0f40',
            border: `1px solid ${dbSetupResult.ok ? '#22c55e30' : '#f43f5e30'}` }}>
            <div style={{ fontSize:12, fontWeight:600, color: dbSetupResult.ok ? '#4ade80' : '#f87171', marginBottom:6 }}>
              {dbSetupResult.message || (dbSetupResult.ok ? '✅ 성공' : '❌ 실패')}
            </div>
            {/* exec_sql RPC 없을 때 — rpc_result 디버그 정보 */}
            {!dbSetupResult.ok && dbSetupResult.rpc_result && (
              <div style={{ fontSize:10, color:'#94a3b8', marginBottom:6 }}>
                RPC 실패 이유: <code style={{ color:'#fbbf24' }}>{dbSetupResult.rpc_result.reason?.slice(0, 120)}</code>
              </div>
            )}
            {!dbSetupResult.ok && (
              <div style={{ fontSize:11, color:'#F59E0B', marginTop:4 }}>
                ⬆ 위 "테이블 생성 SQL 보기"를 열어 SQL을 복사한 뒤 SQL Editor에서 실행하세요.
              </div>
            )}
            {dbSetupResult.stmt_results && (
              <details style={{ marginTop:8 }}>
                <summary style={{ fontSize:10, color:'var(--t3)', cursor:'pointer' }}>실행 상세 결과 보기</summary>
                <pre style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t3)',
                  maxHeight:120, overflowY:'auto', margin:'4px 0 0' }}>
                  {JSON.stringify(dbSetupResult.stmt_results, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </Panel>

      {/* 뉴스레터 테스트 발송 패널 */}
      <Panel style={{ marginBottom:20 }}>
        <SectionHeader icon={Send} label="뉴스레터 테스트 발송" color="#F472B6"/>
        <div style={{ fontSize:12, color:'var(--t3)', marginBottom:10 }}>
          특정 이메일로 테스트 뉴스레터를 발송합니다. 실제 구독자 목록에는 영향 없음.
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <input value={nlTestEmail} onChange={e=>setNlTestEmail(e.target.value)}
            placeholder="test@example.com" className="input" style={{ flex:1, fontSize:13 }}
            onKeyDown={e=>e.key==='Enter'&&sendNewsletterTest()}/>
          <button onClick={sendNewsletterTest} disabled={nlSending||!nlTestEmail.trim()}
            className="btn btn-primary btn-sm" style={{ gap:5, whiteSpace:'nowrap' }}>
            {nlSending ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> : <Send size={12}/>}
            {nlSending ? '발송 중…' : '테스트 발송'}
          </button>
        </div>
        {nlResult && <Msg msg={nlResult}/>}
      </Panel>

      <SectionHeader icon={Terminal} label="CRON JOBS — 수동 실행" color="#60A5FA"/>
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:20 }}>
        {CRONS.map(({ label, path, color }) => (
          <button key={path} onClick={() => runCron(path, label)}
            disabled={!!runningCron} className="btn btn-ghost btn-sm"
            style={{ display:'flex', alignItems:'center', gap:6,
              borderColor: runningCron===label ? color+'50' : undefined,
              color: runningCron===label ? color : undefined }}>
            {runningCron === label
              ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/>
              : <RefreshCw size={12}/>}
            {runningCron === label ? `${label} 실행 중…` : label}
          </button>
        ))}
      </div>

      {cronResult && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, padding:14,
          fontFamily:'var(--f-mono)', fontSize:12, color:'var(--t1)', whiteSpace:'pre-wrap',
          maxHeight:300, overflowY:'auto', marginBottom:20 }}>
          {cronResult}
        </div>
      )}

      <SectionHeader icon={Database} label="플랫폼 통계" color="#A855F7"/>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
        {[
          { label:'총 아티클',   value: stats?.articles,       icon:FileText,     color:'#3B82F6' },
          { label:'수집 뉴스',   value: stats?.news,           icon:Newspaper,    color:'#22C55E' },
          { label:'구독자',      value: stats?.subscribers,    icon:Users,        color:'#F59E0B' },
          { label:'커뮤니티 글', value: stats?.posts,          icon:MessageSquare,color:'#A855F7' },
          { label:'신고 대기',   value: stats?.pendingReports, icon:Flag,         color:'#F43F5E' },
          { label:'총 유저',     value: stats?.totalUsers,     icon:Users,        color:'#60A5FA' },
          { label:'AI 직원',     value: stats?.aiAccounts,     icon:Bot,          color:'#818CF8' },
          { label:'워크로그',    value: stats?.workLogs,       icon:Activity,     color:'#34D399' },
        ].map((s,i) => <StatCard key={i} {...s}/>)}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 직원 채팅 탭 (Admin Panel 내 풀스크린 채팅)
// ══════════════════════════════════════════════════════════════════════

function StaffChatTab() {
  const { profile } = useAuthStore()
  const [room, setRoom]             = useState('general')
  const [messages, setMessages]     = useState([])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [sending, setSending]       = useState(false)
  const [aiTyping, setAiTyping]     = useState(false)
  const [topic, setTopic]           = useState('')
  const [triggering, setTriggering] = useState(false)
  const [msg, setMsg]               = useState('')

  const bottomRef       = useRef(null)
  const msgListRef      = useRef(null)
  const prevMsgLen      = useRef(0)
  const roomRef         = useRef('general')
  const fetchingRef     = useRef(false)   // ★ 단일 잠금
  const fetchTokenRef   = useRef(0)       // ★ 방 전환 시 증가
  const pollTimerRef    = useRef(null)    // setTimeout 체인
  const aiTimerRef      = useRef(null)    // aiTyping 자동 해제

  // ── fetchMsgs v7 ──────────────────────────────────────────────────
  // silent=true  → fetchingRef 잠금 없이 실행 (폴링/AI응답후)
  // silent=false → 잠금 확인 (방전환/초기로드)
  // reset=true   → 빈배열도 그대로 적용 (방전환)
  const fetchMsgs = useCallback(async (silent = false, reset = false) => {
    if (!silent && fetchingRef.current) return
    if (!silent) { fetchingRef.current = true; setLoading(true) }

    const tokenSnap = fetchTokenRef.current
    const roomSnap  = roomRef.current

    try {
      let r
      try { r = await fetch('/api/staff-chat?room=' + roomSnap + '&limit=80') }
      catch (_) { return }

      // 방 전환됐거나 토큰이 증가했으면 무효
      if (tokenSnap !== fetchTokenRef.current) return
      if (roomSnap  !== roomRef.current)       return
      if (!r.ok) return

      let d
      try { d = await r.json() } catch (_) { return }

      // json() 완료 후 재확인
      if (tokenSnap !== fetchTokenRef.current) return
      if (roomSnap  !== roomRef.current)       return

      if (Array.isArray(d.messages)) {
        setMessages(prev => {
          // reset=false: 빈배열이면 기존 유지 (일시 서버 오류 방어)
          // reset=true : 빈배열도 적용 (새 방에 메시지 없을 수 있음)
          if (!reset && d.messages.length === 0 && prev.length > 0) return prev
          return d.messages
        })
      }
    } finally {
      if (!silent) { fetchingRef.current = false; setLoading(false) }
    }
  }, [])

  // ── 방 전환 ─────────────────────────────────────────────────────
  const changeRoom = useCallback((newRoom) => {
    if (newRoom === roomRef.current) return
    // ★ 토큰 증가 → 진행 중인 모든 이전 fetch 무효화
    fetchTokenRef.current += 1
    fetchingRef.current = false   // 이전 non-silent 잠금 강제 해제
    roomRef.current = newRoom
    setRoom(newRoom)
    setMessages([])
    prevMsgLen.current = 0
    setLoading(false)

    // 폴링 타이머 리셋
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)

    // 즉시 새 방 로드
    fetchMsgs(false, true)
  }, [fetchMsgs])

  // ── 최초 로드 ──────────────────────────────────────────────────
  useEffect(() => {
    fetchTokenRef.current += 1
    fetchMsgs(false, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 폴링: setTimeout 체인 (누적 방지) ─────────────────────────
  useEffect(() => {
    const scheduleNext = () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      pollTimerRef.current = setTimeout(async () => {
        await fetchMsgs(true, false)
        scheduleNext()
      }, 5000)
    }
    scheduleNext()
    return () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current) }
  }, [fetchMsgs])

  // ── 자동 스크롤 ────────────────────────────────────────────────
  useEffect(() => {
    const newLen = messages.length
    if (newLen === 0) return
    const container = msgListRef.current
    const nearBottom = !container ||
      container.scrollHeight - container.scrollTop - container.clientHeight < 80
    if (newLen > prevMsgLen.current && nearBottom) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    }
    prevMsgLen.current = newLen
  }, [messages])

  // ── 메시지 전송 v7 ────────────────────────────────────────────
  const sendMsg = async () => {
    if (!input.trim() || sending) return
    const msgText  = input.trim()
    const sendRoom = roomRef.current
    const tokenSnap = fetchTokenRef.current
    setSending(true)
    setInput('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const auth = session?.access_token
        ? { Authorization: 'Bearer ' + session.access_token } : {}

      // 1) 저장
      let postOk = false
      try {
        const res = await fetch('/api/staff-chat?room=' + sendRoom, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({
            sender_key:   profile?.username || 'admin',
            sender_name:  profile?.display_name || '관리자',
            sender_emoji: '👤',
            sender_color: '#60A5FA',
            sender_team:  '관리자',
            message:      msgText,
            msg_type:     'admin_message',
          }),
        })
        postOk = res.ok
      } catch (_) {}

      // silent=true → fetchingRef 잠금 없이 즉시 반영
      if (postOk) {
        await fetchMsgs(true, false)
      }

      // 2) AI 자동 반응 (fire-and-forget)
      setAiTyping(true)
      clearTimeout(aiTimerRef.current)
      aiTimerRef.current = setTimeout(() => setAiTyping(false), 25000)

      fetch('/api/staff-chat-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ action: 'admin_message', room: sendRoom, message: msgText }),
      })
        .then(r => r.ok ? r.json().catch(() => ({})) : {})
        .then(() => {
          clearTimeout(aiTimerRef.current)
          setAiTyping(false)
          // AI 응답 완료 직후 + 3.5초 후 조회 (silent → 잠금 없음)
          fetchMsgs(true, false)
          setTimeout(() => {
            if (tokenSnap === fetchTokenRef.current) fetchMsgs(true, false)
          }, 3500)
        })
        .catch(() => {
          clearTimeout(aiTimerRef.current)
          setAiTyping(false)
        })

    } catch (_) {}
    setSending(false)
  }

  // ── AI 토론 트리거 ────────────────────────────────────────────
  const triggerDiscussion = async () => {
    if (!topic.trim() || triggering) return
    setTriggering(true)
    setMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/staff-chat?room=' + roomRef.current, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (session?.access_token || ''),
        },
        body: JSON.stringify({
          action: 'ai_discuss',
          topic: topic.trim(),
          participants: ['MAX','ARIA','NOVA','PULSE','HANA'],
        }),
      })
      if (!r.ok) { setMsg('❌ 서버 오류'); return }
      let d
      try { d = await r.json() } catch { setMsg('❌ 응답 파싱 오류'); return }
      if (d.ok) {
        setMsg('✅ AI 직원 ' + d.created + '명 토론 생성 완료')
        setTopic('')
        setTimeout(() => fetchMsgs(true, false), 1000)
        setTimeout(() => fetchMsgs(true, false), 4000)
      } else {
        setMsg('❌ ' + (d.error || '실패'))
      }
    } catch (e) { setMsg('❌ ' + e.message) }
    setTriggering(false)
  }

  const currentRoom = CHAT_ROOMS.find(r => r.id === room)

  const MSG_TYPE_MAP = {
    task_directive:   { label:'업무지시', color:'#F59E0B' },
    ai_auto:          { label:'AI 자동',  color:'#818CF8' },
    feedback_handled: { label:'피드백',   color:'#34D399' },
    notice:           { label:'공지',     color:'#F43F5E' },
    admin_message:    { label:'관리자',   color:'#60A5FA' },
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:16, minHeight:600 }}>
      <Panel style={{ display:'flex', flexDirection:'column', padding:0, overflow:'hidden', minHeight:560 }}>
        <div style={{ background:'linear-gradient(135deg,#1e3a5f,#1a1a2e)', padding:'12px 16px',
          borderBottom:'1px solid rgba(96,165,250,0.2)', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <MessageCircle size={14} color="#60A5FA"/>
          <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'#93C5FD', letterSpacing:'2px', fontWeight:700 }}>
            STAFF ROOM
          </span>
          <span style={{ color: currentRoom?.color, fontSize:13 }}>{currentRoom?.emoji} {currentRoom?.label}</span>
          {aiTyping && (
            <span style={{ fontSize:10, color:'#818CF8', fontFamily:'var(--f-mono)', animation:'pulse 1s infinite' }}>
              ✦ AI 응답 중…
            </span>
          )}
          <button
            onClick={() => { fetchTokenRef.current += 1; fetchingRef.current = false; fetchMsgs(false, true) }}
            style={{ marginLeft:'auto', background:'none', border:'none', color:'#444', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
            <RefreshCw size={12}/><span style={{ fontFamily:'var(--f-mono)', fontSize:9 }}>새로고침</span>
          </button>
        </div>

        <div style={{ display:'flex', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)', flexShrink:0 }}>
          {CHAT_ROOMS.map(cr => (
            <button key={cr.id} onClick={() => changeRoom(cr.id)}
              style={{ flex:1, background:'none', border:'none',
                borderBottom: room===cr.id ? `2px solid ${cr.color}` : '2px solid transparent',
                color: room===cr.id ? cr.color : '#555', padding:'8px 6px', cursor:'pointer',
                fontFamily:'var(--f-mono)', fontSize:9, letterSpacing:'0.5px',
                display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
              <span style={{ fontSize:14 }}>{cr.emoji}</span>
              <span>{cr.label}</span>
            </button>
          ))}
        </div>

        <div ref={msgListRef} style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
          {loading && messages.length === 0 && (
            <div style={{ textAlign:'center', color:'#444', fontFamily:'var(--f-mono)', fontSize:11, padding:20 }}>로딩 중…</div>
          )}
          {!loading && messages.length === 0 && (
            <div style={{ textAlign:'center', color:'#333', fontFamily:'var(--f-mono)', fontSize:11, padding:40 }}>
              <MessageCircle size={24} color="#333" style={{ marginBottom:8 }}/><br/>
              아직 메시지가 없습니다<br/>
              <span style={{ fontSize:10, color:'#444' }}>오른쪽에서 AI 토론을 시작하거나 직접 입력하세요</span>
            </div>
          )}
          {messages.map(m => {
            const typeMeta = MSG_TYPE_MAP[m.msg_type]
            const color = staffColor(m.sender_key)
            return (
              <div key={m.id} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0,
                  background:`${color}15`, border:`1px solid ${color}30`,
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>
                  {m.sender_emoji || '👤'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, flexWrap:'wrap' }}>
                    <span style={{ fontFamily:'var(--f-mono)', fontSize:12, fontWeight:700, color }}>{m.sender_name}</span>
                    <span style={{ fontSize:10, color:'#444', fontFamily:'var(--f-mono)' }}>{m.sender_team}</span>
                    {typeMeta && (
                      <span style={{ fontSize:9, background:`${typeMeta.color}20`, color:typeMeta.color,
                        border:`1px solid ${typeMeta.color}40`, borderRadius:3, padding:'1px 5px', fontFamily:'var(--f-mono)' }}>
                        {typeMeta.label}
                      </span>
                    )}
                    <span style={{ marginLeft:'auto', fontSize:9, color:'#333', fontFamily:'var(--f-mono)' }}>{fmtTime(m.created_at)}</span>
                  </div>
                  <div style={{ fontSize:12, color:'#C0C0C0', lineHeight:1.6,
                    background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'8px 12px',
                    borderLeft:`2px solid ${color}25`, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                    {m.message}
                  </div>
                </div>
              </div>
            )
          })}
          {aiTyping && (
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(129,140,248,0.15)',
                border:'1px solid rgba(129,140,248,0.3)',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>⚙️</div>
              <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'8px 12px',
                borderLeft:'2px solid rgba(129,140,248,0.3)', display:'flex', gap:4, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#818CF8', fontFamily:'var(--f-mono)' }}>직원이 작성 중</span>
                {[0,1,2].map(i => (
                  <span key={i} style={{ width:4, height:4, borderRadius:'50%', background:'#818CF8',
                    animation:`typingBounce 1.2s ${i*0.2}s ease-in-out infinite` }}/>
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', padding:'10px 12px',
          display:'flex', gap:8, flexShrink:0, background:'rgba(255,255,255,0.02)' }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg()} }}
            placeholder="메시지 입력… (Enter 전송, Shift+Enter 줄바꿈)" rows={2}
            style={{ flex:1, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:8, color:'#E0E0E0', fontSize:12, padding:'8px 12px', resize:'none', outline:'none',
              fontFamily:'inherit', lineHeight:1.5 }}/>
          <button onClick={sendMsg} disabled={sending || !input.trim()}
            style={{ background: sending||!input.trim() ? '#1a1a2e' : 'linear-gradient(135deg,#3B82F6,#818CF8)',
              border:'none', borderRadius:8, padding:'0 14px',
              color: sending||!input.trim() ? '#444' : '#fff',
              cursor: sending||!input.trim() ? 'not-allowed' : 'pointer', fontSize:18, flexShrink:0 }}>
            {sending ? <Loader size={14} style={{ animation:'spin 1s linear infinite' }}/> : <Send size={14}/>}
          </button>
        </div>
      </Panel>

      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <Panel>
          <SectionHeader icon={Bot} label="AI 직원 토론 생성" color="#818CF8"/>
          <p style={{ fontSize:11, color:'var(--t3)', marginBottom:12, lineHeight:1.5 }}>
            주제를 입력하면 AI 직원들이 자동으로 채팅방에서 토론합니다.
          </p>
          <textarea value={topic} onChange={e => setTopic(e.target.value)}
            placeholder="예: 이번 주 피드백 처리 방향에 대해 논의해주세요" rows={3}
            style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:8, color:'var(--t1)', fontSize:12, padding:'8px 12px', resize:'none', outline:'none',
              fontFamily:'inherit', boxSizing:'border-box', marginBottom:8 }}/>
          <button onClick={triggerDiscussion} disabled={triggering || !topic.trim()}
            className="btn btn-primary btn-sm" style={{ width:'100%', gap:6, justifyContent:'center' }}>
            {triggering
              ? <><Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> 생성 중…</>
              : <><Bot size={12}/> AI 토론 시작</>}
          </button>
          <Msg msg={msg}/>
        </Panel>

        <Panel>
          <SectionHeader icon={MessageCircle} label="채팅방 안내" color="#60A5FA"/>
          {CHAT_ROOMS.map(cr => (
            <div key={cr.id} onClick={() => changeRoom(cr.id)}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0',
                borderBottom:'1px solid rgba(255,255,255,0.04)', cursor:'pointer',
                opacity: room===cr.id ? 1 : 0.6 }}>
              <span style={{ fontSize:16 }}>{cr.emoji}</span>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color: room===cr.id ? cr.color : 'var(--t2)' }}>{cr.label}</div>
              </div>
              {room===cr.id && <div style={{ marginLeft:'auto', width:6, height:6, borderRadius:'50%', background:cr.color }}/>}
            </div>
          ))}
        </Panel>

        <Panel>
          <SectionHeader icon={Terminal} label="빠른 업무 지시" color="#F59E0B"/>
          {[
            { label:'피드백 검토 지시',          msg:'📋 전팀 공지: 오늘 들어온 유저 피드백을 각 팀별로 검토하고 개선 사항을 ops 채널에 보고해주세요.', room:'ops' },
            { label:'주간 전략 브리핑',           msg:'🎯 이번 주 플랫폼 전략 방향을 논의합니다. 각 팀 선임 매니저분들 의견 부탁드립니다.', room:'strategy' },
            { label:'피드백 처리 완료 보고 요청', msg:'📥 피드백 채널: 오늘 수신된 피드백 처리 현황을 공유해주세요.', room:'feedback' },
            { label:'전체 공지: 이번 주 목표 공유',msg:'📢 전팀 공지: 이번 주 각 팀별 목표와 우선순위를 general 채널에 공유해주세요.', room:'general' },
          ].map(item => (
            <button key={item.label} onClick={async () => {
              const { data: { session } } = await supabase.auth.getSession()
              const auth = session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}
              let postOk = false
              try {
                const res = await fetch('/api/staff-chat?room=' + item.room, {
                  method:'POST', headers:{'Content-Type':'application/json', ...auth},
                  body: JSON.stringify({ sender_key:'ai_max', sender_name:'MAX', sender_emoji:'🏛️',
                    sender_color:'#F87171', sender_team:'관리팀', message:item.msg, msg_type:'task_directive' }),
                })
                postOk = res.ok
              } catch (_) {}
              changeRoom(item.room)
              if (postOk) {
                const tokenSnap = fetchTokenRef.current
                setAiTyping(true)
                clearTimeout(aiTimerRef.current)
                aiTimerRef.current = setTimeout(() => setAiTyping(false), 25000)
                fetch('/api/staff-chat-auto', {
                  method:'POST', headers:{'Content-Type':'application/json', ...auth},
                  body: JSON.stringify({ action:'admin_message', room: item.room, message: item.msg }),
                })
                  .then(r => r.ok ? r.json().catch(() => ({})) : {})
                  .then(() => {
                    clearTimeout(aiTimerRef.current); setAiTyping(false)
                    fetchMsgs(true, false)
                    setTimeout(() => {
                      if (tokenSnap === fetchTokenRef.current) fetchMsgs(true, false)
                    }, 3500)
                  })
                  .catch(() => { clearTimeout(aiTimerRef.current); setAiTyping(false) })
              }
            }}
              style={{ width:'100%', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)',
                borderRadius:6, padding:'7px 10px', color:'var(--t2)', fontSize:11, cursor:'pointer',
                textAlign:'left', marginBottom:4, display:'flex', alignItems:'center', gap:6 }}>
              <Terminal size={10} color="#F59E0B"/> {item.label}
            </button>
          ))}
        </Panel>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 피드백 관리 탭
// ══════════════════════════════════════════════════════════════════════

function FeedbackManageTab() {
  const [feedbacks, setFeedbacks] = useState([])
  const [loading, setLoading]    = useState(false)
  const [processing, setProcessing] = useState(false)
  const [msg, setMsg]            = useState('')
  const [result, setResult]      = useState(null)

  const loadFeedbacks = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/feedback-reply')
      const d = await r.json()
      if (d.feedbacks) setFeedbacks(d.feedbacks)
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => { loadFeedbacks() }, [])

  const processAll = async () => {
    setProcessing(true); setMsg(''); setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/feedback-reply', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session?.access_token||''}` },
        body: JSON.stringify({ action:'process_all' }),
      })
      const d = await r.json()
      if (d.ok) {
        setMsg(`✅ ${d.summary?.replied || 0}건 답변 완료 (실패 ${d.summary?.failed || 0}건)`)
        setResult(d.summary)
        await loadFeedbacks()
      } else setMsg(`❌ ${d.error || '처리 실패'}`)
    } catch (e) { setMsg(`❌ ${e.message}`) }
    setProcessing(false)
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:16 }}>
      <div>
        <Panel style={{ marginBottom:16 }}>
          <SectionHeader icon={Inbox} label="미답변 피드백 게시물" color="#34D399">
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={loadFeedbacks} className="btn btn-ghost btn-sm" style={{ gap:4 }}>
                <RefreshCw size={11}/> 새로고침
              </button>
              <button onClick={processAll} disabled={processing} className="btn btn-primary btn-sm" style={{ gap:4 }}>
                {processing ? <Loader size={11} style={{ animation:'spin 1s linear infinite' }}/> : <Bot size={11}/>}
                {processing ? '처리 중…' : 'AI 일괄 답변'}
              </button>
            </div>
          </SectionHeader>
          <Msg msg={msg}/>
          {result && (
            <div style={{ display:'flex', gap:10, marginBottom:12 }}>
              {[
                { label:'총 처리', value:result.total, color:'#60A5FA' },
                { label:'답변 완료', value:result.replied, color:'#34D399' },
                { label:'실패', value:result.failed, color:'#F43F5E' },
              ].map(s => (
                <div key={s.label} style={{ flex:1, background:`${s.color}10`, border:`1px solid ${s.color}25`,
                  borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                  <div style={{ fontFamily:'var(--f-mono)', fontSize:18, fontWeight:700, color:s.color }}>{s.value}</div>
                  <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t3)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
          {loading && <div style={{ textAlign:'center', color:'#444', padding:20, fontFamily:'var(--f-mono)', fontSize:11 }}>로딩 중…</div>}
          {!loading && feedbacks.length === 0 && (
            <div style={{ textAlign:'center', color:'#444', padding:30, fontFamily:'var(--f-mono)', fontSize:11 }}>
              <CheckCircle size={24} color="#34D399" style={{ marginBottom:8 }}/><br/>
              미답변 피드백이 없습니다
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {feedbacks.map(fb => (
              <div key={fb.id} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)',
                borderRadius:8, padding:'12px 14px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:6 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--t1)', marginBottom:4 }}>{fb.title}</div>
                    <div style={{ fontSize:11, color:'var(--t3)', lineHeight:1.5 }}>{fb.preview}</div>
                  </div>
                  <div style={{ fontSize:10, color:'#34D399', fontFamily:'var(--f-mono)', flexShrink:0 }}>
                    → {fb.assigned}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                  {(fb.tags || []).map(t => (
                    <span key={t} style={{ fontSize:9, background:'rgba(96,165,250,0.1)', color:'#60A5FA',
                      border:'1px solid rgba(96,165,250,0.2)', borderRadius:3, padding:'1px 5px', fontFamily:'var(--f-mono)' }}>
                      {t}
                    </span>
                  ))}
                  <span style={{ marginLeft:'auto', fontSize:10, color:'#444', fontFamily:'var(--f-mono)' }}>
                    {fb.created_at ? new Date(fb.created_at).toLocaleDateString('ko-KR') : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* 오른쪽 안내 */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <Panel>
          <SectionHeader icon={Bot} label="자동 답변 시스템" color="#818CF8"/>
          <p style={{ fontSize:11, color:'var(--t3)', lineHeight:1.7, marginBottom:12 }}>
            피드백 내용을 분석해 적합한 AI 직원이 자동으로 댓글을 달고, staff 채팅방의 피드백 채널에 공유됩니다.
          </p>
          {[
            { team:'운영팀 ARIA', emoji:'⚙️', triggers:'운영, 버그, 오류, 속도', color:'#818CF8' },
            { team:'커뮤니티 HANA', emoji:'🤝', triggers:'커뮤니티, 댓글, 분위기', color:'#FBBF24' },
            { team:'관리팀 MAX', emoji:'🏛️', triggers:'정책, 개선, 제안, 요청', color:'#F87171' },
            { team:'기술팀 LEARN', emoji:'🔬', triggers:'기능, 개발, 앱, 검색', color:'#A78BFA' },
          ].map(r => (
            <div key={r.team} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:10 }}>
              <span style={{ fontSize:16 }}>{r.emoji}</span>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:r.color }}>{r.team}</div>
                <div style={{ fontSize:10, color:'#555' }}>{r.triggers}</div>
              </div>
            </div>
          ))}
        </Panel>
        <Panel>
          <SectionHeader icon={Activity} label="처리 흐름" color="#34D399"/>
          {['피드백 게시물 감지 (태그: 피드백/건의/제안)', 'AI 직원 자동 배정', 'Gemini 답변 생성', '댓글 자동 등록', 'staff-chat 피드백 채널 공유', '업무지시(ops) 채널 요약 보고'].map((step, i) => (
            <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:7 }}>
              <div style={{ width:18, height:18, borderRadius:'50%', background:'rgba(52,211,153,0.15)',
                border:'1px solid rgba(52,211,153,0.3)', display:'flex', alignItems:'center',
                justifyContent:'center', fontSize:9, fontFamily:'var(--f-mono)', color:'#34D399', flexShrink:0 }}>
                {i+1}
              </div>
              <div style={{ fontSize:11, color:'var(--t3)' }}>{step}</div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 개발팀 권한 관리 탭
// ══════════════════════════════════════════════════════════════════════

const PERM_META = {
  github_read:    { label: 'GitHub 읽기',       emoji: '👁️',  tier: 1, color: '#60A5FA' },
  github_write:   { label: 'GitHub 쓰기',       emoji: '✏️',  tier: 2, color: '#34D399' },
  supabase_read:  { label: 'Supabase 읽기',     emoji: '🔍',  tier: 1, color: '#A78BFA' },
  supabase_write: { label: 'Supabase 쓰기',     emoji: '📝',  tier: 2, color: '#F59E0B' },
  supabase_admin: { label: 'Supabase 관리자',   emoji: '🔑',  tier: 4, color: '#F87171' },
  deploy_preview: { label: 'Preview 배포',      emoji: '🚀',  tier: 2, color: '#38BDF8' },
  deploy_prod:    { label: '프로덕션 배포',     emoji: '🏭',  tier: 5, color: '#F43F5E' },
}

function DevPermissionsTab() {
  const [byUser,   setByUser]   = useState({})
  const [loading,  setLoading]  = useState(false)
  const [working,  setWorking]  = useState(false)
  const [msg,      setMsg]      = useState('')
  const [selUser,  setSelUser]  = useState('')
  const [selPerm,  setSelPerm]  = useState('github_read')
  const [note,     setNote]     = useState('')
  const [masterKey, setMasterKey] = useState('')
  const [logs,     setLogs]     = useState([])
  const [showLogs, setShowLogs] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const r = await fetch('/api/dev-permissions', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json()
      if (d.ok) setByUser(d.by_user || {})
      else setMsg('❌ ' + (d.error || '로드 실패'))
    } catch (e) { setMsg('❌ ' + e.message) }
    setLoading(false)
  }

  const loadLogs = async () => {
    try {
      const { data: rows } = await supabase
        .from('dev_permission_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      setLogs(rows || [])
      setShowLogs(true)
    } catch (e) { setMsg('❌ 로그 로드 실패') }
  }

  const grant = async () => {
    if (!selUser.trim() || !selPerm) { setMsg('⚠️ 유저명과 권한을 선택하세요'); return }
    setWorking(true); setMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const r = await fetch('/api/dev-permissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(masterKey ? { 'X-Dev-Master-Key': masterKey } : {}),
        },
        body: JSON.stringify({ action: 'grant', username: selUser.trim(), permission: selPerm, note }),
      })
      const d = await r.json()
      if (d.ok) { setMsg(`✅ ${selUser}에게 [${PERM_META[selPerm]?.label}] 권한 부여 완료`); load() }
      else setMsg('❌ ' + (d.error || '권한 부여 실패'))
    } catch (e) { setMsg('❌ ' + e.message) }
    setWorking(false)
  }

  const grantTechPreset = async () => {
    if (!selUser.trim()) { setMsg('⚠️ 유저명을 입력하세요'); return }
    if (!masterKey) { setMsg('⚠️ 기술팀 프리셋은 마스터 키 필요'); return }
    setWorking(true); setMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const r = await fetch('/api/dev-permissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Dev-Master-Key': masterKey,
        },
        body: JSON.stringify({ action: 'grant_tech_preset', username: selUser.trim() }),
      })
      const d = await r.json()
      if (d.ok) { setMsg(`✅ ${selUser} 기술팀 프리셋 완료 (${d.results?.length || 0}개 권한)`); load() }
      else setMsg('❌ ' + (d.error || '프리셋 실패'))
    } catch (e) { setMsg('❌ ' + e.message) }
    setWorking(false)
  }

  const revoke = async (username, permission) => {
    if (!confirm(`${username}의 [${PERM_META[permission]?.label || permission}] 권한을 취소하시겠습니까?`)) return
    setWorking(true); setMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const r = await fetch(`/api/dev-permissions?username=${encodeURIComponent(username)}&permission=${permission}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(masterKey ? { 'X-Dev-Master-Key': masterKey } : {}),
        },
      })
      const d = await r.json()
      if (d.ok) { setMsg(`✅ ${username}의 [${permission}] 권한 취소 완료`); load() }
      else setMsg('❌ ' + (d.error || '취소 실패'))
    } catch (e) { setMsg('❌ ' + e.message) }
    setWorking(false)
  }

  useEffect(() => { load() }, [])

  const allUsers = Object.keys(byUser)
  const totalPerms = Object.values(byUser).reduce((s, arr) => s + arr.length, 0)

  const tierBadge = (tier) => {
    const colors = { 1:'#60A5FA', 2:'#34D399', 3:'#F59E0B', 4:'#F87171', 5:'#F43F5E' }
    return (
      <span style={{ background: colors[tier] || '#60A5FA', color:'#fff', borderRadius:3,
        padding:'1px 5px', fontSize:9, fontFamily:'var(--f-mono)' }}>
        T{tier}
      </span>
    )
  }

  return (
    <div>
      {/* 헤더 요약 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:24 }}>
        <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10, padding:16, textAlign:'center' }}>
          <div style={{ fontSize:28, fontWeight:700, color:'#60A5FA', fontFamily:'var(--f-mono)' }}>{allUsers.length}</div>
          <div style={{ fontSize:12, color:'var(--t3)', marginTop:4 }}>권한 보유 유저</div>
        </div>
        <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10, padding:16, textAlign:'center' }}>
          <div style={{ fontSize:28, fontWeight:700, color:'#34D399', fontFamily:'var(--f-mono)' }}>{totalPerms}</div>
          <div style={{ fontSize:12, color:'var(--t3)', marginTop:4 }}>활성 권한 수</div>
        </div>
        <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10, padding:16, textAlign:'center' }}>
          <div style={{ fontSize:28, fontWeight:700, color:'#F87171', fontFamily:'var(--f-mono)' }}>
            {Object.values(byUser).flat().filter(p => p.tier >= 4).length}
          </div>
          <div style={{ fontSize:12, color:'var(--t3)', marginTop:4 }}>고급 권한 (T4+)</div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:20, alignItems:'start' }}>
        {/* 왼쪽: 유저별 권한 목록 */}
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <h3 style={{ fontSize:14, fontWeight:600, color:'var(--t1)', margin:0 }}>
              🔐 현재 활성 권한 목록
            </h3>
            <button onClick={load} style={{ background:'none', border:'1px solid var(--b1)', borderRadius:6,
              padding:'4px 10px', fontSize:11, color:'var(--t3)', cursor:'pointer' }}>
              {loading ? '⏳' : '↺ 새로고침'}
            </button>
            <button onClick={loadLogs} style={{ background:'none', border:'1px solid var(--b1)', borderRadius:6,
              padding:'4px 10px', fontSize:11, color:'var(--t3)', cursor:'pointer' }}>
              📋 감사 로그
            </button>
          </div>

          {loading ? (
            <div style={{ color:'var(--t3)', fontSize:13 }}>로딩 중...</div>
          ) : allUsers.length === 0 ? (
            <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10,
              padding:24, textAlign:'center', color:'var(--t3)', fontSize:13 }}>
              현재 활성 권한 없음
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {allUsers.map(username => (
                <div key={username} style={{ background:'var(--bg2)', border:'1px solid var(--b1)',
                  borderRadius:10, padding:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <span style={{ fontSize:16 }}>👤</span>
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--t1)',
                      fontFamily:'var(--f-mono)' }}>{username}</span>
                    <span style={{ background:'rgba(96,165,250,0.1)', color:'#60A5FA', borderRadius:4,
                      padding:'1px 6px', fontSize:10 }}>{byUser[username].length}개 권한</span>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {byUser[username].map(p => {
                      const meta = PERM_META[p.permission] || {}
                      const exp  = new Date(p.expires_at)
                      const hoursLeft = Math.max(0, Math.round((exp - Date.now()) / 3600_000))
                      return (
                        <div key={p.id} style={{ background:'var(--bg3)', border:`1px solid ${meta.color || '#60A5FA'}33`,
                          borderRadius:8, padding:'6px 10px', display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontSize:14 }}>{meta.emoji || '🔒'}</span>
                          <div>
                            <div style={{ fontSize:11, color:'var(--t1)', fontWeight:500 }}>{meta.label || p.permission}</div>
                            <div style={{ fontSize:10, color:'var(--t4)', fontFamily:'var(--f-mono)' }}>
                              {hoursLeft}h 남음 {tierBadge(p.tier)}
                            </div>
                          </div>
                          <button onClick={() => revoke(username, p.permission)}
                            style={{ background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.25)',
                              borderRadius:4, padding:'2px 6px', fontSize:10, color:'#F43F5E', cursor:'pointer',
                              marginLeft:4 }}>
                            취소
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 감사 로그 */}
          {showLogs && logs.length > 0 && (
            <div style={{ marginTop:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <h4 style={{ fontSize:13, color:'var(--t1)', margin:0 }}>📋 권한 변경 감사 로그</h4>
                <button onClick={() => setShowLogs(false)}
                  style={{ background:'none', border:'none', color:'var(--t4)', cursor:'pointer', fontSize:12 }}>✕</button>
              </div>
              <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--b1)', background:'var(--bg3)' }}>
                      <th style={{ padding:'8px 12px', textAlign:'left', color:'var(--t3)' }}>시각</th>
                      <th style={{ padding:'8px 12px', textAlign:'left', color:'var(--t3)' }}>액션</th>
                      <th style={{ padding:'8px 12px', textAlign:'left', color:'var(--t3)' }}>대상</th>
                      <th style={{ padding:'8px 12px', textAlign:'left', color:'var(--t3)' }}>권한</th>
                      <th style={{ padding:'8px 12px', textAlign:'left', color:'var(--t3)' }}>처리자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(l => (
                      <tr key={l.id} style={{ borderBottom:'1px solid var(--b1)' }}>
                        <td style={{ padding:'7px 12px', color:'var(--t4)', fontFamily:'var(--f-mono)' }}>
                          {new Date(l.created_at).toLocaleString('ko-KR')}
                        </td>
                        <td style={{ padding:'7px 12px' }}>
                          <span style={{ color: l.action === 'grant' ? '#34D399' : l.action === 'revoke' ? '#F87171' : '#F59E0B',
                            fontFamily:'var(--f-mono)', fontSize:10 }}>{l.action}</span>
                        </td>
                        <td style={{ padding:'7px 12px', color:'var(--t1)', fontFamily:'var(--f-mono)' }}>{l.target_username}</td>
                        <td style={{ padding:'7px 12px', color:'var(--t2)', fontSize:10 }}>
                          {PERM_META[l.permission]?.label || l.permission}
                        </td>
                        <td style={{ padding:'7px 12px', color:'var(--t3)' }}>{l.granted_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽: 권한 부여 패널 */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10, padding:16 }}>
            <h4 style={{ fontSize:13, fontWeight:600, color:'var(--t1)', margin:'0 0 14px 0' }}>🔑 권한 부여</h4>

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <div style={{ fontSize:11, color:'var(--t3)', marginBottom:4 }}>대상 유저명</div>
                <input value={selUser} onChange={e => setSelUser(e.target.value)}
                  placeholder="username"
                  style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--b1)',
                    borderRadius:6, padding:'7px 10px', color:'var(--t1)', fontSize:12,
                    fontFamily:'var(--f-mono)', boxSizing:'border-box' }}/>
              </div>

              <div>
                <div style={{ fontSize:11, color:'var(--t3)', marginBottom:4 }}>권한 선택</div>
                <select value={selPerm} onChange={e => setSelPerm(e.target.value)}
                  style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--b1)',
                    borderRadius:6, padding:'7px 10px', color:'var(--t1)', fontSize:12 }}>
                  {Object.entries(PERM_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.emoji} {v.label} (T{v.tier})</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize:11, color:'var(--t3)', marginBottom:4 }}>메모 (선택)</div>
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder="부여 사유"
                  style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--b1)',
                    borderRadius:6, padding:'7px 10px', color:'var(--t1)', fontSize:12, boxSizing:'border-box' }}/>
              </div>

              <div>
                <div style={{ fontSize:11, color:'#F87171', marginBottom:4 }}>🔐 마스터 키 (T4+ 필수)</div>
                <input type="password" value={masterKey} onChange={e => setMasterKey(e.target.value)}
                  placeholder="DEV_MASTER_KEY"
                  style={{ width:'100%', background:'var(--bg3)', border:'1px solid rgba(248,113,113,0.3)',
                    borderRadius:6, padding:'7px 10px', color:'var(--t1)', fontSize:12,
                    fontFamily:'var(--f-mono)', boxSizing:'border-box' }}/>
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button onClick={grant} disabled={working}
                  style={{ flex:1, background:'rgba(96,165,250,0.15)', border:'1px solid rgba(96,165,250,0.4)',
                    borderRadius:7, padding:'8px 0', color:'#60A5FA', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                  {working ? '처리 중...' : '✅ 권한 부여'}
                </button>
              </div>

              <button onClick={grantTechPreset} disabled={working}
                style={{ background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.3)',
                  borderRadius:7, padding:'8px 0', color:'#34D399', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                🛠️ 기술팀 프리셋 일괄 부여
              </button>
            </div>
          </div>

          {msg && (
            <div style={{ background: msg.startsWith('✅') ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
              border: `1px solid ${msg.startsWith('✅') ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
              borderRadius:8, padding:'10px 14px', fontSize:12,
              color: msg.startsWith('✅') ? '#34D399' : '#F87171' }}>
              {msg}
            </div>
          )}

          {/* 권한 계층 안내 */}
          <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10, padding:14 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--t2)', marginBottom:10 }}>📖 권한 계층</div>
            {Object.entries(PERM_META).map(([k, v]) => (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0',
                borderBottom:'1px solid var(--b1)' }}>
                <span>{v.emoji}</span>
                <span style={{ flex:1, fontSize:11, color:'var(--t2)' }}>{v.label}</span>
                {tierBadge(v.tier)}
                <span style={{ fontSize:10, color:'var(--t4)', fontFamily:'var(--f-mono)' }}>
                  {v.tier >= 4 ? '4h' : '24h'}
                </span>
              </div>
            ))}
            <div style={{ marginTop:10, fontSize:10, color:'var(--t4)', lineHeight:1.6 }}>
              ⚠️ T4+ 권한은 마스터 키 필수<br/>
              ⚠️ 모든 권한 변경은 감사 로그에 기록됨<br/>
              ⚠️ IP 화이트리스트 적용 중
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 패치노트 탭
// ══════════════════════════════════════════════════════════════════════

function PatchNotesTab() {
  const [notes,    setNotes]    = useState([])
  const [loading,  setLoading]  = useState(false)
  const [working,  setWorking]  = useState(false)
  const [msg,      setMsg]      = useState('')
  const [selected, setSelected] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [form,     setForm]     = useState({ title:'', body:'', version:'', tags:'' })
  const [showWrite, setShowWrite] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/patch-notes?limit=30')
      const d = await r.json()
      if (d.ok) setNotes(d.notes || [])
    } catch (e) { setMsg('❌ 로드 실패') }
    setLoading(false)
  }

  const autoGenerate = async () => {
    if (!confirm('AI가 최근 2주 운영 데이터를 분석해 패치노트를 자동 생성합니다. 계속할까요?')) return
    setWorking(true); setMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const cronSecret = import.meta.env.VITE_CRON_SECRET || ''
      const r = await fetch('/api/patch-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Cron-Secret': cronSecret,
        },
        body: JSON.stringify({ action: 'auto', force: true }),
      })
      const d = await r.json()
      if (d.ok && !d.skipped) {
        setMsg(`✅ 패치노트 자동 생성 완료: ${d.version}`)
        load()
      } else if (d.skipped) {
        setMsg('⚠️ 비격주 주기 (강제 실행하려면 force: true)')
      } else {
        setMsg('❌ ' + (d.error || '생성 실패'))
      }
    } catch (e) { setMsg('❌ ' + e.message) }
    setWorking(false)
  }

  const publish = async () => {
    if (!form.title.trim() || !form.body.trim()) { setMsg('⚠️ 제목과 본문을 입력하세요'); return }
    setWorking(true); setMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const r = await fetch('/api/patch-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action:  'publish',
          title:   form.title,
          body:    form.body,
          version: form.version || undefined,
          tags:    form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        }),
      })
      const d = await r.json()
      if (d.ok) {
        setMsg(`✅ 패치노트 게시 완료: ${d.version}`)
        setShowWrite(false)
        setForm({ title:'', body:'', version:'', tags:'' })
        load()
      } else setMsg('❌ ' + (d.error || '게시 실패'))
    } catch (e) { setMsg('❌ ' + e.message) }
    setWorking(false)
  }

  const patchEdit = async (id) => {
    setWorking(true); setMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const r = await fetch(`/api/patch-notes?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title,
          body:  form.body,
          tags:  form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        }),
      })
      const d = await r.json()
      if (d.ok) { setMsg('✅ 수정 완료'); setEditMode(false); load() }
      else setMsg('❌ ' + (d.error || '수정 실패'))
    } catch (e) { setMsg('❌ ' + e.message) }
    setWorking(false)
  }

  const deleteNote = async (id) => {
    if (!confirm('패치노트를 삭제하시겠습니까?')) return
    setWorking(true); setMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const r = await fetch(`/api/patch-notes?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json()
      if (d.ok) { setMsg('✅ 삭제 완료'); setSelected(null); load() }
      else setMsg('❌ ' + (d.error || '삭제 실패'))
    } catch (e) { setMsg('❌ ' + e.message) }
    setWorking(false)
  }

  useEffect(() => { load() }, [])

  const tagColors = ['#60A5FA','#34D399','#F59E0B','#A78BFA','#F472B6','#38BDF8']

  return (
    <div>
      {/* 상단 액션 */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <h3 style={{ fontSize:15, fontWeight:700, color:'var(--t1)', margin:0 }}>📋 패치노트 관리</h3>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={load} style={{ background:'none', border:'1px solid var(--b1)', borderRadius:7,
            padding:'7px 14px', fontSize:12, color:'var(--t3)', cursor:'pointer' }}>
            ↺ 새로고침
          </button>
          <button onClick={autoGenerate} disabled={working}
            style={{ background:'rgba(167,139,250,0.12)', border:'1px solid rgba(167,139,250,0.35)',
              borderRadius:7, padding:'7px 14px', fontSize:12, color:'#A78BFA', cursor:'pointer', fontWeight:600 }}>
            🤖 AI 자동 생성
          </button>
          <button onClick={() => setShowWrite(true)}
            style={{ background:'rgba(96,165,250,0.12)', border:'1px solid rgba(96,165,250,0.35)',
              borderRadius:7, padding:'7px 14px', fontSize:12, color:'#60A5FA', cursor:'pointer', fontWeight:600 }}>
            ✏️ 수동 작성
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('✅') ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
          border: `1px solid ${msg.startsWith('✅') ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
          borderRadius:8, padding:'10px 14px', fontSize:12, marginBottom:16,
          color: msg.startsWith('✅') ? '#34D399' : '#F87171' }}>
          {msg}
        </div>
      )}

      {/* 수동 작성 폼 */}
      {showWrite && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:12, padding:20, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
            <h4 style={{ fontSize:13, fontWeight:600, color:'var(--t1)', margin:0 }}>✏️ 패치노트 작성</h4>
            <button onClick={() => setShowWrite(false)}
              style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--t4)', cursor:'pointer' }}>✕</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <div style={{ fontSize:11, color:'var(--t3)', marginBottom:4 }}>제목 *</div>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="v1.5 — 주요 기능 개선"
                  style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--b1)',
                    borderRadius:6, padding:'7px 10px', color:'var(--t1)', fontSize:12, boxSizing:'border-box' }}/>
              </div>
              <div>
                <div style={{ fontSize:11, color:'var(--t3)', marginBottom:4 }}>버전 (자동 입력 가능)</div>
                <input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                  placeholder="v1.5"
                  style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--b1)',
                    borderRadius:6, padding:'7px 10px', color:'var(--t1)', fontSize:12,
                    fontFamily:'var(--f-mono)', boxSizing:'border-box' }}/>
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--t3)', marginBottom:4 }}>태그 (쉼표 구분)</div>
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="기능개선, 버그수정, 보안"
                style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--b1)',
                  borderRadius:6, padding:'7px 10px', color:'var(--t1)', fontSize:12, boxSizing:'border-box' }}/>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--t3)', marginBottom:4 }}>본문 (마크다운) *</div>
              <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                rows={10} placeholder="## 변경 사항&#10;&#10;### ✨ 새 기능&#10;- ...&#10;&#10;### 🐛 버그 수정&#10;- ..."
                style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--b1)',
                  borderRadius:6, padding:'10px', color:'var(--t1)', fontSize:12,
                  fontFamily:'var(--f-mono)', resize:'vertical', boxSizing:'border-box' }}/>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setShowWrite(false)}
                style={{ background:'none', border:'1px solid var(--b1)', borderRadius:7,
                  padding:'8px 16px', fontSize:12, color:'var(--t3)', cursor:'pointer' }}>취소</button>
              <button onClick={publish} disabled={working}
                style={{ background:'rgba(96,165,250,0.15)', border:'1px solid rgba(96,165,250,0.4)',
                  borderRadius:7, padding:'8px 16px', fontSize:12, color:'#60A5FA',
                  cursor:'pointer', fontWeight:600 }}>
                {working ? '게시 중...' : '📢 게시'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns: selected ? '1fr 420px' : '1fr', gap:20, alignItems:'start' }}>
        {/* 목록 */}
        <div>
          {loading ? (
            [...Array(4)].map((_,i) => <div key={i} className="skeleton" style={{ height:80, borderRadius:10, marginBottom:10 }}/>)
          ) : notes.length === 0 ? (
            <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10,
              padding:32, textAlign:'center', color:'var(--t3)', fontSize:13 }}>
              패치노트가 없습니다. AI 자동 생성 또는 수동 작성을 이용하세요.
            </div>
          ) : (
            notes.map(note => (
              <div key={note.id}
                onClick={() => { setSelected(note); setEditMode(false) }}
                style={{ background: selected?.id === note.id ? 'var(--bg3)' : 'var(--bg2)',
                  border: `1px solid ${selected?.id === note.id ? '#60A5FA44' : 'var(--b1)'}`,
                  borderRadius:10, padding:16, marginBottom:10, cursor:'pointer',
                  transition:'border-color .2s' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                  <div style={{ background:'rgba(96,165,250,0.1)', border:'1px solid rgba(96,165,250,0.25)',
                    borderRadius:6, padding:'3px 8px', fontFamily:'var(--f-mono)', fontSize:11,
                    color:'#60A5FA', whiteSpace:'nowrap' }}>
                    {note.version}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--t1)',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {note.title}
                    </div>
                    <div style={{ fontSize:11, color:'var(--t4)', marginTop:4, display:'flex', gap:8, flexWrap:'wrap' }}>
                      <span>📅 {new Date(note.published_at).toLocaleDateString('ko-KR')}</span>
                      <span>✍️ {note.author}</span>
                      {note.is_auto && <span style={{ color:'#A78BFA' }}>🤖 자동생성</span>}
                    </div>
                  </div>
                  {note.tags?.length > 0 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      {note.tags.slice(0, 3).map((tag, i) => (
                        <span key={i} style={{ background:`${tagColors[i % tagColors.length]}15`,
                          color: tagColors[i % tagColors.length], borderRadius:4,
                          padding:'2px 6px', fontSize:10 }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 상세 / 편집 패널 */}
        {selected && (
          <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:12,
            padding:20, position:'sticky', top:80 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
              <span style={{ fontFamily:'var(--f-mono)', fontSize:12, color:'#60A5FA' }}>{selected.version}</span>
              <span style={{ fontSize:12, color:'var(--t3)', flex:1,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{selected.title}</span>
              <button onClick={() => setSelected(null)}
                style={{ background:'none', border:'none', color:'var(--t4)', cursor:'pointer' }}>✕</button>
            </div>

            {editMode ? (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  style={{ background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:6,
                    padding:'7px 10px', color:'var(--t1)', fontSize:12 }}/>
                <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="태그 (쉼표)"
                  style={{ background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:6,
                    padding:'7px 10px', color:'var(--t1)', fontSize:12 }}/>
                <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  rows={14}
                  style={{ background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:6,
                    padding:'10px', color:'var(--t1)', fontSize:11, fontFamily:'var(--f-mono)', resize:'vertical' }}/>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => setEditMode(false)}
                    style={{ flex:1, background:'none', border:'1px solid var(--b1)', borderRadius:6,
                      padding:'7px 0', fontSize:12, color:'var(--t3)', cursor:'pointer' }}>취소</button>
                  <button onClick={() => patchEdit(selected.id)} disabled={working}
                    style={{ flex:1, background:'rgba(96,165,250,0.15)', border:'1px solid rgba(96,165,250,0.4)',
                      borderRadius:6, padding:'7px 0', fontSize:12, color:'#60A5FA', cursor:'pointer', fontWeight:600 }}>
                    {working ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize:11, color:'var(--t4)', marginBottom:12, display:'flex', gap:10 }}>
                  <span>📅 {new Date(selected.published_at).toLocaleString('ko-KR')}</span>
                  <span>✍️ {selected.author}</span>
                </div>
                {selected.tags?.length > 0 && (
                  <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
                    {selected.tags.map((tag, i) => (
                      <span key={i} style={{ background:`${tagColors[i % tagColors.length]}15`,
                        color: tagColors[i % tagColors.length], borderRadius:4, padding:'2px 7px', fontSize:11 }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ background:'var(--bg3)', borderRadius:8, padding:14, maxHeight:400,
                  overflowY:'auto', fontSize:12, color:'var(--t2)', lineHeight:1.7,
                  fontFamily:'var(--f-mono)', whiteSpace:'pre-wrap' }}>
                  {selected.body}
                </div>
                <div style={{ display:'flex', gap:8, marginTop:14 }}>
                  <button onClick={() => {
                    setEditMode(true)
                    setForm({ title: selected.title, body: selected.body,
                      version: selected.version, tags: (selected.tags || []).join(', ') })
                  }} style={{ flex:1, background:'rgba(96,165,250,0.1)', border:'1px solid rgba(96,165,250,0.3)',
                    borderRadius:6, padding:'7px 0', fontSize:12, color:'#60A5FA', cursor:'pointer' }}>
                    ✏️ 편집
                  </button>
                  <button onClick={() => deleteNote(selected.id)}
                    style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.3)',
                      borderRadius:6, padding:'7px 14px', fontSize:12, color:'#F87171', cursor:'pointer' }}>
                    🗑️
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 하단 안내 */}
      <div style={{ background:'rgba(167,139,250,0.05)', border:'1px solid rgba(167,139,250,0.2)',
        borderRadius:10, padding:14, marginTop:20, fontSize:12, color:'var(--t3)', lineHeight:1.8 }}>
        <div style={{ fontWeight:600, color:'#A78BFA', marginBottom:6 }}>📅 자동 패치노트 스케줄</div>
        격주 월요일 09:00 KST에 cron으로 자동 실행됩니다.<br/>
        최근 2주간 AI 운영 로그 + 워크 로그를 분석하여 변경 사항을 자동 요약합니다.<br/>
        수동으로 즉시 생성하려면 <strong style={{ color:'#A78BFA' }}>🤖 AI 자동 생성</strong> 버튼을 사용하세요.
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 보안 관리 탭 — AI 계정 권한 잠금 & 탈취 방지
// ══════════════════════════════════════════════════════════════════════

function SecurityTab() {
  const [statuses, setStatuses]   = useState([])
  const [summary, setSummary]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const [locking, setLocking]     = useState(false)
  const [msg, setMsg]             = useState('')
  const [filter, setFilter]       = useState('all')

  const loadStatus = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/staff-auth')
      const d = await r.json()
      if (d.accounts) {
        setStatuses(d.accounts)
        setSummary({ total: d.total, locked: d.locked, needs_lock: d.needs_lock })
      }
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => { loadStatus() }, [])

  const lockAll = async () => {
    setLocking(true); setMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/staff-auth', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session?.access_token||''}` },
      })
      const d = await r.json()
      if (d.ok) {
        setMsg(`✅ ${d.summary.locked}명 권한 잠금 완료`)
        await loadStatus()
      } else setMsg(`❌ ${d.error || '실패'}`)
    } catch (e) { setMsg(`❌ ${e.message}`) }
    setLocking(false)
  }

  const filtered = statuses.filter(s => {
    if (filter === 'locked')   return !s.needs_lock
    if (filter === 'unlocked') return  s.needs_lock
    return true
  })

  return (
    <div>
      {/* 상태 요약 */}
      {summary && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
          <StatCard label="총 AI 직원" value={summary.total}      icon={Bot}          color="#818CF8"/>
          <StatCard label="권한 잠금 완료" value={summary.locked}    icon={ShieldCheck}  color="#34D399"/>
          <StatCard label="잠금 필요"   value={summary.needs_lock} icon={ShieldOff}    color={summary.needs_lock>0?'#F43F5E':'#34D399'}/>
        </div>
      )}

      <Panel style={{ marginBottom:16 }}>
        <SectionHeader icon={ShieldCheck} label="AI 직원 관리자 권한 & 보안 잠금" color="#34D399">
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={loadStatus} className="btn btn-ghost btn-sm" style={{ gap:4 }}>
              <RefreshCw size={11}/> 새로고침
            </button>
            <button onClick={lockAll} disabled={locking} className="btn btn-primary btn-sm"
              style={{ gap:4, background:'linear-gradient(135deg,#10B981,#34D399)' }}>
              {locking ? <Loader size={11} style={{ animation:'spin 1s linear infinite' }}/> : <Lock size={11}/>}
              {locking ? '적용 중…' : '전체 권한 잠금 실행'}
            </button>
          </div>
        </SectionHeader>
        <Msg msg={msg}/>

        {/* 보안 정책 요약 */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10, marginBottom:16 }}>
          {[
            { icon:Lock,        color:'#34D399', title:'admin_locked',   desc:'role 변경 불가 잠금' },
            { icon:ShieldCheck, color:'#818CF8', title:'is_ai_account',  desc:'AI 계정 식별 플래그' },
            { icon:Shield,      color:'#60A5FA', title:'username 패턴',  desc:'ai_* 패턴 일반 등록 차단' },
            { icon:Lock,        color:'#F59E0B', title:'CRON_SECRET',    desc:'API 인증 없이 변경 불가' },
          ].map(item => (
            <div key={item.title} style={{ background:`${item.color}08`, border:`1px solid ${item.color}20`,
              borderRadius:8, padding:'10px 12px', display:'flex', gap:10, alignItems:'flex-start' }}>
              <item.icon size={14} color={item.color} style={{ marginTop:2, flexShrink:0 }}/>
              <div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:item.color, fontWeight:700 }}>{item.title}</div>
                <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 필터 */}
        <div style={{ display:'flex', gap:6, marginBottom:12 }}>
          {[['all','전체'],['locked','잠금 완료'],['unlocked','잠금 필요']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              style={{ fontFamily:'var(--f-mono)', fontSize:10, padding:'4px 10px',
                background: filter===v ? 'rgba(52,211,153,0.1)' : 'none',
                border: filter===v ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius:4, color: filter===v ? '#34D399' : '#666', cursor:'pointer' }}>
              {l}
            </button>
          ))}
          <span style={{ marginLeft:'auto', fontFamily:'var(--f-mono)', fontSize:10, color:'#444', alignSelf:'center' }}>
            {filtered.length}명
          </span>
        </div>

        {/* 계정 목록 */}
        {loading ? (
          <div style={{ textAlign:'center', padding:20, color:'#444', fontFamily:'var(--f-mono)', fontSize:11 }}>로딩 중…</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:6 }}>
            {filtered.map(s => (
              <div key={s.username} style={{ background: s.needs_lock ? 'rgba(244,63,94,0.05)' : 'rgba(52,211,153,0.04)',
                border: `1px solid ${s.needs_lock ? 'rgba(244,63,94,0.2)' : 'rgba(52,211,153,0.15)'}`,
                borderRadius:8, padding:'10px 12px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                  {s.needs_lock
                    ? <ShieldOff size={12} color="#F43F5E"/>
                    : <ShieldCheck size={12} color="#34D399"/>}
                  <span style={{ fontFamily:'var(--f-mono)', fontSize:11, fontWeight:700,
                    color: staffColor(s.username) }}>{s.username.replace('ai_','').toUpperCase()}</span>
                  {!s.username.includes('_',3) && <span style={{ fontSize:8, background:'rgba(129,140,248,0.15)',
                    color:'#818CF8', border:'1px solid rgba(129,140,248,0.3)', borderRadius:3,
                    padding:'1px 4px', fontFamily:'var(--f-mono)' }}>LEAD</span>}
                </div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#555', marginBottom:4 }}>{s.username}</div>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                  <span style={{ fontSize:9, background: s.is_admin ? 'rgba(52,211,153,0.1)' : 'rgba(244,63,94,0.1)',
                    color: s.is_admin ? '#34D399' : '#F43F5E',
                    border:`1px solid ${s.is_admin ? 'rgba(52,211,153,0.2)' : 'rgba(244,63,94,0.2)'}`,
                    borderRadius:3, padding:'1px 5px', fontFamily:'var(--f-mono)' }}>
                    {s.role || 'no-role'}
                  </span>
                  {s.admin_locked && <span style={{ fontSize:9, background:'rgba(96,165,250,0.1)', color:'#60A5FA',
                    border:'1px solid rgba(96,165,250,0.2)', borderRadius:3, padding:'1px 5px', fontFamily:'var(--f-mono)' }}>
                    🔒 locked
                  </span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// EyeOff 아이콘
// ══════════════════════════════════════════════════════════════════════

function EyeOff({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 메인 AdminPage
// ══════════════════════════════════════════════════════════════════════

export default function AdminPage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState('dashboard')
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [writeOpen, setWriteOpen] = useState(false)

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    const [art, news, sub, posts, reports, users, aiAcc, logs] = await Promise.allSettled([
      supabase.from('articles').select('id', { count:'exact' }).eq('status','published').is('source_name',null),
      supabase.from('articles').select('id', { count:'exact' }).not('source_name','is',null),
      supabase.from('newsletter_subscribers').select('id', { count:'exact' }).eq('is_active',true),
      supabase.from('community_posts').select('id', { count:'exact' }).eq('is_deleted',false),
      supabase.from('reports').select('id', { count:'exact' }).eq('status','pending'),
      supabase.from('profiles').select('id', { count:'exact' }),
      supabase.from('profiles').select('id', { count:'exact' }).like('username','ai_%'),
      supabase.from('work_logs').select('id', { count:'exact' }),
    ])
    const c = r => r.status === 'fulfilled' ? (r.value?.count || 0) : 0
    setStats({
      articles: c(art), news: c(news), subscribers: c(sub),
      posts: c(posts), pendingReports: c(reports), totalUsers: c(users),
      aiAccounts: c(aiAcc), workLogs: c(logs),
    })
    setStatsLoading(false)
  }, [])

  useEffect(() => {
    if (!user || profile?.role !== 'admin') { navigate('/'); return }
    loadStats()
  }, [user, profile])

  if (!user || profile?.role !== 'admin') return null

  return (
    <div style={{ paddingBottom:80 }}>
      <Helmet>
        <title>관리자 대시보드 | Insightship</title>
        <meta name="robots" content="noindex, nofollow"/>
      </Helmet>

      {/* 헤더 */}
      <div style={{ background:'var(--bg2)', borderBottom:'1px solid var(--b1)', padding:'14px 0' }}>
        <div className="container" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#60A5FA', letterSpacing:'3px', marginBottom:4 }}>ADMIN PANEL v2</div>
            <h1 style={{ fontFamily:'var(--f-display)', fontSize:20, fontWeight:700, color:'var(--t1)' }}>관리자 대시보드</h1>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {stats?.pendingReports > 0 && (
              <button onClick={() => setTab('reports')}
                style={{ background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.3)',
                  color:'#F43F5E', borderRadius:6, padding:'5px 10px', fontFamily:'var(--f-mono)',
                  fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                <Flag size={11}/> 신고 {stats.pendingReports}건
              </button>
            )}
            <button onClick={() => setWriteOpen(true)} className="btn btn-primary btn-sm" style={{ gap:6 }}>
              <FileText size={13}/> 새 아티클
            </button>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div style={{ background:'var(--bg2)', borderBottom:'1px solid var(--b1)', overflowX:'auto' }}>
        <div className="container">
          <div style={{ display:'flex', gap:0 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{
                  display:'flex', alignItems:'center', gap:6,
                  padding:'12px 14px', background:'none', border:'none',
                  borderBottom: tab===t.id ? '2px solid #60A5FA' : '2px solid transparent',
                  color: tab===t.id ? '#60A5FA' : 'var(--t3)',
                  fontFamily:'var(--f-mono)', fontSize:11, cursor:'pointer',
                  letterSpacing:'0.5px', whiteSpace:'nowrap', position:'relative',
                }}>
                <t.icon size={12}/> {t.label}
                {t.id==='reports' && stats?.pendingReports > 0 && (
                  <span style={{ background:'#F43F5E', color:'#fff', borderRadius:'50%', width:15, height:15,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:9,
                    fontFamily:'var(--f-mono)', position:'absolute', top:6, right:2 }}>
                    {stats.pendingReports > 9 ? '9+' : stats.pendingReports}
                  </span>
                )}
                {t.id==='teams' && (
                  <span style={{ background:'#818CF8', color:'#fff', borderRadius:4, padding:'1px 4px',
                    fontSize:8, fontFamily:'var(--f-mono)', marginLeft:2 }}>100</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="container" style={{ marginTop:28 }}>
        {tab === 'dashboard' && (
          <div>
            {/* 통계 카드 */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10, marginBottom:32 }}>
              {statsLoading ? [...Array(8)].map((_,i)=><div key={i} className="skeleton" style={{ height:80, borderRadius:10 }}/>) : (
                <>
                  <StatCard label="발행 아티클"   value={stats?.articles}       icon={FileText}    color="#3B82F6" onClick={()=>setTab('articles')}/>
                  <StatCard label="수집 뉴스"     value={stats?.news}           icon={Newspaper}   color="#22C55E"/>
                  <StatCard label="구독자"         value={stats?.subscribers}    icon={Users}       color="#F59E0B"/>
                  <StatCard label="커뮤니티 글"   value={stats?.posts}          icon={MessageSquare} color="#A855F7" onClick={()=>setTab('community')}/>
                  <StatCard label="신고 대기"     value={stats?.pendingReports} icon={Flag}        color="#F43F5E"
                    sub={stats?.pendingReports > 0 ? '처리 필요' : '이상 없음'} onClick={()=>setTab('reports')}/>
                  <StatCard label="총 유저"       value={stats?.totalUsers}     icon={Users}       color="#60A5FA" onClick={()=>setTab('users')}/>
                  <StatCard label="AI 직원"       value={stats?.aiAccounts}     icon={Bot}         color="#818CF8" onClick={()=>setTab('teams')}/>
                  <StatCard label="워크 로그"     value={stats?.workLogs}       icon={Activity}    color="#34D399" onClick={()=>setTab('workers')}/>
                </>
              )}
            </div>

            {/* ── AI 멘토 분석 패널 ── */}
            <MentorAnalysisPanel onTabChange={setTab}/>

            {/* AI 분석 */}
            <div style={{ marginBottom:32 }}>
              <AIAssistant
                context={`Insightship 플랫폼 통계: 아티클 ${stats?.articles||0}편, 뉴스 ${stats?.news||0}건, 구독자 ${stats?.subscribers||0}명, 커뮤니티 글 ${stats?.posts||0}개, 신고 대기 ${stats?.pendingReports||0}건, 총 유저 ${stats?.totalUsers||0}명, AI직원 ${stats?.aiAccounts||0}명`}
                onInsert={() => {}}/>
            </div>

            {/* 빠른 이동 */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10, marginBottom:32 }}>
              {[
                { label:'AI 팀 관리', desc:'100명 팀원 현황 · 계정 동기화', tab:'teams', color:'#818CF8', icon:Bot },
                { label:'워커 제어', desc:'상시 근무 엔진 실행 · 로그 확인', tab:'workers', color:'#22C55E', icon:Activity },
                { label:'자동 운영', desc:'전략/PR/뉴스/KPI 자동 생성', tab:'ops', color:'#F59E0B', icon:Zap },
                { label:'신고 처리', desc:`대기 중 ${stats?.pendingReports||0}건 처리 필요`, tab:'reports', color:'#F43F5E', icon:Flag },
              ].map(item => {
                const Icon = item.icon
                return (
                  <div key={item.tab} onClick={() => setTab(item.tab)}
                    style={{ background:'var(--bg2)', border:`1px solid var(--b1)`, borderRadius:10,
                      padding:16, cursor:'pointer', transition:'border-color .2s' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <Icon size={16} color={item.color}/>
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--t1)' }}>{item.label}</span>
                      <ChevronRight size={12} color="var(--t4)" style={{ marginLeft:'auto' }}/>
                    </div>
                    <div style={{ fontSize:12, color:'var(--t3)' }}>{item.desc}</div>
                  </div>
                )
              })}
            </div>

            {/* 신고 알림 */}
            {stats?.pendingReports > 0 && (
              <div style={{ background:'rgba(244,63,94,0.05)', border:'1px solid rgba(244,63,94,0.25)',
                borderRadius:10, padding:18, display:'flex', alignItems:'center', gap:14 }}>
                <AlertOctagon size={20} color="#F43F5E"/>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'var(--f-mono)', fontSize:12, color:'#F43F5E', marginBottom:4 }}>
                    처리 대기 신고 {stats.pendingReports}건
                  </div>
                  <div style={{ fontSize:13, color:'var(--t3)' }}>신고 처리 탭에서 확인하세요.</div>
                </div>
                <button onClick={()=>setTab('reports')} className="btn btn-sm"
                  style={{ background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.3)', color:'#F43F5E' }}>
                  확인하기
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'articles'  && <ArticlesTab/>}
        {tab === 'users'     && <UsersTab/>}
        {tab === 'reports'   && <ReportsTab/>}
        {tab === 'community' && <CommunityTab/>}
        {tab === 'staffchat' && <StaffChatTab/>}
        {tab === 'feedback'  && <FeedbackManageTab/>}
        {tab === 'security'  && <SecurityTab/>}
        {tab === 'teams'     && <TeamsTab/>}
        {tab === 'workers'   && <WorkersTab/>}
        {tab === 'ops'       && <OpsTab/>}
        {tab === 'cron'      && <SystemTab stats={stats} onRefresh={loadStats}/>}
        {tab === 'devperms'  && <DevPermissionsTab/>}
        {tab === 'patchnotes'&& <PatchNotesTab/>}
      </div>

      {writeOpen && <WritePanel onClose={() => { setWriteOpen(false); loadStats() }}/>}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        tr:hover td { background: var(--bg3) !important; }
      `}</style>
    </div>
  )
}
