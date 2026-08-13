# Iteración 4 — tablet, familias, impresión y cajón

## Alcance implementado

La aplicación incorpora ahora una gestión administrativa completa de familias. Desde `Administración > Familias` se pueden crear nuevas familias, elegir su nombre, color, icono y fotografía, editar sus datos, subirlas o bajarlas en el orden del TPV y retirarlas de la venta sin borrar el histórico. Las familias con imagen se muestran como fondo en la cuadrícula principal; las demás muestran el icono configurado.

El cierre de caja prepara automáticamente la siguiente jornada comercial con el efectivo contado como fondo inicial. La jornada sigue siendo de 07:00 a 07:00 en `Europe/Madrid`, por lo que la caja que se abre automáticamente corresponde al siguiente día comercial y no mezcla ventas con el cierre que acaba de finalizar.

La interfaz es instalable como PWA en una tablet Android compatible. Se han añadido manifest, icono, trabajador de servicio y aviso `Instalar en tablet`. En Android Chrome, la instalación se realiza desde el aviso de la propia app o desde el menú del navegador si el navegador decide no mostrar el aviso automático.

En el histórico de ventas, cada ticket puede abrirse e imprimirse mediante el diálogo de impresión del navegador. El formato está preparado para papel térmico de 80 mm y utiliza la impresora seleccionada por Android, Chrome o el sistema operativo.

## Cajón de efectivo

El TPV incluye el botón manual `Abrir cajón` en el menú del ticket y solicita una apertura automática después de cada venta en efectivo. Sin embargo, una aplicación web por sí sola no puede garantizar la apertura de un cajón físico conectado a una impresora Android. La demo devuelve de forma segura que el cajón no está configurado y sigue operativa sin hardware.

Para activar el cajón en producción se podrá configurar `CASH_DRAWER_BRIDGE_URL` apuntando a una aplicación o servicio puente del fabricante que acepte una petición `POST` con `action: "open-drawer"`. La compatibilidad real depende del modelo de impresora, de su SDK o protocolo ESC/POS y de la forma en que Android exponga el periférico. Se debe probar con el modelo exacto antes de prometer apertura automática.

## Verificación

La compilación `pnpm check` y `pnpm build` pasa correctamente. La demo pública muestra el botón de instalación, la nueva pestaña de Familias, los iconos configurados de Cafés, Comida, Snacks y Bebidas, el formulario de creación y la tabla de ordenación. El endpoint de hardware funciona en modo seguro sin puente configurado.
