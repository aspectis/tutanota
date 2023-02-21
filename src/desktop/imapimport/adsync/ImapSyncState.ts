export interface ImapAccount {
	host: string
	port: number
	username: string
	password?: string
	accessToken?: string
}

export interface MailboxState {
	path: string
	uidValidity: number
	uidNext: number
	highestModSeq: number
	importedUidToMailMap: Map<number, IdTuple>
}

export interface ImapSyncState {
	imapAccount: ImapAccount
	maxQuota: number
	mailboxStates: MailboxState[]
}
