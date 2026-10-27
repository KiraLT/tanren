CREATE TABLE `daily_health` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`provider` text NOT NULL,
	`date` text NOT NULL,
	`total_calories` integer,
	`active_calories` integer,
	`steps` integer,
	`resting_heart_rate` integer
);
--> statement-breakpoint
CREATE INDEX `daily_health_user_seq_idx` ON `daily_health` (`user_id`,`server_seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_health_user_provider_date_unique` ON `daily_health` (`user_id`,`provider`,`date`);--> statement-breakpoint
CREATE TABLE `imported_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`sport` text NOT NULL,
	`title` text NOT NULL,
	`started_at` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`distance_meters` real,
	`calories` integer,
	`avg_heart_rate` integer,
	`max_heart_rate` integer
);
--> statement-breakpoint
CREATE INDEX `imported_activity_user_seq_idx` ON `imported_activity` (`user_id`,`server_seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `imported_activity_user_provider_external_unique` ON `imported_activity` (`user_id`,`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `imported_activity_user_started_idx` ON `imported_activity` (`user_id`,`started_at`);