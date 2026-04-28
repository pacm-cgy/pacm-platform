import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Clock, Calendar, AlertCircle, Bookmark } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useToggleBookmark, useIsBookmarked } from '../hooks/useData'
import { useAuthStore } from '../store'

function parseBold(text, k) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  if (parts.length === 1) return text
  return parts.map((p, idx) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={`bold-${k}-${idx}`} style={{ color: 'var(--t1)', fontWeight: 700 }}>{p.slice(2,-2)}</strong>
    return p
  })
}

function renderAISummary(text) {
  if (!text) return null
  const lines = text.split('\n')
  const elements = []
  let key = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.trim()
    if (!t) continue
    if (t === '---') {
      elements.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid var(--b1)', margin: '32px 0' }} />)
      continue
    }
    if (t.startsWith('• ') || (t.startsWith('- ') && !t.startsWith('--'))) {
      const c = t.slice(2)
      elements.push(
        <div key={key++} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <span style={{ color: 'var(--t3)', flexShrink: 0, lineHeight: '1.9' }}>•</span>
          <span style={{ fontSize: 15, lineHeight: 1.85, color: 'var(--t2)' }}>{parseBold(c, key)}</span>
        </div>
      )
      continue
    }
    if (t.startsWith('→ ')) {
      const c = t.slice(2)
      elements.push(
        <div key={key++} style={{ display: 'flex', gap: 12, marginBottom: 14, padding: '14px 18px', background: 'var(--bg3)', borderLeft: '3px solid var(--b3)', borderRadius: 8 }}>
          <span style={{ color: 'var(--t3)', flexShrink: 0, fontWeight: 700, lineHeight: 1.8 }}>→</span>
          <span style={{ fontSize: 14, lineHeight: 1.85, color: 'var(--t2)' }}>{parseBold(c, key)}</span>
        </div>
      )
      continue
    }
    if (t.startsWith('*') && t.endsWith('*') && !t.startsWith('**')) {
      const c = t.slice(1, -1)
      if (c.startsWith('ai:')) {
        elements.push(<div key={key++} style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)', marginTop: 8, letterSpacing: '0.5px' }}>{c}</div>)
      } else {
        elements.push(<p key={key++} style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--t3)', fontStyle: 'italic', marginBottom: 8 }}>{c}</p>)
      }
      continue
    }
    if (t.startsWith('**') && t.endsWith('**') && t.length > 4) {
      const c = t.slice(2, -2)
      elements.push(<h3 key={key++} style={{ fontFamily: 'var(--f-sans)', fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 12, marginTop: 4, letterSpacing: '0.3px' }}>{c}</h3>)
      continue
    }
    if (/^[💰🚀📋🤝🔬👤📊📰📈💡]/.test(t)) {
      elements.push(<div key={key++} style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--t3)', letterSpacing: '1px', marginBottom: 20, marginTop: 4 }}>{t}</div>)
      continue
    }
    elements.push(<p key={key++} style={{ fontSize: 16, lineHeight: 1.95, color: 'var(--t1)', marginBottom: 16 }}>{parseBold(t, key)}</p>)
  }
  return <div style={{ fontFamily: 'var(--f-sans)' }}>{elements}</div>
}

function useNewsArticle(slug) {
  return useQuery({
    queryKey: ['news-detail', slug],
    queryFn: async () => {
      if (!slug) throw new Error('slug 없음')
      const { data, error } = await supabase.from('articles').select('*').eq('slug', slug).maybeSingle()
      if (error) throw error
      if (!data) throw new Error('기사를 찾을 수 없습니다')
      try { await supabase.rpc('increment_view', { article_id: data.id }) } catch {}
      return data
    },
    enabled: !!slug,
    retry: 1,
  })
}

function NewsBookmarkBtn({ articleId }) {
  const { data: saved = false } = useIsBookmarked(articleId)
  const toggle = useToggleBookmark()
  const { user } = useAuthStore()
  return (
    <button
      className="btn btn-ghost"
      style={{ gap: 6, color: saved ? '#F59E0B' : undefined, borderColor: saved ? '#F59E0B' : undefined, display: 'flex', alignItems: 'center' }}
      onClick={() => {
        if (!user) { if (window.confirm('로그인 후 북마크를 사용할 수 있습니다.\n로그인 페이지로 이동할까요?')) window.location.href = '/login'; return }
        toggle.mutate({ articleId, isBookmarked: saved })
      }}
      disabled={toggle.isPending}>
      <Bookmark size={14} fill={saved ? 'currentColor' : 'none'} />
      {saved ? '저장됨' : '저장'}
    </button>
  )
}

