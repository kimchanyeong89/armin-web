#!/usr/bin/env node
// Publish Firestore and Storage rules using Firebaserules REST API and a service account
// Usage: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json && node scripts/publish-rules.cjs
const fs = require('fs');
const {JWT} = require('google-auth-library');
const fetch = require('node-fetch');
(async ()=>{
  try{
    const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if(!saPath || !fs.existsSync(saPath)) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to the service account JSON path');
    const sa = JSON.parse(fs.readFileSync(saPath,'utf8'));
    const projectId = sa.project_id;
    const scopes = ['https://www.googleapis.com/auth/cloud-platform'];
    const client = new JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes
    });
    const tokenResp = await client.authorize();
    const token = tokenResp.access_token;
    if(!token) throw new Error('Failed to obtain access token');

    const firestoreRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artworks/{docId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}`;

    const storageRules = `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /images/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}`;

    async function createRuleset(sourceFiles){
      const url = `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`;
      const body = { source: { files: sourceFiles } };
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if(!res.ok) throw new Error(`Create ruleset failed: ${res.status} ${JSON.stringify(data)}`);
      return data.name; // projects/{projectId}/rulesets/{id}
    }

    async function createRelease(releaseId, rulesetName){
      const url = `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases?releaseId=${encodeURIComponent(releaseId)}`;
      const body = { rulesetName };
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if(!res.ok) throw new Error(`Create release failed: ${res.status} ${JSON.stringify(data)}`);
      return data;
    }

    console.log('Creating Firestore ruleset...');
    const fsRuleset = await createRuleset([{ name: 'firestore.rules', content: firestoreRules }]);
    console.log('Firestore ruleset created:', fsRuleset);
    console.log('Releasing Firestore rules...');
    const fsRelease = await createRelease('firestore', fsRuleset);
    console.log('Firestore release result:', fsRelease.name || fsRelease);

    console.log('Creating Storage ruleset...');
    const stRuleset = await createRuleset([{ name: 'storage.rules', content: storageRules }]);
    console.log('Storage ruleset created:', stRuleset);
    console.log('Releasing Storage rules...');
    const stRelease = await createRelease('storage', stRuleset);
    console.log('Storage release result:', stRelease.name || stRelease);

    console.log('Done. Rules deployed.');
  }catch(e){
    console.error('Error publishing rules:', e.message || e);
    process.exit(1);
  }
})();
