# Sweet & Salty POS

TPV web independiente para la tienda Sweet & Salty de The Spot Central Hostel. El proyecto está diseñado para instalarse en `sweetsalty.thespotcentralhostel.com` dentro del VPS/Plesk existente, pero utiliza una **base de datos MySQL propia** y no modifica Hostel Management.

## Alcance implementado

La primera versión incluye una pantalla de venta tipo Loyverse con familias, artículos destacados, búsqueda, orden por más vendidos o alfabético, foto de producto, stock visible, ticket lateral, cantidades, cobro en efectivo con cálculo de cambio y cobro con tarjeta mediante confirmación manual del datáfono.

El panel administrativo incluye resumen, ventas recientes, ventas por artículo, catálogo, alta de productos, carga de imágenes, proveedores, ajustes de inventario, caja diaria, cierre con arqueo y una bandeja de compras/facturas. El reconocimiento de facturas acepta PDF o imagen, conserva el documento original, crea un borrador y devuelve líneas estructuradas para revisión antes de recibir la factura.

## Arquitectura de datos

Todas las tablas llevan el prefijo `pos_` y viven en una base de datos separada. Las entradas, ventas, ajustes y mermas se registran en `pos_stock_movements`. El coste medio ponderado se recalcula al recibir una factura confirmada, no simplemente al leerla con OCR. Los datos son exportables directamente desde MySQL y la aplicación no depende de Hostel Management para funcionar.

Consulta el detalle en [`docs/architecture.md`](docs/architecture.md).

## Desarrollo local

```bash
pnpm install
cp .env.example .env
# Configura DATABASE_URL apuntando a una base de datos de pruebas
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev:server
```

En otra terminal, `pnpm dev:client` sirve la interfaz de Vite. Para una prueba de producción, ejecuta `pnpm build` y después `PORT=3010 NODE_ENV=production node dist/index.js`.

## Despliegue en Plesk

1. Crea el subdominio `sweetsalty.thespotcentralhostel.com` y activa SSL.
2. Crea una base de datos nueva, por ejemplo `sweetsalty_pos`, y un usuario que no tenga acceso a `hostel_management`.
3. Sube el proyecto compilado y configura las variables de `.env.example` en la sección Node.js de Plesk.
4. Ejecuta `pnpm install --prod=false`, `pnpm db:migrate` y, una sola vez, `pnpm db:seed`.
5. Compila con `pnpm build` y arranca `dist/index.js` en el puerto interno 3010, o utiliza `pm2 start ecosystem.config.cjs`.
6. Configura el proxy de Plesk hacia el proceso Node y verifica `/api/health`.

No copies la `DATABASE_URL` de Hostel Management. El hecho de compartir VPS no implica compartir base de datos, tablas ni credenciales.

## IA y facturas

La IA es opcional. Si `OPENAI_API_KEY` no está configurada, el TPV continúa funcionando para venta, stock, proveedores y caja. Si se configura, el modelo por defecto es `gpt-5-mini`, seleccionado por su capacidad multimodal y su coste operativo bajo; puede cambiarse mediante `OPENAI_INVOICE_MODEL`. El resultado siempre se guarda como borrador y exige validación antes de sumar stock.

## Exportación y respaldo

La fuente de datos es MySQL estándar. Se recomienda realizar copias periódicas de la base `sweetsalty_pos` y del directorio `uploads/`, que contiene las imágenes de productos y documentos originales de facturas.
