import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const saved = sessionStorage.getItem('portal_user')
        return saved ? JSON.parse(saved) : null
    })

    const login = async (email, password) => {
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            })

            const data = await response.json()

            if (!response.ok) {
                return { success: false, error: data.error || 'Erro ao fazer login.' }
            }

            const userData = data.user
            setUser(userData)
            sessionStorage.setItem('portal_user', JSON.stringify(userData))
            return { success: true, user: userData }
        } catch (error) {
            console.error('Auth error:', error)
            return { success: false, error: 'Erro de conexão com o servidor.' }
        }
    }

    const logout = () => {
        setUser(null)
        sessionStorage.removeItem('portal_user')
    }

    const isAdmin = user?.role === 'admin'

    return (
        <AuthContext.Provider value={{ user, login, logout, isAdmin }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
    return ctx
}
