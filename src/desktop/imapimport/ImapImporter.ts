import {ImportMailFacade} from "./facades/ImportMailFacade.js";
import {ImportImapFacade} from "./facades/ImportImapFacade.js";
import {ImapAdSync} from "./adsync/ImapAdSync.js";
import {ImapImportState, ImportState} from "./ImapImportState.js";

export class ImapImporter {

    private imapAdSync: ImapAdSync | null = null
    private imapImportState: ImapImportState = new ImapImportState(ImportState.PAUSED, new Date())

    constructor(
        private readonly importMailFacade: ImportMailFacade,
        private readonly importImapFacade: ImportImapFacade
    ) {

    }

}