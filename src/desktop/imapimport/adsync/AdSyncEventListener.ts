import {ImapMailbox, ImapMailboxStatus} from "./imapmail/ImapMailbox.js"
import {ImapMail} from "./imapmail/ImapMail.js"
import {ImapError} from "./imapmail/ImapError.js"

export enum AdSyncEventType {
	CREATE,
	UPDATE,
	DELETE,
}

export interface AdSyncEventListener {

	onMailbox(mailbox: ImapMailbox, eventType: AdSyncEventType): void

	onMailboxStatus(mailboxStatus: ImapMailboxStatus): void

	onMail(mail: ImapMail, eventType: AdSyncEventType): void

	onPostpone(postponedUntil: Date): void

	onFinish(downloadedQuota: number): void

	onError(error: ImapError): void
}
