"""
SEC RIA Filter — VOLUME MODE
Target: 3K+ firms for enrichment funnel
"""

import pandas as pd
from datetime import datetime, timedelta
import re

INPUT_FILE = r"C:\Users\Smart Hp\Desktop\sec-data\IA_SEC_-_FIRM_ROSTER_FOIA_DOWNLOAD_-_34445670.CSV"
OUTPUT_FILE = r"C:\Users\Smart Hp\Desktop\rias_volume_3k.csv"

def parse_money(val):
    if pd.isna(val):
        return 0
    val = str(val).replace(',', '').replace('$', '').strip()
    try:
        return float(val)
    except:
        return 0

def parse_date(val):
    if pd.isna(val):
        return None
    try:
        return pd.to_datetime(val)
    except:
        return None

def clean_domain(website):
    """Extract clean domain from website URL"""
    if pd.isna(website) or not website:
        return ''

    domain = str(website).lower()
    domain = domain.replace('https://', '').replace('http://', '').replace('www.', '')
    domain = domain.split('/')[0].split(';')[0].strip()

    # Skip social media
    if domain in ['twitter.com', 'linkedin.com', 'x.com', 'facebook.com']:
        return ''

    return domain

def derive_domain(company_name):
    """Derive domain from company name"""
    name = company_name.lower()
    for suffix in [', llc', ', lp', ', l.p.', ' llc', ' lp', ' l.p.',
                   ' management', ' company', ' inc', ' corp', ', inc.', ', inc']:
        name = name.replace(suffix, '')
    name = re.sub(r'[^a-z0-9 ]', '', name).replace(' ', '')
    return f"{name}.com" if name else ''

def main():
    print("="*60)
    print("SEC RIA FILTER — VOLUME MODE (Target: 3K+)")
    print("="*60)

    df = pd.read_csv(INPUT_FILE, low_memory=False, encoding='latin-1')
    print(f"Total records: {len(df):,}")

    filtered = df.copy()

    # ===========================================
    # FILTER 1: Active status only
    # ===========================================
    before = len(filtered)
    filtered = filtered[filtered['SEC Current Status'].astype(str).str.contains('Active', case=False, na=False)]
    print(f"\n[Filter 1] Active status: {before:,} -> {len(filtered):,}")

    # ===========================================
    # FILTER 2: Filed in last 18 months (recently active)
    # ===========================================
    before = len(filtered)
    cutoff = datetime.now() - timedelta(days=18*30)
    filtered['_last_filed'] = filtered['Latest ADV Filing Date'].apply(parse_date)
    filtered = filtered[filtered['_last_filed'].notna()]
    filtered = filtered[filtered['_last_filed'] >= cutoff]
    print(f"[Filter 2] Filed in last 18 months: {before:,} -> {len(filtered):,}")

    # ===========================================
    # FILTER 3: AUM >= $10M (very low bar, just filters out tiny shops)
    # ===========================================
    before = len(filtered)
    filtered['_aum'] = filtered['Total Gross Assets of Private Funds'].apply(parse_money)
    filtered = filtered[filtered['_aum'] >= 10_000_000]
    print(f"[Filter 3] AUM >= $10M: {before:,} -> {len(filtered):,}")

    # ===========================================
    # FILTER 4: US-based only
    # ===========================================
    before = len(filtered)
    filtered = filtered[filtered['Main Office Country'].astype(str).str.contains('United States', case=False, na=False)]
    print(f"[Filter 4] US-based: {before:,} -> {len(filtered):,}")

    print(f"\n{'='*60}")
    print(f"FINAL COUNT: {len(filtered):,} firms")
    print(f"{'='*60}")

    # ===========================================
    # BUILD OUTPUT
    # ===========================================
    output_rows = []
    for _, row in filtered.iterrows():
        # Get domain
        domain = clean_domain(row.get('Website Address', ''))
        if not domain:
            domain = derive_domain(str(row.get('Primary Business Name', '')))

        aum = row.get('_aum', 0)
        aum_label = f"${aum/1_000_000:,.0f}M" if aum >= 1_000_000 else f"${aum/1_000:,.0f}K"

        state = row.get('Main Office State', '')
        city = row.get('Main Office City', '')

        output_rows.append({
            'Full Name': '',
            'Company Name': row.get('Primary Business Name', ''),
            'Domain': domain,
            'Email': '',
            'Context': f"RIA with {aum_label} AUM based in {city}, {state}",
            'Signal': 'Active SEC-registered investment adviser',
            '_CRD': row.get('Organization CRD#', ''),
            '_State': state,
            '_City': city,
            '_AUM': aum,
            '_Phone': row.get('Main Office Telephone Number', ''),
        })

    output_df = pd.DataFrame(output_rows)

    # Sort by AUM descending
    output_df = output_df.sort_values('_AUM', ascending=False)

    output_df.to_csv(OUTPUT_FILE, index=False)
    print(f"\nSaved to: {OUTPUT_FILE}")

    # Stats
    print(f"\nBREAKDOWN BY STATE (Top 10):")
    state_counts = output_df['_State'].value_counts().head(10)
    for state, count in state_counts.items():
        print(f"  {state}: {count:,}")

    print(f"\nBREAKDOWN BY AUM:")
    print(f"  $1B+:   {len(output_df[output_df['_AUM'] >= 1_000_000_000]):,}")
    print(f"  $100M+: {len(output_df[output_df['_AUM'] >= 100_000_000]):,}")
    print(f"  $50M+:  {len(output_df[output_df['_AUM'] >= 50_000_000]):,}")
    print(f"  $10M+:  {len(output_df[output_df['_AUM'] >= 10_000_000]):,}")

    # Sample
    print(f"\nTOP 10 BY AUM:")
    for _, row in output_df.head(10).iterrows():
        print(f"  {row['Company Name'][:40]:40} | ${row['_AUM']/1_000_000:,.0f}M | {row['_State']}")

if __name__ == "__main__":
    main()
