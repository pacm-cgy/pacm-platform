import { generateSlug } from '../utils/slug'
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useAuthStore } from '../store'
import { supabase } from '../lib/supabase'
import {
  BarChart2, FileText, Users, Newspaper, RefreshCw, Loader, Zap,
  Bell, Calendar, AlertTriangle, Edit2, Trash2, Shield, Flag,
  CheckCircle, XCircle, Eye, Settings, ChevronDown, ChevronUp,
  Search, UserX, UserCheck, MessageSquare, TrendingUp, Database,
  Lock, Unlock, AlertOctagon, MoreVertical
} from 'lucide-react'

// ── 탭 정의 ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard',  label: '대시보드',    icon: BarChart2 },
  { id: 'articles',   label: '아티클 관리', icon: FileText  },
  { id: 'users',      label: '유저 관리',   icon: Users     },
  { id: 'reports',    label: '신고 처리',   icon: Flag      },
  { id: 'community',  label: '커뮤니티',    icon: MessageSquare },
  { id: 'cron',       label: '시스템',      icon: Settings  },
]

// ── 공통 컴포넌트 ─────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color = '#F59E0B', sub }) {
  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10, padding:20, display:'flex', alignItems:'center', gap:16 }}>
      <div style={{ width:42, height:42, background:`${color}15`, border:`1px solid ${color}25`, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Icon size={18} color={color}/>
      </div>
      <div>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:22, fontWeight:700, color:'var(--t1)' }}>{value ?? '—'}</div>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)', letterSpacing:'1px' }}>{label}</div>
        {sub && <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:color, marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  )
}

function Badge({ children, color = '#60A5FA' }) {
  return (
    <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color, background:`${color}15`, border:`1px solid ${color}30`, padding:'2px 7px', borderRadius:4 }}>
      {children}
    </span>
  )
}

