CREATE TABLE `program_day_completion` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`enrollment_id` text NOT NULL,
	`day_number` integer NOT NULL,
	`completed_at` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`session_id` text,
	FOREIGN KEY (`enrollment_id`) REFERENCES `program_enrollment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `program_day_completion_user_seq_idx` ON `program_day_completion` (`user_id`,`server_seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `program_day_completion_enrollment_day_unique` ON `program_day_completion` (`enrollment_id`,`day_number`) WHERE "program_day_completion"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `program_enrollment` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`program_id` text NOT NULL,
	`started_on` text NOT NULL,
	`status` text NOT NULL,
	`current_day` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `program_enrollment_user_seq_idx` ON `program_enrollment` (`user_id`,`server_seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `program_enrollment_user_program_active_unique` ON `program_enrollment` (`user_id`,`program_id`) WHERE "program_enrollment"."deleted_at" IS NULL AND "program_enrollment"."status" = 'active';--> statement-breakpoint
ALTER TABLE `exercise` ADD `catalog_id` text;--> statement-breakpoint
CREATE INDEX `exercise_user_catalog_idx` ON `exercise` (`user_id`,`catalog_id`);