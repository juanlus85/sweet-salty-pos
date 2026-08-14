# Investigación oficial sobre Veri*Factu y factura electrónica

## Fuentes consultadas

1. AEAT, FAQ de Sistemas Informáticos de Facturación y VERI*FACTU, actualizada el 21 de julio de 2026: https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes.html
2. BOE, Real Decreto 1007/2023, de 5 de diciembre: https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840
3. BOE, Orden HAC/1177/2024, de 17 de octubre: https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-22138
4. BOE, Real Decreto 254/2025, de 1 de abril: https://www.boe.es/buscar/doc.php?id=BOE-A-2025-6600

## Hallazgos verificados

La AEAT describe VERI*FACTU como una de las dos modalidades de sistemas informáticos de facturación. El reglamento exige que, al expedir una factura, el sistema genere y conserve o remita un registro de facturación con huella digital, referencia al registro anterior y, cuando corresponda, firma electrónica. La factura debe incluir un código QR; en la modalidad VERI*FACTU los registros de alta se remiten a la AEAT en el momento de su expedición.

La normativa exige integridad, conservación, accesibilidad, legibilidad, trazabilidad e inalterabilidad. El sistema debe impedir modificaciones silenciosas, mantener una cadena de registros, generar registros de anulación cuando proceda, conservar un registro de eventos y contar con una declaración responsable del productor/desarrollador. La Orden HAC/1177/2024 detalla formatos, registros de alta y anulación, hash, firma electrónica, registro de eventos, QR y comunicación con la AEAT.

La FAQ de AEAT consultada indica que, tras el Real Decreto-ley 15/2025, la aplicación obligatoria del reglamento se establece el 1 de enero de 2027 para contribuyentes del Impuesto sobre Sociedades y el 1 de julio de 2027 para el resto de obligados tributarios incluidos en el artículo 3.1 del reglamento. La misma fuente indica que el periodo anterior es de pruebas y que, una vez se empieza a remitir efectivamente mediante VERI*FACTU tras nacer la obligación, debe mantenerse al menos hasta el final de ese año natural.

El Real Decreto 254/2025 publicado en el BOE recoge una redacción anterior del calendario —1 de enero de 2026 y 1 de julio de 2026—, pero la FAQ de AEAT actualizada en julio de 2026 refleja el aplazamiento posterior del Real Decreto-ley 15/2025. Por ello, para la planificación actual se debe seguir la información vigente de AEAT y verificar cualquier cambio posterior antes de producción.

La factura electrónica B2B no es exactamente lo mismo que Veri*Factu: Veri*Factu regula el sistema informático de facturación y sus registros; la factura electrónica regula el documento electrónico, su emisión, entrega, conservación e interoperabilidad entre empresas. Deben diseñarse como capas relacionadas pero separadas.

## Implicaciones para Sweet & Salty POS

El TPV actual no debe presentarse todavía como certificado o conforme. Para prepararlo se necesitarían, como mínimo, un registro inmutable de factura expedida por venta, numeración y series controladas, hash encadenado por obligado tributario, registros de anulación y rectificación, auditoría de eventos, generación QR, exportación de registros y una declaración responsable. La opción VERI*FACTU además requiere certificado electrónico y cliente de remisión con gestión de reintentos, errores, respuestas y estado de cada envío.

La factura electrónica requiere además un módulo de factura completa, datos del cliente, series, representación XML/Facturae cuando corresponda, PDF opcional como representación visual y un mecanismo de intercambio/entrega que deberá concretarse según el alcance B2B y la plataforma habilitada. Las facturas simplificadas de venta al consumidor y las facturas completas B2B deben distinguirse en el modelo de datos.

Este documento es una base técnica de planificación y no una certificación ni asesoramiento fiscal definitivo. Debe revisarlo la asesoría fiscal antes de activar el modo obligatorio o realizar envíos reales a la AEAT.

## Hallazgos técnicos adicionales

La AEAT indica que todos los SIF deben calcular SHA-256 sobre los datos relevantes de los registros de alta, anulación y, para sistemas no VERI*FACTU, eventos. La huella se guarda en el registro y se encadena incorporando la huella del registro anterior. Los SIF VERI*FACTU no están obligados a firmar electrónicamente los registros ni a generar registros de evento, porque la remisión incluye autenticación mediante certificado electrónico cualificado y transporte seguro. Los sistemas no verificables sí deben firmar registros de alta, anulación y evento con XAdES Enveloped Signature y ofrecer comprobación de las firmas y del encadenamiento.

