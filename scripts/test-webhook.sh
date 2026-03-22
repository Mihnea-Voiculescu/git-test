#!/usr/bin/env bash
# Test the ingest-tender Edge Function with 3 realistic SEAP notices (batch).
#
# Usage:
#   FUNCTION_URL=https://<project-ref>.supabase.co/functions/v1/ingest-tender \
#   API_KEY=your-ingest-api-key \
#   bash scripts/test-webhook.sh
#
# Or set the vars inline:
#   FUNCTION_URL=https://... API_KEY=... bash scripts/test-webhook.sh

FUNCTION_URL="${FUNCTION_URL:-http://localhost:54321/functions/v1/ingest-tender}"
API_KEY="${API_KEY:-test-key}"

curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '[
  {
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
  },
  {
    "noticeNo": "SCNA1128904",
    "caNoticeId": 1128904,
    "noticeId": 985100,
    "procedureId": 552000,
    "contractTitle": "Furnizare echipamente IT pentru institutii publice din judetul Iasi — lot 1 computere, lot 2 imprimante",
    "contractingAuthorityNameAndFN": "2614141 - Consiliul Judetean Iasi",
    "ronContractValue": 1240000.00,
    "currencyCode": "RON",
    "cpvCodeAndName": "30213000-5 - Computere personale (Rev.2)",
    "maxTenderReceiptDeadline": "2026-04-22T15:00:00",
    "noticeStateDate": "2026-03-08T09:00:00",
    "isOnline": true,
    "isUtility": false,
    "hasSubsequentContracts": false,
    "highestOfferValue": null,
    "lowestOfferValue": null,
    "sysNoticeState": { "text": "Publicat" },
    "sysProcedureState": { "text": "In desfasurare" },
    "sysProcedureType": { "text": "Licitatie deschisa" },
    "sysAcquisitionContractType": { "text": "Furnizare" },
    "sysContractAssigmentType": { "text": "Acord-cadru" }
  },
  {
    "noticeNo": "SCNA1119877",
    "caNoticeId": 1119877,
    "noticeId": 976300,
    "procedureId": 543100,
    "contractTitle": "Servicii de curatenie pentru sediile Directiei Generale de Asistenta Sociala si Protectia Copilului Cluj",
    "contractingAuthorityNameAndFN": "9918720 - Directia Generala de Asistenta Sociala si Protectia Copilului Cluj",
    "ronContractValue": 380000.00,
    "currencyCode": "RON",
    "cpvCodeAndName": "90911200-8 - Servicii de curatare a cladirilor (Rev.2)",
    "maxTenderReceiptDeadline": null,
    "noticeStateDate": "2026-02-28T10:15:00",
    "isOnline": false,
    "isUtility": false,
    "hasSubsequentContracts": true,
    "highestOfferValue": 395000.00,
    "lowestOfferValue": 362000.00,
    "sysNoticeState": { "text": "Publicat" },
    "sysProcedureState": { "text": "Atribuita" },
    "sysProcedureType": { "text": "Procedura simplificata" },
    "sysAcquisitionContractType": { "text": "Servicii" },
    "sysContractAssigmentType": { "text": "Contract de achizitii publice" }
  }
]' | jq .
