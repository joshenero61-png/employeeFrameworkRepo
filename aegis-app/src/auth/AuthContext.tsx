import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Tables } from '../types/database.types'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type Account = Tables<'user_accounts'>

type AuthContextValue = {
  session: Session | null
  account: Account | null
  roles: string[]
  loading: boolean
  authError: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [sessionLoading, setSessionLoading] = useState(isSupabaseConfigured)
  const [authorizationLoading, setAuthorizationLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setSessionLoading(false)
      return
    }

    let mounted = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setSessionLoading(false)
      setAuthError(null)
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) setAuthError(error.message)
      setSession(data.session)
      setSessionLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !session?.user.id) {
      setAccount(null)
      setRoles([])
      setAuthorizationLoading(false)
      return
    }

    let active = true
    setAuthorizationLoading(true)
    setAuthError(null)

    const loadAuthorization = async () => {
      try {
        const { data: accountData, error: accountError } = await supabase
          .from('user_accounts')
          .select('user_id, employee_id, username, display_name, is_active, created_at, updated_at')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (accountError) throw accountError
        if (!active) return

        setAccount(accountData)

        if (!accountData?.is_active) {
          setRoles([])
          return
        }

        const { data: assignments, error: assignmentError } = await supabase
          .from('user_role_assignments')
          .select('role_id')
          .eq('user_id', session.user.id)

        if (assignmentError) throw assignmentError
        if (!active) return

        const roleIds = (assignments ?? []).map((assignment) => assignment.role_id)
        if (roleIds.length === 0) {
          setRoles([])
          return
        }

        const { data: roleRows, error: roleError } = await supabase
          .from('user_roles')
          .select('name')
          .in('id', roleIds)

        if (roleError) throw roleError
        if (active) setRoles((roleRows ?? []).map((role) => role.name))
      } catch (error) {
        if (active) {
          setAccount(null)
          setRoles([])
          setAuthError(error instanceof Error ? error.message : 'Unable to load account permissions.')
        }
      } finally {
        if (active) setAuthorizationLoading(false)
      }
    }

    void loadAuthorization()
    return () => {
      active = false
    }
  }, [session?.user.id])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured. Add the project URL and public key to .env.local.')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const value = useMemo(
    () => ({
      session,
      account,
      roles,
      loading: sessionLoading || authorizationLoading,
      authError,
      signIn,
      signOut,
    }),
    [session, account, roles, sessionLoading, authorizationLoading, authError, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
