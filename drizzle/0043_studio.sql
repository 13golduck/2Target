CREATE TABLE `studio_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`role` enum('utente','ai') NOT NULL,
	`text` text NOT NULL,
	`version_n` int,
	`user_id` int,
	`cost_eur` decimal(10,4),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `studio_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `studio_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`n` int NOT NULL,
	`author` enum('ai','utente') NOT NULL,
	`user_id` int,
	`summary` varchar(255) NOT NULL,
	`state` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `studio_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `studio_versions_item_n` UNIQUE(`item_id`,`n`)
);
--> statement-breakpoint
ALTER TABLE `studio_messages` ADD CONSTRAINT `studio_messages_item_id_editorial_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `editorial_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studio_messages` ADD CONSTRAINT `studio_messages_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studio_versions` ADD CONSTRAINT `studio_versions_item_id_editorial_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `editorial_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studio_versions` ADD CONSTRAINT `studio_versions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `studio_messages_item` ON `studio_messages` (`item_id`,`id`);