import {ImapMailbox} from "./imapmail/ImapMailbox.js"
import {ImapMail} from "./imapmail/ImapMail.js"
import {ImapError} from "./imapmail/ImapError.js"

export interface AdSyncEventListener {

	onMailbox(newMailbox: ImapMailbox): void

	onMailboxUpdate(updatedMailbox: ImapMailbox): void

	onMail(newMail: ImapMail): void

	onMailUpdate(updatedMail: ImapMail): void

	onPostpone(postponedUntil: Date): void

	onFinish(): void

	onError(error: ImapError): void
}
