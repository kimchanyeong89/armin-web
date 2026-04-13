# ARMIN Mobile (Expo)

## 1. Install

From repository root:

npm --prefix apps/mobile install

## 2. Run

From repository root:

npm run mobile:start

or directly:

npm --prefix apps/mobile run start

## 3. Platform build (local)

npm run mobile:android
npm run mobile:ios

## 4. Shared module contract

This app consumes shared logic from:

- ../../packages/shared/src/types
- ../../packages/shared/src/images

When shared code changes, both web and mobile should pick up the same logic.

## 5. Environment variables

Copy `.env.example` to `.env` in `apps/mobile` and fill Firebase values.

Validation command:

`npm run mobile:env:check`

Local virtual-device tooling check:

`npm run mobile:device:check`

Release readiness command:

`npm run mobile:release:check`

Store metadata template:

`apps/mobile/store/metadata.template.json`

Release checklist:

`apps/mobile/RELEASE_CHECKLIST.md`

Apple Developer activation guide:

`apps/mobile/APPLE_DEVELOPER_ACTIVATION.md`

Google Play service account setup:

`apps/mobile/GOOGLE_PLAY_SERVICE_ACCOUNT_SETUP.md`

Device testing guide:

`apps/mobile/DEVICE_TESTING_GUIDE.md`

Note about Expo build pages:

- Build pages provide logs/artifacts/install links, not cloud visual emulator playback.
- Visual testing happens on local iOS Simulator / Android Emulator / physical devices.

Incident runbook:

`docs/ops/mobile-incident-runbook.md`

Shared code ownership policy:

`docs/ops/shared-code-ownership.md`

Note: `apps/mobile/assets/*` currently contains placeholder 1x1 PNG files for pipeline validation.
Replace with production-grade assets before store submission.

EAS secret examples:

`eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_API_KEY --value "<value>"`

`eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value "<value>"`

`eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value "<value>"`

`eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --value "<value>"`

`eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "<value>"`

`eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_APP_ID --value "<value>"`

## 6. EAS build profiles

`apps/mobile/eas.json` includes:

- `development` (internal + dev client)
- `preview` (internal staging)
- `production` (store release)

Example commands:

`npx eas build --platform android --profile preview`

`npx eas build --platform ios --profile production`

Root wrapper scripts:

`npm run mobile:eas:login`

`npm run mobile:eas:auth:check`

`npm run mobile:eas:whoami`

`npm run mobile:eas:android:preview`

`npm run mobile:eas:android:preview:ci`

`npm run mobile:eas:ios:preview`

`npm run mobile:eas:ios:sim`

`npm run mobile:eas:ios:sim:ci`

`npm run mobile:eas:android:prod`

`npm run mobile:eas:ios:prod`

`npm run mobile:eas:android:submit:prod`

`npm run mobile:eas:android:submit:prod:ci`

`npm run mobile:eas:ios:submit:prod`

`npm run mobile:eas:android:run:latest`

`npm run mobile:eas:ios:run:latest`

Local path-forced wrappers (recommended on this machine):

`npm run mobile:eas:android:run:latest:local`

`npm run mobile:eas:ios:run:latest:local`

Run local source directly on simulators:

`npm run mobile:android:local`

`npm run mobile:ios:local`

EAS auth requirement (must be done by you):

1. Run `npm run mobile:eas:login` once and complete Expo account login.
2. Verify with `npm run mobile:eas:auth:check`.

Alternative for headless/CI:

- set `EXPO_TOKEN` and run `npm run mobile:eas:auth:check`.

If iOS build shows `no team associated`, complete activation checks in:

- `apps/mobile/APPLE_DEVELOPER_ACTIVATION.md`

## 7. Next phase

- connect EAS credentials and store submission metadata
- add crash/error analytics and release channel strategy
- complete mobile/web feature parity for recommendation interactions
