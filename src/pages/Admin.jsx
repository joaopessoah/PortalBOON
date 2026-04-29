import { useState, useEffect, useRef } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import Header from '../components/Header'
import {
    LayoutDashboard, Users, Settings, Plus, Edit2, Trash2, Eye,
    X, Save, Search, ToggleLeft, ToggleRight, Upload, Globe, Key,
    Lock, Mail, RefreshCw, Building2, Clock, Play, CheckCircle, AlertCircle, Loader,
    HeartPulse
} from 'lucide-react'

/* ======================== ADMIN PAGE ======================== */
export default function Admin() {
    const [activeTab, setActiveTab] = useState('dashboards')

    const tabs = [
        { id: 'jobs', label: 'Agendamentos', icon: Clock },
        { id: 'settings', label: 'Configurações', icon: Settings },
        { id: 'dashboards', label: 'Dashboards', icon: LayoutDashboard },
        { id: 'companies', label: 'Empresas', icon: Building2 },
        { id: 'feriados', label: 'Feriados', icon: Clock },
        { id: 'sla-amar-cuidar', label: 'SLA Amar & Cuidar', icon: HeartPulse },
        { id: 'users', label: 'Usuários', icon: Users }
    ]

    return (
        <div>
            <Header />
            <div className="admin-page">
                <aside className="admin-sidebar">
                    <p className="admin-sidebar-title">Administração</p>
                    <nav className="admin-sidebar-nav">
                        {tabs.map(tab => {
                            const Icon = tab.icon
                            return (
                                <button
                                    key={tab.id}
                                    className={`admin-sidebar-link ${activeTab === tab.id ? 'active' : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    <Icon size={18} />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </nav>
                </aside>

                <main className="admin-content">
                    {activeTab === 'dashboards' && <AdminDashboards />}
                    {activeTab === 'users' && <AdminUsers />}
                    {activeTab === 'companies' && <AdminCompanies />}
                    {activeTab === 'jobs' && <AdminJobs />}
                    {activeTab === 'settings' && <AdminSettings />}
                    {activeTab === 'sla-amar-cuidar' && <AdminSlaAmarCuidar />}
                    {activeTab === 'feriados' && <AdminFeriados />}
                </main>
            </div>
        </div>
    )
}

/* ======================== DASHBOARDS TAB ======================== */
function AdminDashboards() {
    const { dashboards, addDashboard, updateDashboard, deleteDashboard, categories, groups, users } = useData()
    const [showModal, setShowModal] = useState(false)
    const [editing, setEditing] = useState(null)
    const [search, setSearch] = useState('')

    const emptyForm = {
        name: '', description: '', category: categories[0]?.name || '',
        url: '', workspaceId: '', reportId: '', groupId: '',
        order: dashboards.length + 1, active: true,
        visibility: 'all', groups: [], users: [], pinned: false,
        rlsRoles: [], type: 'powerbi'
    }

    const [form, setForm] = useState(emptyForm)

    const openCreate = () => {
        setEditing(null)
        setForm({ ...emptyForm, order: dashboards.length + 1 })
        setShowModal(true)
    }

    const openEdit = (dash) => {
        setEditing(dash.id)
        // Carregar mapeamento RLS dos usuários para este dashboard
        const rlsMap = {}
        users.forEach(u => {
            if (u.rlsMapping && u.rlsMapping[dash.id]) {
                rlsMap[u.email] = u.rlsMapping[dash.id]
            }
        })
        setForm({ ...dash, userRlsMapping: rlsMap })
        setShowModal(true)
    }

    const handleSave = async () => {
        if (!form.name.trim() || !form.url.trim()) return
        // Converter rlsRolesText para array
        const saveData = { ...form }
        if (saveData.rlsRolesText !== undefined) {
            saveData.rlsRoles = saveData.rlsRolesText
                .split(',')
                .map(r => r.trim())
                .filter(r => r.length > 0)
            delete saveData.rlsRolesText
        }
        // Extrair mapeamento RLS dos usuários antes de salvar o dashboard
        const userRlsMapping = saveData.userRlsMapping || {}
        delete saveData.userRlsMapping

        if (editing) {
            await updateDashboard(editing, saveData)
            // Atualizar rlsMapping de cada usuário que tem acesso
            const dashId = String(editing)
            for (const u of users) {
                const currentMapping = u.rlsMapping || {}
                const newRole = userRlsMapping[u.email]
                const hadRole = currentMapping[dashId]
                if (newRole && newRole !== hadRole) {
                    await updateUser(u.id, { ...u, rlsMapping: { ...currentMapping, [dashId]: newRole } })
                } else if (!newRole && hadRole) {
                    const updated = { ...currentMapping }
                    delete updated[dashId]
                    await updateUser(u.id, { ...u, rlsMapping: updated })
                }
            }
        } else {
            const created = await addDashboard(saveData)
            // Atualizar rlsMapping dos usuários para o novo dashboard
            if (created && Object.keys(userRlsMapping).length > 0) {
                const dashId = String(created.id)
                for (const u of users) {
                    const newRole = userRlsMapping[u.email]
                    if (newRole) {
                        const currentMapping = u.rlsMapping || {}
                        await updateUser(u.id, { ...u, rlsMapping: { ...currentMapping, [dashId]: newRole } })
                    }
                }
            }
        }
        setShowModal(false)
    }

    const handleDelete = (id) => {
        if (window.confirm('Tem certeza que deseja excluir este dashboard?')) {
            deleteDashboard(id)
        }
    }

    const filteredDashboards = dashboards.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

    return (
        <>
            <div className="admin-content-header">
                <h1>📊 Dashboards</h1>
                <button className="btn btn-primary" onClick={openCreate}>
                    <Plus size={16} /> Novo Dashboard
                </button>
            </div>

            <div style={{ marginBottom: 'var(--space-6)' }}>
                <div className="search-input-wrapper" style={{ maxWidth: 400 }}>
                    <Search size={18} />
                    <input
                        className="search-input"
                        placeholder="Buscar dashboard..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="table-container">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Categoria</th>
                            <th>Visibilidade</th>
                            <th>Status</th>
                            <th>Ordem</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredDashboards.map(dash => (
                            <tr key={dash.id}>
                                <td>
                                    <strong>{dash.name}</strong>
                                    <br />
                                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)' }}>
                                        {dash.description.substring(0, 60)}...
                                    </span>
                                </td>
                                <td>
                                    <span className="badge badge-primary">{dash.category}</span>
                                </td>
                                <td style={{ textTransform: 'capitalize', fontSize: 'var(--font-size-sm)' }}>
                                    {dash.visibility === 'all' ? 'Todos' : dash.visibility === 'groups' ? 'Grupos' : 'Usuários'}
                                </td>
                                <td>
                                    <span className={`badge ${dash.active ? 'badge-success' : 'badge-error'}`}>
                                        {dash.active ? 'Ativo' : 'Inativo'}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>{dash.order}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(dash)} title="Editar">
                                            <Edit2 size={14} />
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => window.open(`/dashboards/${dash.id}`, '_blank')} title="Visualizar">
                                            <Eye size={14} />
                                        </button>
                                        {!dash.systemProtected && (
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(dash.id)} title="Excluir" style={{ color: 'var(--color-error)' }}>
                                            <Trash2 size={14} />
                                        </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editing ? 'Editar Dashboard' : 'Novo Dashboard'}</h2>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="modal-row">
                                <div className="form-group">
                                    <label className="form-label">Nome *</label>
                                    <input
                                        className="form-input"
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        placeholder="Nome do dashboard"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Categoria</label>
                                    <select
                                        className="form-select"
                                        value={form.category}
                                        onChange={e => setForm({ ...form, category: e.target.value })}
                                    >
                                        {categories.map(c => (
                                            <option key={c.id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Descrição</label>
                                <textarea
                                    className="form-textarea"
                                    value={form.description}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="Descreva o dashboard"
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Tipo de Publicação *</label>
                                <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--font-size-sm)', padding: '8px 16px', borderRadius: 8, border: form.type === 'powerbi' ? '2px solid var(--color-primary)' : '2px solid var(--color-gray-200)', background: form.type === 'powerbi' ? 'var(--color-primary-50, #f3f0ff)' : 'transparent' }}>
                                        <input type="radio" name="dashType" value="powerbi" checked={form.type === 'powerbi'} onChange={() => setForm({ ...form, type: 'powerbi' })} />
                                        Power BI (Embeddado)
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--font-size-sm)', padding: '8px 16px', borderRadius: 8, border: form.type === 'external' ? '2px solid var(--color-primary)' : '2px solid var(--color-gray-200)', background: form.type === 'external' ? 'var(--color-primary-50, #f3f0ff)' : 'transparent' }}>
                                        <input type="radio" name="dashType" value="external" checked={form.type === 'external'} onChange={() => setForm({ ...form, type: 'external' })} />
                                        Link Externo (URL)
                                    </label>
                                </div>
                            </div>

                            {form.type === 'powerbi' ? (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Power BI URL *</label>
                                        <input
                                            className="form-input"
                                            value={form.url}
                                            onChange={e => {
                                                const newUrl = e.target.value
                                                const updates = { url: newUrl }
                                                try {
                                                    const u = new URL(newUrl)
                                                    const groupMatch = u.pathname.match(/\/groups\/([^/]+)/)
                                                    const reportMatch = u.pathname.match(/\/reports\/([^/]+)/)
                                                    if (groupMatch) updates.workspaceId = groupMatch[1]
                                                    if (reportMatch) updates.reportId = reportMatch[1]
                                                } catch { /* URL incompleta */ }
                                                setForm({ ...form, ...updates })
                                            }}
                                            placeholder="https://app.powerbi.com/groups/.../reports/..."
                                        />
                                    </div>

                                    <div className="modal-row">
                                        <div className="form-group">
                                            <label className="form-label">Workspace ID</label>
                                            <input
                                                className="form-input"
                                                value={form.workspaceId}
                                                onChange={e => setForm({ ...form, workspaceId: e.target.value })}
                                                placeholder="Opcional"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Report ID</label>
                                            <input
                                                className="form-input"
                                                value={form.reportId}
                                                onChange={e => setForm({ ...form, reportId: e.target.value })}
                                                placeholder="Opcional"
                                            />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Roles RLS (segurança)</label>
                                        <input
                                            className="form-input"
                                            value={form.rlsRolesText !== undefined ? form.rlsRolesText : (form.rlsRoles || []).join(', ')}
                                            onChange={e => {
                                                setForm({ ...form, rlsRolesText: e.target.value })
                                            }}
                                            placeholder="Ex: Grupo Financeiro, Grupo RH (separar por vírgula)"
                                        />
                                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)', marginTop: 4, display: 'block' }}>
                                            Informe os nomes dos roles de segurança (RLS) do Power BI. Deixe vazio se não usar RLS.
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <div className="form-group">
                                    <label className="form-label">URL do Site Externo *</label>
                                    <input
                                        className="form-input"
                                        value={form.url}
                                        onChange={e => setForm({ ...form, url: e.target.value })}
                                        placeholder="https://exemplo.com.br"
                                    />
                                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)', marginTop: 4, display: 'block' }}>
                                        O usuário será redirecionado para esta URL em uma nova aba ao clicar no card.
                                    </span>
                                </div>
                            )}

                            <div className="modal-row">
                                <div className="form-group">
                                    <label className="form-label">Ordem</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        value={form.order}
                                        onChange={e => setForm({ ...form, order: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Visibilidade</label>
                                    <select
                                        className="form-select"
                                        value={form.visibility}
                                        onChange={e => setForm({ ...form, visibility: e.target.value })}
                                    >
                                        <option value="all">Todos</option>
                                        <option value="groups">Somente grupos</option>
                                        <option value="users">Somente usuários</option>
                                    </select>
                                </div>
                            </div>

                            {form.visibility === 'groups' && (
                                <div className="form-group">
                                    <label className="form-label">Grupos</label>
                                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                        {groups.map(g => (
                                            <label key={g} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={form.groups?.includes(g)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setForm({ ...form, groups: [...(form.groups || []), g] })
                                                        } else {
                                                            setForm({ ...form, groups: form.groups.filter(x => x !== g) })
                                                        }
                                                    }}
                                                />
                                                {g}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {form.visibility === 'users' && (
                                <div className="form-group">
                                    <label className="form-label">Usuários com acesso</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                        {users.map(u => {
                                            const isChecked = form.users?.includes(u.email)
                                            const currentRlsRoles = form.rlsRolesText !== undefined
                                                ? form.rlsRolesText.split(',').map(r => r.trim()).filter(r => r.length > 0)
                                                : (form.rlsRoles || [])
                                            const hasRls = currentRlsRoles.length > 0
                                            return (
                                                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', flex: 1 }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setForm({ ...form, users: [...(form.users || []), u.email] })
                                                                } else {
                                                                    const newMapping = { ...(form.userRlsMapping || {}) }
                                                                    delete newMapping[u.email]
                                                                    setForm({ ...form, users: form.users.filter(x => x !== u.email), userRlsMapping: newMapping })
                                                                }
                                                            }}
                                                        />
                                                        <span>{u.name}</span>
                                                        <span style={{ color: 'var(--color-gray-400)' }}>({u.email})</span>
                                                    </label>
                                                    {isChecked && hasRls && (
                                                        <select
                                                            className="form-select"
                                                            style={{ width: 'auto', minWidth: 160, fontSize: 'var(--font-size-xs)' }}
                                                            value={(form.userRlsMapping || {})[u.email] || ''}
                                                            onChange={(e) => {
                                                                setForm({
                                                                    ...form,
                                                                    userRlsMapping: { ...(form.userRlsMapping || {}), [u.email]: e.target.value }
                                                                })
                                                            }}
                                                        >
                                                            <option value="">Sem RLS</option>
                                                            {currentRlsRoles.map(role => (
                                                                <option key={role} value={role}>{role}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}>
                                    <div
                                        className={`toggle ${form.active ? 'active' : ''}`}
                                        onClick={() => setForm({ ...form, active: !form.active })}
                                    />
                                    Ativo
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}>
                                    <div
                                        className={`toggle ${form.pinned ? 'active' : ''}`}
                                        onClick={() => setForm({ ...form, pinned: !form.pinned })}
                                    />
                                    Fixado
                                </label>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave}>
                                <Save size={16} /> Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

/* ======================== USERS TAB ======================== */
function AdminUsers() {
    const { users, addUser, updateUser, deleteUser, groups, dashboards, companies } = useData()
    const [showModal, setShowModal] = useState(false)
    const [editing, setEditing] = useState(null)

    // Dashboards que têm RLS configurado
    const rlsDashboards = dashboards.filter(d => d.rlsRoles && d.rlsRoles.length > 0)

    const [estipulantesDisponiveis, setEstipulantesDisponiveis] = useState([])

    useEffect(() => {
        fetch('/api/sla-dashboard/estipulantes').then(r=>r.json()).then(setEstipulantesDisponiveis).catch(()=>{})
    }, [])

    const emptyForm = {
        name: '', email: '', password: '123', role: 'user',
        status: 'active', groups: [], rlsMapping: {}, companyId: null, estipulantesPermitidas: []
    }

    const [form, setForm] = useState(emptyForm)
    const [newPassword, setNewPassword] = useState('')
    const [passwordMsg, setPasswordMsg] = useState({ text: '', type: '' })
    const [sendingEmail, setSendingEmail] = useState(false)
    const [estSearch, setEstSearch] = useState('')

    const handleResetPassword = async () => {
        if (!newPassword.trim() || newPassword.length < 4) {
            setPasswordMsg({ text: 'A senha deve ter pelo menos 4 caracteres.', type: 'error' })
            return
        }
        try {
            const res = await fetch(`/api/users/${editing}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: newPassword })
            })
            const data = await res.json()
            if (data.success) {
                setPasswordMsg({ text: 'Senha redefinida com sucesso!', type: 'success' })
                setNewPassword('')
            } else {
                setPasswordMsg({ text: data.error || 'Erro ao redefinir senha.', type: 'error' })
            }
        } catch {
            setPasswordMsg({ text: 'Erro de conexão com o servidor.', type: 'error' })
        }
    }

    const handleSendPasswordEmail = async () => {
        setSendingEmail(true)
        setPasswordMsg({ text: '', type: '' })
        try {
            const res = await fetch(`/api/users/${editing}/send-password-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })
            const data = await res.json()
            if (data.success) {
                setPasswordMsg({ text: `Senha temporária enviada para ${form.email}`, type: 'success' })
            } else {
                setPasswordMsg({ text: data.error || 'Erro ao enviar e-mail.', type: 'error' })
            }
        } catch {
            setPasswordMsg({ text: 'Erro de conexão com o servidor.', type: 'error' })
        } finally {
            setSendingEmail(false)
        }
    }

    const openCreate = () => {
        setEditing(null)
        setForm(emptyForm)
        setNewPassword('')
        setPasswordMsg({ text: '', type: '' })
        setShowModal(true)
    }

    const openEdit = (user) => {
        setEditing(user.id)
        let ep = user.estipulantesPermitidas || []
        if (typeof ep === 'string') try { ep = JSON.parse(ep) } catch(e) { ep = [] }
        setForm({ ...user, estipulantesPermitidas: ep })
        setNewPassword('')
        setPasswordMsg({ text: '', type: '' })
        setShowModal(true)
    }

    const handleSave = () => {
        if (!form.name.trim() || !form.email.trim()) return
        if (editing) {
            updateUser(editing, form)
        } else {
            addUser(form)
        }
        setShowModal(false)
    }

    const handleDelete = (id) => {
        if (window.confirm('Tem certeza que deseja excluir este usuário?')) {
            deleteUser(id)
        }
    }

    return (
        <>
            <div className="admin-content-header">
                <h1>👥 Usuários</h1>
                <button className="btn btn-primary" onClick={openCreate}>
                    <Plus size={16} /> Novo Usuário
                </button>
            </div>

            <div className="table-container">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>E-mail</th>
                            <th>Empresa</th>
                            <th>Perfil</th>
                            <th>Grupos</th>
                            <th>Estipulantes</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id}>
                                <td><strong>{user.name}</strong></td>
                                <td style={{ fontSize: 'var(--font-size-sm)' }}>{user.email}</td>
                                <td style={{ fontSize: 'var(--font-size-sm)' }}>
                                    {companies.find(c => c.id === user.companyId)?.name || '—'}
                                </td>
                                <td>
                                    <span className={`badge ${user.role === 'admin' ? 'badge-warning' : 'badge-info'}`}>
                                        {user.role === 'admin' ? 'Admin' : 'Usuário'}
                                    </span>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
                                        {user.groups?.map(g => (
                                            <span key={g} className="badge badge-primary" style={{ fontSize: '10px' }}>{g}</span>
                                        ))}
                                    </div>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
                                        {(() => {
                                            let ep = user.estipulantesPermitidas || []
                                            if (typeof ep === 'string') try { ep = JSON.parse(ep) } catch(e) { ep = [] }
                                            if (!Array.isArray(ep) || ep.length === 0) return <span className="badge badge-success" style={{ fontSize: '10px' }}>Todas</span>
                                            return ep.map(e => <span key={e} className="badge" style={{ fontSize: '9px', background: '#6B2A8C15', color: '#6B2A8C' }}>{e.length > 20 ? e.slice(0,20)+'...' : e}</span>)
                                        })()}
                                    </div>
                                </td>
                                <td>
                                    <span className={`badge ${user.status === 'active' ? 'badge-success' : 'badge-error'}`}>
                                        {user.status === 'active' ? 'Ativo' : 'Inativo'}
                                    </span>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(user)} title="Editar">
                                            <Edit2 size={14} />
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(user.id)} title="Excluir" style={{ color: 'var(--color-error)' }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editing ? 'Editar Usuário' : 'Novo Usuário'}</h2>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="modal-row">
                                <div className="form-group">
                                    <label className="form-label">Nome *</label>
                                    <input
                                        className="form-input"
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        placeholder="Nome completo"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">E-mail *</label>
                                    <input
                                        className="form-input"
                                        type="email"
                                        value={form.email}
                                        onChange={e => setForm({ ...form, email: e.target.value })}
                                        placeholder="email@empresa.com"
                                    />
                                </div>
                            </div>

                            <div className="modal-row">
                                <div className="form-group">
                                    <label className="form-label">Perfil</label>
                                    <select
                                        className="form-select"
                                        value={form.role}
                                        onChange={e => setForm({ ...form, role: e.target.value })}
                                    >
                                        <option value="user">Usuário</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Status</label>
                                    <select
                                        className="form-select"
                                        value={form.status}
                                        onChange={e => setForm({ ...form, status: e.target.value })}
                                    >
                                        <option value="active">Ativo</option>
                                        <option value="inactive">Inativo</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Empresa</label>
                                <select
                                    className="form-select"
                                    value={form.companyId || ''}
                                    onChange={e => setForm({ ...form, companyId: e.target.value ? Number(e.target.value) : null })}
                                >
                                    <option value="">Sem empresa</option>
                                    {companies.filter(c => c.active).map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Estipulantes Permitidas (Amar&Cuidar)</label>
                                <input
                                    className="form-input"
                                    placeholder="Buscar estipulante..."
                                    value={estSearch}
                                    onChange={e => setEstSearch(e.target.value)}
                                    style={{ marginBottom: 6, fontSize: 'var(--font-size-xs)' }}
                                />
                                <div style={{ border: '1px solid var(--color-gray-200)', borderRadius: 8, padding: 8, maxHeight: 180, overflow: 'auto', background: 'var(--color-gray-50)' }}>
                                    {!estSearch && (
                                        <>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-sm)', padding: '4px 0', fontWeight: 600, color: 'var(--color-primary)' }}>
                                            <input type="checkbox"
                                                checked={!form.estipulantesPermitidas || form.estipulantesPermitidas.length === 0}
                                                onChange={e => { if (e.target.checked) setForm({ ...form, estipulantesPermitidas: [] }) }}
                                            /> Todas as estipulantes
                                        </label>
                                        <div style={{ borderTop: '1px solid var(--color-gray-200)', margin: '4px 0' }} />
                                        </>
                                    )}
                                    {estipulantesDisponiveis
                                        .filter(est => !estSearch || est.toLowerCase().includes(estSearch.toLowerCase()))
                                        .map(est => (
                                        <label key={est} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', padding: '3px 0', cursor: 'pointer' }}>
                                            <input type="checkbox"
                                                checked={(form.estipulantesPermitidas || []).includes(est)}
                                                onChange={e => {
                                                    const current = form.estipulantesPermitidas || []
                                                    const updated = e.target.checked ? [...current, est] : current.filter(x => x !== est)
                                                    setForm({ ...form, estipulantesPermitidas: updated })
                                                }}
                                            /> {est}
                                        </label>
                                    ))}
                                </div>
                                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)' }}>
                                    Vazio = acesso a todas. Selecione para restringir.
                                </span>
                            </div>

                            {!editing && (
                                <div className="form-group">
                                    <label className="form-label">Senha</label>
                                    <input
                                        className="form-input"
                                        type="password"
                                        value={form.password}
                                        onChange={e => setForm({ ...form, password: e.target.value })}
                                        placeholder="Senha inicial"
                                    />
                                </div>
                            )}

                            {editing && (
                                <div className="form-group" style={{
                                    background: 'var(--color-gray-50)',
                                    border: '1px solid var(--color-gray-200)',
                                    borderRadius: 'var(--radius-lg)',
                                    padding: 'var(--space-4)'
                                }}>
                                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                        <Lock size={14} />
                                        Redefinir Senha
                                    </label>

                                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                                        <input
                                            className="form-input"
                                            type="text"
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            placeholder="Nova senha"
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm"
                                            onClick={handleResetPassword}
                                            style={{ whiteSpace: 'nowrap' }}
                                        >
                                            <Key size={14} /> Redefinir
                                        </button>
                                    </div>

                                    <div style={{ borderTop: '1px solid var(--color-gray-200)', paddingTop: 'var(--space-3)' }}>
                                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)', display: 'block', marginBottom: 'var(--space-2)' }}>
                                            Ou envie uma senha temporária por e-mail:
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={handleSendPasswordEmail}
                                            disabled={sendingEmail}
                                            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                                        >
                                            {sendingEmail ? <RefreshCw size={14} className="spin" /> : <Mail size={14} />}
                                            {sendingEmail ? 'Enviando...' : `Enviar senha para ${form.email}`}
                                        </button>
                                    </div>

                                    {passwordMsg.text && (
                                        <div style={{
                                            marginTop: 'var(--space-2)',
                                            padding: 'var(--space-2) var(--space-3)',
                                            borderRadius: 'var(--radius-md)',
                                            fontSize: 'var(--font-size-sm)',
                                            background: passwordMsg.type === 'success' ? 'var(--color-success-light, #d4edda)' : 'var(--color-error-light, #f8d7da)',
                                            color: passwordMsg.type === 'success' ? 'var(--color-success, #155724)' : 'var(--color-error, #721c24)'
                                        }}>
                                            {passwordMsg.text}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Grupos</label>
                                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                                    {groups.map(g => (
                                        <label key={g} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={form.groups?.includes(g)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setForm({ ...form, groups: [...(form.groups || []), g] })
                                                    } else {
                                                        setForm({ ...form, groups: form.groups.filter(x => x !== g) })
                                                    }
                                                }}
                                            />
                                            {g}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Dashboards com acesso direto */}
                            {dashboards.length > 0 && (
                                <div className="form-group">
                                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                        <LayoutDashboard size={14} />
                                        Dashboards com acesso direto
                                    </label>
                                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)', marginBottom: 8, display: 'block' }}>
                                        Além dos dashboards herdados pelos grupos, você pode liberar acesso individual a dashboards específicos.
                                    </span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                        {dashboards.filter(d => d.active).map(d => {
                                            const inheritedByGroup = d.visibility === 'groups' && d.groups?.some(g => form.groups?.includes(g))
                                            const isAll = d.visibility === 'all'
                                            const directAccess = form.allowedDashboards?.includes(d.id)
                                            return (
                                                <label key={d.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                                                    padding: 'var(--space-2) var(--space-3)',
                                                    background: (isAll || inheritedByGroup) ? 'var(--color-gray-50)' : 'transparent',
                                                    borderRadius: 'var(--radius-md)',
                                                    fontSize: 'var(--font-size-sm)',
                                                    cursor: (isAll || inheritedByGroup) ? 'default' : 'pointer',
                                                    opacity: (isAll || inheritedByGroup) ? 0.7 : 1
                                                }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isAll || inheritedByGroup || directAccess}
                                                        disabled={isAll || inheritedByGroup}
                                                        onChange={(e) => {
                                                            const current = form.allowedDashboards || []
                                                            if (e.target.checked) {
                                                                setForm({ ...form, allowedDashboards: [...current, d.id] })
                                                            } else {
                                                                setForm({ ...form, allowedDashboards: current.filter(x => x !== d.id) })
                                                            }
                                                        }}
                                                    />
                                                    <span style={{ fontWeight: 500 }}>{d.name}</span>
                                                    {isAll && <span className="badge badge-success" style={{ fontSize: '10px' }}>Todos</span>}
                                                    {inheritedByGroup && !isAll && <span className="badge badge-info" style={{ fontSize: '10px' }}>Via grupo</span>}
                                                    {directAccess && !isAll && !inheritedByGroup && <span className="badge badge-primary" style={{ fontSize: '10px' }}>Acesso direto</span>}
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Mapeamento RLS por Dashboard */}
                            {(() => {
                                const userRlsDashboards = rlsDashboards.filter(d => {
                                    if (d.visibility === 'all') return true
                                    if (d.visibility === 'groups' && d.groups?.some(g => form.groups?.includes(g))) return true
                                    if (d.visibility === 'users' && d.users?.includes(form.email)) return true
                                    if (form.allowedDashboards?.includes(d.id)) return true
                                    return false
                                })
                                return userRlsDashboards.length > 0 && (
                                <div className="form-group">
                                    <label className="form-label">Roles RLS por Dashboard</label>
                                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)', marginBottom: 8, display: 'block' }}>
                                        Atribua uma role de segurança (RLS) para cada dashboard que este usuário terá acesso.
                                    </span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                        {userRlsDashboards.map(d => (
                                            <div key={d.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                                                padding: 'var(--space-3) var(--space-4)',
                                                background: 'var(--color-gray-50)', borderRadius: 'var(--radius-lg)',
                                                border: '1px solid var(--color-gray-200)'
                                            }}>
                                                <span style={{ flex: 1, fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-gray-700)' }}>
                                                    {d.name}
                                                </span>
                                                <select
                                                    className="form-select"
                                                    style={{ width: 'auto', minWidth: 160, fontSize: 'var(--font-size-sm)' }}
                                                    value={(form.rlsMapping || {})[d.id] || ''}
                                                    onChange={e => {
                                                        const mapping = { ...(form.rlsMapping || {}) }
                                                        if (e.target.value) {
                                                            mapping[d.id] = e.target.value
                                                        } else {
                                                            delete mapping[d.id]
                                                        }
                                                        setForm({ ...form, rlsMapping: mapping })
                                                    }}
                                                >
                                                    <option value="">Sem RLS</option>
                                                    {d.rlsRoles.map(role => (
                                                        <option key={role} value={role}>{role}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                )
                            })()}
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave}>
                                <Save size={16} /> Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

/* ======================== COMPANIES TAB ======================== */
function AdminCompanies() {
    const { companies, addCompany, updateCompany, deleteCompany } = useData()
    const [showModal, setShowModal] = useState(false)
    const [editing, setEditing] = useState(null)
    const [form, setForm] = useState({ name: '', active: true })

    const openCreate = () => {
        setEditing(null)
        setForm({ name: '', active: true })
        setShowModal(true)
    }

    const openEdit = (company) => {
        setEditing(company.id)
        setForm({ name: company.name, active: company.active })
        setShowModal(true)
    }

    const handleSave = () => {
        if (!form.name.trim()) return
        if (editing) {
            updateCompany(editing, form)
        } else {
            addCompany(form)
        }
        setShowModal(false)
    }

    const handleDelete = (id) => {
        if (window.confirm('Tem certeza que deseja excluir esta empresa? Os usuários vinculados ficarão sem empresa.')) {
            deleteCompany(id)
        }
    }

    return (
        <>
            <div className="admin-content-header">
                <h1>🏢 Empresas</h1>
                <button className="btn btn-primary" onClick={openCreate}>
                    <Plus size={16} /> Nova Empresa
                </button>
            </div>

            <div className="table-container">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {companies.map(company => (
                            <tr key={company.id}>
                                <td><strong>{company.name}</strong></td>
                                <td>
                                    <span className={`badge ${company.active ? 'badge-success' : 'badge-error'}`}>
                                        {company.active ? 'Ativa' : 'Inativa'}
                                    </span>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(company)} title="Editar">
                                            <Edit2 size={14} />
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(company.id)} title="Excluir" style={{ color: 'var(--color-error)' }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {companies.length === 0 && (
                            <tr>
                                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-gray-400)', padding: 'var(--space-8)' }}>
                                    Nenhuma empresa cadastrada.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <div className="modal-header">
                            <h2>{editing ? 'Editar Empresa' : 'Nova Empresa'}</h2>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Nome da Empresa *</label>
                                <input
                                    className="form-input"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="Nome da empresa"
                                />
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}>
                                <div
                                    className={`toggle ${form.active ? 'active' : ''}`}
                                    onClick={() => setForm({ ...form, active: !form.active })}
                                />
                                Ativa
                            </label>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave}>
                                <Save size={16} /> Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

/* ======================== JOBS TAB ======================== */
function AdminJobs() {
    const [jobs, setJobs] = useState({})
    const [outputs, setOutputs] = useState({})
    const [activeOutput, setActiveOutput] = useState(null)
    const [schedules, setSchedules] = useState({})
    const [loading, setLoading] = useState(true)

    const SECTIONS = [
        {
            id: 'moderna',
            title: 'Atendimentos Moderna',
            color: '#ec4899',
            jobs: {
                moderna_atendimentos_full: { label: 'Atendimentos (Total)', description: 'Carga total desde 01/01/2025' },
                moderna_atendimentos: { label: 'Atendimentos (2 dias)', description: 'Incremental com os últimos 2 dias' }
            }
        },
        {
            id: 'ativacoes',
            title: 'Ativações Boon',
            color: '#f59e0b',
            jobs: {
                tabela_ativacoes: { label: 'Tabela Ativações', description: 'Ativações do portal' }
            }
        },
        {
            id: 'botmaker',
            title: 'Botmaker',
            color: '#10b981',
            jobs: {
                botmaker_full: { label: 'Pipeline Completo', description: 'Carga total desde 2024' },
                botmaker_3dias: { label: 'Pipeline (2 dias)', description: 'Incremental com os últimos 2 dias' }
            }
        },
        {
            id: 'qbem',
            title: 'qBem',
            color: '#6366f1',
            jobs: {
                import_contratos: { label: 'Contratos', description: 'Carga total via API' },
                import_beneficiarios: { label: 'Beneficiarios (Total)', description: 'Carga completa (~7h)' },
                import_beneficiarios_alterados: { label: 'Beneficiarios (2 dias)', description: 'Incremental com os últimos 2 dias' }
            }
        },
        {
            id: 'nps',
            title: 'NPS',
            color: '#8b5cf6',
            jobs: {
                nps_full: { label: 'Materializar respostas NPS', description: 'Cruza pergunta NPS x resposta x CPF x estipulante em botmaker.nps' }
            }
        }
    ]

    const fetchJobs = async () => {
        try {
            const res = await fetch('/api/jobs')
            const data = await res.json()
            setJobs(data)
        } catch (e) { console.error('Erro ao buscar jobs:', e) }
        setLoading(false)
    }

    const fetchSchedules = async () => {
        try {
            const res = await fetch('/api/schedules')
            const data = await res.json()
            setSchedules(data)
        } catch (e) { console.error('Erro ao buscar agendamentos:', e) }
    }

    const fetchOutput = async (name) => {
        try {
            const res = await fetch(`/api/jobs/${name}/output`)
            const data = await res.json()
            setOutputs(prev => ({ ...prev, [name]: data }))
        } catch (e) { console.error('Erro ao buscar output:', e) }
    }

    const activeOutputRef = useRef(activeOutput)
    activeOutputRef.current = activeOutput

    useEffect(() => {
        fetchJobs()
        fetchSchedules()
        const interval = setInterval(() => {
            fetchJobs()
            if (activeOutputRef.current) fetchOutput(activeOutputRef.current)
        }, 3000)
        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        if (activeOutput) fetchOutput(activeOutput)
    }, [activeOutput])

    const runJob = async (name) => {
        try {
            await fetch(`/api/jobs/${name}/run`, { method: 'POST' })
            setActiveOutput(name)
            fetchJobs()
        } catch (e) { console.error('Erro ao iniciar job:', e) }
    }

    const toggleSchedule = async (name) => {
        const current = schedules[name] || { enabled: false, times: ['08:30', '12:30'] }
        try {
            await fetch(`/api/schedules/${name}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...current, enabled: !current.enabled })
            })
            fetchSchedules()
        } catch (e) { console.error('Erro ao atualizar agendamento:', e) }
    }

    const updateScheduleTimes = async (name, times) => {
        const current = schedules[name] || { enabled: false, times: [] }
        try {
            await fetch(`/api/schedules/${name}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...current, times })
            })
            fetchSchedules()
        } catch (e) { console.error('Erro ao atualizar horários:', e) }
    }

    const addTime = (name) => updateScheduleTimes(name, [...(schedules[name]?.times || []), '08:00'])
    const removeTime = (name, i) => updateScheduleTimes(name, (schedules[name]?.times || []).filter((_, idx) => idx !== i))
    const changeTime = (name, i, val) => {
        const t = [...(schedules[name]?.times || [])]; t[i] = val; updateScheduleTimes(name, t)
    }

    const formatDate = (iso) => !iso ? '--' : new Date(iso).toLocaleString('pt-BR')

    const StatusBadge = ({ job }) => {
        if (job.running) return <span className="jobs-badge jobs-badge--running"><Loader size={12} className="spin" /> Executando</span>
        if (job.lastResult === 'success') return <span className="jobs-badge jobs-badge--success"><CheckCircle size={12} /> Sucesso</span>
        if (job.lastResult === 'error') return <span className="jobs-badge jobs-badge--error"><AlertCircle size={12} /> Erro</span>
        return <span className="jobs-badge jobs-badge--idle">Aguardando</span>
    }

    if (loading) return <p>Carregando...</p>

    return (
        <>
            <div className="admin-section-header">
                <h2>Agendamentos</h2>
            </div>

            <div className="jobs-sections">
                {SECTIONS.map(section => (
                    <div key={section.id} className="jobs-section">
                        <div className="jobs-section-header">
                            <span className="jobs-section-dot" style={{ background: section.color }} />
                            <h3 className="jobs-section-title">{section.title}</h3>
                        </div>

                        {Object.keys(section.jobs).length === 0 ? (
                            <div className="jobs-empty">
                                <Clock size={20} style={{ opacity: 0.3 }} />
                                <span>Nenhum agendamento configurado</span>
                            </div>
                        ) : (
                            <div className="jobs-grid">
                                {Object.entries(section.jobs).map(([name, config]) => {
                                    const job = jobs[name] || {}
                                    const output = outputs[name]
                                    const isActive = activeOutput === name
                                    const schedule = schedules[name] || { enabled: false, times: [] }

                                    return (
                                        <div key={name} className="jobs-card">
                                            <div className="jobs-card-top">
                                                <div className="jobs-card-info">
                                                    <span className="jobs-card-label">{config.label}</span>
                                                    <span className="jobs-card-desc">{config.description}</span>
                                                </div>
                                                <StatusBadge job={job} />
                                            </div>

                                            <div className="jobs-schedule-row">
                                                <button className="jobs-toggle" onClick={() => toggleSchedule(name)}>
                                                    {schedule.enabled
                                                        ? <ToggleRight size={20} style={{ color: 'var(--color-success)' }} />
                                                        : <ToggleLeft size={20} style={{ opacity: 0.4 }} />
                                                    }
                                                </button>
                                                <div className="jobs-times">
                                                    {(schedule.times || []).map((time, i) => (
                                                        <div key={i} className="jobs-time-chip">
                                                            <input type="time" value={time} onChange={e => changeTime(name, i, e.target.value)} className="jobs-time-input" />
                                                            <button onClick={() => removeTime(name, i)} className="jobs-time-remove"><X size={12} /></button>
                                                        </div>
                                                    ))}
                                                    <button className="jobs-time-add" onClick={() => addTime(name)}><Plus size={12} /></button>
                                                </div>
                                            </div>

                                            <div className="jobs-card-footer">
                                                <div className="jobs-card-last-wrapper">
                                                    <span className="jobs-card-last-label">Última atualização:</span>
                                                    <span className="jobs-card-last">{formatDate(job.lastRun)}</span>
                                                </div>
                                                <div className="jobs-card-actions">
                                                    <button className="jobs-btn-log" onClick={() => { setActiveOutput(isActive ? null : name); if (!isActive) fetchOutput(name) }}>
                                                        <Eye size={14} />
                                                    </button>
                                                    <button className="jobs-btn-run" disabled={job.running} onClick={() => runJob(name)}>
                                                        <Play size={14} /> Executar
                                                    </button>
                                                </div>
                                            </div>

                                            {isActive && (
                                                <pre className="jobs-log">{output?.output || 'Nenhum log disponivel.'}</pre>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </>
    )
}

/* ======================== SETTINGS TAB ======================== */
function AdminSettings() {
    const { settings, updateSettings, integrations, updateIntegrations } = useData()
    const [localSettings, setLocalSettings] = useState({ ...settings })
    const [saved, setSaved] = useState(false)

    /* --- Integration modals --- */
    const [showEntraModal, setShowEntraModal] = useState(false)
    const [showPbiModal, setShowPbiModal] = useState(false)
    const [entraForm, setEntraForm] = useState({ ...integrations.entra })
    const [pbiForm, setPbiForm] = useState({ ...integrations.pbi })
    const [entraSaved, setEntraSaved] = useState(false)
    const [pbiSaved, setPbiSaved] = useState(false)

    const handleSave = () => {
        updateSettings(localSettings)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    const handleLogoUpload = (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > 2 * 1024 * 1024) {
            alert('O arquivo deve ter no máximo 2MB.')
            return
        }
        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecione um arquivo de imagem (PNG, SVG, JPG).')
            return
        }
        const reader = new FileReader()
        reader.onload = (ev) => {
            setLocalSettings(prev => ({ ...prev, logo: ev.target.result }))
        }
        reader.readAsDataURL(file)
    }

    const removeLogo = () => {
        setLocalSettings(prev => ({ ...prev, logo: null }))
    }

    return (
        <>
            <div className="admin-content-header">
                <h1>⚙️ Configurações</h1>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)', maxWidth: 600 }}>
                {/* Portal */}
                <div className="card card-body" style={{ padding: 'var(--space-6)' }}>
                    <h3 style={{ marginBottom: 'var(--space-5)', color: 'var(--color-gray-900)' }}>Identidade do Portal</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                        <div className="form-group">
                            <label className="form-label">Nome do Portal</label>
                            <input
                                className="form-input"
                                value={localSettings.name}
                                onChange={e => setLocalSettings({ ...localSettings, name: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Logo do Portal</label>
                            <input
                                type="file"
                                id="logo-upload"
                                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                                style={{ display: 'none' }}
                                onChange={handleLogoUpload}
                            />
                            {localSettings.logo ? (
                                <div style={{
                                    border: '2px solid var(--color-gray-200)',
                                    borderRadius: 'var(--radius-xl)',
                                    padding: 'var(--space-6)',
                                    textAlign: 'center',
                                    background: 'var(--color-gray-50)'
                                }}>
                                    <img
                                        src={localSettings.logo}
                                        alt="Logo do portal"
                                        style={{
                                            maxHeight: 80,
                                            maxWidth: '100%',
                                            margin: '0 auto var(--space-4)',
                                            objectFit: 'contain'
                                        }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-2)' }}>
                                        <button
                                            className="btn btn-outline btn-sm"
                                            onClick={() => document.getElementById('logo-upload').click()}
                                        >
                                            <Upload size={14} /> Trocar
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={removeLogo}
                                            style={{ color: 'var(--color-error)' }}
                                        >
                                            <X size={14} /> Remover
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    onClick={() => document.getElementById('logo-upload').click()}
                                    style={{
                                        border: '2px dashed var(--color-gray-300)',
                                        borderRadius: 'var(--radius-xl)',
                                        padding: 'var(--space-8)',
                                        textAlign: 'center',
                                        color: 'var(--color-gray-400)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.borderColor = 'var(--color-primary-light)'
                                        e.currentTarget.style.background = 'rgba(124, 58, 237, 0.02)'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.borderColor = 'var(--color-gray-300)'
                                        e.currentTarget.style.background = 'transparent'
                                    }}
                                >
                                    <Upload size={32} style={{ margin: '0 auto var(--space-2)' }} />
                                    <p style={{ fontSize: 'var(--font-size-sm)' }}>Clique para enviar um logo</p>
                                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-300)' }}>PNG, SVG, JPG — Max 2MB</p>
                                </div>
                            )}
                        </div>

                        <div className="modal-row">
                            <div className="form-group">
                                <label className="form-label">Cor Primária</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                    <input
                                        type="color"
                                        value={localSettings.primaryColor}
                                        onChange={e => setLocalSettings({ ...localSettings, primaryColor: e.target.value })}
                                        style={{ width: 40, height: 40, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                                    />
                                    <input
                                        className="form-input"
                                        value={localSettings.primaryColor}
                                        onChange={e => setLocalSettings({ ...localSettings, primaryColor: e.target.value })}
                                        style={{ flex: 1 }}
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Cor Secundária</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                    <input
                                        type="color"
                                        value={localSettings.secondaryColor}
                                        onChange={e => setLocalSettings({ ...localSettings, secondaryColor: e.target.value })}
                                        style={{ width: 40, height: 40, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                                    />
                                    <input
                                        className="form-input"
                                        value={localSettings.secondaryColor}
                                        onChange={e => setLocalSettings({ ...localSettings, secondaryColor: e.target.value })}
                                        style={{ flex: 1 }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Integrations */}
                <div className="card card-body" style={{ padding: 'var(--space-6)' }}>
                    <h3 style={{ marginBottom: 'var(--space-5)', color: 'var(--color-gray-900)' }}>Integrações</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

                        {/* Entra ID */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: 'var(--space-4)', background: 'var(--color-gray-50)',
                            borderRadius: 'var(--radius-xl)', border: `1px solid ${entraForm.connected ? 'var(--color-success)' : 'var(--color-gray-200)'}`
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                <Globe size={20} color={entraForm.connected ? 'var(--color-success)' : 'var(--color-info)'} />
                                <div>
                                    <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                                        Microsoft Entra ID (Azure AD)
                                        {entraForm.connected && <span className="badge badge-success" style={{ marginLeft: 8 }}>Conectado</span>}
                                    </p>
                                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)' }}>SSO com login corporativo</p>
                                </div>
                            </div>
                            <button className="btn btn-outline btn-sm" onClick={() => setShowEntraModal(true)}>
                                {entraForm.connected ? 'Editar' : 'Conectar'}
                            </button>
                        </div>

                        {/* Power BI */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: 'var(--space-4)', background: 'var(--color-gray-50)',
                            borderRadius: 'var(--radius-xl)', border: `1px solid ${pbiForm.connected ? 'var(--color-success)' : 'var(--color-gray-200)'}`
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                <Key size={20} color={pbiForm.connected ? 'var(--color-success)' : 'var(--color-primary)'} />
                                <div>
                                    <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                                        Power BI Embed (Tenant / Client)
                                        {pbiForm.connected && <span className="badge badge-success" style={{ marginLeft: 8 }}>Configurado</span>}
                                    </p>
                                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)' }}>Embed seguro com token</p>
                                </div>
                            </div>
                            <button className="btn btn-outline btn-sm" onClick={() => setShowPbiModal(true)}>
                                {pbiForm.connected ? 'Editar' : 'Configurar'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* ---- Modal: Entra ID ---- */}
                {showEntraModal && (
                    <div className="modal-overlay" onClick={() => setShowEntraModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Configurar Microsoft Entra ID</h2>
                                <button className="btn btn-ghost btn-icon" onClick={() => setShowEntraModal(false)}><X size={20} /></button>
                            </div>
                            <div className="modal-body">
                                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)', marginBottom: 'var(--space-2)' }}>
                                    Insira as credenciais do App Registration no Azure para habilitar o login SSO corporativo.
                                </p>
                                <div className="form-group">
                                    <label className="form-label">Tenant ID (Directory ID)</label>
                                    <input className="form-input" value={entraForm.tenantId} onChange={e => setEntraForm({ ...entraForm, tenantId: e.target.value })} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Client ID (Application ID)</label>
                                    <input className="form-input" value={entraForm.clientId} onChange={e => setEntraForm({ ...entraForm, clientId: e.target.value })} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Client Secret</label>
                                    <input className="form-input" type="password" value={entraForm.clientSecret} onChange={e => setEntraForm({ ...entraForm, clientSecret: e.target.value })} placeholder="••••••••••••••••" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Redirect URI</label>
                                    <input className="form-input" value={entraForm.redirectUri} onChange={e => setEntraForm({ ...entraForm, redirectUri: e.target.value })} placeholder="https://seuportal.com/auth/callback" />
                                </div>
                                {entraSaved && <p style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>✓ Configuração salva com sucesso!</p>}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-ghost" onClick={() => setShowEntraModal(false)}>Cancelar</button>
                                <button className="btn btn-primary" onClick={() => {
                                    const updated = { ...entraForm, connected: !!(entraForm.tenantId && entraForm.clientId && entraForm.clientSecret) }
                                    setEntraForm(updated)
                                    updateIntegrations({ entra: updated })
                                    setEntraSaved(true)
                                    setTimeout(() => { setEntraSaved(false); setShowEntraModal(false) }, 1500)
                                }}>
                                    <Save size={16} /> Salvar e Conectar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ---- Modal: Power BI Embed ---- */}
                {showPbiModal && (
                    <div className="modal-overlay" onClick={() => setShowPbiModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Configurar Power BI Embed</h2>
                                <button className="btn btn-ghost btn-icon" onClick={() => setShowPbiModal(false)}><X size={20} /></button>
                            </div>
                            <div className="modal-body">
                                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)', marginBottom: 'var(--space-2)' }}>
                                    Configure o Service Principal para gerar tokens de embed seguros para seus relatórios Power BI.
                                </p>
                                <div className="form-group">
                                    <label className="form-label">Tenant ID</label>
                                    <input className="form-input" value={pbiForm.tenantId} onChange={e => setPbiForm({ ...pbiForm, tenantId: e.target.value })} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                                </div>
                                <div className="modal-row">
                                    <div className="form-group">
                                        <label className="form-label">Client ID</label>
                                        <input className="form-input" value={pbiForm.clientId} onChange={e => setPbiForm({ ...pbiForm, clientId: e.target.value })} placeholder="App Client ID" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Client Secret</label>
                                        <input className="form-input" type="password" value={pbiForm.clientSecret} onChange={e => setPbiForm({ ...pbiForm, clientSecret: e.target.value })} placeholder="••••••••" />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Workspace ID (padrão)</label>
                                    <input className="form-input" value={pbiForm.workspaceId} onChange={e => setPbiForm({ ...pbiForm, workspaceId: e.target.value })} placeholder="ID do workspace padrão (opcional)" />
                                </div>
                                {pbiSaved && <p style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>✓ Configuração salva com sucesso!</p>}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-ghost" onClick={() => setShowPbiModal(false)}>Cancelar</button>
                                <button className="btn btn-primary" onClick={() => {
                                    const updated = { ...pbiForm, connected: !!(pbiForm.tenantId && pbiForm.clientId && pbiForm.clientSecret) }
                                    setPbiForm(updated)
                                    updateIntegrations({ pbi: updated })
                                    setPbiSaved(true)
                                    setTimeout(() => { setPbiSaved(false); setShowPbiModal(false) }, 1500)
                                }}>
                                    <Save size={16} /> Salvar Configuração
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary" onClick={handleSave}>
                        <Save size={16} />
                        {saved ? 'Salvo com sucesso! ✓' : 'Salvar Configurações'}
                    </button>
                </div>
            </div>
        </>
    )
}

/* ======================== SLA AMAR & CUIDAR TAB ======================== */
/* ======================== FERIADOS TAB ======================== */
function AdminFeriados() {
    const [feriados, setFeriados] = useState([])
    const [showModal, setShowModal] = useState(false)
    const [form, setForm] = useState({ data: '', descricao: '', tipo: 'nacional' })
    const [search, setSearch] = useState('')

    const fetchFeriados = async () => {
        try {
            const res = await fetch('/api/feriados')
            const data = await res.json()
            setFeriados(data)
        } catch (err) { console.error(err) }
    }

    useEffect(() => { fetchFeriados() }, [])

    const handleSave = async () => {
        if (!form.data || !form.descricao.trim()) { alert('Preencha data e descrição.'); return }
        try {
            const res = await fetch('/api/feriados', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            })
            const data = await res.json()
            if (data.error) { alert(data.error); return }
            setShowModal(false)
            setForm({ data: '', descricao: '', tipo: 'nacional' })
            fetchFeriados()
        } catch (err) { alert('Erro: ' + err.message) }
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Excluir este feriado?')) return
        await fetch('/api/feriados/' + id, { method: 'DELETE' })
        fetchFeriados()
    }

    const filtered = feriados.filter(f => {
        if (!search) return true
        const s = search.toLowerCase()
        return f.descricao.toLowerCase().includes(s) || f.data?.includes(s)
    })

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '-'

    return (
        <>
            <div className="admin-content-header">
                <h1>Feriados</h1>
                <button className="btn btn-primary" onClick={() => { setForm({ data: '', descricao: '', tipo: 'nacional' }); setShowModal(true) }}>
                    <Plus size={16} /> Novo Feriado
                </button>
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ position: 'relative', maxWidth: 300 }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-gray-400)' }} />
                    <input className="form-input" placeholder="Buscar feriado..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
                </div>
            </div>

            <div className="table-container">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Descrição</th>
                            <th>Tipo</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(f => (
                            <tr key={f.id}>
                                <td><strong>{formatDate(f.data)}</strong></td>
                                <td>{f.descricao}</td>
                                <td><span className="badge badge-info" style={{ fontSize: 10 }}>{f.tipo}</span></td>
                                <td>
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(f.id)} title="Excluir" style={{ color: 'var(--color-error)' }}>
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-gray-400)', padding: 'var(--space-8)' }}>Nenhum feriado cadastrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <div className="modal-header">
                            <h2>Novo Feriado</h2>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Data *</label>
                                <input type="date" className="form-input" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Descrição *</label>
                                <input className="form-input" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Natal, Carnaval..." />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Tipo</label>
                                <select className="form-input" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                                    <option value="nacional">Nacional</option>
                                    <option value="estadual">Estadual</option>
                                    <option value="municipal">Municipal</option>
                                    <option value="ponto_facultativo">Ponto Facultativo</option>
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave}><Save size={16} /> Salvar</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

function AdminSlaAmarCuidar() {
    const { user } = useAuth()
    const [registros, setRegistros] = useState([])
    const [showModal, setShowModal] = useState(false)
    const [editing, setEditing] = useState(null)
    const [filtro, setFiltro] = useState('vigentes')
    const [search, setSearch] = useState('')
    const [conflito, setConflito] = useState(null)
    const emptyForm = { tema: '', grau_risco: '', sla_dias: '', data_inicio: new Date().toISOString().split('T')[0], data_fim: '', visivel: true }
    const [form, setForm] = useState(emptyForm)

    const fetchRegistros = async () => {
        try {
            const res = await fetch('/api/sla-amar-cuidar')
            const data = await res.json()
            setRegistros(data)
        } catch (err) {
            console.error('Erro ao carregar SLAs:', err)
        }
    }

    useEffect(() => { fetchRegistros() }, [])

    const openCreate = () => {
        setEditing(null)
        setForm(emptyForm)
        setConflito(null)
        setShowModal(true)
    }

    const openEdit = (reg) => {
        setEditing(reg.id)
        setForm({
            tema: reg.tema,
            grau_risco: reg.grau_risco,
            sla_dias: reg.sla_dias,
            data_inicio: reg.data_inicio?.split('T')[0] || '',
            data_fim: reg.data_fim?.split('T')[0] || '',
            visivel: reg.visivel !== false
        })
        setConflito(null)
        setShowModal(true)
    }

    const handleSave = async (force = false) => {
        if (!form.tema.trim() || !form.grau_risco.trim() || !form.sla_dias || !form.data_inicio) {
            alert('Preencha todos os campos obrigatórios.')
            return
        }
        try {
            const payload = {
                tema: form.tema.trim(),
                grau_risco: form.grau_risco.trim(),
                sla_dias: parseInt(form.sla_dias),
                data_inicio: form.data_inicio,
                data_fim: form.data_fim || null,
                usuario_id: user?.id || null,
                usuario_nome: user?.name || null,
                visivel: form.visivel,
                force
            }
            if (editing) {
                const res = await fetch(`/api/sla-amar-cuidar/${editing}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
                if (!res.ok) {
                    const data = await res.json()
                    alert(data.error || 'Erro ao salvar.')
                    return
                }
            } else {
                const res = await fetch('/api/sla-amar-cuidar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
                const data = await res.json()
                if (data.conflict) {
                    setConflito(data)
                    return
                }
                if (!res.ok) {
                    alert(data.error || 'Erro ao salvar.')
                    return
                }
            }
            setConflito(null)
            setShowModal(false)
            fetchRegistros()
        } catch (err) {
            alert('Erro ao salvar: ' + err.message)
        }
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Tem certeza que deseja excluir este registro de SLA?')) return
        try {
            await fetch(`/api/sla-amar-cuidar/${id}`, { method: 'DELETE' })
            fetchRegistros()
        } catch (err) {
            alert('Erro ao excluir: ' + err.message)
        }
    }

    const filtered = registros.filter(r => {
        if (filtro === 'vigentes' && r.data_fim) return false
        if (filtro === 'historico' && !r.data_fim) return false
        if (search) {
            const s = search.toLowerCase()
            return r.tema.toLowerCase().includes(s) || r.grau_risco.toLowerCase().includes(s)
        }
        return true
    })

    return (
        <>
            <div className="admin-content-header">
                <h1><HeartPulse size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} /> SLA Amar & Cuidar</h1>
                <button className="btn btn-primary" onClick={openCreate}>
                    <Plus size={16} /> Novo SLA
                </button>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 'var(--space-1)', background: 'var(--color-gray-100)', borderRadius: 'var(--radius-lg)', padding: 2 }}>
                    {[
                        { id: 'vigentes', label: 'Vigentes' },
                        { id: 'historico', label: 'Historico' },
                        { id: 'todos', label: 'Todos' }
                    ].map(f => (
                        <button
                            key={f.id}
                            className={`btn btn-sm ${filtro === f.id ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setFiltro(f.id)}
                            style={{ borderRadius: 'var(--radius-md)' }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-gray-400)' }} />
                    <input
                        className="form-input"
                        placeholder="Buscar por tema ou grau de risco..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ paddingLeft: 36 }}
                    />
                </div>
            </div>

            <div className="table-container">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Tema</th>
                            <th>Grau de Risco</th>
                            <th>SLA (dias)</th>
                            <th>Data Inicio</th>
                            <th>Data Fim</th>
                            <th>Status</th>
                            <th>Cadastrado por</th>
                            <th>Cliente</th>
                            <th>Modificado por</th>
                            <th>Acoes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(reg => (
                            <tr key={reg.id}>
                                <td><strong>{reg.tema}</strong></td>
                                <td>{reg.grau_risco}</td>
                                <td style={{ textAlign: 'center' }}>{reg.sla_dias}</td>
                                <td>{reg.data_inicio ? new Date(reg.data_inicio).toLocaleDateString('pt-BR') : '-'}</td>
                                <td>{reg.data_fim ? new Date(reg.data_fim).toLocaleDateString('pt-BR') : '-'}</td>
                                <td>
                                    <span className={`badge ${reg.data_fim ? 'badge-error' : 'badge-success'}`}>
                                        {reg.data_fim ? 'Encerrado' : 'Vigente'}
                                    </span>
                                </td>
                                <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)' }}>
                                    {reg.usuario_nome || '-'}
                                </td>
                                <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)' }}>
                                    {reg.visivel !== false ? 'Sim' : 'Não'}
                                </td>
                                <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)' }}>
                                    {reg.modificado_por_nome || '-'}
                                </td>
                                <td>
                                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(reg)} title="Editar">
                                            <Edit2 size={14} />
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(reg.id)} title="Excluir" style={{ color: 'var(--color-error)' }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={10} style={{ textAlign: 'center', color: 'var(--color-gray-400)', padding: 'var(--space-8)' }}>
                                    {filtro === 'vigentes' ? 'Nenhum SLA vigente cadastrado.' : filtro === 'historico' ? 'Nenhum registro no historico.' : 'Nenhum registro encontrado.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                        <div className="modal-header">
                            <h2>{editing ? 'Editar SLA' : 'Novo SLA'}</h2>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Tema *</label>
                                <input
                                    className="form-input"
                                    value={form.tema}
                                    onChange={e => setForm({ ...form, tema: e.target.value })}
                                    placeholder="Ex: Consulta, Exame, Cirurgia..."
                                />
                            </div>
                            <div className="modal-row">
                                <div className="form-group">
                                    <label className="form-label">Grau de Risco *</label>
                                    <input
                                        className="form-input"
                                        value={form.grau_risco}
                                        onChange={e => setForm({ ...form, grau_risco: e.target.value })}
                                        placeholder="Ex: Baixo, Medio, Alto, Urgente"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">SLA (dias) *</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        min="1"
                                        value={form.sla_dias}
                                        onChange={e => setForm({ ...form, sla_dias: e.target.value })}
                                        placeholder="Ex: 30"
                                    />
                                </div>
                            </div>
                            <div className="modal-row">
                                <div className="form-group">
                                    <label className="form-label">Data Inicio *</label>
                                    <input
                                        className="form-input"
                                        type="date"
                                        value={form.data_inicio}
                                        onChange={e => setForm({ ...form, data_inicio: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Data Fim</label>
                                    <input
                                        className="form-input"
                                        type="date"
                                        value={form.data_fim}
                                        onChange={e => setForm({ ...form, data_fim: e.target.value })}
                                    />
                                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)' }}>
                                        Deixe em branco para SLA vigente
                                    </span>
                                </div>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-2)' }}>
                                <div
                                    className={`toggle ${form.visivel ? 'active' : ''}`}
                                    onClick={() => setForm({ ...form, visivel: !form.visivel })}
                                />
                                Mostrar este SLA para a versão do cliente?
                            </label>
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)' }}>
                                Se desativado, os atendimentos com este grau de risco não aparecerão no dashboard.
                            </span>
                            {conflito && (
                                <div style={{
                                    background: '#FFF3CD',
                                    border: '1px solid #FFCA28',
                                    borderRadius: 'var(--radius-lg)',
                                    padding: 'var(--space-4)',
                                    marginTop: 'var(--space-2)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                                        <AlertCircle size={20} style={{ color: '#E65100', flexShrink: 0, marginTop: 2 }} />
                                        <div>
                                            <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: '#E65100', marginBottom: 'var(--space-2)' }}>
                                                SLA vigente encontrado
                                            </p>
                                            <p style={{ fontSize: 'var(--font-size-sm)', color: '#5D4037', marginBottom: 'var(--space-3)' }}>
                                                {conflito.message}
                                            </p>
                                            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                                <button
                                                    className="btn btn-sm"
                                                    style={{ background: '#E65100', color: '#fff', border: 'none' }}
                                                    onClick={() => handleSave(true)}
                                                >
                                                    Encerrar vigente e criar novo
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => setConflito(null)}
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => { setShowModal(false); setConflito(null) }}>Cancelar</button>
                            <button className="btn btn-primary" onClick={() => handleSave()}>
                                <Save size={16} /> Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
