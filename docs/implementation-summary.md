# Sweet & Salty POS — Resumen de implementación

## Estado

Se ha construido una primera versión funcional del TPV independiente para `sweetsalty.thespotcentralhostel.com`. El código está publicado en el repositorio privado [juanlus85/sweet-salty-pos](https://github.com/juanlus85/sweet-salty-pos), en la rama `master`.

## Decisiones confirmadas

La aplicación utiliza una base de datos MySQL propia y no reutiliza ni modifica las tablas de Hostel Management. Los productos, familias, proveedores, existencias, compras, ventas, pagos, sesiones de caja y movimientos de inventario tienen tablas independientes con prefijo `pos_`.

La operación contempla una sola caja y un acceso único compartido, sin roles diferenciados. El pago con tarjeta se registra después de confirmar manualmente el cobro en el datáfono; la aplicación no intenta controlar el terminal en esta primera versión.

## Funcionalidad entregada

La interfaz TPV sigue el patrón de las capturas facilitadas: barra superior verde, familias en bloques de color, artículos con imagen y banda de nombre superpuesta, artículos destacados o orden alfabético, búsqueda, ticket fijo a la derecha, menú contextual básico, cantidades, impuesto incluido, botones Guardar/Cobrar y pantalla de pago con ticket persistente, efectivo, importes rápidos, cambio y tarjeta.

La administración contiene resumen de ventas, ventas históricas, ventas por artículo, catálogo, alta de productos, carga de imágenes, proveedores, ajustes de stock, existencias bajas, compras/facturas y caja diaria con cierre y arqueo. Cada venta crea líneas históricas, registra el método de pago y descuenta existencias con movimientos auditables.

El módulo de facturas acepta PDF, JPG, PNG y WEBP. La IA propone proveedor, número, fecha, importes y líneas; el documento se guarda en `uploads/invoices/` y se crea un borrador. El usuario debe asociar cada línea al producto del TPV, revisar cantidad y costes y pulsar **Confirmar entrada y sumar stock**. Solo entonces se actualiza el inventario, se registra el movimiento de compra y se recalcula el coste medio ponderado.

## Validación realizada

La comprobación TypeScript y la compilación de cliente/servidor pasan correctamente mediante `pnpm check` y `pnpm build`. También se verificó `git diff --check`, el endpoint `/api/health` y una captura local renderizada a 1440×900. La instancia local de vista no tenía `DATABASE_URL`, por lo que el catálogo apareció vacío durante esa prueba visual; esto es esperado hasta aplicar la migración y el seed en la base de datos del VPS.

## Instalación resumida

En Plesk se debe crear una base de datos y usuario nuevos para `sweetsalty_pos`, distintos de los de Hostel Management. Después se copia `.env.example` a `.env`, se configura `DATABASE_URL`, se establecen `POS_BASIC_USER` y `POS_BASIC_PASSWORD`, se ejecutan `pnpm install`, `pnpm db:migrate`, `pnpm db:seed` y `pnpm build`, y se inicia `dist/index.js` en un puerto propio, por ejemplo `3010`. El proceso puede gestionarse con `pm2 start ecosystem.config.cjs` y Plesk debe apuntar el subdominio al proceso Node.

La IA de facturas es opcional. Para activarla se configura `OPENAI_API_KEY` y, si se desea, `OPENAI_INVOICE_MODEL`; el valor por defecto es `gpt-5-mini`. Se recomienda respaldar tanto la base de datos `sweetsalty_pos` como el directorio `uploads/`.

## Próximo paso operativo

Para ponerlo en producción faltan los datos reales del catálogo: familias, nombres, precios, costes iniciales, stocks, fotos, IVA y proveedores. Esos datos se pueden cargar mediante la administración o preparar mediante una importación inicial cuando se facilite el listado.
