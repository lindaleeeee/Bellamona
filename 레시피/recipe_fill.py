"""
recipe_fill.py  v2
YouTube 링크(C열)를 읽어 D~N열을 채운다. 롱폼/숏폼 모두 지원.

열 구성
  D 음식이름 (주재료1개 + 음식이름)
  E 카테고리
  F 시간(분)   - 손질+조리+휴지 합계
  G 가격(원)   - 재료의 분량 기준 국내 소매가 합계
  H 맛
  I 주재료  J 부재료  K 양념  L 순서  M 팁
  N 칼로리   - I/J/K 재료의 분량 기준 kcal 합계

F, G, N 은 모델이 재료별로 쪼개 계산한 값을 파이썬이 다시 합산해 검산한다.

사용법
  python recipe_fill.py estimate|run|write|report
  노트북:  import recipe_fill as R; R.load_keys(); R.estimate()

중단해도 안전. 같은 명령 재실행하면 끝난 것은 건너뛴다.
"""

import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from openpyxl import load_workbook

# ==========================================================
# 설정
# ==========================================================
BASE_DIR = Path(r"D:\이혜딤\2026\Bellamona\Bellamona\레시피")
XLSX_IN = BASE_DIR / "유투브 다이어트 레시피 링크.xlsx"
XLSX_OUT = BASE_DIR / "유투브 다이어트 레시피 링크_완성.xlsx"
SHEET = "시트1"

# 파일명이 조금 달라도 폴더에서 자동으로 찾는다.
# backup / 완성 / 비교 가 들어간 파일과 임시파일(~$)은 제외.
def resolve_xlsx():
    global XLSX_IN
    if Path(XLSX_IN).exists():
        return XLSX_IN
    cands = [f for f in BASE_DIR.glob("*.xlsx")
             if not f.name.startswith("~$")
             and not any(k in f.name for k in ("backup", "완성", "비교"))]
    if len(cands) == 1:
        XLSX_IN = cands[0]
        print(f"[자동탐색] 원본 엑셀: {XLSX_IN.name}")
        return XLSX_IN
    if not cands:
        raise SystemExit(f"{BASE_DIR} 안에 원본 엑셀이 없습니다.")
    raise SystemExit("원본 후보가 여러 개입니다. R.XLSX_IN 을 직접 지정하세요:\n  "
                     + "\n  ".join(f.name for f in cands))

START_ROW = 2
COL_LINK = 3
COL_NAME = 4
LAST_COL = 14

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
WORKERS = 16
RPM = 0                    # 0=무제한. 무료 티어는 10~15

# 자막 정책: "auto" | "always" | "never"
#   auto = 숏폼이거나 설명글 120자 미만일 때만 자막 시도
USE_TRANSCRIPT = "auto"
TRANSCRIPT_LANGS = ["ko", "ko-KR", "en"]
MAX_TRANSCRIPT_CHARS = 3500
TRANSCRIPT_CONCURRENCY = 4   # 동시 자막 요청 수 (IP 차단 방지)

MAX_DESC_CHARS = 1200
MAX_OUTPUT_TOKENS = 3072
REQUEST_TIMEOUT = 120

PRICES = {  # USD / 100만 토큰 (input, output). 배치는 50%.
    "gemini-2.0-flash-lite": (0.075, 0.30),
    "gemini-2.0-flash": (0.10, 0.40),
    "gemini-2.5-flash-lite": (0.10, 0.40),
    "gemini-flash-lite-latest": (0.10, 0.40),   # 별칭. 실제 단가는 연결 모델 기준
    "gemini-3.1-flash-lite": (0.25, 1.50),
    "gemini-3.5-flash-lite": (0.30, 2.50),
    "gemini-3.6-flash": (1.50, 7.50),
}
USD_KRW = 1400

WORKDIR = BASE_DIR / "_recipe_work"
META_FILE = WORKDIR / "youtube_meta.jsonl"
TRANS_FILE = WORKDIR / "transcripts.jsonl"
RESULT_FILE = WORKDIR / "results.jsonl"
DAILY_FILE = WORKDIR / "daily_usage.json"

GEN_CONFIG = {
    "temperature": 0.2,
    "maxOutputTokens": MAX_OUTPUT_TOKENS,
    "responseMimeType": "application/json",
    "thinkingConfig": {"thinkingBudget": 0},
}

HEADER = ["검색키워드", "채널명", "영상링크", "음식이름", "카테고리", "시간(분, 숫자)",
          "가격(원, 숫자)", "맛", "주재료", "부재료", "양념", "순서", "팁", "칼로리(kcal)"]

STOP = threading.Event()
_write_lock = threading.Lock()
_print_lock = threading.Lock()
_trans_sem = threading.Semaphore(TRANSCRIPT_CONCURRENCY)


