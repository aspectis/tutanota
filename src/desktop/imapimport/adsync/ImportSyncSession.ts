export enum SyncSessionState {
	RUNNING,
	PAUSED,
	POSTPONED,
	FINISHED
}

export class ImportSyncSession {
	private state: SyncSessionState
	private minThroughput: number
	private averageThroughput: number
	private downloadedQuota: number

	constructor() {
		this.state = SyncSessionState.PAUSED
		this.minThroughput = 0.000001
		this.averageThroughput = this.minThroughput
		this.downloadedQuota = 0
	}
}
