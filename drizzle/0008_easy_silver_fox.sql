CREATE TABLE `pos_fiscal_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fiscal_record_id` int NOT NULL,
	`environment` enum('sandbox','production') NOT NULL DEFAULT 'sandbox',
	`status` enum('blocked','pending','sending','accepted','rejected','error') NOT NULL DEFAULT 'blocked',
	`attempt_count` int NOT NULL DEFAULT 0,
	`request_payload` json,
	`response_payload` json,
	`last_error` text,
	`last_attempt_at` timestamp,
	`next_retry_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_fiscal_submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `pos_fiscal_submissions_record_index` ON `pos_fiscal_submissions` (`fiscal_record_id`,`status`);--> statement-breakpoint
CREATE INDEX `pos_fiscal_submissions_retry_index` ON `pos_fiscal_submissions` (`status`,`next_retry_at`);