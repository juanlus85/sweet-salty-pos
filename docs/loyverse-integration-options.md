# Integración de Loyverse con Sweet & Salty POS

**Fecha:** 25 de agosto de 2026  
**Fuentes:** documentación técnica y página oficial de integración de Loyverse.

## Conclusión ejecutiva

La API de Loyverse permite integrar catálogo, familias, variantes, inventario por tienda, ventas, devoluciones, turnos, proveedores, clientes, impuestos, métodos de pago, dispositivos POS y webhooks. Para Sweet & Salty POS, la integración más segura no es empezar con una sincronización bidireccional completa, sino con una sincronización controlada de lectura desde Loyverse y una reconciliación explícita de stock.

La decisión más importante es elegir un único sistema principal para cada dato. Si Sweet & Salty POS es el TPV que se utilizará para vender y preparar Veri*Factu, sus ventas y su caja deben seguir siendo la fuente principal. Loyverse podría actuar inicialmente como origen de catálogo o sistema secundario de consulta, pero no conviene registrar automáticamente la misma venta en los dos sistemas sin una regla clara de autoridad.

## Qué permite hacer la API

| Área | Operaciones disponibles | Utilidad para Sweet & Salty POS |
|---|---|---|
| Catálogo | Consultar, crear, actualizar y eliminar artículos, categorías, variantes, modificadores y descuentos. La colección oficial incluye también subir y eliminar la imagen de un artículo. | Importar el catálogo de Loyverse, comparar nombres, precios, SKU y familias, y mantener identificadores cruzados. |
| Inventario | Consultar niveles por variante y tienda y hacer actualizaciones masivas de stock. | Reconciliar existencias y, si se decide expresamente, enviar ajustes desde el TPV a Loyverse. |
| Ventas | Consultar recibos, crear recibos y crear devoluciones. | Importar ventas históricas o enviar ventas a Loyverse, aunque esto último puede duplicar registros si ambos sistemas se usan como TPV. |
| Caja y operación | Consultar turnos cerrados, tiendas, métodos de pago, dispositivos POS, empleados y datos del comercio. | Comparar cierres y métodos de pago, identificar la tienda y comprobar la configuración operativa. |
| Proveedores y clientes | Consultar, crear, actualizar y eliminar proveedores y clientes. | Evitar duplicar directorios o importar proveedores de Loyverse al módulo de compras local. |
| Fiscalidad | Consultar, crear, actualizar y eliminar impuestos. | Comparar tipos de IVA; no sustituye la preparación específica de Veri*Factu ni la responsabilidad fiscal española del TPV. |
| Automatización | Webhooks para cambios de inventario, artículos, clientes y recibos, y para la creación de turnos cerrados. | Recibir cambios de Loyverse sin tener que consultar continuamente toda la cuenta. |

## Tres formas viables de integrarlo

| Enfoque | Qué haría | Ventajas y limitaciones | Coste operativo | Complejidad inicial |
|---|---|---|---|---|
| **A. Importación y consulta manual** | Un botón en Administración descarga familias, artículos, variantes y stock de Loyverse y muestra una vista previa antes de importar. | Es la opción más sencilla y segura. No hay sincronización automática ni conflictos continuos. | Uso de la API y recursos del VPS; la documentación consultada no indica una tarifa adicional por la API. | Baja |
| **B. Sincronización controlada Loyverse → Sweet & Salty** | Loyverse sería origen de catálogo y, opcionalmente, de stock. Los cambios llegarían mediante webhooks y se guardarían en una cola local para revisar o aplicar. | Reduce trabajo manual y puede acercarse al tiempo real. Requiere una URL HTTPS pública, asignación de identificadores y tratamiento de reintentos. | Uso normal de API; el VPS ya existente puede alojar el receptor HTTPS. | Media |
| **C. Sincronización bidireccional** | Sweet & Salty y Loyverse podrían leer y escribir artículos, stock, proveedores, impuestos y recibos. | Máxima automatización, pero con riesgo de duplicar ventas, movimientos de stock, devoluciones o cambios de precios. Requiere reglas de autoridad por cada entidad y reconciliación de errores. | Mayor consumo de API y mantenimiento; se debe respetar el límite documentado. | Alta |

## Recomendación para este proyecto

Recomiendo comenzar por **A** y evolucionar a **B**. La primera versión debería ser de solo lectura: probar la conexión, identificar la cuenta y tienda, descargar categorías, artículos, variantes e inventario, y mostrar diferencias frente a la base local. Ningún dato de Sweet & Salty debería modificarse sin una vista previa y confirmación.

