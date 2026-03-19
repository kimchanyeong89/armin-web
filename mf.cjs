const fs = require('fs');
const txt = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');
const t2 = txt.replace(/onOpenLightbox=\{\w*\?\.\w* \|\| \(\(\) => \{\}\)\} onNavigateToMuseum=\{\w*\?\.\w* \|\| \(\(\) => \{\}\)\} onOpenLightbox=\{\w*\?\.\w* \|\| \(\(\) => \{\}\)\} onNavigateToMuseum=\{\w*\?\.\w* \|\| \(\(\) => \{\}\)\}/g, 'onOpenLightbox={searchProps?.onOpenLightbox || (() => {})} onNavigateToMuseum={searchProps?.onNavigateToMuseum || (() => {})}');
fs.writeFileSync('src/components/GlobalNav.tsx', t2);
