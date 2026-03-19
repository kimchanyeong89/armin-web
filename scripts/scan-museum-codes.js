// Quick script to scan for museum codes
const API_KEY = 'd44723b6b598e8f13c9a93d5bcb488219b58fe60bec8d9c7af4ef7fcc199b349';
const BASE_URL = 'http://www.emuseum.go.kr/openapi';

(async () => {
    const museumCodes = new Map();

    for (let page = 1; page <= 30; page++) {
        const url = `${BASE_URL}/relic/list?serviceKey=${API_KEY}&numOfRows=100&pageNo=${page}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (!data.list) continue;

            for (const item of data.list) {
                const code = item.museumCode2;
                const name = item.museumName2;
                if (code && name && !museumCodes.has(code)) {
                    museumCodes.set(code, name);
                }
            }
        } catch (e) {
            console.error('Error on page', page);
        }
    }

    console.log('Found museum codes:');
    for (const [code, name] of [...museumCodes.entries()].sort()) {
        console.log(`${code}: ${name}`);
    }
})();
