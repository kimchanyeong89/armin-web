# Apple Developer Activation Checklist

If EAS shows `You have no team associated with your Apple account`, complete the checks below.

## 1. Confirm membership is active

- Apple Developer account page:
  - https://developer.apple.com/account
- Membership details page:
  - https://developer.apple.com/account/membership

Expected: Active membership with an Individual or Organization team.

## 2. Accept pending legal agreements

- App Store Connect agreements/tax/banking:
  - https://appstoreconnect.apple.com/agreements/

Expected: no pending agreements.

## 3. Verify team visibility in App Store Connect

- Users and Access:
  - https://appstoreconnect.apple.com/access/users

Expected: your Apple ID appears under the correct team.

## 4. If this is an Organization team

- Ask Account Holder to invite `cyk809@gmail.com` in Users and Access.
- Role recommendation for release work: `App Manager` (or higher).

## 5. Retry timing guidance

Apple membership/payment propagation can take several hours (sometimes up to 24h).

Retry command:

`npm run mobile:eas:ios:preview`

If still blocked after 24h:

1. Sign out/in at https://developer.apple.com/account
2. Sign out/in at https://appstoreconnect.apple.com
3. Retry EAS command
4. Contact Apple Developer Support with your Team ID
