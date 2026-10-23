CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`actor` varchar(200),
	`category` enum('accesso','utenti','impostazioni','clienti','checkup','contenuti','lead','canali','grafica','sistema') NOT NULL,
	`action` varchar(60) NOT NULL,
	`description` varchar(600) NOT NULL,
	`client_id` int,
	`target` varchar(80),
	`meta` json,
	`ip` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_created` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_user` ON `audit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_client` ON `audit_logs` (`client_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_category` ON `audit_logs` (`category`,`created_at`);--> statement-breakpoint
INSERT INTO `error_logs` (`user_id`, `area`, `message`, `detail`, `path`, `created_at`)
SELECT NULL, 'Check-up AI', LEFT(`ai_error`, 1000), CONCAT('Errore avvenuto prima dell''attivazione del registro errori (check-up ', `id`, ' creato il ', DATE_FORMAT(`created_at`, '%d/%m/%Y %H:%i'), ' UTC). La data di questa voce è quella del recupero.'), CONCAT('/clienti/', `client_id`, '/checkup?id=', `id`), now()
FROM `checkups` WHERE `ai_error` IS NOT NULL AND `ai_error` <> '';
