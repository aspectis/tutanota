export interface ImapMailAddress {
	name?: string
	address?: string
}

export interface ImapMailEnvelope {
	sentDate?: Date
	subject?: string
	messageId?: string
	inReplyTo?: string
	from?: ImapMailAddress[]
	sender?: ImapMailAddress[]
	replyTo?: ImapMailAddress[]
	to?: ImapMailAddress[]
	cc?: ImapMailAddress[]
	bcc?: ImapMailAddress[]
}

export interface ImapMailBodyStructure {
	part: string
	type: string
	parameters?: Object
	id?: string
	encoding?: string
	size?: number
	envelope?: ImapMailEnvelope
	disposition?: string
	dispositionParameters?: string
	childNodes?: ImapMailBodyStructure[]
}

//TODO How should the format be? Does it make sense this way? Do I need the complexity?

export interface ImapMail {
	seq: number
	uid: number
	source?: Buffer
	modseq?: BigInt
	emailId?: string
	threadId?: string
	labels?: Set<string>
	size?: number
	flags?: Set<string>
	envelope?: ImapMailEnvelope
	bodyStructure?: ImapMailBodyStructure
	receivedDate?: Date
	headers?: Buffer
}