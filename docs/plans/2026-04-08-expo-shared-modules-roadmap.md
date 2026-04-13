# Expo + Shared Modules Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expo(React Native) 기반 Android/iOS 앱을 출시하고, 공통 로직을 shared 모듈로 분리해 웹/모바일에서 한 번의 수정으로 동시 반영되게 만든다.

**Architecture:** 기존 웹(Vite + React)을 즉시 깨지 않도록 유지하면서, `packages/shared`를 먼저 도입해 타입/순수 유틸/도메인 로직을 공통화한다. 이후 `apps/mobile`(Expo)에서 shared를 바로 소비하고, 웹도 점진적으로 shared를 참조하도록 전환한다.

**Tech Stack:** React 19, TypeScript, Vite, Expo SDK 53, React Native, Metro, Firebase

---

## 0) 원칙

- 기존 웹 배포 경로를 먼저 보존한다.
- 플랫폼 종속 코드(웹 DOM, RN 컴포넌트)는 shared에 넣지 않는다.
- shared는 순수 TypeScript(타입/함수/도메인 규칙)만 둔다.
- 각 단계마다 빌드/실행 검증 후 다음 단계로 진행한다.

## 1) 목표 구조

- `apps/web` (현재 루트 웹을 추후 이동, 1차에서는 루트 유지)
- `apps/mobile` (Expo 앱)
- `packages/shared` (공통 타입/유틸/도메인)

1차 구현에서는 웹 루트를 유지하고, `packages/shared`, `apps/mobile`만 추가한다.

## 2) 단계별 로드맵

### Phase 1: 골격 생성 (이번 작업 범위)

1. `packages/shared` 생성
2. shared 엔트리와 타입/유틸 모듈 작성
3. 웹에서 shared를 참조하는 브리지 파일(재-export) 적용
4. `apps/mobile` Expo 기본 골격 생성
5. 모바일이 shared를 참조하도록 설정
6. 웹 빌드 회귀 검증

**완료 기준**
- 웹 `npm run build` 성공
- 모바일 프로젝트 파일/설정이 준비되어 `npm install` 후 Expo 실행 가능한 상태
- shared에서 수정한 함수/타입이 웹과 모바일 양쪽에서 import 가능

### Phase 2: 공통 모듈 확장

1. 공통 타입(`Artwork`, 사용자 프로필, 추천 결과 타입) 확장
2. 공통 유틸(`imageProxy`, 문자열 정규화, 순위 계산) 이관
3. Firebase 공통 인터페이스 정의(포트/어댑터 패턴)
4. 웹/모바일에서 플랫폼 어댑터 구현

**완료 기준**
- 공통 도메인 로직 수정 시 웹/모바일 동시 반영
- 플랫폼 전용 파일은 adapter 레이어에만 존재

### Phase 3: 모바일 기능 이식

1. 로그인/온보딩/마이페이지 우선 이식
2. 이미지 로딩/캐시 최적화
3. 라우팅 구조 확정(Expo Router 또는 React Navigation)
4. 웹과 동일한 추천/좋아요 데이터 흐름 연결

**완료 기준**
- 핵심 사용자 시나리오(로그인→좋아요→마이페이지)가 모바일에서 동작

### Phase 4: 배포 파이프라인

1. EAS 프로젝트 초기화
2. Android/iOS 빌드 프로파일(dev/staging/prod) 분리
3. 환경변수/시크릿 주입 체계 정리
4. 스토어 메타데이터/아이콘/스플래시 정리
5. 내부 테스트 배포(TestFlight/Internal Testing)

**완료 기준**
- Android AAB, iOS IPA/TestFlight 배포 성공

### Phase 5: 운영 전환

1. 코드 오너십 정리(shared 우선)
2. 릴리즈 체크리스트 통합
3. 장애 대응(runbook) 문서화

**완료 기준**
- 기능 수정 시 shared 우선 수정 규칙이 정착
- 이중 수정(웹 따로, 모바일 따로) 빈도가 크게 감소

## 3) 기술 규칙 (한 번 수정으로 동기화)

- 공통 비즈니스 규칙은 무조건 `packages/shared`에 작성
- 웹/모바일은 shared를 소비만 하고, 중복 구현 금지
- 플랫폼 차이는 어댑터(`webAdapter`, `mobileAdapter`)로 분리
- 리뷰 체크: “이 로직이 shared로 가야 하는가?”를 PR마다 확인

## 4) 검증 체크리스트

### 웹
- `npm run build`
- 핵심 페이지 스모크 테스트(홈/검색/마이페이지)

### 모바일
- `cd apps/mobile && npm install`
- `npm run start` (Expo)
- Android/iOS 시뮬레이터 구동 확인

