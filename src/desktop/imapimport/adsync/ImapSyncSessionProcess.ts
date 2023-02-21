import {SyncSessionMailbox} from "./SyncSessionMailbox.js"
import {AdSyncEventListener} from "./AdSyncEventListener.js"
import {ImapFlow} from 'imapflow';
import {ImapAccount} from "./ImapSyncState.js"
import {SyncSessionEventListener} from "./ImapSyncSession.js"
import fs from "fs"

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

			let elmStartTime = Date.now()
			for await (let mail of fetchQuery) {
				// @ts-ignore
				let {bodyMeta, bodyContent} = await imapClient.download(`${mail.uid}`)
				let elmEndTime = Date.now()

				let elmFetchTime = elmEndTime - elmStartTime

				this.syncSessionMailbox.currentThroughput = mail.size / elmFetchTime // TODO What type / unit has mail.size?
				this.syncSessionEventListener.onEfficiencyScoreMeasured(this.processId, this.syncSessionMailbox.normalizedEfficiencyScore, mail.size)

				//TODO What do I do with this?
				bodyContent.pipe(fs.createWriteStream(bodyMeta.filename))

				// TODO Convert to ImapMail?
				adSyncEventListener.onMail(mail)

				elmStartTime = Date.now()
			}
		} finally {
			lock.release()
		}
	}

	async stopSyncSessionProcess(): Promise<SyncSessionMailbox> {
		this.state = SyncSessionProcessState.STOPPED
		return this.syncSessionMailbox
	}
}
