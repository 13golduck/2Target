ALTER TABLE `checkups` ADD `foundation_state` enum('nessuna','in_corso','pronta','errore') DEFAULT 'nessuna' NOT NULL;--> statement-breakpoint
ALTER TABLE `checkups` ADD `foundation_progress` text;--> statement-breakpoint
ALTER TABLE `checkups` ADD `foundation_error` text;--> statement-breakpoint
ALTER TABLE `checkups` ADD `foundation` json;--> statement-breakpoint
ALTER TABLE `checkups` ADD `foundation_at` datetime;--> statement-breakpoint
ALTER TABLE `content_pillars` ADD `checkup_id` int;--> statement-breakpoint
ALTER TABLE `content_pillars` ADD `evidence` text;--> statement-breakpoint
ALTER TABLE `editorial_plans` ADD `checkup_id` int;--> statement-breakpoint
ALTER TABLE `ideas` ADD `checkup_id` int;--> statement-breakpoint
ALTER TABLE `ideas` ADD `evidence` text;--> statement-breakpoint
ALTER TABLE `kpis` ADD `checkup_id` int;--> statement-breakpoint
ALTER TABLE `kpis` ADD `evidence` text;--> statement-breakpoint
ALTER TABLE `content_pillars` ADD CONSTRAINT `content_pillars_checkup_id_checkups_id_fk` FOREIGN KEY (`checkup_id`) REFERENCES `checkups`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `editorial_plans` ADD CONSTRAINT `editorial_plans_checkup_id_checkups_id_fk` FOREIGN KEY (`checkup_id`) REFERENCES `checkups`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ideas` ADD CONSTRAINT `ideas_checkup_id_checkups_id_fk` FOREIGN KEY (`checkup_id`) REFERENCES `checkups`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpis` ADD CONSTRAINT `kpis_checkup_id_checkups_id_fk` FOREIGN KEY (`checkup_id`) REFERENCES `checkups`(`id`) ON DELETE set null ON UPDATE no action;