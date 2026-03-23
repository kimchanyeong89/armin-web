const { execSync } = require('child_process');
const fs = require('fs');

const files = fs.readFileSync('deleted_data_files.txt', 'utf-8').split('\n').filter(Boolean);
const results = [];

for (const file of files) {
  try {
    const commit = execSync(`git log -1 --format="%H" -- "${file}"`).toString().trim();
    if (!commit) continue;
    const blobLine = execSync(`git ls-tree -r ${commit}~1 "${file}"`).toString().trim();
    if (!blobLine) continue;
    const blobHash = blobLine.split(/\s+/)[2];
    const size = execSync(`git cat-file -s ${blobHash}`).toString().trim();
    results.push({ size: parseInt(size, 10), file, commit });
  } catch (e) {
    // ignore
  }
}

results.sort((a, b) => b.size - a.size);
for (const { size, file, commit } of results) {
  console.log(`${(size / 1024 / 1024).toFixed(2)} MB\t${file} (deleted in ${commit})`);
}
