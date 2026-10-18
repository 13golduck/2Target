ALTER TABLE `clients` ADD `notify_published` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `publications` ADD `notified_status` varchar(20);--> statement-breakpoint
-- Gli esiti precedenti si considerano già comunicati: al primo avvio non partono email per il passato
UPDATE `publications` SET `notified_status` = `status` WHERE `status` IN ('pubblicata','errore');
