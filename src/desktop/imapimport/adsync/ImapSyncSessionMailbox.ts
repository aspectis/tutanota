import {MailboxState} from "./ImapSyncState.js"

var fs = require('fs');

const SPECIAL_USE_INBOX_FLAG = "\\Inbox"
const SPECIAL_USE_SENT_FLAG = "\\Sent"
const SPECIAL_USE_DRAFTS_FLAG = "\\Drafts"
const SPECIAL_USE_TRASH_FLAG = "\\Trash"
const SPECIAL_USE_ARCHIVE_FLAG = "\\Archive"
const SPECIAL_USE_JUNK_FLAG = "\\Junk"
const SPECIAL_USE_ALL_FLAG = "\\All"
const SPECIAL_USE_FLAGGED_FLAG = "\\FLAGGED"

// we average / normalize over the last NORMALIZATION_COEFFICIENT _efficiencyScoreTTLIntervalHistory & _downloadBlockSizeTTLIntervalHistory entries
const NORMALIZATION_COEFFICIENT = 100
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
	private _efficiencyScoreHistory: number[] = []
	private _downloadBlockSize: number = 400
	private _downloadBlockSizeHistory: number[] = []

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

	set currentThroughput(value: number) {
		this._currentThroughput = value
		this._efficiencyScoreHistory.push(this.efficiencyScore)
	}

	get efficiencyScore(): number {
		return this.importance * this._currentThroughput
	}

	get efficiencyScoreHistory(): number[] {
		return this._efficiencyScoreHistory
	}

	get normalizedEfficiencyScore(): number {
		if (this.efficiencyScoreHistory.length == 0) {
			return this.efficiencyScore
		} else {
			let normalizationCoefficient = this.efficiencyScoreHistory.length >= NORMALIZATION_COEFFICIENT ? NORMALIZATION_COEFFICIENT : this.efficiencyScoreHistory.length
			return (this.efficiencyScoreHistory.slice(-normalizationCoefficient).reduce((acc, value) => {
				acc += value
				return acc
			}) / normalizationCoefficient)
		}
	}

	// TODO rethink the downloadBlockSize. Do I need to normalize?
	get normalizedDownloadBlockSize(): number {
		if (this.downloadBlockSizeHistory.length == 0) {
			return this._downloadBlockSize
		} else {
			let normalizationCoefficient = this.downloadBlockSizeHistory.length >= NORMALIZATION_COEFFICIENT ? NORMALIZATION_COEFFICIENT : this.downloadBlockSizeHistory.length
			let normalizedDownloadBlockSize = (this.downloadBlockSizeHistory.slice(-normalizationCoefficient).reduce((acc, value) => {
				acc += value
				return acc
			}) / normalizationCoefficient)
			return Math.trunc(normalizedDownloadBlockSize)
		}
	}

	set downloadBlockSize(value: number) {
		this._downloadBlockSize = value
		this._downloadBlockSizeHistory.push(value)
	}

	get downloadBlockSizeHistory(): number[] {
		return this._downloadBlockSizeHistory
	}
}
