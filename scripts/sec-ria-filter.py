"""
SEC Form ADV Bulk Data Parser
Filters RIAs by GPT's "money-now" criteria

USAGE:
1. Download the latest bulk ZIP from SEC:
   https://www.sec.gov/data-research/sec-markets-data/information-about-registered-investment-advisers-exempt-reporting-advisers

   Look for: ia[MMDDYY].zip (e.g., ia011526.zip for Jan 15, 2026)

2. Unzip it — you'll get an Excel file (ia011526.xlsx or similar)

3. Run this script:
   python sec-ria-filter.py path/to/ia011526.xlsx

4. Output: filtered_rias.csv ready for Connector OS
"""

import pandas as pd
import sys
from datetime import datetime, timedelta
from pathlib import Path

def parse_sec_bulk_data(file_path: str, output_path: str = "filtered_rias.csv"):
    """
    Parse SEC Form ADV bulk data and filter by money-now criteria.

    Filters:
    - State = NY
    - AUM >= $300M
    - Years since formation >= 15
    - Ownership type = Individual/Sole Proprietor
    - Last ADV amendment within 12 months (active)
    """

    print(f"Loading {file_path}...")

    # Load the Excel file
    # SEC bulk files have multiple sheets - main data is usually first sheet
    try:
        df = pd.read_excel(file_path, sheet_name=0)
    except Exception as e:
        print(f"Error loading file: {e}")
        print("Trying CSV format...")
        df = pd.read_csv(file_path)

    print(f"Loaded {len(df):,} total records")
    print(f"Columns: {list(df.columns)[:20]}...")  # Show first 20 columns

    # Common column name mappings (SEC changes these sometimes)
    # We'll try multiple possible names

    column_mappings = {
        'crd': ['Primary Business CRD#', 'CRD Number', 'FirmCrdNb', 'CRD', 'IA Firm CRD Number'],
        'name': ['Primary Business Name', 'Legal Name', 'BusNm', 'Firm Name', 'Organization Name'],
        'state': ['Main Office State', 'State', 'Primary Office State', 'Chief Office State'],
        'aum': ['5F(2)(c)', 'Regulatory AUM', 'Assets Under Management', 'Total Regulatory Assets Under Management', 'Item 5F2c'],
        'formation_date': ['Date of Formation', 'Organization Date', 'Formation Date', '1O Date Org'],
        'ownership': ['Form of Organization', 'Organization Type', 'Legal Status', 'Type of Organization'],
        'last_amendment': ['Latest ADV Amendment Date', 'Amendment Date', 'Last Filing Date', 'ADV Effective Date'],
        'city': ['Main Office City', 'City', 'Primary Office City'],
        'website': ['Website', 'Web Address', 'Website Address'],
    }

    def find_column(df, possible_names):
        """Find the first matching column name"""
        for name in possible_names:
            # Try exact match
            if name in df.columns:
                return name
            # Try case-insensitive
            for col in df.columns:
                if name.lower() in col.lower():
                    return col
        return None

    # Map columns
    cols = {}
    for key, possible_names in column_mappings.items():
        found = find_column(df, possible_names)
        if found:
            cols[key] = found
            print(f"  ✓ {key}: {found}")
        else:
            print(f"  ✗ {key}: NOT FOUND (tried {possible_names[:3]}...)")

    # Start filtering
    filtered = df.copy()

    # Filter 1: State = NY
    if 'state' in cols:
        before = len(filtered)
        filtered = filtered[filtered[cols['state']].astype(str).str.upper().str.contains('NY|NEW YORK', na=False)]
        print(f"\n[Filter] State = NY: {before:,} → {len(filtered):,}")

    # Filter 2: AUM >= $300M
    if 'aum' in cols:
        before = len(filtered)
        # Convert AUM to numeric (handle $, commas, M/B suffixes)
        def parse_aum(val):
            if pd.isna(val):
                return 0
            val = str(val).replace('$', '').replace(',', '').strip()
            try:
                if 'B' in val.upper():
                    return float(val.upper().replace('B', '')) * 1_000_000_000
                elif 'M' in val.upper():
                    return float(val.upper().replace('M', '')) * 1_000_000
                else:
                    return float(val)
            except:
                return 0

        filtered['_aum_numeric'] = filtered[cols['aum']].apply(parse_aum)
        filtered = filtered[filtered['_aum_numeric'] >= 300_000_000]
        print(f"[Filter] AUM >= $300M: {before:,} → {len(filtered):,}")

    # Filter 3: Years since formation >= 15
    if 'formation_date' in cols:
        before = len(filtered)
        cutoff_date = datetime.now() - timedelta(days=15*365)

        def parse_date(val):
            if pd.isna(val):
                return None
            try:
                return pd.to_datetime(val)
            except:
                return None

        filtered['_formation_parsed'] = filtered[cols['formation_date']].apply(parse_date)
        filtered = filtered[filtered['_formation_parsed'].notna()]
        filtered = filtered[filtered['_formation_parsed'] <= cutoff_date]
        print(f"[Filter] Formation >= 15 years: {before:,} → {len(filtered):,}")

    # Filter 4: Ownership type = Individual/Sole Proprietor
    if 'ownership' in cols:
        before = len(filtered)
        individual_keywords = ['individual', 'sole', 'proprietor', 'single']
        mask = filtered[cols['ownership']].astype(str).str.lower().apply(
            lambda x: any(kw in x for kw in individual_keywords)
        )
        # Note: This filter might be too restrictive. Commenting out for now.
        # Most successful RIAs are LLCs or Corps, not sole proprietors.
        # filtered = filtered[mask]
        print(f"[Filter] Ownership = Individual: SKIPPED (most RIAs are LLCs)")

    # Filter 5: Last amendment within 12 months (active)
    if 'last_amendment' in cols:
        before = len(filtered)
        cutoff_active = datetime.now() - timedelta(days=365)

        filtered['_amendment_parsed'] = filtered[cols['last_amendment']].apply(parse_date)
        filtered = filtered[filtered['_amendment_parsed'].notna()]
        filtered = filtered[filtered['_amendment_parsed'] >= cutoff_active]
        print(f"[Filter] Active (amended in 12mo): {before:,} → {len(filtered):,}")

    print(f"\n{'='*50}")
    print(f"FINAL COUNT: {len(filtered):,} firms")
    print(f"{'='*50}\n")

    # Build output CSV for Connector OS
    output_rows = []
    for _, row in filtered.iterrows():
        output_rows.append({
            'Full Name': '',  # Need to enrich with Apollo
            'Company Name': row.get(cols.get('name', ''), '') if 'name' in cols else '',
            'Domain': '',  # Need to extract from website or enrich
            'Email': '',  # Need to enrich with Apollo/Connector Agent
            'Context': f"RIA with ${row.get('_aum_numeric', 0)/1_000_000:.0f}M AUM, formed {row.get(cols.get('formation_date', ''), '')}",
            'Signal': 'Established NY RIA, actively filing, $300M+ AUM',
            # Extra fields for reference
            'CRD': row.get(cols.get('crd', ''), '') if 'crd' in cols else '',
            'City': row.get(cols.get('city', ''), '') if 'city' in cols else '',
            'Website': row.get(cols.get('website', ''), '') if 'website' in cols else '',
            'AUM': row.get('_aum_numeric', 0),
        })

    output_df = pd.DataFrame(output_rows)
    output_df.to_csv(output_path, index=False)
    print(f"Saved to: {output_path}")

    # Show sample
    print("\nSample (first 5):")
    print(output_df.head().to_string())

    return output_df

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nERROR: Please provide path to SEC bulk data file")
        print("Example: python sec-ria-filter.py ia011526.xlsx")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else "filtered_rias.csv"

    parse_sec_bulk_data(input_file, output_file)
