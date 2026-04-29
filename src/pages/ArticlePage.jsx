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
const ARTICLE_CATEGORY_COLOR = {
  insight: '#818cf8', story: '#c4b5fd', trend: '#fb923c',
  magazine: '#38bdf8', community: '#34d399', opinion: '#fb7185', news: '#9ca3af',
}
const ARTICLE_CATEGORY_BG = {
  insight: 'rgba(99,102,241,0.12)', story: 'rgba(139,92,246,0.12)',
  trend: 'rgba(249,115,22,0.12)', magazine: 'rgba(56,189,248,0.12)',
  community: 'rgba(16,185,129,0.12)', opinion: 'rgba(244,63,94,0.12)',
  news: 'rgba(156,163,175,0.12)',
}
const CATEGORY_COLORS = {
  funding: '#D4AF37', ai: '#38bdf8', ai_startup: '#38bdf8', edutech: '#f97316',
  youth: '#a78bfa', entrepreneurship: '#34d399', unicorn: '#f472b6',
  climate: '#4ade80', health: '#fb7185', fintech: '#60a5fa', general: '#9ca3af',
}

function parseBold(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  if (parts.length === 1) return text
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} style={{ color:'var(--t1)', fontWeight:700 }}>{p.slice(2,-2)}</strong>
    }
    return p
  })
}

