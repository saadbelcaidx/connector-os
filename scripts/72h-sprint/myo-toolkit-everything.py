#!/usr/bin/env python3
"""
=============================================================================
MYO TOOLKIT — Full Multi-Vertical Scraper
=============================================================================

THIS IS THE FULL TOOLKIT. DO NOT GIVE THIS AWAY.

VERTICALS:
    - healthtech  (Healthcare providers -> Healthtech startups)
    - fintech     (Financial advisors -> Fintech startups)
    - enterprise  (Funded companies -> New startups)
    - saas        (B2B companies -> Dev tool startups)

HOW TO RUN:
    python myo-toolkit-everything.py --vertical healthtech
    python myo-toolkit-everything.py --vertical healthtech --volume medium
    python myo-toolkit-everything.py --vertical healthtech --volume high

VOLUME OPTIONS:
    --volume low     ~800 leads   (4 states, fast)
    --volume medium  ~2500 leads  (10 states)
    --volume high    ~5000 leads  (20 states, takes longer)

OUTPUT:
    demand_<vertical>.csv  (BUYERS - companies with problems)
    supply_<vertical>.csv  (SELLERS - companies with solutions)

=============================================================================
PRIVATE: Keep this. Give away the demo scripts (healthcare only)
=============================================================================
"""

import requests
import csv
import time
import argparse
from typing import List, Dict


# =============================================================================
# VOLUME CONFIGS — State lists by volume level
# =============================================================================

VOLUME_STATES = {
    "low": ["CA", "TX", "NY", "FL"],
    "medium": ["CA", "TX", "NY", "FL", "IL", "PA", "OH", "GA", "NC", "MI"],
    "high": [
        "CA", "TX", "NY", "FL", "IL", "PA", "OH", "GA", "NC", "MI",
        "NJ", "VA", "WA", "AZ", "MA", "TN", "IN", "MO", "MD", "WI"
    ],
}

VOLUME_LIMITS = {
    "low": 200,
    "medium": 250,
    "high": 250,
}


# =============================================================================
# NPI REGISTRY — Healthcare Providers
# =============================================================================

def scrape_npi(states: List[str], limit_per_state: int = 200) -> List[Dict]:
    """
    NPI Registry (US Government) - Healthcare providers.
    FREE, no auth required.
    """
    print(f"[NPI] Scraping healthcare providers ({len(states)} states)...")

    results = []
    url = "https://npiregistry.cms.hhs.gov/api/"

    for state in states:
        print(f"  [{state}]...", end=" ", flush=True)

        params = {
            "version": "2.1",
            "state": state,
            "limit": min(limit_per_state, 200),
        }

        try:
            response = requests.get(url, params=params, timeout=30)
            data = response.json()
            providers = data.get("results", [])

            for p in providers:
                basic = p.get("basic", {}) or {}
                addresses = p.get("addresses", []) or []
                address = addresses[0] if addresses else {}
                taxonomies = p.get("taxonomies", []) or []
                taxonomy = taxonomies[0] if taxonomies else {}

                org_name = basic.get("organization_name", "")
                first = basic.get("first_name", "")
                last = basic.get("last_name", "")

                results.append({
                    "company": org_name if org_name else f"{first} {last} Practice".strip(),
                    "domain": "",
                    "fullName": f"{first} {last}".strip() if not org_name else "",
                    "title": taxonomy.get("desc", "Healthcare Provider"),
                    "signal": f"NPI Active - {taxonomy.get('desc', 'Healthcare')[:30]}",
                    "industry": "Healthcare",
                    "city": address.get("city", ""),
                    "state": address.get("state", state),
                })

            print(f"{len(providers)}")
            time.sleep(0.3)

        except Exception as e:
            print(f"Error: {e}")

    print(f"[NPI] Total: {len(results)}")
    return results


# =============================================================================
# FINRA — Financial Advisors
# =============================================================================

