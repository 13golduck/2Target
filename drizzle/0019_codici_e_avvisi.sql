ALTER TABLE `audit_logs` MODIFY COLUMN `category` enum('accesso','utenti','impostazioni','clienti','checkup','contenuti','lead','canali','grafica','errori','avvisi','sistema') NOT NULL;--> statement-breakpoint
ALTER TABLE `login_codes` ADD `purpose` enum('login','settings') DEFAULT 'login' NOT NULL;--> statement-breakpoint
CREATE INDEX `login_codes_user_purpose` ON `login_codes` (`user_id`,`purpose`,`created_at`);--> statement-breakpoint
DROP INDEX `login_codes_user` ON `login_codes`;
