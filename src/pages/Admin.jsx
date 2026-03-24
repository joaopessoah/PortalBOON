import { useState } from 'react'
import { useData } from '../contexts/DataContext'
import Header from '../components/Header'
import {
    LayoutDashboard, Users, Settings, Plus, Edit2, Trash2, Eye,
    X, Save, Search, ToggleLeft, ToggleRight, Upload, Globe, Key,
    Lock, Mail, RefreshCw, Building2
} from 'lucide-react'

/* ======================== ADMIN PAGE ======================== */
export default function Admin() {
    const [activeTab, setActiveTab] = useState('dashboards')

    const tabs = [
        { id: 'dashboards', label: 'Dashboards', icon: LayoutDashboard },
        { id: 'users', label: 'Usuários', icon: Users },
        { id: 'companies', label: 'Empresas', icon: Building2 },
        { id: 'settings', label: 'Configurações', icon: Settings }
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
                    {activeTab === 'settings' && <AdminSettings />}
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
    )

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
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(dash.id)} title="Excluir" style={{ color: 'var(--color-error)' }}>
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

    const emptyForm = {
        name: '', email: '', password: '123', role: 'user',
        status: 'active', groups: [], rlsMapping: {}, companyId: null
    }

    const [form, setForm] = useState(emptyForm)
    const [newPassword, setNewPassword] = useState('')
    const [passwordMsg, setPasswordMsg] = useState({ text: '', type: '' })
    const [sendingEmail, setSendingEmail] = useState(false)

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
        setForm({ ...user })
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
