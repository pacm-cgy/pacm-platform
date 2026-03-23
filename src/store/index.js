import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabase } from '../lib/supabase'

// ── AUTH STORE ──────────────────────────────────────────────────
export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      session: null,
      loading: true,

      setSession: (session) => set({ session, user: session?.user ?? null }),
      setProfile: (profile) => set({ profile }),
      setLoading: (loading) => set({ loading }),

      initialize: async () => {
        set({ loading: true })
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          set({ session, user: session.user })
          await get().fetchProfile(session.user.id)
        }
        set({ loading: false })

        supabase.auth.onAuthStateChange(async (event, session) => {
          set({ session, user: session?.user ?? null })
          if (session?.user) {
            await get().fetchProfile(session.user.id)
          } else {
            set({ profile: null })
          }
        })
      },

      fetchProfile: async (userId) => {
        const { data: existing } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()

        // 소셜 로그인 신규 가입 시 프로필 자동 생성
        if (!existing) {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const meta = user.user_metadata || {}
            const email = user.email || ''
            await supabase.from('profiles').upsert({
              id: userId,
              display_name: meta.full_name || meta.name || email.split('@')[0],
              username: (meta.user_name || email.split('@')[0]).replace(/[^a-z0-9_]/gi,'_').toLowerCase(),
              avatar_url: meta.avatar_url || meta.picture || '',
              bio: '',
            })
            const { data: created } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
            if (created) set({ profile: created })
          }
          return
        }

        const data = existing
        if (data) {
          set({ profile: data })
          // 정지된 회원 체크
          if (data.is_suspended) {
            const until = data.suspended_until
              ? new Date(data.suspended_until)
              : null
            // 정지 기간 만료 확인
            if (!until || until > new Date()) {
              const msg = until
                ? `계정이 정지됐습니다.\n사유: ${data.suspend_reason||'운영 정책 위반'}\n해제일: ${until.toLocaleDateString('ko-KR')}`
                : `계정이 영구 정지됐습니다.\n사유: ${data.suspend_reason||'운영 정책 위반'}\n문의: contact@pacm.kr`
              // 즉시 로그아웃
              await supabase.auth.signOut()
              set({ user: null, profile: null, session: null })
              alert(msg)
              return
            } else {
              // 정지 기간 만료 → 자동 해제
              await supabase.from('profiles')
                .update({ is_suspended: false, suspended_until: null })
                .eq('id', userId)
              data.is_suspended = false
            }
          }
        }
      },

      signOut: async () => {
        await supabase.auth.signOut()
        set({ user: null, profile: null, session: null })
      },

      isAdmin: () => get().profile?.role === 'admin',
      isSuspended: () => {
        const p = get().profile
        if (!p?.is_suspended) return false
        if (p.suspended_until && new Date(p.suspended_until) < new Date()) return false
        return true
      },
      isWriter: () => ['admin', 'writer'].includes(get().profile?.role),
      isAuthenticated: () => !!get().user,
    }),
    {
      name: 'pacm_auth_store',
      storage: createJSONStorage(() => sessionStorage), // sessionStorage (탭 닫으면 초기화)
      partialize: (state) => ({ user: state.user, profile: state.profile }),
    }
  )
)

// ── THEME STORE ─────────────────────────────────────────────────
export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'dark', // 'dark' | 'light'
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        set({ theme: next })
        document.documentElement.setAttribute('data-theme', next)
      },
      initTheme: () => {
        const theme = get().theme || 'dark'
        document.documentElement.setAttribute('data-theme', theme)
      },
    }),
    { name: 'insightship_theme', storage: createJSONStorage(() => localStorage) }
  )
)

// ── UI STORE ────────────────────────────────────────────────────
export const useUIStore = create((set) => ({
  searchOpen: false,
  articlePanelOpen: false,
  articlePanelId: null,
  mobileMenuOpen: false,
  currentPage: 'home',

  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
  openArticlePanel: (id) => set({ articlePanelOpen: true, articlePanelId: id }),
  closeArticlePanel: () => set({ articlePanelOpen: false, articlePanelId: null }),
  toggleMobileMenu: () => set(s => ({ mobileMenuOpen: !s.mobileMenuOpen })),
  closeMobileMenu: () => set({ mobileMenuOpen: false }),
  setCurrentPage: (page) => set({ currentPage: page }),
}))
