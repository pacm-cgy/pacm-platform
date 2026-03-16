import { useState } from 'react'
import { useAuthStore } from '../store'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Save, User, MapPin, School, Edit2 } from 'lucide-react'

// 지역 목록 (행정안전부 공공데이터 기준)
const REGIONS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시',
  '대전광역시', '울산광역시', '세종특별자치시', '경기도', '강원도',
  '충청북도', '충청남도', '전라북도', '전라남도', '경상북도',
  '경상남도', '제주특별자치도',
]

export default function ProfilePage() {
  const { user, profile, setProfile } = useAuthStore()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    display_name: '',
    username: '',
    bio: '',
    school: '',
    region: '',
    startup_name: '',
    location: '',
  })

  useEffect(() => {
    if (!user) navigate('/')
  }, [user])

  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.display_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
        school: profile.school || '',
        region: profile.region || '',
        startup_name: profile.startup_name || '',
        location: profile.location || '',
      })
    }
  }, [profile])

  if (!profile) return null

  const handleSave = async () => {
    if (!form.display_name.trim()) { setError('이름을 입력해주세요'); return }
    if (form.display_name.length > 50) { setError('이름은 50자 이하'); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .update({
          display_name: form.display_name.trim(),
          bio: form.bio.trim().slice(0, 300),
          school: form.school.trim().slice(0, 100),
          region: form.region,
          startup_name: form.startup_name.trim().slice(0, 100),
          location: form.location.trim().slice(0, 100),
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id)
        .select()
        .single()
      if (err) throw err
      setProfile(data)
      setSuccess('저장됐습니다 ✓')
      setEditing(false)
    } catch (e) {
      setError('저장 중 오류가 발생했습니다')
    } finally {
      setSaving(false)
    }
  }

  const fields = [
    { label: '이메일', value: profile.email, icon: <User size={14} />, readOnly: true },
    { label: '사용자명', value: `@${profile.username}`, icon: <User size={14} />, readOnly: true },
    { label: '역할', value: profile.role, icon: <User size={14} />, readOnly: true },
    { label: '가입일', value: new Date(profile.created_at).toLocaleDateString('ko-KR'), icon: null, readOnly: true },
  ]

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '48px var(--pad-x) 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: '6px' }}>MY PROFILE</div>
          <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: '24px', fontWeight: 700 }}>내 정보</h1>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Edit2 size={14} /> 수정
          </button>
        )}
      </div>

      {/* 프로필 카드 */}
      <div className="card" style={{ padding: '32px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '28px' }}>
          <div className="avatar avatar-xl">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt={profile.display_name} />
              : <span style={{ fontSize: '28px' }}>{profile.display_name?.[0]?.toUpperCase() || 'U'}</span>}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: '22px', fontWeight: 700 }}>{profile.display_name}</div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: '12px', color: 'var(--c-muted)', marginTop: '4px' }}>@{profile.username}</div>
            {profile.startup_name && (
              <div style={{ fontSize: '13px', color: 'var(--c-gold)', marginTop: '4px' }}>🚀 {profile.startup_name}</div>
            )}
          </div>
        </div>

        {/* 읽기 전용 필드 */}
        {fields.map(f => (
          <div key={f.label} style={{ display: 'flex', padding: '12px 0', borderBottom: '1px solid var(--c-gray-3)', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '80px', flexShrink: 0, fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)' }}>{f.label}</div>
            <div style={{ fontSize: '14px', color: 'var(--c-paper)' }}>{f.value}</div>
          </div>
        ))}
      </div>

      {/* 수정 가능 폼 */}
      <div className="card" style={{ padding: '32px' }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gold)', letterSpacing: '2px', marginBottom: '20px' }}>
          {editing ? '수정 중' : '기본 정보'}
        </div>

        {[
          { key: 'display_name', label: '표시 이름', placeholder: '이름을 입력하세요', maxLength: 50 },
          { key: 'startup_name', label: '스타트업/프로젝트명', placeholder: '선택사항', maxLength: 100 },
          { key: 'school', label: '학교', placeholder: '재학 중인 학교명', maxLength: 100 },
          { key: 'bio', label: '소개', placeholder: '간단한 자기소개 (300자 이내)', maxLength: 300, textarea: true },
        ].map(({ key, label, placeholder, maxLength, textarea }) => (
          <div key={key} style={{ marginBottom: '20px' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)', marginBottom: '8px' }}>{label}</div>
            {editing ? (
              textarea ? (
                <textarea value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder} rows={3} maxLength={maxLength}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--c-gray-2)', border: '1px solid var(--c-gray-3)', color: 'var(--c-paper)', fontFamily: 'var(--f-sans)', fontSize: '14px', resize: 'vertical' }} />
              ) : (
                <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder} maxLength={maxLength}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--c-gray-2)', border: '1px solid var(--c-gray-3)', color: 'var(--c-paper)', fontFamily: 'var(--f-sans)', fontSize: '14px' }} />
              )
            ) : (
              <div style={{ fontSize: '14px', color: form[key] ? 'var(--c-paper)' : 'var(--c-gray-5)', padding: '10px 0' }}>
                {form[key] || `(${placeholder})`}
              </div>
            )}
          </div>
        ))}

        {/* 지역 선택 */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={11} /> 지역
          </div>
          {editing ? (
            <select value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', background: 'var(--c-gray-2)', border: '1px solid var(--c-gray-3)', color: 'var(--c-paper)', fontFamily: 'var(--f-sans)', fontSize: '14px' }}>
              <option value="">선택하세요</option>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <div style={{ fontSize: '14px', color: form.region ? 'var(--c-paper)' : 'var(--c-gray-5)', padding: '10px 0' }}>
              {form.region || '(미입력)'}
            </div>
          )}
        </div>

        {error && <div style={{ color: 'var(--c-red)', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
        {success && <div style={{ color: 'var(--c-green)', fontSize: '13px', marginBottom: '12px' }}>{success}</div>}

        {editing && (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setEditing(false); setError('') }} className="btn btn-outline btn-sm">취소</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-gold btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={14} /> {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
