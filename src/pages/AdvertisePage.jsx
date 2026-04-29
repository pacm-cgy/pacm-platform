import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Mail, BarChart2, Users, Eye, CheckCircle } from 'lucide-react'

const AD_PACKAGES = [
  {
    name: '스타터', price: '문의', period: '월 단위',
    features: ['뉴스 페이지 인피드 배너', '모바일 최적화', '클릭 통계 제공'],
    highlight: false, color: '#3B82F6',
  },
  {
    name: '스탠다드', price: '문의', period: '월 단위',
    features: ['전 페이지 빌보드 배너', '뉴스 인피드 + 사이드바', '브랜드 스토리 아티클 1편', '주간 리포트'],
    highlight: true, color: '#F59E0B',
  },
  {
    name: '프리미엄', price: '문의', period: '월 단위',
    features: ['전 패키지 포함', '뉴스레터 광고 (주 1회)', '홈페이지 메인 노출', '전담 담당자 배정'],
    highlight: false, color: '#A855F7',
  },
]

const STATS = [
  { icon: <Users size={20} />, value: '청소년 창업가', label: '핵심 타겟', color: '#3B82F6' },
  { icon: <Eye size={20} />,   value: '창업 생태계',   label: '관심 독자층', color: '#22C55E' },
  { icon: <BarChart2 size={20} />, value: '주간 뉴스레터', label: '정기 발송', color: '#F59E0B' },
]

export default function AdvertisePage() {
  const [form, setForm] = useState({ company: '', name: '', email: '', phone: '', message: '', package: '스탠다드' })
  const [status, setStatus] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.company || !form.email) return
    setStatus('sending')
    try {
      const res = await fetch('/api/ad-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: form.company, name: form.name, email: form.email, phone: form.phone, package: form.package, message: form.message }),
      })
      if (!res.ok) throw new Error('서버 오류')
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <Helmet>
        <title>광고 문의 | Insightship — 청소년 창업 플랫폼 광고</title>
        <meta name="description" content="청소년 창업가 1,000명이 이용하는 Insightship에 광고를 게재하세요. 인피드 배너, 스폰서 아티클, 뉴스레터 광고 패키지 문의."/>
        <meta property="og:title" content="광고 문의 | Insightship"/>
        <meta property="og:description" content="청소년 창업 플랫폼 Insightship 광고 패키지 안내 및 문의"/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://insightship.vercel.app/advertise"/>
        <meta name="twitter:card" content="summary"/>
        <link rel="canonical" href="https://insightship.vercel.app/advertise"/>
      </Helmet>

      {/* ── 헤더 */}
      <div style={{ borderBottom: '1px solid var(--b1)', padding: '48px 0 32px', background: 'linear-gradient(180deg,var(--bg1) 0%,var(--bg0) 100%)' }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#60A5FA', letterSpacing: '3px', marginBottom: 10, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', display: 'inline-block', padding: '3px 12px', borderRadius: 4 }}>
            ADVERTISE
          </div>
          <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(26px,4vw,40px)', fontWeight: 700, marginBottom: 14, color: 'var(--t1)', marginTop: 16 }}>
            Insightship에 광고를 게재하세요
          </h1>
          <p style={{ color: 'var(--t2)', fontSize: 15, lineHeight: 1.7, maxWidth: 600 }}>
            청소년 창업가 및 창업 생태계에 관심 있는 독자들에게 브랜드를 소개하세요.
            스타트업, 창업 교육, 투자 기관, 정부 지원 프로그램 등 다양한 광고주를 환영합니다.
          </p>
        </div>
      </div>

      <div className="container" style={{ maxWidth: 900, paddingTop: 48 }}>

        {/* ── 통계 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 48 }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 10, padding: 24, textAlign: 'center', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--b2)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--b1)'}>
              <div style={{ color: s.color, marginBottom: 10, display: 'flex', justifyContent: 'center' }}>{s.icon}</div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, fontWeight: 700, marginBottom: 4, color: 'var(--t1)' }}>{s.value}</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)', letterSpacing: '1px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── 패키지 */}
        <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 700, marginBottom: 20, color: 'var(--t1)' }}>광고 패키지</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 48 }}>
          {AD_PACKAGES.map((pkg) => (
            <div key={pkg.name} style={{
              background: pkg.highlight ? 'var(--bg2)' : 'var(--bg1)',
              border: `1px solid ${pkg.highlight ? pkg.color + '50' : 'var(--b1)'}`,
              borderRadius: 10, padding: 24,
              position: 'relative', overflow: 'hidden',
              transition: 'transform 0.15s, border-color 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = pkg.color + '70' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = pkg.highlight ? pkg.color + '50' : 'var(--b1)' }}>
              {pkg.highlight && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${pkg.color},${pkg.color}60)` }} />
              )}
              {pkg.highlight && (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: pkg.color, background: `${pkg.color}15`, border: `1px solid ${pkg.color}30`, padding: '2px 8px', display: 'inline-block', marginBottom: 10, letterSpacing: '1px', borderRadius: 3 }}>
                  추천
                </div>
              )}
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'var(--t1)' }}>{pkg.name}</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: pkg.color, marginBottom: 18 }}>{pkg.price} / {pkg.period}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pkg.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--t2)' }}>
                    <CheckCircle size={13} color={pkg.color} style={{ flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── 문의 폼 */}
        <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 700, marginBottom: 20, color: 'var(--t1)' }}>광고 문의</h2>

        {status === 'done' ? (
          <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, padding: 32, textAlign: 'center' }}>
            <CheckCircle size={32} color="#22C55E" style={{ marginBottom: 12 }} />
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--t1)' }}>문의가 접수되었습니다</div>
            <div style={{ color: 'var(--t2)', fontSize: 14 }}>영업일 기준 2일 이내 {form.email}로 답변 드리겠습니다.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>회사/기관명 *</label>
                <input required value={form.company} onChange={e => setForm(f => ({...f, company: e.target.value}))} placeholder="(주)인사이트십" className="input" />
              </div>
              <div>
                <label style={labelStyle}>담당자명</label>
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="홍길동" className="input" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>이메일 *</label>
                <input required type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="contact@company.com" className="input" />
              </div>
              <div>
                <label style={labelStyle}>연락처</label>
                <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="010-0000-0000" className="input" />
              </div>
            </div>
            <div>
              <label style={labelStyle}>관심 패키지</label>
              <select value={form.package} onChange={e => setForm(f => ({...f, package: e.target.value}))} className="input" style={{ cursor: 'pointer' }}>
                {AD_PACKAGES.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                <option value="기타">기타 (문의사항에 작성)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>문의사항</label>
              <textarea value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))}
                rows={4} placeholder="광고 목적, 기간, 예산 등 자유롭게 작성해주세요" className="input" style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button type="submit" disabled={status === 'sending'} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 24px' }}>
                <Mail size={14} />
                {status === 'sending' ? '전송 중...' : '문의 보내기'}
              </button>
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                또는 직접 이메일: <a href="mailto:contact@pacm.kr" style={{ color: '#60A5FA' }}>contact@pacm.kr</a>
              </span>
            </div>
            {status === 'error' && <div style={{ color: 'var(--rose)', fontSize: 12 }}>전송 실패. 이메일로 직접 문의해주세요.</div>}
          </form>
        )}
      </div>
    </div>
  )
}

const labelStyle = {
  fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)',
  letterSpacing: '1px', display: 'block', marginBottom: 6,
}
