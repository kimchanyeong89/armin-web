import requests
from bs4 import BeautifulSoup

def main():
    res = requests.get('https://masp.org.br/en/collections/works/human-head')
    soup = BeautifulSoup(res.text, 'html.parser')
    with open('/tmp/masp.html', 'w') as f:
        f.write(soup.prettify())

if __name__ == '__main__':
    main()
