"""
NIH Grant Signals V2 — FULL EXTRACTION

Extracts EVERYTHING valuable from NIH Reporter API.
Previous version used 14 fields. This uses 30+.

New fields:
- NIH Institute (NCI, NIAID, etc.) → therapeutic area matching
- Spending categories → pre-categorized by NIH
- Organization type → academic vs commercial
- Is new grant → scaling up signals
- Is active → confirmed live
- All PIs → multiple contact points
- Geographic data → regional matching
- Project URL → credibility in outreach
- Keywords/terms → specialized CRO matching

Usage:
    python nih_grant_signals_v2.py --days 90 --min-amount 500000 --limit 600
"""

import requests
import json
import csv
import argparse
from datetime import datetime, timedelta
from time import sleep

NIH_API_URL = "https://api.reporter.nih.gov/v2/projects/search"

# NIH Institute → Therapeutic Area mapping
NIH_INSTITUTE_MAP = {
    "NCI": "Oncology",
    "NIAID": "Infectious Disease / Immunology",
    "NHLBI": "Cardiovascular",
    "NINDS": "Neurology",
    "NIA": "Aging / Neurodegeneration",
    "NIDDK": "Metabolic / Diabetes",
    "NIMH": "Mental Health / CNS",
    "NICHD": "Pediatrics / Reproductive",
    "NIEHS": "Environmental Health",
    "NIDA": "Addiction",
    "NIAAA": "Alcohol Research",
    "NIGMS": "General Medical Sciences",
    "NCATS": "Translational Sciences",
    "NLM": "Library / Informatics",
    "NHGRI": "Genomics",
    "NIBIB": "Biomedical Imaging",
    "NCCIH": "Complementary Medicine",
    "NIDCD": "Hearing / Communication",
    "NIDCR": "Dental / Craniofacial",
    "NEI": "Ophthalmology",
    "NIAMS": "Musculoskeletal",
    "NIMHD": "Health Disparities",
    "NINR": "Nursing Research",
}

# Biotech keywords for search
BIOTECH_KEYWORDS = [
    "oncology", "cancer", "tumor",
    "gene therapy", "cell therapy", "CAR-T",
    "immunotherapy", "immunology",
    "rare disease", "orphan drug",
    "neurology", "neurodegeneration", "Alzheimer", "Parkinson",
    "infectious disease", "vaccine", "antiviral",
    "cardiovascular", "cardiology",
    "metabolic", "diabetes",
    "regenerative medicine", "stem cell",
    "biologics", "antibody", "protein therapeutic",
    "clinical trial", "Phase 1", "Phase 2", "Phase 3",
    "drug discovery", "therapeutic",
]

def build_query(days_back: int, min_amount: int, keywords: list = None, limit: int = 600):
    """Build NIH API query payload."""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)
    search_keywords = keywords or BIOTECH_KEYWORDS[:10]

    return {
        "criteria": {
            "award_amount_range": {
                "min_amount": min_amount,
                "max_amount": 100000000
            },
            "project_start_date": {
                "from_date": start_date.strftime("%Y-%m-%d"),
                "to_date": end_date.strftime("%Y-%m-%d")
            },
            "advanced_text_search": {
                "operator": "or",
                "search_field": "all",
                "search_text": " ".join(search_keywords[:5])
            }
        },
        "offset": 0,
        "limit": min(limit, 500),
        "sort_field": "award_amount",
        "sort_order": "desc"
    }

def fetch_grants(query: dict) -> list:
    """Fetch grants from NIH Reporter API with pagination."""
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    all_results = []
    offset = 0
    target = query.get("limit", 500)

    print(f"[NIH API] Fetching grants...")

    while len(all_results) < target:
        query["offset"] = offset
        query["limit"] = min(500, target - len(all_results))

        try:
            response = requests.post(NIH_API_URL, json=query, headers=headers)
            response.raise_for_status()
            data = response.json()
            results = data.get("results", [])

            if not results:
                break

            all_results.extend(results)
            print(f"[NIH API] Fetched {len(all_results)} grants...")
            offset += len(results)
            sleep(1)  # Rate limit

        except requests.exceptions.RequestException as e:
            print(f"[NIH API] Error: {e}")
            break

    return all_results

