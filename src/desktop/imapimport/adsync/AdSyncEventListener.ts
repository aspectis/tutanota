import {ImapMailbox} from "./ImapMailbox.js"
import {ImapMail} from "./ImapMail.js"
import {ImapError} from "./ImapError.js"

export interface AdSyncEventListener {

	onMailbox(newMailbox: ImapMailbox): void

	onMailboxUpdate(updatedMailbox: ImapMailbox): void

	onMail(newMail: ImapMail): void

	onMailUpdate(updatedMail: ImapMail): void

	onPostpone(postponedUntil: Date): void

	onFinish(): void

	onError(error: ImapError): void
}