export default function NewsDetailPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { data: article, isLoading, isError } = useNewsArticle(slug)

  useEffect(() => {
    if (article?.title) document.title = `${article.title} — Insightship`
    return () => { document.title = 'Insightship — 청소년 창업 플랫폼' }
  }, [article?.title])

  if (isLoading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'var(--f-mono)', color: 'var(--t3)', fontSize: 13 }}>불러오는 중...</div>
    </div>
  )

  if (isError || !article) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: '40px 20px' }}>
      <AlertCircle size={40} color="var(--t4)" />
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, color: 'var(--t1)' }}>기사를 찾을 수 없습니다</div>
      <button onClick={() => navigate('/news')} className="btn btn-ghost btn-sm">← 뉴스 목록으로</button>
    </div>
  )

  const date = article.published_at ? format(new Date(article.published_at), 'yyyy년 M월 d일 HH:mm', { locale: ko }) : ''
  const mainContent = article.ai_summary && article.ai_summary.length >= 100
    ? article.ai_summary
    : (article.body || article.excerpt || '')
        .replace(/\n?원문 보기:.*$/m, '').replace(/ⓒ.*?재배포\s*금지/g, '')
        .replace(/저작권자.*?금지/g, '').replace(/무단\s*전재.*?금지/g, '')
        .replace(/\[사진\]/g, '').replace(/\[영상\]/g, '').replace(/\[표\]/g, '')
        .replace(/https?:\/\/\S+/g, '').trim()

  const catColor = { funding: '#F59E0B', ai: '#818cf8', ai_startup: '#818cf8', edutech: '#38bdf8', youth: '#34d399', entrepreneurship: '#c4b5fd', unicorn: '#fb7185', climate: '#86efac', health: '#67e8f9', fintech: '#fb923c', general: '#9CA3AF' }
  const accent = catColor[article.ai_category] || '#60A5FA'

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* ── 헤더 */}
      <div style={{ borderBottom: '1px solid var(--b1)', padding: '14px 0', background: 'var(--bg1)' }}>
        <div className="container">
          <button
            onClick={() => navigate('/news')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--t3)', fontSize: 13, fontFamily: 'var(--f-mono)', cursor: 'pointer', transition: 'color 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--t1)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}>
            <ArrowLeft size={14} /> 뉴스 목록
          </button>
        </div>
      </div>

      <div className="container" style={{ maxWidth: 'min(760px, 100%)', margin: '0 auto', padding: '48px var(--pad-x) 0' }}>
        {/* ── 태그 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {article.tags?.filter(t => t !== '뉴스').map(t => (
            <span key={t} style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: accent, background: `${accent}12`, border: `1px solid ${accent}25`, padding: '3px 8px', borderRadius: 3, letterSpacing: '1px' }}>
              {t}
            </span>
          ))}
        </div>

        {/* ── 제목 */}
        <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(20px,4vw,30px)', fontWeight: 700, lineHeight: 1.4, marginBottom: 20, color: 'var(--t1)' }}>
          {article.title}
        </h1>

        {/* ── 메타 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32, paddingBottom: 20, borderBottom: '1px solid var(--b1)', flexWrap: 'wrap' }}>
          {article.source_name && (
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: accent, background: `${accent}12`, border: `1px solid ${accent}25`, padding: '2px 8px', borderRadius: 3 }}>
              {article.source_name}
            </span>
          )}
          {date && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--t3)' }}>
              <Calendar size={11} /> {date}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--t3)' }}>
            <Clock size={11} /> {article.read_time || 2}분 읽기
          </span>
        </div>

        {/* ── 커버 이미지 */}
        {article.cover_image && (
          <div style={{ marginBottom: 32, overflow: 'hidden', borderRadius: 10, border: '1px solid var(--b1)' }}>
            <img src={article.cover_image} alt={article.title}
              style={{ width: '100%', maxHeight: 420, objectFit: 'cover', display: 'block' }}
              onError={e => e.target.parentElement.style.display = 'none'} />
          </div>
        )}

        {/* ── 본문 */}
        <div style={{ marginBottom: 48 }}>
          {article.ai_summary && article.ai_summary.length >= 100 ? (
            renderAISummary(article.ai_summary)
          ) : (
            <div style={{ fontSize: 15, lineHeight: 1.85, color: 'var(--t1)' }}>
              {mainContent.split('\n').filter(p => p.trim() && p.length > 10).slice(0, 20).map((para, i) => (
                <p key={i} style={{ marginBottom: 14 }}>{para}</p>
              ))}
            </div>
          )}
        </div>

        {/* ── 원문 보기 카드 */}
        {article.source_url?.startsWith('http') && (
          <div style={{
            padding: '20px 24px', background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
            marginBottom: 48,
          }}>
            <div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#60A5FA', letterSpacing: '2px', marginBottom: 4 }}>출처</div>
              <div style={{ fontSize: 13, color: 'var(--t2)' }}>{article.source_name || '원문 기사'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <NewsBookmarkBtn articleId={article?.id} />
              <a href={article.source_url} target="_blank" rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                원문 읽기 <ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}

        {/* ── 돌아가기 */}
        <div style={{ paddingTop: 32, borderTop: '1px solid var(--b1)' }}>
          <button onClick={() => navigate('/news')} className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={14} /> 뉴스 목록으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  )
}
