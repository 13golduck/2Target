CREATE TABLE `brand_kits` (
	`client_id` int NOT NULL,
	`data` json NOT NULL,
	`logo` mediumtext,
	`updated_by` int,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `brand_kits_client_id` PRIMARY KEY(`client_id`)
);
--> statement-breakpoint
CREATE TABLE `design_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`item_id` int,
	`file_name` varchar(200),
	`thumb` mediumtext,
	`result` json NOT NULL,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `design_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `checkups` ADD `reasoning` enum('veloce','avanzato') DEFAULT 'avanzato' NOT NULL;--> statement-breakpoint
ALTER TABLE `editorial_items` ADD `creative_brief` json;--> statement-breakpoint
ALTER TABLE `brand_kits` ADD CONSTRAINT `brand_kits_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `brand_kits` ADD CONSTRAINT `brand_kits_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_reviews` ADD CONSTRAINT `design_reviews_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_reviews` ADD CONSTRAINT `design_reviews_item_id_editorial_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `editorial_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_reviews` ADD CONSTRAINT `design_reviews_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `design_reviews_client` ON `design_reviews` (`client_id`,`created_at`);