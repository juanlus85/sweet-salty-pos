# Sweet & Salty POS — Arquitectura funcional y técnica

**Estado:** diseño base aprobado a partir de los requisitos operativos iniciales.  
**Destino:** `sweetsalty.thespotcentralhostel.com` en el VPS/Plesk existente.  
**Principio rector:** el TPV será una aplicación independiente. No leerá ni modificará automáticamente las tablas de Hostel Management.

## Decisión de aislamiento

Aunque Hostel Management ya contiene entidades para inventario, proveedores, facturas y cierres, el nuevo TPV se desplegará con su propia base de datos MySQL y sus propias tablas. Esto evita acoplamientos, riesgos de regresión y diferencias entre la lógica administrativa del hostel y la operativa de venta al público.

En una fase posterior, si se necesita consolidar información, se podrá incorporar una integración explícita de solo lectura o de exportación controlada. Esa integración utilizará vistas, consultas de agregación o una API autenticada; nunca modificaciones directas y silenciosas de datos de Hostel Management.

| Área | Sistema de origen en la primera versión | Relación con Hostel Management |
| --- | --- | --- |
| Catálogo, familias y precios | Sweet & Salty POS | Independiente |
| Proveedores, compras y facturas | Sweet & Salty POS | Independiente |
| Existencias y coste medio | Sweet & Salty POS | Independiente |
| Ventas, pagos y devoluciones | Sweet & Salty POS | Independiente |
| Caja diaria y arqueos | Sweet & Salty POS | Independiente |
| Resúmenes o exportaciones | Sweet & Salty POS | Opcional, posterior y controlada |

## Flujo de venta

La pantalla TPV estará optimizada para dos pantallas simultáneas, aunque ambas puedan operar con la misma caja. La primera vista mostrará familias y productos destacados configurables. Al seleccionar una familia, los artículos se podrán ordenar alfabéticamente o por volumen de ventas. Cada artículo incluirá foto, nombre, precio y estado de existencias. Un clic añadirá una unidad al ticket lateral; allí se podrá aumentar o disminuir cantidades, eliminar líneas y suspender o cancelar el ticket antes del cobro.

El cobro no integrará directamente el datáfono en la primera versión. En cambio, la persona vendedora elegirá **efectivo** o **tarjeta**, completará el cobro físico en el datáfono cuando corresponda y confirmará la operación en el TPV. En efectivo, el sistema calculará el cambio. En tarjeta, el TPV registrará el importe y podrá conservar una referencia manual opcional del terminal.

Cada venta confirmada ejecutará en una única transacción de base de datos las siguientes acciones: guardará la cabecera de venta, almacenará sus líneas con precios históricos, registrará el pago, descontará existencias y escribirá los movimientos de stock. El objetivo es que una venta nunca pueda quedar contabilizada sin su correspondiente ajuste de inventario.

## Modelo de datos propuesto

| Grupo | Tablas principales | Propósito |
| --- | --- | --- |
| Configuración | `pos_settings`, `pos_display_layouts` | Nombre comercial, IVA, moneda, orden de familias y destacados de la pantalla inicial. |
| Catálogo | `pos_categories`, `pos_products`, `pos_product_images` | Familias, artículos vendibles, SKU/EAN, foto, precio, IVA, umbral mínimo y estado activo. |
| Proveedores | `pos_suppliers`, `pos_supplier_products` | Datos fiscales y comerciales del proveedor, referencias, última compra y condiciones. |
| Compras | `pos_purchase_invoices`, `pos_purchase_invoice_lines` | Factura, archivo fuente, OCR, revisión manual y líneas de compra. |
| Inventario | `pos_inventory_balances`, `pos_stock_movements` | Existencia disponible y libro mayor de entradas, salidas, ajustes, mermas y devoluciones. |
| Costes | `pos_cost_layers` o campos de coste medio en producto | Coste de última compra y coste medio ponderado, con trazabilidad del cálculo. |
| Ventas | `pos_sales`, `pos_sale_lines`, `pos_payments` | Tickets, líneas inmutables, descuentos, impuestos, método de pago y referencias. |
| Caja | `pos_cash_sessions`, `pos_cash_movements`, `pos_cash_counts` | Una sesión diaria de caja, fondo inicial, retiros, recuento y descuadre. |
| Auditoría | `pos_audit_log` | Cambios sensibles: ajustes de stock, anulación/devolución, cambios de precio y validación de OCR. |

