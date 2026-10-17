ALTER TABLE `buyer_personas` ADD `checkup_id` int;--> statement-breakpoint
ALTER TABLE `checkups` ADD `previous_id` int;--> statement-breakpoint
ALTER TABLE `checkups` ADD `kpi_snapshot` json;--> statement-breakpoint
ALTER TABLE `checkups` ADD `completed_at` datetime;--> statement-breakpoint
ALTER TABLE `competitors` ADD `checkup_id` int;--> statement-breakpoint
ALTER TABLE `objectives` ADD `checkup_id` int;--> statement-breakpoint
ALTER TABLE `buyer_personas` ADD CONSTRAINT `buyer_personas_checkup_id_checkups_id_fk` FOREIGN KEY (`checkup_id`) REFERENCES `checkups`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `competitors` ADD CONSTRAINT `competitors_checkup_id_checkups_id_fk` FOREIGN KEY (`checkup_id`) REFERENCES `checkups`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `objectives` ADD CONSTRAINT `objectives_checkup_id_checkups_id_fk` FOREIGN KEY (`checkup_id`) REFERENCES `checkups`(`id`) ON DELETE set null ON UPDATE no action;