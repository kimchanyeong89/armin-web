const { exhibitions } = require('./src/data/exhibitions.js');
const missingSlug = exhibitions.filter(e => e.slug === undefined || e.slug === null || e.slug === '');
console.log('Missing slug:', missingSlug.map(e => e.id));
