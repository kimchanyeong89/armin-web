const fs = require('fs');
const content = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');

const startIdx = content.indexOf('    if (isDrawingSkin) {');
if (startIdx === -1) process.exit(1);

const returnIdx = content.indexOf('    return (', startIdx + 1);

const newContent = content.substring(0, startIdx) + content.substring(returnIdx);

fs.writeFileSync('src/components/GlobalNav.tsx', newContent);
console.log('done');
