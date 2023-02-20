export enum ImportState {
    RUNNING,
    PAUSED,
    POSTPONED
}

export class ImapImportState {
    private state: ImportState
    private postponedUntil: Date

    constructor(
        initialState: ImportState,
        postponedUntil: Date
    ) {
        this.state = initialState
        this.postponedUntil = postponedUntil
    }
}
