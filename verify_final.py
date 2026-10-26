import requests
import time

BASE_URL = "http://211.166.6.109:9998/enroll/post/listVisitor"
PAGE_SIZE = 100

# The 27 post codes from our filtered results
post_codes = [
    "QDA20260447", "QDA20260397", "QDA20260391", "QDA20260371", "QDA20260389",
    "QDA20260372", "QDA20260396", "QDA20260711", "QDA20260702", "QDA20260709",
    "QDA20260780", "QDC20260497", "QDC20260505", "QDM20260629", "QDM20260491",
    "QDM20260496", "QDM20260561", "QDM20260609", "QDM20260651", "QDM20260716",
    "QDM20260826", "QDM20260741", "QDM20260755", "QDM20260749", "QDM20260710",
    "QDM20260735", "QDM20260922"
]

# Fetch all 5194 records and find these 27
found = {}
for page in range(1, 53):
    params = {"page": page, "limit": PAGE_SIZE, "queryStr": ""}
    try:
        resp = requests.get(BASE_URL, params=params, timeout=30)
        data = resp.json()
        if data.get("code") == 200:
            records = data["data"]["data"]
            for r in records:
                pc = r.get("postCode", "")
                if pc in post_codes:
                    found[pc] = r
    except:
        continue

print(f"Found {len(found)}/{len(post_codes)} posts\n")

# Print full details for each
for i, pc in enumerate(post_codes, 1):
    r = found.get(pc)
    if r:
        print(f"=== {i}. {pc} ===")
        print(f"  单位: {r.get('unit')} - {r.get('needHandsUnit')}")
        print(f"  岗位: {r.get('jobProperties')} - {r.get('post')} ({r.get('doJob')})")
        print(f"  性别: {r.get('isSex')}")
        print(f"  学历: {r.get('educationBackground')}")
        print(f"  专业: {r.get('subject')}")
        print(f"  isDoubletop: [{r.get('isDoubletop')}]")
        print(f"  specialRequirement: [{r.get('specialRequirement')}]")
        print(f"  otherReq: [{r.get('otherReq')}]")
        print(f"  工作地点: {r.get('forceStation')}")
        # Print ALL fields to make sure we don't miss anything
        for k, v in r.items():
            if k not in ('unit','needHandsUnit','jobProperties','post','doJob','isSex',
                        'educationBackground','subject','isDoubletop','specialRequirement',
                        'forceStation','postCode'):
                if v and str(v).strip() not in ('', '0', 'None', 'null'):
                    pass  # only print non-empty unusual fields below
        print()
    else:
        print(f"=== {i}. {pc} === NOT FOUND\n")
