import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Loader2, Mail, Phone, Globe, Tag, FileText, X, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { REQUEST_STATUS_BADGE } from '../lib/badges'
import type { RequestStatus } from '../lib/badges'
import { useToast } from '../components/Toaster'
import type { ReactNode } from 'react'

// =============================================================================
// Types
// =============================================================================

type SupplierType = 'intermediary' | 'manufacturer' | 'distributor'

interface Supplier {
  id: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  country: string
  type: SupplierType
  categories: string[] | null
  notes: string | null
  is_active: boolean
}

interface Category { id: string; name: string }

interface RequestRow {
  id: string
  created_at: string
  response_status: RequestStatus
  quoted_price: number | null
  currency: string
  tenders: { id: string; title: string } | null
}

interface FormData {
  name: string
  contact_person: string
  email: string
  phone: string
  country: string
  type: SupplierType
  categories: string[]
  notes: string
  is_active: boolean
}

// =============================================================================
// Constants
// =============================================================================

const ALL_TYPES: SupplierType[] = ['intermediary', 'manufacturer', 'distributor']

const TYPE_BADGE: Record<SupplierType, string> = {
  intermediary: 'bg-blue-500/15 text-blue-400',
  manufacturer: 'bg-emerald-500/15 text-emerald-400',
  distributor:  'bg-violet-500/15 text-violet-400',
}

const INPUT_CLS   = 'h-9 w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const SELECT_CLS  = `${INPUT_CLS} cursor-pointer`
const LABEL_CLS   = 'block text-xs font-medium uppercase tracking-wide text-slate-500'

const RO_NUMBER = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// =============================================================================
// Helpers
// =============================================================================

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatPrice(v: number | null, currency: string) {
  return v == null ? '—' : `${RO_NUMBER.format(v)} ${currency}`
}

// =============================================================================
// Toggle (same as SuppliersPage)
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
// FormMultiSelect
// =============================================================================

function FormMultiSelect({ options, selected, onChange, placeholder }: {
  options:     { value: string; label: string }[]
  selected:    string[]
  onChange:    (v: string[]) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const ref = { current: null as HTMLDivElement | null }

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])
  }

  return (
    <div ref={el => { ref.current = el }} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-[#334155] bg-[#0f172a] px-3 text-sm transition hover:border-slate-500"
      >
        <span className={selected.length === 0 ? 'text-slate-600' : 'text-white'}>
          {selected.length === 0 ? placeholder : `${selected.length} selected`}
        </span>
        <ChevronDown size={13} className="shrink-0 text-slate-500" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-[#334155] bg-[#1e293b] shadow-xl">
          {options.length === 0
            ? <p className="px-3 py-2 text-sm text-slate-500">No categories</p>
            : options.map(opt => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.05]">
                <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} className="accent-blue-500" />
                {opt.label}
              </label>
            ))
          }
        </div>
      )}
    </div>
  )
}

// =============================================================================
// SlideOver
// =============================================================================

