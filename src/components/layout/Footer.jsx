import { useNavigate } from 'react-router-dom'
import { InsightshipLogo } from './Header'

export default function Footer() {
  const navigate = useNavigate()
  return (
    <footer style={{ background: 'var(--c-ink)', color: 'var(--c-paper)', marginTop: '64px' }}>
      <div className="container" style={{ padding: '48px var(--pad-x) 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '40px', paddingBottom: '36px', borderBottom: '1px solid #ffffff10' }}>
          <div>
            {/* 로고 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <InsightshipLogo size={32} />
              <div>
                <div style={{ fontFamily: 'var(--f-mono)', fontWeight: 700, fontSize: '16px', letterSpacing: '2px' }}>
                  INSIGHT<span style={{ color: 'var(--c-gold)' }}>SHIP</span>
                </div>
                <div style={{ fontFamily: 'var(--f-serif)', fontSize: '9px', color: 'var(--c-muted)', letterSpacing: '1px' }}>청소년 창업 플랫폼</div>
              </div>
            </div>
            <div style={{ color: '#555', fontSize: '13px', lineHeight: 1.8, maxWidth: '280px' }}>
              청소년에게 창업에 대한 인사이트를 제공하고, 지원하며, 기업과 연결함으로써 세상을 변화시킵니다.<br /><br />
              <span style={{ color: '#444', fontFamily: 'var(--f-mono)', fontSize: '11px' }}>
                사업자등록번호: 000-00-00000<br />
                주업종: 응용 소프트웨어 개발 및 공급업<br /><br />
                기업 파트너십 문의<br />
                <a href="mailto:contact@pacm.kr" style={{ color: 'var(--c-gold)', textDecoration: 'none' }}>contact@pacm.kr</a>
              </span>
            </div>
          </div>
          {[
            { title: '콘텐츠', links: [{ label: '인사이트', path: '/insight' }, { label: '창업자 스토리', path: '/story' }, { label: '트렌드 트래커', path: '/trend' }, { label: '매거진', path: '/story' }] },
            { title: '서비스', links: [{ label: '커뮤니티', path: '/community' }, { label: '기업 연결', path: '/connect' }, { label: '멘토링', path: '/community' }, { label: '사업 피드백', path: '/community' }] },
            { title: 'INSIGHTSHIP', links: [{ label: '회사 소개', path: '/' }, { label: '팀 소개', path: '/' }, { label: '파트너십', path: '/connect' }, { label: '문의하기', path: '/' }] },
          ].map(col => (
            <div key={col.title}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gold)', letterSpacing: '2px', marginBottom: '16px' }}>{col.title}</div>
              {col.links.map(l => (
                <button key={l.label} onClick={() => navigate(l.path)}
                  style={{ display: 'block', background: 'none', border: 'none', color: '#666', fontSize: '13px', marginBottom: '8px', cursor: 'pointer', textAlign: 'left', padding: 0, transition: 'color 0.15s', fontFamily: 'var(--f-sans)' }}
                  onMouseEnter={e => e.target.style.color = 'var(--c-paper)'}
                  onMouseLeave={e => e.target.style.color = '#666'}
                >{l.label}</button>
              ))}
            </div>
          ))}
        </div>
        <div style={{ paddingTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--f-mono)', fontSize: '11px', color: '#333' }}>
          <div>© 2026 <span style={{ color: 'var(--c-gold)' }}>INSIGHTSHIP</span> by PACM. All rights reserved.</div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <span style={{ cursor: 'pointer', transition: 'color 0.15s' }} onMouseEnter={e=>e.target.style.color='#888'} onMouseLeave={e=>e.target.style.color='#333'}>개인정보처리방침</span>
            <span style={{ cursor: 'pointer', transition: 'color 0.15s' }} onMouseEnter={e=>e.target.style.color='#888'} onMouseLeave={e=>e.target.style.color='#333'}>이용약관</span>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) {
          footer > div > div:first-child { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px) {
          footer > div > div:first-child { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </footer>
  )
}
