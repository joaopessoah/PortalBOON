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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '.env') })
dotenv.config({ path: path.join(__dirname, '../.env') })

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

        const query = 'SELECT id, name, email, password_hash, role, status FROM portal_boon.users WHERE email = $1'
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
        const query = 'SELECT id, name, email, role, status, groups, rls_mapping as "rlsMapping", allowed_dashboards as "allowedDashboards", company_id as "companyId", created_at FROM portal_boon.users ORDER BY id DESC'
        const result = await dbPool.query(query)
        res.json({ success: true, users: result.rows })
    } catch (error) {
        console.error('List users error:', error)
        res.status(500).json({ error: 'Erro ao listar usuários.' })
    }
})

app.post('/api/users', async (req, res) => {
    try {
        const { name, email, password, role, status, groups, rlsMapping, allowedDashboards, companyId } = req.body
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

        const insert = `
            INSERT INTO portal_boon.users (name, email, password_hash, role, status, groups, rls_mapping, allowed_dashboards, company_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, name, email, role, status, groups, rls_mapping as "rlsMapping", allowed_dashboards as "allowedDashboards", company_id as "companyId", created_at
        `
        const values = [name, email, hashed, role || 'user', status || 'active', g, rls, ad, companyId || null]
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
        const { name, email, password, role, status, groups, rlsMapping, allowedDashboards, companyId } = req.body

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

        const update = `
            UPDATE portal_boon.users
            SET name = $1, email = $2, password_hash = $3, role = $4, status = $5, groups = $6, rls_mapping = $7, allowed_dashboards = $8, company_id = $9
            WHERE id = $10
            RETURNING id, name, email, role, status, groups, rls_mapping as "rlsMapping", allowed_dashboards as "allowedDashboards", company_id as "companyId", created_at
        `
        const values = [name, email, hashed, role, status, g, rls, ad, companyId || null, id]
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
        const query = 'SELECT id, name, description, category, url, workspace_id as "workspaceId", report_id as "reportId", group_id as "groupId", display_order as "order", active, visibility, groups, users, pinned, type, rls_roles as "rlsRoles", last_update as "lastUpdate", created_at as "createdAt" FROM portal_boon.dashboards ORDER BY display_order ASC, id DESC'
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
                query += ` AND "NomeEstipulante" ILIKE $${paramIndex}`;
                values.push(`%${estipulante}%`);
                paramIndex++;
            }
            if (subEstipulante && columnName !== 'NomeSubestipulante') {
                query += ` AND "NomeSubestipulante" ILIKE $${paramIndex}`;
                values.push(`%${subEstipulante}%`);
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
            query += ` AND "NomeEstipulante" ILIKE $${paramIndex}`;
            values.push(`%${estipulante}%`);
            paramIndex++;
        }
        if (subEstipulante) {
            query += ` AND "NomeSubestipulante" ILIKE $${paramIndex}`;
            values.push(`%${subEstipulante}%`);
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

// ======================== ENDPOINT: Atualizar Ativações (Sync Python) ========================
app.post('/api/ativacoes/sync', async (req, res) => {
    try {
        const pythonScriptPath = path.resolve(__dirname, '../tabela_ativacoes_portalboon.py');
        const syncFilePath = path.resolve(__dirname, 'last_sync.json');

        exec(`python "${pythonScriptPath}"`, async (error, stdout, stderr) => {
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

// Rota para qualquer outra requisição - serve o index.html (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Boon 360º — Backend rodando na porta ${PORT}`)
    console.log(`   Health check: http://localhost:${PORT}/api/health`)
})
