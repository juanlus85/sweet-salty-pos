CREATE TABLE `pos_open_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slot_number` int NOT NULL,
	`cart` json NOT NULL,
	`saved_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_open_tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_open_tickets_slot_unique` UNIQUE(`slot_number`)
);
