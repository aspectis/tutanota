import {AdSyncOptimizer} from "./AdSyncOptimizer.js"
import {SyncSessionMailbox} from "../SyncSessionMailbox.js"
import {SyncSessionEventListener} from "../ImapSyncSession.js"

export interface AdSyncEfficiencyScoreOptimizerEventListener {
	onMailboxUpdate(processId: number, mailboxPath: string, efficiencyScore: number, timeToLiveInterval: number, downloadedQuota: number): void

	onMailboxFinish(processId: number, syncSessionMailbox: SyncSessionMailbox): void
}

interface OptimizerProcess {
	mailboxPath: string
	normalizedEfficiencyScore: number
	timeToLiveInterval: number
}

const OPTIMIZATION_INTERVAL = 30 // in seconds

export class AdSyncEfficiencyScoreOptimizer extends AdSyncOptimizer implements AdSyncEfficiencyScoreOptimizerEventListener {

	protected scheduler?: NodeJS.Timer
	private readonly optimizedMailboxes: SyncSessionMailbox[]
	private syncSessionEventListener: SyncSessionEventListener
	private lastAverageNormalizedEfficiencyScore: number = 0
	private lastOptimizerUpdateTimestamp?: number
	private runningProcessMap = new Map<number, OptimizerProcess>()

	constructor(mailboxes: SyncSessionMailbox[], optimizationDifference: number, syncSessionEventListener: SyncSessionEventListener) {
		super(optimizationDifference)
		this.optimizedMailboxes = mailboxes
		this.syncSessionEventListener = syncSessionEventListener
	}

	startAdSyncOptimizer(): void {
		this.scheduler = setInterval(this.optimize.bind(this), OPTIMIZATION_INTERVAL * 1000) // every OPTIMIZATION_INTERVAL seconds
		this.optimize() // call once

		// TODO handle IMAP server side rate limiting
	}

	protected optimize(): void {
		let averageNormalizedEfficiencyScore = this.getAverageNormalizedEfficiencyScore()
		console.log("averageNormalizedEfficiencyScore: " + averageNormalizedEfficiencyScore)

		if (averageNormalizedEfficiencyScore >= this.lastAverageNormalizedEfficiencyScore) {
			let nextMailboxesToDownload = this.nextMailboxesToDownload(this.optimizationDifference)
			nextMailboxesToDownload.forEach(mailbox => {
				this.syncSessionEventListener.onStartSyncSessionProcess(mailbox)
			})
		} else {
			let nextProcessIdsToDrop = this.nextProcessIdToDrop(this.optimizationDifference)
			nextProcessIdsToDrop.forEach(processId => {
				let mailboxToDrop = this.runningProcessMap.get(processId)
				let timeToLiveIntervalMS = 1000 * (mailboxToDrop ? mailboxToDrop.timeToLiveInterval : 0) // conversion to milliseconds

				// a process may run at least its timeToLiveInterval in seconds
				if (this.lastOptimizerUpdateTimestamp && this.lastOptimizerUpdateTimestamp + timeToLiveIntervalMS <= Date.now()) {
					this.runningProcessMap.delete(processId)
					this.syncSessionEventListener.onStopSyncSessionProcess(processId)
				}
			})
		}

		this.lastAverageNormalizedEfficiencyScore = averageNormalizedEfficiencyScore
		this.lastOptimizerUpdateTimestamp = Date.now()
	}

	private getMinimumTimeToLiveInterval(): number {
		return Math.min(...this.optimizedMailboxes.map(value => value.timeToLiveInterval))
	}

	private getAverageNormalizedEfficiencyScore(): number {
		if (this.runningProcessMap.size == 0) {
			return 0
		} else {
			return Array.from(this.runningProcessMap.values()).reduce<number>((acc: number, value: OptimizerProcess) => {
				acc += value.normalizedEfficiencyScore
				return acc
			}, 0) / this.runningProcessMap.size
		}
	}

	private nextMailboxesToDownload(optimizationDifference: number): SyncSessionMailbox[] {
		return this.optimizedMailboxes
				   .filter(value => !this.isExistRunningProcessForMailbox(value)) // we only want one process per IMAP folder
				   .sort((a, b) => b.efficiencyScore - a.efficiencyScore)
				   .slice(0, optimizationDifference)
	}

	private nextProcessIdToDrop(optimizationDifference: number): number[] {
		return Array.from(this.runningProcessMap.entries())
					.sort((a, b) => b[1].normalizedEfficiencyScore - a[1].normalizedEfficiencyScore)
					.map(value => value[0])
					.slice(0, optimizationDifference)
	}

	private isExistRunningProcessForMailbox(mailbox: SyncSessionMailbox) {
		return Array.from(this.runningProcessMap.values()).find(optimizerProcess => {
			return optimizerProcess.mailboxPath == mailbox.mailboxState.path
		})
	}

	onMailboxUpdate(processId: number, mailboxPath: string, normalizedEfficiencyScore: number, timeToLiveInterval: number,): void {
		let optimizerProcess = {
			mailboxPath: mailboxPath,
			normalizedEfficiencyScore: normalizedEfficiencyScore,
			timeToLiveInterval: timeToLiveInterval,
		}
		this.runningProcessMap.set(processId, optimizerProcess)
	}

	onMailboxFinish(processId: number, syncSessionMailbox: SyncSessionMailbox): void {
		this.runningProcessMap.delete(processId)
		this.syncSessionEventListener.onStopSyncSessionProcess(processId)

		let mailboxIndex = this.optimizedMailboxes.findIndex((mailbox) => {
			return mailbox.mailboxState.path == syncSessionMailbox.mailboxState.path
		})
		if (mailboxIndex != -1) {
			this.optimizedMailboxes.splice(mailboxIndex, 1)
		}

		// call onAllMailboxesFinish() once download of all IMAP folders is finished
		if (this.optimizedMailboxes.length == 0) {
			this.syncSessionEventListener.onAllMailboxesFinish()
		} else {
			// call optimize to start new processes
			this.optimize()
		}
	}
}
