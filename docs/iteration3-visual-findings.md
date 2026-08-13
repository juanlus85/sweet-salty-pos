# Verificación visual — Iteración 3

La demo pública carga correctamente el TPV con familias, productos destacados, ticket lateral y navegación a Administración.

La pantalla **Configuración** muestra cuatro tipos iniciales: Exento 0 %, IVA superreducido 4 %, IVA reducido 10 % e IVA general 21 %. También presenta un formulario separado para crear nuevos tipos de IVA.

La barra administrativa muestra la versión y fecha de compilación. La interfaz conserva el lenguaje visual verde y la navegación lateral compacta de las capturas de referencia.


La pantalla **Compras y facturas** ya muestra el formulario manual rediseñado. La jerarquía se divide en `1. Datos de la factura` y `2. Líneas de compra`, con proveedor, número, fecha, artículo, cantidad, coste unitario, IVA, importe, notas, adjunto y totales calculados. El botón se denomina `Guardar borrador` y aparece separado del flujo de reconocimiento OCR. La demo muestra una factura manual guardada como borrador, confirmando que el endpoint de guardado funciona.


Tras recargar la demo con la compilación corregida, el TPV y el panel administrativo vuelven a cargar correctamente. La revisión del histórico se repite en la siguiente navegación para confirmar que el total vendido deja de mostrar `NaN €`.


El histórico de cajas ya muestra `16,80 €` en la columna Ventas, sin `NaN €`, y ofrece `Editar arqueo` para la jornada cerrada. La pantalla de cobro muestra dos botones claramente diferenciados: **Efectivo** aparece seleccionado por defecto con fondo verde claro, mientras **Tarjeta** permanece visible como botón alternativo. El botón principal inferior es `COBRAR EN EFECTIVO`.
