# 노스팜CC 매출 — 1안 클리어 디자인 체계 (locked)

Hallmark full redesign, app scope. 2026-11-17 요한이 `.hallmark/storyboard.html`의 1안 「클리어: 은행 앱처럼 익숙하게」를 골라 장부(Almanac) 체계를 대체했다. 모든 화면이 이 체계를 공유한다.
기준 화면(exemplar): `src/pages/DashboardPage.tsx`. 막히면 그 파일이 어떻게 했는지 본다.

## 문법 한 줄
화면마다 **큰 숫자 하나가 주인공**(바탕 위에 바로), 그 아래로 **흰 둥근 카드**가 근거를 받친다. 색은 **페어웨이 초록 한 색**, 경고·미입력·감소만 빨강.

## 재료 (토큰 이름은 장부 때 이름 유지 — 값과 뜻만 바뀜)
| 토큰 | 값 | 뜻 |
|---|---|---|
| `paper` | oklch(96.4% 0.004 250) | 화면 바탕 (연한 쿨그레이) |
| `paper-2` / `paper-3` | 94.6% / 91.8% | 눌림·오늘 행·로딩 막대 / 세그먼트 트랙·보조 버튼 면·진행 막대 바탕 |
| `sheet` | oklch(100% 0 0) | 카드·시트·키패드 키의 흰 면 |
| `ink` / `ink-2` / `muted` | 23% / 34% / 51% | 제목·수치 / 본문 / 라벨·캡션 (muted는 흰 면 5.7:1, 바탕 5.2:1) |
| `rule` / `rule-2` | 92.5% / 82% | 카드 안 가는 구분선 / 합계 위 한 단계 진한 선·빈 진행칸 |
| `control` | 65% | 입력칸 테두리 (흰 면 대비 3.2:1) |
| `brand` / `brand-soft` / `brand-ink` | oklch(51% 0.14 155) / 95% / 42% | 주 버튼·선택 탭·진행 막대 / 좋은 칩 배경 / 초록 글자 (흰 글자 on brand 5.3:1) |
| `accent` / `accent-soft` / `accent-ink` | oklch(57% 0.18 25) / 95.5% / 48% | 빨강 테두리·점 / 경고 배경 / **빨강 글자** (흰 면 7.2:1) |
| `series-1..5` | 초록 51/72/84% + 회색 80/88% | 업장 계열색: 클럽하우스, 스타트하우스, 동그늘집, 서그늘집, 고객사이용 |
| `kakao` / `kakao-ink` | #FEE500 / #1A1A1A | 카카오 복사 버튼 전용 (팔레트 밖 예외) |

- **`accent-ink`는 '빨강 글자'**다 (장부 때는 '빨강 위 글자'였다). 빨강 면 위 흰 글자가 필요하면 `bg-accent-ink text-sheet`.
- 빨강(`accent`)은 채운 주 버튼에 쓰지 않는다(삭제만 예외). 선택·주 동작은 늘 `brand`.
- 업장 견본색은 글자색으로 쓰지 않고 점(`rounded-full`)·띠그래프·차트에만.

## 모양
- **카드**: `CARD` = `bg-sheet rounded-[18px] px-4 py-4`. 그림자·테두리 없음, **카드 안 카드 금지**. 카드 안 표는 `border-t border-rule` 가는 선만, 합계 행 위만 `border-rule-2`.
- **화면 머리**: 바탕 위 `text-2xl font-bold` 제목, 위에 `text-sm text-muted` 노스팜CC. 괘선·이중 밑줄·`border-t-2` 시트 표식 없음.
- **주인공 숫자**: `text-4xl`~`text-[2.5rem] font-bold`, 바로 아래 칩 줄. 큰 금액은 `formatKoreanWon`(1억 2,845만원)으로 쓰고, 원 단위 정확값을 작은 글자로 함께 둔다.
- **컨트롤**: 버튼 44–48px `rounded-[14px]`, 입력칸 `rounded-[12px]` 흰 면 + `control` 테두리, 포커스 시 초록 테두리(`.field-focus`). 칩·월 알약은 `rounded-full`.
- **세그먼트 컨트롤** `Segmented`: 회색 트랙(`paper-3`) + 선택 칸 흰 면. 보기 전환·입력 방식 전환에 쓴다.
- **하단 탭**: 흰 바탕, 위 가는 선, 인라인 SVG 선 아이콘(홈·연필·달력·문서) + 글자. 선택은 `text-brand-ink font-bold`.

