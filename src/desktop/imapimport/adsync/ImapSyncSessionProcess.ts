import {SyncSessionMailbox} from "./SyncSessionMailbox.js"
import {AdSyncEventListener} from "./AdSyncEventListener.js"
import {ImapFlow, Readable} from 'imapflow';
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

	private async runSyncSessionProcess(imapClient: ImapFlow, adSyncEventListener: AdSyncEventListener) {
		let lock = await imapClient.getMailboxLock(this.syncSessionMailbox.mailboxState.path, {readonly: true})
		try {
			let lastUid = Math.max(...this.syncSessionMailbox.mailboxState.importedUidToMailMap.keys())

			let fetchQuery = imapClient.fetch(
				`${lastUid}:*`,
				{
					uid: true,
					size: true,
					internalDate: true,
					flags: true,
					labels: true,
					envelope: true,
					bodyStructure: true,
					headers: true,
				},
				{
					uid: true,
					// @ts-ignore // TODO type definitions
					changedSince: this.syncSessionMailbox.mailboxState.highestModSeq
				},
			)

			let mailFetchStartTime = Date.now()
			for await (let mail of fetchQuery) {

				let attachmentBodyParts = mail.bodyStructure.childNodes
				let attachmentBodyPartNumbers = attachmentBodyParts.map(bodyStructure => bodyStructure.part)

				let bodyTextDownloadObject = await imapClient.download(
					`${mail.uid}`,
					mail.bodyStructure.part,
					{
						uid: true,
					}
				)

				// @ts-ignore // TODO type definitions
				let attachmentDownloadObjects = await imapClient.downloadMany(
					`${mail.uid}`,
					attachmentBodyPartNumbers,
					{
						uid: true,
					}
				)

				let mailFetchEndTime = Date.now()
				let mailFetchTime = mailFetchEndTime - mailFetchStartTime

				this.syncSessionMailbox.currentThroughput = mail.size / mailFetchTime // TODO What type / unit has mail.size?
				this.syncSessionEventListener.onEfficiencyScoreMeasured(this.processId, this.syncSessionMailbox.normalizedEfficiencyScore, mail.size)

				let bodyText = (await this.readableToBuffer(bodyTextDownloadObject.content)).toString()

				let attachments: ImapMailAttachement[] = []
				for (const attachmentDownloadObject of attachmentDownloadObjects) {
					let meta = attachmentDownloadObject.meta
					let binary = await this.readableToBuffer(attachmentDownloadObject.content)
					let attachment = new ImapMailAttachement(meta.expectedSize, meta.contentType, binary)
					attachments.push(attachment)
				}

				// TODO use emailId when uid is not reliable
				let imapMail = new ImapMail(mail.uid)
					.setModSeq(mail.modseq)
					.setSize(mail.size)
					.setInternalDate(mail.internalDate)
					.setFlags(mail.flags)
					.setLabels(mail.labels)
					.setEnvelope(ImapMailEnvelope.fromMessageEnvelopeObject(mail.envelope))
					.setBodyText(bodyText)
					.setAttachments(attachments)
					.setHeaders(mail.headers)

				// TODO What happens if only flags updated but IMAP server does not support QRESYNC?
				if (this.syncSessionMailbox.mailboxState.importedUidToMailMap.has(mail.uid)) {
					adSyncEventListener.onMailUpdate(imapMail)
				} else {
					adSyncEventListener.onMail(imapMail)
				}

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

	// TODO Move to Utils?
	private readableToBuffer(readable: Readable): Promise<Buffer> {
		const chunks: Buffer[] = []
		return new Promise((resolve, reject) => {
			readable.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
			readable.on('error', (err) => reject(err));
			readable.on('end', () => resolve(Buffer.concat(chunks)));
		})
	}


}
