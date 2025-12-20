/**
 * Scrape Tate Modern Display exhibitions and their artworks
 * Similar to tate-britain displays, these are ongoing permanent collection displays
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Display IDs from Tate website search URLs
const DISPLAYS = [
  {
    id: 'artist-and-society',
    title: 'Artist and Society',
    description: 'Explore artworks from Tate\'s collection that respond to their social and political context',
    location: 'Natalie Bell Building Level 2 West',
    url: 'https://www.tate.org.uk/visit/tate-modern/display/artist-and-society',
    searchId: 4761,
    roomCount: 13
  },
  {
    id: 'in-the-studio',
    title: 'In the Studio',
    description: 'Investigate the processes artists use to make artworks, and how our responses are integral to the piece',
    location: 'Natalie Bell Building Level 2 East',
    url: 'https://www.tate.org.uk/visit/tate-modern/display/in-the-studio',
    searchId: 4922,
    roomCount: 11
  },
  {
    id: 'materials-and-objects',
    title: 'Materials and Objects',
    description: 'Discover artists from Tate\'s collection who have embraced new and unusual materials and methods',
    location: 'Natalie Bell Building Level 4 West',
    url: 'https://www.tate.org.uk/visit/tate-modern/display/materials-and-objects',
    searchId: 4822,
    roomCount: 9
  },
  {
    id: 'media-networks',
    title: 'Media Networks',
    description: 'See how artists in Tate\'s collection have responded to the impact of mass media',
    location: 'Natalie Bell Building Level 4 East',
    url: 'https://www.tate.org.uk/visit/tate-modern/display/media-networks',
    searchId: 4841,
    roomCount: 10
  },
  {
    id: 'performer-and-participant',
    title: 'Performer and Participant',
    description: 'Discover how artists working between the 1960s and the 1990s opened up new spaces for participation',
    location: 'Blavatnik Building Level 3',
    url: 'https://www.tate.org.uk/visit/tate-modern/display/performer-and-participant',
    searchId: 4982,
    roomCount: 8
  },
  {
    id: 'the-tanks',
    title: 'The Tanks',
    description: 'Experience live art, performance, film and video art in these gallery spaces',
    location: 'Level 0',
    url: 'https://www.tate.org.uk/visit/tate-modern/display/tanks',
    searchId: null, // No search ID, has specific rooms
    roomCount: 2
  },
  {
    id: 'artist-rooms-richard-long',
    title: 'ARTIST ROOMS: Richard Long',
    description: 'Through the simple creative act of moving through the landscape, Richard Long extends the possibilities of sculpture to explore ideas of place, time and distance',
    location: 'Natalie Bell Building Level 4 East',
    url: 'https://www.tate.org.uk/visit/tate-modern/display/artist-rooms-richard-long',
    searchId: null, // Single artist room
    roomCount: 1
  }
];

// Fetch JSON from Tate search API
async function fetchTateArtworks(displayId) {
  return new Promise((resolve, reject) => {
    const url = `https://www.tate.org.uk/api/v2/artworks?display=${displayId}&limit=200`;
    console.log(`Fetching: ${url}`);
    
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          console.log('Parse error, trying search page...');
          resolve({ items: [] });
        }
      });
    }).on('error', reject);
  });
}

// Fetch artwork details from Tate collection page
async function fetchArtworkFromCollection(artistName) {
  return new Promise((resolve, reject) => {
    const searchQuery = encodeURIComponent(artistName);
    const url = `https://www.tate.org.uk/search?q=${searchQuery}&type=artwork`;
    
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Parse artwork info from Tate search results
function parseArtworkFromSearch(html, artistName) {
  const artworks = [];
  
  // Look for artwork cards in search results
  const cardRegex = /<div[^>]*class="[^"]*Card[^"]*"[^>]*>[\s\S]*?<\/div>/gi;
  const matches = html.match(cardRegex) || [];
  
  for (const match of matches) {
    // Extract artwork title and image
    const titleMatch = match.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    const imgMatch = match.match(/src="([^"]+)"/i);
    const linkMatch = match.match(/href="(\/art\/artworks\/[^"]+)"/i);
    
    if (titleMatch && linkMatch) {
      artworks.push({
        title: titleMatch[1].trim(),
        artist: artistName,
        image: imgMatch ? imgMatch[1] : null,
        url: `https://www.tate.org.uk${linkMatch[1]}`
      });
    }
  }
  
  return artworks;
}

// Main function
async function main() {
  console.log('=== Tate Modern Display Exhibitions Scraper ===\n');
  
  const results = [];
  
  for (const display of DISPLAYS) {
    console.log(`\n--- Processing: ${display.title} ---`);
    
    const displayData = {
      id: `display-${display.id}`,
      title: display.title,
      description: display.description,
      location: display.location,
      url: display.url,
      dateRange: 'Ongoing',
      roomCount: display.roomCount,
      artworks: []
    };
    
    if (display.searchId) {
      try {
        const artworksData = await fetchTateArtworks(display.searchId);
        if (artworksData.items && artworksData.items.length > 0) {
          displayData.artworks = artworksData.items.map(item => ({
            id: item.id,
            title: item.title,
            artist: item.artistDisplayName || item.artist,
            year: item.dateText,
            image: item.image?.url,
            url: `https://www.tate.org.uk/art/artworks/${item.id}`
          }));
          console.log(`  Found ${displayData.artworks.length} artworks`);
        } else {
          console.log(`  No artworks found via API, will need to scrape rooms`);
        }
      } catch (error) {
        console.log(`  Error fetching artworks: ${error.message}`);
      }
    } else {
      console.log(`  No search ID, will need to scrape individual rooms`);
    }
    
    results.push(displayData);
    
    // Delay between requests
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Save results
  const outputPath = path.join(__dirname, '..', 'downloads', 'tate-modern-displays.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n=== Saved to ${outputPath} ===`);
  
  // Print summary
  console.log('\n=== Summary ===');
  for (const display of results) {
    console.log(`${display.title}: ${display.artworks.length} artworks, ${display.roomCount} rooms`);
  }
}

main().catch(console.error);
