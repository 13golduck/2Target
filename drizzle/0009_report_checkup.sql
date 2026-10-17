ALTER TABLE `checkups` ADD `register` enum('auto','istituzionale','commerciale') DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `checkups` ADD `method_version` int;--> statement-breakpoint
ALTER TABLE `checkups` ADD `report` json;