# Loyverse en modo solo lectura

Sweet & Salty POS puede descargar una copia de consulta de Loyverse sin enviar artículos, stock, precios, imágenes, recibos ni ningún otro cambio a Loyverse. En esta primera fase, **Loyverse sigue siendo el sistema principal**.

## Activación en el VPS

Añade estas variables en la configuración Node.js de Plesk o en el entorno del proceso. El token debe permanecer únicamente en el servidor:

```text
LOYVERSE_API_BASE_URL=https://api.loyverse.com/v1.0
LOYVERSE_API_TOKEN=TOKEN_NUEVO_GENERADO_EN_LOYVERSE
LOYVERSE_STORE_ID=
```

`LOYVERSE_STORE_ID` es opcional. Si se deja vacío, la aplicación selecciona la primera tienda devuelta por Loyverse. Si la cuenta tiene varias tiendas, es preferible indicar el UUID de la tienda que corresponde a Sweet & Salty.

Antes de probar la integración, revoca cualquier ficha que haya aparecido en una captura o mensaje y genera una nueva. No pongas el token en `VITE_*`, en React, en el repositorio, en una URL ni en un log.

## Migración

Aplica `drizzle/0010_brown_ultron.sql` en la base `sweet-salty` mediante phpMyAdmin. La migración crea únicamente las tablas `pos_loyverse_*` y no modifica las tablas de productos, ventas, caja o fiscalidad del TPV.

Después ejecuta:

```bash
git pull origin master
pnpm install --frozen-lockfile
pnpm build
```

Finalmente reinicia la aplicación Node.js desde Plesk.

## Uso desde el panel

Entra en **Administración → Loyverse**. La pantalla permite:

| Acción | Resultado |
|---|---|
| **Catálogo y stock** | Descarga comercio, tiendas, familias, artículos, variantes, precios por tienda, imágenes remotas y niveles de stock. |
| **Sincronizar todo** | Hace lo anterior y además descarga recibos y turnos. Se puede limitar el rango de fechas. |
| **Tienda** | Filtra el catálogo, stock y ventas por una tienda de Loyverse. |
| **Desde / Hasta** | Filtra los informes y limita las ventas que se descargan en la siguiente sincronización completa. |

Las imágenes se muestran usando la URL que entrega Loyverse. En esta fase no se copian al almacenamiento local ni se crea una segunda imagen en el TPV.

## Informes importados

El panel muestra el total vendido, IVA, descuentos, coste estimado, margen estimado, ventas por hora en `Europe/Madrid`, evolución por fecha, ranking de artículos y los recibos importados. Los recibos importados se mantienen en tablas propias de consulta y no se mezclan con las ventas ni la caja de Sweet & Salty POS.

El coste y margen son estimaciones basadas en los costes de línea que devuelve Loyverse. Deben revisarse antes de utilizarlos como contabilidad o declaración fiscal.

## Límites y comportamiento

La API utiliza REST v1.0, paginación mediante cursor y fechas UTC. El sincronizador recorre las páginas hasta completar cada colección y convierte las fechas para mostrarlas en hora española. Loyverse documenta un máximo de 250 elementos por página y un límite general de 300 solicitudes por cuenta cada 300 segundos; por ello la aplicación evita consultas desde el navegador y guarda una copia local para las consultas posteriores.

La integración solo tiene rutas de lectura hacia Loyverse: `GET /merchant`, `GET /stores`, `GET /categories`, `GET /items`, `GET /inventory`, `GET /receipts` y `GET /shifts`. Las escrituras que realiza el servidor son exclusivamente inserciones o actualizaciones en las tablas de caché locales `pos_loyverse_*`.

## Fase posterior

Cuando se haya validado el catálogo y el stock, se podrá estudiar una sincronización automática mediante webhooks. Antes de activarla habrá que decidir qué sistema manda en cada entidad, cómo se resuelven cambios simultáneos y cómo se conserva la trazabilidad de ventas y stock. No se incluye en esta primera fase para evitar conflictos con la operación principal de Loyverse.

## Referencias oficiales

[1]: https://developer.loyverse.com/docs/ "Loyverse API reference"
[2]: https://loyverse.com/en-us/loyverse-pos-api "Loyverse POS API"

La configuración anterior sigue los recursos, permisos, paginación, fechas UTC, límites y operaciones documentados por Loyverse [1]. La finalidad de integración con software externo y sincronización de inventario también está descrita en la página oficial de integración [2].
