import {SyncSessionMailbox} from "./SyncSessionMailbox.js"
import {ImapSyncState} from "./ImapSyncState.js"
import {AdSyncEventListener} from "./AdSyncEventListener.js"
import {AdSyncEfficiencyScoreOptimizer} from "./optimizer/AdSyncEfficiencyScoreOptimizer.js"
import {ImapSyncSessionProcess} from "./ImapSyncSessionProcess.js"
import {AdSyncDownloadBlockSizeOptimizer} from "./optimizer/AdSyncDownloadBlockSizeOptimizer.js"
import {ProgrammingError} from "../../../api/common/error/ProgrammingError.js"

export enum SyncSessionState {
	RUNNING,
	PAUSED,
	POSTPONED,
	FINISHED
}

export interface SyncSessionEventListener {
	onStartSyncSessionProcess(syncSessionMailbox: SyncSessionMailbox): void

	onStopSyncSessionProcess(processId: number): void
}

export class ImapSyncSession implements SyncSessionEventListener {
	private imapSyncState: ImapSyncState
	private state: SyncSessionState
	private adSyncOptimizer?: AdSyncEfficiencyScoreOptimizer
	private adSyncEventListener?: AdSyncEventListener
	private nextProcessId: number = 0
	private runningSyncSessionProcesses: Map<number, ImapSyncSessionProcess> = new Map()

	constructor(imapSyncState: ImapSyncState) {
		this.imapSyncState = imapSyncState
		this.state = SyncSessionState.PAUSED
	}

	onStartSyncSessionProcess(nextMailboxToDownload: SyncSessionMailbox): void {
		if (!this.adSyncOptimizer) {
			throw new ProgrammingError("The SyncSessionEventListener should be exclusively used by the AdSyncEfficiencyScoreOptimizer!")
		}

		if (!this.adSyncEventListener) {
			throw new ProgrammingError("The AdSyncEventListener has not been set!")
		}

		console.log("onStartSyncSessionProcess")

		let adSyncDownloadBlockSizeOptimizer = new AdSyncDownloadBlockSizeOptimizer(nextMailboxToDownload, 10)
		let syncSessionProcess = new ImapSyncSessionProcess(this.nextProcessId, this.adSyncOptimizer, this.imapSyncState.imapAccount, adSyncDownloadBlockSizeOptimizer)
		this.nextProcessId += 1

		this.runningSyncSessionProcesses.set(syncSessionProcess.processId, syncSessionProcess)
		syncSessionProcess.startSyncSessionProcess(this.adSyncEventListener)
	}

	onStopSyncSessionProcess(nextProcessIdToDrop: number): void {
		console.log("onStopSyncSessionProcess")

		let syncSessionProcessToDrop = this.runningSyncSessionProcesses.get(nextProcessIdToDrop)

		syncSessionProcessToDrop?.stopSyncSessionProcess()
		this.runningSyncSessionProcesses.delete(nextProcessIdToDrop)
	}

	async startSyncSession(adSyncEventListener: AdSyncEventListener): Promise<SyncSessionState> {
		this.adSyncEventListener = adSyncEventListener
		this.state = SyncSessionState.RUNNING

		this.runSyncSession(adSyncEventListener)
		return this.state
	}

	async stopSyncSession(): Promise<SyncSessionState> {
		this.state = SyncSessionState.PAUSED
		this.adSyncOptimizer?.stopAdSyncOptimizer()
		this.runningSyncSessionProcesses.clear()
		this.nextProcessId = 0
		return this.state
	}

	private async runSyncSession(adSyncEventListener: AdSyncEventListener) {
		let mailboxes = await this.setupSyncSession(adSyncEventListener)

		this.adSyncOptimizer = new AdSyncEfficiencyScoreOptimizer(mailboxes, 1, this)
	}

	private async setupSyncSession(adSyncEventListener: AdSyncEventListener): Promise<SyncSessionMailbox[]> {
		let mailboxes = this.imapSyncState.mailboxStates.map(mailboxState => {
			return new SyncSessionMailbox(mailboxState)
		})

		// mailboxes.map(mailBox => {
		// 	//mailBox.initSessionMailbox()
		// 	// TODO fetch mailbox list
		// 	// TODO load initial information
		// 	// TODO set up everything
		// })

		return mailboxes
	}
}
