import { useEffect, useRef, useState } from 'react'
import { Plus, X, MoreHorizontal, Loader2, Lightbulb } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toaster'

// =============================================================================
// Types & constants
// =============================================================================

type Priority = 'low' | 'medium' | 'high' | 'critical'
type Status   = 'idea' | 'planned' | 'in_progress' | 'done'

interface FeatureRequest {
  id: string
  title: string
  description: string | null
  priority: Priority
  status: Status
  created_at: string
  requested_by: string | null
  profiles: { full_name: string | null } | null
}

interface FormData {
  title: string
  description: string
  priority: Priority
}

const DEFAULT_FORM: FormData = { title: '', description: '', priority: 'medium' }

const COLUMNS: { key: Status; label: string }[] = [
  { key: 'idea',        label: 'Idea' },
  { key: 'planned',     label: 'Planned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done',        label: 'Done' },
]

const PRIORITY_BADGE: Record<Priority, string> = {
  low:      'bg-slate-500/20 text-slate-400',
  medium:   'bg-blue-500/15 text-blue-400',
  high:     'bg-orange-500/15 text-orange-400',
  critical: 'bg-red-500/15 text-red-400',
}

const ALL_PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical']

// =============================================================================
// Helpers
// =============================================================================

const INPUT_CLS    = 'h-9 w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const TEXTAREA_CLS = 'w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none'
const SELECT_CLS   = `${INPUT_CLS} cursor-pointer`
const LABEL_CLS    = 'block text-xs font-medium uppercase tracking-wide text-slate-500'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function capitalize(s: string) {
  return s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// =============================================================================
// Modal wrapper
// =============================================================================

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
}) {
  useEffect(() => {
    function h(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 mt-12 w-full max-w-lg rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#334155] px-6 py-4">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// =============================================================================
// Add / Edit form (inside modal)
// =============================================================================

function RequestForm({ defaultValues, onSubmit, onCancel, saving, isAdmin, showStatus, currentStatus }: {
  defaultValues: FormData
  onSubmit:      (data: FormData & { status?: Status }) => void
  onCancel:      () => void
  saving:        boolean
  isAdmin:       boolean
  showStatus?:   boolean
  currentStatus?: Status
}) {
  const [form, setForm] = useState<FormData & { status: Status }>({
    ...defaultValues,
    status: currentStatus ?? 'idea',
  })
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  return (
    <div>
      <div className="space-y-4 px-6 py-5">
        <div className="space-y-1.5">
          <label className={LABEL_CLS}>Title <span className="text-red-400">*</span></label>
          <input
            ref={titleRef}
            type="text"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Short description of the request"
            className={INPUT_CLS}
          />
        </div>

        <div className="space-y-1.5">
          <label className={LABEL_CLS}>Description</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={4}
            placeholder="More details, use case, or context…"
            className={TEXTAREA_CLS}
          />
        </div>

        <div className={`grid gap-3 ${showStatus && isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div className="space-y-1.5">
            <label className={LABEL_CLS}>Priority</label>
            <select
              value={form.priority}
              onChange={e => set('priority', e.target.value as Priority)}
              disabled={!isAdmin}
              className={`${SELECT_CLS} disabled:opacity-50`}
            >
              {ALL_PRIORITIES.map(p => (
                <option key={p} value={p}>{capitalize(p)}</option>
              ))}
            </select>
          </div>

          {showStatus && isAdmin && (
            <div className="space-y-1.5">
              <label className={LABEL_CLS}>Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value as Status)}
                className={SELECT_CLS}
              >
                {COLUMNS.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-[#334155] px-6 py-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-[#334155] px-4 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving || !form.title.trim()}
          onClick={() => onSubmit(form)}
          className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// Detail modal (view / edit)
// =============================================================================

function DetailModal({ request, isAdmin, onClose, onSave, saving }: {
  request: FeatureRequest
  isAdmin: boolean
  onClose: () => void
  onSave:  (data: FormData & { status?: Status }) => void
  saving:  boolean
}) {
  const [editing, setEditing] = useState(false)

  if (editing && isAdmin) {
    return (
      <Modal title="Edit Request" onClose={onClose}>
        <RequestForm
          defaultValues={{ title: request.title, description: request.description ?? '', priority: request.priority }}
          currentStatus={request.status}
          showStatus
          isAdmin={isAdmin}
          onSubmit={data => { onSave(data); setEditing(false) }}
          onCancel={() => setEditing(false)}
          saving={saving}
        />
      </Modal>
    )
  }

  return (
    <Modal title={request.title} onClose={onClose}>
      <div className="space-y-4 px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_BADGE[request.priority]}`}>
            {capitalize(request.priority)}
          </span>
          <span className="inline-flex rounded-full bg-slate-700/50 px-2.5 py-0.5 text-xs text-slate-300">
            {COLUMNS.find(c => c.key === request.status)?.label}
          </span>
        </div>

        {request.description ? (
          <p className="whitespace-pre-wrap text-sm text-slate-300">{request.description}</p>
        ) : (
          <p className="text-sm italic text-slate-600">No description provided.</p>
        )}

        <div className="border-t border-[#334155] pt-4 text-xs text-slate-500 space-y-1">
          <p>Requested by: <span className="text-slate-400">{request.profiles?.full_name ?? 'Unknown'}</span></p>
          <p>Created: <span className="text-slate-400">{fmtDate(request.created_at)}</span></p>
        </div>
      </div>

      {isAdmin && (
        <div className="flex justify-end border-t border-[#334155] px-6 py-4">
          <button
            onClick={() => setEditing(true)}
            className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
          >
            Edit
          </button>
        </div>
      )}
    </Modal>
  )
}

// =============================================================================
// Kanban card
// =============================================================================

function KanbanCard({ request, isAdmin, onMove, onOpen }: {
  request: FeatureRequest
  isAdmin: boolean
  onMove:  (id: string, status: Status) => void
  onOpen:  (request: FeatureRequest) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function h(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const otherCols = COLUMNS.filter(c => c.key !== request.status)

  return (
    <div className="group relative rounded-lg border border-[#334155] bg-[#0f172a] p-3.5 shadow-sm transition hover:border-slate-500">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onOpen(request)}
          className="flex-1 text-left text-sm font-medium text-white leading-snug hover:text-blue-400 line-clamp-2"
        >
          {request.title}
        </button>

        {/* Move menu (admin only) */}
        {isAdmin && (
          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="rounded p-0.5 text-slate-600 opacity-0 transition hover:bg-white/[0.06] hover:text-slate-400 group-hover:opacity-100"
              title="Move to…"
            >
              <MoreHorizontal size={15} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-md border border-[#334155] bg-[#1e293b] shadow-xl">
                <p className="px-3 pt-2 pb-1 text-xs text-slate-500 uppercase tracking-wide">Move to</p>
                {otherCols.map(c => (
                  <button
                    key={c.key}
                    onClick={() => { onMove(request.id, c.key); setMenuOpen(false) }}
                    className="flex w-full items-center px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      {request.description && (
        <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">{request.description}</p>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[request.priority]}`}>
          {capitalize(request.priority)}
        </span>
        <div className="text-right">
          <p className="text-xs text-slate-600">{request.profiles?.full_name ?? 'Unknown'}</p>
          <p className="text-xs text-slate-700">{fmtDate(request.created_at)}</p>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Page
// =============================================================================

export default function FeatureRequestsPage() {
  const { role, user } = useAuth()
  const toast          = useToast()
  const isAdmin        = role === 'admin'

  const [requests,   setRequests]   = useState<FeatureRequest[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [saving,     setSaving]     = useState(false)

  const [addOpen,    setAddOpen]    = useState(false)
  const [detail,     setDetail]     = useState<FeatureRequest | null>(null)

  // Load
  useEffect(() => {
    async function load() {
      setLoading(true); setError(null)
      try {
        const { data, error: qErr } = await supabase
          .from('feature_requests')
          .select('id, title, description, priority, status, created_at, requested_by, profiles(full_name)')
          .order('created_at', { ascending: false })
        if (qErr) throw qErr
        setRequests((data as FeatureRequest[]) ?? [])
      } catch (e) {
        setError('Failed to load feature requests.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleAdd(data: FormData) {
    setSaving(true)
    const { data: inserted, error } = await supabase
      .from('feature_requests')
      .insert({
        title:        data.title.trim(),
        description:  data.description.trim() || null,
        priority:     data.priority,
        status:       'idea',
        requested_by: user?.id ?? null,
      })
      .select('id, title, description, priority, status, created_at, requested_by, profiles(full_name)')
      .single()

    setSaving(false)
    if (error) { toast('Failed to create request.', 'error'); return }
    setRequests(prev => [inserted as FeatureRequest, ...prev])
    setAddOpen(false)
    toast('Request added.')
  }

  async function handleMove(id: string, status: Status) {
    // Optimistic
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    const { error } = await supabase
      .from('feature_requests')
      .update({ status })
      .eq('id', id)
    if (error) {
      // Revert
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: r.status } : r))
      toast('Failed to move request.', 'error')
    } else {
      toast(`Moved to ${COLUMNS.find(c => c.key === status)?.label}.`)
    }
  }

  async function handleEdit(data: FormData & { status?: Status }) {
    if (!detail) return
    setSaving(true)
    const payload = {
      title:       data.title.trim(),
      description: data.description.trim() || null,
      priority:    data.priority,
      ...(data.status ? { status: data.status } : {}),
    }
    const { error } = await supabase
      .from('feature_requests')
      .update(payload)
      .eq('id', detail.id)
    setSaving(false)
    if (error) { toast('Failed to update request.', 'error'); return }
    setRequests(prev => prev.map(r => r.id === detail.id ? { ...r, ...payload } : r))
    setDetail(null)
    toast('Request updated.')
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const byStatus = (status: Status) => requests.filter(r => r.status === status)

  return (
    <div className="flex h-full flex-col space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Feature Requests</h1>
          <p className="mt-0.5 text-sm text-slate-400">Track and prioritise improvement ideas</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
        >
          <Plus size={15} /> Add Request
        </button>
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map(col => {
            const cards = byStatus(col.key)
            return (
              <div key={col.key} className="flex flex-col rounded-xl border border-[#334155] bg-[#1e293b]">
                {/* Column header */}
                <div className="flex items-center justify-between border-b border-[#334155] px-4 py-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{col.label}</h2>
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-700/60 px-1.5 text-xs font-medium text-slate-400">
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
                  {cards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
                      <Lightbulb className="h-6 w-6 text-slate-700" />
                      <p className="text-xs text-slate-600">No requests here</p>
                    </div>
                  ) : (
                    cards.map(req => (
                      <KanbanCard
                        key={req.id}
                        request={req}
                        isAdmin={isAdmin}
                        onMove={handleMove}
                        onOpen={setDetail}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add modal */}
      {addOpen && (
        <Modal title="Add Feature Request" onClose={() => setAddOpen(false)}>
          <RequestForm
            defaultValues={DEFAULT_FORM}
            isAdmin={isAdmin}
            onSubmit={handleAdd}
            onCancel={() => setAddOpen(false)}
            saving={saving}
          />
        </Modal>
      )}

      {/* Detail / edit modal */}
      {detail && (
        <DetailModal
          request={detail}
          isAdmin={isAdmin}
          onClose={() => setDetail(null)}
          onSave={handleEdit}
          saving={saving}
        />
      )}
    </div>
  )
}
