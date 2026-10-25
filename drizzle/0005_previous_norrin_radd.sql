CREATE TABLE `bug_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterEmail` varchar(320) NOT NULL,
	`reporterName` varchar(160) NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('open','in_review','resolved','rejected') NOT NULL DEFAULT 'open',
	`reviewNote` text,
	`reviewedBy` varchar(320),
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bug_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `staff_accounts` MODIFY COLUMN `role` enum('admin','manager','owner','tester') NOT NULL DEFAULT 'admin';