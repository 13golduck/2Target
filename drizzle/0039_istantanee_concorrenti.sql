CREATE TABLE `competitor_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`competitor_id` int NOT NULL,
	`day` date NOT NULL,
	`username` varchar(60) NOT NULL,
	`followers` int,
	`media_count` int,
	`posts_per_week_x10` int,
	`avg_interactions` int,
	`er_bp` int,
	`reels_share` int,
	`last_post_at` datetime,
	`top_posts` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `competitor_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `competitor_snapshots_day` UNIQUE(`competitor_id`,`day`)
);
--> statement-breakpoint
ALTER TABLE `competitor_snapshots` ADD CONSTRAINT `competitor_snapshots_competitor_id_competitors_id_fk` FOREIGN KEY (`competitor_id`) REFERENCES `competitors`(`id`) ON DELETE cascade ON UPDATE no action;