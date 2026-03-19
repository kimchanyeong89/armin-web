import requests
from bs4 import BeautifulSoup

def main():
    res = requests.get('https://masp.org.br/en/collections/works/human-head')
    soup = BeautifulSoup(res.text, 'html.parser')
    print("Title:", soup.title.string if soup.title else None)
    artist = soup.select_one('.collection-title h2')
    print("Artist:", artist.text.strip() if artist else 'None')
    
    title = soup.select_one('.collection-title h1')
    print("Title:", title.text.strip() if title else 'None')
    
    date = soup.select_one('.collection-title p')
    print("Date:", date.text.strip() if date else 'None')
    
    img = soup.select_one('.collection-image img')
    print("Image:", img.get('src') if img else 'None')
    
    category = soup.select_one('.collection-category')
    print("Category:", category.text.strip() if category else 'None')

if __name__ == '__main__':
    main()
