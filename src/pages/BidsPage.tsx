import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Gavel, TrendingUp, BarChart2, DollarSign,
  ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, X, Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { BID_RESULT_BADGE } from '../lib/badges'
import type { BidResult } from '../lib/badges'

// =============================================================================
// Types
// =============================================================================

interface BidRow {
  id: string
  created_at: string
  company_name: string
  bid_price: number
  currency: string
  result: BidResult
  result_price: number | null
  notes: string | null
  tenders: { id: string; title: string } | null
}

type SortCol = 'tender' | 'company' | 'bid_price' | 'result' | 'result_price' | 'margin' | 'created_at'
type SortDir = 'asc' | 'desc'

const ALL_RESULTS: BidResult[] = ['pending', 'won', 'lost', 'withdrawn']
const PAGE_SIZE = 25

// =============================================================================
// Number formatters
// =============================================================================

const RO_NUMBER = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtPrice(v: number | null, currency = 'RON') {
  return v == null ? '—' : `${RO_NUMBER.format(v)} ${currency}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function calcMargin(bid: number, result: number | null): number | null {
  if (result == null) return null
  return ((result - bid) / bid) * 100
}

// =============================================================================
// Shared classes
// =============================================================================

const INPUT_CLS = 'h-9 rounded-md border border-[#334155] bg-[#0f172a] px-3 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500'
const SELECT_CLS = `${INPUT_CLS} cursor-pointer`

// =============================================================================
// MultiSelect for result filter
// =============================================================================

function ResultMultiSelect({ selected, onChange }: {
  selected: BidResult[]
  onChange: (v: BidResult[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function toggle(v: BidResult) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  }

  const label = selected.length === 0
    ? 'All results'
    : selected.length === 1
      ? selected[0].charAt(0).toUpperCase() + selected[0].slice(1)
      : `${selected.length} results`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex h-9 items-center gap-2 rounded-md border border-[#334155] bg-[#0f172a] px-3 text-sm text-white transition hover:border-slate-500 whitespace-nowrap"
      >
        {label}
        <ChevronDown size={13} className="shrink-0 text-slate-500" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-[#334155] bg-[#1e293b] shadow-xl">
          {ALL_RESULTS.map(r => (
            <label key={r} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.05]">
              <input
                type="checkbox"
                checked={selected.includes(r)}
                onChange={() => toggle(r)}
                className="accent-blue-500"
              />
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// SortHeader
// =============================================================================

function SortHeader({ col, label, sort, onSort, className = '' }: {
  col: SortCol; label: string; sort: { col: SortCol; dir: SortDir }
  onSort: (col: SortCol) => void; className?: string
}) {
  const active = sort.col === col
  return (
    <th
      onClick={() => onSort(col)}
      className={`cursor-pointer select-none px-5 py-3 text-xs font-medium uppercase tracking-wide transition ${active ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'} ${className}`}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
          : <ChevronsUpDown size={12} className="opacity-30" />}
      </span>
    </th>
  )
}

// =============================================================================
// Summary card
// =============================================================================

function StatCard({ label, value, icon, sub }: {
  label: string; value: string; icon: React.ReactNode; sub?: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#334155] bg-[#1e293b] p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-slate-400">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold leading-none text-white">{value}</p>
        <p className="mt-1 text-xs text-slate-400">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-600">{sub}</p>}
      </div>
    </div>
  )
}

// =============================================================================
// Page
// =============================================================================

