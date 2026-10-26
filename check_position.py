import requests
import json

BASE_URL = "http://211.166.6.109:9998/enroll/post/listVisitor"
PAGE_SIZE = 100

# Get the specific position detail
# Try to access detail API
post_id = "1aa50fd79e9be2cb564d7da4bdc4ddc2"

# Try different detail endpoints
detail_urls = [
    f"http://211.166.6.109:9998/enroll/post/detail?id={post_id}",
    f"http://211.166.6.109:9998/enroll/post/detail?postId={post_id}",
    f"http://211.166.6.109:9998/enroll/post/getPost?id={post_id}",
    f"http://211.166.6.109:9998/enroll/post/info?id={post_id}",
    f"http://211.166.6.109:9998/enroll/post/view?id={post_id}",
]

for url in detail_urls:
    try:
        resp = requests.get(url, timeout=10)
        print(f"GET {url}")
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            try:
                data = resp.json()
                print(f"  Response: {json.dumps(data, ensure_ascii=False, indent=2)[:1000]}")
            except:
                print(f"  Response (text): {resp.text[:500]}")
        print()
    except Exception as e:
        print(f"GET {url} -> Error: {e}")
        print()

# Also try POST
for url in detail_urls:
    try:
        resp = requests.post(url, timeout=10)
        print(f"POST {url}")
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            try:
                data = resp.json()
                print(f"  Response: {json.dumps(data, ensure_ascii=False, indent=2)[:1000]}")
            except:
                print(f"  Response (text): {resp.text[:500]}")
        print()
    except Exception as e:
        print(f"POST {url} -> Error: {e}")
        print()

print("Done")
