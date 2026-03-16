import { useNavigate } from 'react-router-dom'
import { InsightshipLogo } from './Header'

export default function Footer() {
  const navigate = useNavigate()
  const year = new Date().getFullYear()

  return (
    <footer style={{ background: 'var(--c-ink)', color: 'var(--c-paper)', marginTop: '64px', borderTop: '1px solid var(--c-gray-3)' }}>
      <div className="container" style={{ padding: '48px var(--pad-x) 28px' }}>

        {/* 상단 그리드 */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '40px', paddingBottom: '36px', borderBottom: '1px solid var(--c-gray-3)' }}>

          {/* 브랜드 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <InsightshipLogo size={30} />
              <div>
                <div style={{ fontFamily: 'var(--f-sans)', fontWeight: 800, fontSize: '14px', letterSpacing: '1.5px', color: 'var(--c-paper)' }}>
                  INSIGHT<span style={{ color: 'var(--c-gold)' }}>SHIP</span>
                </div>
                <div style={{ fontFamily: 'var(--f-sans)', fontSize: '10px', fontWeight: 500, color: '#9A978F', letterSpacing: '0.3px', marginTop: '3px' }}>청소년 창업 플랫폼</div>
              </div>
            </div>
            <p style={{ color: 'var(--c-gray-6)', fontSize: '13px', lineHeight: 1.8, maxWidth: '280px', marginBottom: '16px' }}>
              청소년에게 창업에 대한 인사이트를 제공하고, 지원하며, 기업과 연결함으로써 세상을 변화시킵니다.
            </p>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)', lineHeight: 2 }}>
              운영: PACM<br />
              기업 파트너십 문의<br />
              <a href="mailto:contact@pacm.kr" style={{ color: 'var(--c-gold)', textDecoration: 'none' }}>contact@pacm.kr</a>
            </div>
          </div>

          {/* 링크 컬럼 */}
          {[
            { title: '콘텐츠', links: [
              { label: '인사이트', path: '/insight' },
              { label: '창업자 스토리', path: '/story' },
              { label: '트렌드 트래커', path: '/trend' },
              { label: '뉴스', path: '/news' },
            ]},
            { title: '서비스', links: [
              { label: '커뮤니티', path: '/community' },
              { label: '기업 연결', path: '/connect' },
              { label: '사업 피드백', path: '/community' },
              { label: '팀원 모집', path: '/community' },
            ]},
            { title: 'INSIGHTSHIP', links: [
              { label: '서비스 소개', path: '/about' },
              { label: '파트너십', path: '/connect', external: false },
              { label: '뉴스레터', path: '/?section=newsletter' },
              { label: '문의하기', href: 'mailto:contact@pacm.kr' },
            ]},
          ].map(col => (
            <div key={col.title}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '2px', marginBottom: '16px' }}>
                {col.title}
              </div>
              {col.links.map(l => (
                <button key={l.label} onClick={() => {
                    if (l.href) { window.location.href = l.href }
                    else if (l.path === '/?section=newsletter') { navigate('/'); setTimeout(() => { const el = document.querySelector('.newsletter-form, [id="newsletter"]'); el?.scrollIntoView({ behavior: 'smooth' }) }, 300) }
                    else if (l.path) { navigate(l.path) }
                  }}
                  style={{
                    display: 'block', background: 'none', border: 'none',
                    color: 'var(--c-gray-6)', fontSize: '13px', marginBottom: '10px',
                    cursor: 'pointer', textAlign: 'left', padding: 0,
                    transition: 'color 0.15s', fontFamily: 'var(--f-sans)',
                  }}
                  onMouseEnter={e => e.target.style.color = 'var(--c-paper)'}
                  onMouseLeave={e => e.target.style.color = 'var(--c-gray-6)'}
                >{l.label}</button>
              ))}
            </div>
          ))}
        </div>

        {/* 하단 카피라이트 */}
        <div style={{
          paddingTop: '20px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
          fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)',
        }}>
          <div>© {year} <span style={{ color: 'var(--c-gold)' }}>INSIGHTSHIP</span> by PACM. All rights reserved.</div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <button onClick={() => navigate('/privacy')} style={{ background:'none',border:'none',color:'var(--c-gray-5)',cursor:'pointer',fontSize:'11px',fontFamily:'var(--f-mono)',transition:'color 0.15s',padding:0 }}
              onMouseEnter={e=>e.target.style.color='var(--c-paper)'} onMouseLeave={e=>e.target.style.color='var(--c-gray-5)'}>개인정보처리방침</button>
            <button onClick={() => navigate('/terms')} style={{ background:'none',border:'none',color:'var(--c-gray-5)',cursor:'pointer',fontSize:'11px',fontFamily:'var(--f-mono)',transition:'color 0.15s',padding:0 }}
              onMouseEnter={e=>e.target.style.color='var(--c-paper)'} onMouseLeave={e=>e.target.style.color='var(--c-gray-5)'}>이용약관</button>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          footer [style*="gridTemplateColumns: 2fr 1fr 1fr 1fr"] {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 560px) {
          footer [style*="gridTemplateColumns"],
          footer [style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
          footer [style*="padding: '48px"] {
            padding-top: 32px !important;
            padding-bottom: 24px !important;
          }
        }
      `}</style>
    </footer>
  )
}
