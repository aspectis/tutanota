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

const OPTIMIZATION_INTERVAL = 10 // in seconds
const EFFICIENCY_SCORE_THRESHOLD: number = 0.1

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
	}

	// TODO handle IMAP server side rate limiting
	// TODO implement improved heuristic for checking if a process is slow
	protected optimize(): void {
		let averageNormalizedEfficiencyScore = this.getAverageNormalizedEfficiencyScore()
		console.log("averageNormalizedEfficiencyScore: " + averageNormalizedEfficiencyScore)

		if (averageNormalizedEfficiencyScore + EFFICIENCY_SCORE_THRESHOLD >= this.lastAverageNormalizedEfficiencyScore) {
			this.startSyncSessionProcesses(this.optimizationDifference)
		} else if (this.runningProcessMap.size > 1) {
			this.stopSyncSessionProcesses(1)
		}

		this.lastAverageNormalizedEfficiencyScore = averageNormalizedEfficiencyScore
		this.lastOptimizerUpdateTimestamp = Date.now()
	}

	private startSyncSessionProcesses(amount: number) {
		let nextMailboxesToDownload = this.nextMailboxesToDownload(amount)

		nextMailboxesToDownload.forEach(mailbox => {
			if (!this.isExistRunningProcessForMailbox(mailbox)) { // we only allow one process per IMAP folder
				this.runningProcessMap.set(this.nextProcessId, new OptimizerProcess(mailbox.mailboxState.path))
				this.syncSessionEventListener.onStartSyncSessionProcess(this.nextProcessId, mailbox)
				this.nextProcessId += 1
			}
		})
	}

	private stopSyncSessionProcesses(amount: number) {
		let nextProcessIdsToDrop = this.nextProcessIdsToDrop(amount)

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

	private nextMailboxesToDownload(amount: number): ImapSyncSessionMailbox[] {
		return this.optimizedMailboxes
				   .filter(mailbox => !this.isExistRunningProcessForMailbox(mailbox)) // we only allow one process per IMAP folder
				   .sort((a, b) => b.efficiencyScore - a.efficiencyScore)
				   .slice(0, amount)
	}

	private nextProcessIdsToDrop(amount: number): number[] {
		return Array.from(this.runningProcessMap.entries())
					.sort((a, b) => {
						if (!b[1].normalizedEfficiencyScore || !a[1].normalizedEfficiencyScore) {
							return 0
						} else {
							return b[1].normalizedEfficiencyScore - a[1].normalizedEfficiencyScore
						}
					})
					.map(value => value[0])
					.slice(0, amount)
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
			let isLastMailboxFinish = this.optimizedMailboxes.length == 1
			this.optimizedMailboxes.splice(mailboxIndex, 1)

			// call onAllMailboxesFinish() once download of all IMAP folders is finished
			if (isLastMailboxFinish) {
				this.syncSessionEventListener.onAllMailboxesFinish()
			} else {
				// start a new sync session processes in replacement for the finished one
				this.startSyncSessionProcesses(1)
			}
		}
	}
}
