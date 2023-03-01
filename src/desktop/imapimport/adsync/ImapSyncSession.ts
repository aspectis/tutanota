import {SyncSessionMailbox} from "./SyncSessionMailbox.js"
import {ImapSyncState, MailboxState} from "./ImapSyncState.js"
import {AdSyncEventListener} from "./AdSyncEventListener.js"
import {AdSyncEfficiencyScoreOptimizer} from "./optimizer/AdSyncEfficiencyScoreOptimizer.js"
import {ImapSyncSessionProcess} from "./ImapSyncSessionProcess.js"
import {AdSyncDownloadBlockSizeOptimizer} from "./optimizer/AdSyncDownloadBlockSizeOptimizer.js"
import {ProgrammingError} from "../../../api/common/error/ProgrammingError.js"
import {ImapFlow} from "imapflow"
import {ImapMailbox} from "./imapmail/ImapMailbox.js"

const DOWNLOADED_QUOTA_SAFETY_THRESHOLD: number = 100 // in byte
const DEFAULT_POSTPONE_TIME: number = 24 * 60 * 60 * 1000 // 1 day

export enum SyncSessionState {
	RUNNING,
	PAUSED,
	POSTPONED,
	FINISHED
}

export interface SyncSessionEventListener {
	onStartSyncSessionProcess(syncSessionMailbox: SyncSessionMailbox): void

	onStopSyncSessionProcess(processId: number): void

	onDownloadQuotaUpdate(downloadedQuota: number): void

	onAllMailboxesFinish(): void
}

export class ImapSyncSession implements SyncSessionEventListener {
	private imapSyncState: ImapSyncState
	private state: SyncSessionState
	private adSyncOptimizer?: AdSyncEfficiencyScoreOptimizer
	private adSyncEventListener?: AdSyncEventListener
	private nextProcessId: number = 0
	private runningSyncSessionProcesses: Map<number, ImapSyncSessionProcess> = new Map()
	private downloadedQuota: number = 0


	constructor(imapSyncState: ImapSyncState) {
		this.imapSyncState = imapSyncState
		this.state = SyncSessionState.PAUSED
	}

	async startSyncSession(adSyncEventListener: AdSyncEventListener): Promise<SyncSessionState> {
		this.adSyncEventListener = adSyncEventListener
		this.state = SyncSessionState.RUNNING

		this.runSyncSession(adSyncEventListener)
		return this.state
	}

	async stopSyncSession(): Promise<SyncSessionState> {
		await this.shutDownSyncSession(false)
		return this.state
	}

	private async shutDownSyncSession(isPostpone: boolean) {
		this.state = SyncSessionState.PAUSED

		this.adSyncOptimizer?.stopAdSyncOptimizer()
		this.runningSyncSessionProcesses.forEach((syncSessionProcess) => {
			syncSessionProcess.stopSyncSessionProcess()
		})
		this.runningSyncSessionProcesses.clear()
		this.nextProcessId = 0

		if (isPostpone) {
			this.state = SyncSessionState.POSTPONED
			this.adSyncEventListener?.onPostpone(new Date(Date.now() + DEFAULT_POSTPONE_TIME))
		}
	}

	private async runSyncSession(adSyncEventListener: AdSyncEventListener) {
		let mailboxes = await this.setupSyncSession(adSyncEventListener)

		this.adSyncOptimizer = new AdSyncEfficiencyScoreOptimizer(mailboxes, 1, this)
		this.adSyncOptimizer.startAdSyncOptimizer()
	}

