const fs = require('fs');
const path = 'src/components/ExhibitionModal.tsx';
let code = fs.readFileSync(path, 'utf8');

const regex2 = /\{([^}]*?)Heart button to navigate to MyPage \*\/\}([\s\S]*?)<LoginButton \/>/i;
if (regex2.test(code)) {
    code = code.replace(regex2, '');
    fs.writeFileSync(path, code);
    console.log('Regex 2 matched and replaced!');
} else {
    console.log('Regex 2 failed');
}
