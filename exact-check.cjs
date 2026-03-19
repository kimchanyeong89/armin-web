const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');
console.log("1:", code.includes("background: isDrawingSkin ? '#FFFFFF'"));
console.log("2:", code.includes("boxShadow: isDrawingSkin"));
console.log("3:", code.includes("border: isDrawingSkin ? '3px solid #111111'"));
console.log("4:", code.includes("border: isAIMode ? 'none' : (isDrawingSkin ? '2px solid #111'"));
// print the true matches
// dropdown background:
const bgM = code.match(/background: [^}]+rgba\(248, 245, 238, 0\.98\)/g);
if (bgM) console.log("DBG:\n", bgM[0]);
// dropdown border
const bM = code.match(/border: [^}]+rgba\(0,0,0,0\.08\)'/g);
if (bM) console.log("DBORD:\n", bM[0]);
// dropdown shadow
const sM = code.match(/boxShadow: [^}]+rgba\(255,255,255,0\.7\)/g);
if (sM) console.log("DSHADOW:\n", sM[0]);
