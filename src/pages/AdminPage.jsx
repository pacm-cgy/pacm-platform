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
  Download, Upload, Filter, RotateCcw, Target, Inbox
} from 'lucide-react'

// ── 탭 정의 ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard',  label: '대시보드',    icon: BarChart2 },
  { id: 'articles',   label: '아티클 관리', icon: FileText  },
  { id: 'users',      label: '유저 관리',   icon: Users     },
  { id: 'reports',    label: '신고 처리',   icon: Flag      },
  { id: 'community',  label: '커뮤니티',    icon: MessageSquare },
  { id: 'teams',      label: 'AI 팀',       icon: Bot       },
  { id: 'workers',    label: '워커 제어',   icon: Activity  },
  { id: 'ops',        label: '자동 운영',   icon: Zap       },
  { id: 'cron',       label: '시스템',      icon: Settings  },
]

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

  const banUser = async (user) => {
    const ban = !user.is_banned
    if (!window.confirm(`${user.display_name || user.username}을(를) ${ban ? '정지' : '정지 해제'}하시겠습니까?`)) return
    const { error } = await supabase.from('profiles').update({ is_banned: ban }).eq('id', user.id)
    setMsg(user.id, error ? `❌ ${error.message?.slice(0,40)}` : (ban ? '✅ 정지됨' : '✅ 해제됨'))
    load()
  }

  const changeRole = async (user, role) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', user.id)
    setMsg(user.id, error ? '❌ 오류' : `✅ ${role}로 변경됨`)
    load()
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
    if (action === 'delete_content') {
      const table = report.target_type === 'post' ? 'community_posts' : 'comments'
      const col = report.target_type === 'post' ? 'is_deleted' : null
      if (col) {
        await supabase.from(table).update({ [col]: true }).eq('id', report.target_id)
      } else {
        await supabase.from(table).delete().eq('id', report.target_id)
      }
    }
    const { error } = await supabase.from('reports').update({
      status: action === 'dismissed' ? 'dismissed' : 'resolved',
      resolved_at: new Date().toISOString(),
    }).eq('id', report.id)
    setMsg(report.id, error ? '❌ 오류' : (action === 'dismissed' ? '✅ 기각됨' : '✅ 처리됨'))
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
      const r = await fetch('/api/sync-ai-accounts')
      const d = await r.json()
      // d.accounts가 있으면 상태 반영
      const status = {}
      if (d.accounts) {
        d.accounts.forEach(a => { status[a.username] = a.exists })
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
          'x-cron-secret': 'admin-sync',
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
// AI 워커 제어 탭 (신규)
// ══════════════════════════════════════════════════════════════════════

function WorkersTab() {
  const [workerStatus, setWorkerStatus] = useState(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [logs, setLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [targetWorker, setTargetWorker] = useState('')
  const logsEndRef = useRef(null)

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
        .select('member_name,team,title,task_type,task,created_at')
        .order('created_at', { ascending:false })
        .limit(50)
      setLogs(data || [])
    } catch { /* ignore */ }
    setLoadingLogs(false)
  }, [])

  useEffect(() => {
    loadStatus()
    loadLogs()
  }, [loadStatus, loadLogs])

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
      const d = await r.json()
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

  return (
    <div>
      {/* 상태 표시 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:20 }}>
        <StatCard label="총 워커" value={workerStatus?.total_workers || 100} icon={Bot} color="#818CF8"/>
        <StatCard label="이번 실행" value={workerStatus?.workers_this_run || '—'} icon={Activity} color="#22C55E"/>
        <StatCard label="활동 레벨" value={ACTIVITY_LABEL[workerStatus?.current_activity_level] || '—'}
          icon={Radio} color={ACTIVITY_COLOR[workerStatus?.current_activity_level] || '#60A5FA'}/>
        <StatCard label="최근 로그" value={logs.length} icon={Clock} color="#F59E0B"/>
      </div>

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

  const runCron = async (path, label) => {
    setRunningCron(label)
    setCronResult('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(path, {
        headers: { 'x-vercel-cron':'1', Authorization:'Bearer '+(session?.access_token||'') },
        method: path.includes('sync') ? 'POST' : 'POST',
      })
      const d = await r.json()
      setCronResult(`✅ ${label} 완료:\n${JSON.stringify(d, null, 2).slice(0, 600)}`)
    } catch (e) { setCronResult('❌ 오류: ' + e.message) }
    finally { setRunningCron(''); onRefresh() }
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
        {tab === 'teams'     && <TeamsTab/>}
        {tab === 'workers'   && <WorkersTab/>}
        {tab === 'ops'       && <OpsTab/>}
        {tab === 'cron'      && <SystemTab stats={stats} onRefresh={loadStats}/>}
      </div>

      {writeOpen && <WritePanel onClose={() => { setWriteOpen(false); loadStats() }}/>}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        tr:hover td { background: var(--bg3) !important; }
      `}</style>
    </div>
  )
}
