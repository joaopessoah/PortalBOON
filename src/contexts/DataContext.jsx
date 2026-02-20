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
    const [dashboards, setDashboards] = useState(() => loadFromStorage('portal_dashboards', initialDashboards))
    const [users, setUsers] = useState(() => loadFromStorage('portal_users', initialUsers))
    const [categories] = useState(initialCategories)
    const [groups] = useState(initialGroups)
    const [settings, setSettings] = useState(() => loadFromStorage('portal_settings', initialSettings))
    const [integrations, setIntegrations] = useState(() => loadFromStorage('portal_integrations', {
        entra: { tenantId: '', clientId: '', clientSecret: '', redirectUri: 'http://localhost:5173/auth/callback', connected: false },
        pbi: { tenantId: '', clientId: '', clientSecret: '', workspaceId: '', connected: false }
    }))

    /* ---- Persistir automaticamente quando mudam ---- */
    useEffect(() => { saveToStorage('portal_dashboards', dashboards) }, [dashboards])
    useEffect(() => { saveToStorage('portal_users', users) }, [users])
    useEffect(() => { saveToStorage('portal_settings', settings) }, [settings])
    useEffect(() => { saveToStorage('portal_integrations', integrations) }, [integrations])

    /* ---- Dashboard CRUD ---- */
    const addDashboard = (dashboard) => {
        const newDash = {
            ...dashboard,
            id: Date.now(),
            createdAt: new Date().toISOString(),
            lastUpdate: new Date().toISOString()
        }
        setDashboards(prev => [...prev, newDash])
        return newDash
    }

    const updateDashboard = (id, data) => {
        setDashboards(prev =>
            prev.map(d => (d.id === id ? { ...d, ...data, lastUpdate: new Date().toISOString() } : d))
        )
    }

    const deleteDashboard = (id) => {
        setDashboards(prev => prev.filter(d => d.id !== id))
    }

    const getDashboard = (id) => dashboards.find(d => d.id === Number(id))

    /* ---- User CRUD ---- */
    const addUser = (userData) => {
        const newUser = { ...userData, id: Date.now() }
        setUsers(prev => [...prev, newUser])
        return newUser
    }

    const updateUser = (id, data) => {
        setUsers(prev => prev.map(u => (u.id === id ? { ...u, ...data } : u)))
    }

    const deleteUser = (id) => {
        setUsers(prev => prev.filter(u => u.id !== id))
    }

    /* ---- Dashboards visíveis para um usuário ---- */
    const getVisibleDashboards = (currentUser) => {
        if (!currentUser) return []
        if (currentUser.role === 'admin') return dashboards.filter(d => d.active)
        return dashboards.filter(d => {
            if (!d.active) return false
            if (d.visibility === 'all') return true
            if (d.visibility === 'groups') {
                return d.groups.some(g => currentUser.groups?.includes(g))
            }
            if (d.visibility === 'users') {
                return d.users?.includes(currentUser.email)
            }
            return false
        })
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
