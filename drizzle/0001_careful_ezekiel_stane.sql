CREATE TABLE `channel_daily` (
	`social_account_id` int NOT NULL,
	`day` date NOT NULL,
	`metric` varchar(60) NOT NULL,
	`value` decimal(14,6) NOT NULL,
	CONSTRAINT `channel_daily_social_account_id_day_metric_pk` PRIMARY KEY(`social_account_id`,`day`,`metric`)
);
--> statement-breakpoint
CREATE TABLE `connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`provider` enum('meta','google','tiktok','linkedin') NOT NULL,
	`external_user_id` varchar(120) NOT NULL,
	`account_name` varchar(200),
	`access_token_enc` text NOT NULL,
	`refresh_token_enc` text,
	`expires_at` datetime,
	`scopes` text,
	`status` enum('attivo','scaduto','errore') NOT NULL DEFAULT 'attivo',
	`last_error` text,
	`connected_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `connections_unique` UNIQUE(`client_id`,`provider`,`external_user_id`)
);
--> statement-breakpoint
CREATE TABLE `seo_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`social_account_id` int NOT NULL,
	`kind` enum('queries','pages','pagespeed') NOT NULL,
	`period_start` date NOT NULL,
	`period_end` date NOT NULL,
	`rows` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seo_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `social_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`social_account_id` int NOT NULL,
	`external_id` varchar(120) NOT NULL,
	`editorial_item_id` int,
	`media_type` varchar(40),
	`permalink` varchar(500),
	`caption` text,
	`thumbnail_url` text,
	`published_at` datetime,
	`metrics` json,
	`synced_at` datetime,
	CONSTRAINT `social_posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `social_posts_unique` UNIQUE(`social_account_id`,`external_id`)
);
--> statement-breakpoint
ALTER TABLE `social_accounts` MODIFY COLUMN `platform` enum('instagram','facebook','tiktok','linkedin','youtube','search_console','ga4','business_profile','website') NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` MODIFY COLUMN `handle` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` MODIFY COLUMN `external_id` varchar(255);--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `connection_id` int;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `name` varchar(255);--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `picture_url` text;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `asset_token_enc` text;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `last_sync_at` datetime;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `last_sync_error` text;--> statement-breakpoint
ALTER TABLE `channel_daily` ADD CONSTRAINT `channel_daily_social_account_id_social_accounts_id_fk` FOREIGN KEY (`social_account_id`) REFERENCES `social_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `connections` ADD CONSTRAINT `connections_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `connections` ADD CONSTRAINT `connections_connected_by_users_id_fk` FOREIGN KEY (`connected_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seo_snapshots` ADD CONSTRAINT `seo_snapshots_social_account_id_social_accounts_id_fk` FOREIGN KEY (`social_account_id`) REFERENCES `social_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_posts` ADD CONSTRAINT `social_posts_social_account_id_social_accounts_id_fk` FOREIGN KEY (`social_account_id`) REFERENCES `social_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_posts` ADD CONSTRAINT `social_posts_editorial_item_id_editorial_items_id_fk` FOREIGN KEY (`editorial_item_id`) REFERENCES `editorial_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `seo_snapshots_lookup` ON `seo_snapshots` (`social_account_id`,`kind`,`period_end`);--> statement-breakpoint
CREATE INDEX `social_posts_date` ON `social_posts` (`social_account_id`,`published_at`);--> statement-breakpoint
ALTER TABLE `social_accounts` ADD CONSTRAINT `social_accounts_connection_id_connections_id_fk` FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON DELETE set null ON UPDATE no action;