function SlideOver({ open, title, onClose, children }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    function h(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/60 transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <div className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[#334155] bg-[#1e293b] shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-[#334155] px-6 py-4">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>
        {children}
      </div>
    </>
  )
}

// =============================================================================
// SupplierForm
// =============================================================================

function supplierToForm(s: Supplier): FormData {
  return {
    name:           s.name,
    contact_person: s.contact_person ?? '',
    email:          s.email ?? '',
    phone:          s.phone ?? '',
    country:        s.country,
    type:           s.type,
    categories:     s.categories ?? [],
    notes:          s.notes ?? '',
    is_active:      s.is_active,
  }
}

function SupplierForm({ defaultValues, onSubmit, onCancel, saving, categories }: {
  defaultValues: FormData
  onSubmit:      (data: FormData) => void
  onCancel:      () => void
  saving:        boolean
  categories:    Category[]
}) {
  const [form, setForm] = useState<FormData>(defaultValues)
  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div className="space-y-1.5">
          <label className={LABEL_CLS}>Name <span className="text-red-400">*</span></label>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Supplier Inc." className={INPUT_CLS} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={LABEL_CLS}>Contact Person</label>
            <input type="text" value={form.contact_person} onChange={e => set('contact_person', e.target.value)} placeholder="John Doe" className={INPUT_CLS} />
          </div>
          <div className="space-y-1.5">
            <label className={LABEL_CLS}>Phone</label>
            <input type="text" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+86 …" className={INPUT_CLS} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={LABEL_CLS}>Email</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@supplier.com" className={INPUT_CLS} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={LABEL_CLS}>Country</label>
            <input type="text" value={form.country} onChange={e => set('country', e.target.value)} placeholder="China" className={INPUT_CLS} />
          </div>
          <div className="space-y-1.5">
            <label className={LABEL_CLS}>Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value as SupplierType)} className={SELECT_CLS}>
              {ALL_TYPES.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={LABEL_CLS}>Categories</label>
          <FormMultiSelect
            options={categories.map(c => ({ value: c.id, label: c.name }))}
            selected={form.categories}
            onChange={v => set('categories', v)}
            placeholder="Select categories…"
          />
        </div>

        <div className="space-y-1.5">
          <label className={LABEL_CLS}>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            placeholder="Internal notes…"
            className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center justify-between rounded-md border border-[#334155] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">Active</p>
            <p className="text-xs text-slate-500">Inactive suppliers won't appear in outreach</p>
          </div>
          <Toggle checked={form.is_active} onChange={v => set('is_active', v)} />
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-[#334155] px-6 py-4">
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
// InfoRow helper
// =============================================================================

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0 text-slate-500">{icon}</div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm text-white">{value || '—'}</p>
      </div>
    </div>
  )
}

// =============================================================================
// Page
// =============================================================================

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const toast     = useToast()

  const [supplier,   setSupplier]   = useState<Supplier | null>(null)
  const [requests,   setRequests]   = useState<RequestRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [editing,    setEditing]    = useState(false)
  const [saving,     setSaving]     = useState(false)

  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]))

  useEffect(() => {
    if (!id) return

    async function load() {
      setLoading(true); setError(null)
      try {
        const [
          { data: sup, error: sErr },
          { data: reqs, error: rErr },
          { data: cats },
        ] = await Promise.all([
          supabase.from('suppliers')
            .select('id, name, contact_person, email, phone, country, type, categories, notes, is_active')
            .eq('id', id)
            .single(),
          supabase.from('supplier_requests')
            .select('id, created_at, response_status, quoted_price, currency, tenders(id, title)')
            .eq('supplier_id', id)
            .order('created_at', { ascending: false }),
          supabase.from('tender_categories').select('id, name').eq('is_active', true).order('name'),
        ])

        if (sErr) throw sErr
        if (rErr) throw rErr

        setSupplier(sup as Supplier)
        setRequests((reqs as RequestRow[]) ?? [])
        setCategories((cats as Category[]) ?? [])
      } catch (e) {
        setError('Failed to load supplier.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  async function handleSave(data: FormData) {
    if (!supplier) return
    setSaving(true)
    const payload = {
      name:           data.name.trim(),
      contact_person: data.contact_person.trim() || null,
      email:          data.email.trim() || null,
      phone:          data.phone.trim() || null,
      country:        data.country.trim() || 'China',
      type:           data.type,
      categories:     data.categories.length > 0 ? data.categories : null,
      notes:          data.notes.trim() || null,
      is_active:      data.is_active,
    }
    const { error } = await supabase.from('suppliers').update(payload).eq('id', supplier.id)
    setSaving(false)
    if (error) { toast('Failed to save supplier.', 'error'); return }
    setSupplier({ ...supplier, ...payload, categories: payload.categories })
    setEditing(false)
    toast('Supplier updated.')
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
    </div>
  )

  if (error || !supplier) return (
    <div className="flex h-64 items-center justify-center">
      <p className="text-sm text-red-400">{error ?? 'Supplier not found.'}</p>
    </div>
  )

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const totalRequests  = requests.length
  const responded      = requests.filter(r => r.response_status !== 'pending' && r.response_status !== 'no_response').length
  const responseRate   = totalRequests > 0 ? Math.round((responded / totalRequests) * 100) : 0
  const quotedPrices   = requests.filter(r => r.quoted_price != null).map(r => r.quoted_price!)
  const avgPrice       = quotedPrices.length > 0
    ? quotedPrices.reduce((a, b) => a + b, 0) / quotedPrices.length
    : null

  const supplierCatNames = (supplier.categories ?? []).map(id => categoryMap[id]).filter(Boolean)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/suppliers')}
            className="mt-0.5 rounded-md p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-white">{supplier.name}</h1>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE[supplier.type]}`}>
                {supplier.type}
              </span>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${supplier.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/10 text-slate-500'}`}>
                {supplier.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-400">{supplier.country}</p>
          </div>
        </div>

        <button
          onClick={() => setEditing(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#334155] px-3 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-white"
        >
          <Pencil size={13} /> Edit
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Requests', value: String(totalRequests) },
          { label: 'Response Rate', value: `${responseRate}%` },
          { label: 'Avg. Quoted Price', value: avgPrice != null ? `${RO_NUMBER.format(avgPrice)} RON` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-[#334155] bg-[#1e293b] px-5 py-4">
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="mt-1 text-xs text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-[#334155] bg-[#1e293b]">
        <div className="border-b border-[#334155] px-6 py-4">
          <h2 className="text-sm font-semibold text-white">Supplier Info</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow icon={<Mail size={15} />}  label="Email"          value={supplier.email} />
          <InfoRow icon={<Phone size={15} />} label="Phone"          value={supplier.phone} />
          <InfoRow icon={<Globe size={15} />} label="Country"        value={supplier.country} />
          <InfoRow icon={<Tag size={15} />}   label="Contact Person" value={supplier.contact_person} />
          <div className="flex items-start gap-3 sm:col-span-2">
            <div className="mt-0.5 shrink-0 text-slate-500"><Tag size={15} /></div>
            <div>
              <p className="text-xs text-slate-500">Categories</p>
              {supplierCatNames.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {supplierCatNames.map(name => (
                    <span key={name} className="inline-flex rounded-full bg-slate-700/50 px-2.5 py-0.5 text-xs text-slate-300">{name}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white">—</p>
              )}
            </div>
          </div>
        </div>

        {supplier.notes && (
          <div className="border-t border-[#334155] px-6 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0 text-slate-500"><FileText size={15} /></div>
              <div>
                <p className="text-xs text-slate-500">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{supplier.notes}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Request history */}
      <div className="rounded-xl border border-[#334155] bg-[#1e293b]">
        <div className="border-b border-[#334155] px-6 py-4">
          <h2 className="text-sm font-semibold text-white">Request History</h2>
          <p className="mt-0.5 text-xs text-slate-500">{totalRequests} request{totalRequests !== 1 ? 's' : ''} sent</p>
        </div>

        {requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Mail className="h-6 w-6 text-slate-600" />
            <p className="text-sm text-slate-400">No requests sent yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#334155] bg-[#0f172a]/60">
                  {['Tender', 'Sent Date', 'Response Status', 'Quoted Price'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={() => r.tenders && navigate(`/tenders/${r.tenders.id}`)}
                    className={[
                      r.tenders ? 'cursor-pointer hover:bg-white/[0.04]' : '',
                      'transition-colors',
                      i % 2 === 1 ? 'bg-white/[0.015]' : '',
                      i !== requests.length - 1 ? 'border-b border-[#334155]/50' : '',
                    ].join(' ')}
                  >
                    <td className="px-6 py-3.5 font-medium text-white">
                      {r.tenders ? (
                        <span className="hover:text-blue-400 hover:underline">{r.tenders.title}</span>
                      ) : (
                        <span className="text-slate-500 italic">Tender removed</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 tabular-nums text-slate-400">{formatDate(r.created_at)}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${REQUEST_STATUS_BADGE[r.response_status]}`}>
                        {r.response_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 tabular-nums text-slate-400">{formatPrice(r.quoted_price, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit slide-over */}
      <SlideOver open={editing} title="Edit Supplier" onClose={() => setEditing(false)}>
        {editing && (
          <SupplierForm
            key={supplier.id}
            defaultValues={supplierToForm(supplier)}
            onSubmit={handleSave}
            onCancel={() => setEditing(false)}
            saving={saving}
            categories={categories}
          />
        )}
      </SlideOver>
    </div>
  )
}