La AEAT publicó servicios de remisión de registros VERI*FACTU desde el 23 de abril de 2025, incluyendo remisión de registros verificables, consulta de registros propios y cotejo de facturas por QR para registros remitidos desde sistemas VERI*FACTU. Esto permite diseñar una integración real contra entorno de pruebas y, después de certificación/declaración responsable, producción.

El Real Decreto 238/2026, de 25 de marzo, desarrolla la factura electrónica obligatoria B2B. El sistema español se compone de plataformas privadas de intercambio y una solución pública gestionada por AEAT. Las plataformas deben interoperar y transformar entre formatos admitidos; se contemplan Facturae, UBL, EDIFACT y Peppol BIS cuando usa UBL y cumple EN 16931. La solución pública usa UBL como sintaxis de referencia y su acceso es gratuito para usuarios.

El Real Decreto 238/2026 establece dos fases para la obligación B2B a contar desde la entrada en vigor de la orden ministerial que desarrolle la solución pública: doce meses después para empresarios y profesionales cuyo volumen de operaciones haya superado 8 millones de euros el año anterior, y veinticuatro meses después para el resto. El decreto fue publicado el 31 de marzo de 2026 y entró en vigor el 20 de abril de 2026, pero el cómputo de los plazos B2B arranca conforme a la orden ministerial de desarrollo de la solución pública. La norma también contempla estados de factura —aceptación/rechazo y pago efectivo completo con fecha— y la comunicación obligatoria del pago efectivo completo a la solución pública.

Durante los doce meses posteriores a la aplicación del régimen para sujetos con volumen superior a 8 millones de euros, deben acompañar las facturas electrónicas con PDF para legibilidad; para personas físicas o entidades en atribución de rentas con volumen igual o inferior a 8 millones, existe un plazo de hasta doce meses desde la producción de efectos para cumplir las obligaciones de informar estados y pagos. Estos detalles deben verificarse frente a la orden ministerial futura y a la situación fiscal concreta del negocio antes de fijar una fecha operativa.

## Fuentes técnicas específicas

- AEAT, Servicios VERI*FACTU ya disponibles: https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2025/abril/30/servicios-verifactu-disponibles.html
- AEAT, FAQ sobre firma: https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/firma.html
- AEAT, FAQ sobre huella/hash: https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/huella-hash.html
- BOE, Real Decreto 238/2026: https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-7295

## Revisión oficial adicional — 14 de agosto de 2026

La AEAT confirma que el RRSIF exige garantizar integridad, conservación, accesibilidad, legibilidad, trazabilidad e inalterabilidad de los registros, sin interpolaciones, omisiones o alteraciones no anotadas. También distingue el registro de facturación de alta del registro de anulación; ambos deben conservarse y formar parte de la cadena cuando proceda. [1] [2]

La AEAT indica que las facturas y facturas simplificadas deben incorporar un código QR desde la entrada en vigor de las obligaciones SIF. Los registros de facturación no son la factura electrónica y el QR debe implementarse según la especificación técnica oficial, por lo que el QR actual de preparación no debe presentarse como QR tributario válido. [1]

En modalidad VERI*FACTU, la remisión en línea a AEAT forma parte del modelo de seguridad; en modalidad no VERI*FACTU se requieren medidas adicionales, incluyendo firma electrónica, registro de eventos, exportación y comprobaciones de hash, firma y encadenamiento. La aplicación seguirá bloqueando deliberadamente la remisión hasta que se configure el certificado y se valide la modalidad elegida. [2]

La AEAT establece que los registros de alta erróneos no se borran: deben conservarse y vincularse a un registro de anulación o, según el caso, a una factura rectificativa. [3]

La certificación del SIF corresponde al productor mediante declaración responsable, debe estar visible dentro del propio producto y accesible externamente, y debe emitirse para cada versión del sistema o ampliación relevante. La aplicación deberá incluir una ficha de versión y una declaración responsable pendiente de firma, pero no debe afirmar conformidad antes de que el productor la suscriba. [4]

### Referencias adicionales

[1] [AEAT — Cuestiones generales sobre SIF y VERI*FACTU](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/cuestiones-generales.html)

[2] [AEAT — FAQ Sistemas VERI*FACTU](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/sistemas-verifactu.html)

[3] [AEAT — Registros de facturación: anulación](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/registros-facturacion-anulacion.html)

[4] [AEAT — Certificación de SIF mediante declaración responsable](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/certificacion-sistemas-informaticos-declaracion-responsable.html)
