import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Header from '../components/Header'
import { Shield, FolderOpen, Zap, LayoutDashboard } from 'lucide-react'

export default function Home() {
    const { user } = useAuth()

    return (
        <div>
            <Header />

            {/* Hero */}
            <section className="home-hero">
                <div className="container home-hero-content">
                    <h1 className="animate-fade-in-up">
                        Olá, este é o seu{' '}
                        <span>Boon 360º!</span>
                    </h1>
                    <p className="animate-fade-in-up animate-delay-1">
                        Dashboards Power BI organizados por áreas, com acesso controlado.
                        Tudo em um só lugar, de forma segura e intuitiva.
                    </p>
                    <Link
                        to={user ? '/dashboards' : '/login'}
                        className="btn btn-white btn-lg animate-fade-in-up animate-delay-2"
                    >
                        <LayoutDashboard size={20} />
                        Acessar meus dashboards
                    </Link>

                    {/* Mascot image */}
                    <div className="home-hero-mascot animate-fade-in-up animate-delay-3">
                        <img
                            src="/logo-boon.gif"
                            alt="Boon Cuidado"
                            className="home-hero-mascot-img"
                        />
                    </div>
                </div>
            </section>

            {/* Benefits */}
            <section className="home-benefits">
                <div className="container">
                    <h2 className="animate-fade-in-up">Por que usar o Portal BOON?</h2>
                    <p className="home-benefits-subtitle animate-fade-in-up animate-delay-1">
                        Simplicidade, segurança e organização para seus dados.
                    </p>

                    <div className="benefits-grid">
                        <div className="card benefit-card animate-fade-in-up animate-delay-2">
                            <div className="benefit-icon benefit-icon-purple">
                                <Shield size={32} />
                            </div>
                            <h3>Segurança</h3>
                            <p>
                                Acesso controlado por perfil e grupo. Cada usuário vê apenas
                                os dashboards autorizados para sua área.
                            </p>
                        </div>

                        <div className="card benefit-card animate-fade-in-up animate-delay-3">
                            <div className="benefit-icon benefit-icon-blue">
                                <FolderOpen size={32} />
                            </div>
                            <h3>Organização</h3>
                            <p>
                                Dashboards categorizados e de fácil acesso. Busca rápida,
                                filtros e favoritos na ponta dos dedos.
                            </p>
                        </div>

                        <div className="card benefit-card animate-fade-in-up animate-delay-4">
                            <div className="benefit-icon benefit-icon-green">
                                <Zap size={32} />
                            </div>
                            <h3>Acesso Rápido</h3>
                            <p>
                                Sem complicação. Faça login uma vez e acesse todos os seus
                                relatórios em um só portal.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
