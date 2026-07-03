CREATE TABLE `blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`blocker_id` integer NOT NULL,
	`blocked_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `block_unique_idx` ON `blocks` (`blocker_id`,`blocked_id`);--> statement-breakpoint
CREATE INDEX `block_blocker_idx` ON `blocks` (`blocker_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `settings` text DEFAULT '{}' NOT NULL;