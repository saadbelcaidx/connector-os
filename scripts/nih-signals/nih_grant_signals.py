"""
NIH Grant Signals — Demand Side for Biotech Connectors

Pulls recent NIH grants as demand signals. These are orgs with
fresh funding who need: CROs, recruiters, consultants, vendors.

FREE API. No auth required. 1 request/sec rate limit.

Usage:
    python nih_grant_signals.py --days 90 --min-amount 500000 --limit 600
"""

import requests
import json
import csv
import argparse
from datetime import datetime, timedelta
from time import sleep

# =============================================================================
# NIH REPORTER API
# =============================================================================

NIH_API_URL = "https://api.reporter.nih.gov/v2/projects/search"

# Therapeutic areas / keywords that indicate biotech demand
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

    # Date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)

    # Use provided keywords or default biotech keywords
    search_keywords = keywords or BIOTECH_KEYWORDS[:10]  # API has limits

    query = {
        "criteria": {
            "award_amount_range": {
                "min_amount": min_amount,
                "max_amount": 100000000  # $100M cap
            },
            "project_start_date": {
                "from_date": start_date.strftime("%Y-%m-%d"),
                "to_date": end_date.strftime("%Y-%m-%d")
            },
            "advanced_text_search": {
                "operator": "or",
                "search_field": "all",
                "search_text": " ".join(search_keywords[:5])  # Limit keywords
            }
        },
        "offset": 0,
        "limit": min(limit, 500),  # API max per request
        "sort_field": "award_amount",
        "sort_order": "desc"
    }

    return query

def fetch_grants(query: dict) -> list:
    """Fetch grants from NIH Reporter API."""

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    all_results = []
    offset = 0
    limit = query.get("limit", 500)
    target = limit

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
            print(f"[NIH API] Fetched {len(all_results)} grants so far...")

            offset += len(results)

            # Rate limit: 1 request per second
            sleep(1)

        except requests.exceptions.RequestException as e:
            print(f"[NIH API] Error: {e}")
            break

    return all_results

def extract_signal(grant: dict) -> dict:
    """Extract signal data from a grant record."""

    # Principal Investigator
    pi_info = grant.get("principal_investigators", [{}])
    pi = pi_info[0] if pi_info else {}
    pi_name = pi.get("full_name", "")
    pi_email = pi.get("email", "")  # Sometimes available

    # Organization
    org = grant.get("organization", {})
    org_name = org.get("org_name", "")
    org_city = org.get("org_city", "")
    org_state = org.get("org_state", "")

    # Grant details
    amount = grant.get("award_amount", 0)
    start_date = grant.get("project_start_date", "")
    end_date = grant.get("project_end_date", "")
    title = grant.get("project_title", "")
    abstract = grant.get("abstract_text", "")[:500] if grant.get("abstract_text") else ""

    # Activity code (R01, R21, SBIR, etc.)
    activity_code = grant.get("activity_code", "")

    # Fiscal year
    fiscal_year = grant.get("fiscal_year", "")

    # Calculate signal score
    signal_score = score_grant(amount, start_date, end_date, activity_code)

    # Determine signal type
    signal_type = determine_signal_type(start_date, end_date, activity_code)

    return {
        "org_name": org_name,
        "org_city": org_city,
        "org_state": org_state,
        "pi_name": pi_name,
        "pi_email": pi_email,
        "grant_amount": amount,
        "start_date": start_date[:10] if start_date else "",
        "end_date": end_date[:10] if end_date else "",
        "project_title": title[:200],
        "activity_code": activity_code,
        "fiscal_year": fiscal_year,
        "abstract": abstract.replace("\n", " ").replace(",", ";"),
        "signal_type": signal_type,
        "signal_score": signal_score,
    }

def score_grant(amount: int, start_date: str, end_date: str, activity_code: str) -> str:
    """Score the grant as A/B/C based on signal strength."""

    score = 0

    # Amount scoring
    if amount >= 2000000:
        score += 40
    elif amount >= 1000000:
        score += 30
    elif amount >= 500000:
        score += 20
    else:
        score += 10

    # Recency scoring (newer = better)
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

    # Activity code scoring (SBIR/STTR = small company, higher intent)
    if activity_code in ["R43", "R44", "R41", "R42"]:  # SBIR/STTR
        score += 20
    elif activity_code in ["R01", "U01"]:  # Major research
        score += 15
    elif activity_code in ["R21"]:  # Exploratory
        score += 10

    # Tier assignment
    if score >= 70:
        return "A"
    elif score >= 45:
        return "B"
    else:
        return "C"

