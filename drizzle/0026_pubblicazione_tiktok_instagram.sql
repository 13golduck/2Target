ALTER TABLE `connections` MODIFY COLUMN `provider` enum('meta','google','tiktok','linkedin','instagram') NOT NULL;--> statement-breakpoint
ALTER TABLE `publications` ADD `options` json;