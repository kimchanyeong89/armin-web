const data = require('../public/data/mmca-collection.json');
let missingDims = 0;
let missingDept = 0;
let missingMedium = 0;
let onDisplayFalse = 0;
let onDisplayTrue = 0;

data.objects.forEach(o => {
    if (!o.dimensions || o.dimensions.trim() === '') missingDims++;
    if (!o.department || o.department.trim() === '') missingDept++;
    if (!o.medium || o.medium.trim() === '') missingMedium++;
    if (o.ondisplay === true) onDisplayTrue++;
    else onDisplayFalse++;
});

console.log(`Total: ${data.objects.length}`);
console.log(`Missing Dimensions: ${missingDims}`);
console.log(`Missing Department: ${missingDept}`);
console.log(`Missing Medium: ${missingMedium}`);
console.log(`OnDisplay True: ${onDisplayTrue}`);
console.log(`OnDisplay False: ${onDisplayFalse}`);
