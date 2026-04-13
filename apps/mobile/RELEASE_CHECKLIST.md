# Mobile Release Checklist

## 1. Environment

- Run `npm run mobile:env:check`
- Verify EAS project secrets are set for all `EXPO_PUBLIC_FIREBASE_*` keys
- Confirm `APP_ENV` mapping in apps/mobile/eas.json

## 2. Build Readiness

- Run `npm run mobile:release:check`
- Replace placeholder assets in apps/mobile/assets before production submission
- Confirm bundle identifiers and package names in apps/mobile/app.json

## 3. Build Execution

- Android internal: `npm run mobile:eas:android:preview`
- iOS internal: `npm run mobile:eas:ios:preview`
- iOS simulator internal (fallback): `npm run mobile:eas:ios:sim`
- Android production: `npm run mobile:eas:android:prod`
- iOS production: `npm run mobile:eas:ios:prod`

## 3.1 Submit Execution

- First-time setup required for Android submit:
	- `apps/mobile/GOOGLE_PLAY_SERVICE_ACCOUNT_SETUP.md`
- Android production submit: `npm run mobile:eas:android:submit:prod`
- iOS production submit: `npm run mobile:eas:ios:submit:prod`

## 3.2 iOS Team Activation (if blocked)

- If EAS shows `You have no team associated with your Apple account`, follow:
	- `apps/mobile/APPLE_DEVELOPER_ACTIVATION.md`

## 4. Smoke Validation

- Login flow: Guest login -> onboarding -> mypage
- Like flow: sample like + recommendation like/unlike
- Recommendation flow: refresh and list rendering
- Crash check: app launch/route transitions

## 5. Store Submission Inputs

- Fill apps/mobile/store/metadata.template.json with real values
- Privacy policy/support URLs verified
- Version/bundle metadata reviewed

## 6. Post-release

- Monitor auth/profile/likes errors
- Validate recommendation API responses and latency
- Record release notes and rollback plan reference
