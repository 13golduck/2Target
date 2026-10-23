ALTER TABLE `media_assets` ADD `duration_sec` decimal(10,2);--> statement-breakpoint
ALTER TABLE `media_assets` ADD `video_codec` varchar(30);--> statement-breakpoint
ALTER TABLE `media_assets` ADD `process_state` enum('pronto','in_lavorazione','errore') DEFAULT 'pronto' NOT NULL;--> statement-breakpoint
ALTER TABLE `media_assets` ADD `process_note` varchar(300);