# MAKEZERO

숫자를 이어서 **10**을 만드는 나무블록 퍼즐. 웹(TypeScript)으로 만들고 Capacitor로 감싸서 Google Play에 올립니다.

## 모드

| 모드 | 목표 | 도구 |
| --- | --- | --- |
| **스토리** | 남은 타일을 목표 이하로 줄여 별 획득 | 힌트 |
| **타임어택** | 60초 동안 최대 점수 | 없음 |
| **무제한** | 블록이 계속 차오르는 걸 버티기 | 힌트 3회 |

**무제한**은 생존 모드입니다. 절반쯤 찬 보드에서 시작해 몇 초마다 새 블록이 떨어지고, 버틸수록 간격이 짧아집니다. 빈 칸이 없어지면 끝.

스토리는 전 20 스테이지, 5개씩 4챕터. 보드가 5×8(40칸)에서 10×15(150칸)까지 커지고 별 기준이 점점 빡빡해집니다. 챕터의 마지막 스테이지를 깨면 캐릭터가 나오는 스토리 장면이 재생됩니다.

## 규칙 (요약)

> 숫자를 골라 **합이 정확히 10**이 되면 지워집니다. 2개부터 5개까지.

```
4+6      1+9      2+3+5      1+1+8      1+2+3+4      1+2+3+2+2
```

**위치는 상관없습니다.** 보드 어느 칸이든, 아무리 멀리 떨어져 있어도 함께 고를 수 있습니다. 같은 숫자끼리 지우는 규칙은 없습니다(3+3은 6).

점수는 개수로만 결정됩니다 — 2개 10점 · 3개 30점 · 4개 70점 · 5개 150점.

전체 규칙은 **[docs/RULES.md](./docs/RULES.md)** 를 보세요.

## 그 외 화면

- **튜토리얼** — 처음 실행하면 자동으로 나오는 5단계. 직접 눌러야 넘어가고, 건너뛸 수 있습니다
- **내 기록** — 모드별 최고 점수, 스테이지별 별, 모은 별 총합

## 문서

| 문서 | 내용 |
| --- | --- |
| [RULES.md](./docs/RULES.md) | 게임 규칙 전체 |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 폴더 구조와 "어디를 고쳐야 하나" |
| [DECISIONS.md](./docs/DECISIONS.md) | **왜 이렇게 되어 있는지.** 규칙 바꾸기 전 필독 |
| [BALANCE.md](./docs/BALANCE.md) | 난이도 조정 방법 |
| [CONTENT.md](./docs/CONTENT.md) | 캐릭터·대사·튜토리얼 편집 방법 |

`DECISIONS.md` 에는 직관과 반대라서 모르고 되돌리면 게임이 조용히 망가지는 것들이 정리되어 있습니다. 예를 들어 **보드를 랜덤 숫자로 뿌리면 수학적으로 클리어가 불가능**하고, **큰 조각을 많이 딜하면 오히려 쉬워집니다.**

## 개발

```bash
npm install
npm run dev        # 개발 서버
npm test           # 규칙 · 상태 · 밸런스 · 페이싱 · 튜토리얼 (78개)
npm run typecheck
npm run build      # dist/
npm run build:single   # 단일 HTML 파일 하나로 (dist-single/)
```

구조는 `src/core`(규칙 · DOM 없음) → `src/content`(밸런스 · 스토리) → `src/ui`(화면) 한 방향으로만 의존합니다. 자세한 건 [ARCHITECTURE.md](./docs/ARCHITECTURE.md).

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
