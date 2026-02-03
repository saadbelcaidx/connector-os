import csv

with open('nih_biotech_signals.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)[:10]

print("TOP 10 GRANTS BY AMOUNT")
print("="*90)
for row in rows:
    org = row['org_name'][:35]
    pi = row['pi_name'][:20] if row['pi_name'] else 'N/A'
    amt = int(row['grant_amount'])
    score = row['signal_score']
    signal = row['signal_type'][:30]
    print(f"{org:<37} {pi:<22} ${amt:>10,}  {score}  {signal}")
