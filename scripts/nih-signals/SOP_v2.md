# NIH Grant Signals V2 — Full Extraction SOP

## The Goldmine

**V1 extracted 14 fields. V2 extracts 30+.**

New fields that change everything:
- **Therapeutic area** — NCI = oncology CROs, NIAID = infectious disease specialists
- **Multiple PIs** — Stanford grant has 5 contacts, not 1
- **Outsource likelihood** — SBIR/STTR + small company = outsources everything
- **New grant flag** — Fresh money, actively building team
- **Project URL** — Credibility link for outreach
- **Org type** — Academic vs commercial (different needs)
- **Geographic data** — Lat/long, congressional district

---

## Quick Start

```bash
# Install
pip install requests

# Run V2 (full extraction)
python nih_grant_signals_v2.py --days 90 --min-amount 500000 --limit 600

# Output: nih_biotech_signals_v2.csv (30+ columns)
```

---

## New Scoring System

### Signal Tiers

| Tier | Score | Meaning |
|------|-------|---------|
| **A+** | 80+ | Hottest — new grant, big money, commercial, recent |
| **A** | 65-79 | Hot — strong signals, reach out this week |
| **B** | 50-64 | Warm — solid signals, batch outreach |
| **C** | <50 | Monitor — early stage or smaller |

### Outsource Likelihood

| Level | Meaning | Who needs this? |
|-------|---------|-----------------|
| **HIGH** | SBIR/STTR + small company + big budget | CROs, recruiters, EVERYTHING |
| **MEDIUM** | Academic with funding or commercial | CROs, specialized vendors |
| **LOW** | Large academic, internal capabilities | Niche services only |

**Focus on HIGH first.** These are small biotechs with money who outsource everything.

---

## Therapeutic Area Matching

V2 automatically maps NIH Institute to therapeutic area:

| NIH Institute | Therapeutic Area | Who to connect them to |
|---------------|------------------|------------------------|
| **NCI** | Oncology | Oncology CROs, tumor biology recruiters |
| **NIAID** | Infectious Disease | Vaccine CROs, immunology specialists |
| **NINDS** | Neurology | CNS CROs, neuro recruiters |
| **NIA** | Aging/Neurodegeneration | Alzheimer's specialists, CNS CROs |
| **NHLBI** | Cardiovascular | Cardio CROs, CV recruiters |
| **NIDDK** | Metabolic/Diabetes | Metabolic CROs, endo specialists |
| **NIMH** | Mental Health/CNS | Psych CROs, CNS recruiters |
| **NCATS** | Translational | Platform CROs, early-stage specialists |
| **NHGRI** | Genomics | Genomics CROs, bioinformatics vendors |

**Use this for matching:** Oncology grant → connect to oncology-specialized CRO.

---

## Multi-Contact Strategy

**Old way:** 1 grant = 1 contact (primary PI)
**New way:** 1 grant = multiple contacts (all PIs)

Example from V2 output:
```
Org:      STANFORD UNIVERSITY
PI:       ANNE BRUNET
All PIs:  ANNE BRUNET; Karl A. Deisseroth; Daniel Jarosz; Scott Warrington; Anne Bhalla
PI Count: 5
```

**5 decision-makers on one grant.** Reach all of them:
- Different PIs have different vendor relationships
- One might be more responsive than others
- Increases your surface area dramatically

---

## New Outreach Templates

### To Demand Side (using new fields)

**Template 1: Therapeutic Area Match**
```
Hey [PI First Name] —

Saw your [NIH Institute] grant on [therapeutic area].
[Project URL]

I work with a few [therapeutic area]-specialized CROs
who've run similar programs. Might be useful as you scale.

Worth a quick intro?
```

**Template 2: New Grant**
```
Hey [PI First Name] —

Congrats on the new NIH funding at [Org Name].
Building out the team?

I know a few [therapeutic area] recruiters who specialize
in this exact stage. Can connect you if useful.
```

**Template 3: High Outsource Likelihood (SBIR/STTR)**
```
Hey [PI First Name] —

Noticed [Org Name]'s SBIR grant for [short project title].
Small biotechs usually outsource the heavy lifting.

I've got connections to CROs, recruiters, and regulatory
folks who work specifically with SBIR-funded companies.

Worth a chat?
```

### To Supply Side (with deal flow)

```
Hey [CRO/Recruiter Name] —

I'm tracking NIH grants in [therapeutic area].
Got [X] companies with fresh funding, $500K-$5M range.

Most are [org type] with [outsource likelihood] outsourcing needs.

[Example: Stanford, Columbia, LSU Pennington — all recent grants]

Worth first look at a few?
```

---

## Filtering Strategies

### By Therapeutic Area
```bash
# Oncology only (NCI grants)
python nih_grant_signals_v2.py --keywords oncology cancer tumor

# Neurology (NINDS grants)
python nih_grant_signals_v2.py --keywords neurology Alzheimer Parkinson neurodegeneration

# Infectious disease (NIAID grants)
python nih_grant_signals_v2.py --keywords vaccine infectious antiviral
```

