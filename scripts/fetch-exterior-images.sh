#!/usr/bin/env bash
set -uo pipefail

# Fetch vetted Wikimedia exterior images and replace local files in public/images
# Attribution: files come from Wikimedia Commons; verify license at the linked file pages.

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
IMG_DIR="$ROOT_DIR/public/images"
mkdir -p "$IMG_DIR"

download() {
  url=$1
  out=$2
  name=$(basename "$out")
  echo "Downloading $name from $url..."
  tmp=$(mktemp)
  if curl -fSL "$url" -o "$tmp"; then
    if [ -f "$IMG_DIR/$name" ]; then
      echo "Backing up existing $name -> $name.bak"
      mv "$IMG_DIR/$name" "$IMG_DIR/$name.bak"
    fi
    mv "$tmp" "$IMG_DIR/$name"
    echo "Saved -> $IMG_DIR/$name"
  else
    echo "Failed to download $url" >&2
    rm -f "$tmp"
    return 1
  fi
}

# List of images (url and destination basename). Edit if you prefer other files.
# --- London (local-only, vetted Wikimedia) ---
# 1) British Museum (exterior)
# Use a reliable upload path (some Wikimedia redirects vary). Try primary, then fallback.
if ! download "https://upload.wikimedia.org/wikipedia/commons/3/3a/British_Museum_from_NE_2.JPG" "british-museum.jpg"; then
  download "https://upload.wikimedia.org/wikipedia/commons/3/3a/British_Museum_from_NE.JPG" "british-museum.jpg" || true
fi

# 2) National Gallery (exterior) - exact upload URL from file page
download "https://upload.wikimedia.org/wikipedia/commons/8/8d/National_Gallery_-_geograph.org.uk_-_3449882.jpg" "national-gallery.jpg" || true

# 3) Victoria and Albert Museum (exterior) - exact upload URL for a good exterior shot
download "https://upload.wikimedia.org/wikipedia/commons/f/f4/Victoria_and_Albert_Museum_%2827%29_-_geograph.org.uk_-_7423102.jpg" "vam.jpg" || true

# 4) Science Museum (exterior) - exact upload URL
download "https://upload.wikimedia.org/wikipedia/commons/1/1e/The_Science_Museum_-_geograph.org.uk_-_2581044.jpg" "science-museum.jpg" || true

# Note: TATE Modern is already present as tate-modern.jpg; not re-downloading by default.


## --- 서울 대표 전시관 (공식 사이트 우선, 위키미디어/대체 출처 보조) ---

# 1) 국립현대미술관 서울관 (MMCA Seoul) — save as mmca-seoul.jpg
if ! download "https://www.mmca.go.kr/upload/main/2025/07/2025070401411737417186.jpg" "mmca-seoul.jpg"; then
  download "https://www.mmca.go.kr/assetGwan/images/contents/seoul/3f_img_m.png" "mmca-seoul.jpg" || true
fi

# 2) 리움미술관 (Leeum) — exterior photo, save as leeum.jpg
download "https://upload.wikimedia.org/wikipedia/commons/2/2e/Leeum_Samsung_Museum_of_Art_2014.jpg" "leeum.jpg" || true

# 3) 서울시립미술관 (SeMA) — save as sema.jpg
if ! download "https://www.sema.seoul.go.kr/kr/assets/images/main/main_visual_01.jpg" "sema.jpg"; then
  download "https://upload.wikimedia.org/wikipedia/commons/2/2d/Seoul_Museum_of_Art_2012.jpg" "sema.jpg" || true
fi

# 4) 대림미술관 (Daelim) — save as daelim.jpg
download "https://www.daelimmuseum.org/assets/images/main/main_visual_01.jpg" "daelim.jpg" || \
  download "https://www.daelimmuseum.org/assets/images/main/main_visual_02.jpg" "daelim.jpg" || true

# 5) 디뮤지엄 (D Museum) — save as dmuseum.jpg
download "https://www.daelimmuseum.org/assets/images/main/main_visual_02.jpg" "dmuseum.jpg" || \
  download "https://www.daelimmuseum.org/assets/images/main/main_visual_01.jpg" "dmuseum.jpg" || true

# 6) DDP 디자인뮤지엄 / 동대문디자인플라자 — save as ddp.jpg
if ! download "https://www.ddp.or.kr/Uploads/Menus/20200715095353_4.jpg" "ddp.jpg"; then
  download "https://upload.wikimedia.org/wikipedia/commons/7/7e/Dongdaemun_Design_Plaza_2014.jpg" "ddp.jpg" || true
fi

# 7) 사비나미술관 (Savina) — save as savina.jpg
if ! download "https://www.savinamuseum.com/skin/savina2021/img/main/main_visual_1.jpg" "savina.jpg"; then
  # Space Group project page image fallback (if hotlinking allowed); otherwise keep Wikimedia/other public images.
  download "https://upload.wikimedia.org/wikipedia/commons/1/1e/Savina_Museum_of_Contemporary_Art.jpg" "savina.jpg" || true
fi

echo "All downloads completed."
