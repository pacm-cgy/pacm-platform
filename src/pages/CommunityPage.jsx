import React, { useState, useEffect, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import {
  MessageCircle, Heart, Eye, PenSquare, AlertCircle, Pin,
  ChevronRight, Search, X, Flame, Filter, Users, TrendingUp,
  Clock, ArrowUpRight, Hash, CheckCircle, Star, Zap, Plus,
  RefreshCw, ThumbsUp, Flag, MoreVertical
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { usePosts, useCreatePost, useHotPosts } from '../hooks/useData'
import { useAuthStore } from '../store'
import { validateInput, checkRateLimit } from '../lib/security'

const POST_TYPES = [
  { id:'all',      label:'전체',      color:'var(--t2)' },
  { id:'notice',   label:'공지',      color:'#F43F5E' },
  { id:'question', label:'질문/답변', color:'#3B82F6' },
  { id:'feedback', label:'피드백',    color:'#60A5FA' },
  { id:'recruit',  label:'팀원 모집', color:'#22C55E' },
  { id:'free',     label:'자유',      color:'var(--t2)' },
]
const TYPE_LABELS = { question:'질문', feedback:'피드백', recruit:'팀원 모집', free:'자유', notice:'공지' }
const TYPE_COLORS = { question:'#3B82F6', feedback:'#60A5FA', recruit:'#22C55E', free:'var(--t3)', notice:'#F43F5E' }

function timeAgo(d) {
  if (!d) return ''
  const s = (Date.now()-new Date(d))/1000
  if (s<3600) return `${Math.floor(s/60)}분 전`
  if (s<86400) return `${Math.floor(s/3600)}시간 전`
  if (s<604800) return `${Math.floor(s/86400)}일 전`
  try { return format(new Date(d),'M월 d일',{locale:ko}) } catch { return '' }
}

function Sk({ h=16, w='100%', r=6 }) {
  return <div style={{ height:h, width:w, background:'var(--bg3)',
    borderRadius:r, animation:'skPulse 1.6s ease-in-out infinite' }}/>
}

/* ── Report Modal ─────────────────────────────────── */
function ReportModal({ targetType, targetId, onClose }) {
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const { user } = useAuthStore()

  const submit = async () => {
    if (!reason.trim() || reason.trim().length < 10) { alert('신고 사유를 10자 이상 입력해주세요'); return }
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, reason: reason.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || '신고 실패')
      setDone(true)
      setTimeout(onClose, 1500)
    } catch(e) {
      alert('신고 실패: ' + (e.message?.slice(0, 60) || '오류'))
    } finally { setSending(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'var(--bg2)', border:'1px solid rgba(244,63,94,0.3)', borderRadius:14, padding:24, width:'100%', maxWidth:440, boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <Flag size={16} color="#F43F5E"/>
          <span style={{ fontFamily:'var(--f-display)', fontSize:16, fontWeight:700, color:'var(--t1)' }}>신고하기</span>
          <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--t4)', cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        {done ? (
          <div style={{ textAlign:'center', padding:'20px 0', color:'#22C55E', fontFamily:'var(--f-mono)', fontSize:13 }}>
            ✅ 신고가 접수되었습니다. 관리자가 검토합니다.
          </div>
        ) : (
          <>
            <p style={{ fontSize:13, color:'var(--t3)', lineHeight:1.6, marginBottom:14 }}>
              부적절한 콘텐츠(스팸, 욕설, 불법 정보 등)를 신고해주세요.
            </p>
            <div style={{ marginBottom:8 }}>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)', marginBottom:6, letterSpacing:'1px' }}>신고 사유 *</div>
              <textarea value={reason} onChange={e=>setReason(e.target.value)}
                placeholder="신고 사유를 구체적으로 입력해주세요 (스팸, 욕설, 불법 정보 등)"
                rows={4} maxLength={500}
                style={{ width:'100%', padding:'10px 12px', background:'var(--bg3)', border:'1px solid var(--b1)', color:'var(--t1)', fontSize:13, fontFamily:'var(--f-sans)', resize:'vertical', outline:'none', borderRadius:8, boxSizing:'border-box' }}/>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)', textAlign:'right', marginTop:4 }}>{reason.length}/500</div>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={onClose} style={{ padding:'9px 16px', background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:8, color:'var(--t2)', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)' }}>취소</button>
              <button onClick={submit} disabled={sending || reason.length < 10}
                style={{ padding:'9px 18px', background: reason.length < 10 ? 'rgba(244,63,94,0.3)' : 'rgba(244,63,94,0.9)', border:'1px solid rgba(244,63,94,0.4)', borderRadius:8, color:'#fff', fontSize:13, cursor: reason.length < 10 ? 'not-allowed' : 'pointer', fontFamily:'var(--f-sans)', fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                {sending ? '접수 중...' : <><Flag size={12}/> 신고 접수</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Post card ──────────────────────────────────────── */
function PostCard({ post, onReport }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [hov, setHov] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const author = post.profiles
  const tc = TYPE_COLORS[post.post_type]||'var(--t3)'
  const isNotice = post.post_type==='notice'
  const isRecruit = post.post_type==='recruit'
  const isAuthor = user?.id === post.author_id

  const handleCardClick = (e) => {
    if (e.target.closest('[data-action]')) return
    navigate(`/community/${post.id}`)
  }

  return (
    <div onClick={handleCardClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>{setHov(false);setMenuOpen(false)}}
      style={{ padding:'16px 20px', background:hov?'var(--bg3)':'var(--bg2)',
        border:`1px solid ${hov?(isNotice?'rgba(244,63,94,0.35)':isRecruit?'rgba(34,197,94,0.3)':'var(--b2)'):'var(--b1)'}`,
        borderRadius:12, cursor:'pointer', transition:'all .2s',
        borderLeft:`3px solid ${isNotice?'#F43F5E':isRecruit?'#22C55E':'transparent'}`,
        background:isNotice?'rgba(244,63,94,0.025)':hov?'var(--bg3)':'var(--bg2)',
        transform:hov?'translateX(2px)':'none', position:'relative' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          {post.is_pinned && (
            <span style={{ display:'flex', alignItems:'center', gap:3,
              fontFamily:'var(--f-mono)', fontSize:9, color:'#F43F5E',
              border:'1px solid rgba(244,63,94,.3)', padding:'1px 6px', borderRadius:3 }}>
              <Pin size={8}/> 고정
            </span>
          )}
          <span style={{ fontFamily:'var(--f-mono)', fontSize:9.5, letterSpacing:'.04em',
            color:tc, border:`1px solid ${tc}30`, padding:'1px 7px', borderRadius:3,
            background:`${tc}0d` }}>
            {TYPE_LABELS[post.post_type]||post.post_type}
          </span>
        </div>
        <span style={{ fontFamily:'var(--f-mono)', fontSize:9.5, color:'var(--t3)', whiteSpace:'nowrap', flexShrink:0 }}>
          {timeAgo(post.created_at)}
        </span>
      </div>
      <h3 style={{ fontFamily:'var(--f-display)', fontSize:14.5, fontWeight:700,
        lineHeight:1.42, color:hov?'var(--t1)':'var(--t1)', marginBottom:5,
        transition:'color .15s' }}>{post.title}</h3>
      {(post.body||post.content) && (
        <p style={{ fontSize:12.5, color:'var(--t2)', lineHeight:1.65,
          display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical',
          overflow:'hidden', marginBottom:10 }}>
          {post.body||post.content}
        </p>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:22, height:22, borderRadius:'50%',
          background:'var(--bg4)', border:'1px solid var(--b1)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:10, color:'var(--t3)', fontWeight:700, flexShrink:0,
          overflow:'hidden' }}>
          {author?.avatar_url
            ? <img src={author.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            : (author?.display_name?.[0]||'U')
          }
        </div>
        <span style={{ fontSize:12, color:'var(--t2)', flex:1, minWidth:0,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {author?.display_name||'익명'}
        </span>
        <div style={{ display:'flex', gap:12, flexShrink:0, alignItems:'center' }}>
          {[[Eye,post.view_count||0],[ThumbsUp,post.like_count||0],[MessageCircle,post.reply_count||post.comment_count||0]].map(([Icon,count],i)=>(
            <span key={i} style={{ display:'flex', alignItems:'center', gap:3,
              fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)' }}>
              <Icon size={10}/>{count}
            </span>
          ))}
          {/* 신고 버튼 (작성자 제외, 로그인한 경우만) */}
          {user && !isAuthor && (
            <div data-action style={{ position:'relative' }}>
              <button data-action
                onClick={e=>{e.stopPropagation();setMenuOpen(p=>!p)}}
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t4)', padding:'2px 4px', display:'flex', alignItems:'center', borderRadius:4, opacity: hov ? 1 : 0, transition:'opacity .15s' }}
                title="더보기">
                <MoreVertical size={13}/>
              </button>
              {menuOpen && (
                <div data-action style={{ position:'absolute', right:0, bottom:'100%', marginBottom:4, background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, boxShadow:'0 4px 16px rgba(0,0,0,0.3)', zIndex:100, minWidth:110 }}>
                  <button data-action
                    onClick={e=>{e.stopPropagation();setMenuOpen(false);onReport&&onReport(post.id)}}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', color:'#F43F5E', fontSize:13, fontFamily:'var(--f-sans)', whiteSpace:'nowrap' }}>
                    <Flag size={12}/> 신고하기
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── 간단 마크다운 렌더러 ─────────────────────────────── */
function MdPreview({ text }) {
  if (!text) return <span style={{ color:'var(--t4)', fontSize:13 }}>미리보기가 여기에 표시됩니다...</span>
  const lines = text.split('\n')
  return (
    <div style={{ fontSize:13.5, lineHeight:1.75, color:'var(--t1)' }}>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height:8 }}/>
        // ## 헤딩
        if (line.startsWith('## ')) return (
          <div key={i} style={{ fontFamily:'var(--f-display)', fontSize:15, fontWeight:700, color:'var(--t1)', margin:'12px 0 4px', borderBottom:'1px solid var(--b1)', paddingBottom:4 }}>
            {line.slice(3)}
          </div>
        )
        // # 헤딩
        if (line.startsWith('# ')) return (
          <div key={i} style={{ fontFamily:'var(--f-display)', fontSize:18, fontWeight:700, color:'var(--t1)', margin:'14px 0 6px' }}>
            {line.slice(2)}
          </div>
        )
        // --- 구분선
        if (line.trim() === '---') return <hr key={i} style={{ border:'none', borderTop:'1px solid var(--b1)', margin:'10px 0' }}/>
        // > 인용
        if (line.startsWith('> ')) return (
          <div key={i} style={{ borderLeft:'3px solid #3B82F6', paddingLeft:12, color:'var(--t2)', margin:'6px 0', fontStyle:'italic' }}>
            {line.slice(2)}
          </div>
        )
        // - 리스트
        if (line.startsWith('- ') || line.startsWith('* ')) return (
          <div key={i} style={{ display:'flex', gap:8, marginBottom:3 }}>
            <span style={{ color:'#3B82F6', flexShrink:0, marginTop:2 }}>•</span>
            <span>{renderInline(line.slice(2))}</span>
          </div>
        )
        // 코드블럭 (단순)
        if (line.startsWith('`') && line.endsWith('`') && line.length > 2) return (
          <code key={i} style={{ display:'inline-block', background:'var(--bg4)', border:'1px solid var(--b1)', borderRadius:5, padding:'2px 8px', fontFamily:'var(--f-mono)', fontSize:12, color:'#A855F7', margin:'2px 0' }}>
            {line.slice(1,-1)}
          </code>
        )
        return <div key={i} style={{ marginBottom:2 }}>{renderInline(line)}</div>
      })}
    </div>
  )
}

function renderInline(text) {
  // **bold**, *italic*, `code`
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2,-2)}</strong>
    if (p.startsWith('*') && p.endsWith('*')) return <em key={i} style={{ color:'var(--t2)' }}>{p.slice(1,-1)}</em>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} style={{ background:'var(--bg4)', border:'1px solid var(--b1)', borderRadius:4, padding:'1px 5px', fontFamily:'var(--f-mono)', fontSize:11.5, color:'#A855F7' }}>{p.slice(1,-1)}</code>
    return p
  })
}

/* ── Write modal ────────────────────────────────────── */
function WriteModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState('question')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [editorTab, setEditorTab] = useState('write') // 'write' | 'preview'

  const submit = async e => {
    e.preventDefault()
    if (!title.trim()||!body.trim()) { setErr('제목과 내용을 입력해주세요.'); return }
    if (body.trim().length < 10) { setErr('내용은 최소 10자 이상 입력해주세요.'); return }
    setLoading(true); setErr('')
    try { await onSubmit({ title:title.trim(), body:body.trim(), post_type:type }); onClose() }
    catch(e) { setErr(e.message||'오류가 발생했습니다.') }
    finally { setLoading(false) }
  }

  // 빠른 서식 삽입 헬퍼
  const textareaRef = React.useRef(null)
  function insertFormat(before, after='') {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const sel = body.slice(start, end) || '텍스트'
    const newBody = body.slice(0, start) + before + sel + after + body.slice(end)
    setBody(newBody)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + before.length, start + before.length + sel.length)
    }, 10)
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:500,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={onClose}>
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.75)',
        backdropFilter:'blur(8px)' }}/>
      <div onClick={e=>e.stopPropagation()}
        style={{ width:'100%', maxWidth:620, background:'var(--bg2)',
          border:'1px solid var(--b2)', borderRadius:16,
          boxShadow:'0 24px 80px rgba(0,0,0,0.9)', position:'relative',
          animation:'fadeUp .22s ease', maxHeight:'92vh', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--b1)',
          display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <PenSquare size={16} color="#22C55E"/>
            <div style={{ fontFamily:'var(--f-sans)', fontSize:16, fontWeight:700, color:'var(--t1)' }}>
              새 게시글 작성
            </div>
          </div>
          <button onClick={onClose}
            style={{ background:'none', border:'none', cursor:'pointer',
              color:'var(--t3)', padding:4, display:'flex' }}>
            <X size={18}/>
          </button>
        </div>
        <form onSubmit={submit} style={{ padding:'18px 24px', display:'flex', flexDirection:'column', gap:14, overflowY:'auto', flex:1 }}>
          {/* Type selector */}
          <div>
            <div style={{ fontSize:11, color:'var(--t3)', fontFamily:'var(--f-sans)', fontWeight:600, marginBottom:7 }}>게시글 유형</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {POST_TYPES.filter(t=>t.id!=='all'&&t.id!=='notice').map(t=>(
                <button key={t.id} type="button" onClick={()=>setType(t.id)}
                  style={{ padding:'5px 13px', background:type===t.id?t.color:'var(--bg3)',
                    border:`1px solid ${type===t.id?t.color:'var(--b1)'}`,
                    borderRadius:20, color:type===t.id?'#fff':'var(--t3)',
                    fontSize:12, fontFamily:'var(--f-sans)', cursor:'pointer',
                    transition:'all .15s', fontWeight:type===t.id?700:400 }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize:11, color:'var(--t3)', fontFamily:'var(--f-sans)', fontWeight:600, marginBottom:7 }}>제목 <span style={{ color:'#F43F5E' }}>*</span></div>
            <input value={title} onChange={e=>setTitle(e.target.value)}
              placeholder="제목을 입력하세요"
              maxLength={100}
              style={{ width:'100%', padding:'11px 14px', background:'var(--bg3)',
                border:'1px solid var(--b1)', borderRadius:9,
                color:'var(--t1)', fontSize:14, fontFamily:'var(--f-sans)',
                outline:'none', transition:'border-color .2s', boxSizing:'border-box' }}
              onFocus={e=>e.target.style.borderColor='rgba(59,130,246,0.5)'}
              onBlur={e=>e.target.style.borderColor='var(--b1)'}/>
          </div>
          {/* 에디터 탭 */}
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
              <div style={{ fontSize:11, color:'var(--t3)', fontFamily:'var(--f-sans)', fontWeight:600 }}>
                내용 <span style={{ color:'#F43F5E' }}>*</span>
                <span style={{ marginLeft:8, color:'var(--t4)', fontWeight:400 }}>마크다운 지원</span>
              </div>
              {/* 탭 전환 */}
              <div style={{ display:'flex', background:'var(--bg3)', borderRadius:8, border:'1px solid var(--b1)', padding:2, gap:2 }}>
                {[['write','✏️ 작성'],['preview','👁 미리보기']].map(([v,label])=>(
                  <button key={v} type="button" onClick={()=>setEditorTab(v)}
                    style={{ padding:'4px 10px', borderRadius:6, border:'none', cursor:'pointer', fontSize:11,
                      background:editorTab===v?'var(--bg2)':'transparent',
                      color:editorTab===v?'var(--t1)':'var(--t3)',
                      fontFamily:'var(--f-sans)', fontWeight:editorTab===v?600:400,
                      boxShadow:editorTab===v?'0 1px 3px rgba(0,0,0,.3)':'none',
                      transition:'all .15s' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {/* 서식 버튼 바 */}
            {editorTab === 'write' && (
              <div style={{ display:'flex', gap:4, marginBottom:6, flexWrap:'wrap' }}>
                {[
                  { label:'B', tip:'굵게', fn:()=>insertFormat('**','**') },
                  { label:'I', tip:'기울임', fn:()=>insertFormat('*','*') },
                  { label:'`', tip:'코드', fn:()=>insertFormat('`','`') },
                  { label:'H2', tip:'소제목', fn:()=>insertFormat('## ') },
                  { label:'•', tip:'목록', fn:()=>insertFormat('- ') },
                  { label:'>', tip:'인용', fn:()=>insertFormat('> ') },
                ].map(btn=>(
                  <button key={btn.label} type="button" title={btn.tip} onClick={btn.fn}
                    style={{ padding:'3px 9px', background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:5, color:'var(--t2)', fontSize:12, fontFamily:btn.label==='B'?'var(--f-display)':'var(--f-mono)', fontWeight:btn.label==='B'?700:400, cursor:'pointer', transition:'all .12s' }}
                    onMouseEnter={e=>{ e.currentTarget.style.background='var(--bg4)'; e.currentTarget.style.color='var(--t1)' }}
                    onMouseLeave={e=>{ e.currentTarget.style.background='var(--bg3)'; e.currentTarget.style.color='var(--t2)' }}>
                    {btn.label}
                  </button>
                ))}
              </div>
            )}
            {editorTab === 'write' ? (
              <textarea ref={textareaRef} value={body} onChange={e=>setBody(e.target.value)}
                placeholder={'내용을 입력하세요 (최소 10자)\n\n마크다운 문법 사용 가능:\n**굵게**, *기울임*, `코드`, ## 소제목, - 목록, > 인용'}
                rows={7}
                style={{ width:'100%', padding:'11px 14px', background:'var(--bg3)',
                  border:'1px solid var(--b1)', borderRadius:9,
                  color:'var(--t1)', fontSize:13, fontFamily:'var(--f-mono)',
                  outline:'none', resize:'vertical', lineHeight:1.7,
                  transition:'border-color .2s', boxSizing:'border-box' }}
                onFocus={e=>e.target.style.borderColor='rgba(59,130,246,0.5)'}
                onBlur={e=>e.target.style.borderColor='var(--b1)'}/>
            ) : (
              <div style={{ minHeight:160, padding:'12px 14px', background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:9, overflowY:'auto' }}>
                <MdPreview text={body}/>
              </div>
            )}
            <div style={{ fontSize:10, color:'var(--t4)', textAlign:'right', marginTop:3 }}>{body.length}자</div>
          </div>
          {err && (
            <div style={{ display:'flex', alignItems:'center', gap:8,
              padding:'9px 14px', background:'rgba(244,63,94,0.08)',
              border:'1px solid rgba(244,63,94,0.25)', borderRadius:8 }}>
              <AlertCircle size={14} color="#F43F5E"/>
              <span style={{ fontSize:13, color:'#F43F5E' }}>{err}</span>
            </div>
          )}
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button type="button" onClick={onClose}
              style={{ padding:'10px 18px', background:'var(--bg3)', border:'1px solid var(--b1)',
                borderRadius:9, color:'var(--t2)', fontSize:14, fontFamily:'var(--f-sans)',
                cursor:'pointer' }}>취소</button>
            <button type="submit" disabled={loading}
              style={{ padding:'10px 22px', background:'linear-gradient(135deg,#3B82F6,#1D4ED8)',
                border:'none', borderRadius:9, color:'#fff', fontSize:14,
                fontFamily:'var(--f-sans)', fontWeight:700, cursor:loading?'not-allowed':'pointer',
                opacity:loading?.7:1, display:'flex', alignItems:'center', gap:6,
                boxShadow:'0 4px 14px rgba(59,130,246,0.3)' }}>
              {loading?<><div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,.3)',
                borderTop:'2px solid #fff', borderRadius:'50%', animation:'spin .8s linear infinite' }}/>게시 중...</>
                :<>게시하기 <ArrowUpRight size={14}/></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────── */
export default function CommunityPage() {
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const [tab, setTab] = useState('all')
  const [sort, setSort] = useState('latest')
  const [query, setQuery] = useState('')
  const [searchOn, setSearchOn] = useState(false)
  const [showWrite, setShowWrite] = useState(false)
  const [page, setPage] = useState(0)
  const [reportTarget, setReportTarget] = useState(null) // { type, id }

  const { data:posts=[], isLoading } = usePosts({ type:tab==='all'?undefined:tab, page })
  const createPost = useCreatePost()
  const { data:hotPosts=[] } = useHotPosts(5)

  const handleWrite = async data => {
    if (!user) { navigate('/login'); return }
    await createPost.mutateAsync(data)
  }

  const filtered = query
    ? posts.filter(p=>p.title?.toLowerCase().includes(query.toLowerCase())||
        (p.body||p.content||'').toLowerCase().includes(query.toLowerCase()))
    : posts

  const typeStats = {
    question: posts.filter(p=>p.post_type==='question').length,
    recruit: posts.filter(p=>p.post_type==='recruit').length,
    feedback: posts.filter(p=>p.post_type==='feedback').length,
  }

  return (
    <div style={{ maxWidth:'var(--max-w)', margin:'0 auto',
      padding:'0 var(--pad-x)', paddingBottom:80 }}>
      <Helmet>
        <title>커뮤니티 | Insightship — 청소년 창업 커뮤니티</title>
        <meta name="description" content="청소년 창업가들의 진짜 질문, 피드백, 팀원 모집. 아이디어를 공유하고 함께 성장하는 창업 커뮤니티."/>
        <meta property="og:title" content="커뮤니티 | Insightship"/>
        <meta property="og:description" content="청소년 창업가들의 질문·피드백·팀원 모집 커뮤니티"/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://insightship.vercel.app/community"/>
        <meta name="twitter:card" content="summary"/>
        <meta name="twitter:title" content="커뮤니티 | Insightship"/>
        <meta name="twitter:description" content="청소년 창업가들의 질문, 피드백, 팀원 모집 커뮤니티"/>
        <link rel="canonical" href="https://insightship.vercel.app/community"/>
      </Helmet>

      {/* ── PAGE HEADER ── */}
      <div style={{ padding:'36px 0 24px', borderBottom:'1px solid var(--b1)', marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between',
          gap:16, flexWrap:'wrap' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <div style={{ width:3, height:18, background:'linear-gradient(to bottom,#22C55E,#16A34A)',
                borderRadius:2 }}/>
              <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#22C55E',
                letterSpacing:'.16em' }}>INSIGHTSHIP · COMMUNITY</span>
            </div>
            <h1 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(26px,4vw,38px)',
              fontWeight:900, color:'var(--t1)', lineHeight:1.1, marginBottom:8,
              letterSpacing:'-.03em' }}>커뮤니티</h1>
            <p style={{ fontSize:14, color:'var(--t2)', lineHeight:1.65 }}>
              청소년 창업가들의 진짜 질문, 피드백, 팀원 모집
            </p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {searchOn ? (
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <input autoFocus value={query} onChange={e=>setQuery(e.target.value)}
                  placeholder="게시글 검색..."
                  style={{ padding:'9px 14px', background:'var(--bg3)',
                    border:'1px solid var(--b2)', borderRadius:9,
                    color:'var(--t1)', fontSize:13, outline:'none', width:200,
                    fontFamily:'var(--f-sans)' }}
                  onFocus={e=>e.target.style.borderColor='rgba(34,197,94,0.5)'}
                  onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
                <button onClick={()=>{ setSearchOn(false); setQuery('') }}
                  style={{ background:'var(--bg3)', border:'1px solid var(--b1)',
                    borderRadius:9, padding:'9px 11px', cursor:'pointer',
                    color:'var(--t3)', display:'flex' }}>
                  <X size={14}/>
                </button>
              </div>
            ) : (
              <button onClick={()=>setSearchOn(true)}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 14px',
                  background:'var(--bg3)', border:'1px solid var(--b1)',
                  borderRadius:9, color:'var(--t2)', fontSize:13, cursor:'pointer',
                  fontFamily:'var(--f-sans)', transition:'all .15s' }}>
                <Search size={14}/> 검색
              </button>
            )}
            <button onClick={()=>{ if (!user) navigate('/login'); else setShowWrite(true) }}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px',
                background:'linear-gradient(135deg,#22C55E,#16A34A)', border:'none',
                borderRadius:9, color:'#fff', fontSize:13, fontFamily:'var(--f-sans)',
                fontWeight:700, cursor:'pointer', transition:'all .2s',
                boxShadow:'0 4px 16px rgba(34,197,94,0.3)' }}
              onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 6px 22px rgba(34,197,94,0.45)' }}
              onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='0 4px 16px rgba(34,197,94,0.3)' }}>
              <Plus size={15}/> 글쓰기
            </button>
          </div>
        </div>
      </div>

      {/* ── 2-col layout ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:24 }}>

        {/* Main feed */}
        <div>
          {/* Tabs */}
          <div style={{ display:'flex', gap:4, marginBottom:16, overflowX:'auto',
            scrollbarWidth:'none', paddingBottom:2 }}>
            {POST_TYPES.map(t=>(
              <button key={t.id} onClick={()=>{ setTab(t.id); setPage(0) }}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
                  background:tab===t.id?t.color:'transparent',
                  border:`1px solid ${tab===t.id?t.color:'var(--b1)'}`,
                  borderRadius:8, color:tab===t.id?'#fff':'var(--t3)',
                  fontSize:12, fontFamily:'var(--f-sans)', fontWeight:tab===t.id?700:400,
                  cursor:'pointer', whiteSpace:'nowrap', transition:'all .18s', flexShrink:0,
                  boxShadow:tab===t.id?`0 4px 12px ${t.color}35`:'none' }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)' }}>
              {isLoading?'로딩 중...':`${filtered.length}개 게시글`}
            </div>
            <div style={{ display:'flex', gap:4 }}>
              {[['latest','최신순'],['popular','인기순']].map(([id,label])=>(
                <button key={id} onClick={()=>setSort(id)}
                  style={{ padding:'5px 10px', background:sort===id?'var(--bg4)':'none',
                    border:`1px solid ${sort===id?'var(--b2)':'transparent'}`,
                    borderRadius:6, color:sort===id?'var(--t1)':'var(--t3)',
                    fontSize:11, cursor:'pointer', fontFamily:'var(--f-mono)',
                    transition:'all .15s' }}>{label}
                </button>
              ))}
            </div>
          </div>

          {/* Posts */}
          {isLoading ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {Array(6).fill(0).map((_,i)=>(
                <div key={i} style={{ padding:'16px 20px', background:'var(--bg2)',
                  border:'1px solid var(--b1)', borderRadius:12,
                  display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <Sk h={10} w="25%" r={4}/><Sk h={10} w="15%" r={4}/>
                  </div>
                  <Sk h={16} r={5}/><Sk h={12} w="80%" r={4}/>
                  <div style={{ display:'flex', gap:8 }}><Sk h={10} w="20%" r={3}/><Sk h={10} w="15%" r={3}/></div>
                </div>
              ))}
            </div>
          ) : filtered.length===0 ? (
            <div style={{ textAlign:'center', padding:'64px 20px', color:'var(--t3)' }}>
              <MessageCircle size={48} style={{ marginBottom:16, opacity:.22 }}/>
              <div style={{ fontSize:15, fontWeight:600, marginBottom:6, color:'var(--t2)' }}>
                {query?`"${query}" 검색 결과가 없습니다`:'아직 게시글이 없습니다'}
              </div>
              <div style={{ fontSize:13 }}>첫 번째 게시글을 작성해보세요!</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              {filtered.map(p=><PostCard key={p.id} post={p} onReport={id=>setReportTarget({type:'post',id})}/>)}
            </div>
          )}

          {/* Pagination */}
          {!isLoading&&filtered.length>=20 && (
            <div style={{ display:'flex', justifyContent:'center', gap:10, marginTop:28 }}>
              {page>0 && (
                <button onClick={()=>setPage(p=>p-1)}
                  style={{ padding:'10px 20px', background:'var(--bg3)', border:'1px solid var(--b1)',
                    borderRadius:9, color:'var(--t2)', fontSize:13, cursor:'pointer',
                    fontFamily:'var(--f-sans)', transition:'all .15s' }}>
                  ← 이전
                </button>
              )}
              <button onClick={()=>setPage(p=>p+1)}
                style={{ padding:'10px 20px', background:'linear-gradient(135deg,#22C55E,#16A34A)',
                  border:'none', borderRadius:9, color:'#fff', fontSize:13, cursor:'pointer',
                  fontFamily:'var(--f-sans)', fontWeight:700, transition:'opacity .15s',
                  boxShadow:'0 4px 14px rgba(34,197,94,0.3)' }}
                onMouseEnter={e=>e.currentTarget.style.opacity='.85'}
                onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                더 보기 →
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Stats */}
          <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)',
            borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t3)',
              letterSpacing:'.14em', marginBottom:14, textTransform:'uppercase' }}>
              커뮤니티 현황
            </div>
            {[
              { label:'전체 게시글', val:posts.length||0, color:'#3B82F6', icon:MessageCircle },
              { label:'질문/답변', val:typeStats.question||0, color:'#A855F7', icon:Zap },
              { label:'팀원 모집', val:typeStats.recruit||0, color:'#22C55E', icon:Users },
              { label:'피드백', val:typeStats.feedback||0, color:'#F59E0B', icon:ThumbsUp },
            ].map(s=>(
              <div key={s.label} style={{ display:'flex', alignItems:'center', gap:10,
                padding:'9px 0', borderBottom:'1px solid var(--b0)' }}>
                <div style={{ width:28, height:28, borderRadius:7,
                  background:`${s.color}12`, border:`1px solid ${s.color}22`,
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <s.icon size={13} color={s.color}/>
                </div>
                <span style={{ fontSize:12, color:'var(--t2)', flex:1 }}>{s.label}</span>
                <span style={{ fontFamily:'var(--f-mono)', fontSize:13, fontWeight:700,
                  color:'var(--t1)' }}>{s.val}</span>
              </div>
            ))}
          </div>

          {/* 🔥 Hot Posts */}
          {hotPosts.length > 0 && (
            <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)',
              borderRadius:14, padding:'18px 20px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6,
                fontFamily:'var(--f-mono)', fontSize:9, color:'#F43F5E',
                letterSpacing:'.14em', marginBottom:14, textTransform:'uppercase' }}>
                <Flame size={11} color="#F43F5E"/> 이번 주 핫 게시글
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {hotPosts.map((p,i) => (
                  <div key={p.id} onClick={()=>navigate(`/community/${p.id}`)}
                    style={{ display:'flex', gap:8, cursor:'pointer', padding:'6px 0',
                      borderBottom:'1px solid var(--b0)', transition:'all .15s' }}
                    onMouseEnter={e=>e.currentTarget.style.opacity='.75'}
                    onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                    <span style={{ fontFamily:'var(--f-mono)', fontSize:11, fontWeight:700,
                      color:i===0?'#F43F5E':i===1?'#F59E0B':'var(--t4)', minWidth:14, flexShrink:0 }}>
                      {i+1}
                    </span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'var(--t1)',
                        lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis',
                        display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                        {p.title}
                      </div>
                      <div style={{ display:'flex', gap:8, marginTop:3 }}>
                        <span style={{ display:'flex', alignItems:'center', gap:2,
                          fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)' }}>
                          <ThumbsUp size={8}/>{p.like_count||0}
                        </span>
                        <span style={{ display:'flex', alignItems:'center', gap:2,
                          fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)' }}>
                          <MessageCircle size={8}/>{p.reply_count||0}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Write CTA */}
          <div style={{ background:'linear-gradient(135deg,rgba(34,197,94,0.1),rgba(16,185,129,0.06))',
            border:'1px solid rgba(34,197,94,0.25)', borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#22C55E',
              letterSpacing:'.1em', marginBottom:10 }}>💬 참여하세요</div>
            <p style={{ fontSize:13, color:'var(--t2)', lineHeight:1.7, marginBottom:14 }}>
              창업 아이디어를 공유하고, 동료 창업가의 피드백을 받아보세요.
            </p>
            <button onClick={()=>{ if (!user) navigate('/login'); else setShowWrite(true) }}
              style={{ width:'100%', padding:'10px', background:'rgba(34,197,94,0.15)',
                border:'1px solid rgba(34,197,94,0.3)', borderRadius:9,
                color:'#22C55E', fontSize:13, fontFamily:'var(--f-sans)',
                fontWeight:700, cursor:'pointer', transition:'all .15s',
                display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(34,197,94,0.25)'}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(34,197,94,0.15)'}>
              <Plus size={14}/> {user ? '글 작성하기' : '로그인하고 글 쓰기'}
            </button>
          </div>

          {/* Popular tags */}
          <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)',
            borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t3)',
              letterSpacing:'.14em', marginBottom:14, textTransform:'uppercase' }}>
              인기 태그
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {['#창업아이디어','#AI스타트업','#팀원모집','#MVP','#투자','#핀테크','#에듀테크','#마케팅'].map((tag,i)=>{
                const colors=['#3B82F6','#A855F7','#22C55E','#F59E0B','#F43F5E','#06B6D4','#F97316','#818CF8']
                const c = colors[i%8]
                return (
                  <span key={tag} style={{ fontSize:11, padding:'3px 9px', borderRadius:12,
                    background:`${c}10`, border:`1px solid ${c}22`, color:c,
                    cursor:'pointer', transition:'all .15s' }}
                    onMouseEnter={e=>{ e.currentTarget.style.background=`${c}22`; e.currentTarget.style.transform='scale(1.05)' }}
                    onMouseLeave={e=>{ e.currentTarget.style.background=`${c}10`; e.currentTarget.style.transform='none' }}>
                    {tag}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {showWrite && (
        <WriteModal onClose={()=>setShowWrite(false)} onSubmit={handleWrite}/>
      )}

      {/* 신고 모달 */}
      {reportTarget && (
        <ReportModal
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          onClose={()=>setReportTarget(null)}
        />
      )}

      <style>{`
        @keyframes skPulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @media(max-width:900px){
          div[style*="grid-template-columns: 1fr 280px"] { grid-template-columns:1fr!important; }
        }
      `}</style>
    </div>
  )
}
