import {MailboxState} from "./ImapSyncState.js"
import {
	AverageEfficiencyScore,
	AverageThroughput,
	DownloadBlockSize,
	getAverageOfList,
	Throughput,
	TimeIntervalTimeStamp,
	TimeStamp
} from "./utils/AdSyncUtils.js"

const SPECIAL_USE_INBOX_FLAG = "\\Inbox"
const SPECIAL_USE_SENT_FLAG = "\\Sent"
const SPECIAL_USE_DRAFTS_FLAG = "\\Drafts"
const SPECIAL_USE_TRASH_FLAG = "\\Trash"
const SPECIAL_USE_ARCHIVE_FLAG = "\\Archive"
const SPECIAL_USE_JUNK_FLAG = "\\Junk"
const SPECIAL_USE_ALL_FLAG = "\\All"
const SPECIAL_USE_FLAGGED_FLAG = "\\FLAGGED"

export enum SyncSessionMailboxImportance {
	NO_SYNC = 0,
	LOW = 1,
	MEDIUM = 2,
	HIGH = 3
}

export class ImapSyncSessionMailbox {
	mailboxState: MailboxState
	mailCount: number | null = 0
	timeToLiveInterval: number = 10 // in seconds
	downloadBlockSize = 500
	importance: SyncSessionMailboxImportance = SyncSessionMailboxImportance.MEDIUM
	private _specialUse: string = ""
	private throughputHistory: Map<TimeStamp, Throughput> = new Map<TimeStamp, Throughput>()
	private averageThroughputInTimeIntervalHistory: Map<TimeIntervalTimeStamp, AverageThroughput> = new Map<TimeIntervalTimeStamp, AverageThroughput>()
	private downloadBlockSizeHistory: Map<TimeStamp, DownloadBlockSize> = new Map<TimeStamp, DownloadBlockSize>()

	constructor(mailboxState: MailboxState) {
		this.mailboxState = mailboxState
	}

	initSessionMailbox(mailCount?: number): void {
		this.mailCount = mailCount ? mailCount : null
	}

	get specialUse(): string {
		return this._specialUse
	}

	set specialUse(value: string) {
		this._specialUse = value

		switch (this._specialUse) {
			case SPECIAL_USE_INBOX_FLAG:
				this.importance = SyncSessionMailboxImportance.HIGH
				break
			case SPECIAL_USE_TRASH_FLAG:
			case SPECIAL_USE_ARCHIVE_FLAG:
			case SPECIAL_USE_ALL_FLAG:
			case SPECIAL_USE_SENT_FLAG:
				this.importance = SyncSessionMailboxImportance.LOW
				break
			case SPECIAL_USE_JUNK_FLAG:
				this.importance = SyncSessionMailboxImportance.NO_SYNC
				break
			default:
				this.importance = SyncSessionMailboxImportance.MEDIUM
				break
		}
	}

	getAverageThroughputInTimeInterval(fromTimeStamp: TimeStamp, toTimeStamp: TimeStamp): AverageThroughput {
		let throughputsInTimeInterval = [...this.throughputHistory.entries()]
			.filter(([timeStamp, _throughput]) => {
				return timeStamp >= fromTimeStamp && timeStamp < toTimeStamp
			})
			.map(([_timeStamp, throughput]) => {
				return throughput
			})
		let averageThroughputInTimeInterval = getAverageOfList(throughputsInTimeInterval)
		this.averageThroughputInTimeIntervalHistory.set(`${fromTimeStamp}${toTimeStamp}`, averageThroughputInTimeInterval)
		return averageThroughputInTimeInterval
	}

	getAverageEfficiencyScoreInTimeInterval(fromTimeStamp: TimeStamp, toTimeStamp: TimeStamp): AverageEfficiencyScore {
		let key = `${fromTimeStamp}${toTimeStamp}`
		let averageExists = this.averageThroughputInTimeIntervalHistory.has(key)
		return this.importance * (averageExists ? this.averageThroughputInTimeIntervalHistory.get(key)! : this.getAverageThroughputInTimeInterval(fromTimeStamp, toTimeStamp))
	}

	// TODO Use this somehow?
	getDownloadBlockSizeInTimeInterval(fromTimeStamp: TimeStamp, toTimeStamp: TimeStamp): DownloadBlockSize {
		let downloadBlockSizeInTimeInterval = [...this.downloadBlockSizeHistory.entries()]
			.filter(([timeStamp, _downloadBlockSize]) => {
				return timeStamp >= fromTimeStamp && timeStamp < toTimeStamp
			})
			.map(([_timeStamp, downloadBlockSize]) => {
				return downloadBlockSize
			})
			.at(-1)
		if (typeof downloadBlockSizeInTimeInterval !== 'undefined') {
			return downloadBlockSizeInTimeInterval
		} else {
			return this.downloadBlockSize
		}
	}

	reportCurrentThroughput(throughput: Throughput) {
		this.throughputHistory.set(Date.now(), throughput)
	}

	reportDownloadBlockSizeUsage(downloadBlockSize: DownloadBlockSize) {
		this.downloadBlockSizeHistory.set(Date.now(), downloadBlockSize)
	}
}
