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
	private testCounter = 0
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
		this.testCounter += 1
		//console.log(this.testCounter)

		if (mail.attachments) {
			console.log("has attachment!")
		}

		//TODO messageId is empty!
		// if (mail.uid) {
		// 	let mailFileName = mail.uid.toString()
		//
		// 	// @ts-ignore
		// 	fs.writeFile("/home/jhm/Test/" + mailFileName + ".txt", mailFileName, function (err: any) {
		// 	});
		// }
	}

	onPostpone(postponedUntil: Date): void {
		console.log("onPostpone " + postponedUntil)
	}

	onFinish(downloadedQuota: number): void {
		console.log("onFinish")
		console.log(downloadedQuota)
		console.log("Took (ms): " + (Date.now() - this.testDownloadTime.getTime()))
	}

	onError(error: ImapError): void {
		console.log("onError " + error)
		console.log(error)
	}

}
