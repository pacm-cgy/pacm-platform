import { useState, useEffect, useCallback, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import {
  Lightbulb, Plus, ThumbsUp, MessageCircle, Search,
  X, AlertCircle, Rocket, Send, Eye,
  Loader2, Pencil, Trash2, MoreHorizontal, Check,
} from 'lucide-react'
import { useAuthStore } from '../store'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

/* ── 상수 ─────────────────────────────────────────────────────────── */
const CATEGORIES = [
  { id:'all',     label:'전체',        emoji:'📋', color:'#3B82F6' },
  { id:'ai',      label:'AI/기술',     emoji:'🤖', color:'#A855F7' },
  { id:'edu',     label:'교육',        emoji:'📚', color:'#F97316' },
  { id:'social',  label:'소셜임팩트',  emoji:'🌱', color:'#22C55E' },
  { id:'finance', label:'금융/핀테크', emoji:'💳', color:'#F59E0B' },
  { id:'health',  label:'헬스케어',    emoji:'❤️', color:'#F43F5E' },
  { id:'other',   label:'기타',        emoji:'💡', color:'#06B6D4' },
]

const STAGE_CONFIG = {
  idea:       { label:'아이디어',  color:'#F59E0B', bg:'rgba(245,158,11,0.12)' },
  validation: { label:'검증 단계', color:'#3B82F6', bg:'rgba(59,130,246,0.12)' },
  mvp:        { label:'MVP',       color:'#10B981', bg:'rgba(16,185,129,0.12)' },
  launched:   { label:'출시 완료', color:'#A855F7', bg:'rgba(168,85,247,0.12)' },
}

const CAT_COLORS = {
  ai:'#A855F7', edu:'#F97316', social:'#22C55E',
  finance:'#F59E0B', health:'#F43F5E', other:'#06B6D4',
}

/* ── 헬퍼 ─────────────────────────────────────────────────────────── */
function normalizeIdea(row) {
  const color = CAT_COLORS[row.category] || '#3B82F6'
  return {
    ...row,
    likes:       row.like_count ?? 0,
    comments:    row.comment_count ?? 0,
    views:       row.view_count ?? 0,
    author:      row.profiles?.display_name || row.profiles?.username || '익명',
    authorId:    row.author_id,
    authorSchool:row.profiles?.school || '',
    avatar:      row.profiles?.avatar_url || '💡',
    seeking:     Array.isArray(row.seeking_roles) ? row.seeking_roles : [],
    tags:        Array.isArray(row.tags) ? row.tags : [],
    color,
    featured:    row.is_featured ?? false,
  }
}

/* ── 확인 다이얼로그 ──────────────────────────────────────────────── */
function ConfirmDialog({ message, onConfirm, onCancel, danger = false }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'100%', maxWidth:360, background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:14, padding:28, textAlign:'center', boxShadow:'0 20px 50px rgba(0,0,0,.8)' }}>
        <AlertCircle size={36} color={danger ? '#F43F5E' : '#F59E0B'} style={{ marginBottom:14 }}/>
        <p style={{ fontSize:14, color:'var(--t1)', lineHeight:1.65, margin:'0 0 22px' }}>{message}</p>
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          <button onClick={onCancel}
            style={{ padding:'9px 20px', background:'var(--bg4)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t2)', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)' }}>
            취소
          </button>
          <button onClick={onConfirm}
            style={{ padding:'9px 20px', background:danger?'rgba(244,63,94,.15)':'rgba(59,130,246,.15)', border:`1px solid ${danger?'rgba(244,63,94,.35)':'rgba(59,130,246,.35)'}`, borderRadius:8, color:danger?'#F43F5E':'#3B82F6', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--f-sans)' }}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── 아이디어 수정 모달 ───────────────────────────────────────────── */
function EditModal({ idea, onClose, onUpdated }) {
  const [title,    setTitle]    = useState(idea.title)
  const [desc,     setDesc]     = useState(idea.description || idea.summary || '')
  const [category, setCategory] = useState(idea.category || 'other')
  const [stage,    setStage]    = useState(idea.stage || 'idea')
  const [seeking,  setSeeking]  = useState((idea.seeking || []).join(', '))
  const [tags,     setTags]     = useState((idea.tags || []).join(', '))
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSave() {
    if (!title.trim() || !desc.trim()) return
    if (title.trim().length < 5)  { setError('제목은 최소 5자 이상이어야 합니다.'); return }
    if (desc.trim().length < 20)  { setError('설명은 최소 20자 이상이어야 합니다.'); return }
    setLoading(true); setError('')
    try {
      const seekingArr = seeking.trim() ? seeking.split(',').map(s=>s.trim()).filter(Boolean) : []
      const tagsArr    = tags.trim()    ? tags.split(',').map(t=>t.trim()).filter(Boolean)    : []
      const { data, error: err } = await supabase.from('ideas')
        .update({
          title:         title.trim(),
          description:   desc.trim(),
          category,
          stage,
          seeking_roles: seekingArr,
          tags:          tagsArr,
          updated_at:    new Date().toISOString(),
        })
        .eq('id', idea.id)
        .select('*, profiles(display_name,username,avatar_url,school)')
        .single()
      if (err) throw err
      onUpdated(normalizeIdea(data))
      onClose()
    } catch (e) {
      setError('수정 실패: ' + (e.message || '다시 시도해주세요'))
    }
    setLoading(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.88)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, overflowY:'auto' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:'100%', maxWidth:560, background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:16, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,.85)', margin:'auto' }}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--b1)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(59,130,246,.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <Pencil size={15} color="#3B82F6"/>
            <span style={{ fontFamily:'var(--f-display)', fontSize:15, fontWeight:700, color:'var(--t1)' }}>아이디어 수정</span>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t3)', padding:4 }}><X size={16}/></button>
        </div>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:13 }}>
          {error && (
            <div style={{ padding:'10px 14px', background:'rgba(244,63,94,.1)', border:'1px solid rgba(244,63,94,.25)', borderRadius:7, color:'#F43F5E', fontSize:12 }}>{error}</div>
          )}
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:5 }}>제목 <span style={{ color:'#F43F5E' }}>*</span></div>
            <input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100}
              style={{ width:'100%', padding:'10px 13px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontSize:14, fontFamily:'var(--f-sans)', outline:'none', boxSizing:'border-box' }}
              onFocus={e=>e.target.style.borderColor='rgba(59,130,246,.4)'} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:11 }}>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:5 }}>카테고리</div>
              <select value={category} onChange={e=>setCategory(e.target.value)}
                style={{ width:'100%', padding:'10px 13px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontSize:13, outline:'none', cursor:'pointer' }}>
                {CATEGORIES.filter(c=>c.id!=='all').map(c=><option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:5 }}>현재 단계</div>
              <select value={stage} onChange={e=>setStage(e.target.value)}
                style={{ width:'100%', padding:'10px 13px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontSize:13, outline:'none', cursor:'pointer' }}>
                {Object.entries(STAGE_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:5 }}>설명 <span style={{ color:'#F43F5E' }}>*</span></div>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4} maxLength={2000}
              style={{ width:'100%', padding:'10px 13px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontSize:13.5, fontFamily:'var(--f-sans)', outline:'none', resize:'vertical', boxSizing:'border-box', lineHeight:1.65 }}
              onFocus={e=>e.target.style.borderColor='rgba(59,130,246,.4)'} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
            <div style={{ fontSize:10, color:'var(--t4)', textAlign:'right', marginTop:2 }}>{desc.length}/2000</div>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:5 }}>팀원 모집 <span style={{ color:'var(--t4)', fontWeight:400 }}>(쉼표로 구분)</span></div>
            <input value={seeking} onChange={e=>setSeeking(e.target.value)} placeholder="예: 개발자, 디자이너, 마케터"
              style={{ width:'100%', padding:'10px 13px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontSize:13.5, fontFamily:'var(--f-sans)', outline:'none', boxSizing:'border-box' }}
              onFocus={e=>e.target.style.borderColor='rgba(59,130,246,.4)'} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:5 }}>태그 <span style={{ color:'var(--t4)', fontWeight:400 }}>(쉼표로 구분)</span></div>
            <input value={tags} onChange={e=>setTags(e.target.value)} placeholder="예: AI, 교육, 청소년"
              style={{ width:'100%', padding:'10px 13px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontSize:13.5, fontFamily:'var(--f-sans)', outline:'none', boxSizing:'border-box' }}
              onFocus={e=>e.target.style.borderColor='rgba(59,130,246,.4)'} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', paddingTop:4 }}>
            <button onClick={onClose}
              style={{ padding:'9px 18px', background:'var(--bg4)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t2)', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)' }}>취소</button>
            <button onClick={handleSave} disabled={loading || !title.trim() || !desc.trim()}
              style={{ padding:'9px 18px', background:'linear-gradient(135deg,#3B82F6,#1D4ED8)', border:'none', borderRadius:8, color:'#fff', fontSize:13, fontWeight:700, cursor:loading?'not-allowed':'pointer', fontFamily:'var(--f-sans)', display:'flex', alignItems:'center', gap:6, opacity:loading?0.7:1 }}>
              {loading ? <Loader2 size={13} style={{ animation:'spin 1s linear infinite' }}/> : <Check size={13}/>}
              {loading ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Idea Detail Modal ────────────────────────────────────────────── */
function IdeaDetail({ idea, onClose, user, navigate, onLikeUpdate, onIdeaUpdated, onIdeaDeleted }) {
  const [liked,       setLiked]       = useState(false)
  const [likeCount,   setLikeCount]   = useState(idea.likes || 0)
  const [comment,     setComment]     = useState('')
  const [comments,    setComments]    = useState([])
  const [commLoading, setCommLoading] = useState(true)
  const [submitting,  setSubmitting]  = useState(false)
  const [showEdit,    setShowEdit]    = useState(false)
  const [showMenu,    setShowMenu]    = useState(false)       // 작성자 더보기 메뉴
  const [confirm,     setConfirm]     = useState(null)       // { type:'idea'|'comment', id? }
  const [deletingComment, setDeletingComment] = useState(null) // 삭제 중인 댓글 id
  const menuRef = useRef(null)

  const isOwner = user && idea.authorId === user.id
  const stage   = STAGE_CONFIG[idea.stage] || STAGE_CONFIG.idea
  const cat     = CATEGORIES.find(c=>c.id===idea.category) || CATEGORIES[6]

  // 좋아요 상태 확인
  useEffect(() => {
    if (!user || !idea.id) return
    supabase.from('idea_likes').select('idea_id')
      .eq('user_id', user.id).eq('idea_id', idea.id).maybeSingle()
      .then(({ data }) => { if (data) setLiked(true) })
  }, [user, idea.id])

  // 댓글 로드 + 조회수 증가
  useEffect(() => {
    loadComments()
    supabase.from('ideas')
      .update({ view_count: (idea.views || 0) + 1 })
      .eq('id', idea.id).then(()=>{})
  }, [idea.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 메뉴 외부 클릭 닫기
  useEffect(() => {
    if (!showMenu) return
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  async function loadComments() {
    setCommLoading(true)
    const { data } = await supabase.from('idea_comments')
      .select('*, profiles(display_name,username,avatar_url,school)')
      .eq('idea_id', idea.id).eq('is_deleted', false)
      .order('created_at', { ascending: true })
    setComments(data || [])
    setCommLoading(false)
  }

  // ── 좋아요 ──────────────────────────────────────────────────────
  async function handleLike() {
    if (!user) { navigate('/login'); return }
    if (liked) {
      await supabase.from('idea_likes').delete().eq('user_id', user.id).eq('idea_id', idea.id)
      await supabase.from('ideas').update({ like_count: Math.max(0, likeCount-1) }).eq('id', idea.id)
      setLiked(false); setLikeCount(v=>Math.max(0,v-1)); onLikeUpdate?.(idea.id, -1)
    } else {
      await supabase.from('idea_likes').insert({ user_id:user.id, idea_id:idea.id })
      await supabase.from('ideas').update({ like_count: likeCount+1 }).eq('id', idea.id)
      setLiked(true); setLikeCount(v=>v+1); onLikeUpdate?.(idea.id, 1)
    }
  }

  // ── 댓글 등록 ────────────────────────────────────────────────────
  async function submitComment() {
    if (!user || !comment.trim()) return
    setSubmitting(true)
    const { data, error } = await supabase.from('idea_comments')
      .insert({ idea_id:idea.id, author_id:user.id, content:comment.trim() })
      .select('*, profiles(display_name,username,avatar_url,school)').single()
    if (!error && data) {
      setComments(prev=>[...prev, data])
      setComment('')
      // comment_count는 트리거가 자동 갱신 (없으면 수동)
      supabase.from('ideas')
        .update({ comment_count: (idea.comments || 0) + comments.length + 1 })
        .eq('id', idea.id).then(()=>{})
    }
    setSubmitting(false)
  }

  // ── 댓글 삭제 (소프트) ──────────────────────────────────────────
  async function deleteComment(commentId) {
    setDeletingComment(commentId)
    const { error } = await supabase.from('idea_comments')
      .update({ is_deleted: true }).eq('id', commentId)
    if (!error) {
      setComments(prev=>prev.filter(c=>c.id!==commentId))
      supabase.from('ideas')
        .update({ comment_count: Math.max(0, (idea.comments||0) + comments.length - 1) })
        .eq('id', idea.id).then(()=>{})
    }
    setDeletingComment(null)
    setConfirm(null)
  }

  // ── 아이디어 삭제 (소프트) ────────────────────────────────────
  async function deleteIdea() {
    const { error } = await supabase.from('ideas')
      .update({ is_deleted: true }).eq('id', idea.id)
    if (!error) {
      onIdeaDeleted?.(idea.id)
      onClose()
    }
    setConfirm(null)
  }

  return (
    <>
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, overflowY:'auto' }}
        onClick={e=>e.target===e.currentTarget&&onClose()}>
        <div style={{ width:'100%', maxWidth:660, background:'var(--bg2)', border:`1px solid ${idea.color}30`, borderRadius:16, overflow:'hidden', boxShadow:`0 24px 60px rgba(0,0,0,.85),0 0 0 1px ${idea.color}20`, maxHeight:'92vh', display:'flex', flexDirection:'column', margin:'auto' }}>
          <div style={{ height:4, background:`linear-gradient(90deg,${idea.color},${idea.color}60)`, flexShrink:0 }}/>

          {/* 헤더 */}
          <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--b1)', background:`linear-gradient(135deg,${idea.color}08,transparent)`, display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:9, padding:'2px 8px', borderRadius:3, background:`${cat.color}12`, color:cat.color, fontFamily:'var(--f-mono)', fontWeight:700 }}>{cat.emoji} {cat.label}</span>
                <span style={{ fontSize:9, padding:'2px 8px', borderRadius:3, background:stage.bg, color:stage.color, fontFamily:'var(--f-mono)', fontWeight:600 }}>{stage.label}</span>
              </div>
              <h2 style={{ fontFamily:'var(--f-display)', fontSize:19, fontWeight:700, color:'var(--t1)', lineHeight:1.35, margin:0 }}>{idea.title}</h2>
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0, marginLeft:12 }}>
              {/* 작성자 메뉴 */}
              {isOwner && (
                <div style={{ position:'relative' }} ref={menuRef}>
                  <button onClick={()=>setShowMenu(v=>!v)}
                    style={{ background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:7, padding:'5px 7px', cursor:'pointer', color:'var(--t3)', display:'flex', alignItems:'center' }}>
                    <MoreHorizontal size={14}/>
                  </button>
                  {showMenu && (
                    <div style={{ position:'absolute', right:0, top:'calc(100% + 6px)', background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:9, minWidth:130, boxShadow:'0 8px 24px rgba(0,0,0,.6)', zIndex:100, overflow:'hidden' }}>
                      <button onClick={()=>{ setShowMenu(false); setShowEdit(true) }}
                        style={{ width:'100%', padding:'11px 16px', background:'none', border:'none', color:'var(--t1)', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:8, fontFamily:'var(--f-sans)', textAlign:'left' }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--bg3)'}
                        onMouseLeave={e=>e.currentTarget.style.background='none'}>
                        <Pencil size={13} color="#3B82F6"/>수정하기
                      </button>
                      <button onClick={()=>{ setShowMenu(false); setConfirm({ type:'idea' }) }}
                        style={{ width:'100%', padding:'11px 16px', background:'none', border:'none', color:'#F43F5E', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:8, fontFamily:'var(--f-sans)', textAlign:'left' }}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(244,63,94,.08)'}
                        onMouseLeave={e=>e.currentTarget.style.background='none'}>
                        <Trash2 size={13}/>삭제하기
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t3)', padding:4 }}><X size={18}/></button>
            </div>
          </div>

          {/* 본문 */}
          <div style={{ padding:'20px 22px', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:16 }}>
            {/* 작성자 */}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:38, height:38, borderRadius:'50%', background:`${idea.color}15`, border:`1px solid ${idea.color}25`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, overflow:'hidden', flexShrink:0 }}>
                {typeof idea.avatar==='string' && idea.avatar.startsWith('http')
                  ? <img src={idea.avatar} style={{ width:38, height:38, objectFit:'cover' }} alt=""/>
                  : idea.avatar}
              </div>
              <div>
                <div style={{ fontSize:13.5, fontWeight:600, color:'var(--t1)' }}>{idea.author}</div>
                <div style={{ fontSize:11, color:'var(--t3)' }}>{idea.authorSchool}</div>
              </div>
              <div style={{ marginLeft:'auto', fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}>
                {idea.created_at ? format(new Date(idea.created_at),'M월 d일',{locale:ko}) : ''}
                {idea.updated_at && idea.updated_at !== idea.created_at && (
                  <span style={{ marginLeft:6, color:'var(--t4)', fontSize:9 }}>(수정됨)</span>
                )}
              </div>
            </div>

            {/* 설명 */}
            <div style={{ padding:'15px 17px', background:'var(--bg3)', borderRadius:10, borderLeft:`3px solid ${idea.color}` }}>
              <p style={{ fontSize:14, lineHeight:1.8, color:'var(--t1)', margin:0 }}>{idea.description || idea.summary}</p>
            </div>

            {/* 팀원 모집 */}
            {idea.seeking?.length > 0 && (
              <div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)', letterSpacing:'.1em', marginBottom:7 }}>👥 팀원 모집 중</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {idea.seeking.map(r=>(
                    <span key={r} style={{ fontSize:12, padding:'5px 12px', borderRadius:20, background:`${idea.color}12`, border:`1px solid ${idea.color}28`, color:idea.color, fontFamily:'var(--f-sans)', fontWeight:600 }}>{r}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 태그 */}
            {idea.tags?.length > 0 && (
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {idea.tags.map(t=>(
                  <span key={t} style={{ fontSize:11, padding:'3px 9px', borderRadius:4, background:'var(--bg3)', color:'var(--t3)', fontFamily:'var(--f-mono)' }}>#{t}</span>
                ))}
              </div>
            )}

            {/* 통계 */}
            <div style={{ display:'flex', gap:18 }}>
              {[{Icon:ThumbsUp,v:likeCount,c:liked?'#F43F5E':'var(--t3)'},{Icon:MessageCircle,v:comments.length,c:'var(--t3)'},{Icon:Eye,v:idea.views,c:'var(--t3)'}].map(({Icon,v,c},i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:5, fontFamily:'var(--f-mono)', fontSize:12, color:c }}><Icon size={13}/>{v}</div>
              ))}
            </div>

            {/* 액션 버튼 */}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={handleLike}
                style={{ flex:1, padding:'10px', background:liked?'rgba(244,63,94,0.12)':'var(--bg3)', border:`1px solid ${liked?'rgba(244,63,94,0.3)':'var(--b1)'}`, borderRadius:9, color:liked?'#F43F5E':'var(--t2)', fontSize:13, fontFamily:'var(--f-sans)', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7, transition:'all .15s' }}>
                <ThumbsUp size={14}/>{liked?'응원 중!':'응원하기'}{likeCount > 0 && ` (${likeCount})`}
              </button>
              <button onClick={()=>navigate('/mentor')}
                style={{ flex:1, padding:'10px', background:`${idea.color}15`, border:`1px solid ${idea.color}30`, borderRadius:9, color:idea.color, fontSize:13, fontFamily:'var(--f-sans)', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                <Rocket size={14}/>AI 피드백 받기
              </button>
            </div>

            {/* 댓글 섹션 */}
            <div>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)', letterSpacing:'.1em', marginBottom:11 }}>
                💬 댓글{comments.length > 0 && ` (${comments.length})`}
              </div>
              {commLoading ? (
                <div style={{ textAlign:'center', padding:'18px 0', color:'var(--t4)', fontSize:12 }}>로딩 중...</div>
              ) : comments.length === 0 ? (
                <div style={{ textAlign:'center', padding:'14px 0', color:'var(--t4)', fontSize:12 }}>첫 댓글을 남겨보세요!</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:9, marginBottom:11 }}>
                  {comments.map(c => {
                    const isCommentOwner = user && (user.id === c.author_id || user.id === idea.authorId)
                    return (
                      <div key={c.id} style={{ display:'flex', gap:9, alignItems:'flex-start', padding:'10px 12px', background:'var(--bg3)', borderRadius:9, border:'1px solid var(--b0)' }}>
                        <div style={{ width:26, height:26, borderRadius:'50%', background:`${idea.color}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0, overflow:'hidden' }}>
                          {c.profiles?.avatar_url
                            ? <img src={c.profiles.avatar_url} style={{ width:26, height:26, borderRadius:'50%', objectFit:'cover' }} alt=""/>
                            : '💬'}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                            <span style={{ fontSize:12, fontWeight:600, color:'var(--t1)' }}>
                              {c.profiles?.display_name || c.profiles?.username || '익명'}
                            </span>
                            <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)' }}>
                              {format(new Date(c.created_at),'M/d HH:mm',{locale:ko})}
                            </span>
                            {/* 댓글 삭제 버튼 */}
                            {isCommentOwner && (
                              <button onClick={()=>setConfirm({ type:'comment', id:c.id })}
                                disabled={deletingComment===c.id}
                                style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'var(--t4)', padding:'2px 4px', display:'flex', alignItems:'center', flexShrink:0, opacity:deletingComment===c.id?0.4:1 }}>
                                {deletingComment===c.id
                                  ? <Loader2 size={11} style={{ animation:'spin 1s linear infinite' }}/>
                                  : <Trash2 size={11}/>}
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.6 }}>{c.content}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 댓글 입력 */}
              <div style={{ display:'flex', gap:9 }}>
                <input value={comment} onChange={e=>setComment(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),submitComment())}
                  placeholder={user?'응원 한마디 남기기... (Enter 전송)':'로그인 후 댓글을 달 수 있습니다'}
                  disabled={!user}
                  style={{ flex:1, padding:'9px 13px', background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:9, color:'var(--t1)', fontSize:13, fontFamily:'var(--f-sans)', outline:'none', opacity:user?1:.6 }}
                  onFocus={e=>e.target.style.borderColor=`${idea.color}40`} onBlur={e=>e.target.style.borderColor='var(--b1)'}/>
                <button onClick={submitComment} disabled={!user||!comment.trim()||submitting}
                  style={{ padding:'9px 15px', background:user&&comment.trim()?`linear-gradient(135deg,${idea.color},${idea.color}CC)`:'var(--bg4)', border:'none', borderRadius:9, color:user&&comment.trim()?'#fff':'var(--t4)', cursor:user&&comment.trim()?'pointer':'default', display:'flex', alignItems:'center', gap:5, transition:'all .15s' }}>
                  {submitting ? <Loader2 size={13} style={{ animation:'spin 1s linear infinite' }}/> : <Send size={14}/>}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 수정 모달 */}
      {showEdit && (
        <EditModal
          idea={idea}
          onClose={()=>setShowEdit(false)}
          onUpdated={updated=>{
            onIdeaUpdated?.(updated)
          }}
        />
      )}

      {/* 확인 다이얼로그 */}
      {confirm?.type==='idea' && (
        <ConfirmDialog
          message="아이디어를 삭제하시겠습니까? 삭제된 아이디어는 복구할 수 없습니다."
          danger
          onConfirm={deleteIdea}
          onCancel={()=>setConfirm(null)}
        />
      )}
      {confirm?.type==='comment' && (
        <ConfirmDialog
          message="댓글을 삭제하시겠습니까?"
          danger
          onConfirm={()=>deleteComment(confirm.id)}
          onCancel={()=>setConfirm(null)}
        />
      )}
    </>
  )
}

/* ── 아이디어 등록 모달 ───────────────────────────────────────────── */
function PostModal({ onClose, user, navigate, onSuccess }) {
  const [title,    setTitle]    = useState('')
  const [summary,  setSummary]  = useState('')
  const [category, setCategory] = useState('ai')
  const [stage,    setStage]    = useState('idea')
  const [seeking,  setSeeking]  = useState('')
  const [tags,     setTags]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [done,     setDone]     = useState(false)
  const [error,    setError]    = useState('')

  if (!user) return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:'100%', maxWidth:380, background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:14, padding:32, textAlign:'center' }}>
        <AlertCircle size={40} color="#F59E0B" style={{ marginBottom:16 }}/>
        <div style={{ fontFamily:'var(--f-display)', fontSize:18, fontWeight:700, color:'var(--t1)', marginBottom:10 }}>로그인이 필요합니다</div>
        <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:20 }}>
          <button onClick={onClose} style={{ padding:'9px 18px', background:'var(--bg4)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t2)', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)' }}>취소</button>
          <button onClick={()=>navigate('/login')} style={{ padding:'9px 18px', background:'linear-gradient(135deg,#3B82F6,#1D4ED8)', border:'none', borderRadius:8, color:'#fff', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)', fontWeight:600 }}>로그인</button>
        </div>
      </div>
    </div>
  )

  if (done) return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:'100%', maxWidth:380, background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:14, padding:32, textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:16 }}>💡</div>
        <div style={{ fontFamily:'var(--f-display)', fontSize:20, fontWeight:700, color:'var(--t1)', marginBottom:10 }}>아이디어 등록 완료!</div>
        <p style={{ color:'var(--t2)', fontSize:13, marginBottom:24 }}>다른 창업가들에게 공유됩니다.</p>
        <button onClick={onClose} style={{ padding:'10px 28px', background:'linear-gradient(135deg,#06B6D4,#0891B2)', border:'none', borderRadius:9, color:'#fff', fontSize:14, cursor:'pointer', fontFamily:'var(--f-sans)', fontWeight:700 }}>확인</button>
      </div>
    </div>
  )

  async function handleSubmit() {
    if (!title.trim() || !summary.trim()) return
    setLoading(true); setError('')
    try {
      const seekingArr = seeking.trim() ? seeking.split(',').map(s=>s.trim()).filter(Boolean) : []
      const tagsArr    = tags.trim()    ? tags.split(',').map(t=>t.trim()).filter(Boolean)    : []
      const { error: err } = await supabase.from('ideas').insert({
        title:         title.trim(),
        description:   summary.trim(),
        category, stage,
        author_id:     user.id,
        seeking_roles: seekingArr,
        tags:          tagsArr,
        is_public:     true,
        is_deleted:    false,
        like_count:    0,
        view_count:    0,
        comment_count: 0,
      })
      if (err) throw err
      setDone(true); onSuccess?.()
    } catch (e) {
      setError('등록 실패: ' + (e.message || '다시 시도해주세요'))
    }
    setLoading(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.88)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:'100%', maxWidth:560, background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:16, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,.85)' }}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--b1)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <div style={{ width:34, height:34, background:'rgba(6,182,212,0.12)', border:'1px solid rgba(6,182,212,.25)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Lightbulb size={15} color="#06B6D4"/>
            </div>
            <span style={{ fontFamily:'var(--f-display)', fontSize:15, fontWeight:700, color:'var(--t1)' }}>아이디어 등록</span>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t3)', padding:4 }}><X size={17}/></button>
        </div>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:13 }}>
          {error && (
            <div style={{ padding:'10px 13px', background:'rgba(244,63,94,.1)', border:'1px solid rgba(244,63,94,.25)', borderRadius:7, color:'#F43F5E', fontSize:12 }}>{error}</div>
          )}
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:5 }}>아이디어 제목 <span style={{ color:'#F43F5E' }}>*</span></div>
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="예: AI로 학교 급식 잔반 줄이는 앱" maxLength={100}
              style={{ width:'100%', padding:'10px 13px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontFamily:'var(--f-sans)', fontSize:14, outline:'none', boxSizing:'border-box' }}
              onFocus={e=>e.target.style.borderColor='rgba(6,182,212,.4)'} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:11 }}>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:5 }}>카테고리</div>
              <select value={category} onChange={e=>setCategory(e.target.value)}
                style={{ width:'100%', padding:'10px 13px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontSize:13, outline:'none', cursor:'pointer' }}>
                {CATEGORIES.filter(c=>c.id!=='all').map(c=><option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:5 }}>현재 단계</div>
              <select value={stage} onChange={e=>setStage(e.target.value)}
                style={{ width:'100%', padding:'10px 13px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontSize:13, outline:'none', cursor:'pointer' }}>
                {Object.entries(STAGE_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:5 }}>아이디어 설명 <span style={{ color:'#F43F5E' }}>*</span></div>
            <textarea value={summary} onChange={e=>setSummary(e.target.value)} placeholder="어떤 문제를 어떻게 해결하는지 간략히 설명해주세요 (최소 20자)" rows={4} maxLength={2000}
              style={{ width:'100%', padding:'10px 13px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontFamily:'var(--f-sans)', fontSize:14, outline:'none', resize:'vertical', boxSizing:'border-box', lineHeight:1.65 }}
              onFocus={e=>e.target.style.borderColor='rgba(6,182,212,.4)'} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
            <div style={{ fontSize:10, color:'var(--t4)', textAlign:'right', marginTop:2 }}>{summary.length}/2000</div>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:5 }}>팀원 모집 <span style={{ color:'var(--t4)', fontWeight:400 }}>(선택, 쉼표로 구분)</span></div>
            <input value={seeking} onChange={e=>setSeeking(e.target.value)} placeholder="예: 개발자, 디자이너, 마케터"
              style={{ width:'100%', padding:'10px 13px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontFamily:'var(--f-sans)', fontSize:14, outline:'none', boxSizing:'border-box' }}
              onFocus={e=>e.target.style.borderColor='rgba(6,182,212,.4)'} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:5 }}>태그 <span style={{ color:'var(--t4)', fontWeight:400 }}>(선택, 쉼표로 구분)</span></div>
            <input value={tags} onChange={e=>setTags(e.target.value)} placeholder="예: AI, 교육, 청소년"
              style={{ width:'100%', padding:'10px 13px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontFamily:'var(--f-sans)', fontSize:14, outline:'none', boxSizing:'border-box' }}
              onFocus={e=>e.target.style.borderColor='rgba(6,182,212,.4)'} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', paddingTop:4 }}>
            <button onClick={onClose} style={{ padding:'9px 18px', background:'var(--bg4)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t2)', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)' }}>취소</button>
            <button onClick={handleSubmit} disabled={loading||!title.trim()||!summary.trim()}
              style={{ padding:'9px 18px', background:'linear-gradient(135deg,#06B6D4,#0891B2)', border:'none', borderRadius:8, color:'#fff', fontSize:13, cursor:loading||!title.trim()||!summary.trim()?'not-allowed':'pointer', fontFamily:'var(--f-sans)', fontWeight:700, display:'flex', alignItems:'center', gap:6, opacity:loading||!title.trim()||!summary.trim()?0.7:1 }}>
              {loading ? <><Loader2 size={13} style={{ animation:'spin 1s linear infinite' }}/> 등록 중...</>
                       : <><Rocket size={13}/> 아이디어 공유하기</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Idea Card ────────────────────────────────────────────────────── */
function IdeaCard({ idea, onView }) {
  const [hov, setHov] = useState(false)
  const stage = STAGE_CONFIG[idea.stage] || STAGE_CONFIG.idea
  const cat   = CATEGORIES.find(c=>c.id===idea.category) || CATEGORIES[6]

  return (
    <div onClick={()=>onView(idea)}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:'var(--bg2)', border:`1px solid ${hov?idea.color+'45':'var(--b1)'}`, borderRadius:14, overflow:'hidden', cursor:'pointer', transition:'all .22s', transform:hov?'translateY(-4px)':'none', boxShadow:hov?`0 12px 36px rgba(0,0,0,.55),0 0 0 1px ${idea.color}18`:'none', display:'flex', flexDirection:'column', position:'relative' }}>
      <div style={{ height:3, background:`linear-gradient(90deg,${idea.color},${idea.color}60)` }}/>
      {idea.featured && (
        <div style={{ position:'absolute', top:12, right:12, fontSize:8, padding:'2px 7px', borderRadius:3, background:'rgba(255,215,0,0.15)', border:'1px solid rgba(255,215,0,0.3)', color:'#FFD700', fontFamily:'var(--f-mono)' }}>★ 주목</div>
      )}
      <div style={{ padding:'15px 17px', flex:1, display:'flex', flexDirection:'column', gap:9 }}>
        <div style={{ display:'flex', gap:5 }}>
          <span style={{ fontSize:8.5, padding:'2px 7px', borderRadius:3, background:stage.bg, color:stage.color, fontFamily:'var(--f-mono)', fontWeight:700 }}>{stage.label}</span>
          <span style={{ fontSize:8.5, padding:'2px 7px', borderRadius:3, background:`${cat.color}10`, color:cat.color, fontFamily:'var(--f-mono)' }}>{cat.emoji} {cat.label}</span>
        </div>
        <h3 style={{ fontFamily:'var(--f-display)', fontSize:15, fontWeight:700, color:'var(--t1)', lineHeight:1.4, margin:0, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {idea.title}
        </h3>
        <p style={{ fontSize:12.5, color:'var(--t3)', lineHeight:1.65, margin:0, flex:1, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {idea.description || idea.summary}
        </p>
        {idea.seeking?.length > 0 && (
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)' }}>모집:</span>
            {idea.seeking.slice(0,3).map(r=>(
              <span key={r} style={{ fontSize:10, padding:'2px 8px', borderRadius:4, background:`${idea.color}10`, border:`1px solid ${idea.color}22`, color:idea.color, fontFamily:'var(--f-sans)', fontWeight:600 }}>{r}</span>
            ))}
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:7, borderTop:'1px solid var(--b0)', marginTop:'auto' }}>
          <div style={{ display:'flex', gap:11 }}>
            {[[ThumbsUp,idea.likes],[MessageCircle,idea.comments],[Eye,idea.views]].map(([Icon,v],i)=>(
              <span key={i} style={{ display:'flex', alignItems:'center', gap:3, fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}><Icon size={10}/>{v||0}</span>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            {typeof idea.avatar==='string' && idea.avatar.startsWith('http')
              ? <img src={idea.avatar} style={{ width:15, height:15, borderRadius:'50%', objectFit:'cover' }} alt=""/>
              : <span style={{ fontSize:11 }}>{idea.avatar}</span>}
            <span style={{ fontFamily:'var(--f-sans)', fontSize:11, color:'var(--t3)' }}>{idea.author}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 스켈레톤 ─────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:14, overflow:'hidden' }}>
      <div style={{ height:3, background:'var(--bg4)' }}/>
      <div style={{ padding:'15px 17px', display:'flex', flexDirection:'column', gap:9 }}>
        <div style={{ display:'flex', gap:5 }}>
          <div style={{ width:55, height:16, borderRadius:3, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
          <div style={{ width:70, height:16, borderRadius:3, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
        </div>
        <div style={{ width:'85%', height:17, borderRadius:4, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
        <div style={{ width:'65%', height:17, borderRadius:4, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
        <div style={{ width:'100%', height:38, borderRadius:6, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
        <div style={{ borderTop:'1px solid var(--b0)', paddingTop:7, display:'flex', justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:9 }}>
            {[38,33,38].map((w,i)=><div key={i} style={{ width:w, height:13, borderRadius:3, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>)}
          </div>
          <div style={{ width:58, height:13, borderRadius:3, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
        </div>
      </div>
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────────── */
export default function IdeasPage() {
  const { user }  = useAuthStore()
  const navigate  = useNavigate()
  const [ideas, setIdeas]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [category, setCategory]         = useState('all')
  const [search, setSearch]             = useState('')
  const [sortBy, setSortBy]             = useState('popular')
  const [selectedIdea, setSelectedIdea] = useState(null)
  const [showPost, setShowPost]         = useState(false)

  const loadIdeas = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('ideas')
        .select('*, profiles(display_name,username,avatar_url,school)')
        .eq('is_public', true).eq('is_deleted', false)

      if (category !== 'all') q = q.eq('category', category)
      if (search.trim()) q = q.ilike('title', `%${search.trim()}%`)

      if (sortBy === 'popular') q = q.order('like_count', { ascending:false })
      else if (sortBy === 'new') q = q.order('created_at', { ascending:false })
      else if (sortBy === 'views') q = q.order('view_count', { ascending:false })
      q = q.limit(50)

      const { data, error } = await q
      if (error) throw error
      setIdeas((data||[]).map(normalizeIdea))
    } catch { setIdeas([]) }
    setLoading(false)
  }, [category, sortBy, search])

  useEffect(() => { loadIdeas() }, [loadIdeas])

  // ── 실시간 구독 — INSERT / UPDATE / DELETE ──────────────────────
  useEffect(() => {
    const sub = supabase
      .channel('ideas-realtime-v2')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'ideas' }, () => {
        loadIdeas()
      })
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'ideas' }, payload => {
        const updated = payload.new
        if (updated.is_deleted) {
          // 소프트 삭제 → 목록에서 제거
          setIdeas(prev => prev.filter(i => i.id !== updated.id))
          setSelectedIdea(prev => (prev?.id === updated.id ? null : prev))
        } else {
          // 수정 → 해당 아이디어 갱신 (profiles join은 없어 author 정보 유지)
          setIdeas(prev => prev.map(i => {
            if (i.id !== updated.id) return i
            return normalizeIdea({ ...i, ...updated, profiles: i.profiles })
          }))
          setSelectedIdea(prev => {
            if (!prev || prev.id !== updated.id) return prev
            return normalizeIdea({ ...prev, ...updated, profiles: prev.profiles })
          })
        }
      })
      .subscribe()
    return () => sub.unsubscribe()
  }, [loadIdeas])

  // ── 콜백들 ────────────────────────────────────────────────────────
  function handleLikeUpdate(ideaId, delta) {
    setIdeas(prev => prev.map(i => i.id===ideaId ? { ...i, likes:(i.likes||0)+delta } : i))
  }

  function handleIdeaUpdated(updated) {
    setIdeas(prev => prev.map(i => i.id===updated.id ? updated : i))
    setSelectedIdea(updated)
  }

  function handleIdeaDeleted(ideaId) {
    setIdeas(prev => prev.filter(i => i.id!==ideaId))
    setSelectedIdea(null)
  }

  const totalIdeas = ideas.length
  const totalLikes = ideas.reduce((a,i)=>a+(i.likes||0), 0)
  const teamWanted = ideas.filter(i=>i.seeking?.length>0).length

  return (
    <div style={{ minHeight:'100vh', paddingBottom:80 }}>
      <Helmet>
        <title>아이디어랩 | Insightship — 청소년 창업 아이디어 공유</title>
        <meta name="description" content="청소년 창업 아이디어를 공유하고 팀원을 모집하세요. AI 피드백, 좋아요, 댓글로 함께 아이디어를 발전시킵니다."/>
        <meta property="og:title" content="아이디어랩 | Insightship"/>
        <meta property="og:description" content="청소년 창업 아이디어 공유 플랫폼 — 팀원 모집, AI 피드백, 커뮤니티 응원"/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://insightship.vercel.app/ideas"/>
        <meta name="twitter:card" content="summary"/>
        <meta name="twitter:title" content="아이디어랩 | Insightship"/>
        <meta name="twitter:description" content="청소년 창업가의 아이디어를 공유하고 팀원을 모집하세요"/>
        <link rel="canonical" href="https://insightship.vercel.app/ideas"/>
      </Helmet>

      {/* ── HEADER ── */}
      <div style={{ background:'linear-gradient(180deg,rgba(6,182,212,0.07) 0%,transparent 100%)', borderBottom:'1px solid var(--b1)', padding:'30px var(--pad-x) 22px' }}>
        <div style={{ maxWidth:'var(--max-w)', margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20, flexWrap:'wrap' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:9 }}>
                <div style={{ width:42, height:42, borderRadius:11, background:'rgba(6,182,212,0.15)', border:'1px solid rgba(6,182,212,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Lightbulb size={20} color="#06B6D4"/>
                </div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#06B6D4', letterSpacing:'.16em' }}>INSIGHTSHIP · IDEA LAB</div>
              </div>
              <h1 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(22px,4vw,30px)', fontWeight:700, color:'var(--t1)', lineHeight:1.1, marginBottom:7 }}>아이디어랩</h1>
              <p style={{ color:'var(--t2)', fontSize:13.5, lineHeight:1.65, maxWidth:480, margin:0 }}>창업 아이디어를 공유하고 팀원을 모집하세요. 좋은 아이디어는 함께 만드는 것에서 시작합니다.</p>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:11, alignItems:'flex-end' }}>
              <button onClick={()=>setShowPost(true)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 20px', background:'linear-gradient(135deg,#06B6D4,#0891B2)', border:'none', borderRadius:10, color:'#fff', fontSize:14, fontFamily:'var(--f-sans)', fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(6,182,212,0.4)' }}>
                <Plus size={15}/> 아이디어 등록
              </button>
              <div style={{ display:'flex', gap:9 }}>
                {[{l:'아이디어',v:loading?'…':totalIdeas,c:'#06B6D4'},{l:'응원',v:loading?'…':totalLikes,c:'#F43F5E'},{l:'팀 모집',v:loading?'…':teamWanted,c:'#3B82F6'}].map((s,i)=>(
                  <div key={i} style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, padding:'7px 13px', textAlign:'center' }}>
                    <div style={{ fontFamily:'var(--f-mono)', fontSize:17, fontWeight:700, color:s.c, lineHeight:1 }}>{s.v}</div>
                    <div style={{ fontSize:9, color:'var(--t4)', marginTop:3 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:'var(--max-w)', margin:'0 auto', padding:'26px var(--pad-x)' }}>
        {/* 필터 바 */}
        <div style={{ display:'flex', gap:11, marginBottom:22, flexWrap:'wrap', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {CATEGORIES.map(c=>(
              <button key={c.id} onClick={()=>setCategory(c.id)}
                style={{ display:'flex', alignItems:'center', gap:4, padding:'7px 13px', borderRadius:8, cursor:'pointer', fontFamily:'var(--f-sans)', fontSize:12, fontWeight:category===c.id?600:400, background:category===c.id?`${c.color}12`:'var(--bg2)', color:category===c.id?c.color:'var(--t3)', border:`1px solid ${category===c.id?c.color+'35':'var(--b1)'}`, transition:'all .15s' }}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:7 }}>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
              style={{ padding:'7px 11px', background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t2)', fontSize:12, fontFamily:'var(--f-sans)', outline:'none', cursor:'pointer' }}>
              <option value="popular">인기순</option>
              <option value="new">최신순</option>
              <option value="views">조회순</option>
            </select>
            <div style={{ position:'relative' }}>
              <Search size={12} color="var(--t4)" style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)' }}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&loadIdeas()}
                placeholder="아이디어 검색..."
                style={{ padding:'7px 11px 7px 28px', background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t1)', fontSize:12, fontFamily:'var(--f-sans)', outline:'none', width:155 }}
                onFocus={e=>e.currentTarget.style.borderColor='rgba(6,182,212,.4)'} onBlur={e=>e.currentTarget.style.borderColor='var(--b1)'}/>
            </div>
          </div>
        </div>

        {/* 아이디어 그리드 */}
        {loading ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(295px,1fr))', gap:15, marginBottom:38 }}>
            {Array(6).fill(0).map((_,i)=><SkeletonCard key={i}/>)}
          </div>
        ) : ideas.length===0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t3)' }}>
            <Lightbulb size={40} style={{ marginBottom:16, opacity:.25 }}/>
            <div style={{ fontSize:15 }}>아직 아이디어가 없습니다</div>
            <div style={{ fontSize:13, marginTop:6 }}>첫 번째 아이디어를 등록해보세요!</div>
            <button onClick={()=>setShowPost(true)} style={{ marginTop:18, padding:'10px 22px', background:'linear-gradient(135deg,#06B6D4,#0891B2)', border:'none', borderRadius:9, color:'#fff', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)', fontWeight:600 }}>
              아이디어 등록하기
            </button>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(295px,1fr))', gap:15, marginBottom:38 }}>
            {ideas.map(idea=><IdeaCard key={idea.id} idea={idea} onView={setSelectedIdea}/>)}
          </div>
        )}

        {/* CTA */}
        <div style={{ padding:'26px 30px', background:'linear-gradient(135deg,rgba(6,182,212,0.07),rgba(59,130,246,0.04))', border:'1px solid rgba(6,182,212,0.2)', borderRadius:13, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:14 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--t1)', marginBottom:4 }}>💡 AI 멘토에게 아이디어 피드백 받기</div>
            <p style={{ fontSize:13, color:'var(--t3)', margin:0 }}>내 아이디어를 AI 멘토에게 보여주고 검증 피드백을 받아보세요.</p>
          </div>
          <button onClick={()=>navigate('/mentor')}
            style={{ padding:'10px 20px', background:'rgba(6,182,212,0.15)', border:'1px solid rgba(6,182,212,0.3)', borderRadius:9, color:'#06B6D4', fontSize:13, fontFamily:'var(--f-sans)', fontWeight:700, cursor:'pointer' }}>
            AI 멘토 바로가기 →
          </button>
        </div>
      </div>

      {selectedIdea && (
        <IdeaDetail
          idea={selectedIdea}
          onClose={()=>setSelectedIdea(null)}
          user={user}
          navigate={navigate}
          onLikeUpdate={handleLikeUpdate}
          onIdeaUpdated={handleIdeaUpdated}
          onIdeaDeleted={handleIdeaDeleted}
        />
      )}
      {showPost && (
        <PostModal
          onClose={()=>setShowPost(false)}
          user={user}
          navigate={navigate}
          onSuccess={loadIdeas}
        />
      )}

      <style>{`
        @keyframes spin  { to { transform:rotate(360deg) } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </div>
  )
}
