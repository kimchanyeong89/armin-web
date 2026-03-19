const fs = require('fs');

try {
  const data = JSON.parse(fs.readFileSync('debug-sweden-list.json', 'utf8'));
  
  if (data.pageProps && data.pageProps.collections) {
    const collections = data.pageProps.collections;
    console.log(`Found ${collections.length} collections.`);
    
    // Check the first one
    const first = collections[0];
    console.log('Sample Collection:', {
        Id: first.Id,
        Title: first.OclTitleTxt,
        Description: first.OclDescriptionTxt,
        ItemsCount: first.OclObjectRef ? first.OclObjectRef.Items.length : 0
    });
    
    // We need to count total referenced items across all collections in this view
    let totalRefId = 0;
    collections.forEach(c => {
        if (c.OclObjectRef && c.OclObjectRef.Items) {
            totalRefId += c.OclObjectRef.Items.length;
        }
    });
    console.log(`Total referenced items across all ${collections.length} collections: ${totalRefId}`);
    
  } else {
    console.log('No collections found in pageProps.');
  }

} catch (e) {
  console.error(e);
}
