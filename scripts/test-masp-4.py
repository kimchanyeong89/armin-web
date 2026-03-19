import requests
from bs4 import BeautifulSoup
import json

def main():
    res = requests.get('https://masp.org.br/en/collections/search?author=&title=&categories%5B%5D=1&categories%5B%5D=9&categories%5B%5D=10&categories%5B%5D=3')
    
    # Are there any script tags containing 'window.__INITIAL_STATE__' or similar?
    soup = BeautifulSoup(res.text, 'html.parser')
    for script in soup.find_all('script'):
        if script.string and 'Alberto da Veiga' in script.string:
            print("Found in script!")
            print(script.string[:500])
            break
        elif script.string and 'human-head' in script.string:
            print("Found in script (human-head)!")
            print(script.string[:500])
            break
    else:
        print("Not found in any script tags.")

if __name__ == '__main__':
    main()
