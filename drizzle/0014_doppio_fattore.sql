ALTER TABLE `users` ADD `totp_secret` text;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_enabled_at` datetime;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_recovery` json;