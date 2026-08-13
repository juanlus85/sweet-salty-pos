from pathlib import Path
import csv
from collections import Counter

source = Path('/home/ubuntu/upload/export_items.csv')
with source.open('r', encoding='utf-8-sig', newline='') as handle:
    rows = list(csv.DictReader(handle))

vat_combinations = Counter()
for row in rows:
    vat10 = (row.get('impuesto - "IVA" (10%)') or '').strip().upper() == 'Y'
    vat21 = (row.get('impuesto - "IVA Gen." (21%)') or '').strip().upper() == 'Y'
    vat_combinations[(vat10, vat21)] += 1

print('VAT combinations:', dict(vat_combinations))
print('\nRows with empty name:')
for index, row in enumerate(rows, start=2):
    if not (row.get('Nombre') or '').strip():
        keys = ['Handle','REF','Nombre','Categoria','Opción 1 nombre','Opción 1 valor','Opción 2 nombre','Opción 2 valor','Coste','Precio [Sweet & Salty]','En inventario [Sweet & Salty]','Disponibles para la venta [Sweet & Salty]']
        print(index, {key: row.get(key) for key in keys})

print('\nRows with options and name:')
for index, row in enumerate(rows, start=2):
    options = [(row.get(f'Opción {n} nombre') or '').strip() + '=' + (row.get(f'Opción {n} valor') or '').strip() for n in (1,2,3) if (row.get(f'Opción {n} valor') or '').strip()]
    if options:
        print(index, row.get('Nombre'), options, row.get('Precio [Sweet & Salty]'), row.get('Coste'))
