# 핸드오프: 셔터 카운트 확인기 — "감정서(Certificate)" 리디자인

## 개요
기존 `shutter/` 프로젝트(`index.html` + `assets/css/style.css` + `assets/js/app.js`)의 UI를 **"감정서"** 콘셉트로 교체한다. 따뜻한 종이색 배경, 세리프 제목, 이중 괘선, 결과 카드의 회전된 도장(스탬프), 제조사 내구 기준 스케일이 핵심이다.
**파싱 로직(`exif.js`, `brands.js`)은 절대 수정하지 않는다.** UI(HTML/CSS/app.js 렌더링)만 바꾼다.

## 디자인 파일에 대해
`reference/` 안의 파일은 **HTML로 만든 디자인 레퍼런스**(동작하는 프로토타입)다. 그대로 배포하는 코드가 아니다.
작업은 이 디자인을 **기존 코드베이스의 방식(바닐라 HTML/CSS/JS, 빌드 없음)** 으로 재구현하는 것이다.
- 레퍼런스는 인라인 스타일로 작성돼 있다 → 실제 구현은 `style.css`의 클래스 + CSS 변수로 옮긴다.
- 레퍼런스를 브라우저로 열려면 `reference/` 폴더에 `lib/exif.js`, `lib/brands.js`를 복사해 두면 실제 파일 판독까지 동작한다(없어도 화면은 보인다).

## 충실도
**하이파이(Hi-fi).** 색상·타이포·간격·문구를 아래 값 그대로 픽셀 단위로 재현한다.

---

## 구조 변경 요약 (기존 → 신규)

| 영역 | 기존 | 신규 |
|---|---|---|
| 헤더 | sticky 흰 바, 좌측 h1 + 우측 pill 버튼 | 중앙 정렬 마스트헤드(굵은 상단선 → 메타 줄 → 큰 세리프 제목 → 부제 → 이중 괘선 → 중앙 텍스트 탭). **sticky 아님** |
| 폭 | `.wrap` 880px | **960px**, 좌우 padding 24px |
| 드롭존 | 파란 점선, 이모지 | 1px 실선 테두리 + 8px 안쪽 여백 + 1px 점선 내부 박스(이중 테두리). 이모지 제거 |
| 결과 카드 | 흰 카드, 한 줄 흐름 | 2단 그리드(좌: 번호/모델/정보표, 우: 카운트/스케일/메모) + 우상단 원형 도장 |
| 개인정보 안내 | 박스 | 드롭존 아래 가운데 정렬 한 줄 "※ …" |
| 지원 현황 표 | 라운드 카드 테이블 | 상하 2px 괘선의 고전적 표 |
| 지원 카메라 | 카드 그리드 | CSS multi-column(`column-width:260px`) + 세로 구분선 |
| FAQ | 카드형 details | 상단 2px 괘선, Q./A. 표기, 구분선만 |
| 다크모드 | `prefers-color-scheme` 있음 | **제거**(종이 콘셉트 단일 테마) |
| 이모지(📷🖼️🔒) | 사용 | **전부 제거** |

---

## 디자인 토큰

### 색상
```css
:root {
  --paper:   #f3efe6; /* 페이지 배경 */
  --card:    #fbf8f1; /* 결과 카드 배경 */
  --dz:      #f7f3ea; /* 드롭존 기본 배경 */
  --dz-hover:#ece6d9; /* 드롭존 hover */
  --dz-drag: #e6ddc9; /* 드롭존 dragover */
  --ink:     #1d1b17; /* 본문/굵은 괘선 */
  --ink-2:   #4a453c; /* 보조 본문(표 비고, 메모, FAQ 답) */
  --sub:     #6b655a; /* 캡션/라벨 */
  --line:    #cfc7b6; /* 얇은 구분선, 카드 테두리 */
  --dot:     #b8ae99; /* 정보표 점선 */
  --dash:    #8f8674; /* 드롭존 내부 점선 */
  --accent:  #8a2b1f; /* 옥스블러드: 활성 탭, No., 스케일 마커, 오류/불가 */
  --ok:      #2f5d3a; /* 판독 성공 / 지원 */
  --warn:    #9a6a12; /* 실험적 지원·미지원 / 일부 지원 */
  /* 스케일 밴드 */
  --band-1:  #e4dccb; /* 보급기 */
  --band-2:  #d6ccb6; /* 중급기 */
  --band-3:  #c7bba0; /* 플래그십 */
}
```
링크: `a { color:#8a2b1f } a:hover { color:#5e1c14 }`

