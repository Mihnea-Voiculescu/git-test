import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronUp, ChevronDown, ChevronsUpDown, FileSearch, Loader2, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { STATUS_BADGE } from '../lib/badges'
import type { TenderStatus } from '../lib/badges'

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25

type SortCol = 'title' | 'contracting_authority' | 'cpv_code' | 'estimated_value' | 'deadline' | 'status'
type SortDir = 'asc' | 'desc'

const ALL_STATUSES: TenderStatus[] = [
  'new', 'reviewed', 'interested', 'applied', 'won', 'lost', 'withdrawn', 'expired',
]

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
// Input class reused across filters
// ---------------------------------------------------------------------------

const INPUT_CLS = 'h-9 rounded-md border border-[#334155] bg-[#0f172a] px-3 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

// ---------------------------------------------------------------------------
// MultiSelect
// ---------------------------------------------------------------------------

interface MultiSelectProps {
  options:     { value: string; label: string }[]
  selected:    string[]
  onChange:    (next: string[]) => void
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
        className="flex h-9 min-w-36 items-center justify-between gap-2 rounded-md border border-[#334155] bg-[#0f172a] px-3 text-sm text-white transition hover:border-slate-500"
      >
        <span className={selected.length === 0 ? 'text-slate-600' : 'text-white'}>
          {selected.length === 0 ? placeholder : `${selected.length} selected`}
        </span>
        <ChevronDown size={13} className="shrink-0 text-slate-500" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-60 w-48 overflow-y-auto rounded-md border border-[#334155] bg-[#1e293b] shadow-xl">
          {options.map(opt => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.05]">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="accent-blue-500"
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
// Sort header
// ---------------------------------------------------------------------------

interface SortHeaderProps {
  col:       SortCol
  label:     string
  current:   SortCol
  dir:       SortDir
  onSort:    (col: SortCol) => void
  className?: string
}

function SortHeader({ col, label, current, dir, onSort, className = '' }: SortHeaderProps) {
  const active = current === col
  return (
    <th
      className={`cursor-pointer select-none px-5 py-3 text-left text-xs font-medium uppercase tracking-wide transition-colors ${active ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'} ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
          : <ChevronsUpDown size={12} className="opacity-30" />}
      </span>
    </th>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TendersPage() {
  const navigate = useNavigate()

  const [search,          setSearch]          = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter,    setStatusFilter]    = useState<TenderStatus[]>([])
  const [categoryFilter,  setCategoryFilter]  = useState<string[]>([])
  const [deadlineFrom,    setDeadlineFrom]    = useState('')
  const [deadlineTo,      setDeadlineTo]      = useState('')
  const [valueMin,        setValueMin]        = useState('')
  const [valueMax,        setValueMax]        = useState('')

  const [sortCol, setSortCol] = useState<SortCol>('deadline')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page,    setPage]    = useState(0)

  const [tenders,    setTenders]    = useState<Tender[]>([])
  const [total,      setTotal]      = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    const t = setTimeout(() => { setPage(0); setDebouncedSearch(search) }, 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    supabase.from('tender_categories').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setCategories(data ?? []))
  }, [])

  useEffect(() => {
    async function fetch() {
      setLoading(true); setError(null)
      try {
        let query = supabase
          .from('tenders')
          .select('id, title, contracting_authority, cpv_code, estimated_value, currency, deadline, status, tender_categories(name)', { count: 'exact' })

        if (debouncedSearch) {
          const s = debouncedSearch.replace(/[%_]/g, '\\$&')
          query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%,contracting_authority.ilike.%${s}%`)
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
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(0)
  }

  function clearFilters() {
    setSearch(''); setStatusFilter([]); setCategoryFilter([])
    setDeadlineFrom(''); setDeadlineTo(''); setValueMin(''); setValueMax('')
    setPage(0)
  }

  const hasFilters = search || statusFilter.length || categoryFilter.length ||
    deadlineFrom || deadlineTo || valueMin !== '' || valueMax !== ''

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Tenders</h1>
        <p className="mt-0.5 text-sm text-slate-400">Browse and manage procurement opportunities</p>
      </div>

      {/* Search */}
      <div className="relative">
        <FileSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title, authority, or description…"
          className={`${INPUT_CLS} w-full pl-9 pr-8`}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Status</p>
          <MultiSelect
            options={ALL_STATUSES.map(s => ({ value: s, label: s }))}
            selected={statusFilter}
            onChange={v => { setStatusFilter(v as TenderStatus[]); setPage(0) }}
            placeholder="All statuses"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Category</p>
          <MultiSelect
            options={categories.map(c => ({ value: c.id, label: c.name }))}
            selected={categoryFilter}
            onChange={v => { setCategoryFilter(v); setPage(0) }}
            placeholder="All categories"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Deadline from</p>
          <input type="date" value={deadlineFrom} onChange={e => { setDeadlineFrom(e.target.value); setPage(0) }} className={INPUT_CLS} />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Deadline to</p>
          <input type="date" value={deadlineTo} onChange={e => { setDeadlineTo(e.target.value); setPage(0) }} className={INPUT_CLS} />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Value min</p>
          <input type="number" value={valueMin} onChange={e => { setValueMin(e.target.value); setPage(0) }} placeholder="0" className={`${INPUT_CLS} w-28`} />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Value max</p>
          <input type="number" value={valueMax} onChange={e => { setValueMax(e.target.value); setPage(0) }} placeholder="∞" className={`${INPUT_CLS} w-28`} />
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex h-9 items-center gap-1.5 self-end rounded-md border border-[#334155] px-3 text-sm text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
          >
            <X size={13} /> Clear
          </button>
        )}
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-[#334155] bg-[#1e293b]">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : tenders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <FileSearch className="h-7 w-7 text-slate-600" />
            <p className="text-sm text-slate-400">
              {hasFilters ? 'No tenders match your filters' : 'No tenders yet'}
            </p>
            {hasFilters
              ? <button onClick={clearFilters} className="text-xs text-blue-400 hover:underline">Clear filters</button>
              : <p className="text-xs text-slate-600">Configure the webhook in Settings to import data from SEAP.</p>
            }
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#334155] bg-[#0f172a]/60">
                    <SortHeader col="title"                 label="Title"     current={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortHeader col="contracting_authority" label="Authority"  current={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortHeader col="cpv_code"              label="CPV"        current={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortHeader col="estimated_value"       label="Est. Value" current={sortCol} dir={sortDir} onSort={handleSort} className="text-right" />
                    <SortHeader col="deadline"              label="Deadline"   current={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortHeader col="status"                label="Status"     current={sortCol} dir={sortDir} onSort={handleSort} />
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {tenders.map((t, i) => (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tenders/${t.id}`)}
                      className={[
                        'cursor-pointer transition-colors hover:bg-white/[0.04]',
                        i % 2 === 1 ? 'bg-white/[0.015]' : '',
                        i !== tenders.length - 1 ? 'border-b border-[#334155]/50' : '',
                      ].join(' ')}
                    >
                      <td className="px-5 py-3.5 font-medium text-white">{truncate(t.title, 52)}</td>
                      <td className="px-5 py-3.5 text-slate-400">{truncate(t.contracting_authority, 32)}</td>
                      <td className="px-5 py-3.5 font-mono text-slate-500">{t.cpv_code ?? '—'}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-slate-400">{formatValue(t.estimated_value, t.currency)}</td>
                      <td className={`px-5 py-3.5 tabular-nums ${deadlineColor(t.deadline)}`}>{formatDate(t.deadline)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status]}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {t.tender_categories
                          ? <span className="inline-flex rounded-full bg-slate-700/50 px-2.5 py-0.5 text-xs font-medium text-slate-300">{t.tender_categories.name}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-[#334155] px-5 py-3">
              <p className="text-xs text-slate-500">
                {total} result{total !== 1 ? 's' : ''} · Page {page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-[#334155] text-slate-400 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-[#334155] text-slate-400 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
