import { generateSlug } from '../utils/slug'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { supabase } from '../lib/supabase'
import { BarChart2, FileText, Users, Newspaper, RefreshCw, Loader, Zap } from 'lucide-react'

function AIAssistant({ context, onInsert }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [prompt, setPrompt] = useState('')

  const analyze = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    try {
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
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Zap size={14} color="#F59E0B" />
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: '#F59E0B', letterSpacing: '1px' }}>AI 작성 보조</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && analyze()}
          placeholder="분석 요청 입력 (예: 이번 주 AI 스타트업 투자 동향 분석해줘)"
          className="input"
          style={{ flex: 1, fontSize: 13 }}
        />
        <button onClick={analyze} disabled={loading} className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={12} />}
          분석
        </button>
      </div>
      {result && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.8, color: 'var(--t1)', maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
          {result}
          <button onClick={() => onInsert?.(result)} className="btn btn-ghost btn-sm" style={{ marginTop: 10, display: 'block' }}>
            본문에 삽입
          </button>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color = '#F59E0B' }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 10, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 42, height: 42, background: `${color}15`, border: `1px solid ${color}25`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 22, fontWeight: 700, color: 'var(--t1)' }}>{value}</div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)', letterSpacing: '1px' }}>{label}</div>
      </div>
    </div>
  )
}

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
        title: form.title.trim(), slug, body: form.body.trim(),
        excerpt: (form.excerpt || form.body.slice(0, 200)).trim(),
        category: form.category, author_id: profile?.id, status,
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
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg0)', zIndex: 1000, overflow: 'auto', padding: '24px var(--pad-x)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 700, color: 'var(--t1)' }}>아티클 작성</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => save('draft')} disabled={saving} className="btn btn-ghost btn-sm">임시저장</button>
            <button onClick={() => save('published')} disabled={saving} className="btn btn-primary btn-sm">발행하기</button>
            <button onClick={onClose} className="btn btn-ghost btn-sm">닫기</button>
          </div>
        </div>

        <AIAssistant context={form.title} onInsert={text => setForm(f => ({ ...f, body: f.body + '\n\n' + text }))} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="제목" className="input"
            style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 700, padding: '14px 16px' }} />

          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="input" style={{ width: 200 }}>
            <option value="insight">INSIGHT</option>
            <option value="story">FOUNDER STORY</option>
            <option value="trend">TREND</option>
            <option value="opinion">OPINION</option>
          </select>

          <textarea value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
            placeholder="요약 (미입력 시 본문 앞 200자 자동 사용)" rows={2}
            className="input" style={{ resize: 'vertical' }} />

          <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            placeholder="본문 (마크다운 지원)" rows={22}
            className="input" style={{ fontSize: 15, lineHeight: 1.9, resize: 'vertical' }} />
        </div>

        {msg && <div style={{ marginTop: 12, fontFamily: 'var(--f-mono)', fontSize: 13, color: msg.includes('✅') ? '#22C55E' : '#F43F5E' }}>{msg}</div>}
      </div>
    </div>
  )
}

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
    setStats({ articles: art.count || 0, news: news.count || 0, subscribers: sub.count || 0, posts: posts.count || 0 })
    setLoading(false)
  }

  const runCron = async (path, label) => {
    setRunningCron(label)
    try {
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
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b1)', padding: '16px 0' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: '#60A5FA', letterSpacing: '3px', marginBottom: 4 }}>ADMIN</div>
            <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 700, color: 'var(--t1)' }}>관리자 대시보드</h1>
          </div>
          <button onClick={() => setWriteOpen(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={14} /> 아티클 작성
          </button>
        </div>
      </div>

      <div className="container" style={{ marginTop: 32 }}>
        {/* ── 통계 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 10, marginBottom: 40 }}>
          {loading ? [...Array(4)].map((_,i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 10 }} />) : (
            <>
              <StatCard label="발행 아티클"  value={stats.articles}    icon={FileText}   color="#3B82F6" />
              <StatCard label="수집 뉴스"    value={stats.news}        icon={Newspaper}  color="#22C55E" />
              <StatCard label="구독자"       value={stats.subscribers} icon={Users}      color="#F59E0B" />
              <StatCard label="커뮤니티 글"  value={stats.posts}       icon={BarChart2}  color="#A855F7" />
            </>
          )}
        </div>

        {/* ── AI 시장 분석 보조 */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#F59E0B', letterSpacing: '2px', marginBottom: 16 }}>AI 시장 분석</div>
          <AIAssistant context="한국 스타트업 시장 현황" onInsert={() => {}} />
        </div>

        {/* ── Cron 수동 실행 */}
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#60A5FA', letterSpacing: '2px', marginBottom: 14 }}>수동 실행</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: '뉴스 수집', path: '/api/fetch-news' },
              { label: 'AI 요약',   path: '/api/summarize-news' },
              { label: 'OG 이미지', path: '/api/fetch-og' },
              { label: 'AI 리포트', path: '/api/generate-report' },
            ].map(({ label, path }) => (
              <button key={path} onClick={() => runCron(path, label)}
                disabled={!!runningCron} className="btn btn-ghost btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {runningCron === label ? <Loader size={12} /> : <RefreshCw size={12} />}
                {runningCron === label ? `${label} 실행 중...` : label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {writeOpen && <WritePanel onClose={() => { setWriteOpen(false); loadStats() }} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
