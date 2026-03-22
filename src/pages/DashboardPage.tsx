import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSearch, AlertTriangle, MessageSquareDot, Gavel, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { STATUS_BADGE } from '../lib/badges'
import type { TenderStatus } from '../lib/badges'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentTender {
  id: string
  title: string
  contracting_authority: string
  estimated_value: number | null
  currency: string
  deadline: string
  status: TenderStatus
  tender_categories: { name: string }[] | null
}

interface Stats {
  activeTenders:    number
  expiringSoon:     number
  pendingResponses: number
  bidsThisMonth:   number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RO_NUMBER = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatValue(v: number | null, currency: string) {
  return v == null ? '—' : `${RO_NUMBER.format(v)} ${currency}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function deadlineColor(iso: string) {
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000
  if (days < 3) return 'text-red-400 font-medium'
  if (days < 7) return 'text-amber-400 font-medium'
  return 'text-slate-400'
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

interface CardProps {
  label:   string
  value:   number
  icon:    React.ReactNode
  warning?: boolean
}

function SummaryCard({ label, value, icon, warning }: CardProps) {
  const isWarning = warning && value > 0
  return (
    <div className={[
      'flex items-center gap-4 rounded-xl border p-5 transition-colors',
      isWarning
        ? 'border-amber-500/30 bg-amber-500/[0.07]'
        : 'border-[#334155] bg-[#1e293b]',
    ].join(' ')}>
      <div className={[
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
        isWarning ? 'bg-amber-500/15 text-amber-400' : 'bg-white/[0.06] text-slate-400',
      ].join(' ')}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold leading-none text-white">{value}</p>
        <p className="mt-1 text-xs text-slate-400">{label}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const navigate = useNavigate()
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [tenders, setTenders] = useState<RecentTender[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const now      = new Date()
        const in7Days  = new Date(Date.now() + 7 * 86_400_000).toISOString()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        const [
          { count: activeTenders },
          { count: expiringSoon },
          { count: pendingResponses },
          { count: bidsThisMonth },
          { data: recentTenders, error: tErr },
        ] = await Promise.all([
          supabase.from('tenders').select('*', { count: 'exact', head: true })
            .not('status', 'in', '("expired","withdrawn")'),
          supabase.from('tenders').select('*', { count: 'exact', head: true })
            .lte('deadline', in7Days).gte('deadline', now.toISOString())
            .not('status', 'in', '("expired","withdrawn","won","lost")'),
          supabase.from('supplier_requests').select('*', { count: 'exact', head: true })
            .eq('response_status', 'pending'),
          supabase.from('bids').select('*', { count: 'exact', head: true })
            .gte('created_at', monthStart),
          supabase.from('tenders')
            .select('id, title, contracting_authority, estimated_value, currency, deadline, status, tender_categories(name)')
            .order('created_at', { ascending: false })
            .limit(10),
        ])

        if (tErr) throw tErr
        setStats({ activeTenders: activeTenders ?? 0, expiringSoon: expiringSoon ?? 0, pendingResponses: pendingResponses ?? 0, bidsThisMonth: bidsThisMonth ?? 0 })
        setTenders((recentTenders as RecentTender[]) ?? [])
      } catch (e) {
        setError('Failed to load dashboard data.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
    </div>
  )
  if (error) return (
    <div className="flex h-64 items-center justify-center">
      <p className="text-sm text-red-400">{error}</p>
    </div>
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="mt-0.5 text-sm text-slate-400">Overview of your procurement activity</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Active Tenders"    value={stats!.activeTenders}    icon={<FileSearch size={18} />} />
        <SummaryCard label="Expiring Soon"     value={stats!.expiringSoon}     icon={<AlertTriangle size={18} />} warning />
        <SummaryCard label="Pending Responses" value={stats!.pendingResponses} icon={<MessageSquareDot size={18} />} />
        <SummaryCard label="Bids This Month"   value={stats!.bidsThisMonth}    icon={<Gavel size={18} />} />
      </div>

      {/* Recent Tenders */}
      <div className="rounded-xl border border-[#334155] bg-[#1e293b]">
        <div className="border-b border-[#334155] px-6 py-4">
          <h2 className="text-sm font-semibold text-white">Recent Tenders</h2>
        </div>

        {tenders!.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <FileSearch className="h-7 w-7 text-slate-600" />
            <p className="text-sm text-slate-400">No tenders yet</p>
            <p className="text-xs text-slate-600">Configure the webhook in Settings to import data from SEAP.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#334155] bg-[#0f172a]/60">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Authority</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Est. Value</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Deadline</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Category</th>
                </tr>
              </thead>
              <tbody>
                {tenders!.map((t, i) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/tenders/${t.id}`)}
                    className={[
                      'cursor-pointer transition-colors hover:bg-white/[0.03]',
                      i % 2 === 1 ? 'bg-white/[0.015]' : '',
                      i !== tenders!.length - 1 ? 'border-b border-[#334155]/60' : '',
                    ].join(' ')}
                  >
                    <td className="px-6 py-3.5 font-medium text-white">{truncate(t.title, 55)}</td>
                    <td className="px-6 py-3.5 text-slate-400">{truncate(t.contracting_authority, 35)}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums text-slate-400">{formatValue(t.estimated_value, t.currency)}</td>
                    <td className={`px-6 py-3.5 tabular-nums ${deadlineColor(t.deadline)}`}>{formatDate(t.deadline)}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status]}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      {t.tender_categories
                        ? <span className="inline-flex rounded-full bg-slate-700/50 px-2.5 py-0.5 text-xs font-medium text-slate-300">{t.tender_categories[0]?.name}</span>
                        : <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
