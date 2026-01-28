"""
Filter RIAs for Succession Signals
Target: Firms most likely to sell/merge

SUCCESSION SIGNALS:
- Individual/sole ownership (no partners to complicate)
- 15+ years old (mature, founder aging)
- $50M+ AUM (worth selling)
- Recent filing activity (still engaged, not abandoned)
"""

import pandas as pd
from datetime import datetime, timedelta
import re

INPUT_FILE = r"C:\Users\Smart Hp\Desktop\sec-data\IA_SEC_-_FIRM_ROSTER_FOIA_DOWNLOAD_-_34445670.CSV"
OUTPUT_FILE = r"C:\Users\Smart Hp\Desktop\rias_succession_signals.csv"

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

def calculate_succession_score(row):
    """
    Score 0-100 based on succession likelihood signals
    """
    score = 0
    reasons = []

    # 1. Ownership structure (individual = higher likelihood)
    org_type = str(row.get('3A', '')).lower()
    if 'individual' in org_type or 'sole' in org_type:
        score += 30
        reasons.append("Individual ownership")
    elif 'partnership' in org_type:
        score += 15
        reasons.append("Partnership structure")
    elif 'corporation' in org_type or 'llc' in org_type:
        score += 10
        reasons.append("Corporate structure")

    # 2. Firm age (15+ years = mature, succession thinking)
    formation_date = row.get('_formation_date')
    if formation_date:
        years_old = (datetime.now() - formation_date).days / 365
        if years_old >= 20:
            score += 25
            reasons.append(f"Mature firm ({int(years_old)} years)")
        elif years_old >= 15:
            score += 20
            reasons.append(f"Established firm ({int(years_old)} years)")
        elif years_old >= 10:
            score += 10
            reasons.append(f"Mid-stage firm ({int(years_old)} years)")

    # 3. AUM size (sweet spot: $50M-$500M most likely to sell)
    aum = row.get('_aum', 0)
    if 50_000_000 <= aum <= 500_000_000:
        score += 25
        reasons.append(f"Sweet spot AUM (${aum/1_000_000:.0f}M)")
    elif aum > 500_000_000:
        score += 15
        reasons.append(f"Large AUM (${aum/1_000_000:.0f}M)")
    elif aum >= 20_000_000:
        score += 10
        reasons.append(f"Viable AUM (${aum/1_000_000:.0f}M)")

    # 4. Recent activity (filed recently = engaged, not abandoned)
    last_filed = row.get('_last_filed')
    if last_filed:
        months_since = (datetime.now() - last_filed).days / 30
        if months_since <= 6:
            score += 20
            reasons.append("Recently active (filed <6mo)")
        elif months_since <= 12:
            score += 15
            reasons.append("Active (filed <12mo)")

    return score, "; ".join(reasons)

def main():
    print("="*60)
    print("RIA SUCCESSION SIGNAL FILTER")
    print("="*60)

    df = pd.read_csv(INPUT_FILE, low_memory=False, encoding='latin-1')
    print(f"Total records: {len(df):,}")

    # Base filters: Active + US
    filtered = df[df['SEC Current Status'].astype(str).str.contains('Active', case=False, na=False)]
    filtered = filtered[filtered['Main Office Country'].astype(str).str.contains('United States', case=False, na=False)]
    print(f"Active US firms: {len(filtered):,}")

    # Parse dates and AUM
    filtered = filtered.copy()
    filtered['_aum'] = filtered['Total Gross Assets of Private Funds'].apply(parse_money)
    filtered['_last_filed'] = filtered['Latest ADV Filing Date'].apply(parse_date)

    # Parse formation date (column 1O might have this, or check other columns)
    # Looking for date fields - '1O' is usually organization date
    if '1O' in filtered.columns:
        filtered['_formation_date'] = filtered['1O'].apply(parse_date)
    else:
        filtered['_formation_date'] = None

    # Calculate succession scores
    print("\nCalculating succession scores...")
    scores = []
    for idx, row in filtered.iterrows():
        score, reasons = calculate_succession_score(row)
        scores.append({'score': score, 'reasons': reasons})

    filtered['_succession_score'] = [s['score'] for s in scores]
    filtered['_succession_reasons'] = [s['reasons'] for s in scores]

    # Filter to high-signal firms (score >= 40)
    high_signal = filtered[filtered['_succession_score'] >= 40].copy()
    print(f"High succession signal (score >= 40): {len(high_signal):,}")

    # Sort by score
    high_signal = high_signal.sort_values('_succession_score', ascending=False)

    # Build output
    output_rows = []
    for _, row in high_signal.iterrows():
        domain = clean_domain(row.get('Website Address', ''))
        if not domain:
            domain = derive_domain(row.get('Primary Business Name', ''))

        aum = row.get('_aum', 0)
        state = row.get('Main Office State', '')
        city = row.get('Main Office City', '')
        score = row.get('_succession_score', 0)
        reasons = row.get('_succession_reasons', '')

        output_rows.append({
            'Full Name': '',
            'Company Name': row.get('Primary Business Name', ''),
            'Domain': domain,
            'Email': '',
            'Context': f"RIA in {city}, {state} with ${aum/1_000_000:,.0f}M AUM",
            'Signal': f"Succession score {score}: {reasons}",
            '_Score': score,
            '_CRD': row.get('Organization CRD#', ''),
            '_State': state,
            '_AUM': aum,
            '_OrgType': row.get('3A', ''),
        })

    output_df = pd.DataFrame(output_rows)
    output_df.to_csv(OUTPUT_FILE, index=False)

    print(f"\n{'='*60}")
    print(f"EXPORTED: {len(output_df):,} high-signal firms")
    print(f"{'='*60}")
    print(f"\nSaved to: {OUTPUT_FILE}")

    # Score distribution
    print(f"\nSCORE DISTRIBUTION:")
    print(f"  90+: {len(output_df[output_df['_Score'] >= 90]):,}")
    print(f"  70-89: {len(output_df[(output_df['_Score'] >= 70) & (output_df['_Score'] < 90)]):,}")
    print(f"  50-69: {len(output_df[(output_df['_Score'] >= 50) & (output_df['_Score'] < 70)]):,}")
    print(f"  40-49: {len(output_df[(output_df['_Score'] >= 40) & (output_df['_Score'] < 50)]):,}")

    # Top 10
    print(f"\nTOP 10 SUCCESSION SIGNALS:")
    for _, row in output_df.head(10).iterrows():
        print(f"  [{row['_Score']}] {row['Company Name'][:40]:40} | ${row['_AUM']/1_000_000:,.0f}M")
        print(f"        {row['Signal'][:70]}")

if __name__ == "__main__":
    main()
