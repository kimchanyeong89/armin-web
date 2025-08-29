#!/usr/bin/env node
// Find the latest ruleset for firestore and storage and create releases for them
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
    const client = new JWT({ email: sa.client_email, key: sa.private_key, scopes });
    const tok = await client.authorize();
    const token = tok.access_token;
    if(!token) throw new Error('no token');

    const listUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    const list = await listRes.json();
    if(!list.rulesets) throw new Error('no rulesets');

    // pick latest ruleset for each service
    const byService = {};
    for(const rs of list.rulesets){
      const services = (rs.metadata && rs.metadata.services) || [];
      for(const s of services){
        if(!byService[s] || new Date(rs.createTime) > new Date(byService[s].createTime)) byService[s] = rs;
      }
    }

    async function createReleaseFor(serviceKey, releaseId){
      const rs = byService[serviceKey];
      if(!rs) { console.log('no ruleset found for', serviceKey); return; }
      const rulesetName = rs.name;
      const url = `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`;
      const body = { releaseId, rulesetName };
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      console.log('create release', releaseId, 'status', res.status, data);
    }

    await createReleaseFor('cloud.firestore', 'firestore');
    await createReleaseFor('firebase.storage', 'storage');
    console.log('done');
  }catch(e){
    console.error('error', e.message || e);
    process.exit(1);
  }
})();
