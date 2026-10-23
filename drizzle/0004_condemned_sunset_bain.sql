CREATE TABLE `ai_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int,
	`checkup_id` int,
	`step` varchar(60) NOT NULL,
	`model` varchar(60) NOT NULL,
	`input_tokens` int NOT NULL DEFAULT 0,
	`output_tokens` int NOT NULL DEFAULT 0,
	`cache_read_tokens` int NOT NULL DEFAULT 0,
	`cache_write_tokens` int NOT NULL DEFAULT 0,
	`web_searches` int NOT NULL DEFAULT 0,
	`web_fetches` int NOT NULL DEFAULT 0,
	`cost_usd` decimal(10,4) NOT NULL DEFAULT 0,
	`duration_ms` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `checkup_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`checkup_id` int NOT NULL,
	`round` int NOT NULL,
	`position` int NOT NULL,
	`topic` varchar(80),
	`question` text NOT NULL,
	`why` text,
	`options` json,
	`answer` text,
	`answered_at` datetime,
	CONSTRAINT `checkup_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `checkups` ADD `ai_mode` enum('opus','sonnet','misto');--> statement-breakpoint
ALTER TABLE `checkups` ADD `ai_state` enum('da_avviare','ricognizione','domande','ricerca','scrittura','pronto','errore') DEFAULT 'da_avviare' NOT NULL;--> statement-breakpoint
ALTER TABLE `checkups` ADD `ai_progress` text;--> statement-breakpoint
ALTER TABLE `checkups` ADD `ai_log` json;--> statement-breakpoint
ALTER TABLE `checkups` ADD `ai_error` text;--> statement-breakpoint
ALTER TABLE `checkups` ADD `dossier` text;--> statement-breakpoint
ALTER TABLE `checkups` ADD `findings` json;--> statement-breakpoint
ALTER TABLE `checkups` ADD `sources` json;--> statement-breakpoint
ALTER TABLE `checkups` ADD `question_round` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `vat_number` varchar(32);--> statement-breakpoint
ALTER TABLE `clients` ADD `city` varchar(120);--> statement-breakpoint
ALTER TABLE `clients` ADD `contact_name` varchar(160);--> statement-breakpoint
ALTER TABLE `clients` ADD `social_links` text;--> statement-breakpoint
ALTER TABLE `ai_runs` ADD CONSTRAINT `ai_runs_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_runs` ADD CONSTRAINT `ai_runs_checkup_id_checkups_id_fk` FOREIGN KEY (`checkup_id`) REFERENCES `checkups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checkup_questions` ADD CONSTRAINT `checkup_questions_checkup_id_checkups_id_fk` FOREIGN KEY (`checkup_id`) REFERENCES `checkups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_runs_checkup` ON `ai_runs` (`checkup_id`);