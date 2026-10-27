CREATE TABLE `refresh_token_burn` (
	`jti` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`burnedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `refresh_token_burn_expires_at_idx` ON `refresh_token_burn` (`expiresAt`);