import {SyncSessionMailbox} from "./SyncSessionMailbox.js"
import {AdSyncEventListener} from "./AdSyncEventListener.js"
import {ImapFlow} from 'imapflow';
import {ImapAccount} from "./ImapSyncState.js"
import {SyncSessionEventListener} from "./ImapSyncSession.js"
import {ImapMail, ImapMailAttachement, ImapMailEnvelope} from "./ImapMail.js"

export enum SyncSessionProcessState {
	STOPPED,
	RUNNING,
	CONNECTION_FAILED,
}

export class ImapSyncSessionProcess {
	private processId: number
	private syncSessionEventListener: SyncSessionEventListener
	private state: SyncSessionProcessState = SyncSessionProcessState.STOPPED
	private imapAccount: ImapAccount
	private syncSessionMailbox: SyncSessionMailbox

	constructor(processId: number, syncSessionEventListener: SyncSessionEventListener, imapAccount: ImapAccount, syncSessionMailbox: SyncSessionMailbox) {
		this.processId = processId
		this.syncSessionEventListener = syncSessionEventListener
		this.imapAccount = imapAccount
		this.syncSessionMailbox = syncSessionMailbox
	}

	async startSyncSessionProcess(adSyncEventListener: AdSyncEventListener): Promise<SyncSessionProcessState> {
		const imapClient = new ImapFlow({
			host: this.imapAccount.host,
			port: this.imapAccount.port,
			secure: true,
			auth: {
				user: this.imapAccount.username,
				pass: this.imapAccount.password,
				accessToken: this.imapAccount.accessToken
			},
			// @ts-ignore
			qresync: true, // TODO Type definitions
		})

		try {
			await imapClient.connect()
			this.runSyncSessionProcess(imapClient, adSyncEventListener)
			this.state = SyncSessionProcessState.RUNNING
		} catch (error) {
			this.state = SyncSessionProcessState.CONNECTION_FAILED
		}
		return this.state
	}

	private async runSyncSessionProcess(imapClient: ImapFlow, adSyncEventListener: AdSyncEventListener) {
		let lock = await imapClient.getMailboxLock(this.syncSessionMailbox.mailboxState.path, {readonly: true})
		try {
			let lastUid = Math.max(...this.syncSessionMailbox.mailboxState.importedUidToMailMap.keys())

			let fetchQuery = imapClient.fetch(
				`${lastUid}:*`,
				{
					uid: true,
					// @ts-ignore // TODO Types!
					changedSince: this.syncSessionMailbox.mailboxState.highestModSeq
				}
			)

			let mailFetchStartTime = Date.now()
			for await (let mail of fetchQuery) {
				// @ts-ignore
				// We can download in steps or get a full rfc822 formatted message
				let {rfc822Meta, rfc822Content} = await imapClient.download(`${mail.uid}`)
				// need a rfc822 reader library or use parts downloader.
				let mailFetchEndTime = Date.now()

				let mailFetchTime = mailFetchEndTime - mailFetchStartTime

				this.syncSessionMailbox.currentThroughput = mail.size / mailFetchTime // TODO What type / unit has mail.size?
				this.syncSessionEventListener.onEfficiencyScoreMeasured(this.processId, this.syncSessionMailbox.normalizedEfficiencyScore, mail.size)

				let bodyText = "some rfc822 formatted string"
				let attachment = new ImapMailAttachement(1, "test", new Buffer("stsdf"))

				// TODO use emailId when uid is not reliable
				let imapMail = new ImapMail(mail.uid)
					.setModSeq(mail.modseq)
					.setSize(mail.size)
					.setInternalDate(mail.internalDate)
					.setFlags(mail.flags)
					.setLabels(mail.labels)
					.setEnvelope(ImapMailEnvelope.fromMessageEnvelopeObject(mail.envelope))
					.setBodyText(bodyText)
					.setAttachments([attachment])
					.setHeaders(mail.headers)

				//TODO Check if mail is already existing in sync state
				adSyncEventListener.onMail(imapMail)

				mailFetchStartTime = Date.now()
			}
		} finally {
			lock.release()
			this.syncSessionEventListener.onFinish(this.processId, this.syncSessionMailbox)
		}
	}

	async stopSyncSessionProcess(): Promise<SyncSessionMailbox> {
		this.state = SyncSessionProcessState.STOPPED
		return this.syncSessionMailbox
	}
}
