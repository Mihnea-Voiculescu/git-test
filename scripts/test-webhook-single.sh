#!/usr/bin/env bash
# Test the ingest-tender Edge Function with a single SEAP notice.
#
# Usage:
#   FUNCTION_URL=https://<project-ref>.supabase.co/functions/v1/ingest-tender \
#   API_KEY=your-ingest-api-key \
#   bash scripts/test-webhook-single.sh

FUNCTION_URL="${FUNCTION_URL:-http://localhost:54321/functions/v1/ingest-tender}"
API_KEY="${API_KEY:-test-key}"

curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
  "noticeNo": "SCNA1131565",
  "caNoticeId": 1131565,
  "noticeId": 987432,
  "procedureId": 554321,
  "contractTitle": "Lucrari de reabilitare si modernizare drum comunal DC 14 Moara-Liteni, judetul Suceava",
  "contractingAuthorityNameAndFN": "4441026 - Comuna Moara (Primaria comunei Moara)",
  "ronContractValue": 2850000.00,
  "currencyCode": "RON",
  "cpvCodeAndName": "45233120-6 - Lucrari de constructii de drumuri (Rev.2)",
  "maxTenderReceiptDeadline": "2026-04-15T12:00:00",
  "noticeStateDate": "2026-03-10T08:30:00",
  "isOnline": true,
  "isUtility": false,
  "hasSubsequentContracts": false,
  "highestOfferValue": null,
  "lowestOfferValue": null,
  "sysNoticeState": { "text": "Publicat" },
  "sysProcedureState": { "text": "In desfasurare" },
  "sysProcedureType": { "text": "Procedura simplificata" },
  "sysAcquisitionContractType": { "text": "Lucrari" },
  "sysContractAssigmentType": { "text": "Contract de achizitii publice" }
}' | jq .
