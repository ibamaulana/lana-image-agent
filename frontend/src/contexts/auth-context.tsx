"use client"

import { 
  createContext, 
  useCallback, 
  useContext, 
  useEffect, 
  useMemo, 
  useState, 
  type ReactNode 
} from "react"
import {
  AUTH_STORAGE_KEY,
  fetchAuthenticatedUser,
  loginUser as loginUserRequest,
  registerUser as registerUserRequest,
  setAuthData,
  clearAuthData,
} from "@/lib/backend-service"

type PaymentWallet = {
  address: string
  privateKey: string
} | null

export interface AuthUser {
  id: string
  username?: string | null
  display_name?: string | null
  wallet_address: string
  email?: string | null
  profile_picture?: string | null
  bio?: string | null
  ai_niche?: string | null
  [key: string]: any
}

interface StoredAuthState {
  token: string | null
  user: AuthUser | null
  paymentWallet: PaymentWallet
  usdcBalance: number | null
}

interface AuthContextValue extends StoredAuthState {
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredAuthState>({
    token: null,
    user: null,
    paymentWallet: null,
    usdcBalance: null,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)

  // Load auth state from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as StoredAuthState
        setState({
          token: parsed.token || null,
          user: parsed.user || null,
          paymentWallet: parsed.paymentWallet || null,
          usdcBalance: parsed.usdcBalance ?? null,
        })
      }
    } catch (error) {
      console.error("Failed to parse stored auth state:", error)
      clearAuthData()
    } finally {
      setIsInitialized(true)
    }
  }, [])

  // Refresh user data if token exists
  useEffect(() => {
    if (!isInitialized) return
    
    const fetchProfile = async () => {
      if (!state.token) {
        setIsLoading(false)
        return
      }

      try {
        const result = await fetchAuthenticatedUser()
        if (result?.success && result.data) {
          const nextState: StoredAuthState = {
            token: state.token,
            user: result.data.user,
            paymentWallet: state.paymentWallet,
            usdcBalance: result.data.usdcBalance ?? state.usdcBalance ?? 0,
          }
          setState(nextState)
          setAuthData(nextState as any)
        }
      } catch (error) {
        console.error("Failed to refresh authenticated user:", error)
        setState({
          token: null,
          user: null,
          paymentWallet: null,
          usdcBalance: null,
        })
        clearAuthData()
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfile()
  }, [isInitialized])

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true)
    try {
      const result = await loginUserRequest(username, password)
      if (!result?.success) {
        throw new Error(result?.message || "Login failed")
      }

      const { token, user, paymentWallet, usdcBalance } = result.data
      const nextState: StoredAuthState = {
        token,
        user,
        paymentWallet: paymentWallet || null,
        usdcBalance: usdcBalance ?? 0,
      }
      setState(nextState)
      setAuthData(nextState as any)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const register = useCallback(async (username: string, password: string) => {
    setIsLoading(true)
    try {
      const result = await registerUserRequest(username, password)
      if (!result?.success) {
        throw new Error(result?.message || "Registration failed")
      }

      const { token, user, paymentWallet, usdcBalance } = result.data
      const nextState: StoredAuthState = {
        token,
        user,
        paymentWallet: paymentWallet || null,
        usdcBalance: usdcBalance ?? 0,
      }
      setState(nextState)
      setAuthData(nextState as any)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    setState({
      token: null,
      user: null,
      paymentWallet: null,
      usdcBalance: null,
    })
    clearAuthData()
  }, [])

  const refreshUser = useCallback(async () => {
    if (!state.token) return
    try {
      setIsLoading(true)
      const result = await fetchAuthenticatedUser()
      if (result?.success && result.data) {
        const nextState: StoredAuthState = {
          token: state.token,
          user: result.data.user,
          paymentWallet: state.paymentWallet,
          usdcBalance: result.data.usdcBalance ?? state.usdcBalance ?? 0,
        }
        setState(nextState)
        setAuthData(nextState as any)
      }
    } finally {
      setIsLoading(false)
    }
  }, [state.paymentWallet, state.token, state.usdcBalance])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
    }),
    [isLoading, login, logout, refreshUser, register, state]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

