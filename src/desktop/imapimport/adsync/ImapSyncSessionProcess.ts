import {SyncSessionMailbox} from "./SyncSessionMailbox.js"
import {AdSyncEventListener, AdSyncEventType} from "./AdSyncEventListener.js"
import {ImapAccount} from "./ImapSyncState.js"
import {ImapMail} from "./imapmail/ImapMail.js"
// @ts-ignore // TODO define types
import {AdSyncDownloadBlockSizeOptimizer} from "./optimizer/AdSyncDownloadBlockSizeOptimizer.js"
import {AdSyncEfficiencyScoreOptimizerEventListener} from "./optimizer/AdSyncEfficiencyScoreOptimizer.js"
import {ImapError} from "./imapmail/ImapError.js"
import {ImapMailboxStatus} from "./imapmail/ImapMailbox.js"
import {FetchUidRange} from "./utils/FetchUidRange.js"

const {ImapFlow} = require('imapflow');

export enum SyncSessionProcessState {
	STOPPED,
	RUNNING,
	CONNECTION_FAILED,
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

		let imapMailboxStatus = ImapMailboxStatus.fromImapFlowStatusObject(status)
		this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState
			.setUidValidity(imapMailboxStatus.uidValidity)
			.setUidNext(imapMailboxStatus.uidNext)
			.setUidHighestModSeq(imapMailboxStatus.highestModSeq)

		this.adSyncOptimizer.optimizedSyncSessionMailbox.initSessionMailbox(imapMailboxStatus.messageCount)
		adSyncEventListener.onMailboxStatus(imapMailboxStatus)

		let lock = await imapClient.getMailboxLock(this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.path, {readonly: true})

		async function releaseLockAndLogout() {
			lock.release()
			await imapClient.logout()
		}

		try {
			let fetchUidRange = new FetchUidRange(imapClient, this.adSyncOptimizer.optimizedSyncSessionMailbox.mailCount)
			let lastFetchedUid = Math.max(...this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.importedUidToMailMap.keys())
			let isInitialSeqFetch = !isNaN(lastFetchedUid)
			await fetchUidRange.initFetchUidRange(isInitialSeqFetch ? 1 : lastFetchedUid, this.adSyncOptimizer.optimizedSyncSessionMailbox.normalizedDownloadBlockSize, !isInitialSeqFetch)

			while (fetchUidRange.toUid
				&& this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.uidNext
				&& fetchUidRange.toUid < this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.uidNext
				) {
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
						status.path,
						this.adSyncOptimizer.optimizedSyncSessionMailbox.normalizedEfficiencyScore,
						this.adSyncOptimizer.optimizedSyncSessionMailbox.timeToLiveInterval,
						mail.size
					)

					let imapMail = await ImapMail.fromImapFlowFetchMessageObject(mail)

					// TODO What happens if only flags updated but IMAP server does not support QRESYNC?
					// TODO check if email is already downloaded before downloading the actual data
					let isMailUpdate = this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.importedUidToMailMap.has(mail.uid)
					adSyncEventListener.onMail(imapMail, isMailUpdate ? AdSyncEventType.UPDATE : AdSyncEventType.CREATE)
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
}