# ==========================================================
# API 키: BASE_DIR/keys.env 자동 로딩
#   YOUTUBE_API_KEY=AIza...
#   GEMINI_API_KEY=AIza...,AIza...
# ==========================================================
def load_keys(path=None):
    f = Path(path) if path else BASE_DIR / "keys.env"
    if not f.exists():
        print(f"[안내] {f} 없음. os.environ 으로 직접 지정하세요.")
        return
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip().strip('"').strip("'")
    yt = len([x for x in os.environ.get("YOUTUBE_API_KEY", "").split(",") if x.strip()])
    gm = len([x for x in os.environ.get("GEMINI_API_KEY", "").split(",") if x.strip()])
    print(f"키 로딩 완료: YouTube {yt}개 / Gemini {gm}개")


class KeyRing:
    def __init__(self, env_name):
        raw = os.environ.get(env_name, "")
        self.keys = [k.strip() for k in raw.split(",") if k.strip()]
        if not self.keys:
            raise SystemExit(f"환경변수 {env_name} 가 비어 있습니다. load_keys() 확인.")
        self._i = 0
        self._lock = threading.Lock()

    def next(self):
        with self._lock:
            k = self.keys[self._i % len(self.keys)]
            self._i += 1
            return k


class RateLimiter:
    def __init__(self, rpm):
        self.interval = 60.0 / rpm if rpm > 0 else 0.0
        self._lock = threading.Lock()
        self._next = 0.0

    def acquire(self):
        if self.interval <= 0:
            return
        with self._lock:
            now = time.monotonic()
            slot = max(now, self._next)
            self._next = slot + self.interval
        delay = slot - time.monotonic()
        if delay > 0:
            time.sleep(delay)


# ==========================================================
# 일일 사용량 추적 (무료 티어용)
#   429(RPD)가 뜨면 그날 처리한 건수를 기록해 두고 다음날 자동 재개한다.
# ==========================================================
import datetime as _dt

_daily_lock = threading.Lock()


def _today():
    return _dt.date.today().isoformat()


