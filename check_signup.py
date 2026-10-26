import requests
import time

BASE_URL = "http://211.166.6.109:9998/enroll/post/listVisitor"
PAGE_SIZE = 100

# The 27 post codes
post_codes = [
    "QDA20260447", "QDA20260397", "QDA20260391", "QDA20260371", "QDA20260389",
    "QDA20260372", "QDA20260396", "QDA20260711", "QDA20260702", "QDA20260709",
    "QDA20260780", "QDC20260497", "QDC20260505", "QDM20260629", "QDM20260491",
    "QDM20260496", "QDM20260561", "QDM20260609", "QDM20260651", "QDM20260716",
    "QDM20260826", "QDM20260741", "QDM20260755", "QDM20260749", "QDM20260710",
    "QDM20260735", "QDM20260922"
]

post_code_set = set(post_codes)

all_records = []
for page in range(1, 53):
    params = {"page": page, "limit": PAGE_SIZE, "queryStr": ""}
    try:
        resp = requests.get(BASE_URL, params=params, timeout=30)
        data = resp.json()
        if data.get("code") == 200:
            records = data["data"]["data"]
            for r in records:
                if r.get("postCode") in post_code_set:
                    all_records.append(r)
    except:
        pass

print(f"找到 {len(all_records)}/27 条\n")
print(f"{'序号':<4} {'岗位编号':<14} {'单位':<16} {'岗位名称':<10} {'从事工作':<10} {'地点':<12} {'招录':>4} {'已报名':>6}")
print("-" * 90)

for i, r in enumerate(all_records, 1):
    print(f"{i:<4} {r.get('postCode',''):<14} {r.get('needHandsUnit',''):<16} {r.get('post',''):<10} {r.get('doJob',''):<10} {r.get('forceStation',''):<12} {r.get('quantity',0):>4} {r.get('postNum',0):>6}")

print(f"\n总招录: {sum(r.get('quantity',0) for r in all_records)}")
print(f"总已报名: {sum(r.get('postNum',0) for r in all_records)}")