def extract_signal_full(grant: dict) -> dict:
    """Extract ALL valuable signal data from a grant record."""

    # === ORGANIZATION ===
    org = grant.get("organization", {})
    org_name = org.get("org_name", "")
    org_city = org.get("org_city", "")
    org_state = org.get("org_state", "")
    org_country = org.get("org_country", "")
    org_zipcode = org.get("org_zipcode", "")
    org_type = grant.get("organization_type", {}).get("name", "")
    org_duns = org.get("primary_duns", "")

    # Geographic
    geo = grant.get("geo_lat_lon", {})
    latitude = geo.get("lat", "")
    longitude = geo.get("lon", "")
    cong_district = grant.get("cong_dist", "")

    # === PRINCIPAL INVESTIGATORS (ALL OF THEM) ===
    pi_list = grant.get("principal_investigators", [])

    # Primary PI
    primary_pi = pi_list[0] if pi_list else {}
    pi_name = primary_pi.get("full_name", "").strip()
    pi_first = primary_pi.get("first_name", "")
    pi_last = primary_pi.get("last_name", "").strip()
    pi_title = primary_pi.get("title", "")
    pi_profile_id = primary_pi.get("profile_id", "")

    # All PIs (for multiple contact points)
    all_pi_names = "; ".join([p.get("full_name", "").strip() for p in pi_list if p.get("full_name")])
    pi_count = len(pi_list)

    # === GRANT DETAILS ===
    amount = grant.get("award_amount", 0)
    start_date = grant.get("project_start_date", "")
    end_date = grant.get("project_end_date", "")
    title = grant.get("project_title", "")
    activity_code = grant.get("activity_code", "")
    fiscal_year = grant.get("fiscal_year", "")
    project_num = grant.get("project_num", "")

    # === NIH INSTITUTE (THERAPEUTIC AREA) ===
    agency = grant.get("agency_ic_admin", {})
    nih_institute = agency.get("abbreviation", "")
    nih_institute_name = agency.get("name", "")
    therapeutic_area = NIH_INSTITUTE_MAP.get(nih_institute, "")

    # === CATEGORIES (PRE-TAGGED BY NIH) ===
    spending_categories = grant.get("spending_categories_desc", "")

    # === KEYWORDS / TERMS ===
    pref_terms = grant.get("pref_terms", "")
    # Truncate for CSV but keep useful portion
    top_terms = "; ".join(pref_terms.split(";")[:15]) if pref_terms else ""

    # === ABSTRACT ===
    abstract = grant.get("abstract_text", "")
    abstract_short = abstract[:500].replace("\n", " ").replace(",", ";") if abstract else ""

    # === FLAGS ===
    is_active = grant.get("is_active", False)
    is_new = grant.get("is_new", False)
    funding_mechanism = grant.get("funding_mechanism", "")

    # === LINKS ===
    project_url = grant.get("project_detail_url", "")

    # === SCORING ===
    signal_score = score_grant_v2(amount, start_date, end_date, activity_code, is_active, is_new, org_type)
    signal_type = determine_signal_type_v2(start_date, end_date, activity_code, is_new, org_type)

    # === OUTSOURCING LIKELIHOOD ===
    outsource_score = calculate_outsource_likelihood(org_type, activity_code, amount, is_new)

    return {
        # Core
        "org_name": org_name,
        "org_city": org_city,
        "org_state": org_state,
        "org_country": org_country,
        "org_type": org_type,
        "org_duns": org_duns,

        # Geographic
        "latitude": latitude,
        "longitude": longitude,
        "congressional_district": cong_district,

        # PI (Primary)
        "pi_name": pi_name,
        "pi_first_name": pi_first,
        "pi_last_name": pi_last,
        "pi_title": pi_title,
        "pi_profile_id": pi_profile_id,

        # All PIs
        "all_pis": all_pi_names,
        "pi_count": pi_count,

        # Grant
        "grant_amount": amount,
        "start_date": start_date[:10] if start_date else "",
        "end_date": end_date[:10] if end_date else "",
        "project_title": title[:200] if title else "",
        "activity_code": activity_code,
        "fiscal_year": fiscal_year,
        "project_number": project_num,
        "funding_mechanism": funding_mechanism,

        # NIH Institute / Therapeutic Area
        "nih_institute": nih_institute,
        "nih_institute_name": nih_institute_name,
        "therapeutic_area": therapeutic_area,

        # Categories
        "spending_categories": spending_categories,
        "top_terms": top_terms,

        # Flags
        "is_active": "Yes" if is_active else "No",
        "is_new_grant": "Yes" if is_new else "No",

        # Links
        "project_url": project_url,

        # Scores
        "signal_type": signal_type,
        "signal_score": signal_score,
        "outsource_likelihood": outsource_score,

        # Abstract (last, it's long)
        "abstract": abstract_short,
    }

