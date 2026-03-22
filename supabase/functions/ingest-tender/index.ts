import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeapNotice {
  noticeNo?: string | null
  caNoticeId?: number | null
  noticeId?: number | null
  procedureId?: number | null
  contractTitle?: string | null
  contractingAuthorityNameAndFN?: string | null
  ronContractValue?: number | null
  currencyCode?: string | null
  cpvCodeAndName?: string | null
  maxTenderReceiptDeadline?: string | null
  noticeStateDate?: string | null
  isOnline?: boolean | null
  isUtility?: boolean | null
  hasSubsequentContracts?: boolean | null
  highestOfferValue?: number | null
  lowestOfferValue?: number | null
  sysNoticeState?: { text?: string } | null
  sysProcedureState?: { text?: string } | null
  sysProcedureType?: { text?: string } | null
  sysAcquisitionContractType?: { text?: string } | null
  sysContractAssigmentType?: { text?: string } | null
  [key: string]: unknown
}

interface ProcessResult {
  processed: number
  created: number
  updated: number
  skipped: number
  errors: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function mapNoticeToRow(notice: SeapNotice): Record<string, unknown> | null {
  const externalId = notice.noticeNo?.trim()
  const title      = notice.contractTitle?.trim()

  if (!externalId || !title) return null

  // Deadline: use maxTenderReceiptDeadline, fall back to noticeStateDate + 30d
  let deadline: string | null = null
  if (notice.maxTenderReceiptDeadline) {
    deadline = new Date(notice.maxTenderReceiptDeadline).toISOString()
  } else if (notice.noticeStateDate) {
    deadline = addDays(notice.noticeStateDate, 30)
  }

  // If we still have no deadline, use now + 30 days as last resort
  if (!deadline) {
    deadline = addDays(new Date().toISOString(), 30)
  }

  const publicationDate = notice.noticeStateDate
    ? new Date(notice.noticeStateDate).toISOString()
    : null

  const description = title.length > 500 ? title.slice(0, 500) : title

  // Structured raw_data extras
  const rawData = {
    ...notice,
    _extracted: {
      notice_state:         notice.sysNoticeState?.text        ?? null,
      procedure_state:      notice.sysProcedureState?.text     ?? null,
      procedure_type:       notice.sysProcedureType?.text      ?? null,
      contract_type:        notice.sysAcquisitionContractType?.text ?? null,
      assignment_type:      notice.sysContractAssigmentType?.text   ?? null,
      is_online:            notice.isOnline            ?? null,
      is_utility:           notice.isUtility           ?? null,
      has_subsequent:       notice.hasSubsequentContracts ?? null,
      highest_offer_value:  notice.highestOfferValue   ?? null,
      lowest_offer_value:   notice.lowestOfferValue    ?? null,
      ca_notice_id:         notice.caNoticeId          ?? null,
      notice_id:            notice.noticeId            ?? null,
      procedure_id:         notice.procedureId         ?? null,
    },
  }

  return {
    external_id:            externalId,
    title,
    description,
    contracting_authority:  notice.contractingAuthorityNameAndFN?.trim() ?? null,
    estimated_value:        notice.ronContractValue ?? null,
    currency:               notice.currencyCode?.trim()  ?? 'RON',
    cpv_code:               notice.cpvCodeAndName?.trim() ?? null,
    deadline,
    publication_date:       publicationDate,
    raw_data:               rawData,
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Method guard
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Auth guard
  const apiKey      = req.headers.get('x-api-key')
  const expectedKey = Deno.env.get('INGEST_API_KEY')
  if (!expectedKey || apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Normalize to array
  const notices: SeapNotice[] = Array.isArray(body) ? body : [body as SeapNotice]

  // Supabase client with service role (bypasses RLS for ingestion)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const result: ProcessResult = { processed: 0, created: 0, updated: 0, skipped: 0, errors: [] }

  for (const notice of notices) {
    result.processed++

    const row = mapNoticeToRow(notice)
    if (!row) {
      result.skipped++
      result.errors.push(`Skipped: missing noticeNo or contractTitle (noticeNo=${notice.noticeNo ?? 'undefined'})`)
      continue
    }

    try {
      // Check if already exists to distinguish created vs updated
      const { data: existing } = await supabase
        .from('tenders')
        .select('id')
        .eq('external_id', row.external_id as string)
        .maybeSingle()

      const isNew = !existing

      const { error } = await supabase
        .from('tenders')
        .upsert(
          {
            ...row,
            // Only set status='new' on insert; on update leave it alone
            ...(isNew ? { status: 'new' } : {}),
          },
          {
            onConflict:        'external_id',
            ignoreDuplicates:  false,
          },
        )

      if (error) throw error

      if (isNew) {
        result.created++
      } else {
        result.updated++
      }
    } catch (err) {
      result.skipped++
      result.errors.push(
        `Error processing ${row.external_id}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
