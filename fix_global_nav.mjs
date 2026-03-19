import fs from 'fs';
let code = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');

code = code.replace(
  "const currentPath = location.pathname;",
  "const currentPath = location.pathname;\n    const isDrawingSkin = skin === 'drawing';"
);

code = code.replace(
  "preSearchPos.current = prev;", `preSearchPos.current = prev;
                // Move to near the top of the scren
                const targetY = isDrawingSkin ? 0 : -(window.innerHeight - 150);
                const currentNavHeight = wrapperRef.current?.offsetHeight || 60;
                const minAllowedY = -(window.innerHeight - currentNavHeight - 52);
                return isDrawingSkin ? prev : { x: 0, y: Math.max(targetY, minAllowedY) };`
);

code = code.replace(
  "const checkBounds = () => {\n            if (!wrapperRef.current) return;",
  "const checkBounds = () => {\n            if (isDrawingSkin) return;\n            if (!wrapperRef.current) return;"
);

code = code.replace(
  "const handleMouseDown = (e: React.MouseEvent) => {let code = fs.readFge
code = code.replace(
  "const currentPath = location.pathname;",
t.M  "const currentPat    "const currentPath = location.pathname;\ns);

code = code.replace(
  "preSearchPos.current = prev;", `preSearchPos.current = prev;"minHe  "preSearchPos.cur                  // Move to near the top of the scren
                           const targetY = isDrawingSkin ? 0 :                  const currentNavHeight = wrapperRef.current?.offsetHeight || 60,\                const minAllowedY = -(window.innerHeight - currentNavHeight - 5e(                return isDrawingSkin ? prev : { x: 0, y: Math.max(targetY, minAll",);

code = code.replace(
  "const checkBounds = () => {\n   gSkin && <div style={backgroundS
yle  "const checkBoundod  "const checkBounds = () => {\n            if (isDrawingSkin) return;\n     rc);

code = code.replace(
  "const handleMouseDown = (e: React.MouseEvent) => {let code = fs'} />"
);

fs.writeFileSync
'sr  "const handleMousNav.tsx', code);
