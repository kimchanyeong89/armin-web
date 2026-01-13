#!/bin/bash
# Museum Ludwig Complete Scraper
# Run this script in a standalone terminal: ./scripts/complete-museum-ludwig.sh
# This script is designed to be run outside VS Code to avoid signal interruptions

cd "$(dirname "$0")/.."

echo "========================================"
echo "Museum Ludwig Complete Scraper"
echo "========================================"
echo ""
echo "Current data status:"
echo "  Skulptur: $(grep -c '"id"' public/data/museum-ludwig-sculpture.json 2>/dev/null || echo 0) artworks"
echo "  Malerei: $(grep -c '"id"' public/data/museum-ludwig-paintings.json 2>/dev/null || echo 0) artworks"
echo "  Fotografie: $(grep -c '"id"' public/data/museum-ludwig-photography.json 2>/dev/null || echo 0) artworks"
echo "  Grafik: $(grep -c '"id"' public/data/museum-ludwig-graphics.json 2>/dev/null || echo 0) artworks"
echo ""

# Function to scrape a collection
scrape_collection() {
    local key=$1
    echo ""
    echo "========================================"
    echo "Processing: $key"
    echo "========================================"
    
    # Run the scraper - it will collect links first, then fetch details
    node scripts/scrape-museum-ludwig-collections.cjs "$key"
    
    echo "Finished: $key"
}

# Process all collections
for collection in malerei skulptur fotografie grafik; do
    scrape_collection "$collection"
done

echo ""
echo "========================================"
echo "FINAL STATUS"
echo "========================================"
echo "  Skulptur: $(grep -c '"id"' public/data/museum-ludwig-sculpture.json 2>/dev/null || echo 0) artworks"
echo "  Malerei: $(grep -c '"id"' public/data/museum-ludwig-paintings.json 2>/dev/null || echo 0) artworks"
echo "  Fotografie: $(grep -c '"id"' public/data/museum-ludwig-photography.json 2>/dev/null || echo 0) artworks"
echo "  Grafik: $(grep -c '"id"' public/data/museum-ludwig-graphics.json 2>/dev/null || echo 0) artworks"

TOTAL=$(grep -c '"id"' public/data/museum-ludwig-*.json 2>/dev/null | awk -F: '{sum+=$2} END {print sum}')
echo ""
echo "Total: $TOTAL artworks"
echo ""
echo "Done!"
