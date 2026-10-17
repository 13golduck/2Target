CREATE TABLE `ad_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`item_id` int,
	`publication_id` int,
	`platform` enum('facebook','instagram') NOT NULL,
	`payer` enum('cliente','golduck') NOT NULL,
	`ad_account_id` varchar(40) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'EUR',
	`objective` enum('notorieta','traffico','interazione','contatti','messaggi','chiamate','vendite') NOT NULL,
	`budget` decimal(12,2) NOT NULL,
	`start_at` datetime NOT NULL,
	`end_at` datetime NOT NULL,
	`targeting` json NOT NULL,
	`status` enum('in_avvio','attiva','in_pausa','terminata','errore') NOT NULL DEFAULT 'in_avvio',
	`simulated` boolean NOT NULL DEFAULT false,
	`meta_campaign_id` varchar(40),
	`meta_adset_id` varchar(40),
	`meta_ad_id` varchar(40),
	`spend` decimal(12,2) NOT NULL DEFAULT 0,
	`results` json,
	`error` text,
	`last_sync_at` datetime,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ad_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ad_spend_daily` (
	`campaign_id` int NOT NULL,
	`day` date NOT NULL,
	`spend_eur` decimal(12,2) NOT NULL,
	CONSTRAINT `ad_spend_daily_campaign_id_day_pk` PRIMARY KEY(`campaign_id`,`day`)
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `ads_payer` enum('cliente','golduck') DEFAULT 'cliente' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `ad_account_id` varchar(40);--> statement-breakpoint
ALTER TABLE `clients` ADD `ad_account_name` varchar(200);--> statement-breakpoint
ALTER TABLE `clients` ADD `ad_account_currency` varchar(3);--> statement-breakpoint
ALTER TABLE `clients` ADD `ads_monthly_cap` decimal(12,2);--> statement-breakpoint
ALTER TABLE `clients` ADD `ads_markup` decimal(5,2) DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD CONSTRAINT `ad_campaigns_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD CONSTRAINT `ad_campaigns_item_id_editorial_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `editorial_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD CONSTRAINT `ad_campaigns_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD CONSTRAINT `ad_campaigns_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ad_spend_daily` ADD CONSTRAINT `ad_spend_daily_campaign_id_ad_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `ad_campaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ad_campaigns_client` ON `ad_campaigns` (`client_id`,`status`);