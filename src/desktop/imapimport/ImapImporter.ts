import {ImportMailFacade} from "./facades/ImportMailFacade.js";
import {ImportImapFacade} from "./facades/ImportImapFacade.js";
import {ImapAdSync} from "./adsync/ImapAdSync.js";
import {ImapImportState, ImportState} from "./ImapImportState.js";

export class ImapImporter {

	private imapAdSync: ImapAdSync | null = null
	private imapImportState: ImapImportState = new ImapImportState(ImportState.PAUSED, new Date(Date.now()))

	constructor(
		private readonly importMailFacade: ImportMailFacade,
		private readonly importImapFacade: ImportImapFacade,
	) {}

	async continueImport() : Promise<boolean> {
		return true
	}

	async pauseImport() : Promise<boolean> {
		return true
	}

	async abortImport() : Promise<boolean> {
		return true
	}

}