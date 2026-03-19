import requests
import json
from bs4 import BeautifulSoup

def main():
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
    url = "https://masp.org.br/en/collections/search?author=&title=&categories%5B%5D=1&categories%5B%5D=9&categories%5B%5D=10&categories%5B%5D=3"
    print("Fetching MASP...")
    res = requests.get(url, headers=headers)
    print("Status:", res.status_code)
    
    soup = BeautifulSoup(res.text, 'html.parser')
    items = soup.find_all('div', class_='collection-item')
    print("Found items:", len(items))
    if not items:
        # Check what classes are there
        links = soup.select('a[href*="/collections/works"]')
        print("Found links to works:", len(links))
        if links:
            for link in links[:5]:
                print(link.get('href'), link.text.strip())
        else:
            print("Preview of HTML:", res.text[:500])

if __name__ == '__main__':
    main()
