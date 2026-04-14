import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { ConfidentialClientApplication } from '@azure/msal-node'
import pg from 'pg'
import { exec } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { createTransport } from 'nodemailer'
import cron from 'node-cron'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '.env') })
dotenv.config({ path: path.join(__dirname, '../.env') })

const PYTHON_EXE = process.env.PYTHON_PATH || 'python3'
const PYTHON_ENV = {
    ...process.env,
    HOME: '/home/u590289060',
    PYTHONPATH: '/home/u590289060/.local/lib/python3.9/site-packages',
    PYTHONUSERBASE: '/home/u590289060/.local'
}

// Corrige a senha caso a Hostinger escape caracteres especiais
let dbPassword = process.env.DB_PASS || ''
dbPassword = dbPassword.replace(/\\([{}>\[\]&%*+])/g, '$1')
if (dbPassword.startsWith("'") && dbPassword.endsWith("'")) {
    dbPassword = dbPassword.slice(1, -1)
}
if (dbPassword.startsWith('"') && dbPassword.endsWith('"')) {
    dbPassword = dbPassword.slice(1, -1)
}
const { Pool } = pg
const dbPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: dbPassword,
    ssl: { rejectUnauthorized: false }
})

const app = express()

// Configuração do CORS - Em produção, pode ser mais restrito
app.use(cors())
app.use(express.json())

// Servir arquivos estáticos do frontend (pasta dist)
// Em produção, a pasta dist estará um nível acima da pasta server ou no mesmo nível
app.use(express.static(path.join(__dirname, '../dist')))

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

// ======================== ENDPOINT: Login ========================
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' })
        }

        const query = 'SELECT id, name, email, password_hash, role, status, estipulantes_permitidas FROM portal_boon.users WHERE email = $1'
        const result = await dbPool.query(query, [email])

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'E-mail ou senha inválidos.' })
        }

        const user = result.rows[0]

        if (user.status !== 'active') {
            return res.status(403).json({ error: 'Esta conta está desativada.' })
        }

        const match = await bcrypt.compare(password, user.password_hash)

        if (!match) {
            return res.status(401).json({ error: 'E-mail ou senha inválidos.' })
        }

        // Remover o hash da senha antes de enviar para o cliente
        delete user.password_hash
        res.json({ success: true, user })

    } catch (error) {
        console.error('Login error:', error)
        res.status(500).json({ error: 'Erro interno no servidor ao processar o login.' })
    }
})

// ======================== ENDPOINT: Usuários CRUD ========================
app.get('/api/users', async (req, res) => {
    try {
        const query = 'SELECT id, name, email, role, status, groups, rls_mapping as "rlsMapping", allowed_dashboards as "allowedDashboards", company_id as "companyId", estipulantes_permitidas as "estipulantesPermitidas", created_at FROM portal_boon.users ORDER BY id DESC'
        const result = await dbPool.query(query)
        res.json({ success: true, users: result.rows })
    } catch (error) {
        console.error('List users error:', error)
        res.status(500).json({ error: 'Erro ao listar usuários.' })
    }
})

app.post('/api/users', async (req, res) => {
    try {
        const { name, email, password, role, status, groups, rlsMapping, allowedDashboards, companyId, estipulantesPermitidas } = req.body
        if (!name || !email) {
            return res.status(400).json({ error: 'Nome e email são obrigatórios.' })
        }
        const check = await dbPool.query('SELECT id FROM portal_boon.users WHERE email = $1', [email])
        if (check.rows.length > 0) {
            return res.status(400).json({ error: 'E-mail já está em uso.' })
        }

        const pwd = password || '123'
        const hashed = await bcrypt.hash(pwd, 10)

        const g = JSON.stringify(groups || [])
        const rls = JSON.stringify(rlsMapping || {})
        const ad = JSON.stringify(allowedDashboards || [])
        const ep = JSON.stringify(estipulantesPermitidas || [])

        const insert = `
            INSERT INTO portal_boon.users (name, email, password_hash, role, status, groups, rls_mapping, allowed_dashboards, company_id, estipulantes_permitidas)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, name, email, role, status, groups, rls_mapping as "rlsMapping", allowed_dashboards as "allowedDashboards", company_id as "companyId", estipulantes_permitidas as "estipulantesPermitidas", created_at
        `
        const values = [name, email, hashed, role || 'user', status || 'active', g, rls, ad, companyId || null, ep]
        const result = await dbPool.query(insert, values)

        res.json({ success: true, user: result.rows[0] })
    } catch (error) {
        console.error('Create user error:', error)
        res.status(500).json({ error: 'Erro ao criar usuário.' })
    }
})

app.put('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params
        const { name, email, password, role, status, groups, rlsMapping, allowedDashboards, companyId, estipulantesPermitidas } = req.body

        const user = await dbPool.query('SELECT * FROM portal_boon.users WHERE id = $1', [id])
        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado.' })
        }

        let hashed = user.rows[0].password_hash
        if (password) {
            hashed = await bcrypt.hash(password, 10)
        }

        const g = JSON.stringify(groups || [])
        const rls = JSON.stringify(rlsMapping || {})
        const ad = JSON.stringify(allowedDashboards || [])
        const ep = JSON.stringify(estipulantesPermitidas || [])

        const update = `
            UPDATE portal_boon.users
            SET name = $1, email = $2, password_hash = $3, role = $4, status = $5, groups = $6, rls_mapping = $7, allowed_dashboards = $8, company_id = $9, estipulantes_permitidas = $10
            WHERE id = $11
            RETURNING id, name, email, role, status, groups, rls_mapping as "rlsMapping", allowed_dashboards as "allowedDashboards", company_id as "companyId", estipulantes_permitidas as "estipulantesPermitidas", created_at
        `
        const values = [name, email, hashed, role, status, g, rls, ad, companyId || null, ep, id]
        const result = await dbPool.query(update, values)

        res.json({ success: true, user: result.rows[0] })
    } catch (error) {
        console.error('Update user error:', error)
        res.status(500).json({ error: 'Erro ao atualizar usuário.' })
    }
})

app.delete('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params
        await dbPool.query('DELETE FROM portal_boon.users WHERE id = $1', [id])
        res.json({ success: true })
    } catch (error) {
        console.error('Delete user error:', error)
        res.status(500).json({ error: 'Erro ao excluir usuário.' })
    }
})

// ======================== ENDPOINT: Redefinir Senha ========================
app.post('/api/users/:id/reset-password', async (req, res) => {
    try {
        const { id } = req.params
        const { password } = req.body

        if (!password || password.length < 4) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres.' })
        }

        const user = await dbPool.query('SELECT id FROM portal_boon.users WHERE id = $1', [id])
        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado.' })
        }

        const hashed = await bcrypt.hash(password, 10)
        await dbPool.query('UPDATE portal_boon.users SET password_hash = $1 WHERE id = $2', [hashed, id])

        res.json({ success: true, message: 'Senha redefinida com sucesso.' })
    } catch (error) {
        console.error('Reset password error:', error)
        res.status(500).json({ error: 'Erro ao redefinir senha.' })
    }
})

