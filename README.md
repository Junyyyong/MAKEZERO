# MAKEZERO

숫자를 이어서 **10**을 만드는 나무블록 퍼즐. 웹(TypeScript)으로 만들고 Capacitor로 감싸서 Google Play에 올립니다.

## 규칙

보드는 가로 9칸, 1~9 숫자가 읽기 순서(왼쪽→오른쪽, 위→아래)로 채워집니다. 처음엔 3줄로 시작합니다.

**지울 수 있는 조합**

| 개수 | 조건 | 점수 |
| --- | --- | --- |
| 2개 | 같은 숫자 **또는** 합이 10 | 10 |
| 3개 | 합이 정확히 10 | 30 |
| 4개 | 합이 정확히 10 | 70 |
| 5개 | 합이 정확히 10 | 150 |

**연결 조건** — 고른 타일은 순서대로 한 칸씩 이어져야 합니다. 두 타일이 이어지려면 둘 중 하나면 됩니다.

- 가로·세로·대각선으로 **맞닿아 있다** (지워진 칸이 사이에 있어도 위치만 붙어있으면 됨)
- **읽기 순서로 이웃이다** — 사이에 남아있는 숫자가 하나도 없을 때. 줄 끝에서 다음 줄 첫 칸으로도 이어집니다.

3개 이상은 이 조건을 체인으로 만족하면 됩니다. `1 → 2 → 3 → 2 → 2` 처럼 각 단계만 이어져 있으면 전부가 서로 붙어있을 필요는 없습니다.

**조작** — 타일을 하나씩 탭하면 조합이 성립하는 순간 자동으로 지워집니다. 길게 이으려면 손가락으로 **드래그**한 뒤 떼면 됩니다. 같은 숫자 2개는 탭하는 즉시 지워지므로, `3+3+4` 같은 조합은 드래그로 만들어야 합니다.

**그 외** — 한 줄이 전부 지워지면 그 줄은 사라지고 아래가 위로 당겨집니다. `＋`(6회)는 남은 숫자를 보드 끝에 그대로 복사해 붙여 교착을 풀고, `💡`(3회)는 지울 수 있는 조합 하나를 알려줍니다. 점수와 오늘 최고 기록은 브라우저/기기에만 저장되며 어디로도 전송되지 않습니다.

## 구조

```
src/game/     순수 게임 로직 (DOM 의존 없음, 테스트 대상)
  board.ts      보드 표현, 연결 판정, 줄 정리, ＋ 동작
  rules.ts      조합 성립 판정과 점수
  hint.ts       가능한 조합 탐색 (힌트 · 교착 감지)
  game.ts       게임 상태 전이
src/ui/       DOM 렌더러, 포인터 입력, 일일 기록 저장
android/      Capacitor가 생성한 네이티브 프로젝트
store/        Play 스토어 등록용 이미지
```

게임 규칙은 전부 순수 함수라 UI 없이 테스트됩니다.

```bash
npm install
npm run dev        # 개발 서버
npm test           # 규칙 테스트
npm run typecheck
npm run build      # dist/ 생성
```

## Android 빌드

### 1. 업로드 키 만들기 (최초 1회)

이 키를 잃어버리면 **같은 앱을 다시 업데이트할 수 없습니다.** 안전한 곳에 백업하세요.

```bash
keytool -genkeypair -v -keystore android/upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

`android/keystore.properties` 를 만듭니다 (이 파일과 `.jks` 는 `.gitignore` 로 커밋되지 않습니다):

```properties
storeFile=upload-keystore.jks
storePassword=<위에서 입력한 비밀번호>
keyAlias=upload
keyPassword=<위에서 입력한 비밀번호>
```

### 2. AAB 만들기

로컬에 Android SDK(Android Studio 또는 command line tools)가 있으면:

```bash
npm run android:bundle
# → android/app/build/outputs/bundle/release/app-release.aab
```

SDK를 설치하고 싶지 않다면 GitHub Actions 의 **Release AAB** 워크플로를 수동 실행하면 됩니다. 아래 4개 시크릿을 저장소에 등록해두세요.

| 시크릿 | 값 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 android/upload-keystore.jks` 결과 |
| `ANDROID_KEYSTORE_PASSWORD` | 키스토어 비밀번호 |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | 키 비밀번호 |

빌드된 `.aab` 는 워크플로 실행 결과의 아티팩트로 내려받습니다.

### 버전 올리기

`android/app/build.gradle` 의 `versionCode`(업로드마다 반드시 증가) 와 `versionName` 을 수정합니다.

## Play Console 체크리스트

- [ ] 개발자 계정 등록 ($25, 1회) 및 신분 확인
- [ ] **폐쇄 테스트: 테스터 12명이 연속 14일** — 2023-11-13 이후 만든 **개인 계정**에만 적용되며, 사업자 등록된 organization 계정은 면제. 게임이 완성돼도 여기서 최소 2주가 걸리므로 테스터를 미리 확보해 두세요.
- [ ] 앱 아이콘 512×512 → `store/play-icon-512.png`
- [ ] 그래픽 이미지 1024×500 → `store/play-feature-1024x500.png`
- [ ] 스크린샷 최소 2장 (휴대전화용, 세로)
- [ ] 개인정보처리방침 URL
- [ ] 데이터 보안(Data Safety) 양식 — 이 앱은 수집·전송하는 데이터가 없습니다
- [ ] 콘텐츠 등급 설문
- [ ] 앱 카테고리: 게임 > 퍼즐

### 알아둘 것

- **Target API** — 2026-08-31부터 신규 앱은 Android 16(API 36) 이상이어야 합니다. 이 프로젝트는 `android/variables.gradle` 에서 이미 36으로 설정되어 있습니다.
- **applicationId** — `io.github.junyyyong.makezero`. 스토어에 한 번 올리면 **영구히 변경 불가**하므로, 다른 값을 쓰려면 첫 업로드 전에 `capacitor.config.ts`, `android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml`, `MainActivity.java` 의 패키지 경로를 함께 바꾸세요.
- **INTERNET 권한** — 게임은 완전히 오프라인이지만 Capacitor 템플릿의 기본 권한이 남아 있습니다. 실기기에서 정상 동작을 확인한 뒤 `AndroidManifest.xml` 에서 제거하면 Data Safety 양식이 더 단순해집니다.
- **광고 없음** — AdMob SDK를 넣지 않았습니다. 나중에 붙이면 개인정보처리방침과 Data Safety 양식을 함께 갱신해야 합니다.
