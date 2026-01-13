const API_KEY = 'd44723b6b598e8f13c9a93d5bcb488219b58fe60bec8d9c7af4ef7fcc199b349';

(async () => {
  const museumCounts = {};
  
  for (const pageNo of [1, 500, 1000, 2000, 3000, 5000, 10000, 15000, 20000]) {
    try {
      const url = 'http://www.emuseum.go.kr/openapi/relic/list?serviceKey=' + API_KEY + '&numOfRows=100&pageNo=' + pageNo;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await res.json();
      
      for (const item of data.list || []) {
        const code = item.museumCode;
        const name = item.museumName2;
        if (!museumCounts[code]) {
          museumCounts[code] = { name, count: 0 };
        }
        museumCounts[code].count++;
      }
      console.log('Page', pageNo, 'done');
    } catch (e) {
      console.log('Page', pageNo, 'error');
    }
  }
  
  const sorted = Object.entries(museumCounts).sort((a, b) => b[1].count - a[1].count);
  console.log('\n박물관별 분포:');
  for (const [code, info] of sorted.slice(0, 30)) {
    console.log('  ' + code + ': ' + info.name + ' (' + info.count + ')');
  }
})();
