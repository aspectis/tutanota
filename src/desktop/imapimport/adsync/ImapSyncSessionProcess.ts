import {ImapSyncSessionMailbox} from "./ImapSyncSessionMailbox.js"
import {AdSyncEventListener, AdSyncEventType} from "./AdSyncEventListener.js"
import {ImapAccount} from "./ImapSyncState.js"
import {ImapMail} from "./imapmail/ImapMail.js"
// @ts-ignore // TODO define types
import {AdSyncDownloadBlockSizeOptimizer} from "./optimizer/AdSyncDownloadBlockSizeOptimizer.js"
import {AdSyncParallelProcessesOptimizerEventListener} from "./optimizer/AdSyncParallelProcessesOptimizer.js"
import {ImapError} from "./imapmail/ImapError.js"
import {ImapMailboxStatus} from "./imapmail/ImapMailbox.js"
import {FetchUidRange} from "./utils/FetchUidRange.js"

const {ImapFlow} = require('imapflow');

export enum SyncSessionProcessState {

	NOT_STARTED,
	STOPPED,
	RUNNING,
	CONNECTION_FAILED,
}

export class ImapSyncSessionProcess {
	processId: number
	private adSyncEfficiencyScoreOptimizerEventListener: AdSyncParallelProcessesOptimizerEventListener
	private state: SyncSessionProcessState = SyncSessionProcessState.NOT_STARTED
	private imapAccount: ImapAccount
	private adSyncOptimizer: AdSyncDownloadBlockSizeOptimizer

	constructor(processId: number, adSyncEfficiencyScoreOptimizerEventListener: AdSyncParallelProcessesOptimizerEventListener, imapAccount: ImapAccount, adSyncOptimizer: AdSyncDownloadBlockSizeOptimizer) {
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
			logger: false,
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
			if (this.state == SyncSessionProcessState.NOT_STARTED) {
				this.runSyncSessionProcess(imapClient, adSyncEventListener)
				this.state = SyncSessionProcessState.RUNNING
			}
		} catch (error) {
			this.state = SyncSessionProcessState.CONNECTION_FAILED
		}
		return this.state
	}

	async stopSyncSessionProcess(): Promise<ImapSyncSessionMailbox> {
		this.state = SyncSessionProcessState.STOPPED
		this.adSyncOptimizer.stopAdSyncOptimizer()
		return this.adSyncOptimizer.optimizedSyncSessionMailbox
	}

	private async runSyncSessionProcess(imapClient: typeof ImapFlow, adSyncEventListener: AdSyncEventListener) {
		async function releaseLockAndLogout() {
			lock.release()
			await imapClient.logout()
		}

		let status = await imapClient.status(
			this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.path,
			{
				messages: true,
				uidNext: true,
				uidValidity: true,
				highestModseq: true,
			}
		)

		let imapMailboxStatus = ImapMailboxStatus.fromImapFlowStatusObject(status)
		this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState
			.setUidValidity(imapMailboxStatus.uidValidity)
			.setUidNext(imapMailboxStatus.uidNext)
			.setUidHighestModSeq(imapMailboxStatus.highestModSeq)

		this.adSyncOptimizer.optimizedSyncSessionMailbox.initSessionMailbox(imapMailboxStatus.messageCount)
		adSyncEventListener.onMailboxStatus(imapMailboxStatus)

		let lock = await imapClient.getMailboxLock(this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.path, {readonly: true})

		try {
			let fetchUidRange = await this.initFetchUidRange(imapClient)

			while (fetchUidRange.fromUid && fetchUidRange.toUid) {
				this.adSyncOptimizer.optimizedSyncSessionMailbox.reportDownloadBlockSizeUsage(fetchUidRange.currentDownloadBlockSize)
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

					//TODO Check why mail source is not always available
					if (mail.source) {
						let mailSize = mail.source.length
						let mailDownloadTime = mailFetchTime != 0 ? mailFetchTime : 1 // we approximate the mailFetchTime to minimum 1 millisecond
						let currenThroughput = mailSize / mailDownloadTime
						this.adSyncOptimizer.optimizedSyncSessionMailbox.reportCurrentThroughput(currenThroughput)

						this.adSyncEfficiencyScoreOptimizerEventListener.onDownloadUpdate(
							this.processId,
							this.adSyncOptimizer.optimizedSyncSessionMailbox,
							mailSize
						)
					} else {
						adSyncEventListener.onError(new ImapError(mail))
					}

					let imapMail = await ImapMail.fromImapFlowFetchMessageObject(mail)

					// TODO What happens if only flags updated but IMAP server does not support QRESYNC?
					// TODO Check if email is already downloaded before downloading the actual data
					let isMailUpdate = this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.importedUidToMailMap.has(mail.uid)
					if (isMailUpdate) {
						adSyncEventListener.onMail(imapMail, AdSyncEventType.UPDATE)
					} else {
						adSyncEventListener.onMail(imapMail, AdSyncEventType.CREATE)
						this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.importedUidToMailMap.set(imapMail.uid, ["newId", "newId"])
					}
				}

				await fetchUidRange.continueFetchUidRange(this.adSyncOptimizer.optimizedSyncSessionMailbox.downloadBlockSize)
			}
		} catch (error: any) {
			adSyncEventListener.onError(new ImapError(error))
		} finally {
			await releaseLockAndLogout()
			this.adSyncEfficiencyScoreOptimizerEventListener.onMailboxFinish(this.processId, this.adSyncOptimizer.optimizedSyncSessionMailbox)
		}
	}

	private async initFetchUidRange(imapClient: typeof ImapFlow) {
		let fetchUidRange = new FetchUidRange(imapClient, this.adSyncOptimizer.optimizedSyncSessionMailbox.mailCount)
		let lastFetchedUid = Math.max(...this.adSyncOptimizer.optimizedSyncSessionMailbox.mailboxState.importedUidToMailMap.keys())
		let isInitialSeqFetch = !isNaN(lastFetchedUid)

		await fetchUidRange.initFetchUidRange(
			isInitialSeqFetch ? 1 : lastFetchedUid,
			this.adSyncOptimizer.optimizedSyncSessionMailbox.downloadBlockSize,
			!isInitialSeqFetch
		)
		return fetchUidRange
	}
}

