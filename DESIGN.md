# 노스팜CC 매출 — 장부 디자인 체계 (locked)

Hallmark full redesign, app scope, theme Almanac 체계 + 장부 팔레트. 2026-11-16 대시보드에서 확정, 모든 화면이 이 체계를 공유한다.
기준 화면(exemplar): `src/pages/DashboardPage.tsx`. 막히면 그 파일이 어떻게 했는지 본다.

## 재료
- **종이**: 크림색 `bg-paper`(화면 바탕), 한 단계 짙은 `bg-paper-2`(우물·알림·교대행), `bg-paper-3`(눌림·진행 막대 바탕). 인쇄된 장부 한 장 = `bg-sheet` + 위쪽 `border-t-2 border-ink` (화면의 주인공 하나에만).
- **잉크**: `text-ink`(제목·수치), `text-ink-2`(본문·행 이름), `text-muted`(라벨·캡션·단위).
- **괘선 두 종류만**: 가는 선 `border-rule`(행 구분), 굵은 선 `border-b-2 border-rule-2`(머리 아래 한 줄). 그보다 무거운 선 없음. 합계 행 아래만 `rule-double`(회계 이중 밑줄).
- **빨간 펜** `accent`: 선택된 탭, 미입력·경고, 감소(△), 차트에서 지목하는 한 점. 화면의 5% 이하. 채운 버튼에는 쓰지 않는다(삭제처럼 보임).
- **업장 견본**: `VENUE_SWATCH`(잉크 명도 5단계). 글자색으로 쓰지 않고 견본 사각형·띠그래프·차트에만.
- 모서리: 면은 0, 컨트롤은 `rounded-[2px]`. **그림자 없음, 둥근 카드 없음, 카드 안 카드 없음.**

## 글자
- IBM Plex Sans KR(본문·제목), 숫자는 `.num`(IBM Plex Mono, tabular-nums). 비교되는 숫자는 반드시 `.num` + 오른쪽 정렬. 단위(원·만원·명·일)는 `.num` 밖에 둬도 된다.
- 화면 제목 `text-xl font-semibold`, 구역 제목 `SectionHead`(text-base semibold + 굵은 괘선), 라벨 `text-xs text-muted`. 대문자 자간 라벨·eyebrow 금지. "·"로 이은 메타 문자열 금지(쉼표나 별도 칸으로).

## 부품 (재사용 필수)
- `src/components/Ledger.tsx`: `PageHeader`, `SectionHead`, `Stat`
- `src/lib/ledger.ts`: `BTN_FILLED`(주 버튼, 한 화면 하나), `BTN_OUTLINE`(보조), `BTN_FILLED_LG`(하단 저장), `INPUT`, `VENUE_SWATCH`, `VENUE_SERIES_TOKEN`, `formatDelta`(+n% / △n%), `readChartTokens`, `barOptions`, `tokenColor`
- 표: 머리 `border-b-2 border-rule-2`, `th` 는 `text-xs font-normal text-muted`, 행 `border-t border-rule`, 바깥 테두리 없음, 숫자 열 오른쪽 정렬.
- 알림/오류: `bg-paper-2 border-t-2 border-accent px-4 py-3`, 제목 `text-sm font-semibold text-accent`, 본문 `text-xs text-ink-2`. 오류는 `role="alert"`.
- 로딩: 그 자리 모양의 `bg-paper-2` 빈 막대 + "불러오는 중…" (애니메이션 없음).
- 컨트롤 높이 36–44px, 모든 `<button>`에 `type`, 입력칸에 `name`과 `aria-label` 또는 `<label>`, 16px 글자.

## 금지 (Hallmark Floor)
- 토큰 밖 색 값(`#hex`, `rgb()`, Tailwind 기본 팔레트 `gray-*`, `blue-*` 등) — 차트는 `readChartTokens()`/`tokenColor('--color-…')`로 읽는다. 카카오 버튼만 `bg-kakao text-kakao-ink`.
- `transition-all`, width/height/top/left 애니메이션 (진행 막대는 `.progress-fill` + `scaleX`).
- 이모지 아이콘(⚠️ 📊 등) — 글자로만.
- 도넛·파이 — 부분/전체는 가로 띠그래프, 비교는 표.
- 지어낸 수치·문구. 기존 수치·문구는 그대로 두고, 이모지·"·" 연결만 손본다.

## 바꾸지 않는 것
로직·상태·데이터 호출·핸들러·라우트·`name`/`id`/`key`/`type`/`href`·prop 이름. 마크업과 클래스만 바꾼다.
