import csv
import sys

OBJECTS_CSV = 'downloads/nga-opendata/objects.csv'
IMAGES_CSV = 'downloads/nga-opendata/published_images.csv'

def analyze():
    # 1. Load Images
    print("Loading Images...", file=sys.stderr)
    image_status = {} # objectid -> {'has_open_access': bool}
    
    with open(IMAGES_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            obj_id = row.get('depictstmsobjectid')
            if not obj_id:
                continue
            
            maxpixels = row.get('maxpixels')
            is_open_access = not maxpixels or maxpixels == '0' or maxpixels == '""'
            
            if obj_id not in image_status:
                image_status[obj_id] = {'has_open_access': False}
            
            if is_open_access:
                image_status[obj_id]['has_open_access'] = True

    print(f"Loaded images for {len(image_status)} objects.", file=sys.stderr)

    # 2. Analyze Objects
    print("Analyzing Objects...", file=sys.stderr)
    
    stats = {
        'total_drawing': 0,
        'with_images': 0,
        'open_access': 0,
        'by_viz': {},
        'by_sub': {},
        'by_credit': {}
    }
    
    with open(OBJECTS_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('classification') == 'Drawing':
                stats['total_drawing'] += 1
                obj_id = row.get('objectid')
                
                if obj_id in image_status:
                    stats['with_images'] += 1
                    if image_status[obj_id]['has_open_access']:
                        stats['open_access'] += 1
                        
                        viz = row.get('visualbrowserclassification') or '(none)'
                        sub = row.get('subclassification') or '(none)'
                        credit = row.get('creditline') or '(none)'
                        
                        stats['by_viz'][viz] = stats['by_viz'].get(viz, 0) + 1
                        stats['by_sub'][sub] = stats['by_sub'].get(sub, 0) + 1
                        
                        # Group credit
                        if 'Rosenwald' in credit:
                            credit_key = 'Rosenwald Collection'
                        elif 'Index of American Design' in credit:
                            credit_key = 'Index of American Design'
                        elif 'Gift' in credit:
                            credit_key = 'Gift'
                        else:
                            credit_key = credit[:30]
                            
                        stats['by_credit'][credit_key] = stats['by_credit'].get(credit_key, 0) + 1

    print('--- Analysis Result ---')
    print(f"Total Objects with classification='Drawing': {stats['total_drawing']}")
    print(f".. with images: {stats['with_images']}")
    print(f".. with Open Access (maxpixels=0): {stats['open_access']}")
    
    print("\nBreakdown by VisualBrowserClassification (top 10):")
    for k, v in sorted(stats['by_viz'].items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  {k}: {v}")

    print("\nBreakdown by SubClassification (top 10):")
    for k, v in sorted(stats['by_sub'].items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  {k}: {v}")
        
    print("\nBreakdown by CreditLine (top 10):")
    for k, v in sorted(stats['by_credit'].items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  {k}: {v}")

if __name__ == '__main__':
    analyze()