En una segunda fase puede añadirse la sincronización de catálogo desde Loyverse hacia Sweet & Salty. Para el stock, conviene mantener una sola autoridad: o se vende principalmente en Sweet & Salty y se envían ajustes a Loyverse, o se vende principalmente en Loyverse y Sweet & Salty recibe los cambios. No conviene que ambos TPV reduzcan stock de forma independiente sin un mecanismo de reconciliación.

No recomiendo empezar enviando recibos de Sweet & Salty a Loyverse. La API permite crear recibos, pero el TPV local ya registra ventas, caja, IVA y preparación Veri*Factu. Crear una segunda venta en Loyverse puede producir dobles conteos y complicar la trazabilidad fiscal.

## Autenticación y seguridad

Loyverse documenta dos métodos: token personal y OAuth 2.0. El token personal es sencillo para una cuenta propia, pero la documentación advierte que proporciona acceso ilimitado a la cuenta objetivo. OAuth 2.0 permite solicitar permisos concretos y es preferible para una integración mantenible.

El token de la captura debe considerarse expuesto. Antes de realizar ninguna prueba, hay que revocar esa ficha en Loyverse y generar otra. El nuevo secreto debe guardarse únicamente en el servidor —por ejemplo, en una variable de entorno o secreto del VPS— y nunca en React, el repositorio Git, capturas, logs o respuestas de la API.

Para la integración inicial bastarían permisos de lectura de artículos, inventario, tiendas y comercio. Si se habilitan webhooks o escritura, se añadirían solo los permisos necesarios. En caso de usar webhooks creados por una aplicación OAuth, Loyverse incluye `X-Loyverse-Signature`, que debe validarse con HMAC-SHA1 sobre el cuerpo HTTP original y el Client Secret. Las notificaciones deben responder con HTTP 2xx y el receptor debe ser idempotente, porque Loyverse reintenta entregas fallidas.

## Límites técnicos que debe respetar la implementación

| Límite o regla | Consecuencia técnica |
|---|---|
| La API usa REST y la versión documentada es `v1.0`. | El backend debe centralizar la base URL y no llamar a Loyverse desde el navegador. |
| Las respuestas grandes utilizan cursor; el máximo documentado por página es 250 y el valor predeterminado es 50. | El importador debe recorrer todas las páginas y guardar el cursor de sincronización. |
| Límite general documentado de 300 solicitudes por cuenta cada 300 segundos. | Hay que agrupar lecturas, guardar cursores, evitar consultas innecesarias y reintentar HTTP 429 con espera progresiva. |
| Las fechas y horas de Loyverse están en UTC. | Las fechas deben convertirse a `Europe/Madrid` y coordinarse con la jornada comercial local de 07:00 a 07:00. |
| La mayoría de recursos usan soft-delete. | No se debe interpretar automáticamente la ausencia de un artículo como borrado físico; conviene tratar `deleted_at` de forma explícita. |
| Los webhooks requieren HTTPS y una URL alcanzable. | El VPS debe publicar un endpoint protegido, con validación de firma cuando corresponda, deduplicación y registro de eventos. |

## Primera versión que implementaría

La pantalla podría estar en **Administración → Integraciones → Loyverse** con cuatro acciones: **Probar conexión**, **Descargar catálogo**, **Comparar stock** y **Ver registro de sincronizaciones**. La conexión debería mostrar la cuenta, las tiendas y los permisos detectados sin enseñar nunca el token.

La importación usaría una tabla de correspondencias entre el identificador de Loyverse y el identificador local. Para productos y variantes se utilizarían, cuando existan, SKU o códigos de barras como ayuda, pero la relación definitiva debería conservar también los UUID de Loyverse para evitar confundir dos artículos con el mismo nombre. La importación debería generar una vista previa con altas, cambios, artículos sin correspondencia y posibles conflictos de IVA antes de aplicar nada.

La primera sincronización automática debería limitarse a `items.update` e `inventory_levels.update`, registrando cada notificación y aplicándola de forma idempotente. Los recibos y turnos podrían consultarse en una fase posterior para informes comparativos, sin crear recibos duplicados en Loyverse.

## Fuentes

[1]: https://developer.loyverse.com/docs/ "Loyverse API reference - documentación oficial"
[2]: https://loyverse.com/en-us/loyverse-pos-api "Loyverse POS API - página oficial de integración"

La disponibilidad de recursos, permisos, paginación, límites, fechas UTC, soft-delete y webhooks se ha contrastado con la referencia oficial de la API [1]. La página oficial de integración confirma el uso de la API para conectar Loyverse con software existente y mantener información e inventario sincronizados [2].
