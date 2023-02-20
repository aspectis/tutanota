interface ImapAccount {
	host: string
	port: string
	username: string
	password: string | null
	accessToken: string | null
}

export interface MailboxState {
	path: string
	uidValidity: number
	uidNext: number
	highestModSeq: number
	importedUidToMailMap: Map<number, IdTuple>
}

export interface ImportSyncState {
	imapAccount: ImapAccount
	maxQuota: number
	mailboxStates: MailboxState[]
}
