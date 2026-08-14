# Preparación de Sweet & Salty POS para Veri*Factu y factura electrónica B2B

> **Aviso fiscal:** soy una IA, no un asesor fiscal. Este documento es un análisis técnico y de planificación; la asesoría fiscal debe confirmar el régimen aplicable, la fecha de obligación y la activación de envíos reales antes de utilizar el sistema con efectos tributarios.

## Conclusión ejecutiva

Sí, **Sweet & Salty POS se puede preparar técnicamente** para Veri*Factu y para factura electrónica B2B. No obstante, la versión actual no debe presentarse todavía como adaptada ni certificada: hoy dispone de ventas, tickets, IVA, stock, compras y caja, pero todavía no tiene la cadena fiscal inmutable, los registros de facturación de alta/anulación, el QR tributario, la remisión a AEAT, la declaración responsable ni la factura electrónica estructurada B2B.

La solución correcta es desarrollar dos capas relacionadas pero distintas. **Veri*Factu** afecta al sistema informático que expide la factura y a sus registros de facturación; la **factura electrónica B2B** afecta al documento estructurado, su intercambio, los estados de aceptación/pago y la interoperabilidad entre plataformas.

## Calendario oficial consultado

| Obligación | Situación oficial consultada | Implicación para el proyecto |
|---|---|---|
| Veri*Factu / SIF | La FAQ de AEAT consultada está actualizada a 21/07/2026 y recoge la aplicación obligatoria el 01/01/2027 para contribuyentes del Impuesto sobre Sociedades y el 01/07/2027 para el resto de obligados del artículo 3.1 del reglamento. | Conviene tener el núcleo fiscal en pruebas antes de esas fechas, pero no activar producción sin revisar el perfil fiscal. |
| Veri*Factu voluntario | La modalidad VERI*FACTU remite a AEAT los registros de facturación de alta en el momento de su expedición. | Es la modalidad que recomiendo implementar primero por ser más sencilla operativamente que un SIF no verificable. |
| Factura electrónica B2B | El Real Decreto 238/2026 entró en vigor el 20/04/2026. El cómputo de la obligación B2B comienza con la orden ministerial que desarrolle la solución pública: 12 meses después para quienes superen 8 millones de euros de volumen de operaciones y 24 meses después para el resto. | El módulo debe quedar preparado para no depender de una fecha fija hasta que se publique el desarrollo operativo de la solución pública. |

Las fechas pueden cambiar por nuevas normas o instrucciones. La fuente operativa que debe revisarse antes de activar el modo obligatorio es la AEAT.

## Qué debe cambiar en el TPV

El esquema actual ya guarda `saleNumber`, líneas, IVA, pagos, caja y costes. Sin embargo, una venta no es todavía un registro fiscal Veri*Factu. Para cada factura o factura simplificada expedida habría que generar un registro fiscal canónico, conservarlo sin permitir edición destructiva y encadenarlo con el registro anterior.

| Componente | Función propuesta |
|---|---|
| Perfil fiscal | NIF, razón social, domicilio, territorio fiscal, régimen, serie, modo Veri*Factu/no verificable y datos del software. |
| Factura expedida | Serie, número, fecha/hora local de España, tipo de factura, cliente cuando sea factura completa, líneas, IVA, recargo si corresponde, totales y forma de pago. |
| Registro de alta | Payload canónico de la factura, hash SHA-256, hash del registro anterior, fecha de generación, estado de remisión y respuesta AEAT. |
| Registro de anulación/rectificación | Nunca borrar o editar una factura ya expedida; corregir mediante el registro fiscal que corresponda y conservar ambos historiales. |
| Registro de eventos | Necesario para la modalidad no verificable; se puede crear desde el principio como auditoría ampliada. |
| QR tributario | QR generado en el ticket/factura y datos necesarios para el cotejo. |
| Remisión AEAT | Cola de envíos, certificado, reintentos, errores, respuesta, consulta y modo de pruebas. |
| Declaración responsable | Documento versionado del sistema, visible desde Administración, con versión de software y alcance de la adaptación. |
| Exportación | Exportación de registros, facturas, hash, cadena y eventos en formato legible y estructurado. |

La AEAT indica que todos los SIF deben calcular la huella SHA-256 y encadenar cada registro con el anterior. Los SIF VERI*FACTU no están obligados a firmar electrónicamente cada registro porque la remisión incorpora autenticación mediante certificado cualificado y transporte seguro; los sistemas no verificables sí deben firmar registros de alta, anulación y eventos con XAdES Enveloped Signature. [1] [2]

## Factura electrónica B2B

