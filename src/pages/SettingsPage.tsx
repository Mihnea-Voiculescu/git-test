import { useEffect, useRef, useState } from 'react'
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
  email: string
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

const WEBHOOK_URL = 'https://whtdnqebsiyiaaaieprf.supabase.co/functions/v1/ingest-tender'
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

  // Inline name editing
  const [editingNameId,  setEditingNameId]  = useState<string | null>(null)
  const [editingNameVal, setEditingNameVal] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Admin guard
  useEffect(() => {
    if (role && role !== 'admin') navigate('/', { replace: true })
  }, [role, navigate])

  // Fetch profiles
  useEffect(() => {
    async function load() {
      setLoading(true); setError(null)
      try {
        const { data, error: qErr } = await supabase.rpc('get_users_with_email')
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

  function startEditName(p: Profile) {
    setEditingNameId(p.id)
    setEditingNameVal(p.full_name ?? '')
    // Focus after render
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  async function commitNameEdit() {
    if (!editingNameId) return
    const newName = editingNameVal.trim() || null
    const prev = profiles.find(p => p.id === editingNameId)?.full_name ?? null
    if (newName === prev) { cancelNameEdit(); return }
    setEditingNameId(null)
    setProfiles(ps => ps.map(p => p.id === editingNameId ? { ...p, full_name: newName } : p))
    const id = editingNameId
    const { error } = await supabase.from('profiles').update({ full_name: newName }).eq('id', id)
    if (error) {
      setProfiles(ps => ps.map(p => p.id === id ? { ...p, full_name: prev } : p))
      toast('Failed to update name.', 'error')
    } else {
      toast('Name updated.')
    }
  }

  function cancelNameEdit() {
    setEditingNameId(null)
    setEditingNameVal('')
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
                  {['Name', 'Email', 'Role', 'Member Since', 'Change Role'].map(h => (
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
                        {editingNameId === p.id ? (
                          <input
                            ref={nameInputRef}
                            value={editingNameVal}
                            onChange={e => setEditingNameVal(e.target.value)}
                            onBlur={commitNameEdit}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitNameEdit()
                              if (e.key === 'Escape') cancelNameEdit()
                            }}
                            placeholder="Display name"
                            className="h-8 w-44 rounded-md border border-blue-500 bg-[#0f172a] px-2.5 text-sm text-white outline-none ring-1 ring-blue-500"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startEditName(p)}
                              className="group flex items-center gap-1.5 font-medium text-white hover:text-blue-400"
                              title="Click to edit name"
                            >
                              {p.full_name || <span className="italic text-slate-500 group-hover:text-blue-400/70">No name set</span>}
                              <span className="text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity text-xs">✎</span>
                            </button>
                            {isCurrentUser && (
                              <span className="inline-flex rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400">you</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-slate-400">{p.email}</td>
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
        <div className="space-y-5 px-6 py-5">
          <p className="text-sm text-slate-400 leading-relaxed">
            Configure this URL in your <span className="font-medium text-slate-300">n8n workflow</span> to push SEAP notices into LicitApp.
            The function accepts a <strong className="text-slate-300">single object</strong> or an <strong className="text-slate-300">array</strong> of SEAP notice objects and upserts on <code className="rounded bg-slate-700/50 px-1 py-0.5 text-xs font-mono text-slate-300">noticeNo</code> (external_id).
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
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">API Key Header</label>
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2">
                <Lock size={12} className="shrink-0 text-slate-600" />
                <code className="text-xs font-mono text-slate-500 tracking-widest">{API_KEY_PLACEHOLDER}</code>
              </div>
              <CopyButton value="placeholder-api-key" />
            </div>
            <p className="text-xs text-slate-600">Send as header: <code className="font-mono">x-api-key: &lt;value&gt;</code></p>
          </div>

          {/* Field mapping */}
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">SEAP → LicitApp Field Mapping</label>
            <div className="overflow-x-auto rounded-md border border-[#334155] bg-[#0f172a]">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#334155]">
                    <th className="px-4 py-2 text-left text-slate-500">SEAP field</th>
                    <th className="px-4 py-2 text-left text-slate-500">tenders column</th>
                    <th className="px-4 py-2 text-left text-slate-500">notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#334155]/50">
                  {[
                    ['noticeNo',                     'external_id',           'required — skip if missing'],
                    ['contractTitle',                 'title',                 'required — skip if missing'],
                    ['contractTitle (first 500 ch)', 'description',           'reused from title'],
                    ['contractingAuthorityNameAndFN', 'contracting_authority', ''],
                    ['ronContractValue',              'estimated_value',       'numeric, can be 0'],
                    ['currencyCode',                  'currency',              'default RON'],
                    ['cpvCodeAndName',                'cpv_code',              ''],
                    ['maxTenderReceiptDeadline',       'deadline',             'null → noticeStateDate + 30d'],
                    ['noticeStateDate',               'publication_date',      ''],
                    ['(full object)',                 'raw_data',              'entire SEAP JSON preserved'],
                  ].map(([seap, col, note]) => (
                    <tr key={seap}>
                      <td className="px-4 py-1.5 text-blue-400">{seap}</td>
                      <td className="px-4 py-1.5 text-emerald-400">{col}</td>
                      <td className="px-4 py-1.5 text-slate-600">{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Response format */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Response Format</label>
            <pre className="overflow-x-auto rounded-md border border-[#334155] bg-[#0f172a] px-4 py-3 text-xs text-slate-300">{`{ "processed": 3, "created": 2, "updated": 1, "skipped": 0, "errors": [] }`}</pre>
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
