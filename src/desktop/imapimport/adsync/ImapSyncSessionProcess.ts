import {SyncSessionMailbox} from "./SyncSessionMailbox.js"
import {AdSyncEventListener} from "./AdSyncEventListener.js"
import {ImapAccount} from "./ImapSyncState.js"
import {SyncSessionEventListener} from "./ImapSyncSession.js"
import {ImapMail, ImapMailAttachement, ImapMailEnvelope} from "./ImapMail.js"

const {ImapFlow} = require('imapflow');
const mailparser = require('mailparser');

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
			qresync: true, // TODO type definitions
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

	private async runSyncSessionProcess(imapClient: typeof ImapFlow, adSyncEventListener: AdSyncEventListener) {
		let lock = await imapClient.getMailboxLock(this.syncSessionMailbox.mailboxState.path, {readonly: true})
		try {
			let lastUid = Math.max(...this.syncSessionMailbox.mailboxState.importedUidToMailMap.keys(), 1)

			// TODO Use downloadBlockSize to fetch in stages
			let mailFetchStartTime = Date.now()
			let mails = imapClient.fetch(
				`${lastUid}:*`,
				{
					uid: true,
					source: true,
					labels: true,
					size: true,
					flags: true,
					internalDate: true,
					envelope: true,
					headers: true,
				},
				{
					uid: true,
					// changedSince: this.syncSessionMailbox.mailboxState.highestModSeq
				},
			)

			for await (const mail of mails) {
				//TODO check this.state
				let mailFetchEndTime = Date.now()
				let mailFetchTime = mailFetchEndTime - mailFetchStartTime

				this.syncSessionMailbox.currentThroughput = mail.size / mailFetchTime
				this.syncSessionEventListener.onEfficiencyScoreMeasured(this.processId, this.syncSessionMailbox.normalizedEfficiencyScore, mail.size)

				let parsedMail = await mailparser.simpleParser(mail.source)

				let attachments: ImapMailAttachement[] = []
				for (const parsedAttachment of parsedMail.attachments) {
					let binary = parsedAttachment.content
					let attachment = new ImapMailAttachement(parsedAttachment.size, parsedAttachment.contentType, binary)
					attachments.push(attachment)
				}

				// TODO use emailId when uid is not reliable
				// TODO we should optimize the download by not downloading envelope and headers twice!
				let imapMail = new ImapMail(mail.uid)
					.setModSeq(mail.modseq)
					.setSize(mail.size)
					.setInternalDate(mail.internalDate)
					.setFlags(mail.flags)
					.setLabels(mail.labels)
					.setEnvelope(ImapMailEnvelope.fromMessageEnvelopeObject(mail.envelope))
					.setBodyText(parsedMail.textAsHtml)
					.setAttachments(attachments)
					.setHeaders(mail.headers)

				// TODO What happens if only flags updated but IMAP server does not support QRESYNC?
				if (this.syncSessionMailbox.mailboxState.importedUidToMailMap.has(mail.uid)) {
					adSyncEventListener.onMailUpdate(imapMail)
				} else {
					adSyncEventListener.onMail(imapMail)
				}
			}
		} finally {
			lock.release()
			await imapClient.logout()
			this.syncSessionEventListener.onFinish(this.processId, this.syncSessionMailbox)
		}
	}

	async stopSyncSessionProcess(): Promise<SyncSessionMailbox> {
		this.state = SyncSessionProcessState.STOPPED
		return this.syncSessionMailbox
	}
}
