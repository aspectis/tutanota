import {AdSyncOptimizer} from "./AdSyncOptimizer.js"
import {SyncSessionMailbox} from "../SyncSessionMailbox.js"

export class AdSyncDownloadBlockSizeOptimizer extends AdSyncOptimizer {
	protected _optimizedSyncSessionMailbox: SyncSessionMailbox

	private lastNormalizedEfficiencyScore: number = 0

	constructor(syncSessionMailbox: SyncSessionMailbox, optimizationDifference: number) {
		super(optimizationDifference)
		this._optimizedSyncSessionMailbox = syncSessionMailbox
	}

	get optimizedSyncSessionMailbox(): SyncSessionMailbox {
		return this._optimizedSyncSessionMailbox
	}

	protected optimize(): void {
		let normalizedEfficiencyScore = this.optimizedSyncSessionMailbox.normalizedEfficiencyScore
		let normalizedDownloadBlockSize = this.optimizedSyncSessionMailbox.normalizedDownloadBlockSize

		if (normalizedEfficiencyScore > this.lastNormalizedEfficiencyScore) {
			this.optimizedSyncSessionMailbox.downloadBlockSize = normalizedDownloadBlockSize + this.optimizationDifference
		} else {
			this._optimizedSyncSessionMailbox.downloadBlockSize = normalizedDownloadBlockSize - this.optimizationDifference
		}

		this.lastNormalizedEfficiencyScore = normalizedEfficiencyScore
	}

	stopAdSyncOptimizer(): void {
	}
}