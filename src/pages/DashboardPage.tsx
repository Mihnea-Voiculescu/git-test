import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileSearch,
  AlertTriangle,
  MessageSquareDot,
  Gavel,
  Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TenderStatus =
  | 'new' | 'reviewed' | 'interested' | 'applied'
  | 'won' | 'lost' | 'withdrawn' | 'expired'

interface RecentTender {
  id: string
  title: string
  contracting_authority: string
  estimated_value: number | null
  currency: string
  deadline: string
  status: TenderStatus
  tender_categories: { name: string } | null
}

interface Stats {
  activeTenders: number
  expiringSoon: number
  pendingResponses: number
  bidsThisMonth: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RO_NUMBER = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatValue(value: number | null, currency: string) {
  if (value == null) return '—'
  return `${RO_NUMBER.format(value)} ${currency}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function deadlineColor(iso: string) {
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000
  if (days < 3) return 'text-red-500 font-semibold'
  if (days < 7) return 'text-orange-500 font-semibold'
  return ''
}

const STATUS_BADGE: Record<TenderStatus, string> = {
  new:        'bg-blue-100 text-blue-700',
  reviewed:   'bg-slate-100 text-slate-600',
  interested: 'bg-yellow-100 text-yellow-700',
  applied:    'bg-purple-100 text-purple-700',
  won:        'bg-green-100 text-green-700',
  lost:       'bg-red-100 text-red-600',
  withdrawn:  'bg-orange-100 text-orange-700',
  expired:    'bg-slate-100 text-slate-400',
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

interface CardProps {
  label: string
  value: number
  icon: React.ReactNode
  warning?: boolean
}

function SummaryCard({ label, value, icon, warning }: CardProps) {
  return (
    <div className={[
      'rounded-xl border p-5 flex items-center gap-4',
      warning && value > 0
        ? 'border-orange-300 bg-orange-50'
        : 'border-border bg-card',
    ].join(' ')}>
      <div className={[
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
        warning && value > 0 ? 'bg-orange-100 text-orange-600' : 'bg-muted text-muted-foreground',
      ].join(' ')}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [tenders, setTenders] = useState<RecentTender[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const now = new Date()
        const in7Days = new Date(Date.now() + 7 * 86_400_000).toISOString()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        const [
          { count: activeTenders },
          { count: expiringSoon },
          { count: pendingResponses },
          { count: bidsThisMonth },
          { data: recentTenders, error: tendersError },
        ] = await Promise.all([
          supabase
            .from('tenders')
            .select('*', { count: 'exact', head: true })
            .not('status', 'in', '("expired","withdrawn")'),

          supabase
            .from('tenders')
            .select('*', { count: 'exact', head: true })
            .lte('deadline', in7Days)
            .gte('deadline', now.toISOString())
            .not('status', 'in', '("expired","withdrawn","won","lost")'),

          supabase
            .from('supplier_requests')
            .select('*', { count: 'exact', head: true })
            .eq('response_status', 'pending'),

          supabase
            .from('bids')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', monthStart),

          supabase
            .from('tenders')
            .select(`
              id, title, contracting_authority,
              estimated_value, currency, deadline, status,
              tender_categories ( name )
            `)
            .order('created_at', { ascending: false })
            .limit(10),
        ])

        if (tendersError) throw tendersError

        setStats({
          activeTenders: activeTenders ?? 0,
          expiringSoon: expiringSoon ?? 0,
          pendingResponses: pendingResponses ?? 0,
          bidsThisMonth: bidsThisMonth ?? 0,
        })
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Active Tenders"
          value={stats!.activeTenders}
          icon={<FileSearch size={20} />}
        />
        <SummaryCard
          label="Expiring Soon"
          value={stats!.expiringSoon}
          icon={<AlertTriangle size={20} />}
          warning
        />
        <SummaryCard
          label="Pending Responses"
          value={stats!.pendingResponses}
          icon={<MessageSquareDot size={20} />}
        />
        <SummaryCard
          label="Bids This Month"
          value={stats!.bidsThisMonth}
          icon={<Gavel size={20} />}
        />
      </div>

      {/* Recent tenders */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Recent Tenders</h2>
        </div>

        {tenders!.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <FileSearch className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No tenders yet</p>
            <p className="text-xs text-muted-foreground/60">
              Tenders you add will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="px-5 py-3">Title</th>
                  <th className="px-5 py-3">Authority</th>
                  <th className="px-5 py-3 text-right">Est. Value</th>
                  <th className="px-5 py-3">Deadline</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Category</th>
                </tr>
              </thead>
              <tbody>
                {tenders!.map((t, i) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/tenders/${t.id}`)}
                    className={[
                      'cursor-pointer transition-colors hover:bg-muted/50',
                      i !== tenders!.length - 1 ? 'border-b border-border' : '',
                    ].join(' ')}
                  >
                    <td className="px-5 py-3 font-medium">
                      {truncate(t.title, 60)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {truncate(t.contracting_authority, 40)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                      {formatValue(t.estimated_value, t.currency)}
                    </td>
                    <td className={`px-5 py-3 tabular-nums ${deadlineColor(t.deadline)}`}>
                      {formatDate(t.deadline)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status]}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {t.tender_categories ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          {t.tender_categories.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
