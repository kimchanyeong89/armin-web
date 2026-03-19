const fs = require('fs');
let hk = fs.readFileSync('scripts/upload-hk-paintings-to-r2.cjs', 'utf-8');
hk = hk.replace(/const data = JSON\.parse\(fs\.readFileSync\(filePath, 'utf8'\)\);/g, "let raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));\n    const data = raw.artworks || raw;");
hk = hk.replace(/fs\.writeFileSync\(filePath, JSON\.stringify\(data, null, 2\)\);/g, "fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));");
hk = hk.replace(/https:\/\/collections\.tepapa\.govt\.nz/g, "https://online-sammlung.hamburger-kunsthalle.de");
fs.writeFileSync('scripts/upload-hk-paintings-to-r2.cjs', hk);

let mu = fs.readFileSync('scripts/upload-mucem-to-r2.cjs', 'utf-8');
mu = mu.replace(/https:\/\/collections\.tepapa\.govt\.nz/g, "https://mucem.org");
fs.writeFileSync('scripts/upload-mucem-to-r2.cjs', mu);
console.log("Fixed files");