// ======================== ENDPOINT: Enviar Senha por E-mail ========================
app.post('/api/users/:id/send-password-email', async (req, res) => {
    try {
        const { id } = req.params

        const userResult = await dbPool.query('SELECT id, name, email FROM portal_boon.users WHERE id = $1', [id])
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado.' })
        }

        const user = userResult.rows[0]

        // Gerar senha temporária aleatória
        const tempPassword = crypto.randomBytes(4).toString('hex') // 8 caracteres
        const hashed = await bcrypt.hash(tempPassword, 10)
        await dbPool.query('UPDATE portal_boon.users SET password_hash = $1 WHERE id = $2', [hashed, id])

        // Configurar transporte de e-mail
        const transporter = createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        })

        // Enviar e-mail
        await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: user.email,
            subject: 'Boon 360º - Sua nova senha de acesso',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #6b21a8;">Boon 360º</h2>
                    <p>Olá <strong>${user.name}</strong>,</p>
                    <p>Uma nova senha temporária foi gerada para sua conta:</p>
                    <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #6b21a8;">${tempPassword}</span>
                    </div>
                    <p>Recomendamos que você altere sua senha após o primeiro acesso.</p>
                    <p style="color: #9ca3af; font-size: 12px;">Este é um e-mail automático, não responda.</p>
                </div>
            `
        })

        res.json({ success: true, message: 'Senha temporária enviada por e-mail.' })
    } catch (error) {
        console.error('Send password email error:', error)
        res.status(500).json({ error: 'Erro ao enviar e-mail. Verifique as configurações SMTP.' })
    }
})

// ======================== ENDPOINT: Dashboards CRUD ========================
app.get('/api/dashboards', async (req, res) => {
    try {
        const query = 'SELECT id, name, description, category, url, workspace_id as "workspaceId", report_id as "reportId", group_id as "groupId", display_order as "order", active, visibility, groups, users, pinned, type, rls_roles as "rlsRoles", last_update as "lastUpdate", created_at as "createdAt", COALESCE(system_protected, false) as "systemProtected" FROM portal_boon.dashboards ORDER BY display_order ASC, id DESC'
        const result = await dbPool.query(query)
        res.json({ success: true, dashboards: result.rows })
    } catch (error) {
        console.error('List dashboards error:', error)
        res.status(500).json({ error: 'Erro ao listar dashboards.' })
    }
})

app.post('/api/dashboards', async (req, res) => {
    try {
        const { name, description, category, url, workspaceId, reportId, groupId, order, active, visibility, groups, users, pinned, type, rlsRoles } = req.body
        const insert = `
            INSERT INTO portal_boon.dashboards (name, description, category, url, workspace_id, report_id, group_id, display_order, active, visibility, groups, users, pinned, type, rls_roles)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id, name, description, category, url, workspace_id as "workspaceId", report_id as "reportId", group_id as "groupId", display_order as "order", active, visibility, groups, users, pinned, type, rls_roles as "rlsRoles", last_update as "lastUpdate", created_at as "createdAt"
        `
        const values = [name, description, category, url, workspaceId, reportId, groupId, order, active, visibility, JSON.stringify(groups || []), JSON.stringify(users || []), pinned, type || 'powerbi', JSON.stringify(rlsRoles || [])]
        const result = await dbPool.query(insert, values)
        res.json({ success: true, dashboard: result.rows[0] })
    } catch (error) {
        console.error('Create dashboard error:', error)
        res.status(500).json({ error: 'Erro ao criar dashboard.' })
    }
})

app.put('/api/dashboards/:id', async (req, res) => {
    try {
        const { id } = req.params
        const { name, description, category, url, workspaceId, reportId, groupId, order, active, visibility, groups, users, pinned, type, rlsRoles } = req.body
        const update = `
            UPDATE portal_boon.dashboards
            SET name = $1, description = $2, category = $3, url = $4, workspace_id = $5, report_id = $6, group_id = $7, display_order = $8, active = $9, visibility = $10, groups = $11, users = $12, pinned = $13, type = $14, rls_roles = $15, last_update = CURRENT_TIMESTAMP
            WHERE id = $16
            RETURNING id, name, description, category, url, workspace_id as "workspaceId", report_id as "reportId", group_id as "groupId", display_order as "order", active, visibility, groups, users, pinned, type, rls_roles as "rlsRoles", last_update as "lastUpdate", created_at as "createdAt"
        `
        const values = [name, description, category, url, workspaceId, reportId, groupId, order, active, visibility, JSON.stringify(groups || []), JSON.stringify(users || []), pinned, type || 'powerbi', JSON.stringify(rlsRoles || []), id]
        const result = await dbPool.query(update, values)
        res.json({ success: true, dashboard: result.rows[0] })
    } catch (error) {
        console.error('Update dashboard error:', error)
        res.status(500).json({ error: 'Erro ao atualizar dashboard.' })
    }
})

app.delete('/api/dashboards/:id', async (req, res) => {
    try {
        const { id } = req.params
        const check = await dbPool.query('SELECT system_protected FROM portal_boon.dashboards WHERE id = $1', [id])
        if (check.rows.length > 0 && check.rows[0].system_protected) {
            return res.status(403).json({ error: 'Este dashboard é protegido pelo sistema e não pode ser excluído.' })
        }
        await dbPool.query('DELETE FROM portal_boon.dashboards WHERE id = $1', [id])
        res.json({ success: true })
    } catch (error) {
        console.error('Delete dashboard error:', error)
        res.status(500).json({ error: 'Erro ao excluir dashboard.' })
    }
})

// ======================== ENDPOINT: Empresas CRUD ========================
app.get('/api/companies', async (req, res) => {
    try {
        const result = await dbPool.query('SELECT id, name, active, created_at as "createdAt" FROM portal_boon.companies ORDER BY name ASC')
        res.json({ success: true, companies: result.rows })
    } catch (error) {
        console.error('List companies error:', error)
        res.status(500).json({ error: 'Erro ao listar empresas.' })
    }
})

app.post('/api/companies', async (req, res) => {
    try {
        const { name, active } = req.body
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Nome da empresa é obrigatório.' })
        }
        const check = await dbPool.query('SELECT id FROM portal_boon.companies WHERE name = $1', [name.trim()])
        if (check.rows.length > 0) {
            return res.status(400).json({ error: 'Empresa já cadastrada.' })
        }
        const result = await dbPool.query(
            'INSERT INTO portal_boon.companies (name, active) VALUES ($1, $2) RETURNING id, name, active, created_at as "createdAt"',
            [name.trim(), active !== false]
        )
        res.json({ success: true, company: result.rows[0] })
    } catch (error) {
        console.error('Create company error:', error)
        res.status(500).json({ error: 'Erro ao criar empresa.' })
    }
})

app.put('/api/companies/:id', async (req, res) => {
    try {
        const { id } = req.params
        const { name, active } = req.body
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Nome da empresa é obrigatório.' })
        }
        const result = await dbPool.query(
            'UPDATE portal_boon.companies SET name = $1, active = $2 WHERE id = $3 RETURNING id, name, active, created_at as "createdAt"',
            [name.trim(), active !== false, id]
        )
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Empresa não encontrada.' })
        }
        res.json({ success: true, company: result.rows[0] })
    } catch (error) {
        console.error('Update company error:', error)
        res.status(500).json({ error: 'Erro ao atualizar empresa.' })
    }
})

app.delete('/api/companies/:id', async (req, res) => {
    try {
        const { id } = req.params
        await dbPool.query('UPDATE portal_boon.users SET company_id = NULL WHERE company_id = $1', [id])
        await dbPool.query('DELETE FROM portal_boon.companies WHERE id = $1', [id])
        res.json({ success: true })
    } catch (error) {
        console.error('Delete company error:', error)
        res.status(500).json({ error: 'Erro ao excluir empresa.' })
    }
})

// ======================== ENDPOINTS: Metadados ========================
app.get('/api/categories', async (req, res) => {
    try {
        const result = await dbPool.query('SELECT * FROM portal_boon.categories ORDER BY name')
        res.json({ success: true, categories: result.rows })
    } catch (error) {
        res.status(500).json({ error: 'Erro ao listar categorias.' })
    }
})

app.get('/api/groups', async (req, res) => {
    try {
        const result = await dbPool.query('SELECT * FROM portal_boon.groups ORDER BY name')
        res.json({ success: true, groups: result.rows.map(r => r.name) })
    } catch (error) {
        res.status(500).json({ error: 'Erro ao listar grupos.' })
    }
})

// ======================== ENDPOINT: Buscar Opções Únicas de Filtro ========================
app.get('/api/ativacoes/opcoes', async (req, res) => {
    try {
        console.log("Recebendo request OPCOES com filtros:", req.query);
        const { estipulante, subEstipulante, ativo, titular, dataAtivacao, grauParentesco } = req.query;

        const buildOptionsQuery = (columnName) => {
            let query = `SELECT DISTINCT "${columnName}" FROM portal_boon.ativacoes WHERE "${columnName}" IS NOT NULL`;
            const values = [];
            let paramIndex = 1;

            if (estipulante && columnName !== 'NomeEstipulante') {
                query += ` AND LOWER("NomeEstipulante") = LOWER($${paramIndex})`;
                values.push(estipulante);
                paramIndex++;
            }
            if (subEstipulante && columnName !== 'NomeSubestipulante') {
                query += ` AND LOWER("NomeSubestipulante") = LOWER($${paramIndex})`;
                values.push(subEstipulante);
                paramIndex++;
            }
            if (ativo !== undefined && ativo !== '') {
                query += ` AND CAST("AtivoBotmaker" AS TEXT) ILIKE $${paramIndex}`;
                values.push(`%${ativo}%`);
                paramIndex++;
            }
            if (titular && columnName !== 'NomeTitular') {
                query += ` AND "NomeTitular" ILIKE $${paramIndex}`;
                values.push(`%${titular}%`);
                paramIndex++;
            }
            if (dataAtivacao) {
                query += ` AND TO_DATE("DataCriacaoBotmaker", 'DD-MM-YYYY HH24:MI:SS') >= $${paramIndex}`;
                values.push(dataAtivacao);
                paramIndex++;
            }
            if (grauParentesco && columnName !== 'GrauParentesco') {
                query += ` AND "GrauParentesco" ILIKE $${paramIndex}`;
                values.push(`%${grauParentesco}%`);
                paramIndex++;
            }

            query += ` ORDER BY "${columnName}"`;
            return { query, values };
        };

        const qEstipulantes = buildOptionsQuery('NomeEstipulante');
        const qSubEstipulantes = buildOptionsQuery('NomeSubestipulante');
        const qGraus = buildOptionsQuery('GrauParentesco');
        const qTitulares = buildOptionsQuery('NomeTitular');

        const [estipulantes, subEstipulantes, grausParentesco, nomesTitulares] = await Promise.all([
            dbPool.query(qEstipulantes.query, qEstipulantes.values),
            dbPool.query(qSubEstipulantes.query, qSubEstipulantes.values),
            dbPool.query(qGraus.query, qGraus.values),
            dbPool.query(qTitulares.query, qTitulares.values)
        ]);

        res.json({
            estipulantes: estipulantes.rows.map(r => r.NomeEstipulante),
            subEstipulantes: subEstipulantes.rows.map(r => r.NomeSubestipulante),
            grausParentesco: grausParentesco.rows.map(r => r.GrauParentesco),
            titulares: nomesTitulares.rows.map(r => r.NomeTitular),
        });
    } catch (error) {
        console.error('API Options error:', error);
        res.status(500).json({ error: 'Erro ao buscar opções de filtro' });
    }
});

// ======================== ENDPOINT: Ativações ========================
app.get('/api/ativacoes', async (req, res) => {
    try {
        const { estipulante, subEstipulante, ativo, titular, dataAtivacao, grauParentesco } = req.query;

        const pageNum = parseInt(req.query.page) || 1;
        const limitNum = parseInt(req.query.limit) || 100;
        const offsetNum = (pageNum - 1) * limitNum;

        let query = `
            SELECT 
                "NomeEstipulante",
                "CNPJEstipulante",
                "NomeSubestipulante",
                "GrauParentesco",
                "NomeCompleto",
                "NomeTitular",
                "CPF",
                "CPFTitular",
                "Contato",
                "AtivoBotmaker",
                "DataCriacaoBotmaker",
                COUNT(*) OVER() as "TotalCount",
                SUM(CASE WHEN "AtivoBotmaker" = 'Sim' THEN 1 ELSE 0 END) OVER() as "AtivosCount"
            FROM portal_boon.ativacoes
            WHERE 1=1
        `;
        const values = [];
        let paramIndex = 1;

        if (estipulante) {
            query += ` AND LOWER("NomeEstipulante") = LOWER($${paramIndex})`;
            values.push(estipulante);
            paramIndex++;
        }
        if (subEstipulante) {
            query += ` AND LOWER("NomeSubestipulante") = LOWER($${paramIndex})`;
            values.push(subEstipulante);
            paramIndex++;
        }
        if (ativo !== undefined && ativo !== '') {
            query += ` AND CAST("AtivoBotmaker" AS TEXT) ILIKE $${paramIndex}`;
            values.push(`%${ativo}%`);
            paramIndex++;
        }
        if (titular) {
            query += ` AND "NomeTitular" ILIKE $${paramIndex}`;
            values.push(`%${titular}%`);
            paramIndex++;
        }
        if (dataAtivacao) {
            query += ` AND TO_DATE("DataCriacaoBotmaker", 'DD-MM-YYYY HH24:MI:SS') >= $${paramIndex}`;
            values.push(dataAtivacao);
            paramIndex++;
        }
        if (grauParentesco) {
            query += ` AND "GrauParentesco" ILIKE $${paramIndex}`;
            values.push(`%${grauParentesco}%`);
            paramIndex++;
        }

        query += ` ORDER BY "DataCriacaoBotmaker" DESC NULLS LAST, "NomeCompleto" ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limitNum, offsetNum);

        const result = await dbPool.query(query, values);

        let total = 0;
        let ativos = 0;
        if (result.rows.length > 0) {
            total = parseInt(result.rows[0].TotalCount, 10);
            ativos = parseInt(result.rows[0].AtivosCount, 10);
        } else if (!estipulante && !subEstipulante && !ativo && !titular && !dataAtivacao && pageNum === 1) {
            // Optional fallback if no filters applied and empty table, counts are 0 anyway.
        }

        res.json({
            data: result.rows,
            total,
            ativos,
            page: pageNum,
            limit: limitNum
        });
    } catch (error) {
        console.error('Database query error:', error);
        res.status(500).json({ error: 'Erro ao buscar ativações' });
    }
})

