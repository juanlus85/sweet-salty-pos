from pathlib import Path
import csv
source = Path('/home/ubuntu/upload/export_items.csv')
with source.open('r', encoding='utf-8-sig', newline='') as handle:
    rows = list(csv.DictReader(handle))
for index, row in enumerate(rows, start=2):
    vat10 = (row.get('impuesto - "IVA" (10%)') or '').strip().upper() == 'Y'
    vat21 = (row.get('impuesto - "IVA Gen." (21%)') or '').strip().upper() == 'Y'
    if not vat10 and not vat21:
        print(index, row.get('Nombre'), row.get('Categoria'), row.get('Precio [Sweet & Salty]'), row.get('Coste'), row.get('Disponibles para la venta [Sweet & Salty]'))
