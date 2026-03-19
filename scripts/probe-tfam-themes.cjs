// const fetch = require('node-fetch');

const BASE = 'https://www.tfam.museum';
const API = `${BASE}/ashx/Collection.ashx?ddlLang=en-us`;

const fetchJsonPost = async (url, obj) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(obj),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
};

const getCount = async (mTheme, mType) => {
  const payload = {
    JJMethod: 'GetCollectionList',
    pg_num: 1,
    pg_size: 1,
  };
  if (mTheme) payload.MTheme = String(mTheme);
  if (mType) payload.MType = String(mType);
  
  const json = await fetchJsonPost(API, payload);
  // The first item usually has RowCount or we can guess from total if API returns pagination info
  // But this API returns a list.
  // Wait, does it return total count?
  // Previous logs showed "data.length".
  // I need to check if the API returns a total count field.
  // Inspection of previous scraper code shows it loops until empty.
  // Let's modify to loop until empty or check the first response for metadata field if any.
  
  // Actually, let's just use pg_size=1 and check if there's a count in the response object.
  // If not, I might have to rely on fetching page 1 with large size?
  // Let's just request page 1 size 500.
  
  const payload2 = { ...payload, pg_size: 500 };
  const json2 = await fetchJsonPost(API, payload2);
  
  if (json2.Data && json2.Data.length > 0) {
      // Sometimes "RowCount" is in the first element
      return json2.Data[0].RowCount || json2.Data.length;
  }
  return 0;
};

const userMTypes = "Oil Painting,Mixed Media,Sketch,Print,Photography,Design,Watercolor,Ink Painting";

const getCountFiltered = async (mTheme) => {
  const payload = {
    JJMethod: 'GetCollectionList',
    pg_num: 1,
    pg_size: 500,
    MTheme: String(mTheme),
    MType: userMTypes,
  };
  
  const json = await fetchJsonPost(API, payload);
  if (json.Data) return json.Data.length;
  return 0;
};


(async () => {
    console.log('Probing (Filtered by MType) themes 1..160...');
    for (let i = 1; i <= 160; i++) {
        try {
            const c = await getCountFiltered(i);
            if (c > 0) {
                console.log(`Theme ${i} (filtered): ${c} items`);
            }
        } catch (e) {}
    }
})();
