"""
link_crawler.py
정해둔 키워드로 YouTube를 검색해, 엑셀에 아직 없는 영상만 골라 맨 아래에 추가한다.
주 1회 실행을 전제로 한다.

  python link_crawler.py check     - 할당량 계산만 (API 호출 없음)
  python link_crawler.py crawl     - 검색해서 신규 링크 수집
  python link_crawler.py append    - 수집한 링크를 엑셀에 추가
  python link_crawler.py weekly    - crawl + append + 분석까지 한 번에

할당량 주의
  search.list 는 1회당 100유닛. 일일 무료 한도가 10,000유닛이므로
  하루 최대 100회까지만 검색할 수 있다.
  키워드 8개 x 3페이지 = 24회 = 2,400유닛. 여유롭다.
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from openpyxl import load_workbook

import recipe_fill as R

# ==========================================================
# 설정
# ==========================================================
KEYWORDS = [
    "다이어트 레시피",
    "저당 레시피",
    "저당 디저트레시피",
    "다이어트 디저트레시피",
    "냉부 레시피",
    "저당 간식레시피",
    "레시피",
]

PAGES_PER_KEYWORD = 3      # 1페이지 = 50개. 3페이지면 키워드당 최대 150개
SEARCH_UNIT_COST = 100
DAILY_UNIT_LIMIT = 10000
LOOKBACK_DAYS = 10         # 주 1회 실행 기준, 여유 있게 10일치
ORDER = "date"             # date(최신순) 또는 relevance

POOL_FILE = R.WORKDIR / "link_pool.jsonl"
CRAWL_STATE = R.WORKDIR / "crawl_state.json"


# ==========================================================
# 기존 영상 ID 수집
# ==========================================================
def existing_vids():
    """엑셀에 이미 들어 있는 영상 ID 집합."""
    path = R.resolve_xlsx()
    wb = load_workbook(path, read_only=True)
    ws = wb[R.SHEET]
    vids = set()
    last = 1
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        link = row[R.COL_LINK - 1] if len(row) >= R.COL_LINK else None
        if not link:
            continue
        last = i
        v = R.extract_vid(link)
        if v:
            vids.add(v)
    wb.close()
    print(f"엑셀 보유 영상 {len(vids):,}개 (마지막 행 {last:,})")
    return vids, last, path


def load_pool():
    out = {}
    if not POOL_FILE.exists():
        return out
    with open(POOL_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
                out[d["vid"]] = d
            except Exception:
                continue
    return out


# ==========================================================
# 할당량 계산
# ==========================================================
def check():
    calls = len(KEYWORDS) * PAGES_PER_KEYWORD
    units = calls * SEARCH_UNIT_COST
    print(f"\n키워드 {len(KEYWORDS)}개 x {PAGES_PER_KEYWORD}페이지 = 검색 {calls}회")
    print(f"소비 유닛: {units:,} / 일일 한도 {DAILY_UNIT_LIMIT:,}")
    print(f"최대 수집 가능: {calls * 50:,}개 (중복 제외 전)")
    if units > DAILY_UNIT_LIMIT:
        print("\n[경고] 한도를 넘습니다. PAGES_PER_KEYWORD 를 줄이세요.")
    else:
        left = DAILY_UNIT_LIMIT - units
        print(f"남는 유닛 {left:,} -> 분석용 videos.list {left:,}회 가능")
    st = json.loads(CRAWL_STATE.read_text(encoding="utf-8")) if CRAWL_STATE.exists() else {}
    if st.get("last_run"):
        print(f"\n마지막 크롤링: {st['last_run']}")
    pool = load_pool()
    if pool:
        pend = sum(1 for v in pool.values() if not v.get("appended"))
        print(f"수집 대기 중인 신규 링크: {pend:,}개")


# ==========================================================
# 검색
# ==========================================================
def search_keyword(keyword, published_after, yt_keys, known):
    found, page, calls = [], None, 0
    for _ in range(PAGES_PER_KEYWORD):
        params = {
            "part": "snippet", "type": "video", "q": keyword,
            "maxResults": 50, "order": ORDER,
            "publishedAfter": published_after,
            "key": yt_keys.next(),
        }
        if page:
            params["pageToken"] = page
        try:
            res = requests.get("https://www.googleapis.com/youtube/v3/search",
                               params=params, timeout=60)
        except Exception as e:
            print(f"    요청 실패: {e}")
            break
        calls += 1
        if res.status_code != 200:
            print(f"    {res.status_code}: {res.text[:160]}")
            if res.status_code in (403, 429):
                return found, calls, True
            break
        body = res.json()
        for it in body.get("items", []):
            vid = (it.get("id") or {}).get("videoId")
            sn = it.get("snippet", {})
            if not vid or vid in known:
                continue
            known.add(vid)
            found.append({
                "vid": vid,
                "keyword": keyword,
                "channel": sn.get("channelTitle", ""),
                "link": f"https://www.youtube.com/watch?v={vid}",
                "title": sn.get("title", ""),
                "publishedAt": sn.get("publishedAt", ""),
                "foundAt": datetime.now().isoformat(timespec="seconds"),
                "appended": False,
            })
        page = body.get("nextPageToken")
        if not page:
            break
        time.sleep(0.3)
    return found, calls, False


def crawl(days=LOOKBACK_DAYS):
    if not os.environ.get("YOUTUBE_API_KEY"):
        R.load_keys()
    yt_keys = R.KeyRing("YOUTUBE_API_KEY")

    known, _, _ = existing_vids()
    pool = load_pool()
    known |= set(pool.keys())

    after = (datetime.now(timezone.utc) - timedelta(days=days)
             ).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"검색 기준: {after} 이후 업로드분\n")

    total, used = 0, 0
    for kw in KEYWORDS:
        found, calls, quota_hit = search_keyword(kw, after, yt_keys, known)
        used += calls * SEARCH_UNIT_COST
        for f in found:
            R.append_jsonl(POOL_FILE, f)
        total += len(found)
        print(f"  {kw:<20} 신규 {len(found):>3}개  (누적 유닛 {used:,})")
        if quota_hit:
            print("  -> 할당량 소진. 중단합니다.")
            break

    CRAWL_STATE.parent.mkdir(parents=True, exist_ok=True)
    CRAWL_STATE.write_text(json.dumps({
        "last_run": datetime.now().isoformat(timespec="seconds"),
        "found": total, "units": used}, ensure_ascii=False), encoding="utf-8")
    print(f"\n신규 {total:,}개 수집 / 유닛 {used:,} 사용")
    return total


# ==========================================================
# 엑셀에 추가
# ==========================================================
def append():
    pool = load_pool()
    todo = [v for v in pool.values() if not v.get("appended")]
    if not todo:
        print("추가할 신규 링크가 없습니다.")
        return 0

    known, last, path = existing_vids()
    todo = [t for t in todo if t["vid"] not in known]
    if not todo:
        print("모두 엑셀에 이미 있습니다.")
        return 0

    print(f"엑셀에 {len(todo):,}행 추가 중...")
    wb = load_workbook(path)
    ws = wb[R.SHEET]
    row = ws.max_row + 1
    for t in sorted(todo, key=lambda x: x.get("publishedAt", "")):
        ws.cell(row=row, column=1).value = t["keyword"]
        ws.cell(row=row, column=2).value = t["channel"]
        ws.cell(row=row, column=3).value = t["link"]
        row += 1
    wb.save(path)

    with open(POOL_FILE, "a", encoding="utf-8") as f:
        for t in todo:
            t["appended"] = True
            f.write(json.dumps(t, ensure_ascii=False) + "\n")

    print(f"{path.name} 에 {len(todo):,}행 추가 (행 {last + 1:,} ~ {row - 1:,})")
    return len(todo)


# ==========================================================
# 주간 일괄 실행
# ==========================================================
def weekly(analyze=True, model="gemini-3.1-flash-lite", workers=2, rpm=10):
    print("=" * 60)
    print(f"주간 크롤링 시작 {datetime.now():%Y-%m-%d %H:%M}")
    print("=" * 60)
    crawl()
    n = append()
    if n and analyze:
        print("\n신규 행 분석 시작")
        R.MODEL = model
        R.run(workers=workers, rpm=rpm)
        R.write_back()
        R.report()
    print("\n주간 작업 완료")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    R.WORKDIR.mkdir(parents=True, exist_ok=True)
    if cmd == "crawl":
        R.load_keys()
        crawl()
    elif cmd == "append":
        append()
    elif cmd == "weekly":
        R.load_keys()
        weekly()
    else:
        check()
