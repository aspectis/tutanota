import {AdSyncOptimizer} from "./AdSyncOptimizer.js"
import {SyncSessionMailbox} from "../SyncSessionMailbox.js"
import {SyncSessionEventListener} from "../ImapSyncSession.js"

export interface AdSyncEfficiencyScoreOptimizerEventListener {
	onMailboxUpdate(processId: number, efficiencyScore: number, timeToLiveInterval: number, downloadedQuota: number): void

	onMailboxFinish(processId: number, syncSessionMailbox: SyncSessionMailbox): void
}

interface OptimizerProcess {
	normalizedEfficiencyScore: number
	timeToLiveInterval: number
}

export class AdSyncEfficiencyScoreOptimizer extends AdSyncOptimizer implements AdSyncEfficiencyScoreOptimizerEventListener {

	protected scheduler?: NodeJS.Timer
	private readonly optimizedMailboxes: SyncSessionMailbox[]
	private syncSessionEventListener: SyncSessionEventListener
	private lastAverageNormalizedEfficiencyScore: number = 0
	private lastOptimizerUpdateTimestamp?: number
	private optimizerProcessMap = new Map<number, OptimizerProcess>()
	private runningProcessCount: number = 0

	constructor(mailboxes: SyncSessionMailbox[], optimizationDifference: number, syncSessionEventListener: SyncSessionEventListener) {
		super(optimizationDifference)
		this.optimizedMailboxes = mailboxes
		this.syncSessionEventListener = syncSessionEventListener
	}

	startAdSyncOptimizer(): void {
		this.scheduler = setInterval(this.optimize.bind(this), this.getMinimumTimeToLiveInterval() * 1000) // every minimum timeToLiveInterval many seconds
		this.optimize() // call once
	}

	protected optimize(): void {
		let averageNormalizedEfficiencyScore = this.getAverageNormalizedEfficiencyScore()
		console.log("averageNormalizedEfficiencyScore: " + averageNormalizedEfficiencyScore)

		// TODO finish properly

		if (averageNormalizedEfficiencyScore >= this.lastAverageNormalizedEfficiencyScore) {
			for (let index = 0; index < this.optimizationDifference; index++) { // create this.optimizationDifference many new processes
				let nextMailboxToDownload = this.nextMailboxToDownload()
				this.syncSessionEventListener.onStartSyncSessionProcess(nextMailboxToDownload)
				this.runningProcessCount += 1
			}
		} else {
			for (let index = 0; index < this.optimizationDifference; index++) {
				let nextProcessIdToDrop = this.nextProcessIdToDrop()
				let mailboxToDrop = this.optimizerProcessMap.get(nextProcessIdToDrop)
				let timeToLiveIntervalMS = 1000 * (mailboxToDrop ? mailboxToDrop.timeToLiveInterval : 0)// conversion to milliseconds

				// a process may run at least its timeToLiveInterval in seconds
				if (this.lastOptimizerUpdateTimestamp && this.lastOptimizerUpdateTimestamp + timeToLiveIntervalMS <= Date.now()) {
					this.syncSessionEventListener.onStopSyncSessionProcess(nextProcessIdToDrop)
					this.runningProcessCount -= 1
				}
			}
		}

		this.lastAverageNormalizedEfficiencyScore = averageNormalizedEfficiencyScore
		this.lastOptimizerUpdateTimestamp = Date.now()
	}

	private getMinimumTimeToLiveInterval(): number {
		return Math.min(...this.optimizedMailboxes.map(value => value.timeToLiveInterval))
	}

	private getAverageNormalizedEfficiencyScore(): number {
		if (this.optimizerProcessMap.size == 0) {
			return 0
		} else {
			return Array.from(this.optimizerProcessMap.values()).reduce<number>((acc: number, value: OptimizerProcess) => {
				acc += value.normalizedEfficiencyScore
				return acc
			}, 0) / this.runningProcessCount
		}
	}

	private nextMailboxToDownload(): SyncSessionMailbox {
		return this.optimizedMailboxes.sort((a, b) => {
			return a.efficiencyScore - b.efficiencyScore
		})[0]
	}

	private nextProcessIdToDrop(): number {
		return Array.from(this.optimizerProcessMap.entries()).reduce((previousProcessIdTuple, currentProcessIdTuple) => {
			if (previousProcessIdTuple[1] < currentProcessIdTuple[1]) {
				return previousProcessIdTuple
			} else {
				return currentProcessIdTuple
			}
		})[0]
	}

	onMailboxUpdate(processId: number, normalizedEfficiencyScore: number, timeToLiveInterval: number): void {
		let optimizerProcess = {
			normalizedEfficiencyScore: normalizedEfficiencyScore,
			timeToLiveInterval: timeToLiveInterval,
		}
		this.optimizerProcessMap.set(processId, optimizerProcess)
	}

	onMailboxFinish(processId: number, syncSessionMailbox: SyncSessionMailbox): void {
		this.syncSessionEventListener.onStopSyncSessionProcess(processId)

		let mailboxIndex = this.optimizedMailboxes.findIndex((mailbox) => {
			return mailbox.mailboxState.path == syncSessionMailbox.mailboxState.path
		})
		this.optimizedMailboxes.splice(mailboxIndex, 1)
	}
}
