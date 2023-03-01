import {SyncSessionMailbox} from "./SyncSessionMailbox.js"
import {AdSyncEventListener} from "./AdSyncEventListener.js"
import {ImapAccount} from "./ImapSyncState.js"
import {ImapMail} from "./imapmail/ImapMail.js"
// @ts-ignore // TODO define types
import {FetchMessageObject} from "imapflow"
import {AdSyncDownloadBlockSizeOptimizer} from "./optimizer/AdSyncDownloadBlockSizeOptimizer.js"
import {AdSyncEfficiencyScoreOptimizerEventListener} from "./optimizer/AdSyncEfficiencyScoreOptimizer.js"
import {ImapError} from "./imapmail/ImapError.js"
import {ImapMailboxStatus} from "./imapmail/ImapMailbox.js"

const {ImapFlow} = require('imapflow');

export enum SyncSessionProcessState {
	STOPPED,
	RUNNING,
	CONNECTION_FAILED,
}

class FetchUidRange {
	fromUid?: number
	toUid?: number
	private fromSeq: number = 1
	private toSeq?: number
	private imapClient: typeof ImapFlow

	constructor(imapClient: typeof ImapFlow) {
		this.imapClient = imapClient
	}

	async initFetchUidRange(initialFrom: number, initialDownloadBlockSize: number, isUid: boolean) {
		await this.updateFetchUidRange(initialFrom, initialDownloadBlockSize, isUid)
	}

	async continueFetchUidRange(downloadBlockSize: number) {
		await this.updateFetchUidRange(this.toSeq ? this.toSeq + 1 : 1, downloadBlockSize, false)
	}

	private async updateFetchUidRange(from: number, downloadBlockSize: number, isUid: boolean) {
		let fetchFromSeqMail = await this.imapClient.fetchOne(`${from}`, {seq: true, uid: true}, {uid: isUid})
		this.fromSeq = fetchFromSeqMail.seq
		this.fromUid = fetchFromSeqMail.uid

		let fetchToSeq = fetchFromSeqMail.seq + downloadBlockSize

		let fetchToSeqMail: FetchMessageObject = await this.imapClient.fetchOne(`${fetchToSeq}`, {seq: true, uid: true})
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
			tls: {
				rejectUnauthorized: false, // TODO deactivate after testing
			},
			auth: {
				user: this.imapAccount.username,
				pass: this.imapAccount.password,
				accessToken: this.imapAccount.accessToken
			},
			// @ts-ignore
			// qresync: true, // TODO type definitions
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
		let status = await imapClient.status(this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.path, {
			messages: true,
			uidNext: true,
			uidValidity: true,
			highestModseq: true,
		})

		// TODO WIP make sure that the mailboxState is updated locally
		this.adSyncOptimizer.optimizedSyncSessionMailbox
		adSyncEventListener.onMailboxStatusUpdate(ImapMailboxStatus.fromImapFlowStatusObject(status))


		let lock = await imapClient.getMailboxLock(this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.path, {readonly: true})

		async function releaseLockAndLogout() {
			lock.release()
			await imapClient.logout()
		}

		try {
			let fetchUidRange = new FetchUidRange(imapClient)
			let lastFetchedUid = Math.max(...this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.importedUidToMailMap.keys())
			let isInitialSeqFetch = !isNaN(lastFetchedUid)
			await fetchUidRange.initFetchUidRange(isInitialSeqFetch ? 1 : lastFetchedUid, this.adSyncOptimizer.optimizedSyncSessionMailbox.normalizedDownloadBlockSize, !isInitialSeqFetch)

			while (fetchUidRange.toUid && fetchUidRange.toUid < this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.uidNext) {
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
					this.adSyncEfficiencyScoreOptimizerEventListener.onMailboxUpdate(
						this.processId,
						this.adSyncOptimizer.optimizedSyncSessionMailbox.normalizedEfficiencyScore,
						this.adSyncOptimizer.optimizedSyncSessionMailbox.timeToLiveInterval,
						mail.size
					)

					let imapMail = await ImapMail.fromImapFlowFetchMessageObject(mail)

					// TODO What happens if only flags updated but IMAP server does not support QRESYNC?
					// TODO check if email is already downloaded before downloading the actual data
					if (this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.importedUidToMailMap.has(mail.uid)) {
						adSyncEventListener.onMailUpdate(imapMail)
					} else {
						adSyncEventListener.onMail(imapMail)
					}
				}

				await fetchUidRange.continueFetchUidRange(this.adSyncOptimizer.optimizedSyncSessionMailbox.normalizedDownloadBlockSize)
			}
		} catch (error: any) {
			adSyncEventListener.onError(new ImapError(error))
		} finally {
			await releaseLockAndLogout()
			this.adSyncEfficiencyScoreOptimizerEventListener.onMailboxFinish(this.processId, this.adSyncOptimizer.optimizedSyncSessionMailbox)
		}
	}

	async stopSyncSessionProcess(): Promise<SyncSessionMailbox> {
		this.state = SyncSessionProcessState.STOPPED
		this.adSyncOptimizer.stopAdSyncOptimizer()
		return this.adSyncOptimizer.optimizedSyncSessionMailbox
	}

	getProcessMailbox(): SyncSessionMailbox {
		return this.adSyncOptimizer.optimizedSyncSessionMailbox
	}
}
