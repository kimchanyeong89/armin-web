#!/bin/bash
# Run Museum Ludwig scraper in background

cd /Users/kietzsche/armin-web-main

# Trap SIGINT/SIGTERM to prevent premature termination
trap '' SIGINT SIGTERM

# Run the scraper
for collection in malerei skulptur fotografie grafik; do
  echo "========================================"
  echo "Starting $collection collection..."
  echo "========================================"
  node scripts/scrape-museum-ludwig-collections.cjs "$collection"
  echo "Finished $collection"
  echo ""
done

echo "All collections complete!"
