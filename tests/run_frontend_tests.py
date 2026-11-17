#!/usr/bin/env python3
"""포켓 가계부 · 프런트엔드 단위 테스트 러너.

quickjs(pip install quickjs)로 최소 DOM 스텁 위에서 app.js 를 그대로 실행하고,
별도지출 판정·집계·내역 필터·화면 렌더 문자열을 검증합니다.

사용:
    python3 tests/run_frontend_tests.py
"""
import json
import pathlib
import sys

try:
    import quickjs
except ImportError:  # pragma: no cover
    print("quickjs 가 필요합니다:  pip install quickjs", file=sys.stderr)
    sys.exit(2)

ROOT = pathlib.Path(__file__).resolve().parent.parent
STUB = (ROOT / "tests" / "dom_stub.js").read_text(encoding="utf-8")
APP = (ROOT / "app.js").read_text(encoding="utf-8")
TESTS = (ROOT / "tests" / "frontend_test.js").read_text(encoding="utf-8")

ctx = quickjs.Context()
try:
    ctx.eval(STUB)
    ctx.eval(APP)  # IIFE 실행 (document.readyState='loading' 이므로 boot 는 돌지 않음)
except Exception as exc:  # 문법/런타임 오류도 실패로 보고
    print(f"FAIL  app.js 를 실행하지 못했습니다: {exc}")
    sys.exit(1)

result = json.loads(ctx.eval(TESTS))

for failure in result["failures"]:
    print(f"  ✗ {failure['name']}\n      → {failure['err']}")

print(f"\n{'PASS' if result['failed'] == 0 else 'FAIL'}  "
      f"{result['passed']}/{result['total']} 통과 "
      f"(실패 {result['failed']})")
sys.exit(0 if result["failed"] == 0 else 1)
