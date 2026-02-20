import { createContext, useContext, useState } from 'react'
import { mockUsers as initialUsers } from '../data/mockData'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const saved = sessionStorage.getItem('portal_user')
        return saved ? JSON.parse(saved) : null
    })

    const login = (email, password) => {
        const found = initialUsers.find(
            u => u.email === email && u.password === password && u.status === 'active'
        )
        if (!found) {
            return { success: false, error: 'E-mail ou senha inválidos.' }
        }
        const userData = { ...found }
        delete userData.password
        setUser(userData)
        sessionStorage.setItem('portal_user', JSON.stringify(userData))
        return { success: true, user: userData }
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
