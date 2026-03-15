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
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (data) set({ profile: data })
      },

      signOut: async () => {
        await supabase.auth.signOut()
        set({ user: null, profile: null, session: null })
      },

      isAdmin: () => get().profile?.role === 'admin',
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
