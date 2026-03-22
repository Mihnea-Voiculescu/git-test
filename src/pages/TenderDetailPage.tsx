import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, ExternalLink, Loader2, Save,
  X, AlertTriangle, ChevronDown, ChevronUp, Plus,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toaster'
import { REQUEST_STATUS_BADGE } from '../lib/badges'
import type { TenderStatus, RequestStatus, BidResult } from '../lib/badges'

// =============================================================================
// Types
// =============================================================================

const ALL_STATUSES: TenderStatus[] = [
  'new', 'reviewed', 'interested', 'applied', 'won', 'lost', 'withdrawn', 'expired',
]

interface TenderDetail {
  id: string
  external_id: string
  title: string
  description: string | null
  contracting_authority: string
  estimated_value: number | null
  currency: string
  cpv_code: string | null
  deadline: string
  publication_date: string
  source_url: string | null
  status: TenderStatus
  category_id: string | null
  notes: string | null
  tender_categories: { id: string; name: string } | null
}

interface SupplierRequest {
  id: string
  sent_at: string
  response_status: RequestStatus
  response_notes: string | null
  quoted_price: number | null
  quoted_currency: string | null
  suppliers: { name: string } | null
}

interface Bid {
  id: string
  company_name: string
  bid_price: number
  bid_currency: string
  submitted_at: string | null
  result: BidResult | null
  result_price: number | null
  notes: string | null
  created_at: string
}

interface Category { id: string; name: string }
interface Supplier { id: string; name: string }

// Shared input class
const INPUT_CLS = 'h-9 rounded-md border border-[#334155] bg-[#0f172a] px-3 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const TEXTAREA_CLS = 'w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

// =============================================================================
// Helpers
// =============================================================================

