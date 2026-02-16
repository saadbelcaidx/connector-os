# Enrichment Flow Forensic Audit

## Two Entry Points → Same Path

```
CSV Upload (Settings)     Markets (PrebuiltMarkets)
       ↓                          ↓
normalizeCsvRecords()      normalizeToRecord()
       ↓                          ↓
localStorage.csv_demand_data (identical key)
       ↓
Flow.tsx: getCsvData() → enrichBatch() → routeEnrichment()
```

## Markets Record Shape (Always)

- `email` = null
- `domain` = null
- `firstName` = from lead
- `lastName` = from lead
- `fullName` = from lead or derived
- `company` = company name (always present)

## CSV Record Shape (Variable)

- `email` = from CSV column or null
- `domain` = from CSV column, `cleanDomain('')` = '' → falsy → null in router
- `fullName` = from "Full Name" column
- `company` = from "Company Name" column

## Field Mapping: NormalizedRecord → Router

```
record.email     → inputs.email      = record.email || null
record.domain    → inputs.domain     = record.domain || null  ('' → null)
record.fullName  → inputs.person_name = fullName || name || [first,last].join(' ') || null
record.company   → inputs.company    = record.company || null
```

## Action Classification (router.ts classifyInputs)

```
email exists                              → VERIFY
domain + fullName (2+ words)              → FIND_PERSON
domain only (or 1-word name)              → FIND_COMPANY_CONTACT
company + fullName (2+ words)             → SEARCH_PERSON
company only (or 1-word name)             → SEARCH_COMPANY
nothing                                   → CANNOT_ROUTE
```

## Provider Waterfalls

| Action | Provider Order |
|--------|---------------|
| VERIFY | connectorAgent → anymail |
| FIND_PERSON | anymail → connectorAgent → apollo |
| FIND_COMPANY_CONTACT | apollo → anymail |
| SEARCH_PERSON | anymail → apollo |
| SEARCH_COMPANY | apollo → anymail |

## Markets Records → Always SEARCH_PERSON (when 2+ word name)

Waterfall: anymail → apollo

## Bugs Found

### Bug 1: Edge function `find_person` requires domain

`supabase/functions/anymail-finder/index.ts` line 43:
```typescript
case 'find_person':
  if (!params.domain || !params.full_name) { // REQUIRES domain
```

But router sends `type: 'find_person'` with only `company_name` for SEARCH_PERSON.
Markets records NEVER have domain. Request rejected at edge function level.

### Bug 2: Anymail Authorization header format — NOT A BUG

`'Authorization': apiKey` is correct. Anymail API expects raw key, no Bearer prefix.
Confirmed via docs: https://anymailfinder.com/email-finder-api/docs/find-person-email

### Bug 3: CSV normalizeCsvRecords missing schema fields

`src/normalization/csv.ts` does NOT set:
- `emailSource` (undefined instead of 'csv')
- `emailVerified` (undefined instead of false)
- `verifiedBy` (undefined instead of null)
- `verifiedAt` (undefined instead of null)

Does not break enrichment but violates NormalizedRecord contract.

### Bug 4: Single-word names downgrade action

If Markets lead has only firstName (no lastName), `isFullName()` requires 2+ words.
Downgrades from SEARCH_PERSON to SEARCH_COMPANY — loses person targeting.

### Bug 5: No `find_person` support for company_name only

The Anymail edge function only has these types:
- `find_person` — requires domain + full_name
- `find_decision_maker` — accepts domain OR company_name
- `search_domain` — requires domain

There is NO type that does: company_name + full_name (what Markets needs).
The router sends `type: 'find_person'` with company_name but edge function rejects it.

## Fixes Applied

### Fix 1: Edge function `find_person` now accepts company_name (DONE)

`supabase/functions/anymail-finder/index.ts` — `find_person` case now:
- Accepts `domain` OR `company_name` (was: required `domain`)
- Accepts `full_name` OR `first_name`+`last_name` (was: required `full_name`)
- Passes `company_name` to Anymail API payload (was: only passed `domain`)

**Status: NEEDS DEPLOY** — `supabase functions deploy anymail-finder`

### Fix 2: CSV normalization schema fields (DONE)

`src/normalization/csv.ts` — added missing fields:
- `emailSource: 'csv'`
- `emailVerified: false`
- `verifiedBy: null`
- `verifiedAt: null`

### Fix 3: Single-word name routing protection (DONE)

`src/enrichment/router.ts` — new `hasPersonName()` + context check:
- If single-word name + (title OR linkedin) + company → still routes as SEARCH_PERSON
- Added `title` and `linkedin` to `EnrichmentInputs` type
- Both `enrichRecord()` and `enrichBatch()` now pass `linkedin` to router

### Fix 4: ENRICHMENT_EMPTY UI handler (DONE)

`src/Flow.tsx` — when `enrichmentFailed && introPairCount === 0`:
- Shows "No emails found for this batch."
- "Try another batch" button resets to upload step
- User is never stuck on a frozen screen