### 타이포그래피
Google Fonts 로드:
```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700;900&family=Noto+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
```
- 본문: `'Noto Sans KR', sans-serif`, line-height 1.65
- 제목/강조(serif): `'Noto Serif KR', serif`
- 숫자·파일명·메타(mono): `'IBM Plex Mono', monospace`

| 용도 | 폰트 | 크기 | 굵기 | 기타 |
|---|---|---|---|---|
| 마스트헤드 제목 | Serif | `clamp(36px,6vw,60px)` | 900 | letter-spacing -.02em, line-height 1.15 |
| 부제 | Serif | 15px | 400 | color --sub |
| 상단 메타 줄 | Mono | 11px | 400 | letter-spacing .08em, --sub |
| 탭 | Serif | 15px | 700 | |
| 리드 문단 | Serif | 19px | 400 | line-height 1.75, 가운데, max-width 640px |
| 드롭존 코드 | Mono | 11px | 400 | letter-spacing .16em, --accent |
| 드롭존 제목 | Serif | `clamp(22px,3.4vw,28px)` | 700 | |
| 섹션 제목(h2) | Serif | 22px | 900 | 오른쪽으로 1px --ink 선이 flex:1로 이어짐 |
| 탭 페이지 제목(h2) | Serif | 32px | 900 | 가운데 |
| 카드 No. | Mono | 12px | 400 | letter-spacing .1em, --accent |
| 카드 모델명 | Serif | 26px | 900 | line-height 1.3, padding-right 100px(도장 공간) |
| 정보표 행 | Sans 14px / 값 Mono 13px | | | |
| 카운트 숫자 | Serif | `clamp(48px,7vw,68px)` | 900 | line-height 1, letter-spacing -.02em |
| "회" | Serif | 20px | 700 | 숫자와 baseline 정렬, gap 6px |
| 도장 문구 | Serif | 14px | 900 | line-height 1.2 |
| 메모(※) | Serif | 14px | 400 | --ink-2 |
| FAQ 질문 | Serif | 18px | 700 | "Q." 는 900 --accent |

### 간격 / 테두리
- 라운드 없음(border-radius 0). 도장만 50%.
- 그림자 없음.
- 주요 간격: 섹션 간 56px, 카드 간 24px, 카드 padding 32px, 카드 내부 그리드 gap `28px 40px`.

---

## 화면

### 공통 셸
```
<header> max-width 960, margin 0 auto, padding 28px 24px 0
  ├ 메타 줄: border-top 3px --ink, padding-top 8px, flex space-between, wrap
  │   좌 "BROWSER-ONLY · NO UPLOAD"  우 "SONY · NIKON · CANON · FUJIFILM · PENTAX"
  ├ h1 "셔터 카운트 감정서" (margin 18px 0 6px, 가운데)
  ├ 부제 "원본 사진 한 장으로 읽는 카메라의 사용 이력" (가운데)
  ├ 이중 괘선: margin-top 22px, height 5px, border-top/bottom 1px --ink
  └ nav: flex 가운데, gap 28px, padding 12px 0, border-bottom 1px --line
       버튼: 배경 없음, padding 4px 2px, border-bottom 2px
       활성 = color --accent + border-bottom --accent / 비활성 = color --ink + transparent
<main> max-width 960, padding 40px 24px 80px
<footer> max-width 960, padding 0 24px 40px
  ├ 이중 괘선(헤더와 동일)
  └ padding-top 14px, 가운데, 12px --sub
     "파일은 업로드되지 않습니다 · 오픈소스 EXIF 지식 기반(ExifTool 문서 참고) · 결과는 참고용입니다"
```
탭 전환 로직은 기존 `data-tab` 방식 유지. 활성 클래스 스타일만 위처럼.

### 1) 확인하기 탭
1. **리드 문단** (margin 0 auto 28px):
   "카메라에서 나온 **원본 JPG 또는 RAW 파일**(ARW · NEF · PEF · RAF · CR2 · CR3 · DNG)을 올리면 촬영 시점의 셔터 작동 횟수를 보여줍니다."
