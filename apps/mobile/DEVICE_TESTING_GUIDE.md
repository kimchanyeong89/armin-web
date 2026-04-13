# Device Testing Guide

This guide focuses on local virtual-device testing (iOS Simulator / Android Emulator).

## Build page vs visual runtime

- Expo EAS Build page does not provide cloud emulator UI playback.
- Build page provides artifacts, logs, and install links.
- Visual runtime testing is done on your local iOS Simulator, Android Emulator, or physical devices.

## 0. Preflight (required)

Run:

`npm run mobile:device:check`

If it fails:

- iOS: install full Xcode, then run
  - `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`
  - `xcodebuild -runFirstLaunch`
- Android: install Android Studio + SDK Platform-Tools, ensure `adb` is in PATH, and start an AVD.

## 1. Fresh cloud builds for virtual testing

If `build:run` says artifact expired, generate fresh builds:

- Android preview (no-wait): `npm run mobile:eas:android:preview:ci`
- iOS simulator preview (no-wait): `npm run mobile:eas:ios:sim:ci`

Latest builds created in this session:

- Android preview: https://expo.dev/accounts/kietzland/projects/armin-mobile/builds/f8aae07a-d37c-4dca-8370-6d5eb6823c12
- iOS simulator preview: https://expo.dev/accounts/kietzland/projects/armin-mobile/builds/64a83ace-70bd-405e-a2e0-1c73a9d6b188

## 2. Android emulator install

1. Start Android Emulator from Android Studio Device Manager.
2. Run:

`npm run mobile:eas:android:run:latest:local`

If you want to run local source code directly (not cloud artifact):

`npm run mobile:android:local`

## 3. iOS simulator install

1. Start iOS Simulator.
2. Run:

`npm run mobile:eas:ios:run:latest:local`

If you want to run local source code directly (not cloud artifact):

`npm run mobile:ios:local`

## 4. Real-device fallback while store workflows are paused

- iPhone with Expo Go:
  1. Install Expo Go from App Store.
  2. Run `npm run mobile:start`.
  3. Scan QR from terminal.

## 5. Smoke test checklist

- Login -> onboarding -> mypage
- Like/unlike in mypage recommendation list
- Recommendation refresh and rendering
- Route transitions and app relaunch stability
