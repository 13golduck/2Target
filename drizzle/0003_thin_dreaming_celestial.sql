CREATE TABLE `lead_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lead_id` int NOT NULL,
	`from_stage` enum('nuovo','contattato','qualificato','preventivo','vinto','perso'),
	`to_stage` enum('nuovo','contattato','qualificato','preventivo','vinto','perso') NOT NULL,
	`at` datetime NOT NULL,
	`user_id` int,
	CONSTRAINT `lead_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`received_at` datetime NOT NULL,
	`name` varchar(200),
	`company` varchar(200),
	`email` varchar(200),
	`phone` varchar(60),
	`message` text,
	`source` enum('meta_ads','instagram','facebook','tiktok','linkedin','google_ads','seo','sito','whatsapp','telefono','email','passaparola','evento','altro') NOT NULL DEFAULT 'altro',
	`campaign_id` int,
	`editorial_item_id` int,
	`utm_source` varchar(120),
	`utm_medium` varchar(120),
	`utm_campaign` varchar(200),
	`landing_url` varchar(500),
	`stage` enum('nuovo','contattato','qualificato','preventivo','vinto','perso') NOT NULL DEFAULT 'nuovo',
	`stage_changed_at` datetime,
	`lost_reason` varchar(255),
	`estimated_value` decimal(12,2),
	`won_value` decimal(12,2),
	`won_at` datetime,
	`assigned_to` int,
	`notes` text,
	`external_id` varchar(120),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`),
	CONSTRAINT `leads_external` UNIQUE(`client_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `marketing_costs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`month` date NOT NULL,
	`source` enum('meta_ads','instagram','facebook','tiktok','linkedin','google_ads','seo','sito','whatsapp','telefono','email','passaparola','evento','altro') NOT NULL,
	`kind` enum('inserzioni','produzione','consulenza','strumenti','eventi','altro') NOT NULL DEFAULT 'inserzioni',
	`amount` decimal(12,2) NOT NULL,
	`campaign_id` int,
	`notes` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketing_costs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `lead_token` varchar(64);--> statement-breakpoint
ALTER TABLE `clients` ADD CONSTRAINT `clients_lead_token_unique` UNIQUE(`lead_token`);--> statement-breakpoint
ALTER TABLE `lead_events` ADD CONSTRAINT `lead_events_lead_id_leads_id_fk` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lead_events` ADD CONSTRAINT `lead_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leads` ADD CONSTRAINT `leads_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leads` ADD CONSTRAINT `leads_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leads` ADD CONSTRAINT `leads_editorial_item_id_editorial_items_id_fk` FOREIGN KEY (`editorial_item_id`) REFERENCES `editorial_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leads` ADD CONSTRAINT `leads_assigned_to_users_id_fk` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `marketing_costs` ADD CONSTRAINT `marketing_costs_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `marketing_costs` ADD CONSTRAINT `marketing_costs_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `leads_client` ON `leads` (`client_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `marketing_costs_client` ON `marketing_costs` (`client_id`,`month`);