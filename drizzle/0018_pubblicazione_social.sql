CREATE TABLE `media_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`item_id` int,
	`kind` enum('image','video') NOT NULL,
	`mime` varchar(60) NOT NULL,
	`file_name` varchar(200) NOT NULL,
	`storage_key` varchar(80) NOT NULL,
	`size` int NOT NULL,
	`width` int,
	`height` int,
	`position` int NOT NULL DEFAULT 0,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_assets_id` PRIMARY KEY(`id`),
	CONSTRAINT `media_assets_storage_key_unique` UNIQUE(`storage_key`)
);
--> statement-breakpoint
CREATE TABLE `publications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`client_id` int NOT NULL,
	`social_account_id` int NOT NULL,
	`status` enum('programmata','in_corso','pubblicata','errore','annullata') NOT NULL DEFAULT 'programmata',
	`scheduled_at` datetime NOT NULL,
	`format` enum('reel','post','carosello','storia','video','articolo','email') NOT NULL,
	`caption` text,
	`media_ids` json NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`external_id` varchar(120),
	`permalink` varchar(500),
	`error` text,
	`published_at` datetime,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `publications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `can_publish` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD CONSTRAINT `social_accounts_external` UNIQUE(`platform`,`external_id`);--> statement-breakpoint
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_item_id_editorial_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `editorial_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_item_id_editorial_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `editorial_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_social_account_id_social_accounts_id_fk` FOREIGN KEY (`social_account_id`) REFERENCES `social_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `media_assets_item` ON `media_assets` (`item_id`,`position`);--> statement-breakpoint
CREATE INDEX `publications_due` ON `publications` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `publications_item` ON `publications` (`item_id`);