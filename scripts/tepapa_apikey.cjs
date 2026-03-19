const fetch = require('node-fetch');
fetch('https://collections.tepapa.govt.nz/object/35719')
  .then(res => res.text())
  .then(html => {
    const keys = html.match(/[a-zA-Z0-9_-]{20,}/g);
    console.log("Potential keys:", keys ? keys.slice(0, 5) : null);
  });
