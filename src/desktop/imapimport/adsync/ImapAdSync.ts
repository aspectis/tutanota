import {AdSyncEventListener} from "./AdSyncEventListener.js"
import {ImportSyncSessionMailbox} from "./ImportSyncSessionMailbox.js"
import {ImportSyncSession} from "./ImportSyncSession.js"
import {ImportSyncState} from "./ImportSyncState.js"

export class ImapAdSync {

	private mailboxes: ImportSyncSessionMailbox[]
	private syncSession: ImportSyncSession
	private syncState: ImportSyncState

	constructor(importSyncState: ImportSyncState) {
		this.mailboxes = importSyncState.mailboxStates.map(mailboxState => {
			return new ImportSyncSessionMailbox(mailboxState.path)
		})
		this.syncSession = new ImportSyncSession()
		this.syncState = importSyncState

	}

	async startAdSync(adSyncEventListener: AdSyncEventListener): Promise<boolean> {
		return true
	}

	async stopAdSync(): Promise<boolean> {
		return true
	}
}
