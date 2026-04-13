# Mobile Incident Runbook

## Scope

This runbook covers production incidents for ARMIN mobile app flows:
- Authentication and onboarding
- Profile and likes persistence
- Recommendation fetch and rendering

## Severity Levels

- Sev-1: App unusable for majority of users (crash on launch, auth outage)
- Sev-2: Core feature degraded (likes/recommendation flow unavailable)
- Sev-3: Partial degradation (non-critical UI or intermittent failures)

## Initial Triage (First 15 minutes)

1. Identify impacted flow and platform (Android/iOS).
2. Confirm if issue reproduces on latest preview build.
3. Check Firebase auth/firestore connectivity and worker recommendation endpoint.
4. Capture logs, build number, and timestamp.

## Containment Actions

- Disable risky rollout or pause production submission pipeline.
- If recommendation endpoint is unstable, keep app usable by degrading to empty recommendations.
- If likes writes fail, show non-blocking UI and preserve read-only behavior.

## Root Cause Workflow

1. Reproduce with same account and app version.
2. Validate env and EAS profile used for the build.
3. Verify Firebase config values and project alignment.
4. Verify adapter behavior in:
   - apps/mobile/adapters/firebaseMobileAdapter.ts
   - apps/mobile/src/firebase.ts
   - apps/mobile/App.tsx

## Rollback Plan

- Promote last known-good internal build.
- Halt new submissions until validation checklist passes.
- Document rollback reason and impacted versions.

## Communication Template

- Incident summary
- Affected users/regions/platforms
- Current mitigation status
- Next update ETA
- Final postmortem link

## Exit Criteria

- Incident no longer reproducible in production build.
- Smoke checks pass for login/onboarding/mypage/likes/recommendation.
- Monitoring window completed without recurrence.
