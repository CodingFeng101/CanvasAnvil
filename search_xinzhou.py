import requests

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
    if page % 10 == 0:
        print(f"Page {page}: {len(all_records)} records")

print(f"\nTotal: {len(all_records)} records")

# Search for 忻州 in all fields
found_xinzhou = []
for r in all_records:
    for key, val in r.items():
        if val and '忻州' in str(val):
            found_xinzhou.append(r)
            break

print(f"\n包含'忻州'的记录: {len(found_xinzhou)} 条")
for r in found_xinzhou:
    print(f"  单位:{r.get('unit','')} | 用人单位:{r.get('needHandsUnit','')} | "
          f"岗位编号:{r.get('postCode','')} | 岗位名称:{r.get('post','')} | "
          f"从事工作:{r.get('doJob','')} | 性别:{r.get('isSex','')} | "
          f"学历:{r.get('educationBackground','')} | 专业:{r.get('subject','')} | "
          f"双一流:{r.get('isDoubletop','')} | 地点:{r.get('forceStation','')}")

# Also check 山西 in general
print("\n=== 山西所有岗位 ===")
found_shanxi = []
for r in all_records:
    for key, val in r.items():
        if val and '山西' in str(val):
            found_shanxi.append(r)
            break

print(f"包含'山西'的记录: {len(found_shanxi)} 条")
for r in found_shanxi:
    print(f"  地点:{r.get('forceStation','')} | 岗位编号:{r.get('postCode','')} | "
          f"岗位名称:{r.get('post','')} | 从事工作:{r.get('doJob','')} | "
          f"性别:{r.get('isSex','')} | 学历:{r.get('educationBackground','')} | "
          f"专业:{r.get('subject','')} | 双一流:{r.get('isDoubletop','')}")
