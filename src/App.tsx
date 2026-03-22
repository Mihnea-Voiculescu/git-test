import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './components/Toaster'
import AppLayout from './components/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import TendersPage from './pages/TendersPage'
import TenderDetailPage from './pages/TenderDetailPage'
import SuppliersPage from './pages/SuppliersPage'
import BidsPage from './pages/BidsPage'
import CategoriesPage from './pages/CategoriesPage'
import FeatureRequestsPage from './pages/FeatureRequestsPage'
import SettingsPage from './pages/SettingsPage'

function ProtectedLayout() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <AppLayout />
}

function AppRoutes() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route element={<ProtectedLayout />}>
        <Route path="/"                   element={<DashboardPage />} />
        <Route path="/tenders"            element={<TendersPage />} />
        <Route path="/tenders/:id"        element={<TenderDetailPage />} />
        <Route path="/suppliers"          element={<SuppliersPage />} />
        <Route path="/bids"               element={<BidsPage />} />
        <Route path="/categories"         element={<CategoriesPage />} />
        <Route path="/feature-requests"   element={<FeatureRequestsPage />} />
        <Route path="/settings"           element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
