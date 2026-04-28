import { useState, useEffect, useCallback } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import {
  Lightbulb, Plus, ThumbsUp, MessageCircle, Search,
  Flame, CheckCircle, X, AlertCircle, Zap, Globe,
  Users, ArrowRight, Filter, Eye, Clock, Tag,
  TrendingUp, Award, Rocket, Send, Star, ChevronRight,
  Loader2
} from 'lucide-react'
import { useAuthStore } from '../store'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

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

// 카테고리별 색상 맵
const CAT_COLORS = {
  ai:'#A855F7', edu:'#F97316', social:'#22C55E',
  finance:'#F59E0B', health:'#F43F5E', other:'#06B6D4',
}

/* ── 아이디어 데이터 정규화 (DB→UI) ─────────────────────────────── */
function normalizeIdea(row) {
  const color = CAT_COLORS[row.category] || '#3B82F6'
  return {
    ...row,
    likes: row.like_count ?? 0,
    comments: row.comment_count ?? 0,
    views: row.view_count ?? 0,
    author: row.profiles?.display_name || row.profiles?.username || '익명',
    authorSchool: row.profiles?.school || '',
    avatar: row.profiles?.avatar_url || '💡',
    seeking: Array.isArray(row.seeking_roles) ? row.seeking_roles : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    color,
    featured: row.is_featured ?? false,
  }
}

