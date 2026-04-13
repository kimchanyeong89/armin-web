const fs = require('fs');
const file = '/Users/kietzsche/armin-web-main/src/pages/AICurationHubPage.tsx';
let txt = fs.readFileSync(file, 'utf8');

const regex = /body: JSON\.stringify\(\{\s*id: sid,\s*limit: 15\s*\}\)/g;
if (regex.test(txt)) {
  txt = txt.replace(regex, "body: JSON.stringify({ id: sid, limit: 15, metadata: { name: likedData.find(d => d.id === sid)?.title || '' } })");
  fs.writeFileSync(file, txt);
  console.log("Success");
} else {
  console.log("Not found");
}
