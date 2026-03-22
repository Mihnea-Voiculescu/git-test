import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Webhook, Copy, Check, Lock,
  Bot, Building2, Route, Info, Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toaster'

// =============================================================================
// Types
// =============================================================================

type UserRole = 'admin' | 'operator' | 'viewer'

interface Profile {
  id: string
  full_name: string | null
  role: UserRole
  created_at: string
}

// =============================================================================
// Constants
// =============================================================================

const ROLE_OPTIONS: UserRole[] = ['admin', 'operator', 'viewer']

const ROLE_BADGE: Record<UserRole, string> = {
  admin:    'bg-violet-500/15 text-violet-400',
  operator: 'bg-blue-500/15 text-blue-400',
  viewer:   'bg-slate-500/20 text-slate-400',
}

const WEBHOOK_URL = 'https://your-project.supabase.co/functions/v1/ingest-tender'
const API_KEY_PLACEHOLDER = 'sk-licit-••••••••••••••••••••••••••••••••'

// =============================================================================
// Helpers
// =============================================================================

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// =============================================================================
// Section wrapper
// =============================================================================

function Section({ title, icon, children }: {
  title: string; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[#334155] bg-[#1e293b]">
      <div className="flex items-center gap-3 border-b border-[#334155] px-6 py-4">
        <div className="text-slate-500">{icon}</div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// =============================================================================
// CopyButton
// =============================================================================

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy"
      className="flex items-center gap-1.5 rounded-md border border-[#334155] px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-slate-500 hover:text-white"
    >
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// =============================================================================
// Future feature placeholder card
// =============================================================================

function PlaceholderCard({ icon, title, description }: {
  icon: React.ReactNode; title: string; description: string
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-[#334155]/60 bg-[#0f172a]/40 px-5 py-4 opacity-60">
      <div className="mt-0.5 shrink-0 text-slate-600">{icon}</div>
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <span className="inline-flex rounded-full bg-slate-700/40 px-2 py-0.5 text-xs text-slate-500">In Development</span>
        </div>
        <p className="mt-0.5 text-xs text-slate-600">{description}</p>
      </div>
    </div>
  )
}

// =============================================================================
// Page
// =============================================================================

export default function SettingsPage() {
  const navigate = useNavigate()
  const { role, user: currentUser } = useAuth()
  const toast = useToast()

  const [profiles,  setProfiles]  = useState<Profile[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [savingId,  setSavingId]  = useState<string | null>(null)
  const [showInviteNote, setShowInviteNote] = useState(false)

  // Admin guard
  useEffect(() => {
    if (role && role !== 'admin') navigate('/', { replace: true })
  }, [role, navigate])

  // Fetch profiles
  useEffect(() => {
    async function load() {
      setLoading(true); setError(null)
      try {
        const { data, error: qErr } = await supabase
          .from('profiles')
          .select('id, full_name, role, created_at')
          .order('created_at')
        if (qErr) throw qErr
        setProfiles((data as Profile[]) ?? [])
      } catch (e) {
        setError('Failed to load users.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleRoleChange(profileId: string, newRole: UserRole) {
    setSavingId(profileId)
    const prev = profiles.find(p => p.id === profileId)?.role
    // Optimistic
    setProfiles(ps => ps.map(p => p.id === profileId ? { ...p, role: newRole } : p))
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profileId)
    setSavingId(null)
    if (error) {
      setProfiles(ps => ps.map(p => p.id === profileId ? { ...p, role: prev! } : p))
      toast('Failed to update role.', 'error')
    } else {
      toast('Role updated.')
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="mt-0.5 text-sm text-slate-400">App configuration and user management</p>
      </div>

      {/* ── User Management ──────────────────────────────────────────────── */}
      <Section title="User Management" icon={<Users size={16} />}>
        {/* Invite note */}
        <div className="border-b border-[#334155] px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
              To add new users, go to{' '}
              <span className="font-medium text-slate-300">Supabase Dashboard → Authentication → Users</span>{' '}
              and create them there. They will appear in this table automatically after their first login.
            </p>
            <button
              onClick={() => setShowInviteNote(v => !v)}
              className="shrink-0 rounded-md border border-[#334155] px-3 py-1.5 text-xs text-slate-400 transition hover:border-slate-500 hover:text-white"
            >
              Invite User
            </button>
          </div>
          {showInviteNote && (
            <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/[0.07] px-4 py-3">
              <p className="text-xs text-blue-300 leading-relaxed">
                <strong>How to add users:</strong> Open your Supabase project → Authentication → Users → Add user.
                Enter their email and a temporary password. On first login their profile will be created automatically with the <em>operator</em> role.
                You can then change their role below.
              </p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#334155] bg-[#0f172a]/60">
                  {['Name', 'Role', 'Member Since', 'Change Role'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.map((p, i) => {
                  const isCurrentUser = p.id === currentUser?.id
                  return (
                    <tr
                      key={p.id}
                      className={[
                        i % 2 === 1 ? 'bg-white/[0.015]' : '',
                        i !== profiles.length - 1 ? 'border-b border-[#334155]/50' : '',
                      ].join(' ')}
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">
                            {p.full_name || <span className="italic text-slate-500">No name set</span>}
                          </span>
                          {isCurrentUser && (
                            <span className="inline-flex rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400">you</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE[p.role]}`}>
                          {p.role}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 tabular-nums text-slate-400">{fmtDate(p.created_at)}</td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={p.role}
                            disabled={savingId === p.id}
                            onChange={e => handleRoleChange(p.id, e.target.value as UserRole)}
                            className="h-8 rounded-md border border-[#334155] bg-[#0f172a] px-2.5 text-xs text-white outline-none transition focus:border-blue-500 cursor-pointer disabled:opacity-50"
                          >
                            {ROLE_OPTIONS.map(r => (
                              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                            ))}
                          </select>
                          {savingId === p.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Webhook Configuration ─────────────────────────────────────────── */}
      <Section title="Webhook Configuration" icon={<Webhook size={16} />}>
        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-slate-400 leading-relaxed">
            Configure this URL in your <span className="font-medium text-slate-300">n8n workflow</span> to send tender data to LicitApp.
            POST JSON with fields: <code className="rounded bg-slate-700/50 px-1.5 py-0.5 text-xs font-mono text-slate-300">external_id</code>,{' '}
            <code className="rounded bg-slate-700/50 px-1.5 py-0.5 text-xs font-mono text-slate-300">title</code>,{' '}
            <code className="rounded bg-slate-700/50 px-1.5 py-0.5 text-xs font-mono text-slate-300">description</code>,{' '}
            <code className="rounded bg-slate-700/50 px-1.5 py-0.5 text-xs font-mono text-slate-300">contracting_authority</code>,{' '}
            <code className="rounded bg-slate-700/50 px-1.5 py-0.5 text-xs font-mono text-slate-300">deadline</code>.
          </p>

          {/* Webhook URL */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Webhook URL</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-xs font-mono text-slate-300 break-all">
                {WEBHOOK_URL}
              </code>
              <CopyButton value={WEBHOOK_URL} />
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">API Key</label>
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2">
                <Lock size={12} className="shrink-0 text-slate-600" />
                <code className="text-xs font-mono text-slate-500 tracking-widest">{API_KEY_PLACEHOLDER}</code>
              </div>
              <CopyButton value="placeholder-api-key" />
            </div>
          </div>
        </div>
      </Section>

      {/* ── Future Features ───────────────────────────────────────────────── */}
      <Section title="Future Features" icon={<Lock size={16} />}>
        <div className="space-y-3 px-6 py-5">
          <PlaceholderCard
            icon={<Bot size={18} />}
            title="Auto-Apply Settings"
            description="Configure rules for automatic bid submission."
          />
          <PlaceholderCard
            icon={<Building2 size={18} />}
            title="Multi-Entity Management"
            description="Manage multiple legal entities for bidding."
          />
          <PlaceholderCard
            icon={<Bot size={18} />}
            title="AI Supplier Negotiation"
            description="Configure AI agent for automated supplier communication."
          />
          <PlaceholderCard
            icon={<Route size={18} />}
            title="Route Optimization"
            description="Set rules for China direct vs EU transit shipping."
          />
        </div>
      </Section>

      {/* ── App Info ──────────────────────────────────────────────────────── */}
      <Section title="App Info" icon={<Info size={16} />}>
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">Version</p>
            <p className="mt-0.5 text-sm text-white">0.1.0 — Test Run</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Stack</p>
            <p className="mt-0.5 text-sm text-white">React + Supabase + Vercel</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Build Note</p>
            <p className="mt-0.5 text-sm text-slate-400">
              This is a test build. Production version will be rebuilt with company IT standards.
            </p>
          </div>
        </div>
      </Section>
    </div>
  )
}