	private async setupSyncSession(adSyncEventListener: AdSyncEventListener): Promise<SyncSessionMailbox[]> {
		let knownMailboxes = this.imapSyncState.mailboxStates.map(mailboxState => {
			return new SyncSessionMailbox(mailboxState)
		})

		let imapAccount = this.imapSyncState.imapAccount
		const imapClient = new ImapFlow({
			host: imapAccount.host,
			port: imapAccount.port,
			secure: true,
			tls: {
				rejectUnauthorized: false, // TODO deactivate after testing
			},
			auth: {
				user: imapAccount.username,
				pass: imapAccount.password,
				accessToken: imapAccount.accessToken
			},
			// @ts-ignore
			// qresync: true, // TODO type definitions
		})

		await imapClient.connect()
		let listTreeResponse = await imapClient.listTree()

		let fetchedMailboxTree = ImapMailbox.fromImapFlowListTreeResponse(listTreeResponse)
		let mailboxes = this.getSyncSessionMailboxes(knownMailboxes, fetchedMailboxTree, imapClient)

		await imapClient.logout()
		return mailboxes
	}

	private getSyncSessionMailboxes(knownMailboxes: SyncSessionMailbox[], fetchedMailboxTree: ImapMailbox, imapClient: typeof ImapFlow): SyncSessionMailbox[] {

	}

	// TODO Continue here!
	private traverseImapMailboxes(knowwMailboxes: SyncSessionMailbox[], imapMailbox: ImapMailbox, imap): SyncSessionMailbox[] {
		let index = knowwMailboxes.findIndex(value => value.mailboxState.path == imapMailbox.path)

		if (index == -1) {
			knowwMailboxes.push(new SyncSessionMailbox(MailboxState.fromImapMailbox(imapMailbox)))
		}
	}

	private isExistRunningProcessForMailbox(nextMailboxToDownload: SyncSessionMailbox) {
		return Array.from(this.runningSyncSessionProcesses.values()).find(syncProcess => {
			return syncProcess.getProcessMailbox().mailboxState.path == nextMailboxToDownload.mailboxState.path
		})
	}

	onStartSyncSessionProcess(nextMailboxToDownload: SyncSessionMailbox): void {
		console.log("onStartSyncSessionProcess")

		if (!this.adSyncOptimizer) {
			throw new ProgrammingError("The SyncSessionEventListener should be exclusively used by the AdSyncEfficiencyScoreOptimizer!")
		}

		if (!this.adSyncEventListener) {
			throw new ProgrammingError("The AdSyncEventListener has not been set!")
		}

		// we only want one process per IMAP mailbox
		if (!this.isExistRunningProcessForMailbox(nextMailboxToDownload)) {
			let adSyncDownloadBlockSizeOptimizer = new AdSyncDownloadBlockSizeOptimizer(nextMailboxToDownload, 10)
			let syncSessionProcess = new ImapSyncSessionProcess(this.nextProcessId, this.adSyncOptimizer, this.imapSyncState.imapAccount, adSyncDownloadBlockSizeOptimizer)
			this.nextProcessId += 1

			this.runningSyncSessionProcesses.set(syncSessionProcess.processId, syncSessionProcess)
			syncSessionProcess.startSyncSessionProcess(this.adSyncEventListener)
			adSyncDownloadBlockSizeOptimizer.startAdSyncOptimizer()
		}
	}

	onStopSyncSessionProcess(nextProcessIdToDrop: number): void {
		console.log("onStopSyncSessionProcess")

		let syncSessionProcessToDrop = this.runningSyncSessionProcesses.get(nextProcessIdToDrop)

		syncSessionProcessToDrop?.stopSyncSessionProcess()
		this.runningSyncSessionProcesses.delete(nextProcessIdToDrop)
	}

	onDownloadQuotaUpdate(downloadedQuota: number): void {
		this.downloadedQuota += downloadedQuota

		if (this.downloadedQuota > this.imapSyncState.maxQuota - DOWNLOADED_QUOTA_SAFETY_THRESHOLD) {
			this.shutDownSyncSession(true)
		}
	}

	onAllMailboxesFinish(): void {
		this.state = SyncSessionState.FINISHED
		this.adSyncEventListener?.onFinish()
		this.shutDownSyncSession(false)
	}

}
