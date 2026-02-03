# NIH Grant Signals — Standard Operating Procedure

## The Reptile Brain Method

Simple. Automatic. No thinking required.

```
NIH gives money → Company needs to spend it → You connect them to vendors → You get paid
```

---

## What This Does

Pulls **fresh NIH grants** as demand signals. These are biotech orgs with money who need:
- CROs (contract research)
- Recruiters (life sciences talent)
- Regulatory consultants
- Lab equipment vendors
- Licensing/BD specialists

**Free API. No auth. No scraping. Just data.**

---

## Step 1: Run the Script

```bash
# Install dependency (one time)
pip install requests

# Run with defaults (90 days, $500K+, 600 grants)
python nih_grant_signals.py

# Or customize
python nih_grant_signals.py --days 60 --min-amount 1000000 --limit 1000
```

**Output:** `nih_biotech_signals.csv`

---

## Step 2: Understand the Signals

| Signal Type | What It Means | Who to Connect Them To |
|-------------|---------------|------------------------|
| **Fresh funding** | Got money in last 60 days, scaling up | Recruiters, CROs, equipment vendors |
| **Ending soon** | Grant ends in <12 months, pressure to deliver | Licensing specialists, regulatory consultants |
| **SBIR/STTR** | Small biotech, outsources everything | CROs, consultants, recruiters |
| **Large grant ($2M+)** | Big budget, multiple vendor needs | Everyone |

---

## Step 3: Score Meaning

| Score | Meaning | Action |
|-------|---------|--------|
| **A** | Hot — recent, large, high intent | Reach out this week |
| **B** | Warm — solid signal, good timing | Batch outreach |
| **C** | Monitor — early stage or smaller | Add to nurture list |

Focus on A's first. That's your timing advantage.

---

## Step 4: The Outreach

### To Demand Side (Grant Recipients)

```
Hey [PI Name] —

Saw [Org Name] just received NIH funding for [therapeutic area].
Congrats — that's a big milestone.

I work with a few [CROs/recruiters/consultants] who specialize
in [relevant area]. Might be useful as you scale up.

Worth a quick intro?
```

### To Supply Side (CROs, Recruiters, etc.)

```
Hey [Name] —

Got a pipeline of NIH-funded biotechs in [therapeutic area].
Fresh grants, $500K-$5M range. Mostly need [CRO services/talent/etc].

Thought [Company] might want first look at a few.

Worth a chat?
```

---

## Step 5: The Numbers

**What to expect from one batch:**

```
600 grants pulled
├── ~100 Tier A (hot)
├── ~250 Tier B (warm)
└── ~250 Tier C (monitor)

Focus on 100 A's
├── 30% response rate (it's warm, they have money)
├── = 30 conversations
├── 10 turn into intros
└── 3-5 deals closed
```

**At $5K-$20K per intro fee = $15K-$100K per batch**

---

## Customization Options

### By Therapeutic Area

```bash
# Oncology only
python nih_grant_signals.py --keywords oncology cancer tumor

# Gene therapy
python nih_grant_signals.py --keywords "gene therapy" "cell therapy" "CAR-T"

# Rare disease
python nih_grant_signals.py --keywords "rare disease" "orphan drug"
```

### By Amount

```bash
# Big fish only ($2M+)
python nih_grant_signals.py --min-amount 2000000

# Smaller biotechs ($250K+)
python nih_grant_signals.py --min-amount 250000
```

### By Recency

```bash
# Last 30 days only (freshest)
python nih_grant_signals.py --days 30

# Last 6 months (bigger pool)
python nih_grant_signals.py --days 180
```

---

## Supply Side Setup

You need vendors to connect them to. Build your supply list:

### Apollo Filters for Biotech Supply

**CROs:**
```
Job titles: CEO, Founder, VP Business Development, Head of BD
Keywords: CRO, contract research, clinical research organization
Industries: Biotechnology, Pharmaceuticals
```

**Life Sciences Recruiters:**
```
Job titles: Founder, Managing Partner, VP, Director
Keywords: life sciences recruiting, biotech recruiter, pharma talent
Industries: Staffing and Recruiting
```

**Regulatory Consultants:**
```
Job titles: Founder, Principal, Managing Director
Keywords: FDA, regulatory affairs, regulatory consulting
Industries: Biotechnology, Pharmaceuticals, Consulting
```

---

## Weekly Routine

| Day | Action |
|-----|--------|
| Monday | Run script, pull fresh grants |
| Monday | Score and prioritize A's |
| Tues-Wed | Outreach to demand side (grant recipients) |
| Thurs-Fri | Outreach to supply side (with deal flow) |
| Friday | Track responses, schedule intros |

**Time investment: 4-5 hours/week**

---

## Why This Works

1. **Timing** — You're reaching out when they just got money (not cold)
2. **Relevance** — NIH grants = specific need, you match to specific vendor
3. **Both sides pay** — Demand pays for access to vendors, supply pays for leads
4. **No selling** — You're routing, not convincing

---

## The Math

```
NIH awards ~$40B/year
= ~50,000 active grants
= endless demand signals

You only need 5 deals/month at $10K avg = $50K/month
That's 0.01% of the available signals.
```

The deal flow is infinite. Your only job is to route it.

---

## FAQ

**Q: Do I need to enrich emails?**
A: Sometimes the PI email is in the data. If not, use Apollo to find it (PI name + org = easy lookup).

**Q: What if they already have a CRO?**
A: Fine. Connect them to recruiters, consultants, or equipment vendors instead. One grant = multiple needs.

**Q: How do I get supply contacts?**
A: Apollo scrape with the filters above. Or use the wealth-management-supply.csv approach — build a list of 600 service providers.

**Q: Is the API really free?**
A: Yes. Public data. 1 request/sec rate limit. No auth required.

---

## Files

```
nih-signals/
├── nih_grant_signals.py    # The script
├── SOP.md                  # This file
└── nih_biotech_signals.csv # Output (after running)
```

---

## Next Steps

1. Run the script
2. Open the CSV
3. Pick 10 Tier A grants
4. Write 10 emails
5. Get your first intro

That's it. No complex setup. No monthly fees. Just free data and execution.