### By Outsource Likelihood
After running, filter CSV for:
- `outsource_likelihood = HIGH` → immediate outreach
- `org_type` contains "Small Business" → highest priority
- `activity_code` in R43, R44, R41, R42 → SBIR/STTR, outsources everything

### By New Grants
Filter for `is_new_grant = Yes` — these are actively building teams.

---

## Supply Side Categories

Based on therapeutic area, match to these supply types:

### Oncology Grants (NCI)
- **CROs:** Oncology-focused CROs, tumor biology specialists
- **Recruiters:** Oncology clinical, translational research talent
- **Consultants:** FDA oncology regulatory, clinical trial design
- **Vendors:** Biomarker labs, pathology services

### Neurology Grants (NINDS, NIA)
- **CROs:** CNS CROs, neuro-specialized
- **Recruiters:** Neuroscience talent, CNS clinical
- **Consultants:** FDA neuro regulatory, clinical endpoints
- **Vendors:** Imaging services, cognitive testing

### Infectious Disease Grants (NIAID)
- **CROs:** Vaccine CROs, infectious disease specialists
- **Recruiters:** Immunology talent, vaccine development
- **Consultants:** FDA biologics, vaccine regulatory
- **Vendors:** BSL labs, assay development

---

## The Numbers (V2)

**What to expect from one batch:**

```
600 grants pulled
├── ~200 Tier A+ (hottest)
├── ~200 Tier A (hot)
├── ~150 Tier B (warm)
└── ~50 Tier C (monitor)

Outsource likelihood:
├── ~50 HIGH (priority targets)
├── ~300 MEDIUM (good targets)
└── ~250 LOW (niche services only)

Focus on:
├── 50 HIGH outsourcers
├── Filter by your therapeutic specialty
└── = 10-20 perfect-fit targets per batch
```

---

## Weekly Routine (V2)

| Day | Action |
|-----|--------|
| Monday | Run V2 script, filter for HIGH outsource + your therapeutic area |
| Monday | Score and prioritize A+/A grants |
| Tuesday | Reach ALL PIs on top 10 grants (multi-contact strategy) |
| Wednesday | Follow up, track responses |
| Thursday | Supply outreach with deal flow ("Got 15 oncology grants...") |
| Friday | Schedule intros, update supply relationships |

---

## CSV Column Reference

### Core (for outreach)
- `org_name` — Company/institution name
- `pi_name` — Primary PI
- `all_pis` — All PIs (semicolon separated)
- `pi_count` — Number of PIs
- `grant_amount` — Funding amount
- `project_title` — Grant title

### Targeting
- `therapeutic_area` — Auto-mapped from NIH Institute
- `nih_institute` — NCI, NIAID, etc.
- `org_type` — Academic vs commercial vs small business
- `outsource_likelihood` — HIGH/MEDIUM/LOW
- `is_new_grant` — Yes/No
- `signal_type` — Combined signals

### Geographic
- `org_city`, `org_state`
- `latitude`, `longitude`
- `congressional_district`

### Credibility
- `project_url` — Direct link to NIH Reporter
- `spending_categories` — NIH's categorization
- `top_terms` — Key terms from grant

---

## Why V2 Is Better

| Metric | V1 | V2 |
|--------|----|----|
| Fields extracted | 14 | 30+ |
| Contacts per grant | 1 | 1-10 (all PIs) |
| Therapeutic matching | Manual (parse abstract) | Automatic (NIH Institute) |
| Outsource scoring | None | HIGH/MEDIUM/LOW |
| New grant detection | By date only | Direct API flag |
| Credibility links | None | Project URL |
| Geographic data | City/State only | + Lat/Long, Congressional |

---

## Files

```
nih-signals/
├── nih_grant_signals.py      # V1 (basic, 14 fields)
├── nih_grant_signals_v2.py   # V2 (full extraction, 30+ fields)
├── SOP.md                    # V1 instructions
├── SOP_v2.md                 # This file
└── nih_biotech_signals_v2.csv  # Output
```

---

## Next Level: Clinical Trials

Clinical trial grants need CROs the MOST. To find them:

```bash
python nih_grant_signals_v2.py --keywords "clinical trial" "phase 1" "phase 2" "phase 3"
```

Or filter your output for:
- `project_title` contains "clinical trial" or "phase"
- `spending_categories` contains "Clinical Trials"

These are gold for CRO connectors.

---

## The Math (Same as V1, Better Targeting)

```
600 grants pulled
├── Filter: HIGH outsource + your therapeutic area
└── = ~30 perfect-fit targets

30 targets × 3 PIs average = 90 contacts
├── 30% response rate (warm + relevant)
├── = 27 conversations
├── 10 turn into intros
└── 3-5 deals closed

At $10K-$50K per intro fee = $30K-$250K per batch
```

**The difference with V2:** Better targeting means higher response rates.

---

## Quick Wins

1. **Run V2 now** — Get 600 grants with full extraction
2. **Filter for HIGH outsource** — These are your priority targets
3. **Match therapeutic area to your supply** — Oncology grant → oncology CRO
4. **Use multi-contact strategy** — Reach all PIs, not just primary
5. **Include project URL in outreach** — Instant credibility
