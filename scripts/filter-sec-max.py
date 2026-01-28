"""
SEC RIA Filter — MAX VOLUME (All US ERAs)
"""

import pandas as pd
import re

INPUT_FILE = r"C:\Users\Smart Hp\Desktop\sec-data\IA_SEC_-_FIRM_ROSTER_FOIA_DOWNLOAD_-_34445670.CSV"
OUTPUT_FILE = r"C:\Users\Smart Hp\Desktop\rias_max_volume.csv"

def parse_money(val):
    if pd.isna(val):
        return 0
    val = str(val).replace(',', '').replace('$', '').strip()
    try:
        return float(val)
    except:
        return 0

def clean_domain(website):
    if pd.isna(website) or not website:
        return ''
    domain = str(website).lower()
    domain = domain.replace('https://', '').replace('http://', '').replace('www.', '')
    domain = domain.split('/')[0].split(';')[0].strip()
    if domain in ['twitter.com', 'linkedin.com', 'x.com', 'facebook.com']:
        return ''
    return domain

def derive_domain(company_name):
    name = str(company_name).lower()
    for suffix in [', llc', ', lp', ', l.p.', ' llc', ' lp', ' l.p.',
                   ' management', ' company', ' inc', ' corp', ', inc.', ', inc']:
        name = name.replace(suffix, '')
    name = re.sub(r'[^a-z0-9 ]', '', name).replace(' ', '')
    return f"{name}.com" if name else ''

def main():
    print("="*60)
    print("SEC RIA FILTER - MAX VOLUME")
    print("="*60)

    df = pd.read_csv(INPUT_FILE, low_memory=False, encoding='latin-1')
    print(f"Total: {len(df):,}")

    # Only filters: Active + US
    filtered = df[df['SEC Current Status'].astype(str).str.contains('Active', case=False, na=False)]
    filtered = filtered[filtered['Main Office Country'].astype(str).str.contains('United States', case=False, na=False)]
    print(f"Active US firms: {len(filtered):,}")

    # Parse AUM for sorting
    filtered = filtered.copy()
    filtered['_aum'] = filtered['Total Gross Assets of Private Funds'].apply(parse_money)

    # Build output
    output_rows = []
    for _, row in filtered.iterrows():
        domain = clean_domain(row.get('Website Address', ''))
        if not domain:
            domain = derive_domain(row.get('Primary Business Name', ''))

        aum = row.get('_aum', 0)
        state = row.get('Main Office State', '')
        city = row.get('Main Office City', '')

        output_rows.append({
            'Full Name': '',
            'Company Name': row.get('Primary Business Name', ''),
            'Domain': domain,
            'Email': '',
            'Context': f"SEC-registered investment adviser in {city}, {state}" if city else f"SEC-registered investment adviser in {state}",
            'Signal': 'Active ERA, filed with SEC',
            '_CRD': row.get('Organization CRD#', ''),
            '_State': state,
            '_City': city,
            '_AUM': aum,
            '_Phone': row.get('Main Office Telephone Number', ''),
        })

    output_df = pd.DataFrame(output_rows)
    output_df = output_df.sort_values('_AUM', ascending=False)
    output_df.to_csv(OUTPUT_FILE, index=False)

    print(f"\n{'='*60}")
    print(f"EXPORTED: {len(output_df):,} firms")
    print(f"{'='*60}")
    print(f"\nSaved to: {OUTPUT_FILE}")

    print(f"\nSTATE BREAKDOWN (Top 10):")
    for state, count in output_df['_State'].value_counts().head(10).items():
        print(f"  {state}: {count:,}")

if __name__ == "__main__":
    main()
