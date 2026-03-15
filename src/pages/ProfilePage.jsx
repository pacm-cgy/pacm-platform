import { useAuthStore } from '../store'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

export default function ProfilePage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  useEffect(() => { if (!user) navigate('/') }, [user])
  if (!profile) return null
  return (
    <div style={{ maxWidth:'600px', margin:'0 auto', padding:'48px 0 80px' }}>
      <div className="t-eyebrow" style={{ marginBottom:'8px' }}>MY PROFILE</div>
      <div className="card" style={{ padding:'32px' }}>
        <div style={{ display:'flex', gap:'20px', alignItems:'center', marginBottom:'24px' }}>
          <div className="avatar avatar-xl">{profile.avatar_url?<img src={profile.avatar_url} alt=""/>:(profile.display_name?.[0]||'U')}</div>
          <div>
            <div style={{ fontFamily:'var(--f-serif)', fontSize:'22px', fontWeight:700 }}>{profile.display_name}</div>
            <div className="t-caption" style={{ marginTop:'4px' }}>@{profile.username}</div>
            {profile.startup_name && <div style={{ fontSize:'13px', color:'var(--c-gold)', marginTop:'4px' }}>{profile.startup_name}</div>}
          </div>
        </div>
        {[
          { label:'이메일', value: profile.email },
          { label:'학교', value: profile.school||'—' },
          { label:'지역', value: profile.location||'—' },
          { label:'역할', value: profile.role },
          { label:'가입일', value: new Date(profile.created_at).toLocaleDateString('ko-KR') },
        ].map(r=>(
          <div key={r.label} style={{ display:'flex', padding:'10px 0', borderBottom:'1px solid var(--c-border)' }}>
            <div className="t-caption" style={{ width:'80px', flexShrink:0 }}>{r.label}</div>
            <div style={{ fontSize:'14px' }}>{r.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