def scrape_finra(states: List[str], limit_per_state: int = 200) -> List[Dict]:
    """
    FINRA BrokerCheck - Licensed financial advisors.
    FREE, no auth required.
    """
    print(f"[FINRA] Scraping financial advisors ({len(states)} states)...")

    results = []
    url = "https://api.brokercheck.finra.org/search/individual"

    for state in states:
        print(f"  [{state}]...", end=" ", flush=True)

        params = {
            "query": "",
            "filter": f"currentEmployments.scope:Active,currentEmployments.branchState:{state}",
            "hl": "true",
            "nrows": min(limit_per_state, 100),
            "start": 0,
            "sort": "score+desc",
            "wt": "json"
        }

        try:
            response = requests.get(url, params=params, timeout=30)

            if response.status_code == 200:
                data = response.json()
                hits = data.get("hits", {}).get("hits", [])

                for hit in hits:
                    source = hit.get("_source", {})
                    current = source.get("currentEmployments", [{}])[0] if source.get("currentEmployments") else {}

                    results.append({
                        "company": current.get("firmName", ""),
                        "domain": "",
                        "fullName": f"{source.get('firstName', '')} {source.get('lastName', '')}".strip(),
                        "title": "Financial Advisor",
                        "signal": f"FINRA Licensed - {current.get('branchCity', '')}, {state}",
                        "industry": "Financial Services",
                        "city": current.get("branchCity", ""),
                        "state": state,
                    })

                print(f"{len(hits)}")
            else:
                print(f"Error {response.status_code}")

            time.sleep(0.5)

        except Exception as e:
            print(f"Error: {e}")

    print(f"[FINRA] Total: {len(results)}")
    return results


# =============================================================================
# YC COMPANIES — Startups (Supply)
# =============================================================================

def scrape_yc(industry: str = "", batch: str = "", limit: int = 200) -> List[Dict]:
    """
    Y Combinator company directory (Algolia API).
    FREE, no auth required.
    """
    print(f"[YC] Scraping startups (industry={industry}, batch={batch}, limit={limit})...")

    results = []
    url = "https://45bwzj1sgc-dsn.algolia.net/1/indexes/YCCompany_production/query"

    headers = {
        "x-algolia-api-key": "NDYzYmNmMTRjYzU4MDE0ZWY0MTU2OTUyNmM4OGZjMTQwMWIzNTRhMWU0MTQ3Y2M2Zjg5OGI1MmMwZjRjNjMxMGF0dHJpYnV0ZXNUb1JldHJpZXZlPSU1QiUyMm5hbWUlMjIlMkMlMjJzbHVnJTIyJTJDJTIyb25lX2xpbmVyJTIyJTJDJTIyd2Vic2l0ZSUyMiUyQyUyMnNtYWxsX2xvZ29fdXJsJTIyJTJDJTIyYmF0Y2glMjIlMkMlMjJpbmR1c3RyaWVzJTIyJTJDJTIyc3RhdHVzJTIyJTJDJTIydGVhbV9zaXplJTIyJTJDJTIybG9uZ19kZXNjcmlwdGlvbiUyMiU1RCZoaWdobGlnaHRQb3N0VGFnPV9fJTJGYWlzLWhpZ2hsaWdodF9fJmhpZ2hsaWdodFByZVRhZz1fX2Fpcy1oaWdobGlnaHRfXw==",
        "x-algolia-application-id": "45BWZJ1SGC",
        "Content-Type": "application/json"
    }

    filters = []
    if batch:
        filters.append(f"batch:{batch}")
    if industry:
        filters.append(f"industries:{industry}")

    body = {
        "query": "",
        "hitsPerPage": min(limit, 1000),
        "filters": " AND ".join(filters) if filters else ""
    }

    try:
        response = requests.post(url, headers=headers, json=body, timeout=30)

        if response.status_code == 200:
            data = response.json()
            hits = data.get("hits", [])

            for h in hits:
                website = h.get("website", "") or ""
                domain = website.replace("https://", "").replace("http://", "").split("/")[0]

                results.append({
                    "company": h.get("name", ""),
                    "domain": domain,
                    "description": h.get("one_liner", ""),
                    "capability": h.get("one_liner", "")[:100],
                    "industry": h.get("industries", ["Technology"])[0] if h.get("industries") else "Technology",
                    "signal": f"YC {h.get('batch', '')} - {h.get('status', 'Active')}",
                })

            print(f"  Found {len(results)}")
        else:
            print(f"  Error: {response.status_code}")

    except Exception as e:
        print(f"  Error: {e}")

    return results