def daily_load():
    if not DAILY_FILE.exists():
        return {}
    try:
        return json.loads(DAILY_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def daily_bump(n=1, exhausted=False):
    with _daily_lock:
        d = daily_load()
        today = _today()
        rec = d.get(today, {"count": 0, "exhausted": False})
        rec["count"] += n
        if exhausted:
            rec["exhausted"] = True
        d[today] = rec
        DAILY_FILE.parent.mkdir(parents=True, exist_ok=True)
        DAILY_FILE.write_text(json.dumps(d, ensure_ascii=False, indent=1),
                              encoding="utf-8")
        return rec


def daily_status():
    """오늘 처리량과 지난 기록에서 추정한 일일 한도를 보여준다."""
    d = daily_load()
    if not d:
        print("아직 기록이 없습니다.")
        return None
    print(f"{'날짜':<14}{'처리건수':>10}{'한도소진':>10}")
    print("-" * 36)
    limits = []
    for day in sorted(d):
        rec = d[day]
        print(f"{day:<14}{rec['count']:>10,}{('예' if rec.get('exhausted') else '아니오'):>10}")
        if rec.get("exhausted"):
            limits.append(rec["count"])
    today = d.get(_today(), {})
    if limits:
        est = min(limits)
        print(f"\n관측된 일일 한도: 약 {est:,}건")
        left = max(est - today.get("count", 0), 0)
        print(f"오늘 남은 예상치: 약 {left:,}건")
    if today.get("exhausted"):
        print("\n오늘은 한도가 소진되었습니다. 내일 같은 명령으로 이어서 실행하세요.")
    return d


# ==========================================================
# 입력
# ==========================================================
VID_RE = re.compile(
    r"(?:youtu\.be/|youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|live/|embed/))([a-zA-Z0-9_-]{11})"
)


def extract_vid(url):
    if not url:
        return None
    m = VID_RE.search(str(url))
    return m.group(1) if m else None


def load_targets(path=None, sheet=None, limit=0, row_from=None, row_to=None):
    """D열이 비어 있는 행만 반환. row_from/row_to 로 엑셀 행 범위 지정 가능."""
    path = path or resolve_xlsx()
    sheet = sheet or SHEET
    wb = load_workbook(path, read_only=True)
    ws = wb[sheet]
    rows, seen = [], set()
    filled = bad = 0
    lo = row_from or START_ROW
    for i, r in enumerate(ws.iter_rows(min_row=lo, max_row=row_to or ws.max_row,
                                       values_only=True), lo):
        link = r[COL_LINK - 1] if len(r) >= COL_LINK else None
        name = r[COL_NAME - 1] if len(r) >= COL_NAME else None
        if not link:
            continue
        if name not in (None, ""):
            filled += 1
            continue
        vid = extract_vid(link)
        if not vid:
            bad += 1
            continue
        rows.append({"row": i, "link": str(link), "vid": vid})
        seen.add(vid)
        if limit and len(rows) >= limit:
            break
    wb.close()
    shorts = sum(1 for r in rows if "/shorts/" in r["link"])
    if row_from or row_to:
        print(f"[행범위 {lo}~{row_to if row_to else '끝'}]")
    print(f"미처리 {len(rows):,}행 / 고유 영상 {len(seen):,}개 "
          f"(숏츠링크 {shorts:,} / 이미채움 {filled:,} / 링크불량 {bad:,})")
    return rows, sorted(seen)


def load_jsonl(path, key):
    out = {}
    if not path.exists():
        return out
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
                out[d[key]] = d
            except Exception:
                continue
    return out


def append_jsonl(path, obj):
    with _write_lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")


# ==========================================================
# 1단계: YouTube 메타데이터 (재생시간 포함, 50개 묶음)
# ==========================================================
def iso_to_sec(iso):
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m:
        return 0
    h, mi, s = (int(x) if x else 0 for x in m.groups())
    return h * 3600 + mi * 60 + s


def fetch_meta(vids):
    cache = load_jsonl(META_FILE, "vid")
    todo = [v for v in vids if v not in cache]
    if not todo:
        print(f"YouTube 메타데이터 캐시 사용 ({len(cache):,}개)")
        return cache

    if not os.environ.get("YOUTUBE_API_KEY"):
        load_keys()
    yt_keys = KeyRing("YOUTUBE_API_KEY")
    print(f"YouTube 메타데이터 수집: {len(todo):,}개 ({(len(todo) + 49) // 50:,}콜)")
    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        url = ("https://www.googleapis.com/youtube/v3/videos"
               f"?part=snippet,contentDetails&id={','.join(chunk)}&key={yt_keys.next()}")
        try:
            res = requests.get(url, timeout=REQUEST_TIMEOUT)
        except Exception as e:
            print(f"  YT 요청 실패: {e}")
            continue
        if res.status_code != 200:
            print(f"  YT {res.status_code}: {res.text[:200]}")
            if res.status_code in (403, 429):
                print("  -> 할당량(10,000유닛/일) 또는 API 사용설정 확인 필요. 중단합니다.")
                break
            continue
        found = set()
        for it in res.json().get("items", []):
            s = it.get("snippet", {})
            rec = {"vid": it["id"],
                   "title": s.get("title", ""),
                   "channelTitle": s.get("channelTitle", ""),
                   "description": (s.get("description") or "")[:MAX_DESC_CHARS],
                   "seconds": iso_to_sec(it.get("contentDetails", {}).get("duration", ""))}
            cache[rec["vid"]] = rec
            append_jsonl(META_FILE, rec)
            found.add(rec["vid"])
        for miss in set(chunk) - found:
            rec = {"vid": miss, "title": "", "channelTitle": "", "description": "",
                   "seconds": 0, "missing": True}
            cache[miss] = rec
            append_jsonl(META_FILE, rec)
        print(f"  {min(i + 50, len(todo)):,}/{len(todo):,}", end="\r")
    print()
    return cache


# ==========================================================
# 2단계: 자막 (필요한 영상만)
# ==========================================================
def needs_transcript(meta):
    if USE_TRANSCRIPT == "never":
        return False
    if USE_TRANSCRIPT == "always":
        return True
    sec = meta.get("seconds") or 0
    return (0 < sec <= 60) or len(meta.get("description", "")) < 120


def fetch_transcript(vid, cache):
    if vid in cache:
        return cache[vid].get("text", "")
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        return ""
    with _trans_sem:
        try:
            fetched = YouTubeTranscriptApi().fetch(vid, languages=TRANSCRIPT_LANGS)
            text = " ".join(sn.text.strip() for sn in fetched
                            if sn.text and sn.text.strip() not in ("[음악]", "[Music]"))
            text = re.sub(r"\s+", " ", text).strip()[:MAX_TRANSCRIPT_CHARS]
            rec = {"vid": vid, "text": text}
        except Exception as e:
            rec = {"vid": vid, "text": "", "err": type(e).__name__}
        time.sleep(0.3)
    cache[vid] = rec
    append_jsonl(TRANS_FILE, rec)
    return rec.get("text", "")


# ==========================================================
# 3단계: 프롬프트
# ==========================================================
SCHEMA = ('{"isRecipe":true,"name":"양배추 덮밥","category":"한식","taste":"고소·짭짤",'
          '"servings":2,"servingNote":"완성량 2인분(1인 약 350g)",'
          '"main":["양배추 300g","밥 2공기(420g)","계란 2개(100g)"],'
          '"sub":["대파 40g"],"sauce":["간장 2큰술(30ml)","참기름 2작은술(10ml)"],'
          '"steps":["양배추를 채 썬다","팬에 볶는다","밥 위에 올린다"],'
          '"activeMin":13,"restMin":0,"timeMin":13,'
          '"calorieDetail":[{"item":"양배추 300g","kcal":76},{"item":"밥 420g","kcal":620},'
          '{"item":"계란 2개","kcal":144},{"item":"대파 40g","kcal":12},'
          '{"item":"간장 2큰술","kcal":20},{"item":"참기름 2작은술","kcal":80}],'
          '"calorieTotal":952,"calorie":476,'
          '"priceDetail":[{"item":"양배추 300g","won":1800},{"item":"밥 420g","won":800},'
          '{"item":"계란 2개","won":700},{"item":"대파 40g","won":300},'
          '{"item":"간장 2큰술","won":100},{"item":"참기름 2작은술","won":300}],'
          '"priceTotal":4000,"priceWon":2000,'
          '"tips":"양배추는 아삭함이 남게 짧게 볶는다"}')


CATEGORIES = ["한식", "일식", "중식", "이탈리안", "프렌치", "샐러드",
              "디저트", "음료", "에피타이저", "기타"]


def build_prompt(meta, transcript=""):
    sec = meta.get("seconds") or 0
    dur = (f"{sec // 60}분 {sec % 60}초 ({'숏폼' if 0 < sec <= 60 else '롱폼'})"
           if sec else "알 수 없음")
    tr_block = f"\n영상 자막(자동생성):\n{transcript}\n" if transcript else ""

    return f"""요리 콘텐츠 에디터로서, 아래 YouTube 영상 정보를 카드뉴스용 JSON으로 구조화하라.

제목: {meta.get('title', '')}
채널: {meta.get('channelTitle', '')}
영상길이: {dur}
설명: {meta.get('description', '')}{tr_block}

[출력 규칙]
- JSON만 출력. 설명문이나 백틱 금지.
- 레시피가 아니면(추천리스트/리뷰/브이로그/제품광고) isRecipe=false, 나머지는 빈 배열이나 빈 문자열.
- 자막이 있으면 자막을 최우선 근거로 삼는다. 자막과 설명글이 다르면 자막을 따른다.

[name]
- 반드시 "주재료 1개 + 음식이름" 형식. 주재료는 main 첫 재료에서 수량을 뺀 재료명.
- 좋은 예: "양배추 덮밥", "닭가슴살 샐러드", "두부 김치찌개"
- 나쁜 예: "5분컷 초간단 레시피", "모르면 손해보는 그것" (낚시성 제목, 이모지, 채널명 금지)

[재료: main / sub / sauce]
- 모든 항목을 "재료명 + 분량 + 단위" 형식으로 쓴다. 예: "두부 150g", "계란 2개(100g)", "올리브유 1큰술(15ml)"
- 영상에 분량이 안 나오면 1인분 기준으로 합리적으로 추정한다. 절대 분량을 빼지 않는다.
- main 은 요리를 규정하는 핵심 재료, sub 는 보조 재료, sauce 는 양념과 조미료.

[servings: 인분 수 - 가장 중요]
- 위 재료 전체로 완성되는 총 인분 수를 정수로 판단한다.
- 베이킹은 특히 주의한다. 밀가루 250g 반죽이면 보통 4~6인분, 케이크 한 판은 6~8인분, 쿠키 반죽 한 볼은 8~12개이다.
- 1인분 기준량 예시: 밥 210g, 파스타 건면 80~100g, 케이크 1조각 90g, 쿠키 1~2개 40g, 국물요리 350ml.
- servingNote 에 "완성량 O인분(1인 약 O g)" 형식으로 근거를 적는다.
- 판단이 어려우면 1로 두지 말고 재료 총량으로 합리적으로 추정한다.

[시간]
- activeMin: 손질과 조리에 실제로 손이 가는 시간.
- restMin: 냉장 굳히기, 반죽 휴지, 절이기 등 기다리기만 하는 시간.
- timeMin 은 activeMin 과 같은 값으로 둔다. 대기시간은 timeMin 에 넣지 않는다.

[칼로리]
- calorieDetail 에 main+sub+sauce 전 재료를 넣고, 각 재료의 그 분량 기준 실제 kcal 을 적는다.
- 기름과 양념도 반드시 포함한다. 식용유 1큰술은 약 120kcal, 버터 10g 은 약 75kcal 이다.
- 알룰로스, 에리스리톨 등 대체감미료는 실제 열량을 반영한다(알룰로스 100g 약 20kcal).
- calorieTotal = calorieDetail 의 합계(전체 분량 기준).
- calorie = calorieTotal 을 servings 로 나눈 1인분 값. 정수로 반올림.

[가격]
- priceDetail 에 각 재료를 그 분량만큼 썼을 때의 한국 마트 소매가를 원 단위로 적는다.
- priceTotal = priceDetail 의 합계(전체 분량 기준).
- priceWon = priceTotal 을 servings 로 나눈 1인분 값. 100원 단위 반올림.

[카테고리]
- 반드시 다음 중 하나: 한식 / 일식 / 중식 / 이탈리안 / 프렌치 / 샐러드 / 디저트 / 음료 / 에피타이저 / 기타
- 베이킹, 양식, 간식 같은 목록에 없는 값은 쓰지 않는다. 빵과 케이크와 쿠키는 디저트로 분류한다.

[출력 형식 예시]
{SCHEMA}"""


def extract_json(text):
    c = re.sub(r"```(?:json)?", "", text).strip()
    s = c.find("{")
    if s == -1:
        return None
    depth, in_str, esc = 0, False, False
    for i in range(s, len(c)):
        ch = c[i]
        if esc:
            esc = False
            continue
        if ch == "\\":
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(c[s:i + 1])
                except Exception:
                    return None
    return None


# ==========================================================
# 검산: 재료별 값을 파이썬이 다시 합산
# ==========================================================
def _sum_detail(detail, key):
    if not isinstance(detail, list):
        return None
    total, hit = 0, False
    for d in detail:
        if not isinstance(d, dict):
            continue
        try:
            total += float(d.get(key))
            hit = True
        except (TypeError, ValueError):
            continue
    return round(total) if hit else None


def reconcile(data):
    """재료별 합계를 파이썬이 다시 계산하고 servings 로 나눠 1인분으로 통일."""
    flags = []

    # 인분 수
    try:
        serv = int(float(data.get("servings") or 0))
    except (TypeError, ValueError):
        serv = 0
    if serv < 1:
        serv = 1
        flags.append("인분수없음")
    elif serv > 12:
        serv = 12
        flags.append("인분수과다")
    data["servings"] = serv

    # 칼로리: 전체 합계 -> 1인분
    ktotal = _sum_detail(data.get("calorieDetail"), "kcal")
    if ktotal:
        data["calorieTotal"] = ktotal
        per = round(ktotal / serv)
        try:
            km = float(data.get("calorie") or 0)
            if not km or abs(km - per) / max(per, 1) > 0.15:
                flags.append("칼로리재계산")
        except (TypeError, ValueError):
            flags.append("칼로리재계산")
        data["calorie"] = per

    # 가격: 전체 합계 -> 1인분, 100원 단위
    ptotal = _sum_detail(data.get("priceDetail"), "won")
    if ptotal:
        data["priceTotal"] = ptotal
        per = int(round(ptotal / serv / 100.0) * 100)
        try:
            pm = float(data.get("priceWon") or 0)
            if not pm or abs(pm - per) / max(per, 1) > 0.15:
                flags.append("가격재계산")
        except (TypeError, ValueError):
            flags.append("가격재계산")
        data["priceWon"] = per

    # 시간: 대기시간 제외
    try:
        act = int(float(data.get("activeMin") or 0))
    except (TypeError, ValueError):
        act = 0
    if act:
        try:
            tm = float(data.get("timeMin") or 0)
        except (TypeError, ValueError):
            tm = 0
        if tm > act:
            flags.append("대기시간분리")
        data["timeMin"] = act

    # 카테고리 강제
    cat = (data.get("category") or "").strip()
    if data.get("isRecipe") is not False and cat and cat not in CATEGORIES:
        alias = {"베이킹": "디저트", "빵": "디저트", "케이크": "디저트", "쿠키": "디저트",
                 "간식": "디저트", "양식": "이탈리안", "분식": "한식", "면요리": "한식",
                 "스프": "에피타이저", "수프": "에피타이저", "밥": "한식", "국": "한식"}
        data["category"] = alias.get(cat, "기타")
        flags.append(f"카테고리보정({cat})")

    # 상식 범위 점검 (1인분 기준)
    try:
        c = float(data.get("calorie") or 0)
        if c and not (30 <= c <= 1200):
            flags.append(f"칼로리이상({int(c)})")
    except (TypeError, ValueError):
        pass

    data["_flags"] = flags
    return data


# ==========================================================
# 이름 보정
# ==========================================================
UNIT_WORDS = ("약간", "적당량", "조금", "한줌", "한 줌", "선택", "취향껏")


# 재료명 뒤에 붙는 형태 수식어. 이름에 넣으면 어색하다.
FORM_WORDS = ("파우더", "가루", "분말", "시럽", "액", "즙", "페이스트", "소스",
              "오일", "기름", "물", "칩", "슬라이스", "채", "포", "환")
MODIFIERS = ("무가당", "저당", "무염", "다진", "삶은", "구운", "냉동", "생", "말린",
             "언스위트", "플레인", "저지방", "무지방", "유기농", "국산")


def main_ingredient(main_list):
    """'무가당 코코아 파우더 50g' -> '코코아'"""
    if not main_list:
        return ""
    first = main_list[0] if isinstance(main_list, list) else str(main_list)
    first = re.sub(r"\(.*?\)", " ", str(first))
    toks = [t for t in first.split()
            if not re.search(r"\d", t) and t not in UNIT_WORDS]
    toks = [t for t in toks if t not in MODIFIERS]
    # 뒤에서부터 형태 수식어를 걷어낸다
    while len(toks) > 1 and toks[-1] in FORM_WORDS:
        toks.pop()
    return toks[-1] if toks else ""


def fix_name(raw_name, main_list, fallback_title=""):
    name = (raw_name or "").strip()
    name = re.sub(r"[\U00010000-\U0010ffff\u2600-\u27bf\ufe0f]", "", name).strip()
    if not name:
        name = re.sub(r"[\[\(].*?[\]\)]", " ", fallback_title).strip()
    ing = main_ingredient(main_list)
    if ing and not _name_has(name, ing):
        name = f"{ing} {name}".strip()
    return re.sub(r"\s+", " ", name)


def _name_has(name, ing):
    """'크림치즈'와 '치즈케이크'처럼 겹치는 경우도 중복으로 본다."""
    if ing in name:
        return True
    if len(ing) >= 3:
        for k in range(len(ing), 1, -1):
            for i in range(0, len(ing) - k + 1):
                if len(ing[i:i + k]) >= 2 and ing[i:i + k] in name:
                    return True
    return False


# ==========================================================
# 4단계: Gemini 호출
# ==========================================================
def classify_429(body):
    s = json.dumps(body) if isinstance(body, (dict, list)) else str(body)
    return "DAY" if re.search(r"PerDay|per day|RequestsPerDay", s, re.I) else "MINUTE"


def call_gemini(prompt, gem_keys, limiter, max_retries=5):
    payload = {"contents": [{"parts": [{"text": prompt}]}],
               "generationConfig": GEN_CONFIG}
    wait = 5
    for _ in range(max_retries):
        if STOP.is_set():
            return {"status": "stopped"}
        limiter.acquire()
        url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
               f"{MODEL}:generateContent?key={gem_keys.next()}")
        try:
            res = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
        except Exception:
            time.sleep(wait)
            wait = min(wait * 2, 120)
            continue

        if res.status_code == 200:
            body = res.json()
            usage = body.get("usageMetadata", {})
            try:
                text = body["candidates"][0]["content"]["parts"][0]["text"]
            except Exception:
                return {"status": "error", "error": "빈 응답", "usage": usage}
            parsed = extract_json(text)
            if parsed is None:
                return {"status": "error", "error": "JSON 파싱 실패", "usage": usage}
            return {"status": "ok", "data": reconcile(parsed), "usage": usage}

        if res.status_code == 429:
            try:
                body = res.json()
            except Exception:
                body = res.text
            if classify_429(body) == "DAY":
                rec = daily_bump(0, exhausted=True)
                with _print_lock:
                    print(f"\n[중단] 일일 요청 한도(RPD) 소진. "
                          f"오늘 처리 {rec['count']:,}건.")
                    print("       내일 같은 명령으로 재실행하면 이어서 처리됩니다.")
                STOP.set()
                return {"status": "stopped"}
            time.sleep(wait)
            wait = min(wait * 2, 120)
            continue

        if res.status_code in (500, 503, 504):
            time.sleep(wait)
            wait = min(wait * 2, 120)
            continue

        if res.status_code == 404:
            with _print_lock:
                print(f"\n[중단] 모델 '{MODEL}' 을 이 API 키로 사용할 수 없습니다.")
                print("       list_models() 로 사용 가능한 모델을 확인하고 MODEL 을 바꾸세요.")
            STOP.set()
            return {"status": "stopped"}

        return {"status": "error", "error": f"HTTP {res.status_code}: {res.text[:200]}"}

    return {"status": "error", "error": "재시도 초과"}


