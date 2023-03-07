import {AdSyncOptimizer} from "./AdSyncOptimizer.js"
import {ImapSyncSessionMailbox} from "../ImapSyncSessionMailbox.js"

export class AdSyncDownloadBlockSizeOptimizer extends AdSyncOptimizer {
	protected _optimizedSyncSessionMailbox: ImapSyncSessionMailbox
	protected scheduler?: NodeJS.Timer
	private lastNormalizedEfficiencyScore: number = 0

	constructor(syncSessionMailbox: ImapSyncSessionMailbox, optimizationDifference: number) {
		super(optimizationDifference)
		this._optimizedSyncSessionMailbox = syncSessionMailbox
	}

	startAdSyncOptimizer(): void {
		this.scheduler = setInterval(this.optimize.bind(this), this.optimizedSyncSessionMailbox.timeToLiveInterval * 1000) // every timeToLiveInterval seconds
	}

	get optimizedSyncSessionMailbox(): ImapSyncSessionMailbox {
		return this._optimizedSyncSessionMailbox
	}

	protected optimize(): void {
		let normalizedEfficiencyScore = this.optimizedSyncSessionMailbox.normalizedEfficiencyScore
		let normalizedDownloadBlockSize = this.optimizedSyncSessionMailbox.normalizedDownloadBlockSize

		console.log("normalizedEfficiencyScore: " + normalizedEfficiencyScore)
		console.log("normalizedDownloadBlockSize: " + normalizedDownloadBlockSize)

		if (normalizedEfficiencyScore >= this.lastNormalizedEfficiencyScore) {
			this.optimizedSyncSessionMailbox.downloadBlockSize = normalizedDownloadBlockSize + this.optimizationDifference
		} else {
			this._optimizedSyncSessionMailbox.downloadBlockSize = normalizedDownloadBlockSize - this.optimizationDifference
		}

		this.lastNormalizedEfficiencyScore = normalizedEfficiencyScore
	}
}