# =============================================================================
# CSV OUTPUT
# =============================================================================

def save_csv(data: List[Dict], filename: str, side: str = "demand"):
    """Save to Connector OS format."""

    if not data:
        print(f"[CSV] No data for {filename}")
        return

    if side == "demand":
        fields = ["company", "domain", "signal", "industry", "fullName", "title", "city", "state"]
    else:
        fields = ["company", "domain", "description", "capability", "industry", "signal"]

    clean_data = []
    for row in data:
        clean_row = {f: row.get(f, "") for f in fields}
        clean_data.append(clean_row)

    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(clean_data)

    print(f"[CSV] Saved {len(clean_data)} records -> {filename}")


# =============================================================================
# VERTICAL BUILDERS (use volume settings)
# =============================================================================

def build_verticals(volume: str):
    """Build vertical configs based on volume level."""

    states = VOLUME_STATES[volume]
    limit = VOLUME_LIMITS[volume]

    # YC limits scale with volume
    yc_limit = {"low": 200, "medium": 500, "high": 1000}[volume]

    return {
        "healthtech": {
            "demand": lambda s=states, l=limit: scrape_npi(s, l),
            "supply": lambda lim=yc_limit: scrape_yc(industry="Healthcare", limit=lim),
            "desc": "Healthcare providers -> Healthtech startups"
        },
        "fintech": {
            "demand": lambda s=states, l=limit: scrape_finra(s, l),
            "supply": lambda lim=yc_limit: scrape_yc(industry="Fintech", limit=lim),
            "desc": "Financial advisors -> Fintech startups"
        },
        "enterprise": {
            "demand": lambda lim=yc_limit: scrape_yc(batch="W23", limit=lim//2) + scrape_yc(batch="S23", limit=lim//2),
            "supply": lambda lim=yc_limit: scrape_yc(batch="W24", limit=lim//2) + scrape_yc(batch="S24", limit=lim//2),
            "desc": "Funded YC companies -> New YC startups"
        },
        "saas": {
            "demand": lambda lim=yc_limit: scrape_yc(industry="B2B", limit=lim),
            "supply": lambda lim=yc_limit: scrape_yc(industry="Developer Tools", limit=lim),
            "desc": "B2B companies -> Dev tool startups"
        },
    }


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MYO Toolkit — Full Multi-Vertical Scraper")
    parser.add_argument("--vertical", choices=["healthtech", "fintech", "enterprise", "saas"],
                        required=True, help="Which vertical to scrape")
    parser.add_argument("--volume", choices=["low", "medium", "high"], default="low",
                        help="Volume level: low (~800), medium (~2500), high (~5000)")

    args = parser.parse_args()

    # Build verticals with volume settings
    verticals = build_verticals(args.volume)
    v = verticals[args.vertical]

    print("\n" + "="*60)
    print(f"MYO TOOLKIT — {args.vertical.upper()}")
    print(f"Volume: {args.volume.upper()} ({len(VOLUME_STATES[args.volume])} states)")
    print(f"{v['desc']}")
    print("="*60)

    # Demand side
    print("\n[DEMAND] Scraping buyers...")
    demand = v["demand"]()
    save_csv(demand, f"demand_{args.vertical}.csv", side="demand")

    # Supply side
    print("\n[SUPPLY] Scraping sellers...")
    supply = v["supply"]()
    save_csv(supply, f"supply_{args.vertical}.csv", side="supply")

    print("\n" + "="*60)
    print("DONE!")
    print(f"  Demand: demand_{args.vertical}.csv ({len(demand)} records)")
    print(f"  Supply: supply_{args.vertical}.csv ({len(supply)} records)")
    print(f"  Total:  {len(demand) + len(supply)} leads")
    print("")
    print("Upload to Connector OS, match, route, collect.")
    print("="*60 + "\n")
