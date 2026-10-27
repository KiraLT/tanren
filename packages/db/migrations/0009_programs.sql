CREATE TABLE `program` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`summary` text NOT NULL,
	`description` text,
	`days` text NOT NULL,
	`schedule` text NOT NULL,
	`source` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `program_user_seq_idx` ON `program` (`user_id`,`server_seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `program_user_slug_unique` ON `program` (`user_id`,`slug`) WHERE "program"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE `program_enrollment` ADD `swaps` text DEFAULT '[]' NOT NULL;