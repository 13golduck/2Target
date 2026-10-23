ALTER TABLE `media_assets` ADD `studio_item_id` int;--> statement-breakpoint
ALTER TABLE `media_assets` ADD `origin` enum('caricato','grafica','ai') DEFAULT 'caricato' NOT NULL;--> statement-breakpoint
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_studio_item_id_editorial_items_id_fk` FOREIGN KEY (`studio_item_id`) REFERENCES `editorial_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `media_assets_studio` ON `media_assets` (`studio_item_id`);