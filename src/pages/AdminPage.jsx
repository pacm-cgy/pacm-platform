import { generateSlug } from '../utils/slug'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { supabase } from '../lib/supabase'
import { BarChart2, FileText, Users, Newspaper, TrendingUp, RefreshCw, Loader, Zap } from 'lucide-react'

// ── AI 시장 분석 보조 ─────────────────────────────────────────────
function AIAssistant({ context, onInsert }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [prompt, setPrompt] = useState('')

  const analyze = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    try {
      const { supabase } = await import('../lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      const r = await fetch(`/api/admin-ai?prompt=${encodeURIComponent(prompt)}&context=${encodeURIComponent(context || '')}`, {
        headers: { Authorization: 'Bearer ' + token }
      })
      const d = await r.json()
      setResult(d.result || '결과 없음')
    } catch {
      setResult('AI 분석 실패. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: 'var(--c-gray-2)', border: '1px solid var(--c-gray-3)', padding: '20px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Zap size={14} style={{ color: 'var(--c-gold)' }} />
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gold)', letterSpacing: '1px' }}>AI 작성 보조</span>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && analyze()}
          placeholder="분석 요청 입력 (예: 이번 주 AI 스타트업 투자 동향 분석해줘)"
          style={{ flex: 1, padding: '8px 12px', background: 'var(--c-gray-1)', border: '1px solid var(--c-gray-3)', color: 'var(--c-paper)', fontFamily: 'var(--f-sans)', fontSize: '13px' }}
        />
        <button onClick={analyze} disabled={loading} className="btn btn-gold btn-sm" style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {loading ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={12} />}
          분석
        </button>
      </div>
      {result && (
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-gray-3)', padding: '16px', fontSize: '13px', lineHeight: 1.8, color: 'var(--c-paper)', maxHeight: '200px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
          {result}
          <button onClick={() => onInsert?.(result)} className="btn btn-outline btn-sm" style={{ marginTop: '10px', display: 'block' }}>
            본문에 삽입
          </button>
        </div>
      )}
    </div>
  )
}

// ── 통계 카드 ─────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, change }) {
  return (
    <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ width: '40px', height: '40px', background: 'var(--c-gray-2)', border: '1px solid var(--c-gray-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} style={{ color: 'var(--c-gold)' }} />
      </div>
      <div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: '22px', fontWeight: 700 }}>{value}</div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-muted)', letterSpacing: '1px' }}>{label}</div>
        {change && <div style={{ fontSize: '11px', color: change > 0 ? 'var(--c-green)' : 'var(--c-red)', marginTop: '2px' }}>{change > 0 ? '+' : ''}{change}% 이번 주</div>}
      </div>
    </div>
  )
}

