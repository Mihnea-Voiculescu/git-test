import { useAuth } from '../contexts/AuthContext'

export default function DashboardPage() {
  const { user, signOut } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">LicitApp</h1>
      <p className="text-muted-foreground">Autentificat ca: {user?.email}</p>
      <button
        onClick={signOut}
        className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
      >
        Deconectare
      </button>
    </div>
  )
}