// ======================== ENDPOINT: Exportar Ativações (todos os registros filtrados) ========================
app.get('/api/ativacoes/export', async (req, res) => {
    try {
        const { estipulante, subEstipulante, ativo, titular, dataAtivacao, grauParentesco } = req.query;

        let query = `
            SELECT
                "NomeEstipulante",
                "CNPJEstipulante",
                "NomeSubestipulante",
                "GrauParentesco",
                "NomeCompleto",
                "NomeTitular",
                "CPF",
                "CPFTitular",
                "Contato",
                "AtivoBotmaker",
                "DataCriacaoBotmaker"
            FROM portal_boon.ativacoes
            WHERE 1=1
        `;
        const values = [];
        let paramIndex = 1;

        if (estipulante) {
            query += ` AND LOWER("NomeEstipulante") = LOWER($${paramIndex})`;
            values.push(estipulante);
            paramIndex++;
        }
        if (subEstipulante) {
            query += ` AND LOWER("NomeSubestipulante") = LOWER($${paramIndex})`;
            values.push(subEstipulante);
            paramIndex++;
        }
        if (ativo !== undefined && ativo !== '') {
            query += ` AND CAST("AtivoBotmaker" AS TEXT) ILIKE $${paramIndex}`;
            values.push(`%${ativo}%`);
            paramIndex++;
        }
        if (titular) {
            query += ` AND "NomeTitular" ILIKE $${paramIndex}`;
            values.push(`%${titular}%`);
            paramIndex++;
        }
        if (dataAtivacao) {
            query += ` AND TO_DATE("DataCriacaoBotmaker", 'DD-MM-YYYY HH24:MI:SS') >= $${paramIndex}`;
            values.push(dataAtivacao);
            paramIndex++;
        }
        if (grauParentesco) {
            query += ` AND "GrauParentesco" ILIKE $${paramIndex}`;
            values.push(`%${grauParentesco}%`);
            paramIndex++;
        }

        query += ` ORDER BY "DataCriacaoBotmaker" DESC NULLS LAST, "NomeCompleto" ASC`;

        const result = await dbPool.query(query, values);
        res.json(result.rows);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Erro ao exportar ativações' });
    }
})

// ======================== ENDPOINT: Atualizar Ativações (Sync Python) ========================
app.post('/api/ativacoes/sync', async (req, res) => {
    try {
        const pythonScriptPath = path.resolve(__dirname, '../tabela_ativacoes_portalboon.py');
        const syncFilePath = path.resolve(__dirname, 'last_sync.json');

        exec(`"${PYTHON_EXE}" "${pythonScriptPath}"`, { env: PYTHON_ENV }, async (error, stdout, stderr) => {
            if (error) {
                console.error('Erro na execução do script Python:', error);
                return res.status(500).json({ error: 'Falha ao executar a atualização de dados.' });
            }

            // Sucesso, salvar a data e hora
            const now = new Date().toISOString();
            await fs.writeFile(syncFilePath, JSON.stringify({ lastSync: now }));

            res.json({ message: 'Dados atualizados com sucesso.', lastSync: now, stdout });
        });
    } catch (err) {
        console.error('Sync process error:', err);
        res.status(500).json({ error: 'Erro interno ao iniciar a atualização.' });
    }
});

app.get('/api/ativacoes/last-sync', async (req, res) => {
    try {
        const syncFilePath = path.resolve(__dirname, 'last_sync.json');
        const data = await fs.readFile(syncFilePath, 'utf-8');
        res.json(JSON.parse(data));
    } catch (err) {
        // Se o arquivo não existir, não é um erro fatal
        res.json({ lastSync: null });
    }
});

// ======================== AGENDAMENTOS qBem ========================

// Estado dos jobs em memória
const jobStatus = {
    import_contratos: { running: false, lastRun: null, lastResult: null, output: '' },
    import_beneficiarios: { running: false, lastRun: null, lastResult: null, output: '' },
    import_beneficiarios_alterados: { running: false, lastRun: null, lastResult: null, output: '' },
    tabela_ativacoes: { running: false, lastRun: null, lastResult: null, output: '' },
    botmaker_full: { running: false, lastRun: null, lastResult: null, output: '' },
    botmaker_3dias: { running: false, lastRun: null, lastResult: null, output: '' },
    moderna_atendimentos: { running: false, lastRun: null, lastResult: null, output: '' },
    moderna_atendimentos_full: { running: false, lastRun: null, lastResult: null, output: '' }
}

// Carregar último status salvo
const jobStatusFile = path.resolve(__dirname, 'job_status.json')
try {
    const saved = JSON.parse(await fs.readFile(jobStatusFile, 'utf-8'))
    for (const key of Object.keys(jobStatus)) {
        if (saved[key]) {
            jobStatus[key].lastRun = saved[key].lastRun
            jobStatus[key].lastResult = saved[key].lastResult
        }
    }
} catch { /* arquivo ainda não existe */ }

async function saveJobStatus() {
    const toSave = {}
    for (const [key, val] of Object.entries(jobStatus)) {
        toSave[key] = { lastRun: val.lastRun, lastResult: val.lastResult }
    }
    await fs.writeFile(jobStatusFile, JSON.stringify(toSave, null, 2))
}

function runScript(scriptName) {
    const job = jobStatus[scriptName]
    if (job.running) return null

    const scriptPath = path.resolve(__dirname, 'scripts', `${scriptName}.py`)
    job.running = true
    job.output = ''
    job.lastResult = null

    // -u = unbuffered para output em tempo real
    const proc = exec(`"${PYTHON_EXE}" -u "${scriptPath}"`, { timeout: 3600000, env: PYTHON_ENV })

    proc.stdout.on('data', (data) => { job.output += data.toString() })
    proc.stderr.on('data', (data) => { job.output += data.toString() })

    const promise = new Promise((resolve) => {
        proc.on('close', async (code) => {
            job.running = false
            job.lastRun = new Date().toISOString()
            job.lastResult = code === 0 ? 'success' : 'error'
            await saveJobStatus()
            resolve(code)
        })
    })

    return promise

    return true
}

// Listar status de todos os jobs
app.get('/api/jobs', (req, res) => {
    const result = {}
    for (const [key, val] of Object.entries(jobStatus)) {
        result[key] = {
            running: val.running,
            lastRun: val.lastRun,
            lastResult: val.lastResult
        }
    }
    res.json(result)
})

// Executar um job
app.post('/api/jobs/:name/run', (req, res) => {
    const { name } = req.params
    if (!jobStatus[name]) {
        return res.status(404).json({ error: 'Job não encontrado.' })
    }
    if (jobStatus[name].running) {
        return res.status(409).json({ error: 'Job já está em execução.' })
    }
    runScript(name)
    res.json({ message: `Job ${name} iniciado.` })
})

// Ver output em tempo real de um job
app.get('/api/jobs/:name/output', (req, res) => {
    const { name } = req.params
    if (!jobStatus[name]) {
        return res.status(404).json({ error: 'Job não encontrado.' })
    }
    res.json({
        running: jobStatus[name].running,
        output: jobStatus[name].output,
        lastRun: jobStatus[name].lastRun,
        lastResult: jobStatus[name].lastResult
    })
})