function Msg({ msg }) {
  if (!msg) return null
  const ok = msg.startsWith('✅')
  return <div style={{ fontFamily:'var(--f-mono)', fontSize:12, color: ok ? '#22C55E' : '#F43F5E', marginTop:8 }}>{msg}</div>
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
    } catch {
      setResult('AI 분석 실패.')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:10, padding:20, marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <Zap size={13} color="#F59E0B"/>
        <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#F59E0B', letterSpacing:'1px' }}>AI 작성 보조</span>
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:8 }}>
        <input value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&analyze()}
          placeholder="분석 요청 입력…" className="input" style={{ flex:1, fontSize:13 }}/>
        <button onClick={analyze} disabled={loading} className="btn btn-primary btn-sm" style={{ whiteSpace:'nowrap', gap:5 }}>
          {loading ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> : <Zap size={12}/>} 분석
        </button>
      </div>
      {result && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, padding:14, fontSize:13, lineHeight:1.8, color:'var(--t1)', maxHeight:200, overflowY:'auto', whiteSpace:'pre-wrap' }}>
          {result}
          <button onClick={()=>onInsert?.(result)} className="btn btn-ghost btn-sm" style={{ marginTop:8, display:'block' }}>본문에 삽입</button>
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
          title: form.title.trim(),
          body: form.body.trim(),
          excerpt: (form.excerpt || form.body.slice(0, 200)).trim(),
          category: form.category,
          status,
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
    } catch (e) {
      setMsg('❌ ' + e.message?.slice(0, 80))
    } finally { setSaving(false) }
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
    let q = supabase.from('articles').select('id,title,category,status,published_at,view_count,source_name,ai_summary', { count:'exact' })
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
                <Loader size={16} style={{ animation:'spin 1s linear infinite' }}/>
              </td></tr>
            ) : articles.length === 0 ? (
              <tr><td colSpan={6} style={{ padding:32, textAlign:'center', color:'var(--t4)', fontSize:13 }}>결과 없음</td></tr>
            ) : articles.map(a => (
              <tr key={a.id} style={{ borderBottom:'1px solid var(--b1)', ':hover':{ background:'var(--bg3)' } }}>
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

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('profiles').select('id,display_name,username,role,is_banned,created_at,bio,school,startup_name')
      .order('created_at', { ascending:false }).limit(60)
    if (search.trim()) q = q.or(`display_name.ilike.%${search}%,username.ilike.%${search}%`)
    if (roleFilter !== 'all') q = q.eq('role', roleFilter)
    const { data } = await q
    setUsers(data || [])
    setLoading(false)
  }, [search, roleFilter])

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

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--t4)' }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="이름/아이디 검색…"
            className="input" style={{ paddingLeft:32, fontSize:13 }}/>
        </div>
        {['all','admin','writer','reader'].map(r=>(
          <button key={r} onClick={()=>setRoleFilter(r)}
            className={`btn btn-sm ${roleFilter===r?'btn-primary':'btn-ghost'}`} style={{ fontSize:11 }}>
            {r==='all'?'전체':r}
          </button>
        ))}
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
              <tr><td colSpan={6} style={{ padding:32, textAlign:'center' }}><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/></td></tr>
            ) : users.map(u => (
              <tr key={u.id} style={{ borderBottom:'1px solid var(--b1)' }}>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--t1)' }}>{u.display_name || '(이름없음)'}</div>
                  {u.startup_name && <div style={{ fontSize:11, color:'var(--t4)' }}>{u.startup_name}</div>}
                </td>
                <td style={{ padding:'10px 14px', fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)' }}>{u.username || '—'}</td>
                <td style={{ padding:'10px 14px' }}>
                  <select value={u.role||'reader'}
                    onChange={e=>changeRole(u,e.target.value)}
                    style={{ background:'var(--bg3)', border:'1px solid var(--b1)', color:'var(--t1)', padding:'3px 6px', fontSize:11, fontFamily:'var(--f-mono)', borderRadius:4 }}>
                    <option value="reader">reader</option>
                    <option value="writer">writer</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td style={{ padding:'10px 14px' }}>
                  {u.is_banned
                    ? <Badge color="#F43F5E">정지됨</Badge>
                    : <Badge color="#22C55E">활성</Badge>}
                </td>
                <td style={{ padding:'10px 14px', fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)' }}>
                  {new Date(u.created_at).toLocaleDateString('ko-KR')}
                </td>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <button onClick={()=>banUser(u)} title={u.is_banned?'정지 해제':'정지'}
                      style={{ background:'none', border:'none', cursor:'pointer', color: u.is_banned?'#22C55E':'#F43F5E', padding:4 }}>
                      {u.is_banned ? <UserCheck size={14}/> : <UserX size={14}/>}
                    </button>
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
    // action: 'resolved' | 'dismissed' | 'delete_content'
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
                  <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
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

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('community_posts')
      .select('id,title,post_type,is_deleted,is_pinned,like_count,reply_count,view_count,created_at,author_id,profiles!author_id(display_name)')
      .order('created_at', { ascending:false }).limit(30)
    if (filter === 'notice') q = q.eq('post_type','notice')
    else if (filter === 'deleted') q = q.eq('is_deleted',true)
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
    } catch(e) {
      setNoticeMsg('❌ ' + (e.message?.slice(0,80)||'오류'))
    } finally { setNoticeSaving(false) }
  }

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap', alignItems:'center' }}>
        {['all','notice','deleted'].map(f=>(
          <button key={f} onClick={()=>setFilter(f)}
            className={`btn btn-sm ${filter===f?'btn-primary':'btn-ghost'}`} style={{ fontSize:11 }}>
            {f==='all'?'전체':f==='notice'?'공지글':'삭제됨'}
          </button>
        ))}
        <button onClick={()=>setNoticeOpen(p=>!p)} className="btn btn-ghost btn-sm" style={{ marginLeft:'auto', gap:5, color:'#F59E0B', borderColor:'rgba(245,158,11,0.3)' }}>
          <Bell size={12}/> 점검 공지
        </button>
      </div>

      {noticeOpen && (
        <div style={{ background:'var(--bg2)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:10, padding:20, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
            <Bell size={13} color="#F59E0B"/>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#F59E0B', letterSpacing:'2px' }}>월간 점검 공지 — 최소 7일 전 게시</span>
          </div>
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
              <div style={{ fontFamily:'var(--f-mono)', fontSize:11, color: d>=7?'#22C55E':'#F43F5E', marginBottom:10, display:'flex', alignItems:'center', gap:5 }}>
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
              <tr><td colSpan={7} style={{ padding:32, textAlign:'center' }}><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/></td></tr>
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

// ── 시스템 탭 (cron + 통계) ───────────────────────────────────────────
function SystemTab({ stats, onRefresh }) {
  const [runningCron, setRunningCron] = useState('')
  const [cronResult, setCronResult] = useState('')

  const runCron = async (path, label) => {
    setRunningCron(label)
    setCronResult('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(path, { headers: { 'x-vercel-cron':'1', Authorization:'Bearer '+(session?.access_token||'') } })
      const d = await r.json()
      setCronResult(`✅ ${label} 완료:\n${JSON.stringify(d, null, 2).slice(0, 400)}`)
    } catch (e) {
      setCronResult('❌ 오류: ' + e.message)
    } finally { setRunningCron(''); onRefresh() }
  }

  const CRONS = [
    { label:'뉴스 수집',    path:'/api/fetch-news',          color:'#22C55E' },
    { label:'AI 요약',      path:'/api/summarize-news',       color:'#A855F7' },
    { label:'롱폼 재처리',  path:'/api/reprocess-all-news',  color:'#3B82F6' },
    { label:'트렌드 추출',  path:'/api/extract-news-trends', color:'#F97316' },
    { label:'AI 리포트',    path:'/api/generate-report',     color:'#F59E0B' },
    { label:'AI 콘텐츠',    path:'/api/ai-content-writer',   color:'#8B5CF6' },
    { label:'플랫폼 운영',  path:'/api/ai-platform-operator',color:'#60A5FA' },
    { label:'LEARN',        path:'/api/ai-mentor-learn',     color:'#34D399' },
    { label:'배지 시스템',  path:'/api/badge-system',        color:'#F59E0B' },
    { label:'AI 계정 동기화',path:'/api/sync-ai-accounts',   color:'#818CF8' },
  ]

  return (
    <div>
      <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#60A5FA', letterSpacing:'2px', marginBottom:16 }}>CRON JOBS — 수동 실행</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:20 }}>
        {CRONS.map(({ label, path, color }) => (
          <button key={path} onClick={() => runCron(path, label)}
            disabled={!!runningCron} className="btn btn-ghost btn-sm"
            style={{ display:'flex', alignItems:'center', gap:6, borderColor: runningCron===label ? color+'50' : undefined, color: runningCron===label ? color : undefined }}>
            {runningCron === label
              ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/>
              : <RefreshCw size={12}/>}
            {runningCron === label ? `${label} 실행 중…` : label}
          </button>
        ))}
      </div>

      {cronResult && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, padding:14, fontFamily:'var(--f-mono)', fontSize:12, color:'var(--t1)', whiteSpace:'pre-wrap', maxHeight:300, overflowY:'auto', marginBottom:20 }}>
          {cronResult}
        </div>
      )}

      <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)', letterSpacing:'2px', marginBottom:14 }}>플랫폼 통계</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
        {[
          { label:'총 아티클', value: stats?.articles, icon:FileText, color:'#3B82F6' },
          { label:'수집 뉴스', value: stats?.news, icon:Newspaper, color:'#22C55E' },
          { label:'구독자', value: stats?.subscribers, icon:Users, color:'#F59E0B' },
          { label:'커뮤니티 글', value: stats?.posts, icon:MessageSquare, color:'#A855F7' },
          { label:'신고 대기', value: stats?.pendingReports, icon:Flag, color:'#F43F5E' },
          { label:'총 유저', value: stats?.totalUsers, icon:Users, color:'#60A5FA' },
        ].map((s,i) => <StatCard key={i} {...s}/>)}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 메인 AdminPage
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

export default function AdminPage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState('dashboard')
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [writeOpen, setWriteOpen] = useState(false)

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    const [art, news, sub, posts, reports, users] = await Promise.allSettled([
      supabase.from('articles').select('id', { count:'exact' }).eq('status','published').is('source_name',null),
      supabase.from('articles').select('id', { count:'exact' }).not('source_name','is',null),
      supabase.from('newsletter_subscribers').select('id', { count:'exact' }).eq('is_active',true),
      supabase.from('community_posts').select('id', { count:'exact' }).eq('is_deleted',false),
      supabase.from('reports').select('id', { count:'exact' }).eq('status','pending'),
      supabase.from('profiles').select('id', { count:'exact' }),
    ])
    const c = r => r.status === 'fulfilled' ? (r.value?.count || 0) : 0
    setStats({ articles: c(art), news: c(news), subscribers: c(sub), posts: c(posts), pendingReports: c(reports), totalUsers: c(users) })
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
            <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#60A5FA', letterSpacing:'3px', marginBottom:4 }}>ADMIN PANEL</div>
            <h1 style={{ fontFamily:'var(--f-display)', fontSize:20, fontWeight:700, color:'var(--t1)' }}>관리자 대시보드</h1>
          </div>
          <button onClick={() => setWriteOpen(true)} className="btn btn-primary btn-sm" style={{ gap:6 }}>
            <FileText size={13}/> 새 아티클
          </button>
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
                  padding:'12px 16px', background:'none', border:'none',
                  borderBottom: tab===t.id ? '2px solid #60A5FA' : '2px solid transparent',
                  color: tab===t.id ? '#60A5FA' : 'var(--t3)',
                  fontFamily:'var(--f-mono)', fontSize:11, cursor:'pointer',
                  letterSpacing:'0.5px', whiteSpace:'nowrap',
                  position:'relative',
                }}>
                <t.icon size={12}/> {t.label}
                {t.id==='reports' && stats?.pendingReports > 0 && (
                  <span style={{ background:'#F43F5E', color:'#fff', borderRadius:'50%', width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontFamily:'var(--f-mono)', position:'absolute', top:6, right:4 }}>
                    {stats.pendingReports > 9 ? '9+' : stats.pendingReports}
                  </span>
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
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:40 }}>
              {statsLoading ? [...Array(6)].map((_,i)=><div key={i} className="skeleton" style={{ height:80, borderRadius:10 }}/>) : (
                <>
                  <StatCard label="발행 아티클"   value={stats?.articles}       icon={FileText}    color="#3B82F6"/>
                  <StatCard label="수집 뉴스"     value={stats?.news}           icon={Newspaper}   color="#22C55E"/>
                  <StatCard label="구독자"         value={stats?.subscribers}    icon={Users}       color="#F59E0B"/>
                  <StatCard label="커뮤니티 글"   value={stats?.posts}          icon={MessageSquare} color="#A855F7"/>
                  <StatCard label="신고 대기"     value={stats?.pendingReports} icon={Flag}        color="#F43F5E"
                    sub={stats?.pendingReports > 0 ? '처리 필요' : '이상 없음'}/>
                  <StatCard label="총 유저"       value={stats?.totalUsers}     icon={Users}       color="#60A5FA"/>
                </>
              )}
            </div>

            <div style={{ marginBottom:32 }}>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'#F59E0B', letterSpacing:'2px', marginBottom:14, display:'flex', alignItems:'center', gap:6 }}>
                <Zap size={12} color="#F59E0B"/> AI 시장 분석 · 운영 모니터링
              </div>
              <AIAssistant
                context={`Insightship 플랫폼 통계: 아티클 ${stats?.articles||0}편, 뉴스 ${stats?.news||0}건, 구독자 ${stats?.subscribers||0}명, 커뮤니티 글 ${stats?.posts||0}개, 신고 대기 ${stats?.pendingReports||0}건`}
                onInsert={() => {}}/>
            </div>

            {stats?.pendingReports > 0 && (
              <div style={{ background:'rgba(244,63,94,0.05)', border:'1px solid rgba(244,63,94,0.25)', borderRadius:10, padding:18, marginBottom:20, display:'flex', alignItems:'center', gap:14 }}>
                <AlertOctagon size={20} color="#F43F5E"/>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'var(--f-mono)', fontSize:12, color:'#F43F5E', marginBottom:4 }}>처리 대기 신고 {stats.pendingReports}건</div>
                  <div style={{ fontSize:13, color:'var(--t3)' }}>신고 처리 탭에서 확인하세요.</div>
                </div>
                <button onClick={()=>setTab('reports')} className="btn btn-sm" style={{ background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.3)', color:'#F43F5E' }}>
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
        {tab === 'cron'      && <SystemTab stats={stats} onRefresh={loadStats}/>}
      </div>

      {writeOpen && <WritePanel onClose={() => { setWriteOpen(false); loadStats() }}/>}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        tr:hover td { background: var(--bg3); }
      `}</style>
    </div>
  )
}
