ALTER TABLE `editorial_items` ADD `pending_channel_ids` json;--> statement-breakpoint
ALTER TABLE `editorial_items` ADD `pending_by` int;--> statement-breakpoint
ALTER TABLE `editorial_items` ADD CONSTRAINT `editorial_items_pending_by_users_id_fk` FOREIGN KEY (`pending_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;