// Executar cadeia de jobs (um após o outro)
app.post('/api/jobs/chain', async (req, res) => {
    const { jobs: jobNames } = req.body
    if (!Array.isArray(jobNames) || jobNames.length === 0) {
        return res.status(400).json({ error: 'Envie um array de jobs.' })
    }
    // Verifica se algum já está rodando
    for (const name of jobNames) {
        if (!jobStatus[name]) return res.status(404).json({ error: `Job ${name} não encontrado.` })
        if (jobStatus[name].running) return res.status(409).json({ error: `Job ${name} já está em execução.` })
    }
    // Inicia o primeiro e encadeia os demais em background
    res.json({ message: `Cadeia iniciada: ${jobNames.join(' → ')}` })

    for (const name of jobNames) {
        console.log(`[CHAIN] Executando ${name}...`)
        const promise = runScript(name)
        if (promise) {
            const code = await promise
            if (code !== 0) {
                console.log(`[CHAIN] ${name} falhou (code ${code}). Parando cadeia.`)
                break
            }
        }
    }
    console.log('[CHAIN] Cadeia finalizada.')
})

// ======================== CRON - Agendamentos Automáticos (PostgreSQL) ========================

const activeCrons = {}
let schedules = {}

// Criar tabela de agendamentos se não existir + seed com valores padrão
async function initSchedulesTable() {
    const client = await dbPool.connect()
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS portal_boon.schedules (
                job_name VARCHAR(100) PRIMARY KEY,
                enabled BOOLEAN DEFAULT true,
                times JSONB DEFAULT '[]'::jsonb,
                updated_at TIMESTAMP DEFAULT NOW(),
                updated_by VARCHAR(200)
            );
        `)
        // Seed: insere padrão apenas se tabela estiver vazia
        const { rowCount } = await client.query('SELECT 1 FROM portal_boon.schedules LIMIT 1')
        if (rowCount === 0) {
            await client.query(`
                INSERT INTO portal_boon.schedules (job_name, enabled, times) VALUES
                ('import_contratos', true, '["08:30","12:30"]'::jsonb),
                ('import_beneficiarios_alterados', true, '["08:30","12:30"]'::jsonb)
            `)
        }
    } finally {
        client.release()
    }
}

async function loadSchedules() {
    const { rows } = await dbPool.query('SELECT job_name, enabled, times FROM portal_boon.schedules')
    schedules = {}
    for (const row of rows) {
        schedules[row.job_name] = { enabled: row.enabled, times: row.times }
    }
    return schedules
}

async function saveSchedule(jobName, enabled, times, updatedBy) {
    await dbPool.query(`
        INSERT INTO portal_boon.schedules (job_name, enabled, times, updated_at, updated_by)
        VALUES ($1, $2, $3::jsonb, NOW(), $4)
        ON CONFLICT (job_name) DO UPDATE SET
            enabled = EXCLUDED.enabled,
            times = EXCLUDED.times,
            updated_at = NOW(),
            updated_by = EXCLUDED.updated_by
    `, [jobName, enabled, JSON.stringify(times), updatedBy])
}

function setupCrons() {
    // Limpa todos os crons ativos
    for (const tasks of Object.values(activeCrons)) {
        tasks.forEach(t => t.stop())
    }
    for (const key of Object.keys(activeCrons)) {
        delete activeCrons[key]
    }

    // Recria os crons baseado na configuração
    for (const [jobName, config] of Object.entries(schedules)) {
        if (!config.enabled || !jobStatus[jobName]) continue
        activeCrons[jobName] = []

        for (const time of config.times) {
            const [hour, minute] = time.split(':')
            const cronExpr = `${minute} ${hour} * * *`
            const task = cron.schedule(cronExpr, () => {
                console.log(`[CRON] Executando ${jobName} às ${time}`)
                runScript(jobName)
            }, { timezone: 'America/Sao_Paulo' })
            activeCrons[jobName].push(task)
        }

        console.log(`[CRON] ${jobName}: ${config.times.join(', ')}`)
    }
}

// Inicializa tabela e crons
await initSchedulesTable()
await loadSchedules()
setupCrons()

// Listar agendamentos
app.get('/api/schedules', async (req, res) => {
    try {
        await loadSchedules()
        res.json(schedules)
    } catch (err) {
        console.error('Erro ao buscar agendamentos:', err)
        res.status(500).json({ error: 'Erro ao buscar agendamentos.' })
    }
})

// Atualizar agendamento de um job
app.put('/api/schedules/:name', async (req, res) => {
    const { name } = req.params
    if (!jobStatus[name]) {
        return res.status(404).json({ error: 'Job não encontrado.' })
    }
    const { enabled, times, updatedBy } = req.body
    const newEnabled = enabled !== undefined ? enabled : (schedules[name]?.enabled ?? false)
    const newTimes = times || schedules[name]?.times || []

    try {
        await saveSchedule(name, newEnabled, newTimes, updatedBy || null)
        await loadSchedules()
        setupCrons()
        res.json({ message: 'Agendamento atualizado.', schedule: schedules[name] })
    } catch (err) {
        console.error('Erro ao salvar agendamento:', err)
        res.status(500).json({ error: 'Erro ao salvar agendamento.' })
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

// ---- SLA Amar & Cuidar ----
app.get('/api/sla-amar-cuidar', async (req, res) => {
    try {
        const result = await dbPool.query(
            'SELECT * FROM portal_boon.sla_amar_cuidar ORDER BY data_inicio DESC, id DESC'
        )
        res.json(result.rows)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.post('/api/sla-amar-cuidar', async (req, res) => {
    try {
        const { tema, grau_risco, sla_dias, data_inicio, force, usuario_id, usuario_nome, visivel } = req.body
        if (!tema || !grau_risco || !sla_dias || !data_inicio) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios.' })
        }
        // Verifica se já existe SLA vigente com mesmo tema + grau_risco
        const vigente = await dbPool.query(
            `SELECT * FROM portal_boon.sla_amar_cuidar WHERE tema ILIKE $1 AND grau_risco ILIKE $2 AND data_fim IS NULL`,
            [tema.trim(), grau_risco.trim()]
        )
        if (vigente.rows.length > 0 && !force) {
            const v = vigente.rows[0]
            return res.status(409).json({
                conflict: true,
                vigente: v,
                message: `Já existe um SLA vigente para "${v.tema}" com grau "${v.grau_risco}" (${v.sla_dias} dias, início em ${new Date(v.data_inicio).toLocaleDateString('pt-BR')}). Encerre a vigência atual antes de cadastrar um novo.`
            })
        }
        if (force) {
            // Encerra registros vigentes com mesmo tema + grau_risco
            await dbPool.query(
                `UPDATE portal_boon.sla_amar_cuidar SET data_fim = ($1::date - INTERVAL '1 day')::date, updated_at = NOW()
                 WHERE tema ILIKE $2 AND grau_risco ILIKE $3 AND data_fim IS NULL`,
                [data_inicio, tema.trim(), grau_risco.trim()]
            )
        }
        const result = await dbPool.query(
            `INSERT INTO portal_boon.sla_amar_cuidar (tema, grau_risco, sla_dias, data_inicio, data_fim, usuario_id, usuario_nome, visivel)
             VALUES ($1, $2, $3, $4, NULL, $5, $6, $7) RETURNING *`,
            [tema.trim(), grau_risco.trim(), sla_dias, data_inicio, usuario_id || null, usuario_nome || null, visivel !== false]
        )
        res.json({ success: true, sla: result.rows[0] })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.put('/api/sla-amar-cuidar/:id', async (req, res) => {
    try {
        const { id } = req.params
        const { tema, grau_risco, sla_dias, data_inicio, data_fim, usuario_id, usuario_nome, visivel } = req.body
        const result = await dbPool.query(
            `UPDATE portal_boon.sla_amar_cuidar SET tema=$1, grau_risco=$2, sla_dias=$3, data_inicio=$4, data_fim=$5, modificado_por_id=$6, modificado_por_nome=$7, visivel=$8, updated_at=NOW()
             WHERE id=$9 RETURNING *`,
            [tema, grau_risco, sla_dias, data_inicio, data_fim || null, usuario_id || null, usuario_nome || null, visivel !== false, id]
        )
        if (result.rows.length === 0) return res.status(404).json({ error: 'Registro não encontrado.' })
        res.json({ success: true, sla: result.rows[0] })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.delete('/api/sla-amar-cuidar/:id', async (req, res) => {
    try {
        const result = await dbPool.query('DELETE FROM portal_boon.sla_amar_cuidar WHERE id=$1 RETURNING *', [req.params.id])
        if (result.rows.length === 0) return res.status(404).json({ error: 'Registro não encontrado.' })
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// ---- SLA Dashboard (View Analytics) ----
function slaFilters(req) {
    const conditions = []
    const params = []
    if (req.query.data_ini) { conditions.push(`data_atendimento >= $${params.length + 1}::date`); params.push(req.query.data_ini) }
    if (req.query.data_fim) { conditions.push(`data_atendimento <= $${params.length + 1}::date + INTERVAL '1 day' - INTERVAL '1 second'`); params.push(req.query.data_fim) }
    if (req.query.estipulante) { conditions.push(`estipulante_razao = $${params.length + 1}`); params.push(req.query.estipulante) }
    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''
    return { where, params }
}

function slaWhere(req, extra) {
    const { where, params } = slaFilters(req)
    if (!extra) return { where, params }
    if (where) return { where: where + ' AND ' + extra, params }
    return { where: ' WHERE ' + extra, params }
}

app.get('/api/sla-dashboard/kpis', async (req, res) => {
    try {
        const v = 'portal_boon.vw_sla_atendimentos'
        const { where: w, params: p } = slaFilters(req)
        const total = (await dbPool.query(`SELECT COUNT(*) FROM ${v}${w}`, p)).rows[0].count
        const { where: w2, params: p2 } = slaWhere(req, "status_sla = 'Dentro do prazo'")
        const dentro = (await dbPool.query(`SELECT COUNT(*) FROM ${v}${w2}`, p2)).rows[0].count
        const { where: w3, params: p3 } = slaWhere(req, "status_sla = 'Fora do prazo'")
        const fora = (await dbPool.query(`SELECT COUNT(*) FROM ${v}${w3}`, p3)).rows[0].count
        const { where: w4, params: p4 } = slaWhere(req, "status_sla = 'Em atendimento - Dentro do prazo'")
        const emDentro = (await dbPool.query(`SELECT COUNT(*) FROM ${v}${w4}`, p4)).rows[0].count
        const { where: w5, params: p5 } = slaWhere(req, "status_sla = 'Em atendimento - Fora do prazo'")
        const emFora = (await dbPool.query(`SELECT COUNT(*) FROM ${v}${w5}`, p5)).rows[0].count
        const { where: w6, params: p6 } = slaWhere(req, "status_sla = 'Aguardando Cadastro de SLA'")
        const aguardando = (await dbPool.query(`SELECT COUNT(*) FROM ${v}${w6}`, p6)).rows[0].count
        const comSla = Number(dentro) + Number(fora) + Number(emDentro) + Number(emFora)
        const taxa = comSla > 0 ? Math.round(Number(dentro) / comSla * 1000) / 10 : 0
        res.json({ total: Number(total), dentro_prazo: Number(dentro), fora_prazo: Number(fora), em_atendimento_dentro: Number(emDentro), em_atendimento_fora: Number(emFora), aguardando_sla: Number(aguardando), com_sla: comSla, taxa_cumprimento: taxa })
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/por-status', async (req, res) => {
    try {
        const { where, params } = slaFilters(req)
        const rows = await dbPool.query(`SELECT status_sla, COUNT(*)::int as total FROM portal_boon.vw_sla_atendimentos${where} GROUP BY status_sla ORDER BY total DESC`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/por-assunto', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "status_sla != 'Aguardando Cadastro de SLA'")
        const rows = await dbPool.query(`SELECT assunto, COUNT(*)::int as total, SUM(CASE WHEN status_sla='Dentro do prazo' THEN 1 ELSE 0 END)::int as dentro, SUM(CASE WHEN status_sla='Fora do prazo' THEN 1 ELSE 0 END)::int as fora, SUM(CASE WHEN status_sla LIKE 'Em atendimento%' THEN 1 ELSE 0 END)::int as em_atendimento FROM portal_boon.vw_sla_atendimentos${where} GROUP BY assunto ORDER BY total DESC LIMIT 15`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/evolucao-mensal', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "status_sla != 'Aguardando Cadastro de SLA'")
        const rows = await dbPool.query(`SELECT TO_CHAR(data_atendimento, 'YYYY-MM') as mes, COUNT(*)::int as total, SUM(CASE WHEN status_sla='Dentro do prazo' THEN 1 ELSE 0 END)::int as dentro, SUM(CASE WHEN status_sla='Fora do prazo' THEN 1 ELSE 0 END)::int as fora FROM portal_boon.vw_sla_atendimentos${where} GROUP BY mes ORDER BY mes`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/top-fora-prazo', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "status_sla IN ('Fora do prazo', 'Em atendimento - Fora do prazo')")
        const rows = await dbPool.query(`SELECT assunto, COUNT(*)::int as total, ROUND(AVG(ABS(dias_restantes_sla)),1) as media_dias_atraso FROM portal_boon.vw_sla_atendimentos${where} GROUP BY assunto ORDER BY total DESC LIMIT 10`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/em-aberto', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "status_sla LIKE 'Em atendimento%'")
        const rows = await dbPool.query(`SELECT smprpac_id, smpesfis_nome, assunto, atendimento, data_prazo_sla, status_sla, dias_uteis, dias_restantes_sla, estipulante_razao, usuario FROM portal_boon.vw_sla_atendimentos${where} ORDER BY dias_restantes_sla ASC LIMIT 100`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/aguardando-cadastro', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "status_sla = 'Aguardando Cadastro de SLA' AND assunto IS NOT NULL AND assunto != ''")
        const rows = await dbPool.query(`SELECT assunto, COUNT(*)::int as total FROM portal_boon.vw_sla_atendimentos${where} GROUP BY assunto ORDER BY total DESC LIMIT 20`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/taxa-mensal', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "status_sla != 'Aguardando Cadastro de SLA'")
        const rows = await dbPool.query(`SELECT TO_CHAR(data_atendimento, 'YYYY-MM') as mes, COUNT(*)::int as total, SUM(CASE WHEN status_sla='Dentro do prazo' THEN 1 ELSE 0 END)::int as dentro, SUM(CASE WHEN status_sla='Fora do prazo' THEN 1 ELSE 0 END)::int as fora, ROUND(SUM(CASE WHEN status_sla='Dentro do prazo' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0) * 100, 1) as taxa FROM portal_boon.vw_sla_atendimentos${where} GROUP BY mes ORDER BY mes`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/por-estipulante', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "status_sla != 'Aguardando Cadastro de SLA'")
        const rows = await dbPool.query(`SELECT estipulante_razao, COUNT(*)::int as total, SUM(CASE WHEN status_sla='Dentro do prazo' THEN 1 ELSE 0 END)::int as dentro, SUM(CASE WHEN status_sla='Fora do prazo' THEN 1 ELSE 0 END)::int as fora, ROUND(SUM(CASE WHEN status_sla='Dentro do prazo' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0) * 100, 1) as taxa FROM portal_boon.vw_sla_atendimentos${where} GROUP BY estipulante_razao ORDER BY total DESC LIMIT 15`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/media-dias', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "status_sla IN ('Dentro do prazo','Fora do prazo')")
        const rows = await dbPool.query(`SELECT ROUND(AVG(dias_corridos),1) as media_geral, ROUND(AVG(CASE WHEN status_sla='Dentro do prazo' THEN dias_corridos END),1) as media_dentro, ROUND(AVG(CASE WHEN status_sla='Fora do prazo' THEN dias_corridos END),1) as media_fora, ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_corridos),1) as mediana FROM portal_boon.vw_sla_atendimentos${where}`, params)
        res.json(rows.rows[0])
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/por-usuario', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "status_sla != 'Aguardando Cadastro de SLA' AND usuario IS NOT NULL AND usuario != ''")
        const rows = await dbPool.query(`SELECT usuario, COUNT(*)::int as total, SUM(CASE WHEN status_sla='Dentro do prazo' THEN 1 ELSE 0 END)::int as dentro, SUM(CASE WHEN status_sla='Fora do prazo' THEN 1 ELSE 0 END)::int as fora, ROUND(SUM(CASE WHEN status_sla='Dentro do prazo' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0) * 100, 1) as taxa FROM portal_boon.vw_sla_atendimentos${where} GROUP BY usuario ORDER BY total DESC LIMIT 10`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

// ---- Seção Assuntos ----
app.get('/api/sla-dashboard/assuntos-volume', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "assunto IS NOT NULL AND assunto != ''")
        const rows = await dbPool.query(`SELECT assunto, COUNT(*)::int as total,
            SUM(CASE WHEN motivo_baixa='REALIZADO' THEN 1 ELSE 0 END)::int as realizados,
            SUM(CASE WHEN motivo_baixa='FALTA DO PACIENTE' THEN 1 ELSE 0 END)::int as faltas,
            SUM(CASE WHEN data_baixa IS NULL OR data_baixa='' THEN 1 ELSE 0 END)::int as abertos
            FROM portal_boon.vw_sla_atendimentos${where}
            GROUP BY assunto ORDER BY total DESC`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/por-risco', async (req, res) => {
    try {
        const { where, params } = slaFilters(req)
        const rows = await dbPool.query(`SELECT
            CASE
                WHEN assunto LIKE 'G0%' THEN 'G0'
                WHEN assunto LIKE 'G1%' THEN 'G1'
                WHEN assunto LIKE 'G2%' THEN 'G2'
                WHEN assunto LIKE 'G3%' THEN 'G3'
                WHEN assunto LIKE 'G4%' THEN 'G4'
                WHEN assunto LIKE 'G5%' THEN 'G5'
                ELSE 'Outro'
            END as grau,
            COUNT(*)::int as total,
            SUM(CASE WHEN status_sla='Dentro do prazo' THEN 1 ELSE 0 END)::int as dentro,
            SUM(CASE WHEN status_sla='Fora do prazo' THEN 1 ELSE 0 END)::int as fora,
            SUM(CASE WHEN status_sla LIKE 'Em atendimento%' THEN 1 ELSE 0 END)::int as em_atendimento,
            SUM(CASE WHEN status_sla='Aguardando Cadastro de SLA' THEN 1 ELSE 0 END)::int as sem_sla
            FROM portal_boon.vw_sla_atendimentos${where}
            GROUP BY grau ORDER BY grau`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/ranking-criticos', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "status_sla != 'Aguardando Cadastro de SLA'")
        const rows = await dbPool.query(`SELECT assunto,
            COUNT(*)::int as total,
            SUM(CASE WHEN status_sla IN ('Fora do prazo','Em atendimento - Fora do prazo') THEN 1 ELSE 0 END)::int as fora_total,
            ROUND(SUM(CASE WHEN status_sla IN ('Fora do prazo','Em atendimento - Fora do prazo') THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0) * 100, 1) as taxa_fora,
            ROUND(AVG(CASE WHEN status_sla IN ('Fora do prazo','Em atendimento - Fora do prazo') THEN ABS(dias_restantes_sla) END),1) as media_atraso
            FROM portal_boon.vw_sla_atendimentos${where}
            GROUP BY assunto HAVING SUM(CASE WHEN status_sla IN ('Fora do prazo','Em atendimento - Fora do prazo') THEN 1 ELSE 0 END) > 0
            ORDER BY fora_total DESC LIMIT 15`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/anomalias', async (req, res) => {
    try {
        const { where, params } = slaFilters(req)
        // Volume diário nos últimos 90 dias e detectar anomalias por z-score
        const rows = await dbPool.query(`SELECT data_atendimento::date as dia, COUNT(*)::int as total
            FROM portal_boon.vw_sla_atendimentos${where ? where + ' AND' : ' WHERE'} data_atendimento >= CURRENT_DATE - INTERVAL '90 days'
            GROUP BY dia ORDER BY dia`, params)
        const data = rows.rows
        if (data.length < 7) return res.json({ anomalias: [], stats: { media: 0, desvio: 0, total_anomalias: 0 } })
        const vals = data.map(r => r.total)
        const media = vals.reduce((a, b) => a + b, 0) / vals.length
        const desvio = Math.sqrt(vals.reduce((a, b) => a + Math.pow(b - media, 2), 0) / vals.length)
        const anomalias = data.filter(r => desvio > 0 && Math.abs((r.total - media) / desvio) > 2)
            .map(r => ({ dia: r.dia, total: r.total, z_score: Math.round((r.total - media) / desvio * 10) / 10, tipo: r.total > media ? 'pico' : 'queda' }))
        // Anomalias por assunto: assuntos com volume muito acima da média
        const assRows = await dbPool.query(`SELECT assunto, COUNT(*)::int as total
            FROM portal_boon.vw_sla_atendimentos${where ? where + ' AND' : ' WHERE'} data_atendimento >= CURRENT_DATE - INTERVAL '30 days' AND assunto IS NOT NULL AND assunto != ''
            GROUP BY assunto ORDER BY total DESC`, params)
        const assData = assRows.rows
        const asMedia = assData.length > 0 ? assData.reduce((a, b) => a + b.total, 0) / assData.length : 0
        const asDesvio = assData.length > 0 ? Math.sqrt(assData.reduce((a, b) => a + Math.pow(b.total - asMedia, 2), 0) / assData.length) : 0
        const assAnomalias = asDesvio > 0 ? assData.filter(r => (r.total - asMedia) / asDesvio > 1.5).map(r => ({ assunto: r.assunto, total: r.total, z_score: Math.round((r.total - asMedia) / asDesvio * 10) / 10 })) : []
        res.json({
            diario: data,
            anomalias,
            assunto_anomalias: assAnomalias,
            stats: { media: Math.round(media * 10) / 10, desvio: Math.round(desvio * 10) / 10, total_anomalias: anomalias.length, picos: anomalias.filter(a => a.tipo === 'pico').length, quedas: anomalias.filter(a => a.tipo === 'queda').length }
        })
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/previsao', async (req, res) => {
    try {
        const { where, params } = slaFilters(req)
        // Média móvel simples de 7 dias para previsão dos próximos 30 dias
        const rows = await dbPool.query(`SELECT TO_CHAR(data_atendimento, 'YYYY-MM') as mes, COUNT(*)::int as total
            FROM portal_boon.vw_sla_atendimentos${where}
            GROUP BY mes ORDER BY mes`, params)
        // Ignorar mês atual (incompleto)
        const mesAtual = new Date().toISOString().slice(0, 7)
        const data = rows.rows.filter(r => r.mes !== mesAtual)
        if (data.length < 3) return res.json({ historico: data, previsao: [], tendencia: 'insuficiente' })
        // Tendência linear simples
        const n = data.length
        const xs = data.map((_, i) => i)
        const ys = data.map(r => r.total)
        const xm = xs.reduce((a, b) => a + b, 0) / n
        const ym = ys.reduce((a, b) => a + b, 0) / n
        const slope = xs.reduce((a, x, i) => a + (x - xm) * (ys[i] - ym), 0) / xs.reduce((a, x) => a + Math.pow(x - xm, 2), 0)
        const intercept = ym - slope * xm
        // Prever 3 meses
        const previsao = []
        const lastDate = new Date(data[n - 1].mes + '-01')
        for (let i = 1; i <= 3; i++) {
            const d = new Date(lastDate)
            d.setMonth(d.getMonth() + i)
            const predicted = Math.max(0, Math.round(intercept + slope * (n - 1 + i)))
            previsao.push({ mes: d.toISOString().slice(0, 7), total: predicted })
        }
        const tendencia = slope > 1 ? 'crescente' : slope < -1 ? 'decrescente' : 'estavel'
        const mediaUlt3 = Math.round(ys.slice(-3).reduce((a, b) => a + b, 0) / 3)
        // SLA previsão
        const slaRows = await dbPool.query(`SELECT TO_CHAR(data_atendimento, 'YYYY-MM') as mes,
            ROUND(SUM(CASE WHEN status_sla='Dentro do prazo' THEN 1 ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN status_sla!='Aguardando Cadastro de SLA' THEN 1 ELSE 0 END),0) * 100, 1) as taxa
            FROM portal_boon.vw_sla_atendimentos${where}
            GROUP BY mes ORDER BY mes`, params)
        res.json({ historico: data, previsao, tendencia, slope: Math.round(slope * 10) / 10, media_ult3: mediaUlt3, sla_historico: slaRows.rows.filter(r => r.mes !== mesAtual) })
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/por-dia-semana', async (req, res) => {
    try {
        const { where, params } = slaFilters(req)
        const rows = await dbPool.query(`SELECT EXTRACT(DOW FROM data_atendimento)::int as dow, COUNT(*)::int as total FROM portal_boon.vw_sla_atendimentos${where} GROUP BY dow ORDER BY dow`, params)
        const totalGeral = rows.rows.reduce((a, r) => a + r.total, 0)
        res.json(rows.rows.map(r => ({ ...r, percentual: totalGeral > 0 ? Math.round(r.total / totalGeral * 1000) / 10 : 0 })))
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/faixa-etaria', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "idade IS NOT NULL AND idade != ''")
        const rows = await dbPool.query(`SELECT CASE
            WHEN idade::int BETWEEN 0 AND 17 THEN '0-17'
            WHEN idade::int BETWEEN 18 AND 25 THEN '18-25'
            WHEN idade::int BETWEEN 26 AND 35 THEN '26-35'
            WHEN idade::int BETWEEN 36 AND 45 THEN '36-45'
            WHEN idade::int BETWEEN 46 AND 55 THEN '46-55'
            WHEN idade::int BETWEEN 56 AND 65 THEN '56-65'
            ELSE '65+' END as faixa,
            COUNT(*)::int as total
            FROM portal_boon.vw_sla_atendimentos${where}
            GROUP BY faixa ORDER BY faixa`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/retencao', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "smpesfis_nome IS NOT NULL AND smpesfis_nome != ''")
        // Segmentos por frequência
        const seg = await dbPool.query(`SELECT CASE
            WHEN cnt = 1 THEN '1 visita'
            WHEN cnt BETWEEN 2 AND 3 THEN '2-3 visitas'
            WHEN cnt BETWEEN 4 AND 6 THEN '4-6 visitas'
            WHEN cnt BETWEEN 7 AND 12 THEN '7-12 visitas'
            ELSE '13+ visitas' END as segmento,
            COUNT(*)::int as pacientes
            FROM (SELECT smpesfis_nome, COUNT(*)::int as cnt FROM portal_boon.vw_sla_atendimentos${where} GROUP BY smpesfis_nome) sub
            GROUP BY segmento ORDER BY MIN(cnt)`, params)
        // Total pacientes e recorrentes
        const totais = await dbPool.query(`SELECT COUNT(DISTINCT smpesfis_nome)::int as total_pacientes,
            SUM(CASE WHEN cnt > 1 THEN 1 ELSE 0 END)::int as recorrentes
            FROM (SELECT smpesfis_nome, COUNT(*)::int as cnt FROM portal_boon.vw_sla_atendimentos${where} GROUP BY smpesfis_nome) sub`, params)
        const t = totais.rows[0]
        const taxa_retencao = t.total_pacientes > 0 ? Math.round(t.recorrentes / t.total_pacientes * 1000) / 10 : 0
        res.json({ segmentos: seg.rows, total_pacientes: t.total_pacientes, recorrentes: t.recorrentes, taxa_retencao })
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/utilizacao', async (req, res) => {
    try {
        const { where, params } = slaFilters(req)
        // Beneficiários por mês (pacientes únicos por mês)
        const rows = await dbPool.query(`SELECT TO_CHAR(data_atendimento, 'YYYY-MM') as mes,
            COUNT(DISTINCT smpesfis_nome)::int as beneficiarios,
            COUNT(*)::int as atendimentos,
            ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT smpesfis_nome),0), 1) as media_atend_por_benef
            FROM portal_boon.vw_sla_atendimentos${where}
            GROUP BY mes ORDER BY mes`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/previsao-assunto', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "assunto IS NOT NULL AND assunto != ''")
        const mesAtual = new Date().toISOString().slice(0, 7)
        const rows = await dbPool.query(`SELECT assunto, TO_CHAR(data_atendimento, 'YYYY-MM') as mes, COUNT(*)::int as total
            FROM portal_boon.vw_sla_atendimentos${where}
            GROUP BY assunto, mes ORDER BY assunto, mes`, params)
        // Agrupar por assunto e calcular tendência
        const byAssunto = {}
        rows.rows.forEach(r => {
            if (r.mes === mesAtual) return
            if (!byAssunto[r.assunto]) byAssunto[r.assunto] = []
            byAssunto[r.assunto].push(r)
        })
        const result = Object.entries(byAssunto).map(([assunto, meses]) => {
            if (meses.length < 3) return null
            const n = meses.length
            const ys = meses.map(m => m.total)
            const xm = (n - 1) / 2
            const ym = ys.reduce((a, b) => a + b, 0) / n
            const slope = meses.reduce((a, _, i) => a + (i - xm) * (ys[i] - ym), 0) / meses.reduce((a, _, i) => a + Math.pow(i - xm, 2), 0)
            const intercept = ym - slope * xm
            const lastDate = new Date(meses[n - 1].mes + '-01')
            const prev = []
            for (let i = 1; i <= 3; i++) {
                const dd = new Date(lastDate); dd.setMonth(dd.getMonth() + i)
                prev.push({ mes: dd.toISOString().slice(0, 7), total: Math.max(0, Math.round(intercept + slope * (n - 1 + i))) })
            }
            const mediaUlt3 = Math.round(ys.slice(-3).reduce((a, b) => a + b, 0) / 3)
            return { assunto, tendencia: slope > 1 ? 'crescente' : slope < -1 ? 'decrescente' : 'estavel', slope: Math.round(slope * 10) / 10, media_ult3: mediaUlt3, previsao: prev }
        }).filter(Boolean).sort((a, b) => b.media_ult3 - a.media_ult3).slice(0, 10)
        res.json(result)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/assunto-faixa-etaria', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "assunto IS NOT NULL AND assunto != '' AND idade IS NOT NULL AND idade != ''")
        const rows = await dbPool.query(`SELECT
            CASE WHEN assunto LIKE 'G0%' THEN 'G0' WHEN assunto LIKE 'G1%' THEN 'G1' WHEN assunto LIKE 'G2%' THEN 'G2' WHEN assunto LIKE 'G3%' THEN 'G3' WHEN assunto LIKE 'G4%' THEN 'G4' WHEN assunto LIKE 'G5%' THEN 'G5' ELSE 'Outro' END as grau,
            CASE WHEN idade::int BETWEEN 0 AND 17 THEN '0-17' WHEN idade::int BETWEEN 18 AND 25 THEN '18-25' WHEN idade::int BETWEEN 26 AND 35 THEN '26-35' WHEN idade::int BETWEEN 36 AND 45 THEN '36-45' WHEN idade::int BETWEEN 46 AND 55 THEN '46-55' WHEN idade::int BETWEEN 56 AND 65 THEN '56-65' ELSE '65+' END as faixa,
            COUNT(*)::int as total
            FROM portal_boon.vw_sla_atendimentos${where}
            GROUP BY grau, faixa ORDER BY grau, faixa`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/tabela-mensal', async (req, res) => {
    try {
        const { where, params } = slaFilters(req)
        const rows = await dbPool.query(`SELECT TO_CHAR(data_atendimento, 'YYYY-MM') as mes,
            COUNT(*)::int as atendimentos,
            COUNT(DISTINCT smpesfis_nome)::int as beneficiarios
            FROM portal_boon.vw_sla_atendimentos${where}
            GROUP BY mes ORDER BY mes`, params)
        // Ignorar mês atual
        const mesAtual = new Date().toISOString().slice(0, 7)
        const data = rows.rows.filter(r => r.mes !== mesAtual)
        // Calcular média móvel 3 meses anteriores e variação
        const result = data.map((r, i) => {
            const prev3 = data.slice(Math.max(0, i - 3), i)
            const mediaAtend = prev3.length > 0 ? Math.round(prev3.reduce((a, p) => a + p.atendimentos, 0) / prev3.length) : null
            const mediaBenef = prev3.length > 0 ? Math.round(prev3.reduce((a, p) => a + p.beneficiarios, 0) / prev3.length) : null
            const varAtend = mediaAtend && mediaAtend > 0 ? Math.round((r.atendimentos - mediaAtend) / mediaAtend * 1000) / 10 : null
            const varBenef = mediaBenef && mediaBenef > 0 ? Math.round((r.beneficiarios - mediaBenef) / mediaBenef * 1000) / 10 : null
            return { ...r, media_atend_3m: mediaAtend, media_benef_3m: mediaBenef, var_atend: varAtend, var_benef: varBenef }
        })
        res.json(result)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/jornada-paciente', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "smpesfis_nome IS NOT NULL AND smpesfis_nome != ''")
        // Intervalo entre atendimentos consecutivos do mesmo paciente
        const intervalos = await dbPool.query(`
            WITH ordenado AS (
                SELECT smpesfis_nome, data_atendimento::date as dia, assunto,
                    LAG(data_atendimento::date) OVER (PARTITION BY smpesfis_nome ORDER BY data_atendimento) as dia_anterior,
                    LAG(assunto) OVER (PARTITION BY smpesfis_nome ORDER BY data_atendimento) as assunto_anterior,
                    ROW_NUMBER() OVER (PARTITION BY smpesfis_nome ORDER BY data_atendimento) as seq
                FROM portal_boon.vw_sla_atendimentos${where}
            )
            SELECT dia - dia_anterior as intervalo_dias
            FROM ordenado WHERE dia_anterior IS NOT NULL AND dia != dia_anterior
        `, params)

        // Distribuição dos intervalos
        const ints = intervalos.rows.map(r => r.intervalo_dias)
        const faixas = [
            { label: 'Mesmo dia', min: 0, max: 0 },
            { label: '1-7 dias', min: 1, max: 7 },
            { label: '8-15 dias', min: 8, max: 15 },
            { label: '16-30 dias', min: 16, max: 30 },
            { label: '31-60 dias', min: 31, max: 60 },
            { label: '61-90 dias', min: 61, max: 90 },
            { label: '90+ dias', min: 91, max: 99999 },
        ]
        const distRetorno = faixas.map(f => ({
            faixa: f.label,
            total: ints.filter(i => i >= f.min && i <= f.max).length
        }))

        const mediaRetorno = ints.length > 0 ? Math.round(ints.reduce((a, b) => a + b, 0) / ints.length * 10) / 10 : 0
        const medianaRetorno = ints.length > 0 ? ints.sort((a, b) => a - b)[Math.floor(ints.length / 2)] : 0

        // Pacientes por número de atendimentos
        const freqPac = await dbPool.query(`
            SELECT cnt, COUNT(*)::int as pacientes FROM (
                SELECT smpesfis_nome, COUNT(*)::int as cnt
                FROM portal_boon.vw_sla_atendimentos${where}
                GROUP BY smpesfis_nome
            ) sub GROUP BY cnt ORDER BY cnt
        `, params)

        // Pacientes que vieram 1x vs múltiplas
        const unica = freqPac.rows.filter(r => r.cnt === 1).reduce((a, r) => a + r.pacientes, 0)
        const multiplas = freqPac.rows.filter(r => r.cnt > 1).reduce((a, r) => a + r.pacientes, 0)

        // Tempo médio de retorno por assunto (top 10 assuntos com mais retornos)
        const retornoAssunto = await dbPool.query(`
            WITH ordenado AS (
                SELECT smpesfis_nome, data_atendimento::date as dia, assunto,
                    LAG(data_atendimento::date) OVER (PARTITION BY smpesfis_nome ORDER BY data_atendimento) as dia_anterior
                FROM portal_boon.vw_sla_atendimentos${where}
            )
            SELECT assunto, COUNT(*)::int as retornos,
                ROUND(AVG(dia - dia_anterior), 1) as media_dias,
                MIN(dia - dia_anterior)::int as min_dias,
                MAX(dia - dia_anterior)::int as max_dias
            FROM ordenado
            WHERE dia_anterior IS NOT NULL AND dia != dia_anterior AND assunto IS NOT NULL AND assunto != ''
            GROUP BY assunto ORDER BY retornos DESC LIMIT 10
        `, params)

        // Pacientes sem retorno há mais de 60 dias (com 2+ atendimentos anteriores)
        const semRetorno = await dbPool.query(`
            SELECT smpesfis_nome, COUNT(*)::int as total_atend,
                MAX(data_atendimento)::date as ultimo_atend,
                CURRENT_DATE - MAX(data_atendimento)::date as dias_sem_retorno
            FROM portal_boon.vw_sla_atendimentos${where}
            GROUP BY smpesfis_nome
            HAVING COUNT(*) >= 2 AND CURRENT_DATE - MAX(data_atendimento)::date > 60
            ORDER BY dias_sem_retorno DESC LIMIT 20
        `, params)

        res.json({
            dist_retorno: distRetorno,
            media_retorno: mediaRetorno,
            mediana_retorno: medianaRetorno,
            total_retornos: ints.length,
            visita_unica: unica,
            visitas_multiplas: multiplas,
            retorno_assunto: retornoAssunto.rows,
            sem_retorno: semRetorno.rows,
            freq_pacientes: freqPac.rows
        })
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/estipulantes', async (req, res) => {
    try {
        const rows = await dbPool.query(`SELECT DISTINCT estipulante_razao FROM portal_boon.vw_sla_atendimentos WHERE estipulante_razao IS NOT NULL AND estipulante_razao != '' ORDER BY estipulante_razao`)
        let list = rows.rows.map(r => r.estipulante_razao)
        // Filtrar por permissão do usuário
        const userId = req.query.user_id
        if (userId) {
            const u = await dbPool.query('SELECT estipulantes_permitidas FROM portal_boon.users WHERE id = $1', [userId])
            if (u.rows.length > 0 && u.rows[0].estipulantes_permitidas) {
                try {
                    const permitidas = JSON.parse(u.rows[0].estipulantes_permitidas)
                    if (Array.isArray(permitidas) && permitidas.length > 0) {
                        list = list.filter(e => permitidas.includes(e))
                    }
                } catch(e) {}
            }
        }
        res.json(list)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/user-estipulantes/:userId', async (req, res) => {
    try {
        const u = await dbPool.query('SELECT role, estipulantes_permitidas FROM portal_boon.users WHERE id = $1', [req.params.userId])
        if (u.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' })
        const user = u.rows[0]
        if (user.role === 'admin') return res.json({ todas: true, estipulantes: [] })
        let permitidas = []
        if (user.estipulantes_permitidas) {
            try { permitidas = JSON.parse(user.estipulantes_permitidas) } catch(e) {}
        }
        if (!Array.isArray(permitidas) || permitidas.length === 0) return res.json({ todas: true, estipulantes: [] })
        return res.json({ todas: false, estipulantes: permitidas })
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/detalhe/:tipo', async (req, res) => {
    try {
        const { tipo } = req.params
        let extraCond = null
        if (tipo === 'realizados') extraCond = "motivo_baixa = 'REALIZADO'"
        else if (tipo === 'abertos') extraCond = "(data_baixa IS NULL OR data_baixa = '')"
        else if (tipo === 'ultimo-mes') {
            const now = new Date()
            now.setMonth(now.getMonth() - 1)
            const mes = now.toISOString().slice(0, 7)
            extraCond = `TO_CHAR(data_atendimento, 'YYYY-MM') = '${mes}'`
        }
        const { where, params } = extraCond ? slaWhere(req, extraCond) : slaFilters(req)
        const rows = await dbPool.query(`SELECT smpesfis_nome, assunto, data_atendimento, motivo_baixa, estipulante_razao, status_sla
            FROM portal_boon.vw_sla_atendimentos${where}
            ORDER BY data_atendimento DESC LIMIT 500`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/sla-dashboard/ai-insights', async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(400).json({ error: 'ANTHROPIC_API_KEY não configurada' })
    try {
        const { where, params } = slaFilters(req)
        const v = 'portal_boon.vw_sla_atendimentos'
        // Coletar dados para contexto
        const total = (await dbPool.query(`SELECT COUNT(*)::int FROM ${v}${where}`, params)).rows[0].count
        const statusData = (await dbPool.query(`SELECT status_sla, COUNT(*)::int as total FROM ${v}${where} GROUP BY status_sla ORDER BY total DESC`, params)).rows
        const { where: wa, params: pa } = slaWhere(req, "assunto IS NOT NULL AND assunto != ''")
        const topAssuntos = (await dbPool.query(`SELECT assunto, COUNT(*)::int as total FROM ${v}${wa} GROUP BY assunto ORDER BY total DESC LIMIT 10`, pa)).rows
        const mensal = (await dbPool.query(`SELECT TO_CHAR(data_atendimento,'YYYY-MM') as mes, COUNT(*)::int as total, SUM(CASE WHEN motivo_baixa='REALIZADO' THEN 1 ELSE 0 END)::int as realizados, SUM(CASE WHEN motivo_baixa='FALTA DO PACIENTE' THEN 1 ELSE 0 END)::int as faltas FROM ${v}${where} GROUP BY mes ORDER BY mes`, params)).rows
        const risco = (await dbPool.query(`SELECT CASE WHEN assunto LIKE 'G0%' THEN 'G0' WHEN assunto LIKE 'G1%' THEN 'G1' WHEN assunto LIKE 'G2%' THEN 'G2' WHEN assunto LIKE 'G3%' THEN 'G3' WHEN assunto LIKE 'G4%' THEN 'G4' WHEN assunto LIKE 'G5%' THEN 'G5' ELSE 'Outro' END as grau, COUNT(*)::int as total FROM ${v}${where} GROUP BY grau ORDER BY grau`, params)).rows

        const prompt = `Você é um consultor estratégico de saúde corporativa que apresenta resultados para clientes do programa Amar & Cuidar. Seu objetivo é gerar uma análise profissional e positiva que demonstre o valor do serviço prestado.

