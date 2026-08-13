# Hallazgos verificados de capturas de referencia

## Facturas

La pantalla de facturas mantiene un encabezado blanco y muy ligero con el título **«Facturas - Hostel»** y el subtítulo **«Gestión de facturas y gastos con captura de tickets»**. La acción principal está situada a la derecha como botón azul de **«Nueva factura»**.

El cuerpo prioriza una zona de carga amplia con borde discontinuo azul claro, icono de nube y texto de acción: **«Arrastra una factura aquí para registrarla»**. Se indica explícitamente que acepta PDF, JPG, PNG y WEBP y que la IA intenta completar proveedor, fecha, número e importe antes de la confirmación. Debajo aparece un selector temporal de **«Últimas 30 facturas»**.

La adaptación para Sweet & Salty conservará este patrón de arrastrar y soltar, lo conectará con el OCR ya implementado y añadirá una revisión obligatoria de líneas antes de actualizar inventario o costes.

## TPV y ticket

La pantalla principal de TPV usa una barra superior verde, una cuadrícula amplia de cinco columnas para el catálogo y un panel de ticket fijo a la derecha. La portada mezcla familias en bloques de color con productos destacados que muestran imagen; cada producto de familia utiliza una fotografía sobre fondo blanco y una banda semitransparente gris con su nombre. El ticket muestra líneas sencillas con cantidad en formato `x 1`, impuesto incluido, total destacado y botones inferiores de **Guardar** y **Cobrar**.

Al abrir una familia, la cabecera muestra una ruta de navegación (`PÁGINA: 1 > Latas`) y una flecha de retorno. El menú del ticket incluye acciones como despejar, editar, asignar, dividir, mover y sincronizar. Para el alcance inicial de Sweet & Salty se implementarán el acceso al menú, despejar ticket y la base visual para futuras acciones; los tickets abiertos, la división y asignación quedarán posteriores porque no se solicitaron como requisito operativo inicial.

La pantalla de pago reemplaza el catálogo por una superficie de cobro: ticket persistente a la izquierda, importe grande a pagar, efectivo recibido, botones rápidos de importe y una acción de tarjeta de ancho completo. Tras completar la venta, la misma vista muestra total pagado, cambio y un botón de **Nueva venta**.

## Administración

Las capturas de informes y artículos comparten una barra verde, una barra lateral de iconos y tarjetas/blancos de baja densidad. Los informes exponen filtros de fechas, métricas de ventas, gráfico y tabla exportable. La lista de artículos muestra categoría, precio, coste, margen, existencias y alertas de stock. La edición de artículo separa datos generales, stock mínimo, impuestos y representación del TPV (imagen o color). Sweet & Salty adoptará ese orden de información y dejará las variantes, compuestos, impresoras, lealtad y multi-tienda fuera de la primera versión.

## Verificación visual local

Se generó una captura local a 1440×900 de la interfaz compilada. La barra superior verde, el título de página, el buscador, el selector de orden, el panel fijo de ticket, el IVA incluido y los botones inferiores **Guardar/Cobrar** se renderizan con el lenguaje visual esperado. La cuadrícula aparece vacía en esta comprobación porque la instancia local se ejecutó sin `DATABASE_URL`; el servidor informa correctamente que las rutas de datos no están disponibles. Con la migración y el seed aplicados, las familias y los artículos ocuparán esa misma composición.
