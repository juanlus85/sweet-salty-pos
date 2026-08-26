ALTER TABLE `pos_products` ADD COLUMN IF NOT EXISTS `image_zoom` decimal(5,2) NOT NULL DEFAULT '1.00';
ALTER TABLE `pos_products` ADD COLUMN IF NOT EXISTS `image_position_x` decimal(5,2) NOT NULL DEFAULT '50.00';
ALTER TABLE `pos_products` ADD COLUMN IF NOT EXISTS `image_position_y` decimal(5,2) NOT NULL DEFAULT '50.00';

SELECT 'Encuadre de imágenes de artículos listo' AS resultado;
