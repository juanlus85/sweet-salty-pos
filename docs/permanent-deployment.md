# Despliegue permanente de Sweet & Salty POS

## Objetivo

Este paquete instala Sweet & Salty POS en `sweetsalty.thespotcentralhostel.com` como una aplicación Node.js persistente, separada de Hostel Management. La aplicación utiliza una base de datos MySQL propia y nunca debe recibir las credenciales de la base de datos del hostel.

> Antes de usar la aplicación con ventas reales, un responsable debe revisar la configuración fiscal, los artículos importados, los costes y el comportamiento del recargo de equivalencia con su asesoría fiscal.

## 1. Subdominio y HTTPS

En Plesk, crea el subdominio `sweetsalty.thespotcentralhostel.com` dentro del dominio principal y activa un certificado SSL válido para ese subdominio. Configura el document root del subdominio en una carpeta exclusiva, por ejemplo `sweetsalty.thespotcentralhostel.com/httpdocs`.

La aplicación escucha internamente en el puerto `3010`. Plesk debe actuar como proxy inverso hacia ese proceso Node.js. No es necesario exponer el puerto 3010 directamente a Internet.

## 2. Base de datos exclusiva

Crea una base de datos nueva, por ejemplo `sweetsalty_pos`, y un usuario exclusivo, por ejemplo `sweetsalty_pos_user`. Ese usuario no debe tener permisos sobre la base de datos de Hostel Management. Configura una cadena similar a esta en las variables de entorno de Node.js de Plesk:

```text
DATABASE_URL=mysql://sweetsalty_pos_user:CONTRASEÑA@localhost:3306/sweetsalty_pos
BUSINESS_TIMEZONE=Europe/Madrid
PORT=3010
NODE_ENV=production
```

Configura `POS_BASIC_AUTH_USER` y `POS_BASIC_AUTH_PASSWORD` para proteger el panel con una cuenta compartida. La demo temporal no utiliza autenticación, pero el sitio permanente debe protegerse.

## 3. Archivos y dependencias

Sube el contenido del paquete al `httpdocs` del subdominio. Instala las dependencias con Node.js 23.11.1 o una versión compatible:

```bash
pnpm install --prod=false
pnpm build
pnpm db:migrate
```

La carpeta `uploads/` debe permanecer en almacenamiento persistente y debe incluirse en las copias de seguridad. Contiene imágenes de artículos y documentos de facturas.

## 4. Arranque persistente

Con PM2:

```bash
mkdir -p logs uploads
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Si Plesk gestiona directamente la aplicación Node.js, usa `dist/index.js` como archivo de inicio, el puerto `3010` y `NODE_ENV=production`. Comprueba que `/api/health` responde con `status: ok` antes de abrir el subdominio al personal.

## 5. Restauración de los datos de la demo

El paquete puede incluir un volcado SQL de la demo. Impórtalo solamente si quieres conservar el catálogo, familias, existencias y datos de prueba actuales:

```bash
mysql -u sweetsalty_pos_user -p sweetsalty_pos < deploy/sweet-salty-pos-demo.sql
```

El volcado contiene ventas de prueba realizadas durante la validación. Para una puesta en producción limpia, crea la base de datos, ejecuta las migraciones y carga o revisa el catálogo antes de empezar a vender.

## 6. Impresora y cajón

La impresión de tickets utiliza el diálogo de impresión de Android o del navegador y está preparada para papel térmico de 80 mm. La apertura del cajón requiere que la impresora o un puente Android exponga una interfaz compatible. No debe considerarse habilitada hasta probar el modelo exacto de impresora y cajón.

## 7. Copias de seguridad

Programa diariamente una copia de la base de datos y del directorio `uploads/`. El script `deploy/backup-pos.sh` genera un archivo SQL comprimido y copia los documentos/imágenes. Conserva varias generaciones fuera del servidor.

## 8. Verificación tras reinicio

Después de reiniciar Node.js o el servidor, comprueba estos puntos:

| Comprobación | Resultado esperado |
|---|---|
| `GET /api/health` | Responde `status: ok`. |
| Subdominio HTTPS | Abre el TPV sin advertencia de certificado. |
| Inicio de sesión | La cuenta básica permite acceder y una contraseña incorrecta no entra. |
| Catálogo | Aparecen familias, artículos, precios, imágenes y existencias. |
| Venta de prueba | Se registra la venta, se descuenta stock y se actualiza caja. |
| Factura borrador | Se puede consultar y revisar antes de recibirla. |
| Backup | Existe una copia reciente de MySQL y `uploads/`. |
