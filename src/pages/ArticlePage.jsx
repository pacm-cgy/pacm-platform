import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Heart, Bookmark, Share2, ArrowLeft, Clock, Eye, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useArticle } from '../hooks/useArticle'
import { useLikeArticle, useToggleBookmark, useIsBookmarked } from '../hooks/useData'
import { useAuthStore } from '../store'

const CATEGORY_LABELS = {
  insight: 'INSIGHT', story: 'FOUNDER STORY', trend: 'TREND',
  magazine: 'MAGAZINE', community: 'COMMUNITY', opinion: 'OPINION', news: 'NEWS',
}
const CATEGORY_COLORS = {
  funding: '#D4AF37', ai: '#38bdf8', ai_startup: '#38bdf8', edutech: '#f97316',
  youth: '#a78bfa', entrepreneurship: '#34d399', unicorn: '#f472b6',
  climate: '#4ade80', health: '#fb7185', fintech: '#60a5fa', general: '#9ca3af',
}

function renderMarkdown(text) {
  if (!text) return ''
  return text.split('\n').map(line => {
    if (line.startsWith('### ')) return `<h3 style="font-family:var(--f-serif);font-size:17px;font-weight:700;margin:22px 0 8px;color:var(--c-paper)">${md(line.slice(4))}</h3>`
    if (line.startsWith('## ')) return `<h2 style="font-family:var(--f-serif);font-size:19px;font-weight:700;margin:28px 0 10px;color:var(--c-paper);border-bottom:1px solid var(--c-border);padding-bottom:7px">${md(line.slice(3))}</h2>`
    if (line.startsWith('# ')) return `<h1 style="font-family:var(--f-serif);font-size:22px;font-weight:700;margin:32px 0 12px;color:var(--c-paper)">${md(line.slice(2))}</h1>`
    if (line.match(/^[*-] /)) return `<li style="margin:5px 0;color:var(--c-gray-7);line-height:1.8;margin-left:18px">${md(line.slice(2))}</li>`
    if (line.match(/^---+$/)) return `<hr style="border:none;border-top:1px solid var(--c-border);margin:18px 0"/>`
    if (line.trim() === '') return '<br/>'
    return `<p style="margin:0 0 12px;color:var(--c-gray-7);line-height:1.9;font-size:16px">${md(line)}</p>`
  }).join('')
}
function md(t) {
  return t.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--c-paper);font-weight:700">$1</strong>')
         .replace(/`([^`]+)`/g, '<code style="background:var(--c-gray-2);padding:1px 5px;font-family:var(--f-mono);font-size:13px">$1</code>')
}

function BookmarkButton({ articleId }) {
  const { data: isBookmarked = false } = useIsBookmarked(articleId)
  const toggle = useToggleBookmark()
  const { user } = useAuthStore()
  return (
    <button className="btn btn-outline" style={{ gap:'6px', color:isBookmarked?'var(--c-gold)':undefined, borderColor:isBookmarked?'var(--c-gold)':undefined }}
      onClick={() => { if (!user) { alert('로그인이 필요합니다'); return } toggle.mutate({ articleId, isBookmarked }) }}
      disabled={toggle.isPending}>
      <Bookmark size={14} fill={isBookmarked?'currentColor':'none'} />
      {isBookmarked ? '저장됨' : '북마크'}
    </button>
  )
}

export default function ArticlePage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { data: article, isLoading, isError } = useArticle(slug)
  const [progress, setProgress] = useState(0)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const likeMutation = useLikeArticle()
  const { user } = useAuthStore()

  // 페이지 타이틀
  useEffect(() => {
    if (article?.title) document.title = `${article.title} — Insightship`
    return () => { document.title = 'Insightship — 청소년 창업 플랫폼' }
  }, [article?.title])

  useEffect(() => {
    if (article) setLikeCount(article.like_count || 0)
  }, [article])

  // 스크롤 프로그레스
  useEffect(() => {
    const handler = () => {
      const el = document.documentElement
      const pct = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100
      setProgress(Math.min(100, pct || 0))
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const handleLike = () => {
    if (!user) return
    const next = !liked
    setLiked(next)
    setLikeCount(c => next ? c+1 : c-1)
    likeMutation.mutate({ articleId: article.id, liked })
  }

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: article.title, url: window.location.href })
    } else {
      navigator.clipboard?.writeText(window.location.href)
      alert('링크가 복사됐습니다')
    }
  }

  if (isLoading) return (
    <div style={{ maxWidth:'740px', margin:'0 auto', padding:'40px var(--pad-x) 80px' }}>
      {[...Array(6)].map((_,i) => (
        <div key={i} className="skeleton" style={{ width:['55%','100%','90%','100%','75%','45%'][i], height:i===0?'30px':i===1?'20px':'15px', marginBottom:'16px', borderRadius:'2px' }}/>
      ))}
    </div>
  )

  if (isError || !article) return (
    <div style={{ textAlign:'center', padding:'80px 20px' }}>
      <div style={{ fontSize:'48px', marginBottom:'16px' }}>404</div>
      <div style={{ fontFamily:'var(--f-serif)', fontSize:'20px', marginBottom:'16px', color:'var(--c-paper)' }}>
        아티클을 찾을 수 없습니다
      </div>
      <button className="btn btn-gold" onClick={() => navigate(-1)}>돌아가기</button>
    </div>
  )

  const isNews = !!article.source_name
  const catColor = CATEGORY_COLORS[article.ai_category] || 'var(--c-gold)'

  // AI 요약 최대 2000자 처리
  const summary = article.ai_summary
    ? article.ai_summary.slice(0, 2000)
    : null

  return (
    <>
      {/* Reading Progress Bar */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height:'3px', background:'var(--c-gray-2)', zIndex:200, pointerEvents:'none' }}>
        <div style={{ height:'100%', width:`${progress}%`, background:'var(--c-gold)', transition:'width 0.1s linear' }}/>
      </div>

      <div style={{ maxWidth:'740px', margin:'0 auto', padding:'32px var(--pad-x) 80px' }}>

        {/* 뒤로가기 */}
        <button onClick={() => navigate(-1)} className="btn btn-ghost"
          style={{ marginBottom:'24px', paddingLeft:0, gap:'6px', display:'flex', alignItems:'center' }}>
          <ArrowLeft size={14}/> 뒤로
        </button>

        {/* 카테고리 배지 */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'16px', flexWrap:'wrap' }}>
          <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', letterSpacing:'2px', color:catColor, border:`1px solid ${catColor}`, padding:'3px 9px' }}>
            {CATEGORY_LABELS[article.category] || 'NEWS'}
          </span>
          {article.source_name && (
            <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-gray-5)', letterSpacing:'0.5px' }}>
              {article.source_name}
            </span>
          )}
        </div>

        {/* 제목 */}
        <h1 style={{ fontFamily:'var(--f-serif)', fontSize:'clamp(20px,4vw,32px)', fontWeight:700, lineHeight:1.3, marginBottom:'20px', color:'var(--c-paper)' }}>
          {article.title}
        </h1>

        {/* 메타 정보 */}
        <div style={{ display:'flex', alignItems:'center', gap:'14px', padding:'14px 0', borderTop:'1px solid var(--c-border)', borderBottom:'1px solid var(--c-border)', marginBottom:'32px', flexWrap:'wrap' }}>
          <div className="avatar avatar-md" style={{ flexShrink:0 }}>
            {article.profiles?.avatar_url
              ? <img src={article.profiles.avatar_url} alt=""/>
              : (article.profiles?.display_name?.[0] || 'I')}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'13px', fontWeight:600, color:'var(--c-paper)' }}>
              {article.profiles?.display_name || 'Insightship 에디터'}
            </div>
            {article.profiles?.startup_name && (
              <div style={{ fontSize:'11px', color:'var(--c-muted)' }}>{article.profiles.startup_name}</div>
            )}
          </div>
          <div style={{ display:'flex', gap:'12px', alignItems:'center', fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-muted)', flexShrink:0 }}>
            {article.published_at && (
              <span>{format(new Date(article.published_at), 'yyyy.MM.dd', { locale: ko })}</span>
            )}
            {article.read_time && (
              <span style={{ display:'flex', alignItems:'center', gap:'3px' }}>
                <Clock size={11}/>{article.read_time}분
              </span>
            )}
            <span style={{ display:'flex', alignItems:'center', gap:'3px' }}>
              <Eye size={11}/>{article.view_count || 0}
            </span>
          </div>
        </div>

        {/* ── 뉴스 아티클: AI 요약 본문 ── */}
        {isNews ? (
          <div>
            {summary ? (
              <>
                {/* AI 요약 배지 */}
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'20px', padding:'10px 16px', background:'rgba(249,115,22,0.08)', border:'1px solid rgba(249,115,22,0.2)' }}>
                  <span style={{ fontSize:'14px' }}>✨</span>
                  <span style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-gold)', letterSpacing:'0.5px' }}>
                    AI가 청소년 눈높이에 맞게 요약한 내용입니다
                  </span>
                </div>

                {/* AI 요약 본문 (최대 2000자) */}
                <div style={{ fontSize:'16px', lineHeight:1.95, color:'var(--c-gray-7)', letterSpacing:'-0.01em' }}>
                  {summary.split('\n').map((para, i) =>
                    para.trim()
                      ? <p key={i} style={{ marginBottom:'18px' }}>{para}</p>
                      : null
                  )}
                </div>
              </>
            ) : (
              /* 요약 없는 경우 본문 표시 */
              <div style={{ fontSize:'15px', lineHeight:1.85, color:'var(--c-gray-7)' }}>
                {(article.body || article.excerpt || '').split('\n').map((para, i) =>
                  para.trim() ? <p key={i} style={{ marginBottom:'14px' }}>{para}</p> : null
                )}
              </div>
            )}

            {/* 원문 보기 버튼 */}
            {article.source_url && (
              <div style={{ marginTop:'36px', padding:'20px 24px', background:'var(--c-gray-1)', border:'1px solid var(--c-border)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-gold)', letterSpacing:'1.5px', marginBottom:'4px' }}>
                    ORIGINAL SOURCE
                  </div>
                  <div style={{ fontSize:'13px', color:'var(--c-muted)' }}>
                    {article.source_name} — 원문 전체 읽기
                  </div>
                </div>
                <a href={article.source_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-gold"
                  style={{ fontSize:'13px', gap:'6px', textDecoration:'none', flexShrink:0, display:'flex', alignItems:'center' }}>
                  <ExternalLink size={14}/> 원문 보기
                </a>
              </div>
            )}
          </div>
        ) : (
          /* ── 일반 아티클: 마크다운 렌더링 ── */
          <>
            {article.cover_image && (
              <div style={{ marginBottom:'28px' }}>
                <img src={article.cover_image} alt={article.title} style={{ width:'100%', border:'1px solid var(--c-border)' }}/>
              </div>
            )}
            <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body || article.excerpt || '') }}/>
          </>
        )}

        {/* 태그 */}
        {article.tags?.length > 0 && (
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'32px', paddingTop:'20px', borderTop:'1px solid var(--c-border)' }}>
            {article.tags.map(t => <span key={t} className="tag">{t}</span>)}
          </div>
        )}

        {/* 액션 버튼 */}
        <div style={{ display:'flex', gap:'10px', marginTop:'24px', paddingTop:'20px', borderTop:'1px solid var(--c-border)', flexWrap:'wrap' }}>
          <button onClick={handleLike} className="btn btn-outline"
            style={{ color:liked?'var(--c-red)':undefined, borderColor:liked?'var(--c-red)44':undefined, gap:'6px' }}>
            <Heart size={14} fill={liked?'currentColor':'none'}/> {likeCount}
          </button>
          {article.id && <BookmarkButton articleId={article.id} />}
          <button onClick={handleShare} className="btn btn-outline" style={{ gap:'6px', marginLeft:'auto' }}>
            <Share2 size={14}/> 공유
          </button>
        </div>
      </div>
    </>
  )
}
