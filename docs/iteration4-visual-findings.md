# Verificación visual — Iteración 4

La demo pública muestra el botón `Instalar en tablet` en la parte inferior derecha del TPV y de Administración. El manifest se sirve con `display: standalone` y el trabajador de servicio está disponible.

La navegación administrativa incluye una nueva pestaña `Familias`. La pantalla muestra las familias publicadas con orden, icono, color, visibilidad, flechas para subir/bajar, edición y retirada. Las cuatro familias demo aparecen con los iconos configurados: Cafés, Comida, Snacks y Bebidas.

El endpoint del cajón devuelve de forma segura `supported: false` cuando no se ha configurado un puente de hardware; el TPV no falla ni intenta ejecutar comandos no soportados.
