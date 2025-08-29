#!/usr/bin/env node
// Check current Firestore and Storage rules releases and print ruleset contents
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

    async function getRelease(releaseId){
      const url = `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/${releaseId}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      return { status: res.status, data };
    }

    async function getRuleset(rulesetName){
      const url = `https://firebaserules.googleapis.com/v1/${rulesetName}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      return { status: res.status, data };
    }

    const targets = ['firestore','storage'];
    for(const t of targets){
      console.log('---',t,'---');
      const r = await getRelease(t);
      console.log('release status', r.status);
      if(r.status===200 && r.data && r.data.rulesetName){
        console.log('rulesetName:', r.data.rulesetName);
        const rs = await getRuleset(r.data.rulesetName);
        if(rs.status===200 && rs.data && rs.data.source && rs.data.source.files){
          for(const f of rs.data.source.files){
            console.log('file:', f.name);
            console.log(f.content);
          }
        } else {
          console.log('failed to fetch ruleset', rs.status, rs.data);
        }
      } else {
        console.log('release fetch failed or no ruleset', r.data);
      }
    }
  }catch(e){
    console.error('error', e.message || e);
    process.exit(1);
  }
})();
