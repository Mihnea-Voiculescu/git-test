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

// =============================================================================
// Types
// =============================================================================

type TenderStatus = 'new' | 'reviewed' | 'interested' | 'applied' | 'won' | 'lost' | 'withdrawn' | 'expired'
type RequestStatus = 'pending' | 'replied' | 'quoted' | 'rejected' | 'no_response'
type BidResult = 'pending' | 'won' | 'lost' | 'withdrawn'

const ALL_STATUSES: TenderStatus[] = [
  'new', 'reviewed', 'interested', 'applied', 'won', 'lost', 'withdrawn', 'expired',
]

const REQUEST_STATUS_BADGE: Record<RequestStatus, string> = {
  pending:     'bg-yellow-100 text-yellow-700',
  replied:     'bg-blue-100 text-blue-700',
  quoted:      'bg-green-100 text-green-700',
  rejected:    'bg-red-100 text-red-600',
  no_response: 'bg-slate-100 text-slate-400',
}

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
interface Supplier  { id: string; name: string }

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
  const color = days < 3 ? 'text-red-500 font-semibold' : days < 7 ? 'text-orange-500 font-semibold' : 'text-muted-foreground'
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
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function SectionCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
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
        className={['whitespace-pre-wrap text-sm text-muted-foreground', expanded ? '' : 'line-clamp-4'].join(' ')}
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
        className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Send to Supplier</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-1">
            <label className="text-sm font-medium">Supplier</label>
            {suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active suppliers found. Add one in the Suppliers page first.</p>
            ) : (
              <select
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={11}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Message will be sent via the automation system. This action only logs the request — no email is sent directly.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !supplierId}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
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
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Add Bid</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-1">
            <label className="text-sm font-medium">Company Name</label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="Acme SRL"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium">Bid Price</label>
              <input
                type="number"
                value={bidPrice}
                onChange={e => setBidPrice(e.target.value)}
                placeholder="0.00"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="w-24 space-y-1">
              <label className="text-sm font-medium">Currency</label>
              <input
                type="text"
                value={currency}
                onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
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
      if (!window.confirm('Are you sure you want to mark this tender as Withdrawn?')) return
    }
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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={15} /> Back to Tenders
      </button>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold leading-snug">{tender.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tender.contracting_authority}</p>
        </div>
        <div className="flex flex-wrap gap-6">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={tender.status}
              onChange={e => handleStatusChange(e.target.value as TenderStatus)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ALL_STATUSES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <select
              value={tender.category_id ?? ''}
              onChange={e => handleCategoryChange(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <span className="font-mono text-muted-foreground">{tender.external_id}</span>
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
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Open link <ExternalLink size={12} />
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
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
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Notes</h2>
          <span className={`flex items-center gap-1 text-xs text-green-600 transition-opacity duration-300 ${notesSaved ? 'opacity-100' : 'opacity-0'}`}>
            <Save size={12} /> Saved
          </span>
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          placeholder="Add internal notes about this tender…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {notesSaving && <p className="mt-1 text-xs text-muted-foreground">Saving…</p>}
      </div>

      {/* Supplier Outreach */}
      <SectionCard
        title="Supplier Outreach"
        action={
          <button
            onClick={() => setShowSupplierModal(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={15} /> Send to Supplier
          </button>
        }
      >
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No supplier requests for this tender yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Quoted Price</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r, i) => (
                  <tr key={r.id} className={i !== requests.length - 1 ? 'border-b border-border' : ''}>
                    <td className="px-3 py-2 font-medium">{r.suppliers?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(r.sent_at)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${REQUEST_STATUS_BADGE[r.response_status]}`}>
                        {r.response_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {r.quoted_price != null ? formatValue(r.quoted_price, r.quoted_currency ?? '') : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.response_notes ?? '—'}</td>
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
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={15} /> Add Bid
          </button>
        }
      >
        {bids.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bids recorded for this tender yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
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
                  <tr key={b.id} className={i !== bids.length - 1 ? 'border-b border-border' : ''}>
                    <td className="px-3 py-2 font-medium">{b.company_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatValue(b.bid_price, b.bid_currency)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{b.submitted_at ? formatDate(b.submitted_at) : '—'}</td>
                    <td className="px-3 py-2">
                      <select
                        value={b.result ?? ''}
                        onChange={e => handleBidResultChange(b.id, e.target.value as BidResult | '')}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">—</option>
                        <option value="pending">Pending</option>
                        <option value="won">Won</option>
                        <option value="lost">Lost</option>
                        <option value="withdrawn">Withdrawn</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {b.result_price != null ? formatValue(b.result_price, b.bid_currency) : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{b.notes ?? '—'}</td>
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
          <div key={card.title} className="rounded-xl border border-dashed border-border bg-muted/30 p-6 opacity-50">
            <p className="font-medium text-muted-foreground">{card.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.desc}</p>
            <span className="mt-3 inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
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
    </div>
  )
}
