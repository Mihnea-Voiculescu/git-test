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
  { label: 'Dashboard',        to: '/',                 icon: <LayoutDashboard size={16} /> },
  { label: 'Tenders',          to: '/tenders',          icon: <FileSearch size={16} /> },
  { label: 'Suppliers',        to: '/suppliers',        icon: <Truck size={16} /> },
  { label: 'Bids',             to: '/bids',             icon: <HandCoins size={16} /> },
  { label: 'Categories',       to: '/categories',       icon: <Tags size={16} />,      adminOnly: true },
  { label: 'Feature Requests', to: '/feature-requests', icon: <Lightbulb size={16} /> },
  { label: 'Settings',         to: '/settings',         icon: <Settings size={16} />,  adminOnly: true },
]

const SIDEBAR_BG  = 'bg-[#0f172a]'
const BORDER_CLR  = 'border-[#1e293b]'

export default function Sidebar() {
  const { user, role, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const isAdmin = role === 'admin'

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const visibleItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin)

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {visibleItems.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            isActive
              ? 'flex items-center gap-3 border-l-2 border-blue-500 bg-blue-500/10 py-2 pl-2.5 pr-3 text-sm font-medium text-blue-400 transition-colors'
              : 'flex items-center gap-3 border-l-2 border-transparent py-2 pl-2.5 pr-3 text-sm font-medium text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-200'
          }
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </nav>
  )

  const userSection = (
    <div className={`border-t ${BORDER_CLR} pt-4`}>
      <div className="mb-2 flex items-center gap-3 px-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-semibold uppercase text-blue-400">
          {user?.email?.[0] ?? '?'}
        </div>
        <p className="truncate text-xs text-slate-400">{user?.email}</p>
      </div>
      <button
        onClick={handleSignOut}
        className="flex w-full items-center gap-3 border-l-2 border-transparent py-2 pl-2.5 pr-3 text-sm font-medium text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300"
      >
        <LogOut size={16} />
        Logout
      </button>
    </div>
  )

  const logo = (
    <div className="mb-6 flex items-center gap-2 px-3 pt-1">
      <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-500">
        <span className="text-xs font-bold text-white">L</span>
      </div>
      <span className="text-sm font-semibold tracking-tight text-white">LicitApp</span>
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className={`flex items-center justify-between border-b ${BORDER_CLR} ${SIDEBAR_BG} px-4 py-3 md:hidden`}>
        <span className="text-sm font-semibold text-white">LicitApp</span>
        <button onClick={() => setOpen(v => !v)} className="text-slate-400 hover:text-white">
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-20 bg-black/60 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Mobile drawer */}
      <aside className={[
        `fixed inset-y-0 left-0 z-30 flex w-60 flex-col ${SIDEBAR_BG} py-5 px-3 transition-transform duration-200 md:hidden`,
        open ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}>
        <div className="mb-6 flex items-center justify-between px-3">
          <span className="text-sm font-semibold text-white">LicitApp</span>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-1 flex-col justify-between overflow-y-auto">
          {nav}
          {userSection}
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside className={`hidden w-60 shrink-0 flex-col ${SIDEBAR_BG} py-5 px-3 md:flex`}>
        {logo}
        <div className="flex flex-1 flex-col justify-between overflow-y-auto">
          {nav}
          {userSection}
        </div>
      </aside>
    </>
  )
}
