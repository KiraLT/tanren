CREATE TABLE `oauth_code_use` (
	`jti` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `user` ADD `appTokenGen` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `mcpTokenGen` integer DEFAULT 0 NOT NULL;