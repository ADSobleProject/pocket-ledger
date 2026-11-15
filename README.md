# 포켓 가계부 (Pocket Ledger)

구글 스프레드시트를 그대로 두고 쓰는 **모바일 가계부 웹앱**입니다.
시트는 데이터베이스, 이 앱은 그 위의 입력·조회 화면입니다.

- 📱 폰에서 앱처럼 설치 (PWA · 홈 화면 추가)
- 🔒 시트 ID·비밀번호를 코드에 저장하지 않음 — 앱 첫 화면에서 **웹 앱 URL + PIN** 을 입력하면 이 기기에만 저장됩니다
- ✍️ 입력은 `시트1` 마지막 행에 한 줄 추가하는 것뿐, 수식 탭은 건드리지 않습니다
- 💍 결혼준비 지출은 따로 모아 생활비 집계에서 제외

```
.
├── index.html            # 앱 셸
├── style.css             # 모바일 퍼스트 스타일
├── app.js                # 화면 · 통신 (localStorage 에 URL/PIN 만 저장)
├── manifest.json         # PWA 매니페스트
├── sw.js                 # 오프라인 셸 캐시 (데이터는 캐시하지 않음)
├── icons/                # 앱 아이콘
└── apps-script/
    └── Code.gs           # 구글 시트에 붙여넣는 백엔드
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
    "transactions": [{ "date": "2026-11-15", "time": "12:30", "merchant": "...", "type": "출금", "amount": 12000, "method": "...", "category": "식사", "note": "", "mailId": "..." }]
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

## 참고

- 카테고리는 시트의 표준 13개(식사 · 카페/간식 · 생활/마트 · 온라인쇼핑 · 교통/차량 · 주거/통신 ·
  금융/보험 · 의료/건강 · 뷰티/미용 · 문화/예술 · 기타지출 · 주수입 · 기타수입)를 그대로 사용합니다.
- PIN 은 앱과 Apps Script 양쪽에만 있고, 저장소에는 어떤 값도 들어 있지 않습니다.
  PIN 을 아는 사람은 웹 앱 URL 로 시트에 기록을 추가할 수 있으니 URL·PIN 을 공유하지 마세요.
