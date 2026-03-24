while pgrep -f "scrape-albertina-full.cjs" > /dev/null; do
  sleep 10
done
echo "Scraping finished, running merge..."
node scripts/merge-albertina.cjs
