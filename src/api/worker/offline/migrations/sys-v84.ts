import { OfflineMigration } from "../OfflineStorageMigrator.js"
import { OfflineStorage } from "../OfflineStorage.js"
import { UserTypeRef } from "../../../entities/sys/TypeRefs.js"
import { deleteInstancesOfType } from "../StandardMigrations.js"

export const sys84: OfflineMigration = {
	app: "sys",
	version: 84,
	async migrate(storage: OfflineStorage) {
		// we need to invalidate and reload the user to make sure a generated referral code will be on the user instance
		await deleteInstancesOfType(storage, UserTypeRef)
	},
}
