fetch('https://egyptianmuseumcairo.eg/artefacts/', { headers: { 'User-Agent': 'curl/7.64.1' } })
  .then(res => res.text())
  .then(html => console.log('Length:', html.length));
