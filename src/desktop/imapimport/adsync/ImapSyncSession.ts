import {SyncSessionMailbox} from "./SyncSessionMailbox.js"
import {ImapSyncState} from "./ImapSyncState.js"
import {AdSyncEventListener} from "./AdSyncEventListener.js"

export enum SyncSessionState {
	RUNNING,
	PAUSED,
	POSTPONED,
	FINISHED
}

export class ImapSyncSession {
	private imapSyncState: ImapSyncState
	private state: SyncSessionState
	private mailboxes: SyncSessionMailbox[]

	constructor(imapSyncState: ImapSyncState) {
		this.imapSyncState = imapSyncState
		this.mailboxes = imapSyncState.mailboxStates.map(mailboxState => {
			return new SyncSessionMailbox(mailboxState)
		})
		this.state = SyncSessionState.PAUSED
	}

	async startSyncSession(adSyncEventListener: AdSyncEventListener): Promise<SyncSessionState> {
		this.state = SyncSessionState.RUNNING
		this.runSyncSession(adSyncEventListener)
		return this.state
	}

	async stopSyncSession(): Promise<SyncSessionState> {
		this.state = SyncSessionState.PAUSED
		return this.state
	}

	private async runSyncSession(adSyncEventListener: AdSyncEventListener) {
		let isSetup = await this.setupSyncSession(adSyncEventListener)


		// TODO fetch mailbox list
		// TODO load initial information
		// TODO set up everything
		// TODO start sync
		// TODO trigger events
	}

	private async setupSyncSession(adSyncEventListener: AdSyncEventListener) {
		this.mailboxes.map(mailBox => {
			//mailBox.initSessionMailbox()
		})
	}
}
