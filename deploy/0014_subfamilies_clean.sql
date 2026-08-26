ALTER TABLE `pos_categories` ADD COLUMN IF NOT EXISTS `parent_category_id` int NULL;

CREATE INDEX IF NOT EXISTS `pos_categories_parent_index` ON `pos_categories` (`parent_category_id`, `is_active`);

SELECT 'Familias y subfamilias locales listas' AS resultado;
