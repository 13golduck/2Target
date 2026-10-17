ALTER TABLE `audit_logs` MODIFY COLUMN `category` enum('accesso','utenti','impostazioni','clienti','checkup','contenuti','lead','canali','grafica','errori','sistema') NOT NULL;--> statement-breakpoint
INSERT INTO `audit_logs` (`user_id`, `actor`, `category`, `action`, `description`, `client_id`, `target`, `meta`, `path`, `created_at`)
SELECT e.`user_id`,
  CASE WHEN u.`id` IS NULL THEN NULL ELSE CONCAT(u.`name`, ' <', u.`email`, '>') END,
  'errori',
  LEFT(CONCAT('errore.', LOWER(REPLACE(REPLACE(e.`area`, ' ', '_'), ':', ''))), 60),
  LEFT(e.`message`, 600),
  NULL,
  NULL,
  JSON_OBJECT('area', e.`area`, 'messaggio', e.`message`, 'dettaglio', e.`detail`),
  e.`path`,
  e.`created_at`
FROM `error_logs` e LEFT JOIN `users` u ON u.`id` = e.`user_id`;--> statement-breakpoint
DROP TABLE `error_logs`;
