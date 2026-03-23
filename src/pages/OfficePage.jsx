import { useState, useRef, useEffect } from 'react'
import { Terminal, Zap, ChevronRight } from 'lucide-react'

const QUICK_CMDS = [
  { label: 'status', desc: '전체 현황' },
  { label: 'ls', desc: '부서 목록' },
  { label: 'ls 개발부', desc: '개발부 직원' },
  { label: 'ls ai연구소', desc: '연구소 직원' },
  { label: 'report', desc: '업무 현황' },
  { label: 'log', desc: '최근 로그' },
  { label: 'help', desc: '명령어 도움말' },
]

const DEPT_COLORS = {
  management: '#6366F1', planning: '#8B5CF6', dev: '#3B82F6',
  design: '#EC4899', qa: '#EF4444', research: '#F59E0B',
  marketing: '#10B981', content: '#06B6D4', security: '#DC2626'
}

export default function OfficePage() {
  const [history, setHistory] = useState([
    { type: 'system', text: `⚡ PACM AI OFFICE TERMINAL v1.0\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n9개 부서 · AI 직원 90명 · 예산 0원\n\n"help"를 입력하면 명령어 목록을 볼 수 있습니다.\n"status"로 전체 현황을 확인하세요.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [cmdHistory, setCmdHistory] = useState([])
  const [histIdx, setHistIdx] = useState(-1)
  const bottomRef = useRef()
  const inputRef = useRef()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  const runCmd = async (cmd) => {
    if (!cmd.trim()) return
    const trimmed = cmd.trim()

    setCmdHistory(h => [trimmed, ...h].slice(0, 50))
    setHistIdx(-1)
    setHistory(h => [...h, { type: 'input', text: trimmed }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/office', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: trimmed })
      })
      const data = await res.json()
      setHistory(h => [...h, { type: data.type || 'output', text: data.output || JSON.stringify(data) }])
    } catch(e) {
      setHistory(h => [...h, { type: 'error', text: `❌ 연결 오류: ${e.message}` }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      runCmd(input)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newIdx = Math.min(histIdx + 1, cmdHistory.length - 1)
      setHistIdx(newIdx)
      setInput(cmdHistory[newIdx] || '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newIdx = Math.max(histIdx - 1, -1)
      setHistIdx(newIdx)
      setInput(newIdx === -1 ? '' : cmdHistory[newIdx])
    }
  }

  const textColor = (type) => {
    switch(type) {
      case 'input':  return '#F59E0B'
      case 'error':  return '#EF4444'
      case 'system': return '#6B6B6B'
      default:       return '#E5E5E5'
    }
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)', background: '#060606', padding: '24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg,#F59E0B,#D97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Terminal size={18} color="#000" />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: '#F5F5F5' }}>PACM AI OFFICE</h1>
            <p style={{ fontSize: 12, color: '#6B6B6B', fontFamily: 'var(--f-mono)' }}>9 DEPTS · 90 AGENTS · TERMINAL v1.0</p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {['#EF4444','#F59E0B','#10B981'].map(c => (
              <div key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 16 }}>

          {/* 터미널 */}
          <div style={{ background: '#0C0C0C', border: '1px solid #1A1A1A', borderRadius: 12, overflow: 'hidden' }}>
            {/* 출력창 */}
            <div style={{ height: 520, overflowY: 'auto', padding: '16px 20px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, lineHeight: 1.7 }}>
              {history.map((h, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  {h.type === 'input' ? (
                    <div style={{ color: '#F59E0B', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ color: '#3B82F6', flexShrink: 0 }}>pacm@office:~$</span>
                      <span>{h.text}</span>
                    </div>
                  ) : (
                    <pre style={{ color: textColor(h.type), margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>{h.text}</pre>
                  )}
                </div>
              ))}
              {loading && (
                <div style={{ color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#3B82F6' }}>pacm@office:~$</span>
                  <span style={{ animation: 'blink 0.8s infinite' }}>처리 중...</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* 입력창 */}
            <div style={{ borderTop: '1px solid #1A1A1A', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, background: '#0A0A0A' }}>
              <span style={{ color: '#3B82F6', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, flexShrink: 0 }}>pacm@office:~$</span>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="명령어 입력... (help)"
                disabled={loading}
                autoFocus
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: '#F59E0B', fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
                  caretColor: '#F59E0B'
                }}
              />
              <ChevronRight size={14} color={loading ? '#333' : '#F59E0B'} />
            </div>
          </div>

          {/* 사이드패널 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 빠른 명령 */}
            <div style={{ background: '#0C0C0C', border: '1px solid #1A1A1A', borderRadius: 10, padding: '14px' }}>
              <div style={{ fontSize: 11, color: '#555', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em', marginBottom: 10 }}>QUICK COMMANDS</div>
              {QUICK_CMDS.map(c => (
                <button key={c.label} onClick={() => runCmd(c.label)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '7px 10px', borderRadius: 6, background: 'transparent', border: '1px solid #1A1A1A', cursor: 'pointer', marginBottom: 6, transition: 'all 0.15s', textAlign: 'left' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#F59E0B'; e.currentTarget.style.background = 'rgba(245,158,11,0.05)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.background = 'transparent' }}>
                  <span style={{ color: '#F59E0B', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{c.label}</span>
                  <span style={{ color: '#444', fontSize: 10 }}>{c.desc}</span>
                </button>
              ))}
            </div>

            {/* 부서 현황 */}
            <div style={{ background: '#0C0C0C', border: '1px solid #1A1A1A', borderRadius: 10, padding: '14px' }}>
              <div style={{ fontSize: 11, color: '#555', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em', marginBottom: 10 }}>DEPARTMENTS</div>
              {Object.entries(DEPT_COLORS).map(([code, color]) => {
                const names = { management:'경영부', planning:'기획부', dev:'개발부', design:'디자인부', qa:'QA팀', research:'AI연구소', marketing:'마케팅부', content:'콘텐츠부', security:'보안팀' }
                return (
                  <button key={code} onClick={() => runCmd(`ls ${names[code]}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 8px', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', marginBottom: 3 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#111'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ color: '#999', fontSize: 12 }}>{names[code]}</span>
                    <span style={{ color: '#444', fontSize: 10, marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace' }}>10</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: '#333', fontFamily: 'JetBrains Mono, monospace', textAlign: 'center' }}>
          ↑↓ 명령어 이력 탐색 · Enter 실행 · 예산 0원 · 오픈소스 기반
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }
      `}</style>
    </div>
  )
}
