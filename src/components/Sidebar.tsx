import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FileSearch,
  Truck,
  HandCoins,
  Tags,
  Lightbulb,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',        to: '/',                icon: <LayoutDashboard size={18} /> },
  { label: 'Tenders',          to: '/tenders',         icon: <FileSearch size={18} /> },
  { label: 'Suppliers',        to: '/suppliers',       icon: <Truck size={18} /> },
  { label: 'Bids',             to: '/bids',            icon: <HandCoins size={18} /> },
  { label: 'Categories',       to: '/categories',      icon: <Tags size={18} />,     adminOnly: true },
  { label: 'Feature Requests', to: '/feature-requests',icon: <Lightbulb size={18} /> },
  { label: 'Settings',         to: '/settings',        icon: <Settings size={18} />, adminOnly: true },
]

export default function Sidebar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  // No profiles table yet — default to showing all items
  const isAdmin = true

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const visibleItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin)

  const nav = (
    <nav className="flex flex-col gap-1">
      {visibleItems.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            [
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white',
            ].join(' ')
          }
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </nav>
  )

  const userSection = (
    <div className="border-t border-white/10 pt-4">
      <div className="mb-3 flex items-center gap-3 px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white uppercase">
          {user?.email?.[0] ?? '?'}
        </div>
        <p className="truncate text-sm text-slate-300">{user?.email}</p>
      </div>
      <button
        onClick={handleSignOut}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
      >
        <LogOut size={18} />
        Logout
      </button>
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-900 px-4 py-3 lg:hidden">
        <span className="text-sm font-bold text-white">LicitApp</span>
        <button onClick={() => setOpen(v => !v)} className="text-slate-400 hover:text-white">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-slate-900 p-4 transition-transform duration-200 lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="mb-6 flex items-center justify-between">
          <span className="text-sm font-bold text-white">LicitApp</span>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-1 flex-col justify-between overflow-y-auto">
          {nav}
          {userSection}
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 p-4 lg:flex">
        <div className="mb-6 px-3">
          <span className="text-sm font-bold text-white">LicitApp</span>
        </div>
        <div className="flex flex-1 flex-col justify-between overflow-y-auto">
          {nav}
          {userSection}
        </div>
      </aside>
    </>
  )
}
