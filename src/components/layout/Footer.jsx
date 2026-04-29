import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Rocket, Mail, Instagram,
  ArrowRight, Heart
} from 'lucide-react'

const LINKS = {
  platform: [
    { label: '인사이트', path: '/insight' },
    { label: '트렌드', path: '/trend' },
    { label: '뉴스', path: '/news' },
    { label: 'AI 멘토', path: '/mentor' },
    { label: '아이디어 랩', path: '/ideas' },
    { label: '학습 센터', path: '/edu' },
    { label: '커뮤니티', path: '/community' },
    { label: '이벤트', path: '/events' },
  ],
  company: [
    { label: '소개', path: '/about' },
    { label: '파트너십', path: '/connect' },
    { label: '광고 문의', path: '/advertise' },
    { label: '매거진', path: '/magazine' },
    { label: '스토리', path: '/story' },
  ],
  legal: [
    { label: '이용약관', path: '/terms' },
    { label: '개인정보처리방침', path: '/privacy' },
  ],
}

const SOCIALS = [
  { icon: Instagram, href: 'https://www.instagram.com/pacm.official/',    label: 'PACM Instagram',        desc: 'PACM' },
  { icon: Instagram, href: 'https://www.instagram.com/insightship.team/', label: 'Insightship Instagram', desc: 'Insightship' },
]

export default function Footer() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [subDone, setSubDone] = useState(false)

  const handleSubscribe = async e => {
    e.preventDefault()
    if (!email.trim()) return
    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('newsletter_subscribers').upsert({ email: email.trim() }, { onConflict: 'email' })
      setSubDone(true)
    } catch { setSubDone(true) }
  }

  return (
    <footer style={{ background: 'var(--bg1)', borderTop: '1px solid var(--b1)' }}>

      {/* ── MAIN FOOTER ─────────────────────────────────────────── */}
      <div style={{ maxWidth: 'var(--max-w)', margin: '0 auto', padding: '48px var(--pad-x) 32px' }}>
        <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 300px', gap: 40 }}>

          {/* Platform links */}
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)',
              letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 16 }}>
              플랫폼
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {LINKS.platform.map(l => (
                <Link key={l.path} to={l.path} style={{
                  fontFamily: 'var(--f-sans)', fontSize: 13, color: 'var(--t3)',
                  textDecoration: 'none', transition: 'color .15s', display: 'flex',
                  alignItems: 'center', gap: 4, width: 'fit-content',
                }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--t1)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Company links */}
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)',
              letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 16 }}>
              회사
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {LINKS.company.map(l => (
                <Link key={l.path} to={l.path} style={{
                  fontFamily: 'var(--f-sans)', fontSize: 13, color: 'var(--t3)',
                  textDecoration: 'none', transition: 'color .15s', width: 'fit-content',
                }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--t1)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}>
                  {l.label}
                </Link>
              ))}
              <a href="mailto:contact@pacm.kr" style={{
                fontFamily: 'var(--f-sans)', fontSize: 13, color: 'var(--t3)',
                textDecoration: 'none', transition: 'color .15s', display: 'flex',
                alignItems: 'center', gap: 4, width: 'fit-content',
              }}
                onMouseEnter={e => e.currentTarget.style.color = '#3B82F6'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}>
                <Mail size={12} /> contact@pacm.kr
              </a>
            </div>
          </div>

          {/* Brand col */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 30, height: 30, background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)',
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 12px rgba(59,130,246,0.4)', flexShrink: 0 }}>
                <Rocket size={14} color="#fff" />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--f-sans)', fontWeight: 800, fontSize: 15,
                  letterSpacing: '-0.04em', color: 'var(--t1)', lineHeight: 1.1 }}>
                  INSIGHT<span style={{ color: '#3B82F6' }}>SHIP</span>
                </div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--t4)',
                  letterSpacing: '.1em' }}>
                  by PACM
                </div>
              </div>
            </div>
            <p style={{ fontFamily: 'var(--f-sans)', fontSize: 12, color: 'var(--t3)',
              lineHeight: 1.7, margin: '0 0 16px' }}>
              청소년 창업가를 위한<br/>무료 AI 기반 인사이트 플랫폼
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SOCIALS.map(s => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                  aria-label={s.label}
                  style={{ display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--b1)',
                    color: 'var(--t3)', transition: 'all .15s', textDecoration: 'none',
                    fontSize: 11, fontFamily: 'var(--f-sans)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#E1306C40'; e.currentTarget.style.color = '#E1306C'; e.currentTarget.style.background = 'rgba(225,48,108,0.06)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--b1)'; e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.background = 'transparent' }}>
                  <s.icon size={13} />
                  <span>{s.desc}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Newsletter */}
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)',
              letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 12 }}>
              뉴스레터
            </div>
            <p style={{ fontFamily: 'var(--f-sans)', fontSize: 12, color: 'var(--t3)',
              lineHeight: 1.65, margin: '0 0 14px' }}>
              매주 금요일, 창업 인사이트를 이메일로 받아보세요
            </p>
            {subDone ? (
              <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8,
                fontFamily: 'var(--f-sans)', fontSize: 12, color: '#22C55E',
                display: 'flex', alignItems: 'center', gap: 6 }}>
                ✓ 구독 완료!
              </div>
            ) : (
              <form onSubmit={handleSubscribe} style={{ display: 'flex', gap: 0 }}>
                <input value={email} onChange={e => setEmail(e.target.value)}
                  type="email" placeholder="이메일 입력" required
                  style={{ flex: 1, padding: '9px 12px', background: 'var(--bg2)',
                    border: '1px solid var(--b2)', borderTopLeftRadius: 7,
                    borderBottomLeftRadius: 7, borderRight: 'none',
                    color: 'var(--t1)', fontFamily: 'var(--f-sans)', fontSize: 12,
                    outline: 'none', transition: 'border-color .15s' }}
                  onFocus={e => e.target.style.borderColor = '#3B82F6'}
                  onBlur={e  => e.target.style.borderColor = 'var(--b2)'} />
                <button type="submit"
                  style={{ padding: '9px 12px', background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)',
                    border: 'none', borderTopRightRadius: 7, borderBottomRightRadius: 7,
                    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    transition: 'opacity .15s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  <ArrowRight size={14} />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* ── BOTTOM BAR ──────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--b0)', padding: '16px var(--pad-x)' }}>
        <div style={{ maxWidth: 'var(--max-w)', margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)' }}>
            © 2026 PACM. All rights reserved. · 대표: 조경용
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {LINKS.legal.map(l => (
              <Link key={l.path} to={l.path} style={{
                fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)',
                textDecoration: 'none', transition: 'color .15s',
              }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--t2)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}>
                {l.label}
              </Link>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)' }}>
              Made with <Heart size={10} color="#F43F5E" fill="#F43F5E" style={{ margin: '0 2px' }} /> in Korea
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .footer-grid {
            grid-template-columns: 1fr 1fr !important;
            gap: 28px !important;
          }
        }
        @media (max-width: 540px) {
          .footer-grid {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
        }
      `}</style>
    </footer>
  )
}