## 글자
- Pretendard Variable 한 가족(본문·제목·숫자). `index.html`에서 jsDelivr로 불러온다.
- 숫자는 `.num`(같은 글꼴 + `tabular-nums`). 비교되는 숫자는 `.num` + 오른쪽 정렬. 단위(원·만원·명·일)는 `.num` 밖에 둬도 된다.
- 라벨 `text-sm text-muted`, 본문 16px. 대문자 자간 라벨·eyebrow 금지. "·"로 이은 메타 문자열 금지(쉼표나 별도 칸으로).

## 부품 (재사용 필수)
- `src/components/Ledger.tsx`: `PageHeader`, `SectionHead`(카드 맨 위 굵은 제목 + 오른쪽 동작), `Stat`, `Segmented`
- `src/lib/ledger.ts`: `BTN_FILLED`(초록 주 버튼, 한 화면 하나), `BTN_OUTLINE`(이름은 그대로지만 이제 **회색 면 보조 버튼**), `BTN_FILLED_LG`(하단 저장 48px), `INPUT`, `CARD`, `ALERT`, `CHIP_GOOD`/`CHIP_BAD`/`CHIP_NEUTRAL`, `deltaChip`, `VENUE_SWATCH`, `VENUE_SERIES_TOKEN`, `formatDelta`(+n% / △n%), `readChartTokens`, `barOptions`, `tokenColor`
- 알림/오류: `ALERT`(연한 빨강 카드), 제목 `text-sm font-bold text-accent-ink`, 본문 `text-sm text-ink-2`. 오류는 `role="alert"`.
- 로딩: 그 자리 모양의 `rounded-full bg-paper-3`/`bg-paper-2` 빈 막대 + "불러오는 중…" (애니메이션 없음).
- 차트: 기본 막대 회색(`series-4`), 주말 연한 초록(`series-2`), 지목하는 한 막대 `brand`. 가마감 추세는 원가 3계열을 잉크·회색 명도 + 점선 무늬, 이익률만 초록.

## 새 기능 두 가지
- **입력 단계형** (`InputPage` + `components/VenueStepper.tsx` + `utils/keypad.ts`): 세그먼트 '한 곳씩 / 한눈에'(localStorage `northfarm_input_mode`). 한 곳씩은 업장 하나씩 큰 금액 칸 + 화면 키패드(1~9, 00, 0, 지움), 입력칸은 `inputMode="none"`이고 PC 키보드 타이핑·Enter(다음)도 받는다. 업장 5단계 뒤 마무리 단계에서 내장객·비고·저장. 두 방식 모두 같은 store·저장 로직.
- **월별 스코어카드** (`MonthlyPage` + `components/MonthlyScorecard.tsx` + `utils/scorecard.ts`): 세그먼트 '목록 / 스코어카드'(localStorage `northfarm_monthly_view`). 주(월요일 시작) × 요일 + 주 합계. 하루 목표(파) = `closing_target.sales_target`(천원) × 1000 ÷ 그 달 일수. 이상 초록 동그라미, 미달 회색 네모, 지난 날 미입력 빨간 점선 네모, 오늘 이후 빈 칸. 합계는 원 단위로 더한 뒤 마지막에 만원 환산.

## 금지 (Hallmark Floor)
- 토큰 밖 색 값(`#hex`, `rgb()`, Tailwind 기본 팔레트 `gray-*`, `blue-*` 등) — 차트는 `readChartTokens()`/`tokenColor('--color-…')`로 읽는다. 카카오 버튼만 `bg-kakao text-kakao-ink`.
- `transition-all`, width/height/top/left 애니메이션 (진행 막대는 `.progress-fill` + `scaleX`).
- 이모지 아이콘 — 글자나 인라인 SVG로만. (가마감 카톡 보고문 속 상태 기호는 화면 아이콘이 아니라 보고문 글자라서 유지하되, 소스에는 `✅` 같은 코드포인트로만 적는다.)
- 도넛·파이 — 부분/전체는 가로 띠그래프, 비교는 표.
- 지어낸 수치·문구. 기존 수치·문구는 그대로 두고, 이모지·"·" 연결만 손본다.

## 바꾸지 않는 것
로직·상태·데이터 호출·핸들러·라우트·`name`/`id`/`key`/`type`/`href`·prop 이름. 마크업과 클래스만 바꾼다(새 기능 두 가지는 예외로 추가).
