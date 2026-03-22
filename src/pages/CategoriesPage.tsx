import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Loader2, Tag, X, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toaster'

// =============================================================================
// Types
// =============================================================================

interface Category {
  id: string
  name: string
  description: string | null
  is_active: boolean
  tender_count: number
}

interface FormData {
  name: string
  description: string
  is_active: boolean
}

const DEFAULT_FORM: FormData = { name: '', description: '', is_active: true }

// =============================================================================
// Helpers
// =============================================================================

const INPUT_CLS    = 'h-9 w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const TEXTAREA_CLS = 'w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const LABEL_CLS    = 'block text-xs font-medium uppercase tracking-wide text-slate-500'

// =============================================================================
// Toggle
// =============================================================================

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={e => { e.stopPropagation(); onChange(!checked) }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${checked ? 'bg-blue-500' : 'bg-slate-600'}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
    </button>
  )
}

// =============================================================================
// Modal
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl">
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
// CategoryForm
// =============================================================================

function CategoryForm({ defaultValues, onSubmit, onCancel, saving }: {
  defaultValues: FormData
  onSubmit: (data: FormData) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<FormData>(defaultValues)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  return (
    <div>
      <div className="space-y-4 px-6 py-5">
        <div className="space-y-1.5">
          <label className={LABEL_CLS}>Name <span className="text-red-400">*</span></label>
          <input
            ref={nameRef}
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. IT Equipment"
            className={INPUT_CLS}
          />
        </div>

        <div className="space-y-1.5">
          <label className={LABEL_CLS}>Description</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={3}
            placeholder="Optional description…"
            className={TEXTAREA_CLS}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border border-[#334155] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">Active</p>
            <p className="text-xs text-slate-500">Inactive categories won't appear in filters</p>
          </div>
          <Toggle checked={form.is_active} onChange={v => set('is_active', v)} />
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
          disabled={saving || !form.name.trim()}
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
// ConfirmDialog
// =============================================================================

function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void
}) {
  useEffect(() => {
    function h(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl">
        <div className="px-6 py-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <p className="text-sm text-slate-300">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#334155] px-6 py-4">
          <button
            onClick={onCancel}
            className="rounded-md border border-[#334155] px-4 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// WarningDialog — when tender count > 0
// =============================================================================

function WarningDialog({ name, count, onClose }: { name: string; count: number; onClose: () => void }) {
  useEffect(() => {
    function h(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl">
        <div className="px-6 py-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="text-sm font-medium text-white">Cannot delete "{name}"</p>
              <p className="mt-1 text-sm text-slate-400">
                This category has {count} assigned tender{count !== 1 ? 's' : ''}. Remove the category from all tenders before deleting it.
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-[#334155] px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md bg-[#0f172a] px-4 py-2 text-sm text-slate-300 transition hover:text-white"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Page
// =============================================================================

export default function CategoriesPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const toast    = useToast()

  const [categories,  setCategories]  = useState<Category[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [refreshKey,  setRefreshKey]  = useState(0)

  // modal state: null=closed, 'new'=add, Category=edit
  const [modal,       setModal]       = useState<null | 'new' | Category>(null)

  // delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  // warning for non-empty delete
  const [warnTarget,   setWarnTarget]   = useState<Category | null>(null)

  // Admin guard
  useEffect(() => {
    if (role && role !== 'admin') navigate('/', { replace: true })
  }, [role, navigate])

  // Fetch categories with tender counts
  useEffect(() => {
    async function load() {
      setLoading(true); setError(null)
      try {
        // Fetch categories + count of non-deleted tenders per category
        const { data, error: qErr } = await supabase
          .from('tender_categories')
          .select('id, name, description, is_active')
          .order('name')

        if (qErr) throw qErr

        // Fetch tender counts per category
        const { data: tenderData, error: tErr } = await supabase
          .from('tenders')
          .select('category_id')

        if (tErr) throw tErr

        const counts: Record<string, number> = {}
        for (const t of (tenderData ?? [])) {
          if (t.category_id) counts[t.category_id] = (counts[t.category_id] ?? 0) + 1
        }

        const rows: Category[] = (data ?? []).map(c => ({
          ...c,
          tender_count: counts[c.id] ?? 0,
        }))

        setCategories(rows)
      } catch (e) {
        setError('Failed to load categories.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [refreshKey])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleToggleActive(cat: Category) {
    const next = !cat.is_active
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: next } : c))
    const { error } = await supabase.from('tender_categories').update({ is_active: next }).eq('id', cat.id)
    if (error) {
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: !next } : c))
      toast('Failed to update category.', 'error')
    } else {
      toast(next ? 'Category activated.' : 'Category deactivated.')
    }
  }

  async function handleSave(data: FormData) {
    setSaving(true)
    const payload = {
      name:        data.name.trim(),
      description: data.description.trim() || null,
      is_active:   data.is_active,
    }
    const isNew = modal === 'new'
    const { error } = isNew
      ? await supabase.from('tender_categories').insert(payload)
      : await supabase.from('tender_categories').update(payload).eq('id', (modal as Category).id)

    setSaving(false)
    if (error) { toast('Failed to save category.', 'error'); return }
    toast(isNew ? 'Category added.' : 'Category updated.')
    setModal(null)
    setRefreshKey(k => k + 1)
  }

  function requestDelete(cat: Category) {
    if (cat.tender_count > 0) {
      setWarnTarget(cat)
    } else {
      setDeleteTarget(cat)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const { error } = await supabase.from('tender_categories').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    if (error) { toast('Failed to delete category.', 'error'); return }
    toast('Category deleted.')
    setRefreshKey(k => k + 1)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Categories</h1>
          <p className="mt-0.5 text-sm text-slate-400">Manage tender categories</p>
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-1.5 rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
        >
          <Plus size={15} /> Add Category
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#334155] bg-[#1e293b]">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <Tag className="h-7 w-7 text-slate-600" />
            <p className="text-sm text-slate-400">No categories yet</p>
            <button onClick={() => setModal('new')} className="text-xs text-blue-400 hover:underline">
              Add your first category
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#334155] bg-[#0f172a]/60">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Description</th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wide text-slate-500">Tenders</th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wide text-slate-500">Active</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {categories.map((cat, i) => (
                  <tr
                    key={cat.id}
                    className={[
                      i % 2 === 1 ? 'bg-white/[0.015]' : '',
                      i !== categories.length - 1 ? 'border-b border-[#334155]/50' : '',
                    ].join(' ')}
                  >
                    <td className="px-6 py-3.5 font-medium text-white">{cat.name}</td>
                    <td className="px-6 py-3.5 text-slate-400">
                      {cat.description
                        ? <span>{cat.description.length > 80 ? cat.description.slice(0, 80) + '…' : cat.description}</span>
                        : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-6 py-3.5 text-center tabular-nums text-slate-400">{cat.tender_count}</td>
                    <td className="px-6 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <Toggle checked={cat.is_active} onChange={() => handleToggleActive(cat)} />
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setModal(cat)}
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => requestDelete(cat)}
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {modal !== null && (
        <Modal
          title={modal === 'new' ? 'Add Category' : 'Edit Category'}
          onClose={() => setModal(null)}
        >
          <CategoryForm
            key={modal === 'new' ? 'new' : (modal as Category).id}
            defaultValues={modal === 'new' ? DEFAULT_FORM : {
              name:        (modal as Category).name,
              description: (modal as Category).description ?? '',
              is_active:   (modal as Category).is_active,
            }}
            onSubmit={handleSave}
            onCancel={() => setModal(null)}
            saving={saving}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          message={`Delete category "${deleteTarget.name}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Warning: has tenders */}
      {warnTarget && (
        <WarningDialog
          name={warnTarget.name}
          count={warnTarget.tender_count}
          onClose={() => setWarnTarget(null)}
        />
      )}
    </div>
  )
}