### 공통
- shared 함수 변경 후 웹/모바일 양쪽 import 확인

## 5) 리스크와 대응

- 리스크: 기존 웹 import 경로와 충돌
- 대응: 브리지 파일(재-export)로 점진 전환

- 리스크: Expo Metro가 워크스페이스 패키지 해석 실패
- 대응: `metro.config.js`에서 watch/resolver 경로 명시

- 리스크: Firebase 웹 전용 코드가 모바일에서 깨짐
- 대응: 공통 인터페이스 + 플랫폼별 구현 분리

## 6) 오늘 즉시 실행 항목

1. `packages/shared` 생성 및 `Artwork`, `imageProxy` 공통화
2. 웹 브리지 파일로 기존 import 호환 유지
3. `apps/mobile` Expo 골격 + shared 연결 설정
4. 웹 빌드 검증

---

## 실행 로그

- 2026-04-08: Phase 1 착수
- 2026-04-08: `packages/shared` 생성 및 `Artwork`, `imageProxy` 공통화 완료
- 2026-04-08: 웹 브리지(`src/types/Artwork.ts`, `src/utils/imageProxy.ts`) 연결 완료
- 2026-04-08: `apps/mobile` Expo 초기 골격 및 shared 연동 완료
- 2026-04-08: 웹 빌드 검증(`npm run build`) 통과
- 2026-04-09: Phase 2 시작 - 공통 타입(`Profile`, `Community`, `Recommendation`) shared 이관 완료
- 2026-04-09: Phase 2 진행 - Firebase 포트 타입(`packages/shared/src/firebase/types.ts`) 정의 완료
- 2026-04-09: Phase 2 진행 - 웹 어댑터(`src/adapters/firebaseWebAdapter.ts`) 추가 완료
- 2026-04-09: Phase 2 진행 - 모바일 어댑터 골격(`apps/mobile/adapters/firebaseMobileAdapter.ts`) 추가 완료
- 2026-04-09: Phase 2 진행 - 공통 유틸(`communityRank`) shared 이관 및 웹 브리지 완료
- 2026-04-09: Phase 2 진행 - 커뮤니티 프로필 타입 중복 제거(`CommentModal`, `CommunityDetail`) 완료
- 2026-04-09: Phase 2 진행 - App/Mypage 프로필 구독 로직을 웹 어댑터(`createFirebaseWebPort`) 기반으로 전환 완료
- 2026-04-09: Phase 2 검증 - 웹 빌드(`npm run build`) 재검증 통과
- 2026-04-09: Phase 2 진행 - 모바일 어댑터(`apps/mobile/adapters/firebaseMobileAdapter.ts`) Firestore 실구현 완료
- 2026-04-09: Phase 2 진행 - 추천 공통 타입(`RecommendationMode`, `RecommendationResponse`, `RecommendedArtwork`) 적용 확장 (`AICurationHubPage`, `ProductModal`)
- 2026-04-09: Phase 2 진행 - 추천 공통 응답 타입(`RecommendationResponse`)을 검색 추천 경로(`GlobalSearchBar`)에 적용
- 2026-04-09: Phase 2 검증 - 모바일 타입체크(`npm --prefix apps/mobile exec tsc --noEmit`) 통과
- 2026-04-09: Phase 2 진행 - 작품 좋아요 쓰기 경로를 웹 어댑터(`createFirebaseWebPort().likes`) 기반으로 통일 (`AICurationHubPage`, `GlobalSearchBar`)
- 2026-04-09: Phase 2 진행 - 검색 좋아요 상태에서 원본/정규화 ID 동시 인식(슬래시 ID 호환) 적용
- 2026-04-09: Phase 2 진행 - `AICurationHubPage` 상호작용 콜백의 명시적 `any` 타입 일부를 `RecommendationCardItem`/`unknown`으로 정리
- 2026-04-09: Phase 2 검증 - `AICurationHubPage`, `GlobalSearchBar` 진단 오류 없음 확인 및 웹 빌드 재검증 통과
- 2026-04-09: Phase 3 착수 - 모바일 `App.tsx`를 로그인→온보딩→마이페이지 플로우로 이식 (Firebase Auth + mobile adapter 연동)
- 2026-04-09: Phase 3 진행 - 모바일 화면 분리(`LoginScreen`, `OnboardingScreen`, `MyPageScreen`) 및 샘플 좋아요 토글 흐름 연결
- 2026-04-09: Phase 3 진행 - 모바일 Firebase 초기화 모듈(`apps/mobile/src/firebase.ts`) 분리, adapter에서 공용 사용
- 2026-04-09: Phase 3 검증 - 모바일 타입체크(`npm --prefix apps/mobile exec tsc --noEmit`) 및 웹 빌드 재검증 통과
- 2026-04-09: Phase 3 진행 - 모바일 마이페이지에 추천 흐름 연결(좋아요 ID 기반 `/recommend` 호출 및 추천 목록 표시)
- 2026-04-09: Phase 3 검증 - 추천 흐름 추가 후 모바일 타입체크 및 웹 빌드 재검증 통과
- 2026-04-09: Phase 3 진행 - 모바일 추천 목록에서 작품별 좋아요/해제 토글 연결 및 Firestore 반영
- 2026-04-09: Phase 3 진행 - 모바일 likes 어댑터가 문서 ID 대신 payload.artworkId 우선 반환하도록 보정(정규화 ID 의존도 완화)
- 2026-04-09: Phase 3 검증 - 추천 좋아요 토글 반영 후 모바일 타입체크 및 웹 빌드 재검증 통과
- 2026-04-09: Phase 4 준비 - 모바일 EAS 프로파일 스캐폴딩(`apps/mobile/eas.json`) 추가 (development/preview/production)
- 2026-04-09: Phase 4 준비 - 모바일 환경변수 템플릿(`apps/mobile/.env.example`) 및 README의 EAS 실행 가이드 보강
- 2026-04-09: Phase 3 안정화 - 레거시 좋아요 문서(payload.artworkId 누락) 대비 문서 ID 역규화 복구 로직 추가
- 2026-04-09: Phase 3 검증 - ID 복구 보정 후 모바일 타입체크(`npm --prefix apps/mobile exec tsc --noEmit`) 통과
- 2026-04-09: Phase 4 준비 - 모바일/루트 `package.json`에 EAS preview/production 빌드 스크립트 추가
- 2026-04-09: Phase 4 검증 - `package.json`/`apps/mobile/package.json` JSON 유효성 및 진단 오류 없음 확인
- 2026-04-09: Phase 4 진행 - 모바일 환경변수 점검 스크립트(`apps/mobile/scripts/check-mobile-env.mjs`) 추가
- 2026-04-09: Phase 4 진행 - EAS 빌드 스크립트에 환경변수 사전검증(`npm run env:check`) 연동
- 2026-04-09: Phase 4 진행 - 모바일 Firebase 초기화에서 환경변수 누락 시 dev fallback 경고/production 예외 처리로 안전장치 강화
- 2026-04-09: Phase 4 진행 - README에 env check 및 EAS secret 주입 명령 예시 추가
- 2026-04-09: Phase 4 진행 - 스토어 메타데이터 템플릿(`apps/mobile/store/metadata.template.json`) 추가
- 2026-04-09: Phase 4 진행 - 릴리즈 준비 점검 스크립트(`apps/mobile/scripts/check-release-readiness.mjs`) 및 루트 래퍼(`mobile:release:check`) 추가
- 2026-04-09: Phase 4 검증 - release check 스모크 테스트 통과(권장 스토어 에셋 미존재 경고 확인)
- 2026-04-09: Phase 4 진행 - 모바일 아이콘/스플래시/파비콘 플레이스홀더 에셋(`apps/mobile/assets/*`) 및 Expo 설정(`apps/mobile/app.json`) 연동
- 2026-04-09: Phase 4 검증 - strict 릴리즈 점검(`npm --prefix apps/mobile run release:check`) 통과
- 2026-04-09: Phase 5 준비 - 모바일 릴리즈 체크리스트(`apps/mobile/RELEASE_CHECKLIST.md`) 초안 추가
- 2026-04-09: Phase 5 준비 - 모바일 장애 대응 런북(`docs/ops/mobile-incident-runbook.md`) 초안 추가
- 2026-04-09: Phase 4 진행 - 로컬 `apps/mobile/.env` 구성 후 strict env check(`npm run mobile:env:check`) 통과
- 2026-04-09: Phase 4 진행 - EAS 스크립트를 `npx --yes eas-cli` 기반으로 보강(글로벌 설치 의존 제거)
- 2026-04-09: Phase 4 점검 - EAS 인증 상태 확인(`npm --prefix apps/mobile run eas:whoami`) 결과: Not logged in
- 2026-04-09: Phase 4 진행 - 루트 EAS 인증 확인 래퍼(`npm run mobile:eas:whoami`) 및 README 명령 안내 추가
- 2026-04-09: Phase 4 진행 - EAS 인증 점검 스크립트(`apps/mobile/scripts/check-eas-auth.mjs`) 및 로그인 래퍼(`mobile:eas:login`, `mobile:eas:auth:check`) 추가
- 2026-04-09: Phase 4 점검 - EAS auth check 스모크 실행 결과 인증 미완료 상태/후속 액션 안내 출력 확인
- 2026-04-09: Phase 4 진행 - EAS 브라우저 로그인 완료 및 계정 확인(`npm run mobile:eas:whoami`) 통과
- 2026-04-09: Phase 4 디버깅 - Android preview 빌드 Prebuild 실패 원인 확인(CRC 오류: 모바일 PNG 플레이스홀더 손상)
- 2026-04-09: Phase 4 조치 - `apps/mobile/assets/*.png` 유효 PNG로 재생성 및 `apps/mobile/.easignore`에 `android/`, `ios/` 제외 추가
- 2026-04-09: Phase 4 디버깅 - Bundle JavaScript 실패 원인 확인(`react-native-screens`/RN 코드젠 버전 불일치)
- 2026-04-09: Phase 4 조치 - Expo SDK 53 권장 버전 정렬(`expo-image@~2.4.1`, `react-native@0.79.6`, `react-native-safe-area-context@5.4.0`, `react-native-screens@~4.11.1`) 및 `expo export:embed` 로컬 통과
- 2026-04-09: Phase 4 검증 - Android preview 빌드 성공 (Build ID: `3d70eda9-5d38-4231-bdbb-56b2304474d4`)
- 2026-04-09: Phase 4 진행 - iOS preview 빌드 시작 확인, Apple Developer 로그인 단계(Apple ID 입력)에서 사용자 인증 필요 상태
- 2026-04-09: Phase 4 점검 - Apple 로그인 성공 후에도 Apple Developer Portal 응답 `You have no team associated with your Apple account`로 iOS 내부배포 자격증명 생성 차단
- 2026-04-09: Phase 4 진행 - 우회 검증용 iOS 시뮬레이터 프로필(`preview-simulator`) 및 실행 스크립트(`mobile:eas:ios:sim`) 추가
- 2026-04-09: Phase 4 디버깅 - 루트 `.easignore` 화이트리스트 설정으로 아카이브 누락(`apps/mobile/package.json` 없음) 발생 확인 및 제외목록 방식으로 복구
- 2026-04-09: Phase 4 검증 - iOS 시뮬레이터 preview 빌드 성공 (Build ID: `b09ee7db-d4e1-49ad-b3ae-ecb18d6d2fb7`)
- 2026-04-09: Phase 5 진행 - Android production 빌드 성공 및 AAB 생성 (Build ID: `618e6fbd-204d-4b15-b6e8-39a2456daffd`)
- 2026-04-09: Phase 5 진행 - Android/iOS production submit 스크립트 및 `eas.json` submit profile(안드로이드 draft 릴리즈) 추가
- 2026-04-09: Phase 5 점검 - Android submit 시 Google Service Account JSON 경로 입력 단계에서 대기(Play Console API access 최초 설정 필요)
- 2026-04-09: Phase 5 점검 - Android submit 비대화형 재검증 결과 서비스 계정 인식 성공, 단 GCP `androidpublisher.googleapis.com` 비활성으로 `PERMISSION_DENIED` 확인
- 2026-04-09: Phase 5 진행 - Google Play 서비스 계정/API 활성화 가이드 및 디바이스/시뮬레이터 테스트 가이드 문서 추가
- 2026-04-09: Phase 5 진행 - 최신 빌드 즉시 설치용 `eas build:run` 래퍼 스크립트(안드로이드/ios) 추가
- 2026-04-09: Phase 5 점검 - Android submit 재시도(`submission acd27fbe-939d-4e18-8fae-b5075a161f31`) 동일 실패, `androidpublisher.googleapis.com` 활성화 대기
- 2026-04-09: Phase 4 점검 - 로컬 가상기기 테스트 사전점검 결과 iOS는 Xcode 미설치(`xcodebuild`/`simctl` 불가), Android는 `adb` 미설치 확인
- 2026-04-09: Phase 4 진행 - 로컬 가상기기 사전점검 스크립트(`apps/mobile/scripts/check-device-tooling.mjs`) 및 루트 래퍼(`mobile:device:check`) 추가
- 2026-04-09: Phase 4 진행 - 아티팩트 만료 대응용 no-wait 테스트 빌드 스크립트(`mobile:eas:android:preview:ci`, `mobile:eas:ios:sim:ci`) 추가
- 2026-04-09: Phase 4 검증 - 신규 테스트용 빌드 갱신(Android: `f8aae07a-d37c-4dca-8370-6d5eb6823c12` 완료, iOS sim: `64a83ace-70bd-405e-a2e0-1c73a9d6b188` 진행중)
- 2026-04-09: Phase 5 진행 - shared 우선 규칙 정착을 위한 코드 오너십 정책 문서(`docs/ops/shared-code-ownership.md`) 추가
