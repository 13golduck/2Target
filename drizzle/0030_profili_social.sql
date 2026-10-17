CREATE TABLE `profile_setups` (
	`client_id` int NOT NULL,
	`platform` enum('facebook','instagram','tiktok','google_business') NOT NULL,
	`kit` json,
	`steps` json,
	`health` json,
	`updated_by` int,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profile_setups_client_id_platform_pk` PRIMARY KEY(`client_id`,`platform`)
);
--> statement-breakpoint
ALTER TABLE `profile_setups` ADD CONSTRAINT `profile_setups_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `profile_setups` ADD CONSTRAINT `profile_setups_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;