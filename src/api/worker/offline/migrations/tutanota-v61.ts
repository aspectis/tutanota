import { OfflineMigration } from "../OfflineStorageMigrator.js"
import { OfflineStorage } from "../OfflineStorage.js"
import { migrateAllListElements } from "../StandardMigrations.js"
import { CalendarEventTypeRef, createCalendarEvent } from "../../../entities/tutanota/TypeRefs.js"

export const tutanota61: OfflineMigration = {
	app: "tutanota",
	version: 61,
	async migrate(storage: OfflineStorage) {
		await migrateAllListElements(CalendarEventTypeRef, storage, [createCalendarEvent])
	},
}
