import { OfflineMigration } from "../OfflineStorageMigrator.js"
import { OfflineStorage } from "../OfflineStorage.js"
import { migrateAllElements } from "../StandardMigrations.js"
import { createMissedNotification, MissedNotificationTypeRef } from "../../../entities/sys/TypeRefs.js"

export const sys84: OfflineMigration = {
	app: "sys",
	version: 84,
	async migrate(storage: OfflineStorage) {
		await migrateAllElements(MissedNotificationTypeRef, storage, [createMissedNotification])
	},
}
