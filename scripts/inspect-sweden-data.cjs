const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('debug-sweden.html', 'utf8');
const $ = cheerio.load(html);

const nextDataScript = $('#__NEXT_DATA__');

if (nextDataScript.length) {
  try {
    const data = JSON.parse(nextDataScript.html());
    console.log('Next Data Keys:', Object.keys(data));
    console.log('Props PageProps Keys:', Object.keys(data.props.pageProps));
    
    // Drill down to finding the collection list
    const pageProps = data.props.pageProps;
    console.log('Page Props keys:', Object.keys(pageProps));
    
    // Look for the main data container
    // Based on previous grep, we saw "OclObjectRef"
    const jsonString = JSON.stringify(pageProps, null, 2);
    
    // Let's find where the items are
    if (pageProps.result) {
        console.log('Result found. Type:', typeof pageProps.result);
        if (Array.isArray(pageProps.result)) {
            console.log('Result is array, length:', pageProps.result.length);
            console.log('First item:', pageProps.result[0]);
        } else {
             console.log('Result keys:', Object.keys(pageProps.result));
        }
    }
    
    // Or maybe it is in 'data' or similar
    // We'll just look for a large array in the structure
    function findArrays(obj, path = '') {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            if (obj.length > 0 && typeof obj[0] === 'object') {
                 console.log(`Found array at ${path} with length ${obj.length}`);
                 // Check if it looks like an item
                 const sample = obj[0];
                 if (sample.Id || sample.OclTitleTxt || sample.ReferencedId) {
                     console.log('Sample item:', JSON.stringify(sample, null, 2).slice(0, 500));
                 }
            }
            return;
        }
        for (const key in obj) {
            findArrays(obj[key], `${path}.${key}`);
        }
    }
    
    findArrays(pageProps);

  } catch (e) {
    console.error('Error parsing JSON:', e);
  }
} else {
  console.log('No __NEXT_DATA__ script found.');
}