/* ── Idea Detail Modal ────────────────────────────────────────────── */
function IdeaDetail({ idea, onClose, user, navigate, onLikeUpdate }) {
  const [liked, setLiked]       = useState(false)
  const [likeCount, setLikeCount] = useState(idea.likes || 0)
  const [comment, setComment]   = useState('')
  const [comments, setComments] = useState([])
  const [commLoading, setCommLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const stage = STAGE_CONFIG[idea.stage] || STAGE_CONFIG.idea
  const cat   = CATEGORIES.find(c=>c.id===idea.category) || CATEGORIES[6]

  // 이미 좋아요 했는지 확인
  useEffect(() => {
    if (!user || !idea.id) return
    supabase.from('idea_likes')
      .select('idea_id')
      .eq('user_id', user.id)
      .eq('idea_id', idea.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setLiked(true) })
  }, [user, idea.id])

  // 댓글 로드
  useEffect(() => {
    loadComments()
    // 조회수 증가
    supabase.from('ideas')
      .update({ view_count: (idea.views || 0) + 1 })
      .eq('id', idea.id)
      .then(() => {})
  }, [idea.id])

  async function loadComments() {
    setCommLoading(true)
    const { data } = await supabase.from('idea_comments')
      .select('*, profiles(display_name,username,avatar_url,school)')
      .eq('idea_id', idea.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
    setComments(data || [])
    setCommLoading(false)
  }

  async function handleLike() {
    if (!user) { navigate('/login'); return }
    if (liked) {
      // 좋아요 취소
      await supabase.from('idea_likes').delete()
        .eq('user_id', user.id).eq('idea_id', idea.id)
      await supabase.from('ideas')
        .update({ like_count: Math.max(0, likeCount - 1) })
        .eq('id', idea.id)
      setLiked(false)
      setLikeCount(v => Math.max(0, v - 1))
      onLikeUpdate?.(idea.id, -1)
    } else {
      // 좋아요 추가
      await supabase.from('idea_likes').insert({ user_id: user.id, idea_id: idea.id })
      await supabase.from('ideas')
        .update({ like_count: likeCount + 1 })
        .eq('id', idea.id)
      setLiked(true)
      setLikeCount(v => v + 1)
      onLikeUpdate?.(idea.id, 1)
    }
  }

  async function submitComment() {
    if (!user || !comment.trim()) return
    setSubmitting(true)
    const { data, error } = await supabase.from('idea_comments')
      .insert({ idea_id: idea.id, author_id: user.id, content: comment.trim() })
      .select('*, profiles(display_name,username,avatar_url,school)')
      .single()
    if (!error && data) {
      setComments(prev => [...prev, data])
      setComment('')
      // comment_count 업데이트
      await supabase.from('ideas')
        .update({ comment_count: (idea.comments || 0) + comments.length + 1 })
        .eq('id', idea.id)
    }
    setSubmitting(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, overflowY:'auto' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:'100%', maxWidth:660, background:'var(--bg2)', border:`1px solid ${idea.color}30`, borderRadius:16, overflow:'hidden', boxShadow:`0 24px 60px rgba(0,0,0,.85),0 0 0 1px ${idea.color}20`, maxHeight:'92vh', display:'flex', flexDirection:'column' }}>
        {/* Top accent */}
        <div style={{ height:4, background:`linear-gradient(90deg,${idea.color},${idea.color}60)` }}/>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--b1)', background:`linear-gradient(135deg,${idea.color}08,transparent)`, display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:9, padding:'2px 8px', borderRadius:3, background:`${cat.color}12`, color:cat.color, fontFamily:'var(--f-mono)', fontWeight:700 }}>{cat.emoji} {cat.label}</span>
              <span style={{ fontSize:9, padding:'2px 8px', borderRadius:3, background:stage.bg, color:stage.color, fontFamily:'var(--f-mono)', fontWeight:600 }}>{stage.label}</span>
            </div>
            <h2 style={{ fontFamily:'var(--f-display)', fontSize:19, fontWeight:700, color:'var(--t1)', lineHeight:1.35, margin:0 }}>{idea.title}</h2>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t3)', padding:4, flexShrink:0 }}><X size={18}/></button>
        </div>

        <div style={{ padding:'22px 24px', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:18 }}>
          {/* Author */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:38, height:38, borderRadius:'50%', background:`${idea.color}15`, border:`1px solid ${idea.color}25`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
              {typeof idea.avatar === 'string' && idea.avatar.startsWith('http')
                ? <img src={idea.avatar} style={{ width:38, height:38, borderRadius:'50%', objectFit:'cover' }} alt=""/>
                : idea.avatar}
            </div>
            <div>
              <div style={{ fontSize:13.5, fontWeight:600, color:'var(--t1)' }}>{idea.author}</div>
              <div style={{ fontSize:11, color:'var(--t3)' }}>{idea.authorSchool}</div>
            </div>
            <div style={{ marginLeft:'auto', fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}>
              {idea.created_at ? format(new Date(idea.created_at),'M월 d일',{locale:ko}) : ''}
            </div>
          </div>

          {/* Summary */}
          <div style={{ padding:'16px 18px', background:'var(--bg3)', borderRadius:10, borderLeft:`3px solid ${idea.color}` }}>
            <p style={{ fontSize:14, lineHeight:1.8, color:'var(--t1)', margin:0 }}>{idea.description || idea.summary}</p>
          </div>

          {/* Seeking */}
          {idea.seeking?.length > 0 && (
            <div>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)', letterSpacing:'.1em', marginBottom:8 }}>👥 팀원 모집 중</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {idea.seeking.map(r=>(
                  <span key={r} style={{ fontSize:12, padding:'5px 12px', borderRadius:20, background:`${idea.color}12`, border:`1px solid ${idea.color}28`, color:idea.color, fontFamily:'var(--f-sans)', fontWeight:600 }}>{r}</span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {idea.tags?.length > 0 && (
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {idea.tags.map(t=>(
                <span key={t} style={{ fontSize:11, padding:'3px 9px', borderRadius:4, background:'var(--bg3)', color:'var(--t3)', fontFamily:'var(--f-mono)' }}>#{t}</span>
              ))}
            </div>
          )}

          {/* Stats */}
          <div style={{ display:'flex', gap:20 }}>
            {[
              {Icon:ThumbsUp, v:likeCount, color:liked?'#F43F5E':'var(--t3)'},
              {Icon:MessageCircle, v:comments.length, color:'var(--t3)'},
              {Icon:Eye, v:idea.views, color:'var(--t3)'}
            ].map(({Icon,v,color},i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:5, fontFamily:'var(--f-mono)', fontSize:12, color }}><Icon size={13}/>{v}</div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={handleLike}
              style={{ flex:1, padding:'10px', background:liked?'rgba(244,63,94,0.12)':'var(--bg3)', border:`1px solid ${liked?'rgba(244,63,94,0.3)':'var(--b1)'}`, borderRadius:9, color:liked?'#F43F5E':'var(--t2)', fontSize:13, fontFamily:'var(--f-sans)', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7, transition:'all .15s' }}>
              <ThumbsUp size={14}/> {liked?'응원 중!':'응원하기'} {likeCount > 0 && `(${likeCount})`}
            </button>
            <button onClick={()=>navigate('/mentor')}
              style={{ flex:1, padding:'10px', background:`${idea.color}15`, border:`1px solid ${idea.color}30`, borderRadius:9, color:idea.color, fontSize:13, fontFamily:'var(--f-sans)', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
              <Rocket size={14}/> AI 피드백 받기
            </button>
          </div>

          {/* 댓글 섹션 */}
          <div>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)', letterSpacing:'.1em', marginBottom:12 }}>
              💬 댓글 {comments.length > 0 && `(${comments.length})`}
            </div>
            {commLoading ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:'var(--t4)', fontSize:12 }}>로딩 중...</div>
            ) : comments.length === 0 ? (
              <div style={{ textAlign:'center', padding:'16px 0', color:'var(--t4)', fontSize:12 }}>첫 댓글을 남겨보세요!</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:12 }}>
                {comments.map(c => (
                  <div key={c.id} style={{ display:'flex', gap:10 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:`${idea.color}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                      {c.profiles?.avatar_url
                        ? <img src={c.profiles.avatar_url} style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover' }} alt=""/>
                        : '💬'}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                        <span style={{ fontSize:12, fontWeight:600, color:'var(--t1)' }}>
                          {c.profiles?.display_name || c.profiles?.username || '익명'}
                        </span>
                        <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)' }}>
                          {format(new Date(c.created_at),'M/d HH:mm',{locale:ko})}
                        </span>
                      </div>
                      <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.6 }}>{c.content}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* 댓글 입력 */}
            <div style={{ display:'flex', gap:10 }}>
              <input value={comment} onChange={e=>setComment(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),submitComment())}
                placeholder={user?"응원 한마디 남기기... (Enter 전송)":"로그인 후 댓글을 달 수 있습니다"}
                disabled={!user}
                style={{ flex:1, padding:'9px 14px', background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:9, color:'var(--t1)', fontSize:13, fontFamily:'var(--f-sans)', outline:'none', opacity:user?1:.6, transition:'border-color .15s' }}
                onFocus={e=>e.target.style.borderColor=`${idea.color}40`} onBlur={e=>e.target.style.borderColor='var(--b1)'}/>
              <button onClick={submitComment} disabled={!user||!comment.trim()||submitting}
                style={{ padding:'9px 16px', background:user&&comment.trim()?`linear-gradient(135deg,${idea.color},${idea.color}CC)`:'var(--bg4)', border:'none', borderRadius:9, color:user&&comment.trim()?'#fff':'var(--t4)', fontSize:13, cursor:user&&comment.trim()?'pointer':'default', fontFamily:'var(--f-sans)', fontWeight:600, transition:'all .15s', display:'flex', alignItems:'center', gap:5 }}>
                {submitting ? <Loader2 size={13} style={{ animation:'spin 1s linear infinite' }}/> : <Send size={14}/>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Post Modal ───────────────────────────────────────────────────── */
function PostModal({ onClose, user, navigate, onSuccess }) {
  const [title, setTitle]       = useState('')
  const [summary, setSummary]   = useState('')
  const [category, setCategory] = useState('ai')
  const [stage, setStage]       = useState('idea')
  const [seeking, setSeeking]   = useState('')
  const [tags, setTags]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')

  if (!user) {
    return (
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
  }

  if (done) {
    return (
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
  }

  async function handleSubmit() {
    if (!title.trim() || !summary.trim()) return
    setLoading(true)
    setError('')
    try {
      const seekingArr = seeking.trim()
        ? seeking.split(',').map(s=>s.trim()).filter(Boolean)
        : []
      const tagsArr = tags.trim()
        ? tags.split(',').map(t=>t.trim()).filter(Boolean)
        : []
      const { error: err } = await supabase.from('ideas').insert({
        title: title.trim(),
        description: summary.trim(),
        category,
        stage,
        author_id: user.id,
        seeking_roles: seekingArr,
        tags: tagsArr,
        is_public: true,
        is_deleted: false,
        like_count: 0,
        view_count: 0,
        comment_count: 0,
      })
      if (err) throw err
      setDone(true)
      onSuccess?.()
    } catch (e) {
      setError('등록 실패: ' + (e.message || '다시 시도해주세요'))
    }
    setLoading(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:'100%', maxWidth:560, background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:16, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,.85)' }}>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--b1)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, background:'rgba(6,182,212,0.12)', border:'1px solid rgba(6,182,212,.25)', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Lightbulb size={16} color="#06B6D4"/>
            </div>
            <span style={{ fontFamily:'var(--f-display)', fontSize:16, fontWeight:700, color:'var(--t1)' }}>아이디어 등록</span>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t3)', padding:4 }}><X size={18}/></button>
        </div>
        <div style={{ padding:'22px', display:'flex', flexDirection:'column', gap:14 }}>
          {error && (
            <div style={{ padding:'10px 14px', background:'rgba(244,63,94,.1)', border:'1px solid rgba(244,63,94,.25)', borderRadius:7, color:'#F43F5E', fontSize:12 }}>{error}</div>
          )}
          {/* Title */}
          <div>
            <div style={{ fontFamily:'var(--f-sans)', fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:6 }}>아이디어 제목 <span style={{ color:'#F43F5E' }}>*</span></div>
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="예: AI로 학교 급식 잔반 줄이는 앱" maxLength={100}
              style={{ width:'100%', padding:'10px 14px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontFamily:'var(--f-sans)', fontSize:14, outline:'none', boxSizing:'border-box', transition:'border-color .15s' }}
              onFocus={e=>e.target.style.borderColor='rgba(6,182,212,.4)'} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
          </div>
          {/* Category + Stage */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <div style={{ fontFamily:'var(--f-sans)', fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:6 }}>카테고리</div>
              <select value={category} onChange={e=>setCategory(e.target.value)}
                style={{ width:'100%', padding:'10px 14px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontFamily:'var(--f-sans)', fontSize:13, outline:'none', cursor:'pointer' }}>
                {CATEGORIES.filter(c=>c.id!=='all').map(c=><option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontFamily:'var(--f-sans)', fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:6 }}>현재 단계</div>
              <select value={stage} onChange={e=>setStage(e.target.value)}
                style={{ width:'100%', padding:'10px 14px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontFamily:'var(--f-sans)', fontSize:13, outline:'none', cursor:'pointer' }}>
                {Object.entries(STAGE_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          {/* Summary */}
          <div>
            <div style={{ fontFamily:'var(--f-sans)', fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:6 }}>아이디어 설명 <span style={{ color:'#F43F5E' }}>*</span></div>
            <textarea value={summary} onChange={e=>setSummary(e.target.value)} placeholder="어떤 문제를 어떻게 해결하는지 간략히 설명해주세요 (최소 20자)" rows={4} maxLength={2000}
              style={{ width:'100%', padding:'10px 14px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontFamily:'var(--f-sans)', fontSize:14, outline:'none', resize:'vertical', boxSizing:'border-box', lineHeight:1.65, transition:'border-color .15s' }}
              onFocus={e=>e.target.style.borderColor='rgba(6,182,212,.4)'} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
            <div style={{ fontSize:10, color:'var(--t4)', textAlign:'right', marginTop:3 }}>{summary.length}/2000</div>
          </div>
          {/* Seeking */}
          <div>
            <div style={{ fontFamily:'var(--f-sans)', fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:6 }}>팀원 모집 <span style={{ color:'var(--t4)' }}>(선택, 쉼표로 구분)</span></div>
            <input value={seeking} onChange={e=>setSeeking(e.target.value)} placeholder="예: 개발자, 디자이너, 마케터"
              style={{ width:'100%', padding:'10px 14px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontFamily:'var(--f-sans)', fontSize:14, outline:'none', boxSizing:'border-box', transition:'border-color .15s' }}
              onFocus={e=>e.target.style.borderColor='rgba(6,182,212,.4)'} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
          </div>
          {/* Tags */}
          <div>
            <div style={{ fontFamily:'var(--f-sans)', fontSize:12, fontWeight:600, color:'var(--t3)', marginBottom:6 }}>태그 <span style={{ color:'var(--t4)' }}>(선택, 쉼표로 구분)</span></div>
            <input value={tags} onChange={e=>setTags(e.target.value)} placeholder="예: AI, 교육, 청소년"
              style={{ width:'100%', padding:'10px 14px', background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, color:'var(--t1)', fontFamily:'var(--f-sans)', fontSize:14, outline:'none', boxSizing:'border-box', transition:'border-color .15s' }}
              onFocus={e=>e.target.style.borderColor='rgba(6,182,212,.4)'} onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
          </div>
          {/* Actions */}
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', paddingTop:4 }}>
            <button onClick={onClose} style={{ padding:'9px 18px', background:'var(--bg4)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t2)', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)' }}>취소</button>
            <button onClick={handleSubmit}
              disabled={loading||!title.trim()||!summary.trim()}
              style={{ padding:'9px 18px', background:'linear-gradient(135deg,#06B6D4,#0891B2)', border:'none', borderRadius:8, color:'#fff', fontSize:13, cursor:loading||!title.trim()||!summary.trim()?'not-allowed':'pointer', fontFamily:'var(--f-sans)', fontWeight:700, display:'flex', alignItems:'center', gap:6, opacity:loading||!title.trim()||!summary.trim()?0.7:1, transition:'opacity .15s' }}>
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
    <div
      onClick={()=>onView(idea)}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background:'var(--bg2)', border:`1px solid ${hov?idea.color+'45':'var(--b1)'}`,
        borderRadius:14, overflow:'hidden', cursor:'pointer', transition:'all .22s',
        transform:hov?'translateY(-4px)':'none',
        boxShadow:hov?`0 12px 36px rgba(0,0,0,.55),0 0 0 1px ${idea.color}18`:'none',
        display:'flex', flexDirection:'column', position:'relative',
      }}>
      <div style={{ height:3, background:`linear-gradient(90deg,${idea.color},${idea.color}60)` }}/>
      {idea.featured && <div style={{ position:'absolute', top:12, right:12, fontSize:8, padding:'2px 7px', borderRadius:3, background:'rgba(255,215,0,0.15)', border:'1px solid rgba(255,215,0,0.3)', color:'#FFD700', fontFamily:'var(--f-mono)' }}>★ 주목</div>}

      <div style={{ padding:'16px 18px', flex:1, display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ display:'flex', gap:6 }}>
          <span style={{ fontSize:8.5, padding:'2px 8px', borderRadius:3, background:stage.bg, color:stage.color, fontFamily:'var(--f-mono)', fontWeight:700 }}>{stage.label}</span>
          <span style={{ fontSize:8.5, padding:'2px 8px', borderRadius:3, background:`${cat.color}10`, color:cat.color, fontFamily:'var(--f-mono)' }}>{cat.emoji} {cat.label}</span>
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
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--b0)', marginTop:'auto' }}>
          <div style={{ display:'flex', gap:12 }}>
            {[[ThumbsUp,idea.likes],[MessageCircle,idea.comments],[Eye,idea.views]].map(([Icon,v],i)=>(
              <span key={i} style={{ display:'flex', alignItems:'center', gap:3, fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}><Icon size={11}/>{v||0}</span>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:'var(--t4)' }}>
              {typeof idea.avatar === 'string' && idea.avatar.startsWith('http')
                ? <img src={idea.avatar} style={{ width:16, height:16, borderRadius:'50%', objectFit:'cover' }} alt=""/>
                : idea.avatar}
            </span>
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
      <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ display:'flex', gap:6 }}>
          <div style={{ width:55, height:17, borderRadius:3, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
          <div style={{ width:70, height:17, borderRadius:3, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
        </div>
        <div style={{ width:'85%', height:18, borderRadius:4, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
        <div style={{ width:'65%', height:18, borderRadius:4, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
        <div style={{ width:'100%', height:40, borderRadius:6, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
        <div style={{ borderTop:'1px solid var(--b0)', paddingTop:8, display:'flex', justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:10 }}>
            {[40,35,40].map((w,i)=><div key={i} style={{ width:w, height:14, borderRadius:3, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>)}
          </div>
          <div style={{ width:60, height:14, borderRadius:3, background:'var(--bg4)', animation:'pulse 1.5s infinite' }}/>
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
        .eq('is_public', true)
        .eq('is_deleted', false)

      if (category !== 'all') q = q.eq('category', category)
      if (search.trim()) q = q.ilike('title', `%${search.trim()}%`)

      if (sortBy === 'popular') q = q.order('like_count', { ascending: false })
      else if (sortBy === 'new') q = q.order('created_at', { ascending: false })
      else if (sortBy === 'views') q = q.order('view_count', { ascending: false })
      q = q.limit(50)

      const { data, error } = await q
      if (error) throw error
      setIdeas((data || []).map(normalizeIdea))
    } catch {
      // DB 미연결 시 빈 목록
      setIdeas([])
    }
    setLoading(false)
  }, [category, sortBy, search])

  useEffect(() => {
    loadIdeas()
  }, [loadIdeas])

  // 실시간 구독 (새 아이디어 추가 시)
  useEffect(() => {
    const sub = supabase
      .channel('ideas-realtime')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'ideas' }, () => {
        loadIdeas()
      })
      .subscribe()
    return () => sub.unsubscribe()
  }, [loadIdeas])

  function handleLikeUpdate(ideaId, delta) {
    setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, likes: (i.likes || 0) + delta } : i))
  }

  const totalIdeas  = ideas.length
  const totalLikes  = ideas.reduce((a,i) => a + (i.likes||0), 0)
  const teamWanted  = ideas.filter(i => i.seeking?.length > 0).length

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
      <div style={{ background:'linear-gradient(180deg,rgba(6,182,212,0.07) 0%,transparent 100%)', borderBottom:'1px solid var(--b1)', padding:'32px var(--pad-x) 24px' }}>
        <div style={{ maxWidth:'var(--max-w)', margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20, flexWrap:'wrap' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:42, height:42, borderRadius:11, background:'rgba(6,182,212,0.15)', border:'1px solid rgba(6,182,212,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Lightbulb size={20} color="#06B6D4"/>
                </div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#06B6D4', letterSpacing:'.16em' }}>INSIGHTSHIP · IDEA LAB</div>
              </div>
              <h1 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(24px,4vw,32px)', fontWeight:700, color:'var(--t1)', lineHeight:1.1, marginBottom:8 }}>아이디어랩</h1>
              <p style={{ color:'var(--t2)', fontSize:13.5, lineHeight:1.65, maxWidth:480, margin:0 }}>창업 아이디어를 공유하고 팀원을 모집하세요. 좋은 아이디어는 함께 만드는 것에서 시작합니다.</p>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12, alignItems:'flex-end' }}>
              <button onClick={()=>setShowPost(true)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 22px', background:'linear-gradient(135deg,#06B6D4,#0891B2)', border:'none', borderRadius:10, color:'#fff', fontSize:14, fontFamily:'var(--f-sans)', fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(6,182,212,0.4)', transition:'opacity .15s' }}
                onMouseEnter={e=>e.currentTarget.style.opacity='.85'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                <Plus size={16}/> 아이디어 등록
              </button>
              <div style={{ display:'flex', gap:10 }}>
                {[{l:'아이디어',v:loading?'…':totalIdeas,c:'#06B6D4'},{l:'응원',v:loading?'…':totalLikes,c:'#F43F5E'},{l:'팀 모집',v:loading?'…':teamWanted,c:'#3B82F6'}].map((s,i)=>(
                  <div key={i} style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:9, padding:'8px 14px', textAlign:'center' }}>
                    <div style={{ fontFamily:'var(--f-mono)', fontSize:18, fontWeight:700, color:s.c, lineHeight:1 }}>{s.v}</div>
                    <div style={{ fontSize:9, color:'var(--t4)', marginTop:3 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:'var(--max-w)', margin:'0 auto', padding:'28px var(--pad-x)' }}>
        {/* Filters */}
        <div style={{ display:'flex', gap:12, marginBottom:24, flexWrap:'wrap', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {CATEGORIES.map(c=>(
              <button key={c.id} onClick={()=>setCategory(c.id)}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, cursor:'pointer', fontFamily:'var(--f-sans)', fontSize:12, fontWeight:category===c.id?600:400,
                  background:category===c.id?`${c.color}12`:'var(--bg2)', color:category===c.id?c.color:'var(--t3)',
                  border:`1px solid ${category===c.id?c.color+'35':'var(--b1)'}`, transition:'all .15s' }}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
              style={{ padding:'7px 12px', background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t2)', fontSize:12, fontFamily:'var(--f-sans)', outline:'none', cursor:'pointer' }}>
              <option value="popular">인기순</option>
              <option value="new">최신순</option>
              <option value="views">조회순</option>
            </select>
            <div style={{ position:'relative' }}>
              <Search size={13} color="var(--t4)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&loadIdeas()}
                placeholder="아이디어 검색..."
                style={{ padding:'7px 12px 7px 30px', background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t1)', fontSize:12, fontFamily:'var(--f-sans)', outline:'none', width:160, transition:'border-color .15s' }}
                onFocus={e=>e.currentTarget.style.borderColor='rgba(6,182,212,.4)'} onBlur={e=>e.currentTarget.style.borderColor='var(--b1)'}/>
            </div>
          </div>
        </div>

        {/* Ideas Grid */}
        {loading ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16, marginBottom:40 }}>
            {Array(6).fill(0).map((_,i)=><SkeletonCard key={i}/>)}
          </div>
        ) : ideas.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t3)' }}>
            <Lightbulb size={40} style={{ marginBottom:16, opacity:.25 }}/>
            <div style={{ fontSize:15 }}>아직 아이디어가 없습니다</div>
            <div style={{ fontSize:13, marginTop:6 }}>첫 번째 아이디어를 등록해보세요!</div>
            <button onClick={()=>setShowPost(true)} style={{ marginTop:20, padding:'10px 22px', background:'linear-gradient(135deg,#06B6D4,#0891B2)', border:'none', borderRadius:9, color:'#fff', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)', fontWeight:600 }}>
              아이디어 등록하기
            </button>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16, marginBottom:40 }}>
            {ideas.map(idea=><IdeaCard key={idea.id} idea={idea} onView={setSelectedIdea}/>)}
          </div>
        )}

        {/* CTA */}
        <div style={{ padding:'28px 32px', background:'linear-gradient(135deg,rgba(6,182,212,0.07),rgba(59,130,246,0.04))', border:'1px solid rgba(6,182,212,0.2)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--t1)', marginBottom:4 }}>💡 AI 멘토에게 아이디어 피드백 받기</div>
            <p style={{ fontSize:13, color:'var(--t3)', margin:0 }}>내 아이디어를 AI 멘토에게 보여주고 검증 피드백을 받아보세요.</p>
          </div>
          <button onClick={()=>navigate('/mentor')}
            style={{ padding:'11px 22px', background:'rgba(6,182,212,0.15)', border:'1px solid rgba(6,182,212,0.3)', borderRadius:9, color:'#06B6D4', fontSize:13, fontFamily:'var(--f-sans)', fontWeight:700, cursor:'pointer' }}>
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
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  )
}
