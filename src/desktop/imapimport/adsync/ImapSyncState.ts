import {ImapMailbox} from "./imapmail/ImapMailbox.js"

export class ImapAccount {
	host: string
	port: number
	username: string
	password?: string
	accessToken?: string

	constructor(host: string, port: number, username: string) {
		this.host = host
		this.port = port
		this.username = username
	}

	setPassword(password: string): this {
		this.password = password
		return this
	}

	setAccessToken(accessToken: string): this {
		this.accessToken = accessToken
		return this
	}
}

export class MailboxState {
	path: string
	uidValidity?: bigint
	uidNext?: number
	highestModSeq?: bigint | null // null indicates that the CONDSTORE IMAP extension, and therefore highestModSeq, is not supported
	importedUidToMailMap: Map<number, IdTuple>

	constructor(path: string, importedUidToMailMap: Map<number, IdTuple>) {
		this.path = path
		this.importedUidToMailMap = importedUidToMailMap
	}

	setUidValidity(uidValidity: bigint): this {
		this.uidValidity = uidValidity
		return this
	}

	setUidNext(uidNext: number): this {
		this.uidNext = uidNext
		return this
	}

	setUidHighestModSeq(highestModSeq: bigint | null): this {
		this.highestModSeq = highestModSeq
		return this
	}

	static fromImapMailbox(imapMailbox: ImapMailbox) {
		return new MailboxState(imapMailbox.path, new Map<number, IdTuple>())
	}
}

export class ImapSyncState {
	imapAccount: ImapAccount
	maxQuota: number
	mailboxStates: MailboxState[]

	constructor(imapAccount: ImapAccount, maxQuata: number, mailboxStates: MailboxState[]) {
		this.imapAccount = imapAccount
		this.maxQuota = maxQuata
		this.mailboxStates = mailboxStates
	}
}
