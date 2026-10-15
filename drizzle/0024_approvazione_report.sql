CREATE TABLE `item_feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`client_id` int NOT NULL,
	`author` varchar(120) NOT NULL,
	`decision` enum('approvato','modifiche','commento') NOT NULL,
	`message` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `item_feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `approval_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `report_email` varchar(255);--> statement-breakpoint
ALTER TABLE `clients` ADD `report_monthly` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `report_last_month` varchar(7);--> statement-breakpoint
ALTER TABLE `item_feedback` ADD CONSTRAINT `item_feedback_item_id_editorial_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `editorial_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_feedback` ADD CONSTRAINT `item_feedback_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `item_feedback_item` ON `item_feedback` (`item_id`,`created_at`);