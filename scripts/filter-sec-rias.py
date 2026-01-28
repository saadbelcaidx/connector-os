"""
SEC RIA Filter — Money-Now Criteria
Filters the SEC FOIA download for high-value targets

Run: python filter-sec-rias.py
"""

import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

# File paths
INPUT_FILE = r"C:\Users\Smart Hp\Desktop\sec-data\IA_SEC_-_FIRM_ROSTER_FOIA_DOWNLOAD_-_34445670.CSV"
OUTPUT_FILE = r"C:\Users\Smart Hp\Desktop\filtered_rias_demand.csv"

def parse_money(val):
    """Parse money strings like '81,309,442.00' to float"""
    if pd.isna(val):
        return 0
    val = str(val).replace(',', '').replace('$', '').strip()
    try:
        return float(val)
    except:
        return 0

def parse_date(val):
    """Parse date strings"""
    if pd.isna(val):
        return None
    try:
        return pd.to_datetime(val)
    except:
        return None

def main():
    print("="*60)
    print("SEC RIA FILTER — MONEY-NOW CRITERIA")
    print("="*60)

    # Load data
    print(f"\nLoading {INPUT_FILE}...")
    df = pd.read_csv(INPUT_FILE, low_memory=False, encoding='latin-1')
    print(f"Total records: {len(df):,}")

    # Show key columns
    print(f"\nKey columns found:")
    key_cols = [
        'Main Office State',
        'Primary Business Name',
        'Total Gross Assets of Private Funds',
        'Latest ADV Filing Date',
        'SEC Current Status',
        'Website Address',
        'Organization CRD#',
        '3A',  # Organization type
    ]
    for col in key_cols:
        if col in df.columns:
            print(f"  [OK] {col}")
        else:
            print(f"  [--] {col} NOT FOUND")

    filtered = df.copy()

    # ===========================================
    # FILTER 1: State = NY
    # ===========================================
    before = len(filtered)
    filtered = filtered[filtered['Main Office State'].astype(str).str.upper() == 'NY']
    print(f"\n[Filter 1] State = NY: {before:,} -> {len(filtered):,}")

    # ===========================================
    # FILTER 2: AUM >= $300M (using Total Gross Assets of Private Funds)
    # ===========================================
    if 'Total Gross Assets of Private Funds' in filtered.columns:
        before = len(filtered)
        filtered['_aum'] = filtered['Total Gross Assets of Private Funds'].apply(parse_money)
        filtered = filtered[filtered['_aum'] >= 300_000_000]
        print(f"[Filter 2] AUM >= $300M: {before:,} -> {len(filtered):,}")
    else:
        print("[Filter 2] AUM column not found - SKIPPED")

    # ===========================================
    # FILTER 3: Active status (filed within 12 months)
    # ===========================================
    if 'Latest ADV Filing Date' in filtered.columns:
        before = len(filtered)
        cutoff = datetime.now() - timedelta(days=365)
        filtered['_last_filed'] = filtered['Latest ADV Filing Date'].apply(parse_date)
        filtered = filtered[filtered['_last_filed'].notna()]
        filtered = filtered[filtered['_last_filed'] >= cutoff]
        print(f"[Filter 3] Filed in last 12 months: {before:,} -> {len(filtered):,}")

    # ===========================================
    # FILTER 4: Active SEC status
    # ===========================================
    if 'SEC Current Status' in filtered.columns:
        before = len(filtered)
        filtered = filtered[filtered['SEC Current Status'].astype(str).str.contains('Active', case=False, na=False)]
        print(f"[Filter 4] SEC Status = Active: {before:,} -> {len(filtered):,}")

    print(f"\n{'='*60}")
    print(f"FINAL COUNT: {len(filtered):,} firms")
    print(f"{'='*60}")

    # ===========================================
    # BUILD OUTPUT CSV FOR CONNECTOR OS
    # ===========================================
    output_rows = []
    for _, row in filtered.iterrows():
        # Extract domain from website
        website = str(row.get('Website Address', ''))
        domain = ''
        if website and website != 'nan':
            domain = website.lower()
            domain = domain.replace('https://', '').replace('http://', '').replace('www.', '')
            domain = domain.split('/')[0]

        aum_millions = row.get('_aum', 0) / 1_000_000

        output_rows.append({
            'Full Name': '',  # Need to enrich
            'Company Name': row.get('Primary Business Name', ''),
            'Domain': domain,
            'Email': '',  # Need to enrich
            'Context': f"NY-based RIA with ${aum_millions:,.0f}M in assets under management",
            'Signal': f"Active SEC filing, established firm, $300M+ AUM",
            # Extra reference fields
            '_CRD': row.get('Organization CRD#', ''),
            '_City': row.get('Main Office City', ''),
            '_Website': website,
            '_AUM': row.get('_aum', 0),
            '_Phone': row.get('Main Office Telephone Number', ''),
            '_Org_Type': row.get('3A', ''),
        })

    output_df = pd.DataFrame(output_rows)
    output_df.to_csv(OUTPUT_FILE, index=False)
    print(f"\nSaved to: {OUTPUT_FILE}")

    # Show sample
    print("\n" + "="*60)
    print("SAMPLE OUTPUT (Top 10 by AUM):")
    print("="*60)
    output_df_sorted = output_df.sort_values('_AUM', ascending=False)
    for i, row in output_df_sorted.head(10).iterrows():
        print(f"\n{row['Company Name']}")
        print(f"  AUM: ${row['_AUM']/1_000_000:,.0f}M")
        print(f"  Domain: {row['Domain']}")
        print(f"  CRD: {row['_CRD']}")

    return output_df

if __name__ == "__main__":
    main()
