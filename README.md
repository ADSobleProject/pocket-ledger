# 포켓 가계부 (Pocket Ledger)

구글 스프레드시트를 그대로 두고 쓰는 **모바일 가계부 웹앱**입니다.
시트는 데이터베이스, 이 앱은 그 위의 입력·조회 화면입니다.

**▶ 앱 열기: https://adsobleproject.github.io/pocket-ledger/**

- 📱 폰에서 앱처럼 설치 (PWA · 홈 화면 추가)
- 🔒 시트 ID·비밀번호를 코드에 저장하지 않음 — 앱 첫 화면에서 **웹 앱 URL + PIN** 을 입력하면 이 기기에만 저장됩니다
- ✍️ 입력은 `시트1` 마지막 행에 한 줄 추가하는 것뿐, 수식 탭은 건드리지 않습니다
- ✏️ 내역을 탭하면 **수정 · 삭제** — 그 행의 A~H열만 고치고 메일ID(I열)는 보존합니다
- 💍 결혼준비 지출은 따로 모아 생활비 집계에서 제외
- 🧾 **별도지출** — 비고에 `#제외` 가 붙고 `#결혼준비` 가 아닌 지출(연납 자동차보험료 등)을 `결혼/별도` 탭에서 따로 모아 봅니다

```
.
├── index.html            # 앱 셸
├── style.css             # 모바일 퍼스트 스타일
├── app.js                # 화면 · 통신 (localStorage 에 URL/PIN 만 저장)
├── manifest.json         # PWA 매니페스트
├── sw.js                 # 오프라인 셸 캐시 (데이터는 캐시하지 않음)
├── icons/                # 앱 아이콘
├── apps-script/
│   └── Code.gs           # 구글 시트에 붙여넣는 백엔드
└── tests/
    ├── run_tests.py       # Code.gs 단위 테스트 러너 (quickjs)
    ├── mock_env.js        # 스프레드시트·LockService 모의 환경
    ├── code_gs_test.js    # update/delete · 방어 로직 테스트
    ├── run_frontend_tests.py  # app.js 단위 테스트 러너 (quickjs + DOM 스텁)
    ├── dom_stub.js        # 최소 DOM 모의 환경
    └── frontend_test.js   # 별도지출 판정·집계·필터·날짜/IME 렌더 테스트
```

## 1. 백엔드 붙이기 (5분)

1. 가계부 스프레드시트 열기 → **확장 프로그램 → Apps Script**
2. 기본 `Code.gs` 내용을 지우고 [`apps-script/Code.gs`](apps-script/Code.gs) 전체를 붙여넣기
3. 맨 위 `const APP_PIN` 을 원하는 **4자리 숫자**로 수정 (기본 `0000`)
4. 저장 → **배포 → 새 배포**
   - 유형: **웹 앱**
   - 다음 사용자로 실행: **나**
   - 액세스 권한: **모든 사람** ← 이 값이 아니면 폰에서 연결되지 않습니다
5. 나온 **웹 앱 URL**(`…/exec`)을 복사

> 독립 스크립트로 만들었다면 `SPREADSHEET_ID` 에 시트 ID를 넣어 주세요.
> PIN 을 바꾼 뒤에는 **배포 → 배포 관리 → 새 버전** 으로 다시 배포해야 반영됩니다.

## 2. 앱 연결

배포된 GitHub Pages 주소를 폰에서 열고, 첫 화면에 **웹 앱 URL** 과 **PIN** 을 입력합니다.
연결되면 홈 화면에 추가하세요.

- iOS Safari: 공유 → **홈 화면에 추가**
- Android Chrome: 메뉴 → **앱 설치** / **홈 화면에 추가**

## 3. API

`doGet` 과 `doPost` 모두 JSON 으로 응답합니다.

**GET** `?pin=1234` → 예산, 월별요약, 결혼준비, 시트1 최근 200건

```json
{
  "ok": true,
  "data": {
    "period": { "month": "2026-11", "daysLeft": 16 },
    "budget": { "period": {...}, "rows": [...], "total": {...} },
    "monthly": [{ "month": "2026-11", "income": 0, "expense": 0, "net": 0, "rate": 0, "count": 0 }],
    "wedding": { "summary": { "spend": 0, "refund": 0, "net": 0, "count": 0 }, "rows": [...] },
    "transactions": [{ "row": 12, "date": "2026-11-15", "time": "12:30", "merchant": "...", "type": "출금", "amount": 12000, "method": "...", "category": "식사", "note": "", "mailId": "..." }]
  }
}
```

