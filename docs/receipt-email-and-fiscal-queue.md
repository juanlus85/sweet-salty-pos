# Recibos por correo y cola fiscal bloqueada

> **Estado de esta versión:** la aplicación prepara la remisión futura a AEAT, pero no se comunica con AEAT. El envío de recibos por correo permanece desactivado hasta configurar SMTP en Plesk.

## 1. Acciones al completar una venta

Después de cada venta, el TPV muestra una ventana de entrega del recibo con dos acciones:

| Acción | Disponibilidad | Resultado |
|---|---|---|
| **Imprimir ticket** | Siempre disponible | Abre el diálogo de impresión del navegador y genera el recibo térmico, incluido el QR de preparación cuando la venta tenga registro fiscal. |
| **Enviar por correo** | Solo con SMTP configurado | Envía un recibo HTML a la dirección introducida por el operador. |

El correo incluye los datos del emisor, líneas, unidades, IVA, total y, cuando exista, el QR marcado como **preparación**. No constituye por sí mismo una factura electrónica B2B.

## 2. Configuración SMTP en Plesk

Añade estas variables en la configuración Node.js de Plesk. No guardes la contraseña en Git ni en `.env.example`.

```text
SMTP_HOST=smtp.tu-proveedor.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=cuenta@tu-dominio.example
SMTP_PASSWORD=contraseña-secreta
SMTP_FROM=Sweet & Salty <cuenta@tu-dominio.example>
```

Para puertos TLS implícitos como 465, usa `SMTP_SECURE=true`. El botón de correo permanece desactivado mientras falte `SMTP_HOST`, `SMTP_USER` o `SMTP_PASSWORD`.

Tras guardar las variables, reinicia la aplicación Node.js en Plesk. El mensaje de la ventana posterior a la venta pasará a indicar que el correo está configurado.

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

La cola fiscal requiere aplicar la migración `0008_easy_silver_fox.sql` mediante Drizzle o phpMyAdmin. La migración solo crea `pos_fiscal_submissions` e índices; no altera ventas, artículos, caja ni registros fiscales existentes.

## 5. Pruebas recomendadas

Primero realiza una venta pequeña. Debe abrirse la ventana de entrega. Comprueba que imprimir funciona. Sin SMTP, el correo debe aparecer desactivado con un mensaje de configuración; después de configurar SMTP, prueba enviarlo a una dirección de control y revisa el buzón y los registros SMTP del proveedor.

Para la fiscalidad, entra en **Administración → Fiscal · preparación Veri*Factu**, verifica la cadena y descarga la exportación. La cola debe mantenerse en estado `blocked` hasta una futura activación revisada.
