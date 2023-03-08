import {AdSyncOptimizer, OptimizerUpdateAction, THROUGHPUT_THRESHOLD} from "./AdSyncOptimizer.js"
import {ImapSyncSessionMailbox} from "../ImapSyncSessionMailbox.js"
import {SyncSessionEventListener} from "../ImapSyncSession.js"
import {AverageThroughput, TimeStamp} from "../utils/AdSyncUtils.js"
import {ProgrammingError} from "../../../../api/common/error/ProgrammingError.js"

export interface AdSyncParallelProcessesOptimizerEventListener {
	onDownloadUpdate(processId: number, syncSessionMailbox: ImapSyncSessionMailbox, downloadedQuota: number): void

	onMailboxFinish(processId: number, syncSessionMailbox: ImapSyncSessionMailbox): void
}

export class OptimizerProcess {
	mailboxPath: string
	processStartTime: TimeStamp = Date.now()
	syncSessionMailbox?: ImapSyncSessionMailbox

	constructor(mailboxPath: string) {
		this.mailboxPath = mailboxPath
	}
}

const OPTIMIZATION_INTERVAL = 5 // in seconds

export class AdSyncParallelProcessesOptimizer extends AdSyncOptimizer implements AdSyncParallelProcessesOptimizerEventListener {

	protected scheduler?: NodeJS.Timer
	private readonly optimizedSyncSessionMailboxes: ImapSyncSessionMailbox[]
	private syncSessionEventListener: SyncSessionEventListener
	private runningProcessMap = new Map<number, OptimizerProcess>()
	private nextProcessId: number = 0
	private optimizerUpdateActionHistory: OptimizerUpdateAction[] = [OptimizerUpdateAction.NO_UPDATE]

	constructor(mailboxes: ImapSyncSessionMailbox[], optimizationDifference: number, syncSessionEventListener: SyncSessionEventListener) {
		super(optimizationDifference)
		this.optimizedSyncSessionMailboxes = mailboxes
		this.syncSessionEventListener = syncSessionEventListener
	}

	override startAdSyncOptimizer(): void {
		super.startAdSyncOptimizer()
		this.scheduler = setInterval(this.optimize.bind(this), OPTIMIZATION_INTERVAL * 1000) // every OPTIMIZATION_INTERVAL seconds
		this.optimize() // call once to start downloading of mails
	}

