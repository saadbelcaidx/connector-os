"""
Clean SEC RIA data and enrich with Anymail Finder
"""

import pandas as pd
import requests
import time
import re

# Config
INPUT_FILE = r"C:\Users\Smart Hp\Desktop\filtered_rias_demand.csv"
OUTPUT_FILE = r"C:\Users\Smart Hp\Desktop\rias_enriched.csv"
ANYMAIL_API_KEY = "TDbuXZQoFBsmWpJUCeXqMqb9"

# Bad domains to replace
BAD_DOMAINS = ['twitter.com', 'linkedin.com', 'x.com', 'facebook.com']

def derive_domain_from_name(company_name):
    """
    Try to derive domain from company name
    'Lux Capital Management, LLC' -> 'luxcapital.com'
    """
    # Remove common suffixes
    name = company_name.lower()
    for suffix in [', llc', ', lp', ', l.p.', ' llc', ' lp', ' l.p.',
                   ' management', ' ventures', ' partners', ' capital',
                   ' advisors', ' advisory', ' fund', ' funds', ' inc',
                   ' corp', ' company', ', inc.', ', inc']:
        name = name.replace(suffix, '')

    # Remove special chars, keep only alphanumeric
    name = re.sub(r'[^a-z0-9]', '', name)

    if name:
        return f"{name}.com"
    return None

def find_email_anymail(domain, first_name="", last_name=""):
    """
    Use Anymail Finder to find email
    """
    if not domain or domain in BAD_DOMAINS:
        return None

    try:
        # Anymail Finder API endpoint
        url = "https://api.anymailfinder.com/v5.0/search/person.json"

        params = {
            "domain": domain,
            "first_name": first_name or "contact",
            "last_name": last_name or "",
        }

        headers = {
            "Authorization": f"Bearer {ANYMAIL_API_KEY}",
            "Content-Type": "application/json"
        }

        response = requests.post(url, json=params, headers=headers, timeout=30)

        if response.status_code == 200:
            data = response.json()
            return data.get('email')
        else:
            return None

    except Exception as e:
        print(f"  Error: {e}")
        return None

def find_generic_email(domain):
    """
    Try to find a generic contact email for the domain
    """
    if not domain or domain in BAD_DOMAINS:
        return None

    try:
        # Try Anymail's domain search
        url = "https://api.anymailfinder.com/v5.0/search/company.json"

        headers = {
            "Authorization": f"Bearer {ANYMAIL_API_KEY}",
            "Content-Type": "application/json"
        }

        response = requests.post(url, json={"domain": domain}, headers=headers, timeout=30)

        if response.status_code == 200:
            data = response.json()
            emails = data.get('emails', [])
            if emails:
                return emails[0].get('email')
        return None

    except Exception as e:
        return None

def main():
    print("="*60)
    print("CLEAN & ENRICH RIA DATA")
    print("="*60)

    # Load data
    df = pd.read_csv(INPUT_FILE)
    print(f"Loaded {len(df)} firms")

    # Count bad domains
    bad_count = df['Domain'].apply(lambda x: x in BAD_DOMAINS if pd.notna(x) else True).sum()
    print(f"Bad domains (social media): {bad_count}")

    # Clean domains
    print("\n[Step 1] Cleaning domains...")
    for idx, row in df.iterrows():
        domain = row['Domain']
        if pd.isna(domain) or domain in BAD_DOMAINS:
            # Try to derive from company name
            derived = derive_domain_from_name(row['Company Name'])
            if derived:
                df.at[idx, 'Domain'] = derived
                print(f"  {row['Company Name'][:40]:40} -> {derived}")

    # Show sample of cleaned data
    print(f"\n[Step 2] Finding emails with Anymail Finder...")
    print("  (This may take a few minutes...)\n")

    emails_found = 0
    for idx, row in df.iterrows():
        domain = row['Domain']
        company = row['Company Name']

        if pd.isna(domain) or not domain:
            continue

        print(f"  [{idx+1}/{len(df)}] {company[:35]:35} ({domain[:25]:25})", end=" ")

        # Try to find email
        email = find_generic_email(domain)

        if email:
            df.at[idx, 'Email'] = email
            emails_found += 1
            print(f"-> {email}")
        else:
            print("-> (no email found)")

        # Rate limit
        time.sleep(0.5)

    print(f"\n{'='*60}")
    print(f"RESULTS: Found {emails_found} emails out of {len(df)} firms")
    print(f"{'='*60}")

    # Save
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"\nSaved to: {OUTPUT_FILE}")

    # Show sample with emails
    print("\nFirms with emails found:")
    has_email = df[df['Email'].notna() & (df['Email'] != '')]
    for _, row in has_email.head(15).iterrows():
        print(f"  {row['Company Name'][:40]:40} | {row['Email']}")

if __name__ == "__main__":
    main()