def score_grant_v2(amount, start_date, end_date, activity_code, is_active, is_new, org_type):
    """Enhanced scoring with new signals."""
    score = 0

    # Amount scoring (0-40)
    if amount >= 2000000:
        score += 40
    elif amount >= 1000000:
        score += 30
    elif amount >= 500000:
        score += 20
    else:
        score += 10

    # Recency scoring (0-30)
    if start_date:
        try:
            start = datetime.strptime(start_date[:10], "%Y-%m-%d")
            days_ago = (datetime.now() - start).days
            if days_ago <= 30:
                score += 30
            elif days_ago <= 60:
                score += 20
            elif days_ago <= 90:
                score += 10
        except:
            pass

    # Activity code (0-20)
    if activity_code in ["R43", "R44", "R41", "R42"]:  # SBIR/STTR
        score += 20
    elif activity_code in ["R01", "U01"]:  # Major research
        score += 15
    elif activity_code in ["R21"]:  # Exploratory
        score += 10

    # NEW: Is active bonus (0-10)
    if is_active:
        score += 10

    # NEW: New grant bonus (0-10)
    if is_new:
        score += 10

    # NEW: Commercial org bonus (0-10) — they outsource more
    if org_type and "Higher Education" not in org_type:
        score += 10

    # Tier assignment
    if score >= 80:
        return "A+"
    elif score >= 65:
        return "A"
    elif score >= 50:
        return "B"
    else:
        return "C"

def determine_signal_type_v2(start_date, end_date, activity_code, is_new, org_type):
    """Enhanced signal type with more context."""
    signals = []

    # New grant
    if is_new:
        signals.append("NEW GRANT")

    # Fresh funding (recent start)
    if start_date:
        try:
            start = datetime.strptime(start_date[:10], "%Y-%m-%d")
            days_ago = (datetime.now() - start).days
            if days_ago <= 60:
                signals.append("Fresh funding")
        except:
            pass

    # Ending soon
    if end_date:
        try:
            end = datetime.strptime(end_date[:10], "%Y-%m-%d")
            months_until_end = (end - datetime.now()).days / 30
            if 0 < months_until_end <= 12:
                signals.append("Ending <12mo")
        except:
            pass

    # SBIR/STTR
    if activity_code in ["R43", "R44", "R41", "R42"]:
        signals.append("SBIR/STTR (small co)")

    # Commercial entity
    if org_type and "Higher Education" not in org_type and "Hospital" not in org_type:
        signals.append("Commercial")

    return " | ".join(signals) if signals else "Active grant"

def calculate_outsource_likelihood(org_type, activity_code, amount, is_new):
    """Calculate how likely they are to outsource (need CROs, recruiters, etc.)."""
    score = 0

    # SBIR/STTR = small company, outsources everything
    if activity_code in ["R43", "R44", "R41", "R42"]:
        score += 40

    # Commercial entity (not academic)
    if org_type:
        if "Higher Education" not in org_type and "Hospital" not in org_type:
            score += 30
        elif "Small Business" in org_type:
            score += 40

    # Big budget = multiple vendor needs
    if amount >= 2000000:
        score += 20
    elif amount >= 1000000:
        score += 10

    # New grant = building team, needs vendors
    if is_new:
        score += 10

    if score >= 60:
        return "HIGH"
    elif score >= 30:
        return "MEDIUM"
    else:
        return "LOW"

def export_csv(signals: list, output_file: str):
    """Export full signals to CSV."""
    if not signals:
        print("[Export] No signals to export")
        return

    fieldnames = [
        # Core org
        "org_name", "org_city", "org_state", "org_country", "org_type", "org_duns",
        # Geographic
        "latitude", "longitude", "congressional_district",
        # PI
        "pi_name", "pi_first_name", "pi_last_name", "pi_title", "pi_profile_id",
        "all_pis", "pi_count",
        # Grant
        "grant_amount", "start_date", "end_date", "project_title",
        "activity_code", "fiscal_year", "project_number", "funding_mechanism",
        # Therapeutic
        "nih_institute", "nih_institute_name", "therapeutic_area",
        # Categories
        "spending_categories", "top_terms",
        # Flags
        "is_active", "is_new_grant",
        # Links
        "project_url",
        # Scores
        "signal_type", "signal_score", "outsource_likelihood",
        # Abstract
        "abstract",
    ]

    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(signals)

    print(f"[Export] Saved {len(signals)} signals to {output_file}")

