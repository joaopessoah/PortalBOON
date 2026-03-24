import { useState, useEffect } from 'react'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import Header from '../components/Header'
import { Search, Filter, Loader2, RefreshCw, Download } from 'lucide-react'

export default function Ativacoes() {
    const [ativacoes, setAtivacoes] = useState([])
    const [page, setPage] = useState(1)
    const [totalBeneficiarios, setTotalBeneficiarios] = useState(0)
    const [beneficiariosAtivos, setBeneficiariosAtivos] = useState(0)
    const [filterOptions, setFilterOptions] = useState({
        estipulantes: [],
        subEstipulantes: [],
        grausParentesco: [],
        titulares: []
    })
    const [loading, setLoading] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [lastSync, setLastSync] = useState(null)
    const [error, setError] = useState('')

    const [filters, setFilters] = useState({
        estipulante: '',
        subEstipulante: '',
        titular: '',
        ativo: '',
        dataAtivacao: '',
        grauParentesco: ''
    })

    const fetchAtivacoes = async (pageNum = page) => {
        setLoading(true)
        setError('')
        try {
            const queryParams = new URLSearchParams()
            if (filters.estipulante) queryParams.append('estipulante', filters.estipulante)
            if (filters.subEstipulante) queryParams.append('subEstipulante', filters.subEstipulante)
            if (filters.titular) queryParams.append('titular', filters.titular)
            if (filters.ativo) queryParams.append('ativo', filters.ativo)
            if (filters.dataAtivacao) queryParams.append('dataAtivacao', filters.dataAtivacao)
            if (filters.grauParentesco) queryParams.append('grauParentesco', filters.grauParentesco)

            queryParams.append('page', pageNum)
            queryParams.append('limit', 100)

            const response = await fetch(`/api/ativacoes?${queryParams.toString()}`)
            if (!response.ok) throw new Error('Erro ao buscar ativações')
            const data = await response.json()

            if (Array.isArray(data)) {
                setAtivacoes(data)
                setTotalBeneficiarios(data.length)
                setBeneficiariosAtivos(data.filter(i => i.AtivoBotmaker === 'Sim').length)
            } else {
                setAtivacoes(data.data || [])
                setTotalBeneficiarios(data.total || 0)
                setBeneficiariosAtivos(data.ativos || 0)
            }
        } catch (err) {
            console.error(err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    // Call fetch when component mounts, filters are manually applied, or page changes
    useEffect(() => {
        fetchAtivacoes(page)
        fetchLastSync()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page])

    // Fetch dynamic interdependent filter options with a debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchFilterOptions()
        }, 500)
        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters])

    const fetchFilterOptions = async () => {
        try {
            const queryParams = new URLSearchParams()
            if (filters.estipulante) queryParams.append('estipulante', filters.estipulante)
            if (filters.subEstipulante) queryParams.append('subEstipulante', filters.subEstipulante)
            if (filters.titular) queryParams.append('titular', filters.titular)
            if (filters.ativo) queryParams.append('ativo', filters.ativo)
            if (filters.dataAtivacao) queryParams.append('dataAtivacao', filters.dataAtivacao)
            if (filters.grauParentesco) queryParams.append('grauParentesco', filters.grauParentesco)

            const res = await fetch(`/api/ativacoes/opcoes?${queryParams.toString()}`)
            if (res.ok) {
                const data = await res.json()
                setFilterOptions(data)
            }
        } catch (err) {
            console.error('Failed to fetch filter options:', err)
        }
    }

    const fetchLastSync = async () => {
        try {
            const res = await fetch('/api/ativacoes/last-sync')
            if (res.ok) {
                const data = await res.json()
                if (data.lastSync) setLastSync(data.lastSync)
            }
        } catch (err) {
            console.error('Erro ao buscar última sincronização:', err)
        }
    }

    const handleSync = async () => {
        setSyncing(true)
        try {
            const res = await fetch('/api/ativacoes/sync', { method: 'POST' })
            if (!res.ok) throw new Error('Falha ao sincronizar dados.')
            const data = await res.json()
            setLastSync(data.lastSync)
            fetchAtivacoes(page) // reload items
        } catch (err) {
            console.error(err)
            alert(err.message)
        } finally {
            setSyncing(false)
        }
    }

    const handleFilterChange = (e) => {
        const { name, value } = e.target
        setFilters(prev => ({ ...prev, [name]: value }))
    }

    const handleSearch = (e) => {
        e.preventDefault()
        if (page !== 1) setPage(1)
        else fetchAtivacoes(1)
    }

    const handleExportPDF = () => {
        const doc = new jsPDF('landscape');
        doc.text('Relatório de Ativações Boon', 14, 15);

        const tableColumn = [
            "Estipulante",
            "CNPJ Estipulante",
            "SubEstipulante",
            "Grau Parentesco",
            "Nome Completo",
            "Titular",
            "Contato",
            "Ativo?",
            "Data Ativação"
        ];
        const tableRows = [];

        ativacoes.forEach(item => {
            const dataAtivacao = item.DataCriacaoBotmaker
                ? item.DataCriacaoBotmaker.substring(0, 10).split('-').join('/')
                : '';

            const rowData = [
                item.NomeEstipulante || '',
                item.CNPJEstipulante || '',
                item.NomeSubestipulante || '',
                item.GrauParentesco || '',
                item.NomeCompleto || '',
                item.NomeTitular || '',
                item.Contato || '',
                item.AtivoBotmaker || '',
                dataAtivacao
            ];
            tableRows.push(rowData);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 20,
            styles: { fontSize: 8 }
        });

        doc.save('ativacoes_boon.pdf');
    }

    const pctAtivos = totalBeneficiarios > 0 ? Math.round((beneficiariosAtivos / totalBeneficiarios) * 100) : 0;

    return (
        <div>
            <Header />
            <div className="dashboards-page">
                <div className="container">
                    <div className="dashboards-header animate-fade-in-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div>
                            <h1>Ativações Boon</h1>
                            <p>Acompanhe e filtre os beneficiários ativos na plataforma.</p>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <button
                                    onClick={handleExportPDF}
                                    className="btn"
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1' }}
                                    title="Exportar para PDF"
                                >
                                    <Download size={18} />
                                    Exportar PDF
                                </button>
                                <button
                                    onClick={handleSync}
                                    className="btn btn-primary"
                                    disabled={syncing}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <RefreshCw size={18} className={syncing ? "spin" : ""} />
                                    {syncing ? 'Atualizando...' : 'Atualizar Dados'}
                                </button>
                            </div>
                            {lastSync && (
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    Última atualização: {new Date(lastSync).toLocaleString('pt-BR')}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="card animate-fade-in-up" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
                        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div style={{ flex: '1 1 180px' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', textAlign: 'center' }}>Estipulante</label>
                                <input
                                    type="text"
                                    name="estipulante"
                                    list="lista-estipulantes"
                                    className="filter-select"
                                    style={{ width: '100%', cursor: 'text' }}
                                    placeholder="Buscar..."
                                    value={filters.estipulante}
                                    onChange={handleFilterChange}
                                    autoComplete="off"
                                />
                                <datalist id="lista-estipulantes">
                                    {filterOptions.estipulantes.map((opt, i) => (
                                        <option key={i} value={opt} />
                                    ))}
                                </datalist>
                            </div>
                            <div style={{ flex: '1 1 180px' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', textAlign: 'center' }}>SubEstipulante</label>
                                <input
                                    type="text"
                                    name="subEstipulante"
                                    list="lista-subestipulantes"
                                    className="filter-select"
                                    style={{ width: '100%', cursor: 'text' }}
                                    placeholder="Buscar..."
                                    value={filters.subEstipulante}
                                    onChange={handleFilterChange}
                                    autoComplete="off"
                                />
                                <datalist id="lista-subestipulantes">
                                    {filterOptions.subEstipulantes.map((opt, i) => (
                                        <option key={i} value={opt} />
                                    ))}
                                </datalist>
                            </div>
                            <div style={{ flex: '1 1 150px' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', textAlign: 'center' }}>Grau Parentesco</label>
                                <select
                                    name="grauParentesco"
                                    className="filter-select"
                                    style={{ width: '100%' }}
                                    value={filters.grauParentesco}
                                    onChange={handleFilterChange}
                                >
                                    <option value="">Todos</option>
                                    {filterOptions.grausParentesco.map((opt, i) => (
                                        <option key={i} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ flex: '1 1 180px' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', textAlign: 'center' }}>Nome do Titular</label>
                                <input
                                    type="text"
                                    name="titular"
                                    list="lista-titulares"
                                    className="filter-select"
                                    style={{ width: '100%', cursor: 'text' }}
                                    placeholder="Buscar..."
                                    value={filters.titular}
                                    onChange={handleFilterChange}
                                    autoComplete="off"
                                />
                                <datalist id="lista-titulares">
                                    {filterOptions.titulares.map((opt, i) => (
                                        <option key={i} value={opt} />
                                    ))}
                                </datalist>
                            </div>
                            <div style={{ flex: '1 1 120px' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', textAlign: 'center' }}>Ativo?</label>
                                <select
                                    name="ativo"
                                    className="filter-select"
                                    style={{ width: '100%' }}
                                    value={filters.ativo}
                                    onChange={handleFilterChange}
                                >
                                    <option value="">Todos</option>
                                    <option value="Sim">Sim</option>
                                    <option value="Não">Não</option>
                                </select>
                            </div>
                            <div style={{ flex: '1 1 150px' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', textAlign: 'center' }} title="Igual ou após essa data">
                                    Data de Ativação ℹ️
                                </label>
                                <input
                                    type="date"
                                    name="dataAtivacao"
                                    className="filter-select"
                                    style={{ width: '100%', cursor: 'text', padding: '0.75rem 1rem' }}
                                    value={filters.dataAtivacao}
                                    onChange={handleFilterChange}
                                />
                            </div>
                            <div>
                                <button type="submit" className="btn btn-primary" style={{ height: '42px', display: 'flex', alignItems: 'center', gap: '8px' }} disabled={loading}>
                                    {loading ? <Loader2 size={18} className="spin" /> : <Search size={18} />}
                                    Filtrar
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                        <div className="card animate-fade-in-up animate-delay-1" style={{ padding: '1.5rem', textAlign: 'center', borderTop: '4px solid #7c3aed' }}>
                            <h3 style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.5rem', fontWeight: 600 }}>Total de Beneficiários</h3>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1e293b' }}>{totalBeneficiarios.toLocaleString('pt-BR')}</div>
                        </div>
                        <div className="card animate-fade-in-up animate-delay-1" style={{ padding: '1.5rem', textAlign: 'center', borderTop: '4px solid #10b981' }}>
                            <h3 style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.5rem', fontWeight: 600 }}>Beneficiários Ativos</h3>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1e293b' }}>{beneficiariosAtivos.toLocaleString('pt-BR')}</div>
                        </div>
                        <div className="card animate-fade-in-up animate-delay-2" style={{ padding: '1.5rem', textAlign: 'center', borderTop: '4px solid #3b82f6' }}>
                            <h3 style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.5rem', fontWeight: 600 }}>% Beneficiários Ativos</h3>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1e293b' }}>{pctAtivos}%</div>
                        </div>
                    </div>

                    <div className="card animate-fade-in-up animate-delay-2" style={{ overflowX: 'auto' }}>
                        {error && <div style={{ color: 'red', padding: '1rem' }}>{error}</div>}

                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Estipulante</th>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>CNPJ Estipulante</th>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>SubEstipulante</th>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Grau Parentesco</th>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Nome Completo</th>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Titular</th>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Contato</th>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Ativo?</th>
                                    <th style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Data Ativação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && ativacoes.length === 0 ? (
                                    <tr>
                                        <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                                            <Loader2 size={24} className="spin" style={{ margin: '0 auto 10px' }} />
                                            Carregando dados...
                                        </td>
                                    </tr>
                                ) : ativacoes.length === 0 ? (
                                    <tr>
                                        <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                                            Nenhuma ativação encontrada.
                                        </td>
                                    </tr>
                                ) : (
                                    ativacoes.map((item, index) => (
                                        <tr key={index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '1rem', fontSize: '0.75rem' }}>{item.NomeEstipulante}</td>
                                            <td style={{ padding: '1rem', fontSize: '0.75rem' }}>{item.CNPJEstipulante}</td>
                                            <td style={{ padding: '1rem', fontSize: '0.75rem' }}>{item.NomeSubestipulante}</td>
                                            <td style={{ padding: '1rem', fontSize: '0.75rem' }}>{item.GrauParentesco}</td>
                                            <td style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 500 }}>{item.NomeCompleto}</td>
                                            <td style={{ padding: '1rem', fontSize: '0.75rem' }}>{item.NomeTitular}</td>
                                            <td style={{ padding: '1rem', fontSize: '0.75rem' }}>{item.Contato}</td>
                                            <td style={{ padding: '1rem', fontSize: '0.75rem' }}>
                                                <span className={`badge`} style={{ background: item.AtivoBotmaker === 'Sim' ? '#dcfce7' : '#fee2e2', color: item.AtivoBotmaker === 'Sim' ? '#16a34a' : '#dc2626' }}>
                                                    {item.AtivoBotmaker}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1rem', fontSize: '0.75rem' }}>
                                                {item.DataCriacaoBotmaker ? item.DataCriacaoBotmaker.substring(0, 10).split('-').join('/') : ''}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>

                        {/* Pagination Controls */}
                        {totalBeneficiarios > 100 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 1rem 0', borderTop: '1px solid #e2e8f0', marginTop: '1rem' }}>
                                <button
                                    onClick={() => setPage(p => p - 1)}
                                    disabled={page === 1}
                                    className="btn btn-outline"
                                    style={{ padding: '0.5rem 1rem', opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}
                                    type="button"
                                >
                                    Anterior
                                </button>
                                <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>
                                    Página {page} de {Math.max(1, Math.ceil(totalBeneficiarios / 100))}
                                </span>
                                <button
                                    onClick={() => setPage(p => p + 1)}
                                    disabled={page >= Math.ceil(totalBeneficiarios / 100)}
                                    className="btn btn-outline"
                                    style={{ padding: '0.5rem 1rem', opacity: page >= Math.ceil(totalBeneficiarios / 100) ? 0.5 : 1, cursor: page >= Math.ceil(totalBeneficiarios / 100) ? 'not-allowed' : 'pointer' }}
                                    type="button"
                                >
                                    Próxima
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    )
}
