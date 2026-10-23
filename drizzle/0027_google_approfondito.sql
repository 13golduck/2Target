CREATE TABLE `seo_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`data` json NOT NULL,
	`ideas_created` int NOT NULL DEFAULT 0,
	`trigger` enum('manuale','mensile') NOT NULL DEFAULT 'manuale',
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seo_analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `seo_snapshots` MODIFY COLUMN `kind` enum('queries','pages','pagespeed','queries_prev','pages_prev','devices','summary','landing_pages','campaigns','conversions','gbp_reviews','ads_campaigns') NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` MODIFY COLUMN `platform` enum('instagram','facebook','tiktok','linkedin','youtube','search_console','ga4','business_profile','website','google_ads') NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `brand_terms` varchar(500);--> statement-breakpoint
ALTER TABLE `seo_analyses` ADD CONSTRAINT `seo_analyses_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seo_analyses` ADD CONSTRAINT `seo_analyses_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `seo_analyses_client` ON `seo_analyses` (`client_id`,`created_at`);