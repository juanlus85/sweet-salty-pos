# Investigación técnica: tablet, impresión y cajón

## PWA instalable en Android

Una aplicación web instalable necesita un Web App Manifest; la documentación de MDN explica que el manifest proporciona al navegador la información necesaria para instalar una PWA en el sistema operativo: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest

La guía de web.dev describe el manifest como el archivo que define cómo debe mostrarse el contenido web cuando se instala como aplicación: https://web.dev/learn/pwa/web-app-manifest

Chrome indica que el manifest es necesario pero no suficiente para la instalabilidad; también deben cumplirse otros requisitos de instalación: https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest

## Impresión desde Android

Android dispone de un Print Framework oficial para crear adaptadores de impresión y enviar documentos mediante el gestor de impresión: https://developer.android.com/training/printing

La impresión de tickets POS con formato térmico y comunicación directa con el cajón normalmente requiere una integración específica del fabricante o una aplicación Android intermediaria, no solo el Print Framework genérico.

## Impresoras POS y cajones

Epson publica un ePOS SDK para Android orientado a aplicaciones que imprimen en impresoras TM de Epson: https://download3.ebz.epson.net/dsc/f/03/00/17/07/33/fd1f5135c7405d9859dddbd04ed3f03c6d4028f1/ov_ePOS_SDK_Android_2.32.0.pdf

Epson mantiene documentación y descargas para dispositivos TM con ePOS-Device y ePOS SDK: https://download-center.epson.com/softwares/?device_id=TM-T82II-i&os=ARD&language=en

Star Micronics publica SDKs para Android y recursos específicos de cajones de efectivo: https://starmicronics.com/support/developers/cash-drawer-sdks/

El SDK Android de Star para determinados cajones USB está publicado en GitHub: https://github.com/star-micronics/starlabs-cashdrawer-sdk-android

Star también mantiene SDKs de impresoras para Android: https://starmicronics.com/support/developers/printer-sdks/

El estándar ESC/POS incluye un comando de impulso para activar la salida de cajón de la impresora, pero el byte exacto, el pin, el tiempo de impulso y el canal dependen del fabricante y del modelo. Una referencia de comando común es `ESC p m t1 t2`; no debe enviarse a hardware real sin confirmar el manual del modelo: https://help.volcora.com/support/solutions/articles/73000661215-commands-to-open-cash-drawer-only

## Conclusión de compatibilidad

La aplicación puede prepararse como PWA instalable en una tablet Android. Para imprimir tickets desde una PWA pura, las opciones más realistas son: utilizar el diálogo de impresión del sistema; imprimir mediante una impresora de red con un servicio puente local; o empaquetar la interfaz como aplicación Android y utilizar el SDK del fabricante. Para abrir el cajón automáticamente al finalizar una venta en efectivo o mediante un botón `Abrir cajón`, se necesita confirmar la marca y el modelo de la impresora, la conexión —USB, Bluetooth, Ethernet o Wi-Fi— y si el cajón está conectado al puerto RJ12/RJ11 de la impresora. Una PWA pura no garantiza acceso directo a USB/Bluetooth ni al comando de apertura; una aplicación Android con SDK o un servicio puente sí puede hacerlo cuando el hardware lo soporta.