	// TODO handle IMAP server side rate limiting
	protected optimize(): void {
		let currentInterval = this.getCurrentTimeStampInterval()
		let lastInterval = this.getLastTimeStampInterval()
		let averageCombinedThroughputCurrent = this.getAverageCombinedThroughputInTimeInterval(currentInterval.fromTimeStamp, currentInterval.toTimeStamp)
		let averageCombinedThroughputLast = this.getAverageCombinedThroughputInTimeInterval(lastInterval.fromTimeStamp, lastInterval.toTimeStamp)
		console.log("(ParallelProcessOptimizer) Throughput stats: ... | " + averageCombinedThroughputLast + " | " + averageCombinedThroughputCurrent + " |")

		let lastUpdateAction = this.optimizerUpdateActionHistory.at(-1)
		if (typeof lastUpdateAction === 'undefined') {
			throw new ProgrammingError("The optimizerUpdateActionHistory has not been initialized correctly!")
		}

		if (averageCombinedThroughputCurrent + THROUGHPUT_THRESHOLD >= averageCombinedThroughputLast) {
			if (lastUpdateAction != OptimizerUpdateAction.DECREASE) {
				this.startSyncSessionProcesses(this.optimizationDifference)
				this.optimizerUpdateActionHistory.push(OptimizerUpdateAction.INCREASE)
			} else if (this.runningProcessMap.size > 1) {
				this.stopSyncSessionProcesses(1)
				this.optimizerUpdateActionHistory.push(OptimizerUpdateAction.DECREASE)
			}
		} else {
			if (lastUpdateAction == OptimizerUpdateAction.INCREASE && this.runningProcessMap.size > 1) {
				this.stopSyncSessionProcesses(1)
				this.optimizerUpdateActionHistory.push(OptimizerUpdateAction.DECREASE)
			}
		}

		this.optimizerUpdateTimeStampHistory.push(currentInterval.toTimeStamp)
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
			if (mailboxToDrop) {
				let timeToLiveIntervalMS = 1000 * (mailboxToDrop.syncSessionMailbox?.timeToLiveInterval ? mailboxToDrop.syncSessionMailbox?.timeToLiveInterval : 0) // conversion to milliseconds

				// a process may run at least its timeToLiveInterval in seconds
				if (mailboxToDrop.processStartTime + timeToLiveIntervalMS <= Date.now()) {
					if (mailboxToDrop.syncSessionMailbox) {
						let index = this.optimizedSyncSessionMailboxes.findIndex(mailbox => {
							return mailbox.mailboxState.path == mailboxToDrop!.mailboxPath
						})
						this.optimizedSyncSessionMailboxes[index] = mailboxToDrop.syncSessionMailbox
					}
					this.runningProcessMap.delete(processId)
					this.syncSessionEventListener.onStopSyncSessionProcess(processId)
				}
			}
		})
	}

	private getAverageCombinedThroughputInTimeInterval(fromTimeStamp: TimeStamp, toTimeStamp: TimeStamp): AverageThroughput {
		if (this.runningProcessMap.size == 0) {
			return 0
		} else {
			let activeProcessCount = 0
			return [...this.runningProcessMap.values()].reduce<AverageThroughput>((acc: AverageThroughput, value: OptimizerProcess) => {
				if (value.syncSessionMailbox) {
					acc += value.syncSessionMailbox.getAverageThroughputInTimeInterval(fromTimeStamp, toTimeStamp)
					activeProcessCount += 1
				}
				return acc
			}, 0) / (activeProcessCount != 0 ? activeProcessCount : 1)
		}
	}

	private nextMailboxesToDownload(amount: number): ImapSyncSessionMailbox[] {
		return this.optimizedSyncSessionMailboxes
				   .filter(mailbox => !this.isExistRunningProcessForMailbox(mailbox)) // we only allow one process per IMAP folder
				   .sort((a, b) => b.importance - a.importance)
				   .slice(0, amount)
	}

	private nextProcessIdsToDrop(amount: number): number[] {
		let currentInterval = this.getCurrentTimeStampInterval()
		return [...this.runningProcessMap.entries()]
			.filter(([_processId, value]) => {
				return typeof value.syncSessionMailbox !== 'undefined'
			})
			.sort(([_processIdA, valueA], [_processIdB, valueB]) => {
				let averageEfficiencyScoreA = valueB.syncSessionMailbox!.getAverageEfficiencyScoreInTimeInterval(currentInterval.fromTimeStamp, currentInterval.toTimeStamp)
				let averageEfficiencyScoreB = valueB.syncSessionMailbox!.getAverageEfficiencyScoreInTimeInterval(currentInterval.fromTimeStamp, currentInterval.toTimeStamp)
				return averageEfficiencyScoreB - averageEfficiencyScoreA
			})
			.map(([processId, _value]) => processId)
			.slice(0, amount)
	}

	private isExistRunningProcessForMailbox(mailbox: ImapSyncSessionMailbox) {
		return Array.from(this.runningProcessMap.values()).find(optimizerProcess => {
			return optimizerProcess.mailboxPath == mailbox.mailboxState.path
		})
	}

	forceStopSyncSessionProcess(processId: number) {
		this.runningProcessMap.delete(processId)
		this.syncSessionEventListener.onStopSyncSessionProcess(processId)
	}

	onDownloadUpdate(processId: number, syncSessionMailbox: ImapSyncSessionMailbox, downloadedQuota: number): void {
		let optimizerProcess = this.runningProcessMap.get(processId)
		if (optimizerProcess) {
			optimizerProcess.syncSessionMailbox = syncSessionMailbox
			this.runningProcessMap.set(processId, optimizerProcess)

			this.syncSessionEventListener.onDownloadQuotaUpdate(downloadedQuota)
		}
	}

	onMailboxFinish(processId: number, syncSessionMailbox: ImapSyncSessionMailbox): void {
		this.runningProcessMap.delete(processId)
		this.syncSessionEventListener.onStopSyncSessionProcess(processId)

		let mailboxIndex = this.optimizedSyncSessionMailboxes.findIndex((mailbox) => {
			return mailbox.mailboxState.path == syncSessionMailbox.mailboxState.path
		})
		if (mailboxIndex != -1) {
			let isLastMailboxFinish = this.optimizedSyncSessionMailboxes.length == 1
			this.optimizedSyncSessionMailboxes.splice(mailboxIndex, 1)

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
