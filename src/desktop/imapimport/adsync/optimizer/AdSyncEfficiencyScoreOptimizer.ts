import {AdSyncOptimizer} from "./AdSyncOptimizer.js"
import {SyncSessionMailbox} from "../SyncSessionMailbox.js"
import {ImapSyncSessionProcess} from "../ImapSyncSessionProcess.js"
import {ImapAccount} from "../ImapSyncState.js"
import {AdSyncDownloadBlockSizeOptimizer} from "./AdSyncDownloadBlockSizeOptimizer.js"
import {AdSyncEventListener} from "../AdSyncEventListener.js"

export interface AdSyncEfficiencyScoreOptimizerEventListener {
	onEfficiencyScoreMeasured(processId: number, efficiencyScore: number, downloadedQuota: number): void

	onFinish(processId: number, syncSessionMailbox: SyncSessionMailbox): void
}

export class AdSyncEfficiencyScoreOptimizer extends AdSyncOptimizer implements AdSyncEfficiencyScoreOptimizerEventListener {

	private readonly imapAccount: ImapAccount
	private readonly mailboxes: SyncSessionMailbox[]
	private adSyncEventListener: AdSyncEventListener
	private lastAverageNormalizedEfficiencyScore: number = 0
	private normalizedEfficiencyScores: Map<number, number> = new Map<number, number>()
	private runningProcessCount: number = 0
	private nextProcessId: number = 0
	private runningSyncSessionProcesses: Map<number, ImapSyncSessionProcess> = new Map()
	private downloadedQuota: number = 0

	constructor(imapAccount: ImapAccount, mailboxes: SyncSessionMailbox[], adSyncEventListener: AdSyncEventListener, optimizationDifference: number) {
		super(optimizationDifference)
		this.imapAccount = imapAccount
		this.mailboxes = mailboxes
		this.adSyncEventListener = adSyncEventListener
	}

	protected optimize(): void {
		let averageNormalizedEfficiencyScore = this.averageNormalizedEfficiencyScore

		if (averageNormalizedEfficiencyScore > this.lastAverageNormalizedEfficiencyScore) {
			let nextMailboxToDownload = this.nextMailboxToDownload()
			let adSyncDownloadBlockSizeOptimizer = new AdSyncDownloadBlockSizeOptimizer(nextMailboxToDownload, 10)
			let syncSessionProcess = new ImapSyncSessionProcess(this.nextProcessId, this, this.imapAccount, adSyncDownloadBlockSizeOptimizer)
			this.nextProcessId += 1

			this.runningSyncSessionProcesses.set(syncSessionProcess.processId, syncSessionProcess)

			syncSessionProcess.startSyncSessionProcess(this.adSyncEventListener)
		} else {
			let nextProcessIdToDrop = this.nextProcessIdToDrop()

			let syncSessionProcessToDrop = this.runningSyncSessionProcesses.get(nextProcessIdToDrop)

			syncSessionProcessToDrop?.stopSyncSessionProcess()
			this.runningSyncSessionProcesses.delete(nextProcessIdToDrop)
		}

		this.lastAverageNormalizedEfficiencyScore = averageNormalizedEfficiencyScore
	}

	stopAdSyncOptimizer(): void {
	}

	onEfficiencyScoreMeasured(processId: number, efficiencyScore: number, downloadedQuota: number): void {
		this.normalizedEfficiencyScores.set(processId, efficiencyScore)
		this.downloadedQuota += downloadedQuota
	}

	onFinish(processId: number, syncSessionMailbox: SyncSessionMailbox): void {
		// TODO
	}

	get averageNormalizedEfficiencyScore(): number {
		return Array.from(this.normalizedEfficiencyScores.values()).reduce((acc, value) => {
			return acc += value
		}) / this.runningProcessCount
	}

	private nextMailboxToDownload(): SyncSessionMailbox {
		return this.mailboxes.sort((a, b: SyncSessionMailbox) => {
			return a.efficiencyScore - b.efficiencyScore
		})[0]
	}

	private nextProcessIdToDrop(): number {
		return Array.from(this.normalizedEfficiencyScores.entries()).reduce((previousProcessIdTuple, currentProcessIdTuple) => {
			if (previousProcessIdTuple[1] < currentProcessIdTuple[1]) {
				return previousProcessIdTuple
			} else {
				return currentProcessIdTuple
			}
		})[0]
	}
}