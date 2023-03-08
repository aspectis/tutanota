import {ImapAdSync} from "./adsync/ImapAdSync.js";
import {ImapImportState, ImportState} from "./ImapImportState.js";
import {AdSyncEventListener, AdSyncEventType} from "./adsync/AdSyncEventListener.js"
import {ImapMailbox, ImapMailboxStatus} from "./adsync/imapmail/ImapMailbox.js"
import {ImapMail} from "./adsync/imapmail/ImapMail.js"
import {ImapError} from "./adsync/imapmail/ImapError.js"
import {SyncSessionState} from "./adsync/ImapSyncSession.js"

var fs = require('fs');

export class ImapImporter implements AdSyncEventListener {

	private imapAdSync: ImapAdSync | null = null
	private imapImportState: ImapImportState = new ImapImportState(ImportState.PAUSED, new Date(Date.now()))
	private testMailCounter = 0
	private testDownloadTime: Date = new Date()

	constructor(
		//private readonly importMailFacade: ImportMailFacade,
		//private readonly importImapFacade: ImportImapFacade,
		imapAdSync: ImapAdSync,
	) {
		this.imapAdSync = imapAdSync
	}

	async continueImport(): Promise<ImportState> {
		let syncSessionState = await this.imapAdSync?.startAdSync(this)
		this.testDownloadTime.setTime(Date.now())
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

	onMailbox(mailbox: ImapMailbox, eventType: AdSyncEventType): void {
		console.log("onMailbox")
		//console.log(mailbox)
	}

	onMailboxStatus(mailboxStatus: ImapMailboxStatus): void {
		console.log("onMailboxStatus")
		console.log(mailboxStatus)
	}

	onMail(mail: ImapMail, eventType: AdSyncEventType): void {
		//console.log("onMail")
		//console.log(mail)
		this.testMailCounter += 1
	}

	onPostpone(postponedUntil: Date): void {
		console.log("onPostpone")
		console.log(postponedUntil)
	}

	onFinish(downloadedQuota: number): void {
		console.log("onFinish")
		let downloadTime = Date.now() - this.testDownloadTime.getTime()
		console.log("Downloaded data (byte): " + downloadedQuota)
		console.log("Took (ms): " + downloadTime)
		console.log("Average throughput (bytes/ms): " + downloadedQuota / downloadTime)
		console.log("# amount of mails downloaded: " + this.testMailCounter)
	}

	onError(error: ImapError): void {
		console.log("onError")
		console.log(error)
	}
}
