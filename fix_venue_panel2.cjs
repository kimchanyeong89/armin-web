const fs = require('fs');

let css = fs.readFileSync('src/components/InteractiveGlobeMap/InteractiveGlobe.css', 'utf8');

// Update .ig-venue-panel css to position right instead of center, but not off-screen
css = css.replace(/top: 50%;([\s\S]*?)left: 50%;/g, 'top: 50%;$1right: 24px;\n    left: auto;');
// remove transform: translate(-50%, -50%) if any, wait, Framer handles transform.

fs.writeFileSync('src/components/InteractiveGlobeMap/InteractiveGlobe.css', css);

let code = fs.readFileSync('src/components/InteractiveGlobeMap/VenuePanel.tsx', 'utf8');

// Add imports
if (!code.includes("getCityShape")) {
  code = code.replace(`import type { CityMarker, Venue, Theme } from "./types";`, `import type { CityMarker, Venue, Theme } from "./types";\nimport { getCityShape, computeMinimapDots } from "./cityMinimapHelper";`);
}

// remove x: "-50%" from motion.div
code = code.replace(/x:\s*"-50%",/g, 'x: 0,');

// replace header
const oldHeaderRegex = /<div className="ig-vp-headeconst fs = require('fs');

let css >\
let css = fs.readFileSyons
// Update .ig-venue-panel css to position right instead of center, but not off-screen
css =om:css = css.replace(/top: 50%;([\s\S]*?)left: 50%;/g, 'top: 50%;$1right: 24px;\n    leus// remove transform: translate(-50%, -50%) if any, wait, Framer handles transform.

fs.writeFil<d
fs.writeFileSync('src/components/InteractiveGlobeMap/InteractiveGlobe.css', css), f
let code = fsld" }}>
                    {city.city}
                  </div>
    
// Add imports
iv className={\`\${fg35} mt-1\`} style={{ fontSize: "11px" }}>
                    {city.  code = code.replace(`import type {  }

// remove x: "-50%" from motion.div
code = code.replace(/x:\s*"-50%",/g, 'x: 0,');

// replace header
const oldHeaderRegex = /<div className="ig-vp-headecoll="none" stroke="currentColor" strokeWidth="1.5">
          code = code.replace(/x:\s*"-50%",/12
// replace header
const oldHeaderRegex = /<d    </button>
       
let css >\
let css = fs.readFileSyons
// Update .ig-venue-panel css to pos   let css =ty// Update .ig-venue-    poscss =om:css = css.replace(/top: 50%;([\s\S]*?)left: 50%;/g, 'top: 50%;$1right: 24px;',
fs.writeFil<d
fs.writeFileSync('src/components/InteractiveGlobeMap/InteractiveGlobe.css', css), f
let code = fsld" }}>
                    {city.city}
                  </divx',fs.writeFile  let code = fsld" }}>
                    {city.city}
                  </div>
    nI                                       </div>
    
ce    

                }}
     iv className=                      {city.  code = code.replace(`import type  g
// remove x: "-50%" from motion.div
code = code.replace(/x:\s*";
 code = code.replace(/x:\s*"-50%",/ =
// replace header
const oldHeaderRegex = /<d   const oldHeaderR            code = code.replace(/x:\s*"-50%",/12
// replace header
const oldHeaderRegex = /<d    </buttofo// replace head)' }}>
                      <path 
                     
let css >\
let css = fs.readFi  let cs  let css =  // Update .ig-venu         fs.writeFil<d
fs.writeFileSync('src/components/InteractiveGlobeMap/InteractiveGlobe.css', css), f
let code = fsld" }}>
                    {city.city}
             fs.writeFile  let code = fsld" }}>
                    {city.city}
                  </divx',fs.
                                        <shape} 
                         {city.city}
                  </div>
  ,2                  </div>
    n      nI                 ba    
ce    

                }}
     iv className=  ce   
            iv cth="1" 
  // remove x: "-50%" from motion.div
code = code.replace(/x:\s*";
 code = code.repl  code = code.replace(/x:\s*";
 codein code = code.replace(/x:\s*{
// replace header
const oldHeaderRegd const oldHeaderRx]// replace header
const oldHeaderRegex = /<d    </buttofo// replace head)' }}>
               const oldHeaderReI                      <path 
                     
let css                ={dot.cy} 
                           let css =  fs.writeFileSync('src/components/InteractiveGlobeMap/InteractiveGlobe.css', css  let code = fsld" }}>" : "#111"}
                            strokeWidth="1.5"
                          /             fs.writeFile  let                      {city.city}
              vg                  </divx',fs.
                              /d                         {city = code.replace(old                  </div>
  ,2       h  ,2                  <ric auto if we can
// Oh wait, ce    

                }}
     iv er
    s.      iv classNames.            iv cth="1" 
ne  // remove x: "-50%" p/code = col.tsx', code);
