# Google Play Service Account Setup

EAS Android submit requires a Google Service Account JSON key.

## 1. Enable API access in Play Console

- Open Play Console API access:
  - https://play.google.com/console/developers/api-access
- Link a Google Cloud project (existing or new).

## 2. Create service account in Google Cloud

- Service accounts page:
  - https://console.cloud.google.com/iam-admin/serviceaccounts
- Create a new service account for app release automation.
- Create and download a JSON key file.

Important: enable Google Play Android Developer API in the same GCP project.

- API enable link (from actual submission error):
  - https://console.developers.google.com/apis/api/androidpublisher.googleapis.com/overview?project=380952034390

## 3. Grant Play Console permissions

- In Play Console -> Users and permissions, invite the service account email.
- Recommended role: `Release Manager` (or equivalent upload/release permissions).
- Ensure app-level access includes `com.armin.mobile`.

Also ensure the service account has enough IAM/API permissions in GCP for Android Publisher API access.

## 4. Use it with EAS Submit

Interactive command (asks for local file path):

`npm run mobile:eas:android:submit:prod`

When prompted:

`Path to Google Service Account file: /absolute/path/to/your-key.json`

Current workspace fallback key:

- `../../firebase-service-account.json` (already wired in `apps/mobile/eas.json`)
- If you use a different key, update `apps/mobile/eas.json -> submit.production.android.serviceAccountKeyPath`.

## 5. Optional: CI/Automation

For CI, store the service account key securely and provide it to submit workflow.
Avoid committing JSON keys into git.