REGRAS IMPORTANTES:
- Destaque sempre os resultados positivos e conquistas primeiro
- Valorize o volume de atendimentos como demonstração de engajamento e confiança no programa
- Se a taxa de SLA estiver acima de 80%, celebre como excelente. Se estiver entre 60-80%, posicione como "sólido com espaço para evolução"
- Nunca critique o serviço diretamente. Se houver indicadores abaixo do ideal, atribua a fatores externos: crescimento da demanda, sazonalidade, complexidade crescente dos casos, ou maior engajamento dos beneficiários
- Posicione desafios como oportunidades de evolução, não como problemas
- Use tom consultivo, confiante e profissional
- Termine sempre com uma visão otimista do futuro

DADOS:
- Total de atendimentos: ${total}
- Status SLA: ${JSON.stringify(statusData)}
- Top 10 assuntos mais demandados: ${JSON.stringify(topAssuntos)}
- Evolução mensal: ${JSON.stringify(mensal)}
- Distribuição por grau de risco: ${JSON.stringify(risco)}

Gere uma análise em HTML com:
1. Resumo Executivo (2-3 frases destacando os principais resultados positivos)
2. Destaques do Período (conquistas e indicadores positivos)
3. Evolução e Oportunidades (posicionar crescimento de demanda como positivo, sugerir melhorias como evolução natural)
4. Visão Estratégica (recomendações de como potencializar ainda mais os resultados)

