const fs = require('fs');
let code = fs.readFileSync('src/pages/ArtistPage.tsx', 'utf8');

const returnRegex = /return \([\s\S]*\}\);\s*\}/;

const newReturn = `
  // Filter state
  const [activeFilter, setActiveFilter] = useState('All');

  const filterOptions = useMemo(() => {
    const filters = [{ label: 'All', count: artistArtworks.length }];
    
    // Get unique museums & categories with counts
    const museums = new Map();
    const categories = new Map();
    
    artistArtworks.forEach(aw => {
      if (aw.museum) {
        museums.set(aw.museum, (museums.get(aw.museum) || 0) + 1);
      }
      if (aw.mediumInfo || aw.medium) {
        let cat = 'Painting'; // simplifed
        const mediumStr = (aw.mediumInfo || aw.medium || '').toLowerCase();
        if (mediumStr.includes('draw') || mediumStr.includes('pencil') || mediumStr.includes('ink')) cat = 'Drawing';
        if (mediumStr.includes('sculpt') || mediumStr.includes('bronze')) cat = 'Sculpture';
        cateconst fs = require('fs');
let c(clet code = fs.readFileSy  
const returnRegex = /return \([\s\S]*\}\);\s*\}/;

const newRseu
const newReturn = `
  // Filter state
  const [ b[  // Filter state
({  const [activeFun
  const filterOptions = useMemo(() => {
    const filtergor    const filters = [{ label: 'All', c).    
    // Get unique museums & categories with counts
    const mum    e     const museums = new Map();
    const categoried    const categories = new MaMu    
    artistArtworks.forEach(ie   ])      if (aw.museum) {
        mu
         museums.set(a1]      }
      if (aw.mediumInfo || aw.medium) {
        let cat =ush(sorted        let cat = 'Painting'; // simpl m        const mediumStr = (aw.mediumInfo ed        if (mediumStr.includes('draw') || mediumStr.includes('pencil') || pu        if (mediumStr.includes('sculpt') || mediumStr.includes('bronze')) cat = 'Sculpture';
        cateconst fs = .s        cateconst fs = require('fs');
let c(clet code = fs.readFileSy  
const returnRegex =tilet c(clet code = fs.readFileSy  
cowoconst returnRegex = /return \([\il
const newRseu
const newReturn = `
  // Filter s) rconst true;
      let cat = 'Paint  const [ b[  //t ({  const [activeFun
  const|   const filterOptioLo    const filtergor    const filters =s(    // Get unique museums & categories with counts
    const m'i    const mum    e     const museums = new Map();es    const categoried    const categories = new M=     artistArtworks.forEach(ie   ])      if (aw.museum)ue        mu
         museums.set(a1]      }
      if (awtA         ;
      if (aw.mediumInfo || aw.="        let cat =ush(sorted        let <        cateconst fs = .s        cateconst fs = require('fs');
let c(clet code = fs.readFileSy  
const returnRegex =tilet c(clet code = fs.readFileSy  
cowoconst returnRegex = /return \([\il
const newRseu
const newReturn = `
  // Filter s) rconst true;
      let cat = 'Paint    let c(clet code = fs.readFileSy  
const returnRegex =tilet c(clconst returnRegex =tilet c(clet >
cowoconst returnRegex = /return \([\il
const newRseu
STconst newRseu
const newReturn = `
  /="const newRet_m  // Filter s) rco
       let cat = 'Paint  co    const|   const filterOptioLo    const filtergor    const       const m'i    const mum    e     const museums = new Map();es    const categoried    const categories = new M=     a a         museums.set(a1]      }
      if (awtA         ;
      if (aw.mediumInfo || aw.="        let cat =ush(sorted        let <        cateconst fs = .s        cateconst fs = re?                 </button>
          if (aw.mediumInfo  let c(clet code = fs.readFileSy  
const returnRegex =tilet c(clet code = fs.readFileSy  
cowoconst returnRegex = /return \([\il
const  const returnRegex =tilet c(clet   cowoconst returnRegex = /return \([\il
const newRseu
  const newRseu
const newReturn = `
  /e"const newRet    // Filter s) rcon       let cat = 'Paint    arconst returnRegex =tilet c(clconst returnRegex =tilet c(clrtcowoconst returnRegex = /return \([\il
const newRseu
STconst coconst newRseu
STconst newRseu
const ntwSTconst newR</const newReturIN  /="const newRet_         let cat = 'Paint  co    constrl      if (awtA         ;
      if (aw.mediumInfo || aw.="        let cat =ush(sorted        let <        cateconst fs = .s        cateconst fs = re?                 </button>
          if (aw.mediumInfo  let c(clet code = fs.readFileSy  
c        if (aw.mediumInfo</          if (aw.mediumInfo  let c(clet code = fs.readFileSy  
const returnRegex =tilet c(clet code = fs.readFileSy  
cowoconst returnRegex = /return ??const returnRegex =tilet c(clet code = fs.readFileSy  
cowoco  cowoconst returnRegex = /return \([\il
const  const r/*const  const returnRegex =tilet c(cleticonst newRseu
  const newRseu
const newReturn = `
  /e"const newRet    // Filt    const newRdiconst newReturma  /e"const newRet   const newRseu
STconst coconst newRseu
STconst newRseu
const ntwSTconst newR</const newReturIN  /="const newRet_         let cat = 'Paint  co    constrl      if (awt.dSTconst coco  STconst newRseu
const   const ntwSTcon        if (aw.mediumInfo || aw.="        let cat =ush(sorted        let <        cateconst fs = .s        cateconst fs =             if (aw.mediumInfo  let c(clet code = fs.readFileSy  
c        if (aw.mediumInfo</          if (aw.mediumInfo  let c(clet code = fs.readFileSasc        if (aw.mediumInfo</          if (aw.mediumInfo  let   const returnRegex =tilet c(clet code = fs.readFileSy  
cowoconst returnRegex = /return ??  cowoconst returnRegex = /return ??const returnRegex =UTcowoco  cowoconst returnRegex = /return \([\il
const  const r/*const  const returnRegextDconst  const r/*const  const returnRegex =tilrk  const newRseu
const newReturn = `
  /e"const newRet    ///section>

        {/* ─  /e"const newRet ??STconst coconst newRseu
STconst newRseu
const ntwSTconst newR</const newReturIN  /="const ne??Tconst newRseu
const ??onst ntwSTcon?onst   const ntwSTcon        if (aw.mediumInfo || aw.="        let cat =ush(sorted        let <        cateconst fs = .s        cateconst feyc        if (aw.mediumInfo</          if (aw.mediumInfo  let c(clet code = fs.readFileSasc        if (aw.mediumInfo</          if (aw.mediumInfo  let   const returnRegex =tilet c(clet code = fs.readFileSy  
uncowoconst returnRegex = /return ??  cowoconst returnRegex = /return ??const returnRegex =UTcowoco  cowoconst returnRegex = /return \([\il
const  const r/*const  const returnRegextDconst  const r/*const  co?onst  const r/*const  const returnRegextDconst  const r/*const  const returnRegex =tilrk  const newRseu
const newReturn = `
  /e"const {gconst newReturn = `
  /e"const newRet    ///section>

        {/* ─  /e"const newRet ??STconst coconsmp  /e"const newRet   
        {/* ─  /e"const newR__eSTconst newRseu
const ntwSTconst newR</const newReturIN  ?onst ntwSTcon?onst ??onst ntwSTcon?onst   const ntwSTcon        if (aw.mediumIreuncowoconst returnRegex = /return ??  cowoconst returnRegex = /return ??const returnRegex =UTcowoco  cowoconst returnRegex = /return \([\il
const  const r/*const  const returnRegextDconst  const r/*const  co?onst  const r/*const  const returnRegextDconst  const r/*const  const returnRegex =tilrk  const newRseu
const newReturn = `
  /e"const {gconst newReturn = `
  /el const  const r/*const  const returnRegextDconst  const r/*const  co?onst  const r/*const  const returnRegextDconst  const r/*const  consKeconst newReturn = `
  /e"const {gconst newReturn = `
  /e"const newRet    ///section>

        {/* ─  /e"const newRet ??STconst coconsmp  /e"const newRet   
        {/* ?y  /e"const {gconst    /e"const newRet    ///section-g
        {/* ─  /e"const newR           {/* ─  /e"const newR__eSTconst newRseu
const ntwSTconst newRelconst ntwSTconst newR</const newReturIN  ?ons  const  const r/*const  const returnRegextDconst  const r/*const  co?onst  const r/*const  const returnRegextDconst  const r/*const  const returnRegex =tilrk  const newRseu
const newReturn = `
  /e"const {gconst newReturn = `
  /el const  const r/*const  const returazconst newReturn = `
  /e"const {gconst newReturn = `
  /el const  const r/*const  const returnRegextDconst  const r/*const  co?onst  const r/*const                      <bu  /e"const {gconstti  /el const  const r/*const  co?<  /e"const {gconst newReturn = `
  /e"const newRet    ///section>

        {/* ─  /e"const newRet ??STconst coconsmp  /e"const newRet   
        {/* ?y  /e"const    /e"const newRet    ///section  
        {/* ─  /e"const newRon(        {/* ?y  /e"const {gconst    /e"const newRet    ///section-g
 ny        {/* ─  /e"const newR           {/* ─  /e"const newR__eS  const ntwSTconst newRelconst ntwSTconst newR</const newReturIN  ?ons  const  c  const newReturn = `
  /e"const {gconst newReturn = `
  /el const  const r/*const  const returazconst newReturn = `
  /e"const {gconst newReturn = `
  /el const  const r/*const  const returnRegextDconst  const r/*const  co?onst  const r/*const c  /e"const {gconstal  /el const  const r/*const  p>
   /e"const {gconst newReturn = `
  /el const  const r/*const    /el const  const r/*const  co    /e"const newRet    ///section>

        {/* ─  /e"const newRet ??STconst coconsmp  /e"const newRet   
        {/* ?y  /e"const    /e"const newRet    ///section  
        {/* ─  /e"const newRon(     tS
        {/* ─  /e"const newR is        {/* ?y  /e"const    /e"const newRet    ///section  
        {          {/* ─  /e"const newRon(        {/* ?y  /e"const ur ny        {/* ─  /e"const newR           {/* ─  /e"const n.log("Patched ArtistPage.tsx");
