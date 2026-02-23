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
                    <div className="header-logo-icon">
                        <LayoutDashboard size={22} />
                    </div>
                    Boon 360º
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
