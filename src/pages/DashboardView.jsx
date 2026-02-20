import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import Header from '../components/Header'
import {
    ArrowLeft, Maximize2, Minimize2, ChevronRight, Clock,
    BarChart3, AlertTriangle
} from 'lucide-react'

export default function DashboardView() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { getDashboard } = useData()
    const [fullscreen, setFullscreen] = useState(false)

    const dashboard = getDashboard(id)

    if (!dashboard) {
        return (
            <div>
                <Header />
                <div className="dashboard-view-placeholder">
                    <AlertTriangle size={64} />
                    <h2>Dashboard não encontrado</h2>
                    <p>O dashboard que você procura não existe ou foi removido.</p>
                    <button className="btn btn-primary" onClick={() => navigate('/dashboards')}>
                        <ArrowLeft size={16} />
                        Voltar para Dashboards
                    </button>
                </div>
            </div>
        )
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Não informado'
        const d = new Date(dateStr)
        return d.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    return (
        <div>
            {!fullscreen && <Header />}
            <div className="dashboard-view">
                {!fullscreen && (
                    <div className="dashboard-view-header">
                        <div className="dashboard-view-header-inner">
                            <div>
                                <div className="dashboard-view-breadcrumb">
                                    <Link to="/dashboards">Dashboards</Link>
                                    <ChevronRight size={14} />
                                    <span>{dashboard.category}</span>
                                    <ChevronRight size={14} />
                                    <span style={{ color: 'var(--color-gray-800)', fontWeight: 600 }}>
                                        {dashboard.name}
                                    </span>
                                </div>
                                <h1 className="dashboard-view-title">{dashboard.name}</h1>
                                <div className="dashboard-view-meta">
                                    <Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                    Última atualização: {formatDate(dashboard.lastUpdate)}
                                </div>
                            </div>

                            <div className="dashboard-view-actions">
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setFullscreen(true)}
                                >
                                    <Maximize2 size={14} />
                                    Tela cheia
                                </button>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => navigate('/dashboards')}
                                >
                                    <ArrowLeft size={14} />
                                    Voltar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className={`dashboard-view-embed ${fullscreen ? 'fullscreen' : ''}`}>
                    {fullscreen && (
                        <button
                            className="fullscreen-exit"
                            onClick={() => setFullscreen(false)}
                        >
                            <Minimize2 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            Sair da tela cheia
                        </button>
                    )}

                    {dashboard.url ? (
                        <iframe
                            src={dashboard.url}
                            title={dashboard.name}
                            allowFullScreen
                            sandbox="allow-scripts allow-same-origin allow-popups"
                        />
                    ) : (
                        <div className="dashboard-view-placeholder" style={{ minHeight: 600 }}>
                            <BarChart3 size={80} />
                            <h2>Embed não configurado</h2>
                            <p>A URL de embed deste dashboard ainda não foi configurada pelo administrador.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
