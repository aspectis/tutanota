import {MailboxState} from "./ImapSyncState.js"

const SPECIAL_USE_INBOX_FLAG = "\\Inbox"
const SPECIAL_USE_SENT_FLAG = "\\Sent"
const SPECIAL_USE_DRAFTS_FLAG = "\\Drafts"
const SPECIAL_USE_TRASH_FLAG = "\\Trash"
const SPECIAL_USE_ARCHIVE_FLAG = "\\Archive"
const SPECIAL_USE_JUNK_FLAG = "\\Junk"
const SPECIAL_USE_ALL_FLAG = "\\All"
const SPECIAL_USE_FLAGGED_FLAG = "\\FLAGGED"

const NORMALIZATION_COEFFICIENT = 50
const AVERAGE_MAIL_SIZE = 12.5

export enum SyncSessionMailboxImportance {
	NO_SYNC = 0,
	LOW = 1,
	MEDIUM = 2,
	HIGH = 3
}

export class ImapSyncSessionMailbox {
	mailboxState: MailboxState
	private _specialUse: string = ""
	mailCount: number | null = 0
	timeToLiveInterval: number = 60 // in seconds
	private importance: SyncSessionMailboxImportance = SyncSessionMailboxImportance.MEDIUM
	private _currentThroughput: number = 0.1
	private efficiencyScoreTTLIntervalSum: number = 0
	private _efficiencyScoreTTLIntervalHistory: number[] = []
	private lastEfficiencyScoreUpdate: number = Date.now()
	private _downloadBlockSize: number = 200
	private downloadBlockSizeTTLIntervalSum: number = 0
	private _downloadBlockSizeTTLIntervalHistory: number[] = []
	private lastDownloadBlockSizeUpdate: number = Date.now()

	constructor(mailboxState: MailboxState) {
		this.mailboxState = mailboxState
	}

	initSessionMailbox(mailCount?: number): void {
		this.mailCount = mailCount ? mailCount : null
		this.timeToLiveInterval = AVERAGE_MAIL_SIZE / (1 / this.efficiencyScore) * 5
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

	set currentThroughput(value: number) {
		this._currentThroughput = value

		let now = Date.now()
		if (this.efficiencyScoreTTLIntervalSum != 0 && this.lastEfficiencyScoreUpdate + this.timeToLiveInterval <= now) {
			let averageEfficiencyScoreTTLInterval = this.efficiencyScoreTTLIntervalSum / (now - this.lastEfficiencyScoreUpdate)
			this._efficiencyScoreTTLIntervalHistory.push(averageEfficiencyScoreTTLInterval)
			this.efficiencyScoreTTLIntervalSum = 0
			this.lastEfficiencyScoreUpdate = now
		} else {
			this.efficiencyScoreTTLIntervalSum += value
		}
	}

	get efficiencyScore(): number {
		return this.importance * this._currentThroughput
	}

	get efficiencyScoreTTLIntervalHistory(): number[] {
		return this._efficiencyScoreTTLIntervalHistory
	}

	get normalizedEfficiencyScore(): number {
		if (this.efficiencyScoreTTLIntervalHistory.length == 0) {
			return this.efficiencyScore
		} else {
			let start = this.efficiencyScoreTTLIntervalHistory.length >= NORMALIZATION_COEFFICIENT ? NORMALIZATION_COEFFICIENT : this.efficiencyScoreTTLIntervalHistory.length
			return (this.efficiencyScoreTTLIntervalHistory.slice(-start).reduce((acc, value) => {
				acc += value
				return acc
			}) / NORMALIZATION_COEFFICIENT)
		}
	}

	get normalizedDownloadBlockSize(): number {
		if (this.downloadBlockSizeTTLIntervalHistory.length == 0) {
			return this._downloadBlockSize
		} else {
			let start = this.downloadBlockSizeTTLIntervalHistory.length >= NORMALIZATION_COEFFICIENT ? NORMALIZATION_COEFFICIENT : this.downloadBlockSizeTTLIntervalHistory.length
			return (this.downloadBlockSizeTTLIntervalHistory.slice(-start).reduce((acc, value) => {
				acc += value
				return acc
			}) / NORMALIZATION_COEFFICIENT)
		}
	}

	set downloadBlockSize(value: number) {
		this._downloadBlockSize = value

		let now = Date.now()
		if (this.downloadBlockSizeTTLIntervalSum != 0 && this.lastDownloadBlockSizeUpdate + this.timeToLiveInterval <= now) {
			let averageDownloadBlockSizeTTLInterval = this.downloadBlockSizeTTLIntervalSum / (now - this.lastEfficiencyScoreUpdate)
			this._downloadBlockSizeTTLIntervalHistory.push(averageDownloadBlockSizeTTLInterval)
			this.downloadBlockSizeTTLIntervalSum = 0
			this.lastDownloadBlockSizeUpdate = now
		} else {
			this.downloadBlockSizeTTLIntervalSum += value
		}
	}

	get downloadBlockSizeTTLIntervalHistory(): number[] {
		return this._downloadBlockSizeTTLIntervalHistory
	}
}
