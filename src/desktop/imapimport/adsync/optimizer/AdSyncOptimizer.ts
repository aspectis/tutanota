export abstract class AdSyncOptimizer {

	protected optimizationDifference: number
	protected abstract scheduler: NodeJS.Timer

	protected constructor(optimizationDifference: number) {
		this.optimizationDifference = optimizationDifference
	}

	protected abstract optimize(): void

	abstract stopAdSyncOptimizer(): void
}