def list_models():
    """이 API 키로 쓸 수 있는 모델 목록. generateContent 지원 여부까지 표시."""
    if not os.environ.get("GEMINI_API_KEY"):
        load_keys()
    key = KeyRing("GEMINI_API_KEY").next()
    url = ("https://generativelanguage.googleapis.com/v1beta/models"
           f"?key={key}&pageSize=200")
    res = requests.get(url, timeout=60)
    if res.status_code != 200:
        print(f"조회 실패 {res.status_code}: {res.text[:300]}")
        return []
    usable = []
    print(f"{'모델명':<40}{'generateContent':>16}")
    print("-" * 58)
    for m in res.json().get("models", []):
        name = m.get("name", "").replace("models/", "")
        gen = "generateContent" in (m.get("supportedGenerationMethods") or [])
        if "embedding" in name or "aqa" in name:
            continue
        print(f"{name:<40}{('O' if gen else 'X'):>16}")
        if gen:
            usable.append(name)
    print("\n사용법:  R.MODEL = \"위 목록 중 하나\"")
    print("추천 순서: flash-lite -> flash (저렴한 순)")
    return usable


def run(limit=0, workers=WORKERS, rpm=RPM, retry_errors=False,
        row_from=None, row_to=None):
    """row_from/row_to 로 엑셀 행 범위만 처리 가능. 예: run(row_from=1473, row_to=1498)"""
    STOP.clear()
    targets, vids = load_targets(limit=limit, row_from=row_from, row_to=row_to)
    if not targets:
        print("처리할 행이 없습니다.")
        return
    meta = fetch_meta(vids)

    done = load_jsonl(RESULT_FILE, "vid")
    if retry_errors:
        done = {k: v for k, v in done.items() if v.get("status") == "ok"}
    todo = [v for v in vids if v not in done and not meta.get(v, {}).get("missing")]
    missing = sum(1 for v in vids if meta.get(v, {}).get("missing"))
    print(f"Gemini 처리 대상 {len(todo):,}개 (완료 {len(done):,} / 영상없음 {missing:,})")
    if not todo:
        return

    tr_cache = load_jsonl(TRANS_FILE, "vid")
    if not os.environ.get("GEMINI_API_KEY"):
        load_keys()
    gem_keys = KeyRing("GEMINI_API_KEY")
    limiter = RateLimiter(rpm)
    stats = {"ok": 0, "err": 0, "in": 0, "out": 0, "tr": 0, "t0": time.time()}
    slock = threading.Lock()

    def work(vid):
        if STOP.is_set():
            return
        m = meta[vid]
        tr = fetch_transcript(vid, tr_cache) if needs_transcript(m) else ""
        res = call_gemini(build_prompt(m, tr), gem_keys, limiter)
        if res["status"] == "stopped":
            return
        rec = {"vid": vid, "status": res["status"], "hasTranscript": bool(tr)}
        if res["status"] == "ok":
            rec["data"] = res["data"]
        else:
            rec["error"] = res.get("error", "")
        append_jsonl(RESULT_FILE, rec)
        daily_bump(1)

        u = res.get("usage", {})
        with slock:
            stats["ok" if res["status"] == "ok" else "err"] += 1
            stats["tr"] += 1 if tr else 0
            stats["in"] += u.get("promptTokenCount", 0)
            stats["out"] += u.get("candidatesTokenCount", 0)
            n = stats["ok"] + stats["err"]
            if n % 25 == 0 or n == len(todo):
                el = time.time() - stats["t0"]
                rate = n / el if el else 0
                eta = (len(todo) - n) / rate / 60 if rate else 0
                pi, po = PRICES.get(MODEL, (0, 0))
                cost = stats["in"] / 1e6 * pi + stats["out"] / 1e6 * po
                with _print_lock:
                    print(f"  {n:,}/{len(todo):,}  성공 {stats['ok']:,} 오류 {stats['err']:,} "
                          f"자막 {stats['tr']:,}  {rate * 60:.0f}건/분  "
                          f"남은 {eta:.0f}분  ${cost:.2f}(~{cost * USD_KRW:,.0f}원)", end="\r")

    try:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            list(ex.map(work, todo))
    except KeyboardInterrupt:
        STOP.set()
        print("\n중단됨. 같은 명령으로 재실행하면 이어서 처리됩니다.")

    pi, po = PRICES.get(MODEL, (0, 0))
    cost = stats["in"] / 1e6 * pi + stats["out"] / 1e6 * po
    print(f"\n완료: 성공 {stats['ok']:,} / 오류 {stats['err']:,} / 자막사용 {stats['tr']:,}")
    print(f"비용: ${cost:.2f} (약 {cost * USD_KRW:,.0f}원)")
    remain = len(todo) - stats["ok"] - stats["err"]
    if remain > 0:
        print(f"남은 영상: {remain:,}개")
        rec = daily_load().get(_today(), {})
        if rec.get("exhausted"):
            days = remain / max(rec.get("count", 1), 1)
            print(f"현재 속도면 완료까지 약 {days:.0f}일 더 필요합니다.")


