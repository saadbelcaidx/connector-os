# Platform Mode — AI Assistant Knowledge Base

> This document is the single source of truth for the AI assistant's Platform Mode.
> It contains accurate, code-verified information about how Connector OS works.

---

## Overview

Connector OS is a CSV-only matching platform. Users upload two CSVs (Demand and Supply), the system matches them, enriches contacts, generates intros, and sends to email campaigns.

**The 4-Step Flow:**
```
LOAD → MATCH → ENRICH → SEND
```

---

## 1. CSV Upload Flow

### UI Path
```
Settings → Data section → Upload CSV
```

There are two separate upload areas:
- **Demand CSV** (blue icon) — Companies with timing signals
- **Supply CSV** (violet icon) — Providers who fulfill demand

### CSV Schema (Template)

**Required Columns:**
| Column | Description |
|--------|-------------|
| `Company Name` | The company name (required) |
| `Signal` | What's happening — hiring, funding, expansion (required) |

**Optional Columns:**
| Column | Description |
|--------|-------------|
| `Full Name` | Contact person's full name |
| `Email` | Contact email (if provided, skips enrichment) |
| `Domain` | Company website domain (e.g., `acmesaas.com`) |
| `Context` | Company description, what they do |
| `Title` | Contact's job title |
| `LinkedIn URL` | Contact's LinkedIn profile |

### Download Templates
- **Demand:** `/csv-template-demand.csv`
- **Supply:** `/csv-template-supply.csv`

### Signal Column Rules

The Signal column determines how records are classified:

| Signal Format | Classification | Example |
|---------------|----------------|---------|
| `Hiring: [role]` | HIRING_ROLE | "Hiring: 3 Account Executives" |
| Any other text | GROWTH | "Raised Series A $8M" |
| Empty + has Title | CONTACT_ROLE | Falls back to Title |

### Validation Rules

1. **File type:** Must be `.csv`
2. **File size:** Max 10MB
3. **Required columns:** Company Name, Signal
4. **Empty rows:** Skipped with warning

### Error Handling

When validation fails:
- Shows stats: Total / Valid / Invalid / Warnings
- **Download errors.csv** — Row-by-row error report
- **Download warnings.csv** — Non-critical issues
- Must fix errors and re-upload

### Storage

CSV data is stored in localStorage:
- `csv_demand_data` — Demand records (JSON array)
- `csv_supply_data` — Supply records (JSON array)

Data persists until user clicks "Clear" or uploads a replacement.

---

## 2. Settings → Integrations

### UI Path
```
Settings (gear icon from Flow page)
```

### Settings Sections

| Section | Icon | What's Configured |
|---------|------|-------------------|
| **Data** | Database | CSV uploads, templates |
| **Sending** | Send | Enrichment keys, Instantly, campaigns |
| **Personalization** | Sparkles | AI provider and API keys |
| **Profile** | User | Sender name, calendar link |
| **Account** | Shield | Password, sign out |

### Enrichment Keys (Settings → Sending)

