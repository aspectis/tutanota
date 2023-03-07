import {AdSyncOptimizer} from "./AdSyncOptimizer.js"
import {ImapSyncSessionMailbox} from "../ImapSyncSessionMailbox.js"
import {SyncSessionEventListener} from "../ImapSyncSession.js"

export interface AdSyncEfficiencyScoreOptimizerEventListener {
	onDownloadUpdate(processId: number, efficiencyScore: number, timeToLiveInterval: number, downloadedQuota: number): void

	onMailboxFinish(processId: number, syncSessionMailbox: ImapSyncSessionMailbox): void
}

export class OptimizerProcess {
	mailboxPath: string
	normalizedEfficiencyScore?: number
	timeToLiveInterval?: number

	constructor(mailboxPath: string) {
		this.mailboxPath = mailboxPath
	}
}

const OPTIMIZATION_INTERVAL = 30 // in seconds

export class AdSyncEfficiencyScoreOptimizer extends AdSyncOptimizer implements AdSyncEfficiencyScoreOptimizerEventListener {

	protected scheduler?: NodeJS.Timer
	private readonly optimizedMailboxes: ImapSyncSessionMailbox[]
	private syncSessionEventListener: SyncSessionEventListener
	private lastAverageNormalizedEfficiencyScore: number = 0
	private lastOptimizerUpdateTimestamp?: number
	private runningProcessMap = new Map<number, OptimizerProcess>()
	private nextProcessId: number = 0

	constructor(mailboxes: ImapSyncSessionMailbox[], optimizationDifference: number, syncSessionEventListener: SyncSessionEventListener) {
		super(optimizationDifference)
		this.optimizedMailboxes = mailboxes
		this.syncSessionEventListener = syncSessionEventListener
	}

	startAdSyncOptimizer(): void {
		this.scheduler = setInterval(this.optimize.bind(this), OPTIMIZATION_INTERVAL * 1000) // every OPTIMIZATION_INTERVAL seconds
		this.optimize() // call once to start downloading of mails

		// TODO handle IMAP server side rate limiting
	}

	// TODO implement better heuristic for checking if a process is slow

	protected optimize(): void { // TODO make sure that we do not close the last running process, even though it might be slow sometimes...
		let averageNormalizedEfficiencyScore = this.getAverageNormalizedEfficiencyScore()
		console.log("averageNormalizedEfficiencyScore: " + averageNormalizedEfficiencyScore)

		if (averageNormalizedEfficiencyScore >= this.lastAverageNormalizedEfficiencyScore) {
			let nextMailboxesToDownload = this.nextMailboxesToDownload(this.optimizationDifference)

			nextMailboxesToDownload.forEach(mailbox => {
				if (!this.isExistRunningProcessForMailbox(mailbox)) { // we only allow one process per IMAP folder
					this.runningProcessMap.set(this.nextProcessId, new OptimizerProcess(mailbox.mailboxState.path))
					this.syncSessionEventListener.onStartSyncSessionProcess(this.nextProcessId, mailbox)
					this.nextProcessId += 1
				}
			})
		} else {
			let nextProcessIdsToDrop = this.nextProcessIdsToDrop(1) // TODO Should we always decrease by one?

			nextProcessIdsToDrop.forEach(processId => {
				let mailboxToDrop = this.runningProcessMap.get(processId)
				let timeToLiveIntervalMS = 1000 * (mailboxToDrop?.timeToLiveInterval ? mailboxToDrop.timeToLiveInterval : 0) // conversion to milliseconds

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

	private getAverageNormalizedEfficiencyScore(): number {
		if (this.runningProcessMap.size == 0) {
			return 0
		} else {
			let activeProcessCount = 0
			return Array.from(this.runningProcessMap.values()).reduce<number>((acc: number, value: OptimizerProcess) => {
				if (value.normalizedEfficiencyScore) {
					acc += value.normalizedEfficiencyScore
					activeProcessCount += 1
				}
				return acc
			}, 0) / (activeProcessCount != 0 ? activeProcessCount : 1)
		}
	}

	private nextMailboxesToDownload(optimizationDifference: number): ImapSyncSessionMailbox[] {
		return this.optimizedMailboxes
				   .filter(mailbox => !this.isExistRunningProcessForMailbox(mailbox)) // we only allow one process per IMAP folder
				   .sort((a, b) => b.efficiencyScore - a.efficiencyScore)
				   .slice(0, optimizationDifference)
	}

	private nextProcessIdsToDrop(optimizationDifference: number): number[] {
		return Array.from(this.runningProcessMap.entries())
					.sort((a, b) => {
						if (!b[1].normalizedEfficiencyScore || !a[1].normalizedEfficiencyScore) {
							return 0
						} else {
							return b[1].normalizedEfficiencyScore - a[1].normalizedEfficiencyScore
						}
					})
					.map(value => value[0])
					.slice(0, optimizationDifference)
	}

	private isExistRunningProcessForMailbox(mailbox: ImapSyncSessionMailbox) {
		return Array.from(this.runningProcessMap.values()).find(optimizerProcess => {
			return optimizerProcess.mailboxPath == mailbox.mailboxState.path
		})
	}

	onDownloadUpdate(processId: number, normalizedEfficiencyScore: number, timeToLiveInterval: number, downloadedQuota: number): void {
		let optimizerProcess = this.runningProcessMap.get(processId)
		if (optimizerProcess) {
			optimizerProcess.normalizedEfficiencyScore = normalizedEfficiencyScore
			optimizerProcess.timeToLiveInterval = timeToLiveInterval
			this.runningProcessMap.set(processId, optimizerProcess)

			this.syncSessionEventListener.onDownloadQuotaUpdate(downloadedQuota)
		}
	}

	onMailboxFinish(processId: number, syncSessionMailbox: ImapSyncSessionMailbox): void {
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
			this.optimize() // TODO Check if we should only start one new process!
		}
	}
}
