ALTER TABLE `profile` ADD `locations` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `profile` ADD `active_location_id` text;