// ── LongBlack 스타일 롱폼 렌더러 ──────────────────────────────────────
function renderLongformSummary(text) {
  if (!text) return null
  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const t = lines[i].trim()

    // 빈 줄 스킵
    if (!t) { i++; continue }

    // --- 구분선 → 섹션 스페이서
    if (t === '---') {
      elements.push(
        <div key={`hr-${i}`} style={{ margin:'40px 0 32px', display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ flex:1, height:'1px', background:'var(--b1)' }}/>
          <div style={{ width:'4px', height:'4px', background:'var(--t3)', borderRadius:'50%', opacity:0.4 }}/>
          <div style={{ flex:1, height:'1px', background:'var(--b1)' }}/>
        </div>
      )
      i++; continue
    }

    // ## 섹션 헤더 (이모지 포함)
    if (t.startsWith('## ')) {
      const heading = t.slice(3).trim()
      elements.push(
        <div key={`h2-${i}`} style={{
          display:'flex', alignItems:'center', gap:'10px',
          margin:'0 0 20px',
          fontFamily:'var(--f-serif)', fontSize:'clamp(16px,3vw,20px)',
          fontWeight:700, color:'var(--t1)', lineHeight:1.35,
        }}>
          {heading}
        </div>
      )
      i++; continue
    }

    // > 인용 블록 (핵심 문장 강조)
    if (t.startsWith('> ')) {
      const content = t.slice(2).trim()
      elements.push(
        <blockquote key={`bq-${i}`} style={{
          margin:'0 0 20px',
          padding:'14px 20px',
          borderLeft:'3px solid var(--amber, #D4AF37)',
          background:'rgba(212,175,55,0.06)',
          borderRadius:'0 4px 4px 0',
        }}>
          <p style={{ margin:0, lineHeight:1.9, color:'var(--t1)', fontSize:'15px', fontStyle:'italic' }}>
            {parseBold(content)}
          </p>
        </blockquote>
      )
      i++; continue
    }

    // → 액션 포인트 라인
    if (t.startsWith('→ ')) {
      elements.push(
        <div key={`arrow-${i}`} style={{
          display:'flex', gap:'12px', margin:'0 0 16px',
          padding:'14px 18px',
          background:'rgba(99,102,241,0.08)',
          border:'1px solid rgba(99,102,241,0.2)',
          borderRadius:'4px',
        }}>
          <span style={{ color:'#818cf8', flexShrink:0, fontSize:'15px', marginTop:'1px' }}>→</span>
          <span style={{ color:'var(--t2)', lineHeight:1.85, fontSize:'14px' }}>{parseBold(t.slice(2).trim())}</span>
        </div>
      )
      i++; continue
    }

    // • 불릿 리스트
    if (t.startsWith('• ')) {
      elements.push(
        <div key={`bullet-${i}`} style={{
          display:'flex', gap:'10px', margin:'0 0 10px', paddingLeft:'4px',
        }}>
          <span style={{ color:'var(--amber, #D4AF37)', flexShrink:0, marginTop:'7px', fontSize:'6px' }}>◆</span>
          <span style={{ color:'var(--t2)', lineHeight:1.85, fontSize:'14.5px' }}>{parseBold(t.slice(2).trim())}</span>
        </div>
      )
      i++; continue
    }

    // **볼드 전체 줄** → 서브 헤더 역할
    if (t.startsWith('**') && t.endsWith('**') && t.length > 4 && !t.slice(2,-2).includes('**')) {
      const label = t.slice(2, -2)
      elements.push(
        <div key={`bold-${i}`} style={{
          fontFamily:'var(--f-mono)', fontSize:'10px',
          letterSpacing:'0.14em', textTransform:'uppercase',
          color:'var(--t2)', marginTop:'24px', marginBottom:'10px',
          display:'flex', alignItems:'center', gap:'8px',
        }}>
          <span style={{ display:'inline-block', width:'20px', height:'1px', background:'var(--t3)' }}/>
          {label}
        </div>
      )
      i++; continue
    }

    // *이탤릭* 메타 태그 (insightship-nlp · ...) → 작게 표시
    if (t.startsWith('*') && t.endsWith('*') && !t.startsWith('**')) {
      const meta = t.slice(1, -1)
      if (meta.includes('insightship') || meta.includes(' · ')) {
        elements.push(
          <div key={`meta-${i}`} style={{
            fontFamily:'var(--f-mono)', fontSize:'10px',
            color:'var(--t4, var(--t3))', marginTop:'32px',
            letterSpacing:'0.08em', opacity:0.5,
          }}>
            {meta}
          </div>
        )
        i++; continue
      }
      // 일반 이탤릭 → 작은 안내 문구
      elements.push(
        <p key={`italic-${i}`} style={{
          margin:'0 0 16px', lineHeight:1.85,
          color:'var(--t3)', fontSize:'13px', fontStyle:'italic',
        }}>
          {t.slice(1, -1)}
        </p>
      )
      i++; continue
    }

    // 일반 단락
    elements.push(
      <p key={`p-${i}`} style={{
        margin:'0 0 18px', lineHeight:2.0,
        color:'var(--t2)', fontSize:'15px', letterSpacing:'-0.01em',
      }}>
        {parseBold(t)}
      </p>
    )
    i++
  }
  return elements
}

// 하위 호환 alias
const renderV7Summary = renderLongformSummary


