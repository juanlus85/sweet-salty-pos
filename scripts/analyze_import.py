from pathlib import Path
import csv
import json
from collections import Counter, defaultdict

source = Path('/home/ubuntu/upload/export_items.csv')
with source.open('r', encoding='utf-8-sig', newline='') as handle:
    rows = list(csv.DictReader(handle))

families = Counter((row.get('Categoria') or '').strip() or '(sin familia)' for row in rows)
handles = defaultdict(list)
refs = Counter()
barcodes = Counter()
for index, row in enumerate(rows, start=2):
    handles[(row.get('Handle') or '').strip()].append(index)
    ref = (row.get('REF') or '').strip()
    if ref:
        refs[ref] += 1
    barcode = (row.get('Codigo de barras') or '').strip()
    if barcode:
        barcodes[barcode] += 1

out = {
    'rows': len(rows),
    'columns': list(rows[0].keys()) if rows else [],
    'families': families,
    'family_count': len(families),
    'duplicate_handles': {key: value for key, value in handles.items() if key and len(value) > 1},
    'duplicate_refs': {key: value for key, value in refs.items() if value > 1},
    'duplicate_barcodes': {key: value for key, value in barcodes.items() if value > 1},
    'visible_for_sale': Counter((row.get('Disponibles para la venta [Sweet & Salty]') or '').strip() for row in rows),
    'inventory_tracking': Counter((row.get('Seguir el Inventario') or '').strip() for row in rows),
    'vat_10': sum(1 for row in rows if (row.get('impuesto - "IVA" (10%)') or '').strip().upper() == 'Y'),
    'vat_21': sum(1 for row in rows if (row.get('impuesto - "IVA Gen." (21%)') or '').strip().upper() == 'Y'),
    'empty_names': [index for index, row in enumerate(rows, start=2) if not (row.get('Nombre') or '').strip()],
    'negative_stock': [{'row': index, 'name': row.get('Nombre'), 'stock': row.get('En inventario [Sweet & Salty]')} for index, row in enumerate(rows, start=2) if (row.get('En inventario [Sweet & Salty]') or '').strip().startswith('-')],
}

serializable = dict(out)
serializable['families'] = dict(families)
serializable['visible_for_sale'] = dict(out['visible_for_sale'])
serializable['inventory_tracking'] = dict(out['inventory_tracking'])
Path('/home/ubuntu/sweet-salty-pos/docs/import-analysis.json').write_text(json.dumps(serializable, ensure_ascii=False, indent=2, default=list), encoding='utf-8')
print(json.dumps(serializable, ensure_ascii=False, indent=2, default=list))
