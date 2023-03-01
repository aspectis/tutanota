import {ImapAdSync} from "./adsync/ImapAdSync.js";
import {ImapImportState, ImportState} from "./ImapImportState.js";
import {AdSyncEventListener} from "./adsync/AdSyncEventListener.js"
import {ImapMailbox, ImapMailboxStatus} from "./adsync/imapmail/ImapMailbox.js"
import {ImapMail} from "./adsync/imapmail/ImapMail.js"
import {ImapError} from "./adsync/imapmail/ImapError.js"
import {SyncSessionState} from "./adsync/ImapSyncSession.js"

export class ImapImporter implements AdSyncEventListener {

	private imapAdSync: ImapAdSync | null = null
	private imapImportState: ImapImportState = new ImapImportState(ImportState.PAUSED, new Date(Date.now()))
	private testCounter = 0

	constructor(
		//private readonly importMailFacade: ImportMailFacade,
		//private readonly importImapFacade: ImportImapFacade,
		imapAdSync: ImapAdSync,
	) {
		this.imapAdSync = imapAdSync
	}

	async continueImport(): Promise<ImportState> {
		let syncSessionState = await this.imapAdSync?.startAdSync(this)
		return this.getImportStateFromSyncSessionState(syncSessionState)
	}

	async pauseImport(): Promise<ImportState> {
		let syncSessionState = await this.imapAdSync?.stopAdSync()
		return this.getImportStateFromSyncSessionState(syncSessionState)
	}

	async deleteImport(): Promise<boolean> {
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
		console.log("onMail " + mail)
		this.testCounter += 1
		console.log(this.testCounter)
	}

	onPostpone(postponedUntil: Date): void {
		console.log("onPostpone " + postponedUntil)
	}

	onFinish(): void {
		console.log("onFinish")
	}

	onError(error: ImapError): void {
		console.log("onError " + error)
	}

	onMailUpdate(updatedMail: ImapMail): void {
		console.log("onMailUpdate " + updatedMail)
	}

	onMailboxUpdate(updatedMailbox: ImapMailbox): void {
		console.log("onMailboxUpdate " + updatedMailbox)
	}

	onMailboxStatusUpdate(updatedMailboxStatus: ImapMailboxStatus): void{

	}
}
