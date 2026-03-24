import { createContext, useContext, useState, useEffect } from 'react'
import {
    mockDashboards as initialDashboards,
    mockUsers as initialUsers,
    mockCategories as initialCategories,
    mockGroups as initialGroups,
    portalSettings as initialSettings
} from '../data/mockData'

const DataContext = createContext(null)

/* Helper: lê do localStorage ou retorna fallback */
function loadFromStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key)
        return raw ? JSON.parse(raw) : fallback
    } catch {
        return fallback
    }
}

/* Helper: salva no localStorage */
function saveToStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch {
        // storage cheio ou bloqueado — silencia
    }
}

export function DataProvider({ children }) {
    const [dashboards, setDashboards] = useState([])
    const [users, setUsers] = useState([])
    const [categories, setCategories] = useState([])
    const [groups, setGroups] = useState([])
    const [companies, setCompanies] = useState([])
    const [settings, setSettings] = useState(() => loadFromStorage('portal_settings', initialSettings))
    const [integrations, setIntegrations] = useState(() => loadFromStorage('portal_integrations', {
        entra: { tenantId: '', clientId: '', clientSecret: '', redirectUri: 'http://localhost:5173/auth/callback', connected: false },
        pbi: { tenantId: '', clientId: '', clientSecret: '', workspaceId: '', connected: false }
    }))

    // Fetch inicial de tudo do Banco
    useEffect(() => {
        // Dashboards
        fetch('/api/dashboards').then(r => r.json()).then(data => {
            if (data.success) setDashboards(data.dashboards)
        })

        // Usuários
        fetch('/api/users').then(r => r.json()).then(data => {
            if (data.success) setUsers(data.users)
        })

        // Categorias
        fetch('/api/categories').then(r => r.json()).then(data => {
            if (data.success) setCategories(data.categories)
        })

        // Grupos
        fetch('/api/groups').then(r => r.json()).then(data => {
            if (data.success) setGroups(data.groups)
        })

        // Empresas
        fetch('/api/companies').then(r => r.json()).then(data => {
            if (data.success) setCompanies(data.companies)
        })
    }, [])

    useEffect(() => { saveToStorage('portal_settings', settings) }, [settings])
    useEffect(() => { saveToStorage('portal_integrations', integrations) }, [integrations])

    /* ---- Dashboard CRUD ---- */
    const addDashboard = async (dashboard) => {
        try {
            const res = await fetch('/api/dashboards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dashboard)
            })
            const data = await res.json()
            if (data.success) {
                setDashboards(prev => [...prev, data.dashboard])
                return data.dashboard
            }
        } catch (err) { console.error(err) }
    }

    const updateDashboard = async (id, dashboardData) => {
        try {
            const res = await fetch(`/api/dashboards/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dashboardData)
            })
            const data = await res.json()
            if (data.success) {
                setDashboards(prev => prev.map(d => (d.id === id ? data.dashboard : d)))
            }
        } catch (err) { console.error(err) }
    }

    const deleteDashboard = async (id) => {
        try {
            const res = await fetch(`/api/dashboards/${id}`, { method: 'DELETE' })
            const data = await res.json()
            if (data.success) {
                setDashboards(prev => prev.filter(d => d.id !== id))
            }
        } catch (err) { console.error(err) }
    }

    const getDashboard = (id) => dashboards.find(d => d.id === Number(id))

    /* ---- User CRUD ---- */
    const addUser = async (userData) => {
        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            })
            const data = await res.json()
            if (data.success) {
                setUsers(prev => [data.user, ...prev])
                return data.user
            } else {
                alert(data.error || 'Erro ao criar usuário')
            }
        } catch (err) {
            console.error(err)
            alert('Erro de conexão ao criar usuário')
        }
    }

    const updateUser = async (id, userData) => {
        try {
            const res = await fetch(`/api/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            })
            const data = await res.json()
            if (data.success) {
                setUsers(prev => prev.map(u => (u.id === id ? data.user : u)))
            } else {
                alert(data.error || 'Erro ao atualizar usuário')
            }
        } catch (err) {
            console.error(err)
            alert('Erro de conexão ao atualizar usuário')
        }
    }

    const deleteUser = async (id) => {
        try {
            const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
            const data = await res.json()
            if (data.success) {
                setUsers(prev => prev.filter(u => u.id !== id))
            } else {
                alert(data.error || 'Erro ao deletar usuário')
            }
        } catch (err) {
            console.error(err)
            alert('Erro de conexão ao deletar usuário')
        }
    }

    /* ---- Dashboards visíveis para um usuário ---- */
    const getVisibleDashboards = (currentUser) => {
        if (!currentUser) return []
        if (currentUser.role === 'admin') return dashboards.filter(d => d.active)
        return dashboards.filter(d => {
            if (!d.active) return false
            // Acesso direto pelo campo allowedDashboards do usuário
            if (currentUser.allowedDashboards?.includes(d.id)) return true
            // Visibilidade configurada no dashboard
            if (d.visibility === 'all') return true
            if (d.visibility === 'groups') {
                return d.groups?.some(g => currentUser.groups?.includes(g))
            }
            if (d.visibility === 'users') {
                return d.users?.includes(currentUser.email)
            }
            return false
        })
    }

    /* ---- Company CRUD ---- */
    const addCompany = async (companyData) => {
        try {
            const res = await fetch('/api/companies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(companyData)
            })
            const data = await res.json()
            if (data.success) {
                setCompanies(prev => [...prev, data.company].sort((a, b) => a.name.localeCompare(b.name)))
                return data.company
            } else {
                alert(data.error || 'Erro ao criar empresa')
            }
        } catch (err) {
            console.error(err)
            alert('Erro de conexão ao criar empresa')
        }
    }

    const updateCompany = async (id, companyData) => {
        try {
            const res = await fetch(`/api/companies/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(companyData)
            })
            const data = await res.json()
            if (data.success) {
                setCompanies(prev => prev.map(c => (c.id === id ? data.company : c)).sort((a, b) => a.name.localeCompare(b.name)))
            } else {
                alert(data.error || 'Erro ao atualizar empresa')
            }
        } catch (err) {
            console.error(err)
            alert('Erro de conexão ao atualizar empresa')
        }
    }

    const deleteCompany = async (id) => {
        try {
            const res = await fetch(`/api/companies/${id}`, { method: 'DELETE' })
            const data = await res.json()
            if (data.success) {
                setCompanies(prev => prev.filter(c => c.id !== id))
            } else {
                alert(data.error || 'Erro ao excluir empresa')
            }
        } catch (err) {
            console.error(err)
            alert('Erro de conexão ao excluir empresa')
        }
    }

    /* ---- Settings ---- */
    const updateSettings = (data) => {
        setSettings(prev => ({ ...prev, ...data }))
    }

    /* ---- Integrations ---- */
    const updateIntegrations = (data) => {
        setIntegrations(prev => ({ ...prev, ...data }))
    }

    return (
        <DataContext.Provider
            value={{
                dashboards, addDashboard, updateDashboard, deleteDashboard, getDashboard,
                users, addUser, updateUser, deleteUser,
                companies, addCompany, updateCompany, deleteCompany,
                categories, groups,
                settings, updateSettings,
                integrations, updateIntegrations,
                getVisibleDashboards
            }}
        >
            {children}
        </DataContext.Provider>
    )
}

export function useData() {
    const ctx = useContext(DataContext)
    if (!ctx) throw new Error('useData deve ser usado dentro de DataProvider')
    return ctx
}