def print_summary(signals: list):
    """Print enhanced summary statistics."""
    if not signals:
        return

    # Score distribution
    a_plus = len([s for s in signals if s["signal_score"] == "A+"])
    a_count = len([s for s in signals if s["signal_score"] == "A"])
    b_count = len([s for s in signals if s["signal_score"] == "B"])
    c_count = len([s for s in signals if s["signal_score"] == "C"])

    # Outsource likelihood
    high_outsource = len([s for s in signals if s["outsource_likelihood"] == "HIGH"])
    med_outsource = len([s for s in signals if s["outsource_likelihood"] == "MEDIUM"])

    # Therapeutic areas
    areas = {}
    for s in signals:
        area = s["therapeutic_area"] or "Other"
        areas[area] = areas.get(area, 0) + 1
    top_areas = sorted(areas.items(), key=lambda x: -x[1])[:5]

    # New grants
    new_grants = len([s for s in signals if s["is_new_grant"] == "Yes"])

    total_funding = sum(s["grant_amount"] for s in signals)

    print("\n" + "="*70)
    print("SIGNAL SUMMARY (V2 - FULL EXTRACTION)")
    print("="*70)
    print(f"Total grants:        {len(signals)}")
    print(f"Total funding:       ${total_funding:,.0f}")
    print(f"New grants:          {new_grants}")
    print()
    print("SIGNAL TIERS:")
    print(f"  A+ (hottest):      {a_plus}")
    print(f"  A  (hot):          {a_count}")
    print(f"  B  (warm):         {b_count}")
    print(f"  C  (monitor):      {c_count}")
    print()
    print("OUTSOURCE LIKELIHOOD:")
    print(f"  HIGH:              {high_outsource}")
    print(f"  MEDIUM:            {med_outsource}")
    print()
    print("TOP THERAPEUTIC AREAS:")
    for area, count in top_areas:
        print(f"  {area}: {count}")
    print("="*70)

def main():
    parser = argparse.ArgumentParser(description="NIH Grant Signals V2 - Full Extraction")
    parser.add_argument("--days", type=int, default=90, help="Days back to search")
    parser.add_argument("--min-amount", type=int, default=500000, help="Minimum grant amount")
    parser.add_argument("--limit", type=int, default=600, help="Max grants to fetch")
    parser.add_argument("--output", type=str, default="nih_biotech_signals_v2.csv", help="Output CSV")
    parser.add_argument("--keywords", type=str, nargs="+", help="Custom keywords")

    args = parser.parse_args()

    print(f"""
====================================================================
  NIH GRANT SIGNALS V2 - FULL EXTRACTION
  30+ fields extracted (vs 14 in V1)

  NEW: Therapeutic area, outsource likelihood, all PIs, geo data
====================================================================

Settings:
  Days back:    {args.days}
  Min amount:   ${args.min_amount:,}
  Limit:        {args.limit}
  Output:       {args.output}
""")

    query = build_query(
        days_back=args.days,
        min_amount=args.min_amount,
        keywords=args.keywords,
        limit=args.limit
    )

    grants = fetch_grants(query)

    if not grants:
        print("[NIH API] No grants found")
        return

    print(f"\n[Processing] Extracting FULL signals from {len(grants)} grants...")
    signals = [extract_signal_full(g) for g in grants]

    # Sort by score then amount
    score_order = {"A+": 0, "A": 1, "B": 2, "C": 3}
    signals.sort(key=lambda x: (score_order.get(x["signal_score"], 4), -x["grant_amount"]))

    print_summary(signals)
    export_csv(signals, args.output)

    print(f"\nDone! Full extraction saved to {args.output}")
    print("\nNEW COLUMNS TO LEVERAGE:")
    print("  - therapeutic_area     = Match to specialized CROs")
    print("  - outsource_likelihood = Prioritize HIGH outsourcers")
    print("  - all_pis              = Multiple contact points per grant")
    print("  - project_url          = Reference in outreach for credibility")
    print("  - is_new_grant         = Fresh money, scaling up")

if __name__ == "__main__":
    main()
