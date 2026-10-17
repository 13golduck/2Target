CREATE TABLE `login_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`code_hash` varchar(128) NOT NULL,
	`expires_at` datetime NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`used_at` datetime,
	`request_ip` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `password_hash` varchar(255);--> statement-breakpoint
ALTER TABLE `login_codes` ADD CONSTRAINT `login_codes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `login_codes_user` ON `login_codes` (`user_id`,`created_at`);