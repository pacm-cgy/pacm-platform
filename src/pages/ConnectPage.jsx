import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  Briefcase, Mail, Building2, CheckCircle, ChevronRight,
  Users, Zap, Star, Clock, MapPin, Wifi, Tag,
  FileText, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useProjects, useApplyProject, useMyApplications, useProjectApplicationStatus } from '../hooks/useData'
import { useAuthStore } from '../store'
import { useNavigate } from 'react-router-dom'

// ── 신청 상태 배지 ────────────────────────────────────────────────
const APP_STATUS = {
  pending:  { label: '검토 중',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  },
  accepted: { label: '합격',     color: '#22C55E', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)'   },
  rejected: { label: '불합격',   color: '#F43F5E', bg: 'rgba(244,63,94,0.12)',   border: 'rgba(244,63,94,0.3)'   },
}

// ── 프로젝트 카드 ─────────────────────────────────────────────────
function ProjectCard({ project, onApply }) {
  const deadline    = project.deadline ? format(new Date(project.deadline), 'M월 d일', { locale: ko }) : '상시'
  const isOpen      = project.status === 'open'
  const appStatus   = useProjectApplicationStatus(project.id)
  const myApp       = appStatus.data
  const [hov, setHov] = useState(false)

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: 22, background: 'var(--bg2)',
        border: `1px solid ${hov ? 'var(--b2)' : 'var(--b1)'}`,
        borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12,
        transition: 'all 0.18s', transform: hov ? 'translateY(-2px)' : 'none',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--t3)', letterSpacing: '2px', marginBottom: 6 }}>
            {project.company_name || 'INSIGHTSHIP'}
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, fontWeight: 700, lineHeight: 1.3, color: 'var(--t1)' }}>
            {project.title}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
          {isOpen && (
            <span style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontFamily: 'var(--f-mono)', whiteSpace: 'nowrap' }}>모집중</span>
          )}
          {myApp && (
            <span style={{ background: APP_STATUS[myApp.status]?.bg, color: APP_STATUS[myApp.status]?.color, border: `1px solid ${APP_STATUS[myApp.status]?.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontFamily: 'var(--f-mono)', whiteSpace: 'nowrap' }}>
              신청됨 · {APP_STATUS[myApp.status]?.label}
            </span>
          )}
        </div>
      </div>

      <p style={{ color: 'var(--t2)', fontSize: 13, lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: 0 }}>
        {project.description}
      </p>

      {/* 메타 정보 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {project.location && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)' }}>
            <MapPin size={10} /> {project.location}
          </span>
        )}
        {project.is_remote && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--f-mono)', fontSize: 10, color: '#60A5FA' }}>
            <Wifi size={10} /> 원격 가능
          </span>
        )}
        {project.tags?.slice(0, 3).map(t => (
          <span key={t} style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--t4)', background: 'var(--bg3)', padding: '1px 7px', borderRadius: 3 }}>
            #{t}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--b0)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--t3)' }}>
          <Clock size={10} /> 마감 {deadline}
        </span>
        {isOpen && !myApp && (
          <button
            onClick={e => { e.stopPropagation(); onApply(project) }}
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Briefcase size={11} /> 참여 신청
          </button>
        )}
        {myApp && (
          <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--f-mono)' }}>
            {format(new Date(myApp.created_at), 'M.d 신청', { locale: ko })}
          </span>
        )}
      </div>
    </div>
  )
}

// ── 신청 모달 ─────────────────────────────────────────────────────
function ApplyModal({ project, onClose }) {
  const [message, setMessage] = useState('')
  const [err, setErr]         = useState('')
  const [done, setDone]       = useState(false)
  const apply = useApplyProject()

  const handleApply = async () => {
    if (!message.trim()) { setErr('지원 동기를 작성해주세요'); return }
    if (message.trim().length < 20) { setErr('지원 동기를 20자 이상 작성해주세요'); return }
    try {
      await apply.mutateAsync({ projectId: project.id, message })
      setDone(true)
    } catch (e) {
      if (e.message === 'ALREADY_APPLIED') {
        setErr('이미 신청한 프로젝트입니다')
      } else {
        setErr('신청 중 오류가 발생했습니다')
      }
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 520, background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 12, padding: 28 }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
            <CheckCircle size={48} color="#22C55E" style={{ marginBottom: 16 }} />
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--t1)' }}>신청 완료!</div>
            <div style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>
              <strong>{project.title}</strong> 프로젝트에 신청했습니다.<br />
              결과는 등록된 이메일로 안내드립니다.
            </div>
            <button onClick={onClose} className="btn btn-primary">확인</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 700, color: 'var(--t1)' }}>{project.title}</div>
              <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--b2)', color: 'var(--t3)', cursor: 'pointer', width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)', marginBottom: 18 }}>{project.company_name}</div>

            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)', marginBottom: 6 }}>지원 동기 *</div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="지원 동기와 역량을 간략히 소개해주세요 (최소 20자, 최대 2000자)"
              rows={6} maxLength={2000} className="input"
              style={{ resize: 'vertical', minHeight: 120, width: '100%', marginBottom: 4 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: message.length < 20 ? '#F43F5E' : 'var(--t4)' }}>
                {message.length} / 2000
              </span>
            </div>
            {err && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#F43F5E', fontSize: 12, marginBottom: 12 }}>
                <AlertCircle size={12} /> {err}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} className="btn btn-ghost btn-sm">취소</button>
              <button onClick={handleApply} disabled={apply.isPending} className="btn btn-primary btn-sm">
                {apply.isPending ? '신청 중...' : '신청하기'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── 파트너 문의 폼 ────────────────────────────────────────────────
function PartnerForm() {
  const [form, setForm] = useState({ company_name: '', contact_name: '', email: '', phone: '', inquiry_type: 'partnership', message: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)
  const [err, setErr]         = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.company_name || !form.contact_name || !form.email || !form.message) { setErr('필수 항목을 모두 입력해주세요'); return }
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/partner-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '서버 오류')
      setDone(true)
    } catch (e) { setErr(e.message || '제출 중 오류가 발생했습니다. 이메일로 문의해주세요.') }
    finally { setLoading(false) }
  }

  if (done) return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <CheckCircle size={48} color="#22C55E" style={{ marginBottom: 16 }} />
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--t1)' }}>신청이 접수되었습니다!</div>
      <div style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.8 }}>
        빠른 시일 내에 <strong>{form.email}</strong>로 연락드리겠습니다.<br />
        Insightship과 함께해주셔서 감사합니다.
      </div>
    </div>
  )

  const labelSt = { fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)', display: 'block', marginBottom: 6, letterSpacing: '0.5px' }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelSt}>회사명 *</label><input className="input" value={form.company_name} onChange={e => setForm(f => ({...f, company_name: e.target.value}))} placeholder="(주)예시컴퍼니" /></div>
        <div><label style={labelSt}>담당자명 *</label><input className="input" value={form.contact_name} onChange={e => setForm(f => ({...f, contact_name: e.target.value}))} placeholder="홍길동" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelSt}>이메일 *</label><input className="input" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="contact@company.com" /></div>
        <div><label style={labelSt}>연락처</label><input className="input" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="010-0000-0000" /></div>
      </div>
      <div>
        <label style={labelSt}>문의 유형</label>
        <select className="input" value={form.inquiry_type} onChange={e => setForm(f => ({...f, inquiry_type: e.target.value}))}>
          <option value="partnership">기업 파트너십</option>
          <option value="project">프로젝트 의뢰</option>
          <option value="recruitment">인재 발굴</option>
          <option value="sponsorship">후원 / 협찬</option>
          <option value="other">기타</option>
        </select>
      </div>
      <div>
        <label style={labelSt}>문의 내용 *</label>
        <textarea className="input" value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))}
          placeholder="파트너십 목적, 원하시는 협력 방식, 기업 소개 등을 자유롭게 작성해주세요."
          rows={5} style={{ resize: 'vertical', minHeight: 120, width: '100%' }} />
      </div>
      {err && <div style={{ color: '#F43F5E', fontSize: 12 }}>{err}</div>}
      <button type="submit" disabled={loading} className="btn btn-primary" style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 6 }}>
        {loading ? '제출 중...' : <><ChevronRight size={14} /> 파트너십 신청하기</>}
      </button>
    </form>
  )
}

// ── 내 신청 현황 카드 ─────────────────────────────────────────────
function MyApplicationCard({ app }) {
  const [expanded, setExpanded] = useState(false)
  const st = APP_STATUS[app.status] || APP_STATUS.pending
  const proj = app.projects
  const deadline = proj?.deadline ? format(new Date(proj.deadline), 'M월 d일', { locale: ko }) : '상시'

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 10, overflow: 'hidden' }}>
      {/* 상단 요약 */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--f-display)', fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>
              {proj?.title || '(삭제된 프로젝트)'}
            </span>
            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontFamily: 'var(--f-mono)', fontWeight: 700 }}>
              {st.label}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)' }}>
              {proj?.company_name}
            </span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)' }}>
              신청일 {format(new Date(app.created_at), 'yyyy.MM.dd', { locale: ko })}
            </span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)' }}>
              마감 {deadline}
            </span>
          </div>
        </div>
        <div style={{ color: 'var(--t3)', flexShrink: 0 }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* 펼침: 지원 동기 */}
      {expanded && app.motivation && (
        <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--b0)' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--t4)', marginBottom: 6, marginTop: 12 }}>지원 동기</div>
          <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
            {app.motivation}
          </p>
        </div>
      )}
    </div>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function ConnectPage() {
  const { user }          = useAuthStore()
  const navigate          = useNavigate()
  const [selectedProject, setSelectedProject] = useState(null)
  const [tab, setTab]     = useState('projects') // 'projects' | 'my_applications' | 'partner'

  const { data: projects = [], isLoading } = useProjects()
  const { data: myApps = [], isLoading: appsLoading } = useMyApplications()

  const openProjects  = projects.filter(p => p.status === 'open')
  const otherProjects = projects.filter(p => p.status !== 'open')

  const VALUE_CARDS = [
    { icon: <Users size={20} />, title: '청소년 인재 발굴', desc: '전국 청소년 창업가들과 직접 연결됩니다. 기업의 새로운 시각을 만나보세요.', color: '#3B82F6' },
    { icon: <Zap size={20} />,   title: '실전 프로젝트',   desc: '실제 비즈니스 문제를 청소년 팀이 함께 해결합니다. 낮은 비용, 높은 창의성.', color: '#F59E0B' },
    { icon: <Star size={20} />,  title: '브랜드 임팩트',   desc: 'Insightship 플랫폼에 파트너사로 소개됩니다. 청소년 세대와의 접점을 만드세요.', color: '#A855F7' },
  ]

  const TABS = [
    { id: 'projects', label: '프로젝트', icon: Briefcase },
    { id: 'my_applications', label: `내 신청 현황${myApps.length > 0 ? ` (${myApps.length})` : ''}`, icon: FileText },
    { id: 'partner', label: '파트너십 문의', icon: Building2 },
  ]

  return (
    <div style={{ paddingBottom: 80 }}>
      <Helmet>
        <title>기업·청소년 연결 | Insightship — Connect</title>
        <meta name="description" content="실제 기업 프로젝트에 참여하고 경험을 쌓으세요. 기업은 신선한 시각의 청소년 인재를 만납니다. Insightship Connect 파트너십 신청."/>
        <meta property="og:title" content="Connect | Insightship"/>
        <meta property="og:description" content="기업과 청소년 창업가를 연결하는 Insightship Connect 플랫폼"/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://insightship.vercel.app/connect"/>
        <meta name="twitter:card" content="summary"/>
        <link rel="canonical" href="https://insightship.vercel.app/connect"/>
      </Helmet>
      {selectedProject && <ApplyModal project={selectedProject} onClose={() => setSelectedProject(null)} />}

      {/* ── 헤더 */}
      <div style={{ padding: '32px 0 28px', borderBottom: '1px solid var(--b1)' }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#60A5FA', letterSpacing: '3px', marginBottom: 8 }}>INSIGHTSHIP CONNECT</div>
        <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, marginBottom: 12, lineHeight: 1.2, color: 'var(--t1)' }}>
          기업 · 청소년 연결
        </h1>
        <p style={{ color: 'var(--t2)', fontSize: 14, maxWidth: 540, lineHeight: 1.8, margin: 0 }}>
          실제 기업 프로젝트에 참여하고 경험을 쌓으세요. 기업은 신선한 시각의 인재를 만납니다.
        </p>
      </div>

      {/* ── 가치 제안 3카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--b1)', border: '1px solid var(--b1)', borderRadius: 12, overflow: 'hidden', marginTop: 32 }}>
        {VALUE_CARDS.map((item, i) => (
          <div key={i}
            style={{ background: 'var(--bg2)', padding: '24px', display: 'flex', flexDirection: 'column', gap: 10, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}>
            <div style={{ color: item.color, width: 40, height: 40, background: `${item.color}15`, border: `1px solid ${item.color}25`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>{item.title}</div>
            <div style={{ color: 'var(--t2)', fontSize: 13, lineHeight: 1.7 }}>{item.desc}</div>
          </div>
        ))}
      </div>

      {/* ── 탭 */}
      <div style={{ marginTop: 40, display: 'flex', gap: 0, borderBottom: '1px solid var(--b1)' }}>
        {TABS.map(t => {
          const Icon = t.icon
          // 내 신청 현황 탭: 로그인 필요
          const isDisabled = t.id === 'my_applications' && !user
          return (
            <button
              key={t.id}
              onClick={() => {
                if (isDisabled) { navigate('/login'); return }
                setTab(t.id)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', background: 'none',
                border: 'none', borderBottom: `2px solid ${tab === t.id ? '#60A5FA' : 'transparent'}`,
                color: tab === t.id ? '#60A5FA' : isDisabled ? 'var(--t4)' : 'var(--t2)',
                fontFamily: 'var(--f-sans)', fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>
              <Icon size={13} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── 프로젝트 탭 */}
      {tab === 'projects' && (
        <div style={{ marginTop: 32 }}>
          {isLoading ? (
            <div className="grid-3 grid-bordered">
              {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height: 220, borderRadius: 10 }} />)}
            </div>
          ) : projects.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 16, textAlign: 'center' }}>
              <Building2 size={48} color="var(--t4)" />
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--t1)', fontWeight: 700 }}>프로젝트 준비 중</div>
              <p style={{ color: 'var(--t2)', fontSize: 14, maxWidth: 340, lineHeight: 1.8, margin: 0 }}>
                곧 기업 파트너십 프로젝트가 공개됩니다.<br />
                먼저 파트너십 탭에서 문의해주세요.
              </p>
              <button onClick={() => setTab('partner')} className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ChevronRight size={13} /> 파트너십 문의하기
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
              {openProjects.length > 0 && (
                <section>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--b1)' }}>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--t3)', letterSpacing: '2px' }}>모집 중</div>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', animation: 'pulse 2s infinite' }} />
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: '#22C55E' }}>{openProjects.length}개 진행중</span>
                  </div>
                  <div className="grid-3 grid-bordered">
                    {openProjects.map(p => <ProjectCard key={p.id} project={p} onApply={setSelectedProject} />)}
                  </div>
                </section>
              )}
              {otherProjects.length > 0 && (
                <section>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--t3)', letterSpacing: '2px', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--b1)' }}>공개 예정 / 마감</div>
                  <div className="grid-3 grid-bordered">
                    {otherProjects.map(p => <ProjectCard key={p.id} project={p} onApply={setSelectedProject} />)}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 내 신청 현황 탭 */}
      {tab === 'my_applications' && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--t3)', letterSpacing: '2px', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--b1)' }}>
            MY APPLICATIONS
          </div>
          {appsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 10 }} />)}
            </div>
          ) : myApps.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 16, textAlign: 'center' }}>
              <FileText size={48} color="var(--t4)" />
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--t1)', fontWeight: 700 }}>신청 내역이 없습니다</div>
              <p style={{ color: 'var(--t2)', fontSize: 14, maxWidth: 320, lineHeight: 1.8, margin: 0 }}>
                모집 중인 프로젝트에 참여해보세요.
              </p>
              <button onClick={() => setTab('projects')} className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Briefcase size={13} /> 프로젝트 보기
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* 상태별 요약 */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                {Object.entries(APP_STATUS).map(([key, st]) => {
                  const cnt = myApps.filter(a => a.status === key).length
                  if (cnt === 0) return null
                  return (
                    <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 12px', borderRadius: 20, background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontFamily: 'var(--f-mono)' }}>
                      {st.label} {cnt}건
                    </span>
                  )
                })}
              </div>
              {myApps.map(app => <MyApplicationCard key={app.id} app={app} />)}
            </div>
          )}
        </div>
      )}

      {/* ── 파트너십 문의 탭 */}
      {tab === 'partner' && (
        <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 40, alignItems: 'start' }}>
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: '#60A5FA', letterSpacing: '2px', marginBottom: 12 }}>PARTNER INQUIRY</div>
            <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 700, marginBottom: 16, lineHeight: 1.3, color: 'var(--t1)' }}>
              파트너십을<br />시작해보세요
            </h2>
            <p style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>
              신청서를 보내주시면 24시간 내에 담당자가 연락드립니다.
              부담 없이 문의해주세요.
            </p>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--t3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Mail size={11} /> contact@insightship.kr</div>
            </div>
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 12, padding: 28 }}>
            <PartnerForm />
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          div[style*="1fr 1.6fr"] { grid-template-columns: 1fr !important; }
          div[style*="repeat(3, 1fr)"] { grid-template-columns: 1fr !important; }
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  )
}
