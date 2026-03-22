import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ChevronRight, Clock, Tag, Star, Zap, TrendingUp, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'

const CATEGORIES = [
  { key: 'all', label: '전체' },
  { key: 'startup_basics', label: '창업 기초' },
  { key: 'ai_startup', label: 'AI × 창업' },
  { key: 'investment', label: '투자 이해' },
  { key: 'case_study', label: '케이스 스터디' },
  { key: 'marketing', label: '마케팅' },
]

const LEVEL_BADGE = {
  beginner: { label: '입문', color: 'var(--c-green)' },
  intermediate: { label: '중급', color: 'var(--c-indigo)' },
  advanced: { label: '심화', color: 'var(--c-red)' },
}

function EduCard({ item, onClick }) {
  const level = LEVEL_BADGE[item.level] || LEVEL_BADGE.beginner
  return (
    <div className="card" onClick={() => onClick(item)}
      style={{ padding: '22px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px',
        transition: 'var(--t-fast)', ':hover': { borderColor: 'var(--c-indigo)' } }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--c-indigo)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--c-border)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ background: level.color, color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontFamily: 'var(--f-mono)' }}>
          {level.label}
        </span>
        {item.is_featured && <Star size={14} color="var(--c-gold)" fill="var(--c-gold)" />}
      </div>
      <div style={{ fontFamily: 'var(--f-serif)', fontSize: '17px', fontWeight: 700, lineHeight: 1.35 }}>{item.title}</div>
      {item.subtitle && <div style={{ color: 'var(--c-muted)', fontSize: '13px' }}>{item.subtitle}</div>}
      <p style={{ color: 'var(--c-muted)', fontSize: '12px', lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {item.summary}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} />{item.read_time}분</span>
        {item.tags?.slice(0, 2).map(t => (
          <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Tag size={10} />{t}</span>
        ))}
      </div>
    </div>
  )
}

