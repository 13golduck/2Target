ALTER TABLE `ai_runs` ADD `cost_eur` decimal(10,4) DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Storico: cambio BCE del 14/10/2026 (1 € = 1,1195 $) e ricarico 1,8
UPDATE `ai_runs` SET `cost_eur` = ROUND(`cost_usd` / 1.1195 * 1.8, 4);
