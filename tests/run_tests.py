#!/usr/bin/env python3
"""포켓 가계부 · Apps Script(Code.gs) 단위 테스트 러너.

quickjs(pip install quickjs)로 모의 스프레드시트 위에서 apps-script/Code.gs 를
"수정 없이" 실행하고, update/delete/방어 로직을 검증합니다.

사용:
    python3 tests/run_tests.py
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
MOCK = (ROOT / "tests" / "mock_env.js").read_text(encoding="utf-8")
CODE = (ROOT / "apps-script" / "Code.gs").read_text(encoding="utf-8")
TESTS = (ROOT / "tests" / "code_gs_test.js").read_text(encoding="utf-8")

ctx = quickjs.Context()
ctx.eval(MOCK)
# Code.gs 는 전역 함수/변수 선언만 하므로 같은 컨텍스트에서 바로 실행됩니다.
ctx.eval(CODE)
result = json.loads(ctx.eval(TESTS))

for failure in result["failures"]:
    print(f"  ✗ {failure['name']}\n      → {failure['err']}")

print(f"\n{'PASS' if result['failed'] == 0 else 'FAIL'}  "
      f"{result['passed']}/{result['total']} 통과 "
      f"(실패 {result['failed']})")
sys.exit(0 if result["failed"] == 0 else 1)
