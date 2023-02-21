import {AdSyncEventListener} from "./AdSyncEventListener.js"
import {ImapSyncSession, SyncSessionState} from "./ImapSyncSession.js"
import {ImapSyncState} from "./ImapSyncState.js"

export class ImapAdSync {

	private syncSession: ImapSyncSession

	constructor(imapSyncState: ImapSyncState) {
		this.syncSession = new ImapSyncSession(imapSyncState)
	}

	async startAdSync(adSyncEventListener: AdSyncEventListener): Promise<SyncSessionState> {
		return this.syncSession.startSyncSession(adSyncEventListener)
	}

	async stopAdSync(): Promise<SyncSessionState> {
		return this.syncSession.stopSyncSession()
	}
}