const RO_NUMBER = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatValue(v: number | null, currency: string) {
  return v == null ? '—' : `${RO_NUMBER.format(v)} ${currency}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function deadlineInfo(iso: string) {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (days < 0)  return { text: 'Expired',       color: 'text-slate-400' }
  if (days === 0) return { text: 'Due today',     color: 'text-red-500 font-semibold' }
  const color = days < 3 ? 'text-red-400 font-medium' : days < 7 ? 'text-amber-400 font-medium' : 'text-slate-400'
  return { text: `${days} day${days !== 1 ? 's' : ''} remaining`, color }
}

// Business rule: message MUST NOT include contracting_authority, estimated_value, or source_url
function generateMessage(t: TenderDetail) {
  const lines = [
    'Dear Supplier,',
    '',
    'We are currently evaluating the following procurement opportunity and would like to request a quotation:',
    '',
    `Title: ${t.title}`,
  ]
  if (t.description) lines.push('', 'Description:', t.description)
  lines.push('', 'Please provide your best offer at your earliest convenience.', '', 'Thank you.')
  return lines.join('\n')
}

// =============================================================================
// Small shared components
// =============================================================================

function InfoField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-sm text-white">{children}</div>
    </div>
  )
}

function SectionCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#334155] bg-[#1e293b] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

// =============================================================================
// CollapsibleText
// =============================================================================

function CollapsibleText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 4)
  }, [text])

  return (
    <div>
      <p
        ref={ref}
        className={['whitespace-pre-wrap text-sm text-slate-400 leading-relaxed', expanded ? '' : 'line-clamp-4'].join(' ')}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {expanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show more</>}
        </button>
      )}
    </div>
  )
}

// =============================================================================
// SupplierModal
// =============================================================================

function SupplierModal({
  tender, onClose, onSent,
}: { tender: TenderDetail; onClose: () => void; onSent: () => void }) {
  const toast = useToast()
  const { user } = useAuth()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [message, setMessage] = useState(() => generateMessage(tender))
  const [sending, setSending] = useState(false)

  useEffect(() => {
    supabase.from('suppliers').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => {
        const list = data ?? []
        setSuppliers(list)
        if (list.length) setSupplierId(list[0].id)
      })
  }, [])

  async function handleSend() {
    if (!supplierId) { toast('Please select a supplier.', 'error'); return }
    setSending(true)
    const { error } = await supabase.from('supplier_requests').insert({
      tender_id:      tender.id,
      supplier_id:    supplierId,
      sent_at:        new Date().toISOString(),
      sent_by:        user?.id ?? null,
      message_content: message,
      response_status: 'pending',
    })
    setSending(false)
    if (error) { toast('Failed to log request.', 'error'); return }
    toast('Request logged successfully.')
    onSent()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#334155] px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Send to Supplier</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Supplier</label>
            {suppliers.length === 0 ? (
              <p className="text-sm text-slate-500">No active suppliers found. Add one in the Suppliers page first.</p>
            ) : (
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={`${INPUT_CLS} w-full`}>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={11} className={`${TEXTAREA_CLS} leading-relaxed`} />
          </div>
          <p className="rounded-md bg-[#0f172a] px-3 py-2 text-xs text-slate-500">
            Message will be sent via the automation system. This action only logs the request — no email is sent directly.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#334155] px-5 py-4">
          <button onClick={onClose} className="rounded-md border border-[#334155] px-4 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-white">Cancel</button>
          <button onClick={handleSend} disabled={sending || !supplierId} className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:opacity-50">
            {sending ? 'Logging…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// BidModal
// =============================================================================

function BidModal({
  tenderId, userId, onClose, onAdded,
}: { tenderId: string; userId: string | undefined; onClose: () => void; onAdded: () => void }) {
  const toast = useToast()
  const [companyName, setCompanyName] = useState('')
  const [bidPrice, setBidPrice] = useState('')
  const [currency, setCurrency] = useState('RON')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!companyName.trim()) { toast('Company name is required.', 'error'); return }
    if (!bidPrice || isNaN(Number(bidPrice))) { toast('Enter a valid bid price.', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('bids').insert({
      tender_id:    tenderId,
      company_name: companyName.trim(),
      bid_price:    Number(bidPrice),
      bid_currency: currency,
      notes:        notes.trim() || null,
      created_by:   userId ?? null,
    })
    setSaving(false)
    if (error) { toast('Failed to add bid.', 'error'); return }
    toast('Bid added.')
    onAdded()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#334155] px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Add Bid</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Company Name</label>
            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme SRL" className={`${INPUT_CLS} w-full`} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Bid Price</label>
              <input type="number" value={bidPrice} onChange={e => setBidPrice(e.target.value)} placeholder="0.00" className={`${INPUT_CLS} w-full`} />
            </div>
            <div className="w-24 space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Currency</label>
              <input type="text" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 3))} className={`${INPUT_CLS} w-full`} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes <span className="normal-case text-slate-600">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={TEXTAREA_CLS} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#334155] px-5 py-4">
          <button onClick={onClose} className="rounded-md border border-[#334155] px-4 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-white">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Bid'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// TenderDetailPage
// =============================================================================

export default function TenderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const [tender, setTender]               = useState<TenderDetail | null>(null)
  const [categories, setCategories]       = useState<Category[]>([])
  const [requests, setRequests]           = useState<SupplierRequest[]>([])
  const [bids, setBids]                   = useState<Bid[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)

  const [notes, setNotes]                 = useState('')
  const [notesSaving, setNotesSaving]     = useState(false)
  const [notesSaved, setNotesSaved]       = useState(false)
  const notesRef                          = useRef('')

  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [showBidModal, setShowBidModal]           = useState(false)
  const [pendingStatus, setPendingStatus]         = useState<TenderStatus | null>(null)

  // ---------------------------------------------------------------------------
  // Data loaders (also used as callbacks after modal actions)
  // ---------------------------------------------------------------------------

  async function loadRequests() {
    const { data } = await supabase
      .from('supplier_requests')
      .select('id, sent_at, response_status, response_notes, quoted_price, quoted_currency, suppliers(name)')
      .eq('tender_id', id!)
      .order('sent_at', { ascending: false })
    setRequests((data as SupplierRequest[]) ?? [])
  }

  async function loadBids() {
    const { data } = await supabase
      .from('bids')
      .select('id, company_name, bid_price, bid_currency, submitted_at, result, result_price, notes, created_at')
      .eq('tender_id', id!)
      .order('created_at', { ascending: false })
    setBids((data as Bid[]) ?? [])
  }

  useEffect(() => {
    if (!id) return
    async function load() {
      setLoading(true)
      try {
        const [
          { data: t, error: tErr },
          { data: cats },
          { data: reqs },
          { data: bidsData },
        ] = await Promise.all([
          supabase
            .from('tenders')
            .select('id, external_id, title, description, contracting_authority, estimated_value, currency, cpv_code, deadline, publication_date, source_url, status, category_id, notes, tender_categories(id, name)')
            .eq('id', id)
            .single(),
          supabase.from('tender_categories').select('id, name').eq('is_active', true).order('name'),
          supabase
            .from('supplier_requests')
            .select('id, sent_at, response_status, response_notes, quoted_price, quoted_currency, suppliers(name)')
            .eq('tender_id', id)
            .order('sent_at', { ascending: false }),
          supabase
            .from('bids')
            .select('id, company_name, bid_price, bid_currency, submitted_at, result, result_price, notes, created_at')
            .eq('tender_id', id)
            .order('created_at', { ascending: false }),
        ])
        if (tErr) throw tErr
        const tender = t as TenderDetail
        setTender(tender)
        setCategories(cats ?? [])
        setRequests((reqs as SupplierRequest[]) ?? [])
        setBids((bidsData as Bid[]) ?? [])
        const n = tender.notes ?? ''
        setNotes(n)
        notesRef.current = n
      } catch {
        setError('Tender not found.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  // ---------------------------------------------------------------------------
  // Notes auto-save (1.5s debounce)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!tender) return
    if (notes === notesRef.current) return
    setNotesSaved(false)
    const timer = setTimeout(async () => {
      setNotesSaving(true)
      const { error } = await supabase
        .from('tenders')
        .update({ notes, updated_at: new Date().toISOString() })
        .eq('id', id!)
      setNotesSaving(false)
      if (!error) {
        notesRef.current = notes
        setNotesSaved(true)
        setTimeout(() => setNotesSaved(false), 2000)
      } else {
        toast('Failed to save notes.', 'error')
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [notes, id, tender])  // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Update handlers
  // ---------------------------------------------------------------------------

  async function handleStatusChange(newStatus: TenderStatus) {
    if (newStatus === 'withdrawn') {
      setPendingStatus(newStatus)
      return
    }
    await commitStatusChange(newStatus)
  }

  async function commitStatusChange(newStatus: TenderStatus) {
    const { error } = await supabase
      .from('tenders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id!)
    if (error) { toast('Failed to update status.', 'error'); return }
    setTender(prev => prev ? { ...prev, status: newStatus } : prev)
    toast('Status updated.')
  }

  async function handleCategoryChange(categoryId: string) {
    const { error } = await supabase
      .from('tenders')
      .update({ category_id: categoryId || null, updated_at: new Date().toISOString() })
      .eq('id', id!)
    if (error) { toast('Failed to update category.', 'error'); return }
    const cat = categories.find(c => c.id === categoryId) ?? null
    setTender(prev => prev
      ? { ...prev, category_id: categoryId || null, tender_categories: cat ? { id: cat.id, name: cat.name } : null }
      : prev)
    toast('Category updated.')
  }

  async function handleBidResultChange(bidId: string, result: BidResult | '') {
    const { error } = await supabase
      .from('bids')
      .update({ result: result || null })
      .eq('id', bidId)
    if (error) { toast('Failed to update bid result.', 'error'); return }
    setBids(prev => prev.map(b => b.id === bidId ? { ...b, result: (result || null) as BidResult | null } : b))
    toast('Bid result updated.')
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    )
  }

  if (error || !tender) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">{error ?? 'Tender not found.'}</p>
        <button onClick={() => navigate('/tenders')} className="text-sm text-primary hover:underline">
          Back to Tenders
        </button>
      </div>
    )
  }

  const dl = deadlineInfo(tender.deadline)

  return (
    <div className="space-y-6">

      {/* Back */}
      <button
        onClick={() => navigate('/tenders')}
        className="flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-200"
      >
        <ArrowLeft size={14} /> Back to Tenders
      </button>

      {/* Header */}
      <div className="rounded-xl border border-[#334155] bg-[#1e293b] p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold leading-snug text-white">{tender.title}</h1>
          <p className="mt-1 text-sm text-slate-400">{tender.contracting_authority}</p>
        </div>
        <div className="flex flex-wrap gap-6">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</label>
            <select
              value={tender.status}
              onChange={e => handleStatusChange(e.target.value as TenderStatus)}
              className={INPUT_CLS}
            >
              {ALL_STATUSES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Category</label>
            <select
              value={tender.category_id ?? ''}
              onChange={e => handleCategoryChange(e.target.value)}
              className={INPUT_CLS}
            >
              <option value="">— Unassigned —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Info grid */}
      <SectionCard title="Details">
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-3">
          <InfoField label="Estimated Value">
            <span className="font-medium">{formatValue(tender.estimated_value, tender.currency)}</span>
          </InfoField>
          <InfoField label="CPV Code">
            <span className="font-mono">{tender.cpv_code ?? '—'}</span>
          </InfoField>
          <InfoField label="External ID">
            <span className="font-mono text-slate-400">{tender.external_id}</span>
          </InfoField>
          <InfoField label="Publication Date">
            <span>{formatDate(tender.publication_date)}</span>
          </InfoField>
          <InfoField label="Deadline">
            <span>{formatDate(tender.deadline)}</span>
            <span className={`ml-2 text-xs ${dl.color}`}>{dl.text}</span>
          </InfoField>
          <InfoField label="Source">
            {tender.source_url ? (
              <a
                href={tender.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline"
              >
                Open link <ExternalLink size={12} />
              </a>
            ) : (
              <span className="text-slate-500">—</span>
            )}
          </InfoField>
        </div>
      </SectionCard>

      {/* Description */}
      {tender.description && (
        <SectionCard title="Description">
          <CollapsibleText text={tender.description} />
        </SectionCard>
      )}

      {/* Notes */}
      <div className="rounded-xl border border-[#334155] bg-[#1e293b] p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Notes</h2>
          <span className={`flex items-center gap-1 text-xs text-emerald-400 transition-opacity duration-300 ${notesSaved ? 'opacity-100' : 'opacity-0'}`}>
            <Save size={11} /> Saved
          </span>
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          placeholder="Add internal notes about this tender…"
          className={TEXTAREA_CLS}
        />
        {notesSaving && <p className="mt-1 text-xs text-slate-500">Saving…</p>}
      </div>

      {/* Supplier Outreach */}
      <SectionCard
        title="Supplier Outreach"
        action={
          <button
            onClick={() => setShowSupplierModal(true)}
            className="flex items-center gap-1.5 rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
          >
            <Plus size={15} /> Send to Supplier
          </button>
        }
      >
        {requests.length === 0 ? (
          <p className="text-sm text-slate-500">No supplier requests for this tender yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#334155] bg-[#0f172a]/60 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Quoted Price</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r, i) => (
                  <tr key={r.id} className={i !== requests.length - 1 ? 'border-b border-[#334155]/50' : ''}>
                    <td className="px-3 py-2 font-medium">{r.suppliers?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-400">{formatDate(r.sent_at)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${REQUEST_STATUS_BADGE[r.response_status]}`}>
                        {r.response_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {r.quoted_price != null ? formatValue(r.quoted_price, r.quoted_currency ?? '') : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{r.response_notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Bids */}
      <SectionCard
        title="Bids"
        action={
          <button
            onClick={() => setShowBidModal(true)}
            className="flex items-center gap-1.5 rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
          >
            <Plus size={15} /> Add Bid
          </button>
        }
      >
        {bids.length === 0 ? (
          <p className="text-sm text-slate-500">No bids recorded for this tender yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#334155] bg-[#0f172a]/60 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2 text-right">Bid Price</th>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2 text-right">Result Price</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {bids.map((b, i) => (
                  <tr key={b.id} className={i !== bids.length - 1 ? 'border-b border-[#334155]/50' : ''}>
                    <td className="px-3 py-2 font-medium">{b.company_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatValue(b.bid_price, b.bid_currency)}</td>
                    <td className="px-3 py-2 text-slate-400">{b.submitted_at ? formatDate(b.submitted_at) : '—'}</td>
                    <td className="px-3 py-2">
                      <select
                        value={b.result ?? ''}
                        onChange={e => handleBidResultChange(b.id, e.target.value as BidResult | '')}
                        className="rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1 text-xs text-white outline-none transition focus:border-blue-500"
                      >
                        <option value="">—</option>
                        <option value="pending">Pending</option>
                        <option value="won">Won</option>
                        <option value="lost">Lost</option>
                        <option value="withdrawn">Withdrawn</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {b.result_price != null ? formatValue(b.result_price, b.bid_currency) : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{b.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Placeholder cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { title: 'Similar Tenders',    desc: 'AI-powered matching of related procurement opportunities.' },
          { title: 'Historical Winners', desc: 'Past bid results and winning companies for similar tenders.' },
        ].map(card => (
          <div key={card.title} className="rounded-xl border border-dashed border-[#334155]/50 bg-[#1e293b]/30 p-6 opacity-40">
            <p className="text-sm font-medium text-slate-400">{card.title}</p>
            <p className="mt-1 text-xs text-slate-600">{card.desc}</p>
            <span className="mt-3 inline-block rounded-full bg-[#334155]/50 px-2.5 py-0.5 text-xs text-slate-500">
              In Development
            </span>
          </div>
        ))}
      </div>

      {/* Modals */}
      {showSupplierModal && (
        <SupplierModal
          tender={tender}
          onClose={() => setShowSupplierModal(false)}
          onSent={loadRequests}
        />
      )}
      {showBidModal && (
        <BidModal
          tenderId={tender.id}
          userId={user?.id}
          onClose={() => setShowBidModal(false)}
          onAdded={loadBids}
        />
      )}

      {/* Withdrawn confirm dialog */}
      {pendingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPendingStatus(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl">
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-white">Mark as Withdrawn?</p>
                  <p className="mt-1 text-sm text-slate-400">This indicates the tender has been withdrawn. You can change the status again later if needed.</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#334155] px-6 py-4">
              <button
                onClick={() => setPendingStatus(null)}
                className="rounded-md border border-[#334155] px-4 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => { commitStatusChange(pendingStatus); setPendingStatus(null) }}
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
              >
                Yes, Withdraw
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
