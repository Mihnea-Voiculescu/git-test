import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  FileSearch, Loader2, X, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25

type TenderStatus = 'new' | 'reviewed' | 'interested' | 'applied' | 'won' | 'lost' | 'withdrawn' | 'expired'
type SortCol = 'title' | 'contracting_authority' | 'cpv_code' | 'estimated_value' | 'deadline' | 'status'
type SortDir = 'asc' | 'desc'

const ALL_STATUSES: TenderStatus[] = [
  'new', 'reviewed', 'interested', 'applied', 'won', 'lost', 'withdrawn', 'expired',
]

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

interface Category { id: string; name: string }

interface Tender {
  id: string
  title: string
  contracting_authority: string
  cpv_code: string | null
  estimated_value: number | null
  currency: string
  deadline: string
  status: TenderStatus
  tender_categories: { name: string } | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RO_NUMBER = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatValue(value: number | null, currency: string) {
  return value == null ? '—' : `${RO_NUMBER.format(value)} ${currency}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function deadlineColor(iso: string) {
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000
  if (days < 3) return 'text-red-500 font-semibold'
  if (days < 7) return 'text-orange-500 font-semibold'
  return ''
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

// ---------------------------------------------------------------------------
// MultiSelect
// ---------------------------------------------------------------------------

interface MultiSelectProps {
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder: string
}

function MultiSelect({ options, selected, onChange, placeholder }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex h-9 min-w-36 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted"
      >
        <span className={selected.length === 0 ? 'text-muted-foreground' : ''}>
          {selected.length === 0 ? placeholder : `${selected.length} selected`}
        </span>
        <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-60 w-48 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {options.map(opt => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="accent-primary"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sort header cell
// ---------------------------------------------------------------------------

interface SortHeaderProps {
  col: SortCol
  label: string
  current: SortCol
  dir: SortDir
  onSort: (col: SortCol) => void
  className?: string
}

function SortHeader({ col, label, current, dir, onSort, className = '' }: SortHeaderProps) {
  const active = current === col
  return (
    <th
      className={`cursor-pointer select-none px-4 py-3 text-left text-xs font-medium text-muted-foreground hover:text-foreground ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />
          : <ChevronsUpDown size={13} className="opacity-40" />}
      </span>
    </th>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TendersPage() {
  const navigate = useNavigate()

  // filter state
  const [search, setSearch]               = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter]   = useState<TenderStatus[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [deadlineFrom, setDeadlineFrom]   = useState('')
  const [deadlineTo, setDeadlineTo]       = useState('')
  const [valueMin, setValueMin]           = useState('')
  const [valueMax, setValueMax]           = useState('')

  // sort / page
  const [sortCol, setSortCol] = useState<SortCol>('deadline')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage]       = useState(0)

  // data
  const [tenders, setTenders]     = useState<Tender[]>([])
  const [total, setTotal]         = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0)
      setDebouncedSearch(search)
    }, 400)
    return () => clearTimeout(t)
  }, [search])

  // Fetch categories once
  useEffect(() => {
    supabase
      .from('tender_categories')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setCategories(data ?? []))
  }, [])

  // Fetch tenders whenever filters / sort / page change
  useEffect(() => {
    async function fetch() {
      setLoading(true)
      setError(null)
      try {
        let query = supabase
          .from('tenders')
          .select(
            'id, title, contracting_authority, cpv_code, estimated_value, currency, deadline, status, tender_categories(name)',
            { count: 'exact' },
          )

        if (debouncedSearch) {
          const s = debouncedSearch.replace(/[%_]/g, '\\$&')
          query = query.or(
            `title.ilike.%${s}%,description.ilike.%${s}%,contracting_authority.ilike.%${s}%`,
          )
        }
        if (statusFilter.length > 0)   query = query.in('status', statusFilter)
        if (categoryFilter.length > 0) query = query.in('category_id', categoryFilter)
        if (deadlineFrom)              query = query.gte('deadline', deadlineFrom)
        if (deadlineTo)                query = query.lte('deadline', `${deadlineTo}T23:59:59`)
        if (valueMin !== '')           query = query.gte('estimated_value', Number(valueMin))
        if (valueMax !== '')           query = query.lte('estimated_value', Number(valueMax))

        query = query
          .order(sortCol, { ascending: sortDir === 'asc', nullsFirst: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        const { data, count, error: qErr } = await query
        if (qErr) throw qErr
        setTenders((data as Tender[]) ?? [])
        setTotal(count ?? 0)
      } catch (e) {
        setError('Failed to load tenders.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [debouncedSearch, statusFilter, categoryFilter, deadlineFrom, deadlineTo, valueMin, valueMax, sortCol, sortDir, page])

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
    setPage(0)
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter([])
    setCategoryFilter([])
    setDeadlineFrom('')
    setDeadlineTo('')
    setValueMin('')
    setValueMax('')
    setPage(0)
  }

  const hasFilters = search || statusFilter.length || categoryFilter.length ||
    deadlineFrom || deadlineTo || valueMin !== '' || valueMax !== ''

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Tenders</h1>

      {/* Search */}
      <div className="relative">
        <FileSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title, authority, or description…"
          className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Status</p>
          <MultiSelect
            options={ALL_STATUSES.map(s => ({ value: s, label: s }))}
            selected={statusFilter}
            onChange={v => { setStatusFilter(v as TenderStatus[]); setPage(0) }}
            placeholder="All statuses"
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Category</p>
          <MultiSelect
            options={categories.map(c => ({ value: c.id, label: c.name }))}
            selected={categoryFilter}
            onChange={v => { setCategoryFilter(v); setPage(0) }}
            placeholder="All categories"
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Deadline from</p>
          <input
            type="date"
            value={deadlineFrom}
            onChange={e => { setDeadlineFrom(e.target.value); setPage(0) }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Deadline to</p>
          <input
            type="date"
            value={deadlineTo}
            onChange={e => { setDeadlineTo(e.target.value); setPage(0) }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Value min</p>
          <input
            type="number"
            value={valueMin}
            onChange={e => { setValueMin(e.target.value); setPage(0) }}
            placeholder="0"
            className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Value max</p>
          <input
            type="number"
            value={valueMax}
            onChange={e => { setValueMax(e.target.value); setPage(0) }}
            placeholder="∞"
            className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex h-9 items-center gap-1.5 self-end rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={13} /> Clear filters
          </button>
        )}
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-border bg-card">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : tenders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <FileSearch className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No tenders match your filters</p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-primary hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <SortHeader col="title"                  label="Title"           current={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortHeader col="contracting_authority"  label="Authority"        current={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortHeader col="cpv_code"               label="CPV Code"         current={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortHeader col="estimated_value"        label="Est. Value"       current={sortCol} dir={sortDir} onSort={handleSort} className="text-right" />
                    <SortHeader col="deadline"               label="Deadline"         current={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortHeader col="status"                 label="Status"           current={sortCol} dir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {tenders.map((t, i) => (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tenders/${t.id}`)}
                      className={[
                        'cursor-pointer transition-colors hover:bg-muted/50',
                        i !== tenders.length - 1 ? 'border-b border-border' : '',
                      ].join(' ')}
                    >
                      <td className="px-4 py-3 font-medium">{truncate(t.title, 55)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{truncate(t.contracting_authority, 35)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.cpv_code ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatValue(t.estimated_value, t.currency)}
                      </td>
                      <td className={`px-4 py-3 tabular-nums ${deadlineColor(t.deadline)}`}>
                        {formatDate(t.deadline)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status]}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {t.tender_categories
                          ? <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{t.tender_categories.name}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {total} result{total !== 1 ? 's' : ''} · Page {page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
