import requests
import json

BASE_URL = "http://211.166.6.109:9998/enroll/post/listVisitor"

def fetch_page(page):
    params = {"page": page, "limit": 100, "queryStr": ""}
    resp = requests.get(BASE_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()

all_records = []
for page in range(1, 53):
    result = fetch_page(page)
    if result.get("code") == 200:
        records = result["data"]["data"]
        all_records.extend(records)
        if page % 10 == 0 or page == 52:
            print(f"Page {page}: {len(all_records)} records so far")
    else:
        print(f"Page {page} error: {result.get('msg')}")

print(f"\nTotal: {len(all_records)} records")
if all_records:
    print(f"Keys: {list(all_records[0].keys())}")

# Search for batch keywords in ALL fields
keywords = ['一批', '二批', '一本', '二本', '批次']
found = []
for record in all_records:
    for key, val in record.items():
        if val and any(kw in str(val) for kw in keywords):
            found.append((record.get('postCode',''), record.get('post',''), key, val))

print(f'\nContains batch keywords: {len(found)} records')
for pc, pn, k, v in found[:30]:
    print(f'  {pc} | {pn} | {k}: {v}')

# Unique values in isDoubletop (院校及学科层次)
print('\n=== isDoubletop unique values ===')
levels = set()
for r in all_records:
    levels.add(str(r.get('isDoubletop', '')))
for v in sorted(levels):
    print(f'  "{v}"')

# Unique values in otherReq (其他要求)
print('\n=== otherReq unique values ===')
others = set()
for r in all_records:
    val = r.get('otherReq', '')
    if val:
        others.add(str(val))
for v in sorted(others):
    print(f'  "{v}"')

# Unique values in educationBackground (学历层次)
print('\n=== educationBackground unique values ===')
edu = set()
for r in all_records:
    edu.add(str(r.get('educationBackground', '')))
for v in sorted(edu):
    print(f'  "{v}"')
