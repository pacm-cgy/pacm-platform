import { useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useArticle } from '../../hooks/useArticle'

const CATEGORY_LABELS = {
  insight:'INSIGHT', story:'FOUNDER STORY', trend:'TREND',
  magazine:'MAGAZINE', community:'COMMUNITY', opinion:'OPINION',
}

export default function ArticlePanel({ slug, onClose }) {
  const { data: article, isLoading } = useArticle(slug)
  const [progress, setProgress] = useState(0)

  if (!slug) return null

  const handleScroll = (e) => {
    const el = e.currentTarget
    const pct = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100
    setProgress(Math.min(100, pct || 0))
  }

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <aside className="article-panel" onScroll={handleScroll}>
        <div className="panel-progress">
          <div className="panel-progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'13px 24px', borderBottom:'1px solid var(--c-border)',
          background:'var(--c-paper)', position:'sticky', top:3, zIndex:1,
        }}>
          <div style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-muted)', letterSpacing:'2px' }}>PACM INSIGHT</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:'var(--c-muted)', lineHeight:1 }}>✕</button>
        </div>

        {isLoading ? (
          <div style={{ padding:'32px 40px' }}>
            {[...Array(7)].map((_,i)=>(
              <div key={i} className="skeleton skeleton-text" style={{
                width:['100%','80%','100%','65%','100%','90%','70%'][i],
                height: i===0?'28px':i===2?'20px':'15px', marginBottom:'13px'
              }}/>
            ))}
          </div>
        ) : article ? (
          <div style={{ padding:'32px 40px', paddingBottom:'64px' }}>
            <div className="t-eyebrow" style={{ marginBottom:'14px' }}>
              {CATEGORY_LABELS[article.category] || article.category}
            </div>
            <h1 style={{ fontFamily:'var(--f-serif)', fontSize:'26px', fontWeight:700, lineHeight:1.25, marginBottom:'14px' }}>
              {article.title}
            </h1>
            {article.excerpt && (
              <p style={{ color:'var(--c-muted)', fontFamily:'var(--f-serif)', fontStyle:'italic', fontSize:'15px', lineHeight:1.7, marginBottom:'18px' }}>
                {article.excerpt}
              </p>
            )}
            <div style={{ display:'flex', gap:'12px', alignItems:'center', padding:'13px 0', borderTop:'1px solid var(--c-border)', borderBottom:'1px solid var(--c-border)', marginBottom:'28px' }}>
              <div className="avatar avatar-sm">
                {article.profiles?.avatar_url
                  ? <img src={article.profiles.avatar_url} alt="" />
                  : (article.profiles?.display_name?.[0] || 'A')}
              </div>
              <div>
                <div style={{ fontSize:'13px', fontWeight:600 }}>{article.profiles?.display_name || '편집부'}</div>
                <div className="t-caption">
                  {article.published_at ? format(new Date(article.published_at), 'yyyy년 M월 d일', { locale:ko }) : ''}
                  {article.read_time ? ` · ${article.read_time}분 읽기` : ''}
                </div>
              </div>
            </div>

            {article.cover_image && (
              <img src={article.cover_image} alt={article.title}
                style={{ width:'100%', border:'1px solid var(--c-border)', marginBottom:'28px', display:'block' }} />
            )}

            {article.article_images?.length > 0 && (
              <div className={`img-gallery count-${Math.min(3, article.article_images.length)}`} style={{ marginBottom:'28px' }}>
                {[...article.article_images]
                  .sort((a,b) => a.order_index - b.order_index)
                  .map(img => (
                    <div key={img.id} className="img-item">
                      <img src={img.url} alt={img.alt_text || ''} />
                    </div>
                  ))}
              </div>
            )}

            <div className="article-body" dangerouslySetInnerHTML={{ __html: article.body }} />

            {article.tags?.length > 0 && (
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'32px', paddingTop:'20px', borderTop:'1px solid var(--c-border)' }}>
                {article.tags.map(t => <span key={t} className="tag">{t}</span>)}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding:'48px', textAlign:'center', color:'var(--c-muted)' }}>
            아티클을 찾을 수 없습니다
          </div>
        )}
      </aside>
    </>
  )
}
