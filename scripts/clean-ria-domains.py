"""
Clean RIA domains - replace social media with derived company domains
"""

import pandas as pd
import re

INPUT_FILE = r"C:\Users\Smart Hp\Desktop\filtered_rias_demand.csv"
OUTPUT_FILE = r"C:\Users\Smart Hp\Desktop\rias_cleaned.csv"

BAD_DOMAINS = ['twitter.com', 'linkedin.com', 'x.com', 'facebook.com']

def derive_domain_from_name(company_name):
    """
    'Lux Capital Management, LLC' -> 'luxcapital.com'
    """
    name = company_name.lower()

    # Remove common suffixes
    for suffix in [', llc', ', lp', ', l.p.', ' llc', ' lp', ' l.p.',
                   ' management', ' company', ' inc', ' corp',
                   ', inc.', ', inc', ' incorporated']:
        name = name.replace(suffix, '')

    # Keep "ventures", "capital", "partners" - they're often in the domain
    # Remove special chars except spaces
    name = re.sub(r'[^a-z0-9 ]', '', name)

    # Remove spaces
    name = name.replace(' ', '')

    if name:
        return f"{name}.com"
    return None

def main():
    print("="*60)
    print("CLEAN RIA DOMAINS")
    print("="*60)

    df = pd.read_csv(INPUT_FILE)
    print(f"Loaded {len(df)} firms\n")

    cleaned = 0
    good = 0

    for idx, row in df.iterrows():
        domain = str(row.get('Domain', '')).lower().strip()
        company = row['Company Name']

        # Check if domain is bad
        is_bad = not domain or domain == 'nan' or any(bad in domain for bad in BAD_DOMAINS)

        if is_bad:
            derived = derive_domain_from_name(company)
            if derived:
                df.at[idx, 'Domain'] = derived
                print(f"  FIXED: {company[:45]:45} -> {derived}")
                cleaned += 1
        else:
            good += 1

    print(f"\n{'='*60}")
    print(f"Good domains: {good}")
    print(f"Fixed domains: {cleaned}")
    print(f"Total: {len(df)}")
    print(f"{'='*60}")

    # Save cleaned version
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"\nSaved to: {OUTPUT_FILE}")

    # Create Apollo-ready version (for finding decision makers)
    apollo_rows = []
    for _, row in df.iterrows():
        apollo_rows.append({
            'company_name': row['Company Name'],
            'company_domain': row['Domain'],
            'title_filter': 'Founder,Managing Partner,CEO,Principal,Partner',
            'context': row['Context'],
            'signal': row['Signal'],
            'crd': row['_CRD'],
            'aum': row['_AUM'],
        })

    apollo_df = pd.DataFrame(apollo_rows)
    apollo_file = r"C:\Users\Smart Hp\Desktop\rias_for_apollo.csv"
    apollo_df.to_csv(apollo_file, index=False)
    print(f"Apollo-ready file: {apollo_file}")

    # Also create Connector OS demand template
    demand_rows = []
    for _, row in df.iterrows():
        demand_rows.append({
            'Full Name': '',  # Fill after Apollo enrichment
            'Company Name': row['Company Name'],
            'Domain': row['Domain'],
            'Email': '',  # Fill after Apollo enrichment
            'Context': row['Context'],
            'Signal': row['Signal'],
        })

    demand_df = pd.DataFrame(demand_rows)
    demand_file = r"C:\Users\Smart Hp\Desktop\rias_demand_template.csv"
    demand_df.to_csv(demand_file, index=False)
    print(f"Demand template: {demand_file}")

    print("\n" + "="*60)
    print("NEXT STEPS:")
    print("="*60)
    print("""
1. Go to Apollo -> Search -> Companies
2. Upload 'rias_for_apollo.csv' or search by domain
3. Filter by Title: Founder, Managing Partner, CEO, Principal
4. Export with emails
5. Merge into 'rias_demand_template.csv'
6. Upload to Connector OS as Demand CSV
    """)

if __name__ == "__main__":
    main()
