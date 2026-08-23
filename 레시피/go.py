"""
go.py - 매일 자동 실행용

무료 한도에 걸릴 때까지 분석하고, 엑셀에 저장한 뒤 종료한다.
다음 날 다시 실행하면 끝난 것은 건너뛰고 이어서 처리한다.

실행:  C:/Python314/python.exe go.py
"""

import sys
import traceback
from datetime import datetime
from pathlib import Path

import recipe_fill as R

# ==========================================================
# 설정 - 여기만 고치면 됩니다
# ==========================================================
R.USE_TRANSCRIPT = "never"          # 자막 사용 안 함 (IP 차단 때문)
R.MODEL = "gemini-3.1-flash-lite"   # 무료로 열려 있는 모델
WORKERS = 2
RPM = 10                            # 분당 요청 수. 429가 안 뜨면 30까지 올려도 됨

ROW_FROM = 1722                     # 이 행부터 처리 (앞쪽은 건드리지 않음)
ROW_TO = None                       # None = 마지막 행까지

LOG_FILE = R.BASE_DIR / "실행기록.txt"


def log(msg):
    line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def main():
    log("=" * 50)
    log(f"분석 시작 (행 {ROW_FROM} ~ {ROW_TO or '끝'})")
    try:
        R.load_keys()
        R.run(workers=WORKERS, rpm=RPM, row_from=ROW_FROM, row_to=ROW_TO)
    except KeyboardInterrupt:
        log("사용자가 중단함")
    except Exception as e:
        log(f"분석 중 오류: {e}")
        traceback.print_exc()

    # 분석이 어떻게 끝났든 저장은 시도한다
    for attempt in range(3):
        try:
            R.write_back(row_from=ROW_FROM, row_to=ROW_TO)
            log("엑셀 저장 완료")
            break
        except PermissionError:
            log(f"엑셀 파일이 열려 있어 저장 실패 ({attempt + 1}/3). "
                f"_완성.xlsx 를 닫아주세요. 60초 후 재시도")
            import time
            time.sleep(60)
        except Exception as e:
            log(f"저장 오류: {e}")
            break
    else:
        log("저장 실패. 결과는 _recipe_work/results.jsonl 에 보존됨. "
            "엑셀을 닫고 write 명령으로 저장하세요.")

    try:
        R.report()
        R.daily_status()
    except Exception:
        pass
    log("종료")


if __name__ == "__main__":
    main()
