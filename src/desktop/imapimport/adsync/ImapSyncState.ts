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
	uidValidity: number
	uidNext: number
	highestModSeq: number
	importedUidToMailMap: Map<number, IdTuple>

	constructor(path: string, uidValidity: number, uidNext: number, highestModSeq: number, importedUidToMailMap: Map<number, IdTuple>) {
		this.path = path
		this.uidValidity = uidValidity
		this.uidNext = uidNext
		this.highestModSeq = highestModSeq
		this.importedUidToMailMap = importedUidToMailMap
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
