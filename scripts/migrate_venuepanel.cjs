const fs = require('fs');

const githubVenuePanel = fs.readFileSync('/tmp/interactiveglobemapdesign/src/app/components/VenuePanel.tsx', 'utf-8');
const ourVenuePanel = fs.readFileSync('src/components/InteractiveGlobeMap/VenuePanel.tsx', 'utf-8');

fs.writeFileSync('src/components/InteractiveGlobeMap/GlobeExhibitionModal.tsx', githubVenuePanel);