export default function BidsPage() {
  const navigate = useNavigate()

  // Raw data
  const [allBids,    setAllBids]    = useState<BidRow[]>([])
  const [companies,  setCompanies]  = useState<string[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  // Filters
  const [search,          setSearch]          = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [resultFilter,    setResultFilter]    = useState<BidResult[]>([])
  const [companyFilter,   setCompanyFilter]   = useState('')
  const [dateFrom,        setDateFrom]        = useState('')
  const [dateTo,          setDateTo]          = useState('')

  // Sort + page
  const [sort, setSort]   = useState<{ col: SortCol; dir: SortDir }>({ col: 'created_at', dir: 'desc' })
  const [page, setPage]   = useState(0)

  const hasFilters = !!(debouncedSearch || resultFilter.length || companyFilter || dateFrom || dateTo)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0) }, 400)
    return () => clearTimeout(t)
  }, [search])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [resultFilter, companyFilter, dateFrom, dateTo, sort])

  // Fetch all bids once (client-side filter/sort for simplicity at this scale)
  useEffect(() => {
    async function load() {
      setLoading(true); setError(null)
      try {
        const { data, error: qErr } = await supabase
          .from('bids')
          .select('id, created_at, company_name, bid_price, currency, result, result_price, notes, tenders(id, title)')
          .order('created_at', { ascending: false })

        if (qErr) throw qErr

        const rows = (data as BidRow[]) ?? []
        setAllBids(rows)

        const unique = [...new Set(rows.map(b => b.company_name))].sort()
        setCompanies(unique)
      } catch (e) {
        setError('Failed to load bids.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ---------------------------------------------------------------------------
  // Derived stats (from unfiltered data)
  // ---------------------------------------------------------------------------

  const totalBids = allBids.length

  const decidedBids = allBids.filter(b => b.result === 'won' || b.result === 'lost')
  const wonBids     = allBids.filter(b => b.result === 'won')
  const winRate     = decidedBids.length > 0
    ? Math.round((wonBids.length / decidedBids.length) * 100)
    : null

  const marginsData = allBids
    .map(b => calcMargin(b.bid_price, b.result_price))
    .filter((m): m is number => m !== null)
  const avgMargin = marginsData.length > 0
    ? marginsData.reduce((a, b) => a + b, 0) / marginsData.length
    : null

  const totalWon = wonBids.reduce((sum, b) => sum + (b.result_price ?? 0), 0)

  // ---------------------------------------------------------------------------
  // Client-side filter + sort + paginate
  // ---------------------------------------------------------------------------

  const filtered = allBids.filter(b => {
    if (resultFilter.length && !resultFilter.includes(b.result)) return false
    if (companyFilter && b.company_name !== companyFilter) return false
    if (dateFrom && b.created_at < dateFrom) return false
    if (dateTo   && b.created_at > dateTo + 'T23:59:59') return false
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      const titleMatch   = b.tenders?.title?.toLowerCase().includes(q) ?? false
      const companyMatch = b.company_name.toLowerCase().includes(q)
      if (!titleMatch && !companyMatch) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    switch (sort.col) {
      case 'tender':      return dir * (a.tenders?.title ?? '').localeCompare(b.tenders?.title ?? '')
      case 'company':     return dir * a.company_name.localeCompare(b.company_name)
      case 'bid_price':   return dir * (a.bid_price - b.bid_price)
      case 'result':      return dir * a.result.localeCompare(b.result)
      case 'result_price':return dir * ((a.result_price ?? -Infinity) - (b.result_price ?? -Infinity))
      case 'margin': {
        const ma = calcMargin(a.bid_price, a.result_price) ?? -Infinity
        const mb = calcMargin(b.bid_price, b.result_price) ?? -Infinity
        return dir * (ma - mb)
      }
      case 'created_at':  return dir * a.created_at.localeCompare(b.created_at)
      default: return 0
    }
  })

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageSlice  = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleSort(col: SortCol) {
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'asc' }
    )
  }

  function clearFilters() {
    setSearch(''); setResultFilter([]); setCompanyFilter(''); setDateFrom(''); setDateTo('')
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Bids</h1>
        <p className="mt-0.5 text-sm text-slate-400">Aggregate overview of all bid submissions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Bids"
          value={String(totalBids)}
          icon={<Gavel size={18} />}
        />
        <StatCard
          label="Win Rate"
          value={winRate != null ? `${winRate}%` : '—'}
          icon={<TrendingUp size={18} />}
          sub={decidedBids.length > 0 ? `${wonBids.length} won of ${decidedBids.length} decided` : undefined}
        />
        <StatCard
          label="Avg. Margin"
          value={avgMargin != null ? `${avgMargin >= 0 ? '+' : ''}${avgMargin.toFixed(1)}%` : '—'}
          icon={<BarChart2 size={18} />}
          sub={marginsData.length > 0 ? `across ${marginsData.length} bids` : undefined}
        />
        <StatCard
          label="Total Value Won"
          value={wonBids.length > 0 ? `${RO_NUMBER.format(totalWon)} RON` : '—'}
          icon={<DollarSign size={18} />}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tender or company…"
            className="h-9 w-64 rounded-md border border-[#334155] bg-[#0f172a] pl-3 pr-8 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              <X size={13} />
            </button>
          )}
        </div>

        <ResultMultiSelect selected={resultFilter} onChange={v => { setResultFilter(v); setPage(0) }} />

        <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className={SELECT_CLS}>
          <option value="">All companies</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Date range */}
        <input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(0) }}
          className={`${INPUT_CLS} w-38`}
          title="From date"
        />
        <span className="text-xs text-slate-500">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(0) }}
          className={`${INPUT_CLS} w-38`}
          title="To date"
        />

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex h-9 items-center gap-1.5 rounded-md border border-[#334155] px-3 text-sm text-slate-400 transition hover:border-slate-500 hover:text-white"
          >
            <X size={13} /> Clear
          </button>
        )}
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
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <Gavel className="h-7 w-7 text-slate-600" />
            <p className="text-sm text-slate-400">{hasFilters ? 'No bids match your filters' : 'No bids yet'}</p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-blue-400 hover:underline">Clear filters</button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#334155] bg-[#0f172a]/60">
                    <SortHeader col="tender"       label="Tender"         sort={sort} onSort={handleSort} className="text-left" />
                    <SortHeader col="company"      label="Company"        sort={sort} onSort={handleSort} className="text-left" />
                    <SortHeader col="bid_price"    label="Bid Price"      sort={sort} onSort={handleSort} className="text-right" />
                    <SortHeader col="result"       label="Result"         sort={sort} onSort={handleSort} className="text-left" />
                    <SortHeader col="result_price" label="Result Price"   sort={sort} onSort={handleSort} className="text-right" />
                    <SortHeader col="margin"       label="Margin"         sort={sort} onSort={handleSort} className="text-right" />
                    <SortHeader col="created_at"   label="Submitted"      sort={sort} onSort={handleSort} className="text-left" />
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.map((b, i) => {
                    const margin = calcMargin(b.bid_price, b.result_price)
                    const marginCls = margin == null
                      ? 'text-slate-600'
                      : margin >= 0 ? 'text-emerald-400' : 'text-red-400'

                    return (
                      <tr
                        key={b.id}
                        className={[
                          i % 2 === 1 ? 'bg-white/[0.015]' : '',
                          i !== pageSlice.length - 1 ? 'border-b border-[#334155]/50' : '',
                        ].join(' ')}
                      >
                        <td className="px-5 py-3.5">
                          {b.tenders ? (
                            <button
                              onClick={() => navigate(`/tenders/${b.tenders!.id}`)}
                              className="max-w-[200px] truncate font-medium text-white hover:text-blue-400 hover:underline text-left"
                              title={b.tenders.title}
                            >
                              {b.tenders.title}
                            </button>
                          ) : (
                            <span className="italic text-slate-500">Tender removed</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-slate-400">{b.company_name}</td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-slate-400">{fmtPrice(b.bid_price, b.currency)}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${BID_RESULT_BADGE[b.result]}`}>
                            {b.result}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-slate-400">{fmtPrice(b.result_price, b.currency)}</td>
                        <td className={`px-5 py-3.5 text-right tabular-nums font-medium ${marginCls}`}>
                          {margin == null ? '—' : `${margin >= 0 ? '+' : ''}${margin.toFixed(1)}%`}
                        </td>
                        <td className="px-5 py-3.5 tabular-nums text-slate-400">{fmtDate(b.created_at)}</td>
                        <td className="px-5 py-3.5 text-slate-400">
                          {b.notes
                            ? <span title={b.notes}>{b.notes.length > 40 ? b.notes.slice(0, 40) + '…' : b.notes}</span>
                            : <span className="text-slate-600">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[#334155] px-5 py-3">
                <p className="text-xs text-slate-500">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="rounded p-1.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-2 text-xs text-slate-400">{page + 1} / {totalPages}</span>
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                    className="rounded p-1.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
