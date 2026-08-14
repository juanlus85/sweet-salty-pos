# Recibos por correo y cola fiscal bloqueada

> **Estado de esta versión:** la aplicación prepara la remisión futura a AEAT, pero no se comunica con AEAT. El envío de recibos por correo permanece desactivado hasta configurar SMTP desde **Administración → Configuración**.

## 1. Acciones al completar una venta

Después de cada venta, el TPV muestra una ventana de entrega del recibo con dos acciones:

| Acción | Disponibilidad | Resultado |
|---|---|---|
| **Imprimir ticket** | Siempre disponible | Abre el diálogo de impresión del navegador y genera el recibo térmico, incluido el QR de preparación cuando la venta tenga registro fiscal. |
| **Enviar por correo** | Solo con SMTP configurado | Envía un recibo HTML a la dirección introducida por el operador. |

El correo incluye los datos del emisor, líneas, unidades, IVA, total y, cuando exista, el QR marcado como **preparación**. No constituye por sí mismo una factura electrónica B2B.

## 2. Configuración SMTP desde Administración

Entra en **Administración → Configuración → Servidor SMTP** y completa el servidor, puerto, usuario, remitente, seguridad TLS y contraseña del buzón. Pulsa **Guardar configuración SMTP** y después **Probar conexión**. La contraseña existente nunca se muestra; si dejas el campo vacío al guardar, se conserva la contraseña ya guardada.

La aplicación devuelve al navegador únicamente si existe una contraseña configurada y nunca devuelve su valor. Los datos SMTP se almacenan en la tabla `pos_settings` de esta aplicación independiente.

Como respaldo para instalaciones automatizadas, también se aceptan estas variables en la configuración Node.js de Plesk. No guardes la contraseña en Git ni en `.env.example`.

```text
SMTP_HOST=smtp.tu-proveedor.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=cuenta@tu-dominio.example
SMTP_PASSWORD=contraseña-secreta
SMTP_FROM=Sweet & Salty <cuenta@tu-dominio.example>
```

Para puertos TLS implícitos como 465, usa `SMTP_SECURE=true`. El botón de correo permanece desactivado mientras no exista un servidor, usuario y contraseña válidos en la configuración guardada o en las variables de entorno.

Si configuras el SMTP mediante Plesk, reinicia la aplicación Node.js. Si lo configuras desde Administración, el cambio queda disponible inmediatamente para las nuevas ventanas de entrega de recibos.

## 3. Cola fiscal de preparación

Cada registro fiscal nuevo —alta, anulación o rectificación— genera una fila en `pos_fiscal_submissions` con:

| Campo | Uso actual |
|---|---|
| `environment` | `sandbox` |
| `status` | `blocked` |
| `attempt_count` | `0` |
| `request_payload` | Referencia al registro, factura y razón del bloqueo |
| `last_error` | Confirma que la remisión AEAT está desactivada deliberadamente |

La variable obligatoria de seguridad es:

```text
AEAT_SUBMISSION_ENABLED=false
```

Esta fase no contiene certificado, URL de remisión, trabajo en segundo plano ni acción de envío. Una activación futura debe añadir esos componentes solo después de pruebas oficiales, declaración responsable y revisión fiscal.

## 4. Migración requerida

La cola fiscal requiere aplicar la migración `0008_easy_silver_fox.sql` y la configuración SMTP requiere aplicar `0009_big_puma.sql`, mediante Drizzle o phpMyAdmin. La segunda migración solo añade columnas de configuración a `pos_settings`; no altera ventas, artículos, caja ni registros fiscales existentes.

## 5. Pruebas recomendadas

Primero entra en **Administración → Configuración**, guarda los datos SMTP y pulsa **Probar conexión**. Después realiza una venta pequeña. Debe abrirse la ventana de entrega. Comprueba que imprimir funciona y envía el recibo a una dirección de control; revisa el buzón y los registros SMTP del proveedor.

Para la fiscalidad, entra en **Administración → Fiscal · preparación Veri*Factu**, verifica la cadena y descarga la exportación. La cola debe mantenerse en estado `blocked` hasta una futura activación revisada.
