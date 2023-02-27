import {SyncSessionMailbox} from "../SyncSessionMailbox.js"

export abstract class AdSyncOptimizer {

	protected optimizationDifference: number

	protected constructor(optimizationDifference: number) {
		this.optimizationDifference = optimizationDifference
	}

	protected abstract optimize(): void

	abstract stopAdSyncOptimizer(): void
}