El TPV debería distinguir entre ticket/factura simplificada para venta al consumidor y factura completa a una empresa o profesional. Para la segunda se necesitaría una ficha de cliente con NIF, razón social, domicilio y correo o canal de recepción, además de un documento estructurado.

El modelo preparado debe admitir **UBL**, **Facturae**, **EDIFACT** y, cuando corresponda, **Peppol BIS** basado en UBL y EN 16931. El Real Decreto 238/2026 prevé plataformas privadas interoperables y una solución pública de factura electrónica gestionada por AEAT; también establece estados de factura, como aceptación/rechazo y pago efectivo completo con fecha. [3]

Por ello el módulo B2B debería incluir:

1. Alta de cliente profesional y validación del NIF.
2. Emisión de factura completa vinculada a la venta.
3. Generación de XML estructurado y representación PDF.
4. Estado de entrega, aceptación/rechazo y pago.
5. Registro de fecha de pago efectivo.
6. Exportación y entrega por el canal elegido: solución pública o plataforma privada interoperable.
7. Copia local inmutable del documento y de los mensajes de intercambio.

La venta ordinaria del hostel a consumidores no equivale automáticamente a una factura electrónica B2B. El alcance real depende de si Sweet & Salty factura a empresas/profesionales, de la forma de facturación utilizada y del perfil fiscal de la entidad.

## Arquitectura recomendada

Recomiendo añadir un módulo `fiscal` separado del TPV, pero dentro de la misma base de datos aislada. El checkout debe crear la venta y, en la misma transacción, crear el registro fiscal pendiente. El envío a AEAT se ejecutaría mediante una cola persistente, de modo que un fallo temporal de Internet no pierda la venta ni duplique el registro.

Las tablas principales serían `pos_fiscal_profiles`, `pos_fiscal_series`, `pos_fiscal_invoices`, `pos_fiscal_records`, `pos_fiscal_events`, `pos_fiscal_submissions`, `pos_business_customers` y `pos_einvoice_documents`. El actual `pos_audit_log` se conservaría, pero no sustituye a la cadena fiscal: la cadena debe tener formato, hash, relación anterior y reglas de inmutabilidad propios.

En la interfaz se añadirían un selector de tipo de documento —ticket/factura simplificada o factura completa—, datos de cliente, estado fiscal, QR, historial de envíos, comprobación de cadena y panel de errores. Una factura expedida no tendría botón de eliminación; tendría acciones de anulación o rectificación según proceda.

## Fases de implementación

| Fase | Entregable | Dependencias |
|---|---|---|
| 0. Perfil fiscal | Confirmar autónomo o sociedad, NIF, territorio, serie y si se factura B2B. | Asesoría fiscal. |
| 1. Núcleo inmutable | Registro de factura, series, hash SHA-256, cadena, anulación, auditoría y exportación. | Migración de datos y pruebas. |
| 2. Veri*Factu | QR, certificados, cola de envíos, entorno de pruebas AEAT, respuestas y reintentos. | Certificado y documentación técnica AEAT. |
| 3. Factura completa | Clientes profesionales, XML, PDF, estados y pago efectivo. | Datos del cliente y reglas de facturación. |
| 4. Intercambio B2B | UBL/Facturae, plataforma pública o privada e interoperabilidad. | Orden ministerial y plataforma elegida. |
| 5. Producción | Declaración responsable, pruebas de auditoría, copias, monitorización y activación. | Validación fiscal final. |

## Decisiones que necesito antes de activarlo

Para adaptar el diseño al caso real hay que confirmar si el titular de la actividad es una **sociedad sujeta al Impuesto sobre Sociedades** o una persona física/autónomo; si el negocio está en territorio común o en País Vasco/Navarra; si se emiten facturas completas a empresas además de tickets a consumidores; y si se quiere comenzar con la modalidad VERI*FACTU de remisión a AEAT o con un sistema no verificable.

Mi recomendación técnica es implementar primero el núcleo inmutable y el modo de pruebas VERI*FACTU, sin enviar nada a producción. Después de validar con la asesoría fiscal y disponer del certificado electrónico, se habilitaría el envío real.

## Referencias oficiales

[1]: https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/huella-hash.html "AEAT — FAQ sobre huella o hash"

[2]: https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/firma.html "AEAT — FAQ sobre firma"

[3]: https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-7295 "BOE — Real Decreto 238/2026, factura electrónica obligatoria B2B"

[4]: https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes.html "AEAT — FAQ general Veri*Factu, actualizada en julio de 2026"

[5]: https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-22138 "BOE — Orden HAC/1177/2024"

[6]: https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2025/abril/30/servicios-verifactu-disponibles.html "AEAT — Servicios VERI*FACTU disponibles"
