const fs = require('fs');

const path = 'src/components/ExhibitionModal.tsx';
let code = fs.readFileSync(path, 'utf8');

const regex = /\{([^}]*?)Heart button to navigate to MyPage \*\/\}([\s\S]*?)<LoginButton \/>/i;

if (regex.test(code)) {
    code = code.replace(regex, '');
    fs.writeFileSync(path, code);
    console.log('Icons removed');
} else {
    // try index of
    const s = code.indexOf('{/* Heart button to navigate to MyPage */}');
    const e = code.indexOf('<LoginButton />');
    if (s > -1 && e > -1) {
        code = code.slice(0, s) + code.slice(e + '<LoginButton />'.length);
        fs.writeFileSync(path, code);
        console.log('Icons removed via slice');
    }
}
