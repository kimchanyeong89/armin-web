#!/bin/bash
node scripts/scrape-leopold-museum-v2.cjs > scraping.log 2>&1
echo "Done" >> scraping.log
