# Checklist de activación futura de VERI*FACTU

Esta lista separa la preparación técnica actual de la activación con efectos reales.

| Control | Requisito antes de activar |
|---|---|
| Situación fiscal | Confirmar con la asesoría el obligado tributario, territorio fiscal, modalidad y fecha de aplicación. |
| Productor del SIF | Completar datos del productor, identificador único del sistema y versión exacta. |
| Declaración responsable | Revisar, completar y firmar la declaración responsable de la versión desplegada. |
| QR | Sustituir el QR de preparación por la generación conforme a la especificación oficial vigente y validarlo con el cotejo AEAT. |
| Certificado | Instalar y proteger un certificado válido del obligado o representante autorizado. |
| Remisión | Implementar endpoint, autenticación, lotes, respuestas, reintentos, incidencias y estados. |
| Inmutabilidad | Bloquear edición/borrado de registros fiscales; corregir únicamente mediante rectificativa o anulación. |
| Cadena | Verificar SHA-256, referencia anterior y ausencia de huecos en cada despliegue. |
| Registro de eventos | Completar eventos de seguridad y administración requeridos por la modalidad escogida. |
| Exportación | Validar exportación en el formato exigible y probar restauración/legibilidad. |
| Reloj | Configurar hora española, sincronización y tolerancia conforme a la modalidad. |
| Backups | Ejecutar y restaurar una copia de MySQL y uploads en un entorno separado. |
| Pruebas | Probar alta, error, anulación, rectificación, pérdida de red, reintento, duplicado y recuperación. |
| Producción | Activar la remisión únicamente después de la revisión final de asesoría y productor. |

## Lo que no debe hacerse todavía

No debe introducirse un certificado real, no debe cambiarse el entorno a producción y no debe apuntarse el cliente a servicios AEAT reales mientras la declaración responsable, el QR oficial, la cola de remisión y las pruebas de contingencia no estén aprobados.

## Referencias

[1] [AEAT — Sistemas Informáticos de Facturación y VERI*FACTU](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html)

[2] [AEAT — FAQ Sistemas VERI*FACTU](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/sistemas-verifactu.html)
