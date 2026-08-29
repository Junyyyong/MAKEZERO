# 코드 구조

## 원칙

**게임 규칙은 화면을 모릅니다.** `src/core/` 는 DOM을 전혀 참조하지 않는 순수 함수 모음이고, 테스트도 브라우저 없이 돕니다. 화면은 `src/ui/` 가 담당하고, 밸런스와 스토리 같은 "기획 데이터"는 `src/content/` 로 분리했습니다.

이렇게 나눠두면 **스킨을 통째로 갈아엎어도 `core/` 는 한 줄도 안 건드립니다.**

## 폴더

```
src/
  core/                 규칙 엔진 — DOM 없음, 전부 테스트 대상
    types.ts              공용 타입 (Board, RunConfig, ...)
    rng.ts                시드 기반 난수 (테스트 재현용)
    board.ts              보드 생성 · 줄 정리 · 숫자 세기
    rules.ts              조합 판정과 점수          ← 규칙의 핵심
    solver.ts             가능한 조합 찾기 (힌트 · 막힘 감지)
    game.ts               모드별 상태 전이 (승패 · 타이머 · 별)
    tutorialRun.ts        튜토리얼 단계 진행
  content/              밸런스와 스토리 — 기획자가 만지는 곳
    stages.ts             스테이지 난이도 곡선 · 별 기준 · 모드 프리셋
    chapters.ts           챕터 · 캐릭터 · 대사
    tutorial.ts           튜토리얼 단계 (보드 · 안내문)
  ui/                   화면
    app.ts                화면 전환과 흐름 제어
    boardView.ts          타일 렌더링 · 탭/드래그 입력 · 화면 맞춤
    dom.ts                작은 헬퍼 (el, 별 문자열, 시계 포맷)
    storage.ts            진행 상황 저장 (localStorage)
    feedback.ts           효과음(WebAudio 합성) · 진동
    screens/
      titleScreen.ts        모드 선택
      pickerScreen.ts       챕터 목록 · 스테이지 그리드 · 스테이지 카드
      introScreen.ts        타임어택 · 무제한 시작 화면
      settingsScreen.ts     효과음 · 진동 스위치
      tutorialScreen.ts     직접 해보는 튜토리얼
      galleryScreen.ts      모은 그림
      hud.ts                점수 · 칩 · 타이머 · 힌트
      overlay.ts            결과 패널 · 규칙 패널
      storyScreen.ts        챕터 연출
    styles/
      index.css             나머지를 불러오는 진입점
      tokens.css            팔레트 · 리셋 · 화면 틀     ← 스킨은 여기부터
      title.css / game.css / picker.css / gallery.css
      story.css / tutorial.css / overlay.css
      motion.css            애니메이션과 모션 최소화 옵션
  main.ts               진입점
public/story/           캐릭터 이미지 (교체 대상)
docs/                   이 문서들
android/                Capacitor 네이티브 프로젝트
store/                  Play 스토어 등록용 이미지
```

## 의존 방향

```
ui  →  content  →  core
```

한 방향으로만 흐릅니다. `core/` 가 `ui/` 를 부르는 일은 없어야 합니다.

## 어디를 고쳐야 하나

| 하고 싶은 것 | 고칠 파일 |
| --- | --- |
| 조합 성립 조건 | `core/rules.ts` |
| 점수 | `core/rules.ts` 의 `SCORE_BY_COUNT` |
| 스테이지 난이도 | `content/stages.ts` 의 `EASIEST` / `HARDEST` |
| 무제한 블록 속도 | `content/stages.ts` 의 `ENDLESS_CONFIG.spawn` |
| 캐릭터 · 대사 | `content/chapters.ts` |
| 튜토리얼 내용 | `content/tutorial.ts` |
| 색·폰트 등 스킨 | `ui/styles/tokens.css` 부터 |
| 보드 화면 배치 | `ui/boardView.ts` 의 `layout()` |
| 작은 화면 대응 | `ui/styles/game.css` 하단 `@media (max-height: ...)` |

## 테스트

```bash
npm test          # 규칙 · 상태 · 밸런스
npm run typecheck
npm run dev       # 개발 서버
```

- `core/rules.test.ts` — 조합 판정, 보드 생성, 조합 탐색
- `core/game.test.ts` — 상태 전이, 타이머, 별
- `content/content.test.ts` — 챕터 데이터, 스테이지 곡선의 형태
- `content/balance.test.ts` — **봇으로 20 스테이지를 전부 플레이해서** 통과 못 할 스테이지가 없는지, 난이도가 실제로 우상향하는지 검사
- `content/pacing.test.ts` — 무제한 모드를 시간까지 시뮬레이션해서, 모든 판이 끝나는지·빨리 칠수록 오래 버티는지 검사
- `content/tutorial.test.ts` — 튜토리얼 보드마다 **정답이 정확히 하나뿐인지** 검사

화면 배치는 유닛 테스트로 못 잡습니다. 보드가 자기가 받은 공간을 재서 타일 크기를 정하기 때문입니다. `tests/browser/responsive.mjs` 가 기기 10종과 회전에서 보드가 잘리지 않는지 검사합니다 ([README](../tests/browser/README.md)).

```bash
npm run preview        # 다른 터미널
npm run test:layout
```

밸런스 숫자를 바꾸면 마지막 테스트가 먼저 알려줍니다.
