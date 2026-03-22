export type TenderStatus = 'new' | 'reviewed' | 'interested' | 'applied' | 'won' | 'lost' | 'withdrawn' | 'expired'
export type RequestStatus = 'pending' | 'replied' | 'quoted' | 'rejected' | 'no_response'
export type BidResult     = 'pending' | 'won' | 'lost' | 'withdrawn'

export const STATUS_BADGE: Record<TenderStatus, string> = {
  new:        'bg-blue-500/15 text-blue-400',
  reviewed:   'bg-slate-500/20 text-slate-400',
  interested: 'bg-amber-500/15 text-amber-400',
  applied:    'bg-violet-500/15 text-violet-400',
  won:        'bg-emerald-500/15 text-emerald-400',
  lost:       'bg-red-500/15 text-red-400',
  withdrawn:  'bg-orange-500/15 text-orange-400',
  expired:    'bg-slate-500/10 text-slate-500',
}

export const REQUEST_STATUS_BADGE: Record<RequestStatus, string> = {
  pending:     'bg-amber-500/15 text-amber-400',
  replied:     'bg-blue-500/15 text-blue-400',
  quoted:      'bg-emerald-500/15 text-emerald-400',
  rejected:    'bg-red-500/15 text-red-400',
  no_response: 'bg-slate-500/10 text-slate-500',
}

export const BID_RESULT_BADGE: Record<BidResult, string> = {
  pending:   'bg-slate-500/20 text-slate-400',
  won:       'bg-emerald-500/15 text-emerald-400',
  lost:      'bg-red-500/15 text-red-400',
  withdrawn: 'bg-orange-500/15 text-orange-400',
}