2. **드롭존** (`role="button" tabindex="0"`)
   - 바깥: border 1px --ink, padding 8px, background --dz, cursor pointer, `transition: background .15s`
   - hover: --dz-hover / `.dragover`: --dz-drag
   - 안쪽: border 1px dashed --dash, padding 52px 24px, flex column 가운데, gap 10px
     - 코드 줄: 기본 "ORIGINAL FILES ONLY" / 드래그 중 "놓으면 바로 감정합니다"
     - 제목: "원본 파일을 이곳에 놓거나, 눌러서 선택하세요"
     - 보조(13px --sub): "여러 파일 동시 가능 · 편집/리사이즈된 파일은 정확하지 않을 수 있음"
3. **개인정보 한 줄** (margin-top 12px, 가운데, 13px --sub):
   "※ 파일은 어디에도 업로드되지 않습니다. 모든 분석은 브라우저 안에서만 이루어지며, 파일 앞부분 몇 MB만 읽습니다."
4. **감정 결과** (결과가 1건 이상일 때만 표시, margin-top 56px, flex column gap 24px)
   - 헤더 행: h2 "감정 결과" + flex:1 1px 선 + 우측 Mono 12px "총 N건"
   - **결과 카드** (`article`): position relative, background --card, border 1px --line, padding 32px, overflow hidden,
     `display:grid; grid-template-columns: repeat(auto-fit, minmax(min(100%,300px),1fr)); gap:28px 40px`
     - **도장**(우상단 absolute top/right 22px): 96×96 원, border 2px {tone}, `transform: rotate(-10deg)`, opacity .9
       → 안쪽 84×84 원, border 1px {tone}, 문구 가운데 {tone} 색
     - **좌측 열** (flex column gap 14px)
       - "No. 01" — 번호는 오래된 결과가 01(목록 길이 − 인덱스, 2자리 0패딩)
       - 모델명 (`make + model`, 없으면 "기종 정보 없음")
       - 정보표: 행마다 flex space-between, padding 8px 0, border-bottom 1px dotted --dot
         - 파일 / 형식(`parsed.container`) / 촬영 일시(`parsed.dateTime`) — 값 없으면 "—"
         - `r.extras` 가 있으면 같은 행 형식으로 추가 (값은 `toLocaleString('ko-KR')`)
     - **우측 열** (flex column, justify-content flex-end, gap 14px)
       - `r.count != null` 일 때:
         - 라벨 13px --sub: `r.countLabel || "셔터 카운트"`
         - 숫자 + "회"
         - **내구 기준 스케일** (margin-top 6px)
           - 캡션 12px --sub "제조사 내구 기준 대비 위치", margin-bottom 8px
           - 트랙(height 28px, relative): 가로 기준선 top 13px 1px --ink
             - 밴드(top 8px, height 11px): 보급기 left 10% width 10% --band-1 / 중급기 left 30% width 10% --band-2 / 플래그십 left 60% width 40% --band-3
             - 마커: left = `min(100, count/500000*100)%`, 2px × 28px --accent, translateX(-1px)
           - 라벨 행(height 18px, relative, 11px --sub): left 10% "보급기 5~10만", 30% "중급기 15~20만", 60% "플래그십 30~50만"
           - 스케일 최대값 = **500,000회** 고정 (FAQ의 내구 기준 수치 근거)
       - `r.notes` 각각: Serif 14px --ink-2, border-top 1px --line, padding-top 12px, 앞에 "※ "
   - 새 결과는 목록 **맨 위**에 추가(기존 `prepend` 유지). 분석 중에는 도장 문구 "분석 중"(tone --sub).
5. **브랜드별 지원 현황** (margin-top 56px)
   - 헤더 행: h2 + 선 (margin-bottom 12px)
   - 표: width 100%, border-collapse, border-top/bottom 2px --ink, 14px. 모바일에서 `overflow-x:auto` 래퍼
   - th: Serif, padding 10px 12px, border-bottom 1px --ink, 좌측 정렬
   - td: padding 10px 12px, border-bottom 1px --line(마지막 행 없음). 브랜드 700, 비고 --ink-2
   - 지원 열: "지원" --ok 700 / "일부 지원" --warn 700 / "불가" --accent 700, `white-space:nowrap`
   - 행 내용은 기존 index.html 문구 그대로.

