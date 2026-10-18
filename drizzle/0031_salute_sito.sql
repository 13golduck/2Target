CREATE TABLE `site_health_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`social_account_id` int,
	`url` varchar(255) NOT NULL,
	`score` smallint NOT NULL,
	`severity` enum('ok','attenzione','grave') NOT NULL,
	`checks` json,
	`fingerprint` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `site_health_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `site_health_checks` ADD CONSTRAINT `site_health_checks_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `site_health_checks` ADD CONSTRAINT `site_health_checks_social_account_id_social_accounts_id_fk` FOREIGN KEY (`social_account_id`) REFERENCES `social_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `site_health_client` ON `site_health_checks` (`client_id`);--> statement-breakpoint
CREATE INDEX `site_health_channel_date` ON `site_health_checks` (`social_account_id`,`created_at`);