**POST** (`Content-Type: text/plain` — CORS preflight 회피용)

```json
{
  "pin": "1234", "action": "append",
  "date": "2026-11-15", "time": "12:30", "merchant": "스타벅스",
  "type": "출금", "amount": 5600, "method": "토스",
  "category": "카페/간식", "note": "", "isWedding": false
}
```

`isWedding: true` 이면 비고에 `#결혼준비 #제외` 가 자동으로 붙고, 메일ID 는 `webapp-<timestamp>` 로 기록됩니다.

**POST · 수정** — `row` 는 GET 으로 받은 거래의 `row`(시트1의 실제 행 번호)입니다.

```json
{
  "pin": "1234", "action": "update", "row": 12,
  "date": "2026-11-15", "time": "12:30", "merchant": "스타벅스 전주점",
  "type": "출금", "amount": 5900, "method": "토스",
  "category": "카페/간식", "note": "", "isWedding": false
}
```

A~H열만 다시 쓰고 I열(메일ID)은 그대로 둡니다. `isWedding: true` 면 비고에 태그를 붙이고,
`false` 면 `#결혼준비` · `#제외` 태그를 지웁니다. 행이 시트 범위를 벗어나거나 비어 있으면
`ROW_OUT_OF_RANGE` / `ROW_EMPTY` 로 거절합니다.

**POST · 삭제**

```json
{ "pin": "1234", "action": "delete", "row": 12, "expectedMerchant": "스타벅스 전주점" }
```

`expectedMerchant` 를 함께 보내면 그 행의 사용처가 일치할 때만 지웁니다.
시트가 그 사이에 바뀌었으면 `ROW_MISMATCH` 로 막고 새로고침을 안내합니다(삭제 사고 방지).

## 4. 테스트

```bash
pip install quickjs
python3 tests/run_tests.py           # 27개 검사 — update/delete/방어/다른 시트 무접촉
python3 tests/run_frontend_tests.py  # 23개 검사 — 별도지출 판정·집계·필터·화면 렌더
```

## 5. 별도지출 표시 방식

`결혼/월별` 탭의 `🧾 별도지출` 세그먼트는 **백엔드 수정 없이** 동작합니다.
앱이 GET 으로 받는 `transactions`(시트1 최근 200건)의 비고를 보고
`#제외` 가 있고 `#결혼준비` 가 없는 행을 모아 합계·건수를 계산합니다(시트 `별도지출` 탭과 같은 기준).

- 응답에 `separate: { summary, rows }` 가 있으면 그 값을 우선 사용합니다 — 나중에 `Code.gs` 에
  시트 `별도지출` 탭 읽기를 추가해 재배포하면, 앱은 그대로 누적 전체를 표시합니다.
- 별도지출 행은 앱에서 **수정할 수 없습니다**. 앱의 수정 저장은 `#결혼준비` · `#제외` 태그를 지우기 때문에
  (`Code.gs` 의 `stripWeddingTags_`), 고치면 생활비로 잡힙니다. 시트1에서 직접 수정하세요.

## 참고

- `index.html` 의 `app.js?v=4` · `style.css?v=4` 는 GitHub Pages 의 10분 캐시 때문에 붙여 둔 버전입니다.
  app.js/style.css 를 고칠 때 이 번호를 올리고 `sw.js` 의 `CACHE` 이름도 같이 올리면 폰에서 바로 반영됩니다.

- 내역 탭 검색창은 `type="text"` + `#listResults` 부분 갱신입니다. 입력할 때마다 화면 전체를
  다시 그리면 안드로이드 키보드의 한글 조합(IME)이 끊겨 `ㅁㅏㅌㅡ` 처럼 낱자로 들어갑니다.
  검색 input 노드는 그대로 두고 결과 영역만 갈아 끼우세요.

- 결혼/월별 탭 내역 행은 날짜 묶음이 없어 각 행 메타가 `11/16 · 기타지출 · …` 처럼 날짜로 시작합니다.

- 카테고리는 시트의 표준 13개(식사 · 카페/간식 · 생활/마트 · 온라인쇼핑 · 교통/차량 · 주거/통신 ·
  금융/보험 · 의료/건강 · 뷰티/미용 · 문화/예술 · 기타지출 · 주수입 · 기타수입)를 그대로 사용합니다.
- PIN 은 앱과 Apps Script 양쪽에만 있고, 저장소에는 어떤 값도 들어 있지 않습니다.
  PIN 을 아는 사람은 웹 앱 URL 로 시트에 기록을 추가할 수 있으니 URL·PIN 을 공유하지 마세요.
