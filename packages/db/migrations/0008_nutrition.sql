CREATE TABLE `food_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`logged_at` text NOT NULL,
	`meal` text NOT NULL,
	`source` text NOT NULL,
	`items` text NOT NULL,
	`kcal` integer NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE INDEX `food_entry_user_seq_idx` ON `food_entry` (`user_id`,`server_seq`);--> statement-breakpoint
CREATE INDEX `food_entry_user_logged_idx` ON `food_entry` (`user_id`,`logged_at`);--> statement-breakpoint
ALTER TABLE `profile` ADD `nutrition` text;