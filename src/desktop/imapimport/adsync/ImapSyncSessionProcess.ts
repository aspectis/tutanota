import {SyncSessionMailbox} from "./SyncSessionMailbox.js"
import {AdSyncEventListener} from "./AdSyncEventListener.js"
import {ImapAccount} from "./ImapSyncState.js"
import {ImapMail} from "./imapmail/ImapMail.js"
// @ts-ignore // TODO define types
import {FetchMessageObject} from "imapflow"
import {AdSyncDownloadBlockSizeOptimizer} from "./optimizer/AdSyncDownloadBlockSizeOptimizer.js"
import {AdSyncEfficiencyScoreOptimizerEventListener} from "./optimizer/AdSyncEfficiencyScoreOptimizer.js"

const {ImapFlow} = require('imapflow');

export enum SyncSessionProcessState {
	STOPPED,
	RUNNING,
	CONNECTION_FAILED,
}

class FetchUidRange {
	fromUid: number
	toUid: number
	private fromSeq: number
	private toSeq: number
	private imapClient: typeof ImapFlow

	constructor(imapClient: typeof ImapFlow, initialFromUid: number, initialDownloadBlockSize: number) {
		this.imapClient = imapClient

		this.fromUid = initialFromUid
		let fetchFromSeqMail: FetchMessageObject = this.imapClient.fetch(`${this.fromUid}`, {uid: true}, {uid: true})
		this.fromSeq = fetchFromSeqMail.seq

		let fetchToSeq = fetchFromSeqMail.seq + initialDownloadBlockSize

		let fetchToSeqMail: FetchMessageObject = this.imapClient.fetch(`${fetchToSeq}`, {uid: true})
		this.toSeq = fetchToSeqMail.seq
		this.toUid = fetchToSeqMail.uid
	}

	updateFetchUidRange(downloadBlockSize: number) {
		let fetchFromSeqMail: FetchMessageObject = this.imapClient.fetch(`${this.toSeq + 1}`, {uid: true})
		this.fromSeq = fetchFromSeqMail.seq
		this.fromUid = fetchFromSeqMail.uid

		let fetchToSeq = this.fromSeq + downloadBlockSize

		let fetchToSeqMail: FetchMessageObject = this.imapClient.fetch(`${fetchToSeq}`, {uid: true})
		this.toSeq = fetchToSeqMail.seq
		this.toUid = fetchToSeqMail.uid
	}
}

export class ImapSyncSessionProcess {
	processId: number
	private adSyncEfficiencyScoreOptimizerEventListener: AdSyncEfficiencyScoreOptimizerEventListener
	private state: SyncSessionProcessState = SyncSessionProcessState.STOPPED
	private imapAccount: ImapAccount
	private adSyncOptimizer: AdSyncDownloadBlockSizeOptimizer

	constructor(processId: number, adSyncEfficiencyScoreOptimizerEventListener: AdSyncEfficiencyScoreOptimizerEventListener, imapAccount: ImapAccount, adSyncOptimizer: AdSyncDownloadBlockSizeOptimizer) {
		this.processId = processId
		this.adSyncEfficiencyScoreOptimizerEventListener = adSyncEfficiencyScoreOptimizerEventListener
		this.imapAccount = imapAccount
		this.adSyncOptimizer = adSyncOptimizer
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
		let lock = await imapClient.getMailboxLock(this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.path, {readonly: true})

		async function releaseLockAndLogout() {
			lock.release()
			await imapClient.logout()
		}

		try {
			let lastFetchedUid = Math.max(...this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.importedUidToMailMap.keys(), 1)
			let fetchUidRange = new FetchUidRange(imapClient, lastFetchedUid, this.adSyncOptimizer.optimizedSyncSessionMailbox.normalizedDownloadBlockSize)

			while (fetchUidRange.toUid < this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.uidNext) {
				let mailFetchStartTime = Date.now()
				let mails = imapClient.fetch(
					`${fetchUidRange.fromUid}:${fetchUidRange.toUid}`,
					{
						uid: true,
						source: true,
						labels: true,
						size: true,
						flags: true,
						internalDate: true,
						headers: true,
					},
					{
						uid: true,
						// changedSince: this.syncSessionMailbox.mailboxState.highestModSeq
					},
				)

				for await (const mail of mails) {
					if (this.state == SyncSessionProcessState.STOPPED) {
						await releaseLockAndLogout()
						return
					}

					let mailFetchEndTime = Date.now()
					let mailFetchTime = mailFetchEndTime - mailFetchStartTime

					this.adSyncOptimizer.optimizedSyncSessionMailbox.currentThroughput = mail.size / mailFetchTime
					this.adSyncEfficiencyScoreOptimizerEventListener.onEfficiencyScoreMeasured(this.processId, this.adSyncOptimizer.optimizedSyncSessionMailbox.normalizedEfficiencyScore, mail.size)

					let imapMail = await ImapMail.fromImapFlowFetchMessageObject(mail)

					// TODO What happens if only flags updated but IMAP server does not support QRESYNC?
					if (this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.importedUidToMailMap.has(mail.uid)) {
						adSyncEventListener.onMailUpdate(imapMail)
					} else {
						adSyncEventListener.onMail(imapMail)
					}
				}

				fetchUidRange.updateFetchUidRange(this.adSyncOptimizer.optimizedSyncSessionMailbox.normalizedDownloadBlockSize)
			}
		} finally {
			await releaseLockAndLogout()
			this.adSyncEfficiencyScoreOptimizerEventListener.onFinish(this.processId, this.adSyncOptimizer.optimizedSyncSessionMailbox)
		}
	}

	async stopSyncSessionProcess(): Promise<SyncSessionMailbox> {
		this.state = SyncSessionProcessState.STOPPED
		return this.adSyncOptimizer.optimizedSyncSessionMailbox
	}
}
