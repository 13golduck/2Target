CREATE TABLE `user_clients` (
	`user_id` int NOT NULL,
	`client_id` int NOT NULL,
	CONSTRAINT `user_clients_user_id_client_id_pk` PRIMARY KEY(`user_id`,`client_id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('superadmin','admin','consulente','user','viewer') NOT NULL DEFAULT 'user';--> statement-breakpoint
UPDATE `users` SET `role` = 'user' WHERE `role` = 'consulente';--> statement-breakpoint
-- Super admin: il titolare (a.infantino@golduck.it) oppure, se manca, il primo amministratore
UPDATE `users` SET `role` = 'superadmin' WHERE `email` = 'a.infantino@golduck.it';--> statement-breakpoint
UPDATE `users` SET `role` = 'superadmin' WHERE `id` = (SELECT `id` FROM (SELECT `id` FROM `users` WHERE `role` = 'admin' ORDER BY `id` LIMIT 1) AS `t`) AND NOT EXISTS (SELECT 1 FROM (SELECT `id` FROM `users` WHERE `role` = 'superadmin') AS `s`);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('superadmin','admin','user','viewer') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `user_clients` ADD CONSTRAINT `user_clients_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_clients` ADD CONSTRAINT `user_clients_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;