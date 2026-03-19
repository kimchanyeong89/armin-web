import requests
from bs4 import BeautifulSoup

def main():
    res = requests.get('https://masp.org.br/en/collections/search?author=&title=&categories%5B%5D=1&categories%5B%5D=9&categories%5B%5D=10&categories%5B%5D=3')
    soup = BeautifulSoup(res.text, 'html.parser')
    for figure in soup.find_all('figure')[:5]:
        parent = figure.parent.parent
        print(parent.prettify()[:500])
        print("-------------")

if __name__ == '__main__':
    main()
