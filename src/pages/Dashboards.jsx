import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import Header from '../components/Header'
import {
    Search, Filter, Star, Clock, BarChart3, ExternalLink, LayoutGrid
} from 'lucide-react'

export default function Dashboards() {
    const { user } = useAuth()
    const { getVisibleDashboards, categories } = useData()
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('all')
    const [sort, setSort] = useState('order')

    const allDashboards = getVisibleDashboards(user)

    const filtered = useMemo(() => {
        let list = [...allDashboards]

        // Filter by search
        if (search.trim()) {
            const q = search.toLowerCase()
            list = list.filter(
                d => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)
            )
        }

        // Filter by category
        if (category !== 'all') {
            list = list.filter(d => d.category === category)
        }

        // Sort
        switch (sort) {
            case 'az':
                list.sort((a, b) => a.name.localeCompare(b.name))
                break
            case 'recent':
                list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                break
            case 'pinned':
                list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
                break
            default:
                list.sort((a, b) => a.order - b.order)
        }

        return list
    }, [allDashboards, search, category, sort])

    const formatDate = (dateStr) => {
        if (!dateStr) return ''
        const d = new Date(dateStr)
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    const getCategoryColor = (catName) => {
        const cat = categories.find(c => c.name === catName)
        return cat?.color || '#7c3aed'
    }

    return (
        <div>
            <Header />
            <div className="dashboards-page">
                <div className="container">
                    <div className="dashboards-header animate-fade-in-up">
                        <h1>Meus Dashboards</h1>
                        <p>Explore seus dashboards de forma rápida e organizada.</p>
                    </div>

                    {/* Toolbar */}
                    <div className="dashboards-toolbar animate-fade-in-up animate-delay-1">
                        <div className="search-input-wrapper">
                            <Search size={18} />
                            <input
                                type="text"
                                className="search-input"
                                placeholder="Buscar dashboard por nome..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        <select
                            className="filter-select"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                        >
                            <option value="all">Todas as categorias</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.name}>{cat.name}</option>
                            ))}
                        </select>

                        <select
                            className="filter-select"
                            value={sort}
                            onChange={(e) => setSort(e.target.value)}
                        >
                            <option value="order">Ordem padrão</option>
                            <option value="az">A - Z</option>
                            <option value="recent">Mais recentes</option>
                            <option value="pinned">Fixados primeiro</option>
                        </select>
                    </div>

                    {/* Grid */}
                    <div className="dashboards-grid">
                        {filtered.length === 0 ? (
                            <div className="dashboards-empty">
                                <LayoutGrid size={64} />
                                <p>Nenhum dashboard encontrado.</p>
                            </div>
                        ) : (
                            filtered.map((dash, idx) => (
                                <div
                                    key={dash.id}
                                    className={`card dashboard-card animate-fade-in-up animate-delay-${Math.min(idx + 1, 5)}`}
                                >
                                    <div className="card-body">
                                        {dash.pinned && (
                                            <div className="dashboard-card-pinned">
                                                <Star size={16} fill="currentColor" />
                                            </div>
                                        )}

                                        <div className="dashboard-card-category">
                                            <span
                                                className="badge"
                                                style={{
                                                    background: `${getCategoryColor(dash.category)}15`,
                                                    color: getCategoryColor(dash.category)
                                                }}
                                            >
                                                {dash.category}
                                            </span>
                                        </div>

                                        <h3>{dash.name}</h3>
                                        <p>{dash.description}</p>

                                        <div className="dashboard-card-footer">
                                            <span className="dashboard-card-date">
                                                <Clock size={12} />
                                                Atualizado em {formatDate(dash.lastUpdate)}
                                            </span>

                                            <Link to={`/dashboards/${dash.id}`} className="btn btn-primary btn-sm">
                                                <ExternalLink size={14} />
                                                Abrir
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
