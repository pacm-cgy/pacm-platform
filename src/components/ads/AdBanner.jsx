// 광고 배너 컴포넌트 - 광고 문의: contact@pacm.kr
import { useState } from 'react'

const AD_SIZES = {
  leaderboard: { width: '728px', height: '90px',  mobileH: '60px',  label: '광고' },
  rectangle:   { width: '300px', height: '250px', mobileH: null,    label: '광고' },
  infeed:      { width: '100%',  height: '80px',  mobileH: '70px',  label: '광고' },
  mobile:      { width: '320px', height: '50px',  mobileH: '50px',  label: '광고' },
  billboard:   { width: '100%',  height: '120px', mobileH: '80px',  label: '광고' },
}

// 실제 광고 데이터 (추후 CMS/API로 교체)
// 현재는 광고 문의 배너 표시
const AD_PLACEHOLDER = {
  title: '이 공간에 광고를 게재하세요',
  sub: 'contact@pacm.kr · 창업 생태계에 관심 있는 기업/브랜드 환영',
  cta: '광고 문의',
  href: '/advertise',
}

export default function AdBanner({ type = 'infeed', id, style = {}, slot }) {
  const size = AD_SIZES[type] || AD_SIZES.infeed
  const [hovered, setHovered] = useState(false)

  // 실제 광고 슬롯이 있으면 표시 (추후 연동)
  if (slot?.image && slot?.href) {
    return (
      <a href={slot.href} target="_blank" rel="noopener noreferrer sponsored"
        style={{ display: 'block', width: '100%', textDecoration: 'none', ...style }}>
        <img src={slot.image} alt={slot.alt || '광고'} style={{ width: '100%', height: 'auto', display: 'block' }} />
      </a>
    )
  }

  return (
    <a
      href={AD_PLACEHOLDER.href}
      id={id || `ad-${type}`}
      data-ad-type={type}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '4px',
        width: size.width, minHeight: size.height,
        background: hovered ? 'var(--c-gray-2)' : 'var(--c-gray-1)',
        border: '1px dashed var(--c-gray-4)',
        textDecoration: 'none', cursor: 'pointer',
        transition: 'background 0.15s',
        maxWidth: '100%', boxSizing: 'border-box', padding: '12px 20px',
        ...style,
      }}
    >
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: '9px', color: 'var(--c-gray-5)', letterSpacing: '2px', marginBottom: '4px' }}>
        {size.label}
      </div>
      <div style={{ fontFamily: 'var(--f-sans)', fontSize: '13px', color: 'var(--c-muted)', textAlign: 'center', fontWeight: 500 }}>
        {AD_PLACEHOLDER.title}
      </div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)', textAlign: 'center' }}>
        {AD_PLACEHOLDER.sub}
      </div>
      {hovered && (
        <div style={{ marginTop: '6px', padding: '4px 12px', background: 'var(--c-gold)', color: '#000', fontSize: '10px', fontFamily: 'var(--f-mono)', letterSpacing: '1px' }}>
          {AD_PLACEHOLDER.cta} →
        </div>
      )}
    </a>
  )
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