// ── 아티클 작성 패널 ──────────────────────────────────────────────
function WritePanel({ onClose }) {
  const { profile } = useAuthStore()
  const [form, setForm] = useState({ title: '', body: '', category: 'insight', excerpt: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')


  const save = async (status = 'draft') => {
    if (!form.title.trim() || !form.body.trim()) { setMsg('제목과 본문을 입력하세요'); return }
    setSaving(true)
    try {
      const slug = generateSlug(form.title, 'article')
      const { error } = await supabase.from('articles').insert({
        title: form.title.trim(),
        slug,
        body: form.body.trim(),
        excerpt: (form.excerpt || form.body.slice(0, 200)).trim(),
        category: form.category,
        author_id: profile?.id,
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
      })
      if (error) throw error
      setMsg(status === 'published' ? '✅ 발행 완료!' : '✅ 임시저장 완료')
      if (status === 'published') setTimeout(onClose, 1500)
    } catch (e) {
      setMsg('❌ ' + e.message?.slice(0, 60))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--c-bg)', zIndex: 1000, overflow: 'auto', padding: '24px var(--pad-x)' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: '22px', fontWeight: 700 }}>아티클 작성</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => save('draft')} disabled={saving} className="btn btn-outline btn-sm">임시저장</button>
            <button onClick={() => save('published')} disabled={saving} className="btn btn-gold btn-sm">발행하기</button>
            <button onClick={onClose} className="btn btn-ghost btn-sm">닫기</button>
          </div>
        </div>

        <AIAssistant context={form.title} onInsert={text => setForm(f => ({ ...f, body: f.body + '\n\n' + text }))} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="제목" style={{ padding: '12px 16px', background: 'var(--c-card)', border: '1px solid var(--c-gray-3)', color: 'var(--c-paper)', fontFamily: 'var(--f-serif)', fontSize: '18px', fontWeight: 700 }} />

          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            style={{ padding: '10px 12px', background: 'var(--c-card)', border: '1px solid var(--c-gray-3)', color: 'var(--c-paper)', fontFamily: 'var(--f-mono)', fontSize: '12px', width: '200px' }}>
            <option value="insight">INSIGHT</option>
            <option value="story">FOUNDER STORY</option>
            <option value="trend">TREND</option>
            <option value="opinion">OPINION</option>
          </select>

          <textarea value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
            placeholder="요약 (미입력 시 본문 앞 200자 자동 사용)" rows={2}
            style={{ padding: '12px 16px', background: 'var(--c-card)', border: '1px solid var(--c-gray-3)', color: 'var(--c-paper)', fontFamily: 'var(--f-sans)', fontSize: '14px', resize: 'vertical' }} />

          <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            placeholder="본문 (마크다운 지원)" rows={20}
            style={{ padding: '16px', background: 'var(--c-card)', border: '1px solid var(--c-gray-3)', color: 'var(--c-paper)', fontFamily: 'var(--f-sans)', fontSize: '15px', lineHeight: 1.9, resize: 'vertical' }} />
        </div>

        {msg && <div style={{ marginTop: '12px', fontFamily: 'var(--f-mono)', fontSize: '13px', color: msg.includes('✅') ? 'var(--c-green)' : 'var(--c-red)' }}>{msg}</div>}
      </div>
    </div>
  )
}

// ── 메인 어드민 페이지 ────────────────────────────────────────────
export default function AdminPage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [writeOpen, setWriteOpen] = useState(false)
  const [runningCron, setRunningCron] = useState('')

  useEffect(() => {
    if (!user || profile?.role !== 'admin') { navigate('/'); return }
    loadStats()
  }, [user, profile])

  const loadStats = async () => {
    setLoading(true)
    const [art, news, sub, posts] = await Promise.all([
      supabase.from('articles').select('id', { count: 'exact' }).eq('status', 'published').is('source_name', null),
      supabase.from('articles').select('id', { count: 'exact' }).not('source_name', 'is', null),
      supabase.from('newsletter_subscribers').select('id', { count: 'exact' }).eq('is_active', true),
      supabase.from('community_posts').select('id', { count: 'exact' }),
    ])
    setStats({
      articles: art.count || 0,
      news: news.count || 0,
      subscribers: sub.count || 0,
      posts: posts.count || 0,
    })
    setLoading(false)
  }

  const runCron = async (path, label) => {
    setRunningCron(label)
    try {
      const { supabase } = await import('../lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(path, { headers: { 'x-vercel-cron': '1', Authorization: 'Bearer ' + (session?.access_token || '') } })
      const d = await r.json()
      alert(`${label} 완료:\n${JSON.stringify(d, null, 2).slice(0, 300)}`)
    } catch (e) {
      alert('오류: ' + e.message)
    } finally {
      setRunningCron('')
    }
  }

  if (!user || profile?.role !== 'admin') return null

  return (
    <div style={{ paddingBottom: '80px' }}>
      <div style={{ background: 'var(--c-gray-2)', borderBottom: '1px solid var(--c-gray-3)', padding: '16px 0' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="t-eyebrow" style={{ marginBottom: '4px' }}>ADMIN</div>
            <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: '22px', fontWeight: 700 }}>관리자 대시보드</h1>
          </div>
          <button onClick={() => setWriteOpen(true)} className="btn btn-gold" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={14} /> 아티클 작성
          </button>
        </div>
      </div>

      <div className="container" style={{ marginTop: '32px' }}>
        {/* 통계 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: '2px', marginBottom: '40px' }}>
          {loading ? [...Array(4)].map((_,i) => <div key={i} className="card skeleton" style={{ height: '80px' }} />) : (
            <>
              <StatCard label="발행 아티클" value={stats.articles} icon={FileText} />
              <StatCard label="수집 뉴스" value={stats.news} icon={Newspaper} />
              <StatCard label="구독자" value={stats.subscribers} icon={Users} />
              <StatCard label="커뮤니티 글" value={stats.posts} icon={BarChart2} />
            </>
          )}
        </div>

        {/* AI 시장 분석 보조 */}
        <div style={{ marginBottom: '40px' }}>
          <div className="section-header" style={{ marginBottom: '20px' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gold)', letterSpacing: '2px' }}>AI 시장 분석</div>
          </div>
          <AIAssistant context="한국 스타트업 시장 현황" onInsert={() => {}} />
        </div>

        {/* Cron 수동 실행 */}
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gold)', letterSpacing: '2px', marginBottom: '16px' }}>수동 실행</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {[
              { label: '뉴스 수집', path: '/api/fetch-news' },
              { label: 'AI 요약', path: '/api/summarize-news' },
              { label: 'OG 이미지', path: '/api/fetch-og' },
              { label: 'AI 리포트', path: '/api/generate-report' },
            ].map(({ label, path }) => (
              <button key={path} onClick={() => runCron(path, label)}
                disabled={!!runningCron}
                className="btn btn-outline btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {runningCron === label ? <Loader size={12} /> : <RefreshCw size={12} />}
                {runningCron === label ? `${label} 실행 중...` : label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {writeOpen && <WritePanel onClose={() => { setWriteOpen(false); loadStats() }} />}
    </div>
  )
}
