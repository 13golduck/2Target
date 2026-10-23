CREATE TABLE `buyer_personas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`priority` int NOT NULL DEFAULT 1,
	`segment` enum('b2b','b2c'),
	`age_range` varchar(40),
	`needs` text,
	`interests` text,
	`channels` text,
	`values` text,
	`lever` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `buyer_personas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_items` (
	`campaign_id` int NOT NULL,
	`editorial_item_id` int NOT NULL,
	CONSTRAINT `campaign_items_campaign_id_editorial_item_id_pk` PRIMARY KEY(`campaign_id`,`editorial_item_id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`kind` enum('organico','sponsorizzato') NOT NULL,
	`platform` varchar(30) NOT NULL,
	`objective` varchar(60),
	`stage` enum('awareness','consideration','conversion','retention'),
	`budget` decimal(12,2),
	`starts_on` date,
	`ends_on` date,
	`external_id` varchar(120),
	`status` enum('pianificata','attiva','in_pausa','conclusa') NOT NULL DEFAULT 'pianificata',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `channel_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`social_account_id` int NOT NULL,
	`taken_at` date NOT NULL,
	`followers` int,
	`following` int,
	`posts_count` int,
	`posts_per_month` decimal(14,6),
	`avg_likes` decimal(14,6),
	`avg_comments` decimal(14,6),
	`engagement_rate` decimal(14,6),
	`follower_growth_30d` int,
	`source` enum('manuale','api') NOT NULL DEFAULT 'manuale',
	CONSTRAINT `channel_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `checkup_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`checkup_id` int NOT NULL,
	`section_key` varchar(60) NOT NULL,
	`content` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `checkup_sections_id` PRIMARY KEY(`id`),
	CONSTRAINT `checkup_sections_unique` UNIQUE(`checkup_id`,`section_key`)
);
--> statement-breakpoint
CREATE TABLE `checkups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`title` varchar(200) NOT NULL DEFAULT 'Communication Check-Up',
	`period` varchar(60),
	`status` enum('bozza','in_revisione','consegnato') NOT NULL DEFAULT 'bozza',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`delivered_at` datetime,
	CONSTRAINT `checkups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`sector` varchar(200),
	`website` varchar(255),
	`notes` text,
	`owner_id` int,
	`status` enum('onboarding','attivo','in_pausa','chiuso') NOT NULL DEFAULT 'onboarding',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `competitors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`location` varchar(160),
	`profile` text,
	`strengths` text,
	`weaknesses` text,
	`opportunities` text,
	`threats` text,
	`best_practices` text,
	`social_handles` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `competitors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content_pillars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	CONSTRAINT `content_pillars_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content_series` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	CONSTRAINT `content_series_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `editorial_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`plan_id` int,
	`idea_id` int,
	`series_id` int,
	`persona_id` int,
	`title` varchar(255) NOT NULL,
	`platform` enum('instagram','facebook','tiktok','linkedin','youtube','newsletter') NOT NULL DEFAULT 'instagram',
	`cross_post` json,
	`format` enum('reel','post','carosello','storia','video','articolo','email') NOT NULL,
	`stage` enum('awareness','consideration','conversion','retention'),
	`scheduled_at` datetime,
	`hook` text,
	`layout_notes` text,
	`script` text,
	`shot_list` json,
	`on_screen_text` text,
	`audio_notes` text,
	`caption` text,
	`hashtags` text,
	`cta` text,
	`cta_destination` enum('sito','telefono','whatsapp','direct','modulo','nessuna'),
	`cta_url` varchar(500),
	`references_urls` text,
	`needs_client_material` boolean NOT NULL DEFAULT false,
	`production_notes` text,
	`production_status` enum('da_fare','materiale_richiesto','in_montaggio','pronto') NOT NULL DEFAULT 'da_fare',
	`is_paid` boolean NOT NULL DEFAULT false,
	`ad_objective` enum('notorieta','traffico','interazione','contatti','messaggi','chiamate','vendite'),
	`ad_button` varchar(60),
	`ad_budget` decimal(12,2),
	`ad_days` int,
	`ad_audience` text,
	`status` enum('bozza','da_approvare','approvato','pubblicato','annullato') NOT NULL DEFAULT 'bozza',
	`internal_notes` text,
	`published_url` varchar(500),
	`external_post_id` varchar(120),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `editorial_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `editorial_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`starts_on` date NOT NULL,
	`ends_on` date NOT NULL,
	`min_per_week` int NOT NULL DEFAULT 3,
	`format_quotas` json,
	`platforms` json,
	`ads_budget` decimal(12,2),
	`brief` text,
	`status` enum('bozza','da_approvare','approvato','in_corso','chiuso') NOT NULL DEFAULT 'bozza',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `editorial_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `idea_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`idea_id` int NOT NULL,
	`author_id` int,
	`body` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `idea_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `idea_votes` (
	`idea_id` int NOT NULL,
	`user_id` int NOT NULL,
	`value` smallint NOT NULL,
	CONSTRAINT `idea_votes_idea_id_user_id_pk` PRIMARY KEY(`idea_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text,
	`format` enum('reel','post','carosello','storia','video','articolo','email'),
	`status` enum('idea','in_sviluppo','approvata','pianificata','scartata') NOT NULL DEFAULT 'idea',
	`stage` enum('awareness','consideration','conversion','retention'),
	`persona_id` int,
	`pillar_id` int,
	`origin` enum('team','ai','cliente') NOT NULL DEFAULT 'team',
	`parent_id` int,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ideas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kpi_measurements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kpi_id` int NOT NULL,
	`campaign_id` int,
	`period_start` date NOT NULL,
	`period_end` date NOT NULL,
	`value` decimal(14,6) NOT NULL,
	`sample` decimal(14,6),
	`source` enum('manuale','api','import') NOT NULL DEFAULT 'manuale',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kpi_measurements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kpis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`objective_id` int,
	`metric_key` varchar(60) NOT NULL,
	`label` varchar(160) NOT NULL,
	`scope` enum('organico','sponsorizzato','business') NOT NULL,
	`platform` varchar(30),
	`direction` enum('higher','lower') NOT NULL DEFAULT 'higher',
	`baseline` decimal(14,6),
	`target` decimal(14,6) NOT NULL,
	`warn_ratio` decimal(14,6) NOT NULL DEFAULT 0.9,
	`critical_ratio` decimal(14,6) NOT NULL DEFAULT 0.6,
	`min_sample` decimal(14,6),
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kpis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `objectives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`stage` enum('awareness','consideration','conversion','retention') NOT NULL,
	`micro_objectives` text,
	`strategic_goal` text NOT NULL,
	`operational_strategies` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `objectives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `post_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`editorial_item_id` int NOT NULL,
	`measured_at` datetime NOT NULL,
	`impressions` int,
	`reach` int,
	`likes` int,
	`comments` int,
	`shares` int,
	`saves` int,
	`video_views_3s` int,
	`profile_visits` int,
	`link_clicks` int,
	`spend` decimal(12,2),
	`leads` int,
	`purchases` int,
	`revenue` decimal(12,2),
	`source` enum('manuale','api','import') NOT NULL DEFAULT 'manuale',
	CONSTRAINT `post_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `social_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`platform` enum('instagram','facebook','tiktok','linkedin','youtube','newsletter') NOT NULL,
	`handle` varchar(120) NOT NULL,
	`external_id` varchar(120),
	`connected` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `social_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `social_accounts_unique` UNIQUE(`client_id`,`platform`,`handle`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(190) NOT NULL,
	`name` varchar(120) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` enum('admin','consulente') NOT NULL DEFAULT 'consulente',
	`active` boolean NOT NULL DEFAULT true,
	`last_login_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `buyer_personas` ADD CONSTRAINT `buyer_personas_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_items` ADD CONSTRAINT `campaign_items_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_items` ADD CONSTRAINT `campaign_items_editorial_item_id_editorial_items_id_fk` FOREIGN KEY (`editorial_item_id`) REFERENCES `editorial_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `channel_snapshots` ADD CONSTRAINT `channel_snapshots_social_account_id_social_accounts_id_fk` FOREIGN KEY (`social_account_id`) REFERENCES `social_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checkup_sections` ADD CONSTRAINT `checkup_sections_checkup_id_checkups_id_fk` FOREIGN KEY (`checkup_id`) REFERENCES `checkups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checkups` ADD CONSTRAINT `checkups_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clients` ADD CONSTRAINT `clients_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `competitors` ADD CONSTRAINT `competitors_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_pillars` ADD CONSTRAINT `content_pillars_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_series` ADD CONSTRAINT `content_series_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `editorial_items` ADD CONSTRAINT `editorial_items_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `editorial_items` ADD CONSTRAINT `editorial_items_plan_id_editorial_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `editorial_plans`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `editorial_items` ADD CONSTRAINT `editorial_items_idea_id_ideas_id_fk` FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `editorial_items` ADD CONSTRAINT `editorial_items_series_id_content_series_id_fk` FOREIGN KEY (`series_id`) REFERENCES `content_series`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `editorial_items` ADD CONSTRAINT `editorial_items_persona_id_buyer_personas_id_fk` FOREIGN KEY (`persona_id`) REFERENCES `buyer_personas`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `editorial_plans` ADD CONSTRAINT `editorial_plans_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_comments` ADD CONSTRAINT `idea_comments_idea_id_ideas_id_fk` FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_comments` ADD CONSTRAINT `idea_comments_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_votes` ADD CONSTRAINT `idea_votes_idea_id_ideas_id_fk` FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idea_votes` ADD CONSTRAINT `idea_votes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ideas` ADD CONSTRAINT `ideas_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ideas` ADD CONSTRAINT `ideas_persona_id_buyer_personas_id_fk` FOREIGN KEY (`persona_id`) REFERENCES `buyer_personas`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ideas` ADD CONSTRAINT `ideas_pillar_id_content_pillars_id_fk` FOREIGN KEY (`pillar_id`) REFERENCES `content_pillars`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ideas` ADD CONSTRAINT `ideas_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpi_measurements` ADD CONSTRAINT `kpi_measurements_kpi_id_kpis_id_fk` FOREIGN KEY (`kpi_id`) REFERENCES `kpis`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpi_measurements` ADD CONSTRAINT `kpi_measurements_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpis` ADD CONSTRAINT `kpis_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpis` ADD CONSTRAINT `kpis_objective_id_objectives_id_fk` FOREIGN KEY (`objective_id`) REFERENCES `objectives`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `objectives` ADD CONSTRAINT `objectives_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post_metrics` ADD CONSTRAINT `post_metrics_editorial_item_id_editorial_items_id_fk` FOREIGN KEY (`editorial_item_id`) REFERENCES `editorial_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD CONSTRAINT `social_accounts_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `editorial_items_plan` ON `editorial_items` (`plan_id`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `editorial_items_client` ON `editorial_items` (`client_id`);--> statement-breakpoint
CREATE INDEX `ideas_client` ON `ideas` (`client_id`,`status`);--> statement-breakpoint
CREATE INDEX `kpi_measurements_kpi` ON `kpi_measurements` (`kpi_id`,`period_end`);--> statement-breakpoint
CREATE INDEX `kpis_client` ON `kpis` (`client_id`);