// 광고/프로모션 배너 컴포넌트 — PACM E.P.G 개편 v2.0
// 광고 문의: contact@pacm.kr
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, ExternalLink } from 'lucide-react'

const AD_SIZES = {
  leaderboard: { width: '728px', height: '90px',  mobileH: '60px',  label: '광고' },
  rectangle:   { width: '300px', height: '250px', mobileH: null,    label: '광고' },
  infeed:      { width: '100%',  height: '80px',  mobileH: '70px',  label: '광고' },
  mobile:      { width: '320px', height: '50px',  mobileH: '50px',  label: '광고' },
  billboard:   { width: '100%',  height: '120px', mobileH: '80px',  label: '광고' },
}

// ── Sparkship 크로스 프로모션 배너 ───────────────────────────────
function SparkshipPromoBanner({ size, style }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)
  const isSmall = size === 'leaderboard' || size === 'mobile'

  return (
    <div
      onClick={() => { window.open('https://www.sparkship.pacm.kr', '_blank') }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        minHeight: AD_SIZES[size]?.height || '80px',
        background: hovered
          ? 'linear-gradient(135deg, #1a1200 0%, #2d1f00 50%, #3d2b00 100%)'
          : 'linear-gradient(135deg, #0f0c00 0%, #1a1200 50%, #241800 100%)',
        border: `1px solid ${hovered ? '#f97316' : '#3d2b00'}`,
        borderRadius: '2px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isSmall ? '10px 16px' : '14px 24px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textDecoration: 'none',
        overflow: 'hidden',
        position: 'relative',
        gap: '16px',
        ...style,
      }}
    >
      {/* 배경 글로우 효과 */}
      <div style={{
        position: 'absolute', top: '50%', left: '60px',
        width: '120px', height: '120px',
        background: 'rgba(249,115,22,0.06)',
        borderRadius: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none',
      }} />

      {/* 왼쪽: 아이콘 + 텍스트 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', zIndex: 1 }}>
        <div style={{
          width: isSmall ? '28px' : '36px',
          height: isSmall ? '28px' : '36px',
          background: '#f97316',
          borderRadius: '4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Zap size={isSmall ? 14 : 18} color="#000" fill="#000" />
        </div>
        <div>
          <div style={{
            fontFamily: 'var(--f-mono)', fontSize: isSmall ? '9px' : '10px',
            color: '#f97316', letterSpacing: '2px', marginBottom: '2px',
          }}>
            PACM SPARKSHIP
          </div>
          <div style={{
            fontFamily: 'var(--f-serif)', fontSize: isSmall ? '12px' : '14px',
            fontWeight: 700, color: '#f0ece0', lineHeight: 1.3,
          }}>
            {isSmall ? '내 아이디어를 기업에 선보이세요' : '청소년 창업가의 무대 — 아이디어부터 기업 연결까지'}
          </div>
        </div>
      </div>

      {/* 오른쪽: CTA */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        background: hovered ? '#f97316' : 'transparent',
        border: `1px solid ${hovered ? '#f97316' : '#5a3a00'}`,
        padding: '6px 14px', borderRadius: '2px',
        flexShrink: 0, transition: 'all 0.2s ease',
      }}>
        <span style={{
          fontFamily: 'var(--f-mono)', fontSize: '10px',
          color: hovered ? '#000' : '#f97316',
          letterSpacing: '1px', fontWeight: 700,
          whiteSpace: 'nowrap',
        }}>
          포트폴리오 등록 →
        </span>
      </div>
    </div>
  )
}

// ── 기업 광고 플레이스홀더 ────────────────────────────────────────
function AdPlaceholder({ size, style }) {
  const [hovered, setHovered] = useState(false)
  const sizeConfig = AD_SIZES[size] || AD_SIZES.infeed

  return (
    <a
      href="/advertise"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '4px',
        width: sizeConfig.width, minHeight: sizeConfig.height,
        background: hovered ? 'var(--c-gray-2)' : 'var(--c-gray-1)',
        border: '1px dashed var(--c-gray-4)',
        textDecoration: 'none', cursor: 'pointer',
        transition: 'background 0.15s',
        maxWidth: '100%', boxSizing: 'border-box', padding: '12px 20px',
        ...style,
      }}
    >
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: '9px', color: 'var(--c-gray-5)', letterSpacing: '2px', marginBottom: '4px' }}>
        {sizeConfig.label}
      </div>
      <div style={{ fontFamily: 'var(--f-sans)', fontSize: '13px', color: 'var(--c-muted)', textAlign: 'center', fontWeight: 500 }}>
        이 공간에 광고를 게재하세요 — 청소년 창업가 독자층에게 브랜드를 알리세요
      </div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)', textAlign: 'center' }}>
        contact@pacm.kr · 기업/브랜드 환영
      </div>
      {hovered && (
        <div style={{
          marginTop: '6px', padding: '4px 12px',
          background: 'var(--c-gold)', color: '#000',
          fontSize: '10px', fontFamily: 'var(--f-mono)', letterSpacing: '1px',
        }}>
          광고 문의 →
        </div>
      )}
    </a>
  )
}

// ── 메인 export ───────────────────────────────────────────────────
export default function AdBanner({ type = 'infeed', id, style = {}, slot, showSparkship = true }) {
  const size = AD_SIZES[type] || AD_SIZES.infeed

  // 실제 광고 슬롯이 있으면 표시
  if (slot?.image && slot?.href) {
    return (
      <a href={slot.href} target="_blank" rel="noopener noreferrer sponsored"
        style={{ display: 'block', width: '100%', textDecoration: 'none', ...style }}>
        <img src={slot.image} alt={slot.alt || '광고'} style={{ width: '100%', height: 'auto', display: 'block' }} />
      </a>
    )
  }

  // 광고 없음 → Sparkship 크로스 프로모션 배너
  if (showSparkship) {
    return <SparkshipPromoBanner size={type} style={style} />
  }

  // 광고 문의 플레이스홀더 (showSparkship=false일 때)
  return <AdPlaceholder size={type} style={style} />
}

export function AdSlot({ position, slot, ...props }) {
  const slotMap = {
    'header-top':     { type: 'leaderboard', style: { margin: '0 auto 16px' } },
    'content-top':    { type: 'billboard',   style: { margin: '0 0 24px' } },
    'content-mid':    { type: 'infeed',      style: { margin: '32px 0' } },
    'content-bottom': { type: 'billboard',   style: { margin: '32px 0 0' } },
    'sidebar':        { type: 'rectangle',   style: {} },
    'news-between':   { type: 'infeed',      style: { margin: '4px 0' } },
    'mobile-fixed':   { type: 'mobile',      style: { position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 99 } },
  }
  const config = slotMap[position] || { type: 'infeed', style: {} }
  return <AdBanner {...config} slot={slot} {...props} />
}