# ==========================================================
# 5단계: 엑셀 되쓰기
# ==========================================================
def build_cells(data, meta_title=""):
    def join(v):
        return "\n".join(str(x) for x in v) if isinstance(v, list) else (v or "")

    is_recipe = data.get("isRecipe") is not False
    return [
        fix_name(data.get("name"), data.get("main"), meta_title),        # D
        data.get("category") or ("기타" if is_recipe else "레시피아님"),   # E
        data.get("timeMin") or "",                                       # F
        data.get("priceWon") or "",                                      # G
        data.get("taste") or "",                                         # H
        join(data.get("main")),                                          # I
        join(data.get("sub")),                                           # J
        join(data.get("sauce")),                                         # K
        join(data.get("steps")),                                         # L
        data.get("tips") or "",                                          # M
        data.get("calorie") or "",                                       # N
    ]


def write_back(src=None, dst=None, sheet=None, row_from=None, row_to=None):
    src = src or resolve_xlsx()
    dst = dst or (Path(src).parent / (Path(src).stem + '_완성.xlsx'))
    sheet = sheet or SHEET
    results = load_jsonl(RESULT_FILE, "vid")
    meta = load_jsonl(META_FILE, "vid")
    if not results:
        print("결과 파일이 없습니다. 먼저 run() 을 실행하세요.")
        return

    print("엑셀 로딩 중...")
    wb = load_workbook(src)
    ws = wb[sheet]
    ws.cell(row=1, column=LAST_COL).value = HEADER[LAST_COL - 1]

    n = skipped = 0
    for row in range(row_from or START_ROW, (row_to or ws.max_row) + 1):
        if ws.cell(row=row, column=COL_NAME).value not in (None, ""):
            continue
        vid = extract_vid(ws.cell(row=row, column=COL_LINK).value)
        if not vid:
            continue
        r = results.get(vid)
        if not r or r.get("status") != "ok":
            skipped += 1
            continue
        cells = build_cells(r["data"], meta.get(vid, {}).get("title", ""))
        for off, val in enumerate(cells):
            ws.cell(row=row, column=COL_NAME + off).value = val
        n += 1

    wb.save(dst)
    print(f"{dst} 저장 완료 (채운 행 {n:,} / 미처리 {skipped:,})")


