import requests
from bs4 import BeautifulSoup
import json

def main():
    headers = {
        'User-Agent': 'Mozilla/5.0'
    }
    url = "https://masp.org.br/en/collections/search?author=&title=&categories%5B%5D=1&categories%5B%5D=9&categories%5B%5D=10&categories%5B%5D=3"
    res = requests.get(url, headers=headers)
    soup = BeautifulSoup(res.text, 'html.parser')
    
    # Actually let's look for how the artworks are presented
    # They might be in a script tag or in simple li/div elements
    cards = soup.find_all('figure')
    print("Found figures:", len(cards))
    if cards:
        print(cards[0].prettify())

if __name__ == '__main__':
    main()