## Inventario y costes

El saldo de stock se considerará una vista operativa del libro mayor de movimientos. Esto permite recalcular, auditar y corregir el inventario. Todas las variaciones llevarán un tipo y un documento de origen.

| Evento | Movimiento | Efecto en stock | Efecto en coste |
| --- | --- | --- | --- |
| Factura de proveedor validada | `purchase_receipt` | Suma la cantidad recibida | Recalcula coste medio ponderado. |
| Venta confirmada | `sale` | Resta la cantidad vendida | Conserva el coste vigente en la línea de venta. |
| Devolución de cliente | `sale_return` | Suma la cantidad devuelta | Revierte el coste vinculado a la venta si procede. |
| Merma o caducidad | `waste` | Resta la cantidad | No modifica el coste medio. |
| Recuento/ajuste | `adjustment` | Ajusta al saldo físico | Requiere motivo y registro de auditoría. |

El coste medio ponderado se recalculará al confirmar una entrada de compra, no al detectar una factura. Por tanto, el reconocimiento automático solo propondrá datos: el usuario revisará proveedor, fecha, líneas, unidades, precio unitario e impuestos antes de guardar la recepción. Esta verificación evita que un error de OCR modifique stock o márgenes.

## Reconocimiento de facturas

La aplicación almacenará el PDF o imagen original en el directorio de archivos del TPV. El reconocimiento generará un borrador estructurado con proveedor, número, fecha, bases, impuestos, total y líneas. Se intentará relacionar cada línea con un producto existente usando referencia, código de barras y coincidencia de nombre, pero no se actualizará inventario sin una confirmación explícita.

La clave de OpenAI se guardará exclusivamente en la configuración del servidor/VPS o en los ajustes protegidos de la aplicación, nunca en el navegador. El flujo de OCR se implementará de modo intercambiable para permitir elegir proveedor/modelo en el futuro.

## Seguridad y operación

En la primera versión se configurará un acceso sencillo para el equipo, sin roles operativos diferenciados. Aun así, las operaciones críticas requerirán una sesión autenticada y quedarán auditadas. El proyecto incluirá copia y exportación de datos a CSV para productos, stock, compras, ventas y cierres de caja. Las fechas se guardarán en UTC y se visualizarán en la zona horaria del negocio.

Cada pantalla tendrá diseño responsive. La interfaz TPV priorizará el uso horizontal de tablet u ordenador: catálogo a la izquierda y ticket a la derecha. El panel de administración empleará navegación lateral y mostrará una marca de versión, fecha y hora de compilación en ajustes.

## Despliegue previsto

Se mantendrá el patrón compatible con el VPS actual: React, TypeScript y Tailwind para cliente; Express y TypeScript para servidor; MySQL mediante Drizzle ORM; y PM2/Plesk para ejecución. El servicio se desplegará en un subdominio propio, con un puerto interno diferente al de Hostel Management, SSL en Plesk y una base de datos exclusiva, por ejemplo `sweetsalty_pos`.

> La aplicación no se conectará a la base de datos del hostel durante el primer despliegue. Compartir VPS no implica compartir base de datos ni credenciales.

## Alcance de la primera entrega

La primera entrega debe incluir el TPV funcional, catálogo y familias, productos destacados configurables, ventas con efectivo o tarjeta, una caja diaria, histórico e informes básicos de ventas, proveedores, entradas de compra, control de stock, importación/alta de productos y el flujo de factura con OCR sujeto a revisión humana. Las integraciones de datáfono, impresora, cajón portamonedas, etiquetas, fidelización, multitienda y usuarios por rol quedarán deliberadamente fuera hasta que se prioricen.