function EduModal({ item, onClose }) {
  if (!item) return null

  // 간단한 마크다운 렌더링
  const renderContent = (text) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h2 key={i} style={{ fontFamily: 'var(--f-serif)', fontSize: '22px', fontWeight: 700, marginTop: '32px', marginBottom: '12px' }}>{line.slice(3)}</h2>
      if (line.startsWith('### ')) return <h3 key={i} style={{ fontFamily: 'var(--f-serif)', fontSize: '17px', fontWeight: 700, marginTop: '24px', marginBottom: '8px' }}>{line.slice(4)}</h3>
      if (line.startsWith('**') && line.endsWith('**')) return <p key={i} style={{ fontWeight: 700, color: 'var(--c-text)', marginBottom: '8px' }}>{line.slice(2, -2)}</p>
      if (line.startsWith('1. ') || line.startsWith('2. ') || line.startsWith('3. ')) {
        return <p key={i} style={{ paddingLeft: '16px', color: 'var(--c-muted)', fontSize: '14px', lineHeight: 1.8, marginBottom: '4px' }}>{line}</p>
      }
      if (line === '') return <br key={i} />
      // 인라인 볼드 처리
      const parts = line.split(/\*\*(.*?)\*\*/g)
      return <p key={i} style={{ color: 'var(--c-muted)', fontSize: '14px', lineHeight: 1.8, marginBottom: '8px' }}>
        {parts.map((part, j) => j % 2 === 1 ? <strong key={j} style={{ color: 'var(--c-text)' }}>{part}</strong> : part)}
      </p>
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, overflowY: 'auto', padding: '40px 20px' }} onClick={onClose}>
      <div style={{ maxWidth: '680px', margin: '0 auto', background: 'var(--c-bg)', borderRadius: '12px', padding: '40px', border: '1px solid var(--c-border)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ background: LEVEL_BADGE[item.level]?.color || 'var(--c-green)', color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontFamily: 'var(--f-mono)' }}>
              {LEVEL_BADGE[item.level]?.label || '입문'}
            </span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)' }}>
              <Clock size={11} style={{ verticalAlign: 'middle', marginRight: '3px' }} />{item.read_time}분 읽기
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--c-muted)', cursor: 'pointer', fontSize: '20px' }}>✕</button>
        </div>
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px,3vw,26px)', fontWeight: 700, lineHeight: 1.3, marginBottom: '8px' }}>{item.title}</h1>
        {item.subtitle && <p style={{ color: 'var(--c-muted)', fontSize: '14px', marginBottom: '24px' }}>{item.subtitle}</p>}
        <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: '24px' }}>
          {renderContent(item.content)}
        </div>
        <div style={{ borderTop: '1px solid var(--c-border)', marginTop: '32px', paddingTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {item.tags?.map(t => (
            <span key={t} style={{ background: 'var(--c-gray-1)', color: 'var(--c-muted)', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', fontFamily: 'var(--f-mono)' }}>#{t}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function EduPage() {
  const [contents, setContents] = useState([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.from('edu_contents')
      .select('*')
      .eq('is_published', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => { setContents(data || []); setLoading(false) })
  }, [])

  const filtered = contents.filter(c => {
    const matchCat = active === 'all' || c.category === active
    const matchSearch = !search || c.title.includes(search) || c.summary?.includes(search) || c.tags?.some(t => t.includes(search))
    return matchCat && matchSearch
  })

  const featured = filtered.filter(c => c.is_featured)
  const regular = filtered.filter(c => !c.is_featured)

  return (
    <div style={{ paddingBottom: '80px' }}>
      {selected && <EduModal item={selected} onClose={() => setSelected(null)} />}

      {/* 헤더 */}
      <div style={{ padding: '32px 0 28px', borderBottom: '1px solid var(--c-border)' }}>
        <div className="t-eyebrow" style={{ marginBottom: '8px' }}>PACM EDU</div>
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, marginBottom: '12px', lineHeight: 1.2 }}>
          청소년 창업 학습
        </h1>
        <p style={{ color: 'var(--c-muted)', fontSize: '14px', maxWidth: '540px', lineHeight: 1.8 }}>
          창업의 기초부터 AI 활용, 투자 이해까지. 복잡한 창업 지식을 쉽고 실용적으로 전달합니다.
        </p>
      </div>

      {/* 검색 + 카테고리 */}
      <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--c-muted)' }} />
          <input className="input" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="학습 콘텐츠 검색..."
            style={{ paddingLeft: '34px' }} />
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button key={cat.key} onClick={() => setActive(cat.key)}
              className={active === cat.key ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* 추천 콘텐츠 */}
      {featured.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--c-border)' }}>
            <Star size={14} color="var(--c-gold)" fill="var(--c-gold)" />
            <div className="t-eyebrow">추천 학습</div>
          </div>
          <div className="grid-3 grid-bordered">
            {featured.map(item => <EduCard key={item.id} item={item} onClick={setSelected} />)}
          </div>
        </div>
      )}

      {/* 전체 콘텐츠 */}
      {regular.length > 0 && (
        <div style={{ marginTop: '40px' }}>
          <div className="t-eyebrow" style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--c-border)' }}>
            전체 학습 콘텐츠 {filtered.length > 0 && `· ${filtered.length}개`}
          </div>
          {loading ? (
            <div className="grid-3 grid-bordered">
              {[0,1,2].map(i => <div key={i} className="card skeleton" style={{ height: '200px' }} />)}
            </div>
          ) : (
            <div className="grid-3 grid-bordered">
              {regular.map(item => <EduCard key={item.id} item={item} onClick={setSelected} />)}
            </div>
          )}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--c-muted)' }}>
          <BookOpen size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
          <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px' }}>콘텐츠를 준비 중입니다</div>
          <div style={{ fontSize: '13px', marginTop: '8px' }}>곧 새로운 학습 자료가 추가됩니다</div>
        </div>
      )}

      {/* 챌린지 CTA */}
      <div style={{ marginTop: '64px', background: 'linear-gradient(135deg, var(--c-indigo) 0%, #4f46e5 100%)', borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--f-serif)', fontSize: '22px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
          배운 것을 직접 실험해보세요
        </div>
        <div style={{ color: '#c7d2fe', fontSize: '14px', marginBottom: '20px' }}>
          PACM 창업 챌린지에 참여해서 아이디어를 현실로 만드세요
        </div>
        <button onClick={() => navigate('/community')} className="btn" style={{ background: '#fff', color: 'var(--c-indigo)', fontWeight: 700 }}>
          창업 챌린지 참여하기 <ChevronRight size={14} style={{ verticalAlign: 'middle' }} />
        </button>
      </div>
    </div>
  )
}
