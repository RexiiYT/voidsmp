CREATE TABLE `review_cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminEmail` varchar(320) NOT NULL,
	`adminName` varchar(160) NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(768) NOT NULL,
	`status` enum('processing','pending_review','approved','rejected') NOT NULL DEFAULT 'processing',
	`actionType` varchar(80),
	`targetUser` varchar(160),
	`reason` text,
	`confidence` int,
	`pointsGranted` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `review_cases_id` PRIMARY KEY(`id`)
);
