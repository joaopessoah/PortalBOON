import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { ConfidentialClientApplication } from '@azure/msal-node'

dotenv.config()

const app = express()
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }))
app.use(express.json())

const PORT = process.env.PORT || 3001

// ---- MSAL Configuration ----
const msalConfig = {
    auth: {
        clientId: process.env.PBI_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.PBI_TENANT_ID}`,
        clientSecret: process.env.PBI_CLIENT_SECRET
    }
}

const msalClient = new ConfidentialClientApplication(msalConfig)

// Scope para Power BI API
const PBI_SCOPE = 'https://analysis.windows.net/powerbi/api/.default'

/**
 * Obtém um access token do Azure AD usando client credentials (Service Principal)
 */
async function getAccessToken() {
    const result = await msalClient.acquireTokenByClientCredential({
        scopes: [PBI_SCOPE]
    })
    return result.accessToken
}

/**
 * Extrai reportId e groupId de uma URL do Power BI
 * Ex: https://app.powerbi.com/groups/{groupId}/reports/{reportId}/...
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

// ======================== ENDPOINT: Gerar Embed Token ========================
app.post('/api/embed-token', async (req, res) => {
    try {
        let { reportId, groupId, url, rlsRoles, username } = req.body

        // Se recebeu URL em vez de IDs, extrair automaticamente
        if (url && (!reportId || !groupId)) {
            const parsed = parseUrl(url)
            reportId = reportId || parsed.reportId
            groupId = groupId || parsed.groupId
        }

        if (!reportId || !groupId) {
            return res.status(400).json({
                error: 'reportId e groupId são obrigatórios. Forneça-os diretamente ou envie a URL do Power BI.'
            })
        }

        // 1. Obter access token via Service Principal
        const accessToken = await getAccessToken()

        // 2. Obter detalhes do report (inclui embedUrl e datasetId)
        const reportResponse = await fetch(
            `https://api.powerbi.com/v1.0/myorg/groups/${groupId}/reports/${reportId}`,
            {
                headers: { Authorization: `Bearer ${accessToken}` }
            }
        )

        if (!reportResponse.ok) {
            const errorData = await reportResponse.text()
            console.error('Power BI Report API error:', reportResponse.status, errorData)
            return res.status(reportResponse.status).json({
                error: `Erro ao buscar relatório no Power BI: ${reportResponse.statusText}`
            })
        }

        const reportData = await reportResponse.json()

        // 3. Montar body para GenerateToken
        const tokenBody = { accessLevel: 'View' }

        // Se tem RLS configurado, incluir identities
        if (rlsRoles && rlsRoles.length > 0) {
            const roles = Array.isArray(rlsRoles) ? rlsRoles : [rlsRoles]
            tokenBody.identities = [{
                username: username || 'portal-user',
                roles: roles,
                datasets: [reportData.datasetId]
            }]
            console.log('RLS identity:', JSON.stringify(tokenBody.identities))
        }

        // 4. Gerar embed token
        async function generateToken(body) {
            const resp = await fetch(
                `https://api.powerbi.com/v1.0/myorg/groups/${groupId}/reports/${reportId}/GenerateToken`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                }
            )
            return resp
        }

        let tokenResponse = await generateToken(tokenBody)

        // Se falhou por RLS obrigatório e não tínhamos identity, tentar com identity padrão
        if (!tokenResponse.ok && tokenResponse.status === 400 && !tokenBody.identities) {
            const errText = await tokenResponse.text()
            if (errText.includes('requires effective identity')) {
                console.log('Dataset requer RLS — retentando com identity padrão...')
                tokenBody.identities = [{
                    username: username || 'portal-user',
                    roles: rlsRoles && rlsRoles.length > 0
                        ? (Array.isArray(rlsRoles) ? rlsRoles : [rlsRoles])
                        : ['none'],
                    datasets: [reportData.datasetId]
                }]
                tokenResponse = await generateToken(tokenBody)
            } else {
                console.error('Power BI Token API error:', tokenResponse.status, errText)
                return res.status(tokenResponse.status).json({
                    error: `Erro ao gerar token de embed: ${tokenResponse.statusText}`
                })
            }
        }

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text()
            console.error('Power BI Token API error:', tokenResponse.status, errorData)
            return res.status(tokenResponse.status).json({
                error: `Erro ao gerar token de embed: ${tokenResponse.statusText}. Verifique se a role RLS está configurada corretamente.`
            })
        }

        const tokenData = await tokenResponse.json()

        // 5. Retornar dados de embed para o frontend
        res.json({
            reportId: reportData.id,
            embedUrl: reportData.embedUrl,
            accessToken: tokenData.token,
            tokenType: 1, // Embed token
            expiration: tokenData.expiration
        })

    } catch (error) {
        console.error('Embed token error:', error)
        res.status(500).json({
            error: 'Erro interno ao gerar embed token. Verifique as credenciais do Service Principal.'
        })
    }
})

// ======================== Health Check ========================
app.get('/api/health', (req, res) => {
    const configured = !!(process.env.PBI_TENANT_ID && process.env.PBI_CLIENT_ID && process.env.PBI_CLIENT_SECRET)
    res.json({
        status: 'ok',
        configured,
        message: configured
            ? 'Service Principal configurado.'
            : 'Credenciais não configuradas. Crie um arquivo .env com PBI_TENANT_ID, PBI_CLIENT_ID e PBI_CLIENT_SECRET.'
    })
})

app.listen(PORT, () => {
    console.log(`\n🚀 Boon 360º — Backend rodando na porta ${PORT}`)
    console.log(`   Health check: http://localhost:${PORT}/api/health`)

    if (!process.env.PBI_TENANT_ID || !process.env.PBI_CLIENT_ID || !process.env.PBI_CLIENT_SECRET) {
        console.log('\n⚠️  Atenção: Credenciais do Service Principal não configuradas!')
        console.log('   Copie server/.env.example para server/.env e preencha as credenciais.\n')
    }
})
