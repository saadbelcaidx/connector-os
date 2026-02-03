#!/usr/bin/env python3
"""
=============================================================================
MYO DEMAND SCRAPER — Healthcare Providers
=============================================================================

Pulls REAL healthcare providers from the US government database.
No API keys. No payment. Just run it.

HOW TO RUN:
    python myo-demand-healthcare.py                   # ~900 leads (default)
    python myo-demand-healthcare.py --volume medium   # ~2500 leads
    python myo-demand-healthcare.py --volume high     # ~5000 leads

OUTPUT: demand_healthcare.csv

SOURCE: NPI Registry (US Government) — 100% free, 100% legal

=============================================================================
"""

import requests
import csv
import time
import argparse


# =============================================================================
# VOLUME CONFIGS
# =============================================================================

VOLUME_CONFIGS = {
    "low": {
        "cities": {
            "CA": ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento"],
            "TX": ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth"],
            "NY": ["New York", "Brooklyn", "Queens", "Buffalo", "Rochester"],
            "FL": ["Miami", "Orlando", "Tampa", "Jacksonville"],
        },
        "leads_per_city": 50,
    },
    "medium": {
        "cities": {
            "CA": ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento", "Fresno", "Long Beach"],
            "TX": ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth", "El Paso", "Arlington"],
            "NY": ["New York", "Brooklyn", "Queens", "Buffalo", "Rochester", "Syracuse", "Albany"],
            "FL": ["Miami", "Orlando", "Tampa", "Jacksonville", "St. Petersburg", "Fort Lauderdale"],
            "IL": ["Chicago", "Aurora", "Naperville", "Joliet", "Rockford"],
            "PA": ["Philadelphia", "Pittsburgh", "Allentown", "Erie", "Reading"],
        },
        "leads_per_city": 100,
    },
    "high": {
        "cities": {
            "CA": ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento", "Fresno", "Long Beach", "Oakland"],
            "TX": ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth", "El Paso", "Arlington", "Plano"],
            "NY": ["New York", "Brooklyn", "Queens", "Buffalo", "Rochester", "Syracuse", "Albany"],
            "FL": ["Miami", "Orlando", "Tampa", "Jacksonville", "St. Petersburg", "Fort Lauderdale", "Tallahassee"],
            "IL": ["Chicago", "Aurora", "Naperville", "Joliet", "Rockford"],
            "PA": ["Philadelphia", "Pittsburgh", "Allentown", "Erie", "Reading"],
            "OH": ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron"],
            "GA": ["Atlanta", "Augusta", "Savannah", "Athens"],
            "NC": ["Charlotte", "Raleigh", "Greensboro", "Durham"],
            "MI": ["Detroit", "Grand Rapids", "Ann Arbor", "Warren"],
        },
        "leads_per_city": 200,
    },
}

OUTPUT_FILE = "demand_healthcare.csv"


# =============================================================================
# SCRAPER
# =============================================================================

def scrape_healthcare_providers(volume: str):
    """Pull healthcare providers from NPI Registry."""

    config = VOLUME_CONFIGS[volume]
    cities = config["cities"]
    leads_per_city = config["leads_per_city"]

    print("\n" + "="*60)
    print("MYO DEMAND SCRAPER — Healthcare Providers")
    print("="*60)
    print(f"\nVolume: {volume.upper()}")
    print(f"States: {len(cities)}")
    print(f"Source: NPI Registry (US Government)")
    print(f"Cost: $0")
    print("")

    all_leads = []
    api_url = "https://npiregistry.cms.hhs.gov/api/"

    for state, city_list in cities.items():
        print(f"\n[{state}] Scraping {len(city_list)} cities...")

        for city in city_list:
            print(f"  - {city}...", end=" ", flush=True)

            params = {
                "version": "2.1",
                "city": city,
                "state": state,
                "limit": leads_per_city,
            }

            try:
                response = requests.get(api_url, params=params, timeout=30)
                data = response.json()
                providers = data.get("results", [])
                print(f"{len(providers)} leads")

                for provider in providers:
                    lead = extract_lead(provider, state)
                    if lead:
                        all_leads.append(lead)

                time.sleep(0.3)

            except Exception as e:
                print(f"Error: {e}")

    print(f"\n{'='*60}")
    print(f"TOTAL: {len(all_leads)} healthcare providers")
    print(f"{'='*60}")

    return all_leads


def extract_lead(provider, state):
    """Extract clean lead data from API response."""

    try:
        basic = provider.get("basic", {}) or {}
        taxonomies = provider.get("taxonomies", []) or []
        specialty = taxonomies[0].get("desc", "Healthcare Provider") if taxonomies else "Healthcare Provider"
        addresses = provider.get("addresses", []) or []
        address = addresses[0] if addresses else {}

        org_name = basic.get("organization_name", "")
        first_name = basic.get("first_name", "")
        last_name = basic.get("last_name", "")

        if org_name:
            company = org_name
            full_name = ""
        else:
            company = f"{first_name} {last_name} Practice".strip()
            full_name = f"{first_name} {last_name}".strip()

        if not company or company == " Practice":
            return None

        return {
            "company": company,
            "domain": "",
            "signal": f"Healthcare Provider - {specialty[:40]}",
            "industry": "Healthcare",
            "fullName": full_name,
            "title": specialty,
            "city": address.get("city", ""),
            "state": address.get("state", state),
        }

    except Exception:
        return None


# =============================================================================
# SAVE CSV
# =============================================================================

def save_to_csv(leads):
    """Save leads to CSV."""

    if not leads:
        print("\nNo leads to save!")
        return

    columns = ["company", "domain", "signal", "industry", "fullName", "title", "city", "state"]

    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(leads)

    print(f"\nSaved: {OUTPUT_FILE}")
    print(f"Leads: {len(leads)}")


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MYO Demand Scraper — Healthcare Providers")
    parser.add_argument("--volume", choices=["low", "medium", "high"], default="low",
                        help="Volume: low (~900), medium (~2500), high (~5000)")

    args = parser.parse_args()

    leads = scrape_healthcare_providers(args.volume)
    save_to_csv(leads)

    print("\n" + "="*60)
    print("DONE!")
    print("Next: Run myo-supply-healthcare-startups.py")
    print("="*60 + "\n")
