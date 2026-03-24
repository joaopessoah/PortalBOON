import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Mail, Lock, AlertCircle, LayoutDashboard } from 'lucide-react'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { login } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (!email.trim() || !password.trim()) {
            setError('Por favor, preencha todos os campos.')
            return
        }

        setLoading(true)

        try {
            const result = await login(email, password)

            if (result.success) {
                if (result.user.role === 'admin') {
                    navigate('/admin')
                } else {
                    navigate('/dashboards')
                }
            } else {
                setError(result.error)
            }
        } catch (err) {
            console.error('Login error:', err)
            setError('Erro inesperado ao fazer login. Tente novamente.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-page">
            <div className="login-header">
                <div className="login-header-inner">
                    <div className="header-logo" style={{ color: '#fff' }}>
                        <div className="header-logo-icon">
                            <LayoutDashboard size={22} />
                        </div>
                        Boon 360º
                    </div>
                </div>
            </div>

            <div className="login-content">
                <div className="login-card">
                    <h1 style={{ textAlign: 'center' }}>Olá, bem-vindo ao Boon 360º!</h1>
                    <p style={{ textAlign: 'center' }}>Acesse seus dashboards com segurança.</p>

                    {error && (
                        <div className="login-error">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="login-form">
                        <div className="form-group">
                            <label className="form-label" htmlFor="email">
                                <Mail size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                                E-mail
                            </label>
                            <input
                                id="email"
                                type="email"
                                className="form-input"
                                placeholder="seu.email@empresa.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="password">
                                <Lock size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                                Senha
                            </label>
                            <input
                                id="password"
                                type="password"
                                className="form-input"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary login-btn"
                            disabled={loading}
                        >
                            {loading ? 'Entrando...' : 'Entrar'}
                        </button>
                    </form>

                    <div className="login-forgot">
                        <a href="#" onClick={(e) => e.preventDefault()}>
                            Esqueci minha senha
                        </a>
                    </div>
                </div>
            </div>
        </div>
    )
}