### 도장(스탬프) 상태 매핑 — app.js `renderResult`
| r.status | 문구 | tone |
|---|---|---|
| `ok` | 판독 성공 | --ok |
| `warn` | 실험적 지원 | --warn |
| `unsupported` | 미지원 | --warn |
| 그 외 | 판독 실패 | --accent |
| 예외(renderError) | 오류 | --accent (모델명 "읽기 실패", 메시지는 ※ 메모로) |
| 분석 중 | 분석 중 | --sub |

### 2) 지원 카메라 탭
- h2 "지원 카메라 목록"(가운데, margin 0 0 8px)
- 설명(가운데, --sub, max-width 560px, margin 0 auto 36px): 기존 문구 그대로
- 컨테이너: `column-width:260px; column-gap:40px; column-rule:1px solid var(--line)`
- 카테고리 블록: `break-inside:avoid; margin-bottom:28px`
  - 카테고리명: Serif 18px 900, border-bottom 1px --ink, padding-bottom 4px
  - 서브그룹명: 12px 700 --accent, margin-top 12px
  - 모델: 14px --ink-2, padding 2px 0 (불릿 없음)
- 데이터는 기존 `supportedSummary()` 그대로.

### 3) FAQ 탭
- h2 "자주 묻는 질문"(가운데, margin-bottom 32px)
- 목록: max-width 720px 가운데, border-top 2px --ink
- `details`: border-bottom 1px --line, 배경/라운드/그림자 없음. 첫 항목만 `open`
  - summary: 마커 숨김(`list-style:none` + `::-webkit-details-marker{display:none}`), padding 18px 0, flex gap 14px baseline
    "Q."(Serif 900 --accent) + 질문(Serif 18px 700)
  - 답: flex gap 14px, padding 0 0 20px — "A."(Serif 900 --sub) + p(15px --ink-2, margin 0)
- 질문/답 문구는 기존 index.html 그대로(`<b>` 강조는 유지해도 됨).

---

## 인터랙션
- 드롭존 클릭/Enter/Space → 파일 선택(기존 로직 유지)
- dragover/dragenter → `.dragover` 추가(배경 --dz-drag, 코드 문구 변경) / dragleave·drop → 제거
- hover: 드롭존 배경 --dz-hover
- 탭 전환: 즉시(애니메이션 없음)
- 반응형: 카드 그리드는 auto-fit으로 좁은 화면에서 1열. 헤더 메타 줄은 wrap. 표는 가로 스크롤.

## 상태
기존과 동일(탭, 결과 목록). 추가 상태 없음. 드롭존 코드 문구 변경만 `.dragover` 클래스에 맞춰 `textContent` 교체.

## 파비콘
`assets/` 의 파일을 사이트 루트(`index.html` 옆)에 복사하고 `<head>` 에 추가:
```html
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
```
디자인: 종이색(#f3efe6) 라운드 사각 + 옥스블러드(#8a2b1f) 이중 도장 링 + 중앙 검정(#1d1b17) 육각형(조리개).

## 파일
- `reference/Shutter B — Certificate.dc.html` — 디자인 레퍼런스(동작 프로토타입). 모든 수치의 원본.
- `reference/support.js` — 레퍼런스 실행용 런타임(구현에는 불필요).
- `assets/favicon.svg`, `assets/favicon-32.png`, `assets/apple-touch-icon.png` — 파비콘.

## Claude Code 작업 지시 요약
1. `assets/css/style.css` 를 위 토큰/스타일로 재작성(다크모드 블록 제거).
2. `index.html` 헤더·드롭존·개인정보 안내·표·FAQ 마크업을 위 구조로 교체, 이모지 제거, 폰트·파비콘 `<link>` 추가.
3. `assets/js/app.js` 의 `renderResult` / `renderError` / 지원 목록 렌더를 새 카드 구조(도장·정보표·스케일)로 변경. **`exif.js`, `brands.js` 는 수정 금지.**
4. `test/run-tests.mjs` 가 계속 통과하는지 확인.
