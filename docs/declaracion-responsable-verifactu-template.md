# Declaración responsable del Sistema Informático de Facturación

## Estado de este documento

**Borrador de trabajo — no firmado y no válido como declaración responsable.** No debe publicarse como certificación de conformidad hasta que el productor del sistema lo revise, complete, firme y determine la versión exacta certificada.

## 1. Productor del sistema

- Nombre o razón social: `[COMPLETAR]`
- NIF: `[COMPLETAR]`
- Domicilio: `[COMPLETAR]`
- Persona firmante y cargo: `[COMPLETAR]`
- Lugar y fecha: `[COMPLETAR]`

## 2. Identificación del sistema

- Nombre del sistema: `Sweet & Salty POS`
- Identificador del sistema: `[ASIGNAR ID ÚNICO DEL PRODUCTOR]`
- Versión: `[VERSIÓN EXACTA DEL DESPLIEGUE]`
- Modalidad prevista: `VERI*FACTU`
- Entorno actual: `Preparación / sandbox — sin remisión AEAT`
- Componentes: aplicación web, API Node.js, base de datos MySQL, módulo de registros fiscales y módulo de impresión/QR.

## 3. Declaración pendiente de firma

El productor deberá declarar, bajo su responsabilidad, que el sistema identificado cumple el artículo 29.2.j) de la Ley General Tributaria, el Reglamento de requisitos de los sistemas informáticos de facturación y las especificaciones de desarrollo vigentes para la versión certificada.

La firma de este documento no se completa automáticamente. El productor debe revisar el código, los procedimientos de despliegue, las copias de seguridad, la gestión de certificados, las pruebas de remisión, el tratamiento de incidencias, los registros de anulación/rectificación, el QR oficial y la documentación técnica antes de firmarlo.

## 4. Componentes que deben verificarse antes de firmar

| Componente | Estado actual |
|---|---|
| Registro de alta inmutable | Preparado en modo de pruebas |
| Encadenamiento SHA-256 | Preparado y verificable |
| Registro de anulación | Preparado en modo de pruebas |
| Registro de rectificación | Preparado en modo de pruebas |
| Registro de eventos completo | En ampliación; revisar alcance final |
| QR tributario oficial AEAT | Pendiente de implementar/validar contra especificación oficial |
| Exportación de registros | Preparada en JSON de pruebas; validar formato oficial |
| Certificado electrónico | No configurado |
| Remisión VERI*FACTU | Deliberadamente desactivada |
| Pruebas contra servicios AEAT | Pendientes |
| Copias y restauración | Deben probarse en el entorno final |
| Declaración responsable de la versión | Pendiente de completar y firmar |

## 5. Firma

Nombre: `[COMPLETAR]`  
Cargo: `[COMPLETAR]`  
Lugar: `[COMPLETAR]`  
Fecha: `[COMPLETAR]`  
Firma: `[COMPLETAR]`

## Referencias

[1] [AEAT — Certificación de los sistemas informáticos mediante declaración responsable](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/certificacion-sistemas-informaticos-declaracion-responsable.html)

[2] [AEAT — Cuestiones generales sobre SIF y VERI*FACTU](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/cuestiones-generales.html)
