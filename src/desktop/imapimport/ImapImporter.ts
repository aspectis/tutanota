import {ImportMailFacade} from "./facades/ImportMailFacade.js";
import {ImportImapFacade} from "./facades/ImportImapFacade.js";
import {ImapAdSync} from "./adsync/ImapAdSync.js";
import {ImapImportState, ImportState} from "./ImapImportState.js";
import {AdSyncEventListener} from "./adsync/AdSyncEventListener.js"
import {ImapMailbox} from "./adsync/ImapMailbox.js"
import {ImapMail} from "./adsync/ImapMail.js"
import {ImapError} from "./adsync/ImapError.js"
import {SyncSessionState} from "./adsync/ImapSyncSession.js"

export class ImapImporter implements AdSyncEventListener {

	private imapAdSync: ImapAdSync | null = null
	private imapImportState: ImapImportState = new ImapImportState(ImportState.PAUSED, new Date(Date.now()))

	constructor(
		private readonly importMailFacade: ImportMailFacade,
		private readonly importImapFacade: ImportImapFacade,
	) {
	}

	async continueImport(): Promise<ImportState> {
		let syncSessionState = await this.imapAdSync?.startAdSync(this)
		return this.getImportStateFromSyncSessionState(syncSessionState)
	}

	async pauseImport(): Promise<ImportState> {
		let syncSessionState = await this.imapAdSync?.stopAdSync()
		return this.getImportStateFromSyncSessionState(syncSessionState)
	}

	async abortImport(): Promise<boolean> {
		// TODO delete import
		return true
	}

	private getImportStateFromSyncSessionState(syncSessionState?: SyncSessionState): ImportState {
		switch (syncSessionState) {
			case SyncSessionState.RUNNING:
				return ImportState.RUNNING
			default:
				return ImportState.PAUSED
		}
	}

	onMailbox(mailbox: ImapMailbox): void {
	}

	onMail(mail: ImapMail): void {
	}

	onMailBatch(mails: ImapMail[]): void {
	}

	onPostpone(postponedUntil: Date): void {
	}

	onFinish(): void {
	}

	onError(error: ImapError): void {
	}
}
