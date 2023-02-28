import {AdSyncOptimizer} from "./AdSyncOptimizer.js"
import {SyncSessionMailbox} from "../SyncSessionMailbox.js"
import {SyncSessionEventListener} from "../ImapSyncSession.js"

export interface AdSyncEfficiencyScoreOptimizerEventListener {
	onEfficiencyScoreMeasured(processId: number, efficiencyScore: number, downloadedQuota: number): void

	onMailboxFinish(processId: number, syncSessionMailbox: SyncSessionMailbox): void
}

export class AdSyncEfficiencyScoreOptimizer extends AdSyncOptimizer implements AdSyncEfficiencyScoreOptimizerEventListener {

	protected scheduler: NodeJS.Timer
	private readonly optimizedMailboxes: SyncSessionMailbox[]
	private syncSessionEventListener: SyncSessionEventListener
	private lastAverageNormalizedEfficiencyScore: number = 0
	private normalizedEfficiencyScores: Map<number, number> = new Map<number, number>()
	private runningProcessCount: number = 0
	private downloadedQuota: number = 0

	constructor(mailboxes: SyncSessionMailbox[], optimizationDifference: number, syncSessionEventListener: SyncSessionEventListener) {
		super(optimizationDifference)
		this.optimizedMailboxes = mailboxes
		this.syncSessionEventListener = syncSessionEventListener
		this.scheduler = setInterval(this.optimize.bind(this), mailboxes[0].timeToLiveInterval * 1000) // every timeToLiveInterval many seconds
		this.optimize() // call once
	}

	protected optimize(): void {
		let averageNormalizedEfficiencyScore = this.getAverageNormalizedEfficiencyScore()

		// TODO Check downloaded quota!
		// TODO finish properly

		console.log("Score:" + averageNormalizedEfficiencyScore)

		if (averageNormalizedEfficiencyScore >= this.lastAverageNormalizedEfficiencyScore) {
			for (let index = 0; index < this.optimizationDifference; index++) { // create this.optimizationDifference many new processes
				let nextMailboxToDownload = this.nextMailboxToDownload()
				// TODO check that mailbox is not opened twice
				this.syncSessionEventListener.onStartSyncSessionProcess(nextMailboxToDownload)
				this.runningProcessCount += 1
			}
		} else {
			for (let index = 0; index < this.optimizationDifference; index++) {
				let nextProcessIdToDrop = this.nextProcessIdToDrop()
				this.syncSessionEventListener.onStopSyncSessionProcess(nextProcessIdToDrop)
				this.runningProcessCount -= 1
			}
		}

		this.lastAverageNormalizedEfficiencyScore = averageNormalizedEfficiencyScore
	}

	onEfficiencyScoreMeasured(processId: number, efficiencyScore: number, downloadedQuota: number): void {
		this.normalizedEfficiencyScores.set(processId, efficiencyScore)
		this.downloadedQuota += downloadedQuota
	}

	onMailboxFinish(processId: number, syncSessionMailbox: SyncSessionMailbox): void {
		this.syncSessionEventListener.onStopSyncSessionProcess(processId)

		let mailboxIndex = this.optimizedMailboxes.findIndex((mailbox) => {
			return mailbox.mailboxState.path == syncSessionMailbox.mailboxState.path
		})
		this.optimizedMailboxes.splice(mailboxIndex, 1)
	}

	private getAverageNormalizedEfficiencyScore(): number {
		if (this.normalizedEfficiencyScores.size == 0) {
			return 0
		} else {
			return Array.from(this.normalizedEfficiencyScores.values()).reduce((acc, value) => {
				acc += value
				return acc
			}) / this.runningProcessCount
		}
	}

	private nextMailboxToDownload(): SyncSessionMailbox {
		return this.optimizedMailboxes.sort((a, b: SyncSessionMailbox) => {
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
