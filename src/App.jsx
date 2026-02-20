import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Home from './pages/Home'
import Dashboards from './pages/Dashboards'
import DashboardView from './pages/DashboardView'
import Admin from './pages/Admin'

export default function App() {
    return (
        <AuthProvider>
            <DataProvider>
                <BrowserRouter>
                    <Routes>
                        {/* Públicas */}
                        <Route path="/" element={<Home />} />
                        <Route path="/login" element={<Login />} />

                        {/* Protegidas — Usuário logado */}
                        <Route
                            path="/dashboards"
                            element={
                                <ProtectedRoute>
                                    <Dashboards />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/dashboards/:id"
                            element={
                                <ProtectedRoute>
                                    <DashboardView />
                                </ProtectedRoute>
                            }
                        />

                        {/* Protegidas — Somente Admin */}
                        <Route
                            path="/admin"
                            element={
                                <ProtectedRoute adminOnly>
                                    <Admin />
                                </ProtectedRoute>
                            }
                        />

                        {/* Catch-all */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </DataProvider>
        </AuthProvider>
    )
}