# ==========================================================
# 현황 리포트
# ==========================================================
def report():
    results = load_jsonl(RESULT_FILE, "vid")
    meta = load_jsonl(META_FILE, "vid")
    targets, vids = load_targets()
    ok = notrecipe = err = missing = pending = 0
    tr_used = flagged = shorts_ok = 0
    for v in vids:
        if meta.get(v, {}).get("missing"):
            missing += 1
            continue
        r = results.get(v)
        if not r:
            pending += 1
        elif r.get("status") != "ok":
            err += 1
        elif r["data"].get("isRecipe") is False:
            notrecipe += 1
        else:
            ok += 1
            tr_used += 1 if r.get("hasTranscript") else 0
            flagged += 1 if r["data"].get("_flags") else 0
            sec = meta.get(v, {}).get("seconds") or 0
            shorts_ok += 1 if 0 < sec <= 60 else 0
    print(f"\n고유 영상 {len(vids):,}개")
    print(f"  레시피 정상 채움 : {ok:,}  (숏폼 {shorts_ok:,} / 자막활용 {tr_used:,})")
    print(f"  레시피 아님      : {notrecipe:,}")
    print(f"  분석 오류        : {err:,}   -> run(retry_errors=True)")
    print(f"  삭제/비공개 영상  : {missing:,}   -> 영구 공백")
    print(f"  아직 미처리      : {pending:,}")
    print(f"  검산에서 수정됨   : {flagged:,}  (모델 합계와 재료별 합계 불일치)")


