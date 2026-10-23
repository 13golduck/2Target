ALTER TABLE `editorial_items` ADD `evergreen` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `editorial_items` ADD `recycled_from_id` int;--> statement-breakpoint
ALTER TABLE `editorial_items` ADD CONSTRAINT `editorial_items_recycled_from_id_editorial_items_id_fk` FOREIGN KEY (`recycled_from_id`) REFERENCES `editorial_items`(`id`) ON DELETE set null ON UPDATE no action;