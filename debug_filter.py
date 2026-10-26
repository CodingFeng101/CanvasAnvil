import requests
import time
import json

BASE_URL = "http://211.166.6.109:9998/enroll/post/listVisitor"
PAGE_SIZE = 100

def fetch_all():
    all_records = []
    for page in range(1, 53):
        params = {"page": page, "limit": PAGE_SIZE, "queryStr": ""}
        try:
            resp = requests.get(BASE_URL, params=params, timeout=30)
            data = resp.json()
            if data.get("code") == 200:
                records = data["data"]["data"]
                all_records.extend(records)
        except:
            pass
    return all_records

def main():
    print("爬取全部数据...")
    all_records = fetch_all()
    print(f"总计: {len(all_records)} 条\n")

    # Step 1: 性别 = 男(1) 或 不限(0)
    step1 = [r for r in all_records if str(r.get("isSex","")) in ("1","0")]
    print(f"Step1 性别(男/不限): {len(step1)} 条")

    # Step 2: 学历包含"本科"
    step2 = [r for r in step1 if "本科" in str(r.get("educationBackground",""))]
    print(f"Step2 含本科: {len(step2)} 条")

    # Step 3: 专业包含"计算机科学与技术"
    step3 = [r for r in step2 if "计算机科学与技术" in str(r.get("subject",""))]
    print(f"Step3 含计算机科学与技术: {len(step3)} 条")

    # Step 4: 院校层次分布
    dt_counts = {}
    for r in step3:
        dt = str(r.get("isDoubletop",""))
        dt_counts[dt] = dt_counts.get(dt, 0) + 1
    print(f"\nStep4 院校层次分布:")
    for k, v in sorted(dt_counts.items()):
        print(f"  isDoubletop={k}: {v} 条")

    # Step 5: 其他要求分布（在isDoubletop=0的岗位中）
    step5 = [r for r in step3 if str(r.get("isDoubletop","")) == "0"]
    sr_counts = {}
    for r in step5:
        sr = str(r.get("specialRequirement",""))
        sr_counts[sr] = sr_counts.get(sr, 0) + 1
    print(f"\nStep5 在isDoubletop=0中, specialRequirement分布:")
    for k, v in sorted(sr_counts.items()):
        print(f"  specialRequirement={k}: {v} 条")

    # Step 6: 最终结果 = isDoubletop=0 且 specialRequirement不是要求双一流的
    # 先看看specialRequirement各值对应网站上的什么文字
    # 我们已知: specialRequirement=1 对应 "应为双一流建设高校毕业生"
    # 但也可能有其他值对应其他要求
    # 让我把每个specialRequirement值的样本都打印出来
    
    print(f"\n=== isDoubletop=0的岗位中, 各specialRequirement值的样本 ===")
    sr_samples = {}
    for r in step5:
        sr = str(r.get("specialRequirement",""))
        if sr not in sr_samples:
            sr_samples[sr] = r
    
    for sr_val, r in sr_samples.items():
        print(f"\nspecialRequirement={sr_val}:")
        print(f"  岗位: {r.get('postCode')} - {r.get('needHandsUnit')} - {r.get('post')}")
        print(f"  专业: {r.get('subject')}")
        print(f"  isDoubletop={r.get('isDoubletop')}")
        print(f"  specialRequirement={r.get('specialRequirement')}")
        print(f"  otherReq={r.get('otherReq')}")

    # 现在检查: specialRequirement有多少种非空值
    # 如果1=双一流, 那其他值呢?
    print(f"\n=== 全部5194条中specialRequirement的所有值分布 ===")
    all_sr = {}
    for r in all_records:
        sr = str(r.get("specialRequirement",""))
        if sr not in all_sr:
            all_sr[sr] = {"count": 0, "sample": r}
        all_sr[sr]["count"] += 1
    for k, v in sorted(all_sr.items(), key=lambda x: -x[1]["count"]):
        r = v["sample"]
        print(f"  specialRequirement='{k}': {v['count']} 条 (样本: {r.get('postCode')} {r.get('needHandsUnit')} isDoubletop={r.get('isDoubletop')})")

    # 最终筛选: isDoubletop=0 且 specialRequirement 不是 "1"
    # 但等等, 也许有些岗位 isDoubletop=0 但 specialRequirement 是其他值也需要排除?
    # 让我只排除 specialRequirement="1" 的, 看看有多少
    final_no_sr1 = [r for r in step5 if str(r.get("specialRequirement","")) != "1"]
    print(f"\n最终(isDoubletop=0 且 specialReq!=1): {len(final_no_sr1)} 条")

    # 如果也排除所有非空非None的specialRequirement呢?
    final_strict = [r for r in step5 if str(r.get("specialRequirement","")) in ("", "None", "null", "0")]
    print(f"最终(isDoubletop=0 且 specialReq为空/0): {len(final_strict)} 条")

    # 让我也看看 isDoubletop=1 的岗位中, specialRequirement分布
    step5b = [r for r in step3 if str(r.get("isDoubletop","")) == "1"]
    sr_counts_b = {}
    for r in step5b:
        sr = str(r.get("specialRequirement",""))
        sr_counts_b[sr] = sr_counts_b.get(sr, 0) + 1
    print(f"\n在isDoubletop=1(双一流)中, specialRequirement分布:")
    for k, v in sorted(sr_counts_b.items()):
        print(f"  specialRequirement={k}: {v} 条")

    print("\nDone")

if __name__ == "__main__":
    main()
