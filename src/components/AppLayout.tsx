import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0f172a] md:flex-row">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <Outlet />
        </main>
        <footer className="shrink-0 border-t border-[#1e293b] px-6 py-2 md:px-8">
          <p className="text-xs text-slate-700">v0.1.0 — Test Build</p>
        </footer>
      </div>
    </div>
  )
}
