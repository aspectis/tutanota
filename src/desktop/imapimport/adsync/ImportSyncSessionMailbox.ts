export enum SyncSessionMailboxImportance {
	LOW = 1,
	MEDIUM = 2,
	HIGH = 3
}

// TODO Think about default values! And getter and Setter

export class ImportSyncSessionMailbox {

	private path: string
	private size: number = 0
	private mailCount: number = 0
	private averageMailSize: number = 0
	private minTTL: number = 1000
	private importance: SyncSessionMailboxImportance = SyncSessionMailboxImportance.LOW
	private currentThroughput: number = 0.000001
	private _efficiencyScore: number = 1
	efficiencyScoreTTLMap: Map<number, number> = new Map<number, number>()
	private downloadBlockSize: number = 1
	private downloadBlockSizeTTLMap: Map<number, number> = new Map<number, number>()

	constructor(path: string) {
		this.path = path
	}

	get efficiencyScore(): number {
		return this.importance * this.currentThroughput
	}

}