Use tags HTML simples (h3, p, ul, li, strong, span). Use cores inline: verde (#22c55e) para destaques positivos, azul (#3b82f6) para informações, amarelo (#f59e0b) para oportunidades. Evite vermelho. Mantenha tom profissional e otimista. Responda em português do Brasil.`

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
        })
        const data = await response.json()
        if (data.error) return res.status(400).json({ error: data.error.message })
        let html = data.content?.[0]?.text || 'Sem resposta'
        // Remove markdown code blocks se a IA retornar ```html ... ```
        html = html.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim()
        res.json({ html })
    } catch (err) { res.status(500).json({ error: err.message }) }
})

// ---- Atendimentos Gerais (da view) ----
app.get('/api/sla-dashboard/atend-kpis', async (req, res) => {
    try {
        const v = 'portal_boon.vw_sla_atendimentos'
        const { where: w, params: p } = slaFilters(req)
        const total = (await dbPool.query(`SELECT COUNT(*)::int FROM ${v}${w}`, p)).rows[0].count
        const { where: w2, params: p2 } = slaWhere(req, "motivo_baixa = 'REALIZADO'")
        const realizados = (await dbPool.query(`SELECT COUNT(*)::int FROM ${v}${w2}`, p2)).rows[0].count
        const { where: w3, params: p3 } = slaWhere(req, "motivo_baixa = 'FALTA DO PACIENTE'")
        const faltas = (await dbPool.query(`SELECT COUNT(*)::int FROM ${v}${w3}`, p3)).rows[0].count
        const { where: w4, params: p4 } = slaWhere(req, "data_baixa IS NULL OR data_baixa = ''")
        const abertos = (await dbPool.query(`SELECT COUNT(*)::int FROM ${v}${w4}`, p4)).rows[0].count
        const pacientes = (await dbPool.query(`SELECT COUNT(DISTINCT smpesfis_nome)::int FROM ${v}${w}`, p)).rows[0].count
        const { where: wp, params: pp } = slaWhere(req, "usuario IS NOT NULL AND usuario != ''")
        const profissionais = (await dbPool.query(`SELECT COUNT(DISTINCT usuario)::int FROM ${v}${wp}`, pp)).rows[0].count
        const taxa_realizacao = total > 0 ? Math.round(realizados / total * 1000) / 10 : 0
        const taxa_falta = total > 0 ? Math.round(faltas / total * 1000) / 10 : 0
        res.json({ total, realizados, faltas, abertos, pacientes, profissionais, taxa_realizacao, taxa_falta })
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/atend-por-mes', async (req, res) => {
    try {
        const { where, params } = slaFilters(req)
        const rows = await dbPool.query(`SELECT TO_CHAR(data_atendimento, 'YYYY-MM') as mes, COUNT(*)::int as total, SUM(CASE WHEN motivo_baixa='REALIZADO' THEN 1 ELSE 0 END)::int as realizados, SUM(CASE WHEN motivo_baixa='FALTA DO PACIENTE' THEN 1 ELSE 0 END)::int as faltas FROM portal_boon.vw_sla_atendimentos${where} GROUP BY mes ORDER BY mes`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/atend-por-motivo', async (req, res) => {
    try {
        const { where, params } = slaFilters(req)
        const rows = await dbPool.query(`SELECT CASE WHEN motivo_baixa IS NULL OR motivo_baixa = '' THEN 'EM ABERTO' ELSE motivo_baixa END as motivo, COUNT(*)::int as total FROM portal_boon.vw_sla_atendimentos${where} GROUP BY motivo ORDER BY total DESC`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sla-dashboard/atend-top-profissionais', async (req, res) => {
    try {
        const { where, params } = slaWhere(req, "usuario IS NOT NULL AND usuario != ''")
        const rows = await dbPool.query(`SELECT usuario, COUNT(*)::int as total, SUM(CASE WHEN motivo_baixa='REALIZADO' THEN 1 ELSE 0 END)::int as realizados, SUM(CASE WHEN motivo_baixa='FALTA DO PACIENTE' THEN 1 ELSE 0 END)::int as faltas FROM portal_boon.vw_sla_atendimentos${where} GROUP BY usuario ORDER BY total DESC LIMIT 10`, params)
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

// ---- Feriados CRUD ----
app.get('/api/feriados', async (req, res) => {
    try {
        const rows = await dbPool.query('SELECT * FROM portal_boon.feriados ORDER BY data DESC')
        res.json(rows.rows)
    } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/feriados', async (req, res) => {
    try {
        const { data, descricao, tipo } = req.body
        if (!data || !descricao) return res.status(400).json({ error: 'Data e descrição são obrigatórios.' })
        const result = await dbPool.query('INSERT INTO portal_boon.feriados (data, descricao, tipo) VALUES ($1, $2, $3) RETURNING *', [data, descricao, tipo || 'nacional'])
        res.json({ success: true, feriado: result.rows[0] })
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Já existe um feriado nesta data.' })
        res.status(500).json({ error: err.message })
    }
})

app.delete('/api/feriados/:id', async (req, res) => {
    try {
        await dbPool.query('DELETE FROM portal_boon.feriados WHERE id = $1', [req.params.id])
        res.json({ success: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
})

// Rota para qualquer outra requisição - serve o index.html (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Boon 360º — Backend rodando na porta ${PORT}`)
    console.log(`   Health check: http://localhost:${PORT}/api/health`)
})
