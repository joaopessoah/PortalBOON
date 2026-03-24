import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LayoutDashboard, Menu, X, LogOut, Shield, HelpCircle } from 'lucide-react'

export default function Header() {
    const { user, logout, isAdmin } = useAuth()
    const location = useLocation()
    const navigate = useNavigate()
    const [mobileOpen, setMobileOpen] = useState(false)

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    const isActive = (path) => location.pathname.startsWith(path)

    return (
        <header className="header">
            <div className="header-inner">
                <Link to={user ? (isAdmin ? '/admin' : '/dashboards') : '/'} className="header-logo">
                    <img src="https://static.wixstatic.com/media/a6237b_5c3dbaac09854174a8148bcdd5de45c5~mv2.png/v1/crop/x_0,y_44,w_2335,h_923/fill/w_258,h_102,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2%20(1)_edited.png" alt="Boon Saúde" style={{ height: 32 }} />
                </Link>

                <button className="header-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)}>
                    {mobileOpen ? <X size={24} /> : <Menu size={24} />}
                </button>

                <nav className={`header-nav ${mobileOpen ? 'open' : ''}`}>
                    {user ? (
                        <>
                            {isAdmin && (
                                <Link
                                    to="/admin"
                                    className={`header-nav-link ${isActive('/admin') ? 'active' : ''}`}
                                    onClick={() => setMobileOpen(false)}
                                >
                                    <Shield size={16} style={{ marginRight: 4 }} />
                                    Admin
                                </Link>
                            )}
                            <Link
                                to="/dashboards"
                                className={`header-nav-link ${isActive('/dashboards') ? 'active' : ''}`}
                                onClick={() => setMobileOpen(false)}
                            >
                                Dashboards
                            </Link>
                            <Link
                                to="/ativacoes"
                                className={`header-nav-link ${isActive('/ativacoes') ? 'active' : ''}`}
                                onClick={() => setMobileOpen(false)}
                            >
                                Ativações
                            </Link>
                            <Link
                                to="/"
                                className="header-nav-link"
                                onClick={() => setMobileOpen(false)}
                            >
                                <HelpCircle size={16} style={{ marginRight: 4 }} />
                                Ajuda
                            </Link>

                            <div className="header-user">
                                <div className="header-user-avatar">
                                    {user.name?.charAt(0).toUpperCase()}
                                </div>
                                <span className="header-user-name">{user.name}</span>
                            </div>

                            <button onClick={handleLogout} className="header-logout">
                                <LogOut size={14} style={{ marginRight: 4 }} />
                                Sair
                            </button>
                        </>
                    ) : (
                        <>
                            <Link to="/" className="header-nav-link" onClick={() => setMobileOpen(false)}>
                                Início
                            </Link>
                            <Link to="/login" className="header-nav-link" onClick={() => setMobileOpen(false)}>
                                Entrar
                            </Link>
                        </>
                    )}
                </nav>
            </div>
        </header>
    )
}