def determine_signal_type(start_date: str, end_date: str, activity_code: str) -> str:
    """Determine the signal type based on grant characteristics."""

    # Check if grant is ending soon
    if end_date:
        try:
            end = datetime.strptime(end_date[:10], "%Y-%m-%d")
            months_until_end = (end - datetime.now()).days / 30
            if 0 < months_until_end <= 12:
                return "Ending soon — commercialization pressure"
        except:
            pass

    # Check if new grant
    if start_date:
        try:
            start = datetime.strptime(start_date[:10], "%Y-%m-%d")
            days_ago = (datetime.now() - start).days
            if days_ago <= 60:
                return "Fresh funding — scaling up"
        except:
            pass

    # SBIR/STTR = small company
    if activity_code in ["R43", "R44", "R41", "R42"]:
        return "SBIR/STTR — small biotech, outsources everything"

    return "Active grant — ongoing needs"

def export_csv(signals: list, output_file: str):
    """Export signals to CSV."""

    if not signals:
        print("[Export] No signals to export")
        return

    fieldnames = [
        "org_name", "org_city", "org_state", "pi_name", "pi_email",
        "grant_amount", "start_date", "end_date", "project_title",
        "activity_code", "fiscal_year", "signal_type", "signal_score", "abstract"
    ]

    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(signals)

    print(f"[Export] Saved {len(signals)} signals to {output_file}")

def print_summary(signals: list):
    """Print summary statistics."""

    if not signals:
        return

    a_count = len([s for s in signals if s["signal_score"] == "A"])
    b_count = len([s for s in signals if s["signal_score"] == "B"])
    c_count = len([s for s in signals if s["signal_score"] == "C"])

    total_funding = sum(s["grant_amount"] for s in signals)

    print("\n" + "="*60)
    print("SIGNAL SUMMARY")
    print("="*60)
    print(f"Total grants:     {len(signals)}")
    print(f"Total funding:    ${total_funding:,.0f}")
    print(f"")
    print(f"Tier A (hot):     {a_count}")
    print(f"Tier B (warm):    {b_count}")
    print(f"Tier C (monitor): {c_count}")
    print("="*60)

# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Pull NIH grant signals for biotech connectors")
    parser.add_argument("--days", type=int, default=90, help="Days back to search (default: 90)")
    parser.add_argument("--min-amount", type=int, default=500000, help="Minimum grant amount (default: 500000)")
    parser.add_argument("--limit", type=int, default=600, help="Max grants to fetch (default: 600)")
    parser.add_argument("--output", type=str, default="nih_biotech_signals.csv", help="Output CSV file")
    parser.add_argument("--keywords", type=str, nargs="+", help="Custom keywords to search")

    args = parser.parse_args()

    print(f"""
================================================================
  NIH GRANT SIGNALS - Biotech Demand Side
  Free API. No auth. Pure deal flow.
================================================================

Settings:
  Days back:    {args.days}
  Min amount:   ${args.min_amount:,}
  Limit:        {args.limit}
  Output:       {args.output}
""")

    # Build query
    query = build_query(
        days_back=args.days,
        min_amount=args.min_amount,
        keywords=args.keywords,
        limit=args.limit
    )

    # Fetch grants
    grants = fetch_grants(query)

    if not grants:
        print("[NIH API] No grants found matching criteria")
        return

    # Extract signals
    print(f"\n[Processing] Extracting signals from {len(grants)} grants...")
    signals = [extract_signal(g) for g in grants]

    # Sort by score (A first) then by amount
    signals.sort(key=lambda x: ({"A": 0, "B": 1, "C": 2}.get(x["signal_score"], 3), -x["grant_amount"]))

    # Print summary
    print_summary(signals)

    # Export
    export_csv(signals, args.output)

    print(f"\nDone! Open {args.output} to see your demand signals.")
    print("Next step: Match these to your supply side (CROs, recruiters, consultants)")

if __name__ == "__main__":
    main()
