ALTER TABLE `editorial_items` ADD `first_comment` text;--> statement-breakpoint
ALTER TABLE `editorial_items` ADD `collaborators` json;--> statement-breakpoint
ALTER TABLE `editorial_items` ADD `tag_location` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `publications` ADD `extras` json;