import {MessageAddressObject, MessageEnvelopeObject} from "imapflow"

export class ImapMailAddress {
	name?: string
	address?: string

	setName(name?: string): this {
		this.name = name
		return this
	}

	setAddress(address?: string): this {
		this.address = address
		return this
	}

	static fromMessageAddressObject(messageAddressObject: MessageAddressObject): ImapMailAddress {
		return new ImapMailAddress()
			.setName(messageAddressObject.name)
			.setAddress(messageAddressObject.address)
	}
}

export class ImapMailEnvelope {
	date?: Date
	subject?: string
	messageId?: string
	inReplyTo?: string
	from?: ImapMailAddress[]
	sender?: ImapMailAddress[]
	to?: ImapMailAddress[]
	cc?: ImapMailAddress[]
	bcc?: ImapMailAddress[]
	replyTo?: ImapMailAddress[]

	setDate(date: Date): this {
		this.date = date
		return this
	}

	setSubject(subject: string): this {
		this.subject = subject
		return this
	}

	setMessageId(messageId: string): this {
		this.messageId = messageId
		return this
	}

	setInReplyTo(inReplyTo: string): this {
		this.inReplyTo = inReplyTo
		return this
	}

	setFrom(from: ImapMailAddress[]): this {
		this.from = from
		return this
	}

	setSender(sender: ImapMailAddress[]): this {
		this.sender = sender
		return this
	}

	setTo(to: ImapMailAddress[]): this {
		this.to = to
		return this
	}

	setCc(cc: ImapMailAddress[]): this {
		this.cc = cc
		return this
	}

	setBcc(bcc: ImapMailAddress[]): this {
		this.bcc = bcc
		return this
	}

	setReplyTo(replyTo: ImapMailAddress[]): this {
		this.replyTo = replyTo
		return this
	}

	static fromMessageEnvelopeObject(messageEnvelopeObject: MessageEnvelopeObject) {
		return new ImapMailEnvelope()
			.setDate(messageEnvelopeObject.date)
			.setSubject(messageEnvelopeObject.subject)
			.setMessageId(messageEnvelopeObject.messageId)
			.setInReplyTo(messageEnvelopeObject.inReplyTo)
			.setSender(messageEnvelopeObject.sender.map(sender => ImapMailAddress.fromMessageAddressObject(sender)))
			.setTo(messageEnvelopeObject.to.map(to => ImapMailAddress.fromMessageAddressObject(to)))
			.setCc(messageEnvelopeObject.cc.map(cc => ImapMailAddress.fromMessageAddressObject(cc)))
			.setBcc(messageEnvelopeObject.bcc.map(bcc => ImapMailAddress.fromMessageAddressObject(bcc)))
			.setReplyTo(messageEnvelopeObject.replyTo.map(replyTo => ImapMailAddress.fromMessageAddressObject(replyTo)))
	}
}

export class ImapMailAttachement {
	expectedSize: number
	contentType: string
	binary: Buffer
	charset?: string
	filename?: string

	constructor(expectedSize: number, contentType: string, binary: Buffer) {
		this.expectedSize = expectedSize
		this.contentType = contentType
		this.binary = binary
	}

	setCharset(charset: string): this {
		this.charset = charset
		return this
	}

	setFilename(filename: string): this {
		this.filename = filename
		return this
	}
}

export class ImapMail {

	uid: number
	modSeq?: BigInt
	size?: number
	internalDate?: Date
	flags?: Set<string>
	labels?: Set<string>
	envelope?: ImapMailEnvelope
	bodyText?: string
	attachments?: ImapMailAttachement[]
	headers?: Buffer

	constructor(uid: number) {
		this.uid = uid
	}

	setModSeq(modSeq: BigInt): this {
		this.modSeq = modSeq
		return this
	}

	setSize(size: number): this {
		this.size = size
		return this
	}

	setFlags(flags: Set<string>): this {
		this.flags = flags
		return this
	}

	setInternalDate(internalDate: Date): this {
		this.internalDate = internalDate
		return this
	}

	setLabels(labels: Set<string>): this {
		this.labels = labels
		return this
	}


	setEnvelope(envelope: ImapMailEnvelope): this {
		this.envelope = envelope
		return this
	}

	setBodyText(bodyText: string): this {
		this.bodyText = bodyText
		return this
	}

	setAttachments(attachments: ImapMailAttachement[]): this {
		this.attachments = attachments
		return this
	}

	setHeaders(headers: Buffer): this {
		this.headers = headers
		return this
	}

}