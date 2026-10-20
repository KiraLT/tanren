CREATE TABLE `exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`name` text NOT NULL,
	`aliases` text NOT NULL,
	`muscle_groups` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `exercise_user_seq_idx` ON `exercise` (`user_id`,`server_seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_user_name_unique` ON `exercise` (`user_id`,lower("name")) WHERE "exercise"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `plan` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`name` text NOT NULL,
	`goal` text NOT NULL,
	`start_date` text NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plan_user_seq_idx` ON `plan` (`user_id`,`server_seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_user_active_unique` ON `plan` (`user_id`) WHERE "plan"."status" = 'active' AND "plan"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `plan_week` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`plan_id` text NOT NULL,
	`week_start` text NOT NULL,
	`intent` text,
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plan_week_user_seq_idx` ON `plan_week` (`user_id`,`server_seq`);--> statement-breakpoint
CREATE INDEX `plan_week_plan_id_idx` ON `plan_week` (`plan_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_week_plan_week_start_unique` ON `plan_week` (`plan_id`,`week_start`) WHERE "plan_week"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `planned_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`plan_week_id` text NOT NULL,
	`order` integer NOT NULL,
	`name` text NOT NULL,
	`scheduled_date` text,
	`notes` text,
	FOREIGN KEY (`plan_week_id`) REFERENCES `plan_week`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `planned_session_user_seq_idx` ON `planned_session` (`user_id`,`server_seq`);--> statement-breakpoint
CREATE INDEX `planned_session_plan_week_id_idx` ON `planned_session` (`plan_week_id`);--> statement-breakpoint
CREATE TABLE `planned_set` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`planned_session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order` integer NOT NULL,
	`target_weight_kg` real,
	`target_reps` text NOT NULL,
	`target_rpe` real,
	`rest_seconds` integer,
	`note` text,
	FOREIGN KEY (`planned_session_id`) REFERENCES `planned_session`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `planned_set_user_seq_idx` ON `planned_set` (`user_id`,`server_seq`);--> statement-breakpoint
CREATE INDEX `planned_set_planned_session_id_idx` ON `planned_set` (`planned_session_id`);--> statement-breakpoint
CREATE INDEX `planned_set_exercise_id_idx` ON `planned_set` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `workout_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`planned_session_id` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `workout_session_user_seq_idx` ON `workout_session` (`user_id`,`server_seq`);--> statement-breakpoint
CREATE INDEX `workout_session_user_started_idx` ON `workout_session` (`user_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `workout_set` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order` integer NOT NULL,
	`weight_kg` real NOT NULL,
	`reps` integer NOT NULL,
	`rpe` real,
	`note` text,
	`planned_set_id` text,
	`logged_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_session`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workout_set_user_seq_idx` ON `workout_set` (`user_id`,`server_seq`);--> statement-breakpoint
CREATE INDEX `workout_set_session_id_idx` ON `workout_set` (`session_id`);--> statement-breakpoint
CREATE INDEX `workout_set_user_exercise_logged_idx` ON `workout_set` (`user_id`,`exercise_id`,`logged_at`);--> statement-breakpoint
CREATE TABLE `sync_clock` (
	`user_id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`server_seq` integer NOT NULL,
	`goals` text NOT NULL,
	`constraints` text NOT NULL,
	`available_days` text NOT NULL,
	`equipment` text NOT NULL,
	`timezone` text NOT NULL,
	CONSTRAINT "profile_id_is_user_id" CHECK("profile"."id" = "profile"."user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_user_id_unique` ON `profile` (`user_id`);--> statement-breakpoint
CREATE INDEX `profile_user_seq_idx` ON `profile` (`user_id`,`server_seq`);