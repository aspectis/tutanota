import {SyncSessionMailbox} from "./SyncSessionMailbox.js"
import {ImapSyncState} from "./ImapSyncState.js"
import {AdSyncEventListener} from "./AdSyncEventListener.js"
import {ImapSyncSessionProcess} from "./ImapSyncSessionProcess.js"

export interface SyncSessionEventListener {
	onEfficiencyScoreMeasured(processId: number, efficiencyScore: number, downloadedQuota: number): void

	onFinish(processId: number, syncSessionMailbox: SyncSessionMailbox): void
}

export enum SyncSessionState {
	RUNNING,
	PAUSED,
	POSTPONED,
	FINISHED
}

export class ImapSyncSession implements SyncSessionEventListener {
	private imapSyncState: ImapSyncState
	private state: SyncSessionState
	private mailboxes: SyncSessionMailbox[]
	private efficiencyScores: Map<number, number> = new Map<number, number>()
	private processCount: number = 0
	private downloadedQuota: number

	constructor(imapSyncState: ImapSyncState) {
		this.imapSyncState = imapSyncState
		this.mailboxes = imapSyncState.mailboxStates.map(mailboxState => {
			return new SyncSessionMailbox(mailboxState)
		})
		this.state = SyncSessionState.PAUSED
		this.downloadedQuota = 0
	}

	async startSyncSession(adSyncEventListener: AdSyncEventListener): Promise<SyncSessionState> {
		this.state = SyncSessionState.RUNNING
		this.runSyncSession(adSyncEventListener)
		return this.state
	}

	async stopSyncSession(): Promise<SyncSessionState> {
		this.state = SyncSessionState.PAUSED
		// TODO stop things here
		return this.state
	}

	private async runSyncSession(adSyncEventListener: AdSyncEventListener) {
		let isSetup = await this.setupSyncSession(adSyncEventListener)

		let process1 = new ImapSyncSessionProcess(
			1,
			this,
			this.imapSyncState.imapAccount,
			this.mailboxes[0],
		)

		// TODO fetch mailbox list
		// TODO load initial information
		// TODO set up everything
		// TODO start sync
		// TODO trigger events


	}

	private async setupSyncSession(adSyncEventListener: AdSyncEventListener) {


		this.mailboxes.map(mailBox => {
			//mailBox.initSessionMailbox()
		})
	}

	onEfficiencyScoreMeasured(processId: number, efficiencyScore: number, downloadedQuota: number): void {
		this.efficiencyScores.set(processId, efficiencyScore)
		this.downloadedQuota += downloadedQuota
	}

	onFinish(processId: number, syncSessionMailbox: SyncSessionMailbox): void {
		// TODO If all mailboxes are finished call adSyncEventListener.onFinish()
		// Otherwise open new mailbox
	}

	get minEfficiencyScore(): number {
		return Math.min(...this.efficiencyScores.values())
	}

	get averageEfficiencyScore(): number {
		return Array.from(this.efficiencyScores.values()).reduce((acc, value) => {
			return acc += value
		}) / this.processCount
	}
}
