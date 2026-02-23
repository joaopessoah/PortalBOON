import { useEffect, useRef, useState } from 'react'
import * as pbi from 'powerbi-client'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'

const powerbiService = new pbi.service.Service(
    pbi.factories.hpmFactory,
    pbi.factories.wpmpFactory,
    pbi.factories.routerFactory
)

/**
 * Extrai reportId e groupId de uma URL do Power BI.
 */
function parseUrl(url) {
    try {
        const u = new URL(url)
        const groupMatch = u.pathname.match(/\/groups\/([^/]+)/)
        const reportMatch = u.pathname.match(/\/reports\/([^/]+)/)
        return {
            groupId: groupMatch?.[1] || null,
            reportId: reportMatch?.[1] || null
        }
    } catch {
        return { groupId: null, reportId: null }
    }
}

/**
 * Detecta se uma URL é do Power BI (app.powerbi.com)
 */
function isPowerBIUrl(url) {
    try {
        return new URL(url).hostname.includes('powerbi.com')
    } catch {
        return false
    }
}

export default function PowerBIEmbed({ url, reportId: propReportId, groupId: propGroupId, name, rlsRoles, username }) {
    const containerRef = useRef(null)
    const [status, setStatus] = useState('loading') // loading | embedded | error | fallback
    const [errorMsg, setErrorMsg] = useState('')

    // Extrair IDs da URL se não fornecidos como props
    const parsed = parseUrl(url || '')
    const reportId = propReportId || parsed.reportId
    const groupId = propGroupId || parsed.groupId

    // Se não for URL do Power BI, usar iframe como fallback
    const shouldUsePBI = isPowerBIUrl(url || '') && reportId && groupId

    useEffect(() => {
        if (!shouldUsePBI) {
            setStatus('fallback')
            return
        }

        let cancelled = false

        async function embedReport() {
            setStatus('loading')
            setErrorMsg('')

            try {
                // Chamar o backend para obter o embed token
                const response = await fetch('/api/embed-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reportId, groupId, url, rlsRoles, username })
                })

                if (cancelled) return

                if (!response.ok) {
                    const data = await response.json().catch(() => ({}))
                    throw new Error(data.error || `Erro HTTP ${response.status}`)
                }

                const embedData = await response.json()

                if (cancelled || !containerRef.current) return

                // Configuração do embed
                const config = {
                    type: 'report',
                    tokenType: pbi.models.TokenType.Embed,
                    accessToken: embedData.accessToken,
                    embedUrl: embedData.embedUrl,
                    id: embedData.reportId,
                    settings: {
                        panes: {
                            filters: { visible: false },
                            pageNavigation: { visible: true }
                        }
                    }
                }

                // Embedar o relatório
                const report = powerbiService.embed(containerRef.current, config)

                report.on('loaded', () => {
                    if (!cancelled) setStatus('embedded')
                })

                report.on('rendered', () => {
                    if (!cancelled) setStatus('embedded')
                })

                report.on('error', (event) => {
                    const errorDetail = event?.detail || {}
                    console.warn('Power BI embed event:', errorDetail)

                    // Ignorar erros temporários que acontecem durante navegação entre páginas
                    const ignoredErrors = [
                        'TokenExpired', 'LoadFailed', 'GetReportFailed'
                    ]
                    const errorLevel = errorDetail?.level
                    const errorMessage = errorDetail?.message || ''

                    // Só mostrar erro fatal se não for temporário
                    if (errorLevel === 'Fatal' && !ignoredErrors.includes(errorDetail?.errorCode)) {
                        if (!cancelled && status !== 'embedded') {
                            setStatus('error')
                            setErrorMsg(errorMessage || 'Erro ao carregar o relatório. Verifique as permissões.')
                        }
                    }
                })

            } catch (err) {
                if (!cancelled) {
                    console.error('Embed token fetch error:', err)
                    setStatus('error')
                    setErrorMsg(
                        err.message.includes('Failed to fetch')
                            ? 'Backend não encontrado. Certifique-se de que o servidor está rodando (npm start na pasta server/).'
                            : err.message
                    )
                }
            }
        }

        embedReport()

        return () => {
            cancelled = true
            if (containerRef.current) {
                powerbiService.reset(containerRef.current)
            }
        }
    }, [reportId, groupId, url, rlsRoles, username, shouldUsePBI])

    // Fallback: URL que não é do Power BI → usa iframe simples
    if (status === 'fallback') {
        return (
            <iframe
                src={url}
                title={name || 'Dashboard'}
                allowFullScreen
                frameBorder="0"
                style={{ width: '100%', height: '100%', border: 'none' }}
            />
        )
    }

    return (
        <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 130px)' }}>
            {/* Loading overlay */}
            {status === 'loading' && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--color-gray-50)', borderRadius: 'var(--radius-xl)',
                    gap: 'var(--space-3)', zIndex: 10
                }}>
                    <Loader2 size={40} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />
                    <p style={{ color: 'var(--color-gray-500)', fontSize: 'var(--font-size-sm)' }}>
                        Carregando relatório...
                    </p>
                </div>
            )}

            {/* Error overlay */}
            {status === 'error' && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--color-gray-50)', borderRadius: 'var(--radius-xl)',
                    gap: 'var(--space-3)', zIndex: 10, padding: 'var(--space-6)'
                }}>
                    <AlertTriangle size={48} style={{ color: 'var(--color-warning)' }} />
                    <p style={{
                        color: 'var(--color-gray-700)', fontWeight: 600,
                        fontSize: 'var(--font-size-base)', textAlign: 'center'
                    }}>
                        Não foi possível carregar o relatório
                    </p>
                    <p style={{
                        color: 'var(--color-gray-400)', fontSize: 'var(--font-size-sm)',
                        textAlign: 'center', maxWidth: 400
                    }}>
                        {errorMsg}
                    </p>
                    <button
                        className="btn btn-outline btn-sm"
                        onClick={() => window.location.reload()}
                        style={{ marginTop: 'var(--space-2)' }}
                    >
                        <RefreshCw size={14} />
                        Tentar novamente
                    </button>
                </div>
            )}

            {/* Container do Power BI SDK */}
            <div
                ref={containerRef}
                style={{
                    width: '100%',
                    height: 'calc(100vh - 130px)',
                    visibility: status === 'embedded' ? 'visible' : 'hidden'
                }}
            />
        </div>
    )
}
