import {ImapSyncSessionMailbox} from "./ImapSyncSessionMailbox.js"
import {ImapSyncState, MailboxState} from "./ImapSyncState.js"
import {AdSyncEventListener, AdSyncEventType} from "./AdSyncEventListener.js"
import {AdSyncEfficiencyScoreOptimizer} from "./optimizer/AdSyncEfficiencyScoreOptimizer.js"
import {ImapSyncSessionProcess} from "./ImapSyncSessionProcess.js"
import {AdSyncDownloadBlockSizeOptimizer} from "./optimizer/AdSyncDownloadBlockSizeOptimizer.js"
import {ProgrammingError} from "../../../api/common/error/ProgrammingError.js"
import {ImapFlow} from "imapflow"
import {ImapMailbox} from "./imapmail/ImapMailbox.js"

const DOWNLOADED_QUOTA_SAFETY_THRESHOLD: number = 50000 // in byte
const DEFAULT_POSTPONE_TIME: number = 24 * 60 * 60 * 1000 // 1 day

export enum SyncSessionState {
	RUNNING,
	PAUSED,
	POSTPONED,
	FINISHED
}

export interface SyncSessionEventListener {
	onStartSyncSessionProcess(processId: number, syncSessionMailbox: ImapSyncSessionMailbox): void

	onStopSyncSessionProcess(processId: number): void

	onDownloadQuotaUpdate(downloadedQuota: number): void

	onAllMailboxesFinish(): Promise<void>
}

export class ImapSyncSession implements SyncSessionEventListener {
	private imapSyncState: ImapSyncState
	private state: SyncSessionState
	private adSyncOptimizer?: AdSyncEfficiencyScoreOptimizer
	private adSyncEventListener?: AdSyncEventListener
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

		if (isPostpone) {
			this.state = SyncSessionState.POSTPONED
			this.adSyncEventListener?.onPostpone(new Date(Date.now() + DEFAULT_POSTPONE_TIME))
		}
	}

	private async runSyncSession(adSyncEventListener: AdSyncEventListener) {
		let mailboxes = await this.setupSyncSession(adSyncEventListener)

		this.adSyncOptimizer = new AdSyncEfficiencyScoreOptimizer(mailboxes, 3, this)
		this.adSyncOptimizer.startAdSyncOptimizer()
	}

	private async setupSyncSession(adSyncEventListener: AdSyncEventListener): Promise<ImapSyncSessionMailbox[]> {
		let knownMailboxes = this.imapSyncState.mailboxStates.map(mailboxState => {
			return new ImapSyncSessionMailbox(mailboxState)
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
		await imapClient.logout()

		let fetchedRootMailboxes = listTreeResponse.folders.map(listTreeResponse => {
			return ImapMailbox.fromImapFlowListTreeResponse(listTreeResponse, false)
		})

		return this.getSyncSessionMailboxes(knownMailboxes, fetchedRootMailboxes)
	}

	private getSyncSessionMailboxes(knownMailboxes: ImapSyncSessionMailbox[], fetchedRootMailboxes: ImapMailbox[]): ImapSyncSessionMailbox[] {
		let resultMailboxes: ImapSyncSessionMailbox[] = []
		fetchedRootMailboxes.forEach(fetchedRootMailbox => {
			resultMailboxes.push(...this.traverseImapMailboxes(knownMailboxes, fetchedRootMailbox))
		})

		knownMailboxes.map(knownMailbox => {
			let index = resultMailboxes.findIndex(mailbox => {
				return mailbox.mailboxState.path == knownMailbox.mailboxState.path
			})

			if (index == -1) {
				let deletedImapMailbox = ImapMailbox.fromSyncSessionMailbox(knownMailbox)
				this.adSyncEventListener?.onMailbox(deletedImapMailbox, AdSyncEventType.DELETE)
				return true
			}

			return false
		})

		return resultMailboxes
	}

	private traverseImapMailboxes(knownMailboxes: ImapSyncSessionMailbox[], imapMailbox: ImapMailbox): ImapSyncSessionMailbox[] {
		let result = []

		let index = knownMailboxes.findIndex(value => value.mailboxState.path == imapMailbox.path)
		if (index == -1) {
			this.adSyncEventListener?.onMailbox(imapMailbox, AdSyncEventType.CREATE)
		}

		let syncSessionMailbox = new ImapSyncSessionMailbox(MailboxState.fromImapMailbox(imapMailbox))
		if (imapMailbox.specialUse) {
			syncSessionMailbox.specialUse = imapMailbox.specialUse
		}

		// some settings lead to a efficiencyScore of 0 (zero) which means that the mailbox should not be migrated
		if (syncSessionMailbox.efficiencyScore != 0) {
			result.push(syncSessionMailbox)
		}

		imapMailbox.subFolders?.forEach(imapMailbox => {
			result.push(...this.traverseImapMailboxes(knownMailboxes, imapMailbox))
		})
		return result
	}

	onStartSyncSessionProcess(processId: number, nextMailboxToDownload: ImapSyncSessionMailbox): void {
		console.log("onStartSyncSessionProcess")

		if (!this.adSyncOptimizer) {
			throw new ProgrammingError("The SyncSessionEventListener should be exclusively used by the AdSyncEfficiencyScoreOptimizer!")
		}

		if (!this.adSyncEventListener) {
			throw new ProgrammingError("The AdSyncEventListener has not been set!")
		}

		let adSyncDownloadBlockSizeOptimizer = new AdSyncDownloadBlockSizeOptimizer(nextMailboxToDownload, 50)
		let syncSessionProcess = new ImapSyncSessionProcess(processId, this.adSyncOptimizer, this.imapSyncState.imapAccount, adSyncDownloadBlockSizeOptimizer)

		this.runningSyncSessionProcesses.set(syncSessionProcess.processId, syncSessionProcess)
		syncSessionProcess.startSyncSessionProcess(this.adSyncEventListener)
		adSyncDownloadBlockSizeOptimizer.startAdSyncOptimizer()
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

	async onAllMailboxesFinish(): Promise<void> {
		console.log("onAllMailboxesFinish")
		if (this.state != SyncSessionState.FINISHED) {
			this.state = SyncSessionState.FINISHED
			await this.shutDownSyncSession(false)
			this.adSyncEventListener?.onFinish(this.downloadedQuota)
		}
	}
}