function renderMarkdown(text) {
  if (!text) return ''
  return text.split('\n').map(line => {
    if (line.startsWith('### ')) return `<h3 style="font-family:var(--f-serif);font-size:17px;font-weight:700;margin:22px 0 8px;color:var(--t1)">${md(line.slice(4))}</h3>`
    if (line.startsWith('## ')) return `<h2 style="font-family:var(--f-serif);font-size:19px;font-weight:700;margin:28px 0 10px;color:var(--t1);border-bottom:1px solid var(--b1);padding-bottom:7px">${md(line.slice(3))}</h2>`
    if (line.startsWith('# ')) return `<h1 style="font-family:var(--f-serif);font-size:22px;font-weight:700;margin:32px 0 12px;color:var(--t1)">${md(line.slice(2))}</h1>`
    if (line.match(/^[*-] /)) return `<li style="margin:5px 0;color:var(--t2);line-height:1.8;margin-left:18px">${md(line.slice(2))}</li>`
    if (line.match(/^---+$/)) return `<hr style="border:none;border-top:1px solid var(--b1);margin:18px 0"/>`
    if (line.trim() === '') return '<br/>'
    return `<p style="margin:0 0 12px;color:var(--t2);line-height:1.9;font-size:16px">${md(line)}</p>`
  }).join('')
}
function md(t) {
  return t.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--t1);font-weight:700">$1</strong>')
         .replace(/`([^`]+)`/g, '<code style="background:var(--bg3);padding:1px 5px;font-family:var(--f-mono);font-size:13px">$1</code>')
}

function BookmarkButton({ articleId }) {
  const { data: isBookmarked = false } = useIsBookmarked(articleId)
  const toggle = useToggleBookmark()
  const { user } = useAuthStore()
  return (
    <button className="btn btn-outline" style={{ gap:'6px', color:isBookmarked?'var(--amber)':undefined, borderColor:isBookmarked?'var(--amber)':undefined }}
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
      <div style={{ fontFamily:'var(--f-serif)', fontSize:'20px', marginBottom:'16px', color:'var(--t1)' }}>
        아티클을 찾을 수 없습니다
      </div>
      <button className="btn" style={{ background:'#6366F1', color:'#fff', border:'none', padding:'8px 20px', cursor:'pointer' }} onClick={() => navigate(-1)}>돌아가기</button>
    </div>
  )

  const isNews = !!article.source_name
  const catColor = ARTICLE_CATEGORY_COLOR[article.category] || CATEGORY_COLORS[article.ai_category] || '#818cf8'
  const catBgColor = ARTICLE_CATEGORY_BG[article.category] || 'rgba(99,102,241,0.12)'

  // AI 요약 최대 2000자 처리
  // HTML 태그 완전 제거 (excerpt/body 보호)
  const stripHtml = (s) => {
    if (!s) return ''
    let t = s
    // script/style 블록 제거
    t = t.replace(/<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi, '')
    // HTML 태그 반복 제거 (중첩 태그 대비 2회)
    t = t.replace(/<[^>]+>/g, ' ')
    t = t.replace(/<[^>]+>/g, ' ')
    // 엔티티 디코딩
    t = t.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
         .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
         .replace(/&#x?[0-9a-fA-F]+;/g,'')
    // URL 제거
    t = t.replace(/https?:\/\/\S+/g, '')
    // 공백 정리
    t = t.replace(/\s{2,}/g, ' ').trim()
    // HTML 잔재 체크: 아직 < > 가 있거나 href= 등이 있으면 빈 문자열
    if (/<[a-z]/i.test(t) || /href=/i.test(t) || t.startsWith('<')) return ''
    return t
  }

  const summary = article.ai_summary
    ? article.ai_summary
    : null

  return (
    <>
      {/* Reading Progress Bar */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height:'3px', background:'var(--bg3)', zIndex:200, pointerEvents:'none' }}>
        <div style={{ height:'100%', width:`${progress}%`, background:'var(--amber)', transition:'width 0.1s linear' }}/>
      </div>

      <div style={{ maxWidth:'740px', margin:'0 auto', padding:'32px var(--pad-x) 80px' }}>

        {/* 뒤로가기 */}
        <button onClick={() => navigate(-1)} className="btn btn-ghost"
          style={{ marginBottom:'24px', paddingLeft:0, gap:'6px', display:'flex', alignItems:'center' }}>
          <ArrowLeft size={14}/> 뒤로
        </button>

        {/* 카테고리 배지 */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'16px', flexWrap:'wrap' }}>
          <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', letterSpacing:'2px', color:catColor, background:catBgColor, border:`1px solid ${catColor}44`, padding:'3px 9px', borderRadius:'2px' }}>
            {CATEGORY_LABELS[article.category] || 'NEWS'}
          </span>
          {article.source_name && (
            <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--t4)', letterSpacing:'0.5px' }}>
              {article.source_name}
            </span>
          )}
        </div>

        {/* 제목 */}
        <h1 style={{ fontFamily:'var(--f-serif)', fontSize:'clamp(20px,4vw,32px)', fontWeight:700, lineHeight:1.3, marginBottom:'20px', color:'var(--t1)' }}>
          {article.title}
        </h1>

        {/* 메타 정보 */}
        <div style={{ display:'flex', alignItems:'center', gap:'14px', padding:'14px 0', borderTop:'1px solid var(--b1)', borderBottom:'1px solid var(--b1)', marginBottom:'32px', flexWrap:'wrap' }}>
          <div className="avatar avatar-md" style={{ flexShrink:0 }}>
            {article.profiles?.avatar_url
              ? <img src={article.profiles.avatar_url} alt=""/>
              : (article.profiles?.display_name?.[0] || 'I')}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'13px', fontWeight:600, color:'var(--t1)' }}>
              {article.profiles?.display_name || 'Insightship 에디터'}
            </div>
            {article.profiles?.startup_name && (
              <div style={{ fontSize:'11px', color:'var(--t3)' }}>{article.profiles.startup_name}</div>
            )}
          </div>
          <div style={{ display:'flex', gap:'12px', alignItems:'center', fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--t3)', flexShrink:0 }}>
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
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'24px', padding:'10px 16px', background:'var(--bg3)', borderLeft:'2px solid var(--t1)' }}>
                  <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--t1)', letterSpacing:'0.12em', textTransform:'uppercase' }}>
                    AI 인사이트 요약
                  </span>
                </div>

                {/* AI 인사이트 요약 렌더러 */}
                <div style={{ fontSize:'15px', lineHeight:1.95, letterSpacing:'-0.01em' }}>
                  {renderV7Summary(summary)}
                </div>
              </>
            ) : (
              /* 요약 없는 경우 - HTML 제거 후 안내 표시 */
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'20px', padding:'10px 16px', background:'var(--bg3)', border:'1px solid var(--b2)' }}>
                  <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--t3)', letterSpacing:'0.12em', textTransform:'uppercase' }}>
                    AI 분석 준비 중 — 잠시 후 업데이트됩니다
                  </span>
                </div>
                {(() => {
                  const raw = stripHtml(article.body || article.excerpt || '')
                  return raw ? (
                    <div style={{ fontSize:'15px', lineHeight:1.85, color:'var(--t2)' }}>
                      {raw.split('\n').map((para, i) =>
                        para.trim() ? <p key={i} style={{ marginBottom:'14px' }}>{para}</p> : null
                      )}
                    </div>
                  ) : null
                })()}
              </div>
            )}

            {/* 원문 보기 버튼 */}
            {article.source_url && (
              <div style={{ marginTop:'36px', padding:'20px 24px', background:'var(--bg3)', border:'1px solid var(--b1)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--t3)', letterSpacing:'1.5px', marginBottom:'4px' }}>
                    ORIGINAL SOURCE
                  </div>
                  <div style={{ fontSize:'13px', color:'var(--t3)' }}>
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
                <img src={article.cover_image} alt={article.title} style={{ width:'100%', border:'1px solid var(--b1)' }}/>
              </div>
            )}
            <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body || article.excerpt || '') }}/>
          </>
        )}

        {/* 태그 */}
        {article.tags?.length > 0 && (
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'32px', paddingTop:'20px', borderTop:'1px solid var(--b1)' }}>
            {article.tags.map(t => <span key={t} className="tag">{t}</span>)}
          </div>
        )}

        {/* 액션 버튼 */}
        <div style={{ display:'flex', gap:'10px', marginTop:'24px', paddingTop:'20px', borderTop:'1px solid var(--b1)', flexWrap:'wrap' }}>
          <button onClick={handleLike} className="btn btn-outline"
            style={{ color:liked?'var(--rose)':undefined, borderColor:liked?'var(--rose)44':undefined, gap:'6px' }}>
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
