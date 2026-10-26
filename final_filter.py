import requests
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
import time

BASE_URL = "http://211.166.6.109:9998/enroll/post/listVisitor"
PAGE_SIZE = 100

def fetch_page(page):
    params = {"page": page, "limit": PAGE_SIZE, "queryStr": ""}
    resp = requests.get(BASE_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()

def main():
    all_records = []
    total_pages = 53

    print("开始爬取全部数据...")
    for page in range(1, total_pages + 1):
        try:
            result = fetch_page(page)
            if result.get("code") == 200:
                records = result["data"]["data"]
                all_records.extend(records)
                if page % 10 == 0:
                    print(f"  第 {page}/{total_pages} 页, 累计 {len(all_records)} 条")
        except Exception as e:
            print(f"  第 {page} 页出错: {e}")
            time.sleep(2)
            try:
                result = fetch_page(page)
                if result.get("code") == 200:
                    records = result["data"]["data"]
                    all_records.extend(records)
                    print(f"  第 {page} 页重试成功")
            except Exception as e2:
                print(f"  第 {page} 页重试失败: {e2}")
        if page < total_pages:
            time.sleep(0.2)

    print(f"\n爬取完成，共 {len(all_records)} 条")

    # 筛选条件：
    # 1. 性别: isSex=1 (男) 或 isSex=0 (不限)
    # 2. 学历层次: educationBackground 包含 "本科"
    # 3. 学科专业: subject 包含 "计算机科学与技术"
    # 4. 院校及学科层次: isDoubletop=0 (一本以上，非双一流)
    # 5. 其他要求: specialRequirement 不能是要求双一流的
    #    从分析得知: specialRequirement=1 可能是"应为双一流毕业生"
    #    需要排除 specialRequirement 中要求双一流的岗位

    filtered = []
    for r in all_records:
        sex = str(r.get("isSex", ""))
        edu = str(r.get("educationBackground", ""))
        subject = str(r.get("subject", ""))
        dt = str(r.get("isDoubletop", ""))
        sr = str(r.get("specialRequirement", ""))

        # 性别: 男(1) 或 不限(0)
        if sex not in ("1", "0"):
            continue

        # 学历包含本科
        if "本科" not in edu:
            continue

        # 专业包含计算机科学与技术
        if "计算机科学与技术" not in subject:
            continue

        # 院校层次: 只要一本以上(isDoubletop=0)
        if dt != "0":
            continue

        # 排除其他要求中有双一流限制的
        # sr=1 对应 "应为双一流建设高校毕业生"
        if sr == "1":
            continue

        filtered.append(r)

    print(f"\n筛选条件: 男/不限 + 本科 + 计算机科学与技术 + 一本以上 + 无双一流其他要求")
    print(f"筛选结果: {len(filtered)} 条")

    # 打印所有筛选结果
    for i, r in enumerate(filtered, 1):
        print(f"\n--- 第 {i} 条 ---")
        print(f"  岗位编号: {r.get('postCode')}")
        print(f"  单位: {r.get('unit')} - {r.get('needHandsUnit')}")
        print(f"  岗位类别: {r.get('jobProperties')}")
        print(f"  岗位名称: {r.get('post')}")
        print(f"  从事工作: {r.get('doJob')}")
        print(f"  性别: {r.get('isSex')}")
        print(f"  学历: {r.get('educationBackground')}")
        print(f"  专业: {r.get('subject')}")
        print(f"  院校层次(isDoubletop): {r.get('isDoubletop')}")
        print(f"  其他要求(specialReq): {r.get('specialRequirement')}")
        print(f"  招录数量: {r.get('quantity')}")
        print(f"  已报名: {r.get('postNum')}")
        print(f"  工作地点: {r.get('forceStation')}")
        print(f"  咨询电话: {r.get('telPhone')}")

    # 保存到Excel
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "筛选结果"

    headers = ["序号", "大单位", "用人单位", "岗位类别", "岗位编号", "岗位名称",
               "从事工作", "性别", "学历层次", "学科专业", "院校及学科层次",
               "其他要求", "招录数量", "已报名人数", "工作地点", "咨询电话"]

    header_font = Font(bold=True, size=11, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell_align = Alignment(vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )

    for col_idx, name in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=name)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align
        cell.border = thin_border

    gender_map = {"1": "男", "2": "女", "0": "不限"}
    dt_map = {"0": "一本以上", "1": "双一流"}
    sr_map = {"": "—", "0": "—", "1": "应为双一流建设高校毕业生", "2": "前置学历均应为双一流建设高校毕业生", "3": "其他要求"}

    for row_idx, r in enumerate(filtered, 2):
        values = [
            row_idx - 1,
            r.get("unit", ""),
            r.get("needHandsUnit", ""),
            r.get("jobProperties", ""),
            r.get("postCode", ""),
            r.get("post", ""),
            r.get("doJob", ""),
            gender_map.get(str(r.get("isSex", "")), str(r.get("isSex", ""))),
            r.get("educationBackground", ""),
            r.get("subject", ""),
            dt_map.get(str(r.get("isDoubletop", "")), str(r.get("isDoubletop", ""))),
            sr_map.get(str(r.get("specialRequirement", "")), str(r.get("specialRequirement", ""))),
            r.get("quantity", 0),
            r.get("postNum", 0),
            r.get("forceStation", ""),
            r.get("telPhone", ""),
        ]
        for col_idx, v in enumerate(values, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=v)
            cell.alignment = cell_align
            cell.border = thin_border

    col_widths = [6, 14, 22, 14, 14, 18, 14, 8, 16, 40, 14, 28, 10, 10, 14, 22]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    output = "d:\\PycharmProjects\\CanvasAnvil\\最终筛选_一本_男_计算机科学与技术.xlsx"
    wb.save(output)
    print(f"\nExcel已保存: {output}")

if __name__ == "__main__":
    main()
