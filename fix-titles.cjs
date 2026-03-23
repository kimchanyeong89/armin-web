const fs = require('fs');
let code = fs.readFileSync('src/data/exhibitions.js', 'utf8');

function toTitleCase(str) {
  return str.split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

code = code.replace(/name: \"([^\"]+)\", title: \"([^\"]+)\", startDate: \"Permanent\", endDate: \"Permanent\", collectionFile: \"([^\"]+)\"/g, (match, name, title, file) => {
    let clean = name.replace(/-collection|-paintings|-drawings|-photography|-video|-newmedia|-cinema|-design|-docphotos|-poster|-prints2|-prints|-100|-test/g, '');
    clean = toTitleCase(clean);
    return `name: "${clean}", title: "${clean}", startDate: "Permanent", endDate: "Permanent", collectionFile: "${file}"`;
});

// Restore country/city/location from empty strings
code = code.replace(/country: \"\"/g, 'country: "Unknown"');
code = code.replace(/city: \"\"/g, 'city: "Unknown"');
code = code.replace(/location: \"\"/g, 'location: "Unknown"');

fs.writeFileSync('src/data/exhibitions.js', code);
console.log('Fixed titles and locations');