| Service | Purpose | Where to Get |
|---------|---------|--------------|
| **Apollo** | Primary email lookup | [get.apollo.io](https://get.apollo.io) |
| **Anymail Finder** | Fallback email lookup | [anymailfinder.com](https://anymailfinder.com) |
| **Connector Agent** | SSM community email finder | (SSM members only) |

**How enrichment works:**
1. If CSV has email → use it (no API call)
2. Check cache (90-day TTL)
3. Apollo lookup by domain + seniority
4. If Apollo misses → Anymail Finder fallback

### Instantly Setup (Settings → Sending)

**Required:**
1. **Instantly API Key** — From Instantly dashboard
2. **Demand Campaign ID** — UUID where demand leads go
3. **Supply Campaign ID** — UUID where supply leads go

**Campaign ID format:** UUID v4 (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

**Validation:**
- Campaign IDs are validated before sending
- Invalid format shows: "Campaign ID format is invalid"

**Webhook URL:**
```
https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/instantly-webhook
```
Copy this to Instantly for reply tracking.

### AI Setup (Settings → Personalization)

| Provider | Model | Notes |
|----------|-------|-------|
| OpenAI | gpt-4o-mini | Default, cost-effective |
| Azure OpenAI | gpt-4o-mini | Enterprise option |
| Anthropic | claude-3-haiku-20240307 | Alternative |

AI is used for:
- Generating personalized intro text
- Signal intelligence extraction

---

## 3. Flow Page — The 4-Step Journey

### UI Path
```
Launcher → Flow (or navigate to /flow)
```

### Step 1: LOAD (Blue)

**What happens:**
1. Reads CSV data from localStorage
2. Validates schema (Company Name, Signal required)
3. Deduplicates by recordKey
4. Shows data preview with category breakdown

**Common errors:**
| Error | Meaning | Fix |
|-------|---------|-----|
| "Add a demand CSV in Settings" | No demand data | Upload CSV in Settings → Data |
| "CSV is empty" | File has headers but no rows | Add data rows to CSV |
| "CSV needs Company Name and Signal" | Missing required columns | Check column headers match template |

### Step 2: MATCH (Purple)

**What happens:**
1. Analyzes demand signals (what they need)
2. Analyzes supply capabilities (what they provide)
3. Matches based on category alignment
4. Scores matches by fit

**Data Preview shows:**
- Demand breakdown (Engineering hiring, Sales hiring, etc.)
- Supply breakdown (Recruiters, Consultants, Agencies, etc.)
- Detected match type (e.g., "Engineering hiring → Recruiters")

### Step 3: ENRICH (Cyan)

**What happens:**
1. For each record without email:
   - Check cache (90-day TTL)
   - Apollo lookup by domain
   - Anymail fallback if Apollo misses
2. Records with email in CSV skip enrichment

**Progress shows:**
- Current / Total contacts
- "Enriching demand..." or "Enriching supply..."

**Enrichment outcomes:**
| Outcome | Meaning |
|---------|---------|
| ENRICHED | Found new email |
| VERIFIED | Existing email confirmed |
| NO_CONTACT | Couldn't find decision maker |
| RATE_LIMITED | API throttled, try again |

### Step 4: SEND (Emerald)

**What happens:**
1. Generates personalized intros (AI or template)
2. Sends demand records to Demand Campaign
3. Sends supply records to Supply Campaign
4. Shows completion stats

**Send results:**
| Status | Meaning |
|--------|---------|
| `new` | Lead added to campaign |
| `existing` | Lead already in campaign |
| `needs_attention` | Error — check campaign settings |

**Completion screen shows:**
- Total intros sent
- Breakdown: new / existing / needs attention
- Export CSV button

---

## 4. Common Troubleshooting

### CSV Upload Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| "Please upload a CSV file" | Wrong file type | Save as .csv, not .xlsx |
| "File too large" | Over 10MB | Split into smaller files |
| "CSV has errors" | Invalid data | Download errors.csv, fix issues |
| Upload stuck on "Validating..." | Browser issue | Refresh page, try again |

### Enrichment Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| All records show "NO_CONTACT" | API key issue | Check Apollo key in Settings |
| Enrichment very slow | Rate limiting | Wait a minute, system auto-retries |
| "Need email" in export | Enrichment failed | Check API keys, try smaller batch |

### Instantly Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| "Campaign ID format is invalid" | Wrong format | Campaign ID must be UUID |
| "Check your Instantly API key" | Invalid key | Regenerate key in Instantly |
| "Campaign not found" | Wrong campaign ID | Copy correct ID from Instantly |
| "Rate limited" | Too fast | Wait 30 seconds, retry |
| All leads show "existing" | Already sent | Normal — leads deduplicated |

### Flow Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| "Add a demand CSV in Settings" | No data loaded | Upload CSV in Settings → Data |
| "Select contacts for both sides" | Missing demand or supply | Upload both CSVs |
| Flow stuck on "Matching..." | Large dataset | Wait — processing takes time |
| "Safe to leave" message | In progress | You can navigate away safely |

---

## 5. Feature Reference

### Currently Live Features

| Feature | Location | What It Does |
|---------|----------|--------------|
| CSV Upload | Settings → Data | Import contacts from CSV |
| Enrichment | Flow → Enrich step | Find decision-maker emails |
| Matching | Flow → Match step | Connect demand to supply |
| Instantly Send | Flow → Send step | Route to email campaigns |
| AI Intros | Flow → Send step | Generate personalized outreach |
| Export CSV | Flow → Complete | Download results |
| Flow Persistence | Automatic | Resume interrupted flows |

### Settings That Affect Flow

| Setting | Where | Impact |
|---------|-------|--------|
| Apollo API key | Settings → Sending | Enables enrichment |
| Instantly API key | Settings → Sending | Enables sending |
| Campaign IDs | Settings → Sending | Where leads go |
| AI Provider | Settings → Personalization | Intro quality |
| Sender Name | Settings → Profile | "From" attribution |

---

## 6. Glossary

| Term | Definition |
|------|------------|
| **Demand** | Companies showing timing signals (hiring, funding, etc.) |
| **Supply** | Service providers who can fulfill demand (recruiters, consultants) |
| **Signal** | Activity indicating timing — hiring, funding, expansion |
| **Enrichment** | Looking up decision-maker contact info |
| **Intro** | Personalized outreach message |
| **Campaign** | Instantly email sequence |
| **Match** | Pairing of demand company with supply provider |
| **recordKey** | Unique identifier for deduplication |

---

## 7. Quick Reference

### CSV Template (Demand)
```csv
Full Name,Company Name,Domain,Email,Context,Signal
Jane Smith,Acme SaaS,acmesaas.com,jane@acmesaas.com,B2B SaaS platform. Series B.,Hiring: 3 Account Executives
Mike Johnson,TechCorp,techcorp.io,,Developer tools. $5M ARR.,Raised Series A $8M
```

### CSV Template (Supply)
```csv
Full Name,Company Name,Domain,Email,Context,Signal
Alex Brown,Certus Recruitment,certusrecruitment.com,alex@certusrecruitment.com,Tech recruitment agency for SaaS,Places sales and engineering talent
Sarah Chen,GrowthOps Agency,growthops.io,,RevOps consulting for B2B SaaS,Runs RevOps consulting
```

### Settings Checklist (Before Running Flow)
- [ ] Demand CSV uploaded (Settings → Data)
- [ ] Supply CSV uploaded (Settings → Data)
- [ ] Apollo API key (Settings → Sending)
- [ ] Instantly API key (Settings → Sending)
- [ ] Demand Campaign ID (Settings → Sending)
- [ ] Supply Campaign ID (Settings → Sending)
- [ ] AI provider configured (Settings → Personalization) — optional but recommended

---

*Last updated: January 2025*
*Source: Code analysis of Flow.tsx, Settings.tsx, csv.ts, InstantlyService.ts, enrichment/index.ts*