# ==========================================================
# 비용 추정
# ==========================================================
def estimate():
    targets, vids = load_targets()
    done = load_jsonl(RESULT_FILE, "vid")
    n = len([v for v in vids if v not in done])
    in_tok = int(700 + MAX_DESC_CHARS * 0.75)
    out_tok = 1000
    ti, to = n * in_tok / 1e6, n * out_tok / 1e6
    print(f"\n미처리 {n:,}건 / 모델 {MODEL} / 자막정책 {USE_TRANSCRIPT}")
    print(f"추정 토큰: 입력 {ti:.1f}M / 출력 {to:.1f}M")
    print("(자막이 붙는 영상은 건당 입력이 1,500~3,000토큰 더 늘어납니다)\n")
    print(f"{'모델':<24}{'표준':>18}{'배치(50%)':>18}")
    print("-" * 60)
    for m, (pi, po) in PRICES.items():
        c = ti * pi + to * po
        print(f"{m:<24}{f'${c:.2f} ({c * USD_KRW:,.0f}원)':>18}"
              f"{f'${c / 2:.2f} ({c / 2 * USD_KRW:,.0f}원)':>18}")
    print(f"\nYouTube API 콜: {(n + 49) // 50:,}회 (일일 10,000유닛 한도 내)")
    rate = RPM if RPM else 600
    print(f"실시간 모드 {rate} RPM 기준 소요: 약 {n / rate / 60:.1f}시간")


def _cli_command():
    skip_next = False
    for a in sys.argv[1:]:
        if skip_next:
            skip_next = False
            continue
        if a.startswith("-"):
            skip_next = True
            continue
        if a in ("estimate", "run", "write", "report", "models", "daily"):
            return a
    return "estimate"


if __name__ == "__main__":
    cmd = _cli_command()
    if cmd == "run":
        run()
        write_back()
    elif cmd == "write":
        write_back()
    elif cmd == "report":
        report()
    elif cmd == "models":
        list_models()
    elif cmd == "daily":
        daily_status()
    else:
        estimate()
