# Despliegue de la preparación Veri*Factu — modo de pruebas

## Propósito y límite de esta versión

Esta versión incorpora una **capa interna de preparación fiscal** para Sweet & Salty POS. Crea, junto a cada venta nueva, una factura simplificada de pruebas, un registro de alta encadenado con SHA-256 y una traza de consulta desde `Administración → Fiscal (pruebas)`.

> **No realiza envíos a la AEAT, no usa certificado electrónico, no genera un QR tributario validado por AEAT y no constituye por sí misma una declaración de conformidad Veri*Factu.**

Los tickets y facturas ya emitidos antes de aplicar esta migración se preservan tal como están. Los registros de pruebas se crean únicamente para ventas nuevas posteriores a la migración.

## Aplicación en Plesk

Desde el terminal, dentro de `httpdocs`, actualiza el código y genera la aplicación:

```bash
git pull origin master && pnpm build
```

A continuación aplica las migraciones usando las variables `DATABASE_URL` configuradas en Plesk:

```bash
pnpm drizzle-kit migrate
```

Reinicia la aplicación desde Plesk, en la sección **Node.js → Restart App**. Finalmente, realiza una venta de prueba y abre `Administración → Fiscal (pruebas)`. Debe aparecer el primer registro con estado `sandbox_pending` y la opción **Verificar cadena SHA-256**.

## Controles incorporados

| Control | Estado |
|---|---|
| Perfil de emisor | Preparado con Sweet & Salty, dirección de Sevilla y NIF facilitado. |
| Serie y numeración de pruebas | Preparada con serie `SS`. |
| Instantánea inmutable de venta | Implementada para ventas nuevas. |
| Encadenamiento SHA-256 | Implementado en modo de pruebas. |
| Consulta y verificación de cadena | Disponible desde Administración. |
| Rectificativas y anulaciones fiscales | Modelo preparado; interfaz y reglas operativas pendientes. |
| QR fiscal oficial | Pendiente de implementación y validación contra la especificación vigente de AEAT. |
| Remisión a AEAT | Desactivada deliberadamente. |
| Certificado electrónico | Pendiente de configuración y validación. |

## Requisitos antes de activar cualquier modo real

La activación futura exige revisión de la asesoría fiscal, certificado válido del emisor, pruebas contra los servicios de AEAT, controles de conservación y acceso, lógica completa de rectificación, generación QR conforme a la especificación técnica vigente y declaración responsable del productor del sistema. No se debe cambiar el modo de pruebas a producción únicamente mediante una variable de entorno.

## Copia de seguridad

Antes de aplicar una migración en producción, ejecuta la copia de seguridad de MySQL y de `uploads/` ya incluida en `deploy/backup-pos.sh`.

## Referencias

[1] [AEAT — Sistemas Informáticos de Facturación y VERI*FACTU](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html)

[2] [AEAT — Información técnica de sistemas de facturación](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/informacion-tecnica.html)

[3] [BOE — Real Decreto 238/2026](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-7295)
