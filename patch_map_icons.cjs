const fs = require('fs');
let code = fs.readFileSync('/Users/kietzsche/armin-web-main/src/components/GlobalSearchBar.tsx', 'utf8');

const mapBlock = "<div style={{ height: '320px', background: 'url(https://raw.githubusercontent.com/d3/d3-geo/master/img/world.png) center/cover no-repeat', opacity: 0.15, marginBottom: '30px', filter: 'invert(1)' }}></div>";
const oldMapBlock = "<div style={{ height: '320px', background: 'url(https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg) center/cover no-repeat', opacity: 0.15, marginBottom: '30px', filter: 'invert(1)' }}></div>";

const newMapBlock = `<div style={{ position: 'relative', height: '320px', marginBottom: '30px' }}>
                                    <div style={{ position: 'absolute', inset: 0, background: 'url(https://raw.githubusercontent.com/d3/d3-geo/master/img/world.png) center/cover no-repeat', opacity: 0.15, borderRadius: '4px' }}></div>
                                    <div style={{ position: 'absolute', top: '45%', left: '46%', width: '14px', height: '14px', background: '#b89c6a', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#000', fontWeight: 'bold' }}>22</div>
                                    <div style={{ position: 'absolute', top: '48%', left: '48%', width: '12px', height: '12px', background: '#b89c6a', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#000', fontWeight: 'bold' }}>7</div>
                                    <div style={{ position: 'absolute', top: '42%', left: '26%', width: '12px', height: '12px', background: '#b89c6a', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#000', fontWeight: 'bold' }}>5</div>
                                    <div style={{ position: 'absolute', top: '46%', left: '49%', width: '10px', height: '10px', background: '#b89c6a', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: '#000', fontWeight: 'bold' }}>3</div>
                                    <div style={{ position: 'absolute', top: '44%', left: '20%', width: '10px', height: '10px', background: '#b89c6a', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: '#000', fontWeight: 'bold' }}>2</div>
                                    {/* Icon Bottom Left Map */}
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" style={{ position: 'absolute', bottom: '16px', left: '16px' }}><path d="M2 20h20"/><path d="M2 20l4-12 4 8 6-14 6 18"/></svg>
                                </div>`;

code = code.replace(oldMapBlock, newMapBlock);
code = code.replace(mapBlock, newMapBlock);
fs.writeFileSync('/Users/kietzsche/armin-web-main/src/components/GlobalSearchBar.tsx', code);
console.log('Update finished!');
