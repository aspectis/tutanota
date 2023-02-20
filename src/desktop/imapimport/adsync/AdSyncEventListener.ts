import {ImapMailbox} from "./ImapMailbox.js"
import {ImapMail} from "./ImapMail.js"
import {ImapError} from "./ImapError.js"

export interface AdSyncEventListener {

	onMailbox(mailbox: ImapMailbox): void

	onMail(mail: ImapMail): void

	onMailBatch(mails: ImapMail[]): void

	onPostpone(postponedUntil: Date): void

	onFinish(): void

	onError(error: ImapError): void
}
