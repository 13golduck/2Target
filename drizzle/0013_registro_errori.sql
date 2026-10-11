CREATE TABLE `error_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`area` varchar(60) NOT NULL,
	`message` varchar(1000) NOT NULL,
	`detail` text,
	`path` varchar(300),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `error_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `error_logs` ADD CONSTRAINT `error_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `error_logs_user` ON `error_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `error_logs_created` ON `error_logs` (`created_at`);