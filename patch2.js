const fs = require('fs');
let content = fs.readFileSync('src/components/DrawingGlobe.tsx', 'utf-8');

const target1 = `            {/* ── Main: selected city expanded map or Overview map ── */}
            <div style={{ ...S.panelMap, overflow: 'hidden', position: 'relative' }}>`;

const startIdx = content.indexOf(target1);
if (startIdx === -1) { console.error('Start not found'); process.exit(1); }

const endText = `            {/* ── Footer ── */}`;
const endIdx = content.indexOf(endText, startIdx);
if (endIdx === -1) { console.error('End not found'); process.exit(1); }

const oldBlock = content.substring(startIdx, endIdx);

const newBlock = `            {/* ── Main: Regional Unified Map ── */}
            <div style={{ ...S.panelMap, overflow: 'hidden', position: 'relative' }}>
              {(() => {
                let viewW = 400, viewH = 400, viewCx = 100, viewCy = 100;
                
                if (isOverview) {
                  let minX = 0, maconst fs = require('fs') =let content = fs.readFilla
const target1 = `            {/* ── Main: selected city expanded mapX,             <div style={{ ...S.panelMap, overflow: 'hidden', position: 'relative' }}>`;

const stath
const startIdx = content.indexOf(target1);
if (startIdx === -1) { console.error('Star   if (startIdx === -1) { console.error('StaX 
const endText = `            {/* ── Footer ── */}`;
const endIdx  viconst endIdx = content.indexOf(endText, startIdx);
if (end= if (endIdx === -1) { console.error('End not found{

const oldBlock = content.substring(startIdx, endIdx);

const newBlock.id
const newBlock = `            {/* ── Main: Regi               <div style={{ ...S.panelMap, overflow: 'hidden', position: 'relat                {(() => {
                let viewW = 400, viewH = 400, viewCx = 100, Na                l* 6.5 +                
                if (isOverview) {
        .lx - tw);
                                       let minX = 0, m.const target1 = `            {/* ── Main: selected city expanded mapX,             
const stath
const startIdx = content.indexOf(target1);
if (startIdx === -1) { console.error('Star   if (startIdx === -1) { console.error('StaX 
const endText = Maxconst stlMinif (startIdx === -1) { console.error('Sta  const endText = `            {/* ── Footer ── */}`;
const endIdx  viconst endId2;const endIdx  viconst endIdx = content.indexOf(endTexlh / 2;if (end= if (endIdx === -1) { console.error('End not found{

consrb
const oldBlock = content.substring(startIdx, endIdx);

co  c
const newBlock..max(viewW, viewH);
                conconst newBlock =/                 let viewW = 400, viewH = 400, viewCx = 100, Na                l* 6.5 +                
                if (isOverview) {
        .lx - tw);ew                if (isOverview) {
        .lx - tw);
                                       let minX           .lx - tw);
             ty                   const stath
const startIdx = content.indexOf(target1);
if (startIdx === -1) { console.error('Star   if (startIdx === -1) { console.error('Staciconst star{rif (startIdx === -1)                    .dgconst endText = Maxconst stlMinif (startIdx === -1) { console.error('Sta  const endText  const endIdx  viconst endId2;const endIdx  viconst endIdx = content.indexOf(endTexlh / 2;if (end= if (endIdx === -1) { console.error  
consrb
const oldBlock = content.substring(startIdx, endIdx);

co  c
const newBlock..max(viewW, viewH);
                conconst newBlock =/       hovco .reg
co  c
const newBlock..max(viewW, viewH);
             cons</                conconst newBlock>
                if (isOverview) {
        .lx - tw);ew                if (isOverview) {
        .lx - tw);
                                         .lx - tw);ew             c        .lx - tw);
                                 
                                 ty                   const stath
const startIdx = contisconst startIdx = content.indexOf(target1);
i  if (startIdx === -1) { console.error('Sta =consrb
const oldBlock = content.substring(startIdx, endIdx);

co  c
const newBlock..max(viewW, viewH);
                conconst newBlock =/       hovco .reg
co  c
const newBlock..max(viewW, viewH);
             cons</                conconst newBlock>
                if (isOverview) {
        .lx - tw);ew                if (isOverview) {
        .lx - tw);
       tconstor
co  c
const newBlock..max(viewW, viewH);
             cons                  conconst newBlockheco  c
const newBlock..max(viewW, viewH);
           ivconset             cons</                                if (isOverview) {
        .lx - tw);fi        .lx - tw);ew            ci        .lx - tw);
                                 />                                                    
                                 ty               ty                              11" const startIdx = contisconst startIdx = content.indexOf(targeve ||i  if (startIdx === -1) { console.error('Sta =consrb
const oldBlciconst oldBlock = content.substring(startIdx, endIdx="
co  c
const newBlock..max(viewW, viewH);
          ameconssT                conconst newBlockawco  c
const newBlock..max(viewW, viewH);
             cons               cons</                                if (isOverview) {
        .lx - tw);fe        .lx - tw);ew                      .lx - tw);
       tconstor
co  c
const newBlg        tconstor
ctyco  c
const ne=>consSe             cons                  const newBlock..max(viewW, viewH);
           ivcons200" height="200" fill="transparent" />
           .lx - tw);fi        .lx - tw);ew            ci        .lx - tw);
                                                />                                    >
                                 ty               ty                              11" anconst oldBlciconst oldBlock = content.substring(startIdx, endIdx="
co  c
const newBlock..max(viewW, viewH);
          ameconssT                conconst newBlockawco  c
const newBlock..max(viewW, viewH);
* co  c
const newBlock..max(viewW, viewH);
          ameconssT     />cons            ameconssT              exconst newBlock..max(viewW, viewH);
             cons      e"             cons      "reg-text" f        .lx - tw);fe        .lx - tw);ew                      .lx - tw);
       tconstra       tconstor
co  c
const newBlg        tconstor
ctyco  c
const ne=>c  co  c
const neciconsitctyco  c
const ne=>consSe    const               ivcons200" height="200" fill="transparent" />
           .lx - tw);fi    xt           .lx - tw);fi        .lx - tw);ew            il                                                />                        s:                                 ty               ty                              11"   co  c
const newBlock..max(viewW, viewH);
          ameconssT                conconst newBlockawco  c
const newBlock..max(viewW, viewH);
* co  c
const new  cons            ameconssT               &const newBlock..max(viewW, viewH);
* co  c
const newBlock.Th* co  c
const newBlock..max(viewW  const             ameconssT     />cons                  cons      e"             cons      "reg-text" f        .lx - tw);fe        .lx - tw);ewel       tconstra       tconstor
co  c
const newBlg        tconstor
ctyco  c
const ne=>c  co  c
const neciconsitctyco  c
const ne=>co  co  c
const newBlg        tconsconsmmctyco  c
const ne=>c  co  cllconst nHoconst neciconsitcteconst ne=>consSe    con             .lx - tw);fi    xt           .lx - tw);fi        .lx - tw);ew              const newBlock..max(viewW, viewH);
          ameconssT                conconst newBlockawco  c
const newBlock..max(viewW, viewH);
* co  c
const new  cons            ameconssT               &const newBlock..max(viewW, viewH);
* co  c
const newBlock.Th* co            ameconssT               =const newBlock..max(viewW, viewH);
* co  c
const new  cons  * co  c
const new  cons          ovconst se* co  c
const newBlock.Th* co  c
const newBlock..max(viewW  const             ameconsedMuseumIdconst newBlock..max(vie  co  c
const newBlg        tconstor
ctyco  c
const ne=>c  co  c
const neciconsitctyco  c
const ne=>co  co  c
const newBlg        tconsconsmmctyco  c
const ne=>c  co  cllconst nHoconst neciconsitcteconst sconse=ctyco  c
const ne=>c  co  c
 const n  const neciconsitc  const ne=>co  co  c
conimconst newBlg      erconst ne=>c  co  cllconst nHoconst nec            ameconssT                conconst newBlockawco  c
const newBlock..max(viewW, viewH);
* co  c
const new  cons            ameconssT               &const newBlock..max(viewW, viewH);
* keconst newBlock..max(viewW, viewH);
* co  c
const new  consni* co  c
const new  cons            const   * co  c
const newBlock.Th* co            ameconssT               =const newBlock..max  const Se* co  c
const new  cons  * co  c
const new  cons          ovconst se* co  c
const newBlock.tyconst edconst new  cons          const newBlock.Th* co  c
const newBlock..nsconst newBlock..max(viepaconst newBlg        tconstor
ctyco  c
const ne=>c  co  c
const neciconsitctyco  c
const ne=usctyco  c
consuseum.cy} r="11"const nnoconst neciconsitc sconst neth="1.2" strokeDasharray="3.5 2.5" opconst ne=>c  co  cllconst nHoconst necnoconst ne=>c  co  c
 const n  const neciconsitc  const ne=>co  co  c
   const n  const n  conimconst newBlg      erconst ne=>c  co  cllco  const newBlock..max(viewW, viewH);
* co  c
const new  cons            ameconssT               &const newBlock..max(viewW, vta* co  c
const new  cons          erconst st* keconst newBlock..max(viewW, viewH);
* co  c
const new  consni* co  c
const new  co  * co  c
const new  consni* co  c
constr.length const new  cons          const newBlock.Th* co            ameconssHoconst new  cons  * co  c
const new  cons          ovconst se* co  c
const newBlock.ty2;
       const new  cons          const newBlock.tyconst edconst new  cons 
 const newBlock..nsconst newBlock..max(viepaconst newBlg        tconstor
c  ctyco  c
const ne=>c  co  c
const neciconsitctyco  c
const ne=usctyco  -const n -const ne           const ne=usctyco  c
con  consuseum.cy} r="1or const n  const neciconsitc  const ne=>co  co  c
   const n  const n  conimconst newBlg      erconst ne=>c  co  cllco  const newBlock..max(viewW, view     const n  const n  conimconst newBlg      erc  * co  c
const new  cons            ameconssT               &const newBlock..max(viewW, vta* co  c
constwiconst w}const new  cons          erconst st* keconst newBlock..max(viewW, viewH);
* co  c
const {i* co  c
const new  consni* co  c
const new  co  * co  c
const new  consn  const   const new  co  * co  c
'aconst new  consni* co(0.4, 0, 0.2, 1)', pointerEconst new  cons          ovconst se* co  c
const newBlock.ty2;
       const new  cons          const newB})const newBlock.ty2;
       const new  con         const new  x} const newBlock..nsconst newBlock..max(viepaconst newBlg        tconstorerc  ctyco  c
const ne=>c  co  c
const neciconsitctyco  c
const ne=usctycmoconst ne=>  const neciconsitc  const ne=usctyco  -constWcon  consuseum.cy} r="1or const n  const neciconsitc  const ne=>c     const n  const n  conimconst newBlg      erconst ne=>c  co  cllco  co  const new  cons            ameconssT               &const newBlock..max(viewW, vta* co  c
constwiconst w}const new  cons          erconst st* keconst newBlock  constwiconst w}const new  cons          erconst st* keconst newBlock..max(viewW, viewH);le* co  c
const {i* co  c
const new  consni* co  c
const new  co  * co  c
const new  cons  const e:const new  connoconst new  co  * co  c
,0const new  consn  con  'aconst new  consni* co(0.4, 0, 0.2, 1)', pointreconst newBlock.ty2;
       const new  cons          const newB})const newBlock.ty2;
                const new           const new  con         const new  x} const newBlock..ns  const ne=>c  co  c
const neciconsitctyco  c
const ne=usctycmoconst ne=>  const neciconsitc  const ne=usctyco  -constWcon  consu  const neciconsitc  const ne=usctycmoconst leconstwiconst w}const new  cons          erconst st* keconst newBlock  constwiconst w}const new  cons          erconst st* keconst newBlock..max(viewW, viewH);le* co  c
const {i* co  c
const new  consni* co  c
const new  co  * co  c
const new  cons  const e:const new  connoconst new  co  * co  c
,0cons  const {i* co  c
const new  consni* co  c
const new  co  * co  c
const new  cons  const e:const new  connoconst new  co  * co  c
,0const new  consn  con  'aconst new    const new  con  const new  co  * co  c
  const new  cons  cons  ,0const new  consn  con  'aconst new  consni* co(0.4, 0, 0.2, in       const new  cons          const newB})const newBlock.ty2;
                const new   in   obe.tsx', updated);
