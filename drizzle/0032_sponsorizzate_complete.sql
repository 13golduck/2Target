CREATE TABLE `ad_lead_forms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`page_id` varchar(40) NOT NULL,
	`meta_form_id` varchar(40),
	`name` varchar(200) NOT NULL,
	`fields` json NOT NULL,
	`custom_question` varchar(300),
	`intro` varchar(500),
	`privacy_url` varchar(500) NOT NULL,
	`thank_you` varchar(300),
	`simulated` boolean NOT NULL DEFAULT false,
	`leads_count` int NOT NULL DEFAULT 0,
	`last_leads_sync_at` datetime,
	`error` text,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ad_lead_forms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ad_campaigns` MODIFY COLUMN `platform` enum('facebook','instagram','entrambi') NOT NULL;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `kind` enum('boost','campagna','contatti') DEFAULT 'boost' NOT NULL;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `name` varchar(200);--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `creative` json;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `lead_form_id` int;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `meta_creative_id` varchar(40);--> statement-breakpoint
ALTER TABLE `ad_lead_forms` ADD CONSTRAINT `ad_lead_forms_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ad_lead_forms` ADD CONSTRAINT `ad_lead_forms_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ad_lead_forms_client` ON `ad_lead_forms` (`client_id`);--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD CONSTRAINT `ad_campaigns_lead_form_id_ad_lead_forms_id_fk` FOREIGN KEY (`lead_form_id`) REFERENCES `ad_lead_forms`(`id`) ON DELETE set null ON UPDATE no action;