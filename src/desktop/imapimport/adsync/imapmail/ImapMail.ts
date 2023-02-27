// @ts-ignore
// TODO type definitions
import {FetchMessageObject} from "imapflow"
import {ImapMailRFC822Parser} from "./ImapMailRFC822Parser.js"

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

	// TODO define type
	static fromMailParserAddressObject(mailParserAddressObject: any): ImapMailAddress {
		return new ImapMailAddress()
			.setName(<string>mailParserAddressObject.name)
			.setAddress(<string>mailParserAddressObject.address)
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

	// TODO define type
	static fromMailParserHeadersMap(mailParserHeadersMap: Map<string, object | string | Date>) {
		let imapMailEnvelope = new ImapMailEnvelope()


		if (mailParserHeadersMap.has('date')) {
			imapMailEnvelope.setDate(<Date>mailParserHeadersMap.get('date'))
		}

		if (mailParserHeadersMap.has('subject')) {
			imapMailEnvelope.setSubject(<string>mailParserHeadersMap.get('subject'))
		}

		if (mailParserHeadersMap.has('messageId')) {
			imapMailEnvelope.setMessageId(<string>mailParserHeadersMap.get('messageId'))
		}

		if (mailParserHeadersMap.has('inReplyTo')) {
			imapMailEnvelope.setInReplyTo(<string>mailParserHeadersMap.get('inReplyTo'))
		}

		if (mailParserHeadersMap.has('sender')) {
			imapMailEnvelope.setSender((<object[]>mailParserHeadersMap.get('sender')).map(sender => ImapMailAddress.fromMailParserAddressObject(sender)))
		}

		if (mailParserHeadersMap.has('to')) {
			imapMailEnvelope.setTo((<object[]>mailParserHeadersMap.get('to')).map(to => ImapMailAddress.fromMailParserAddressObject(to)))
		}

		if (mailParserHeadersMap.has('cc')) {
			imapMailEnvelope.setCc((<object[]>mailParserHeadersMap.get('cc')).map(cc => ImapMailAddress.fromMailParserAddressObject(cc)))
		}

		if (mailParserHeadersMap.has('bcc')) {
			imapMailEnvelope.setBcc((<object[]>mailParserHeadersMap.get('bcc')).map(bcc => ImapMailAddress.fromMailParserAddressObject(bcc)))
		}

		if (mailParserHeadersMap.has('reply-to')) {
			imapMailEnvelope.setReplyTo((<object[]>mailParserHeadersMap.get('reply-to')).map(replyTo => ImapMailAddress.fromMailParserAddressObject(replyTo)))
		}

		return imapMailEnvelope
	}
}

export class ImapMailAttachment {
	size: number
	contentType: string
	binary: Buffer
	charset?: string
	filename?: string

	constructor(size: number, contentType: string, binary: Buffer) {
		this.size = size
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
	attachments?: ImapMailAttachment[]
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

	setAttachments(attachments: ImapMailAttachment[]): this {
		this.attachments = attachments
		return this
	}

	setHeaders(headers: Buffer): this {
		this.headers = headers
		return this
	}

	static async fromImapFlowFetchMessageObject(mail: FetchMessageObject) {
		let parsedMailRFC822 = await new ImapMailRFC822Parser(mail.source)

		// TODO use emailId when uid is not reliable
		let imapMail = new ImapMail(mail.uid)
			.setModSeq(mail.modseq)
			.setSize(mail.size)
			.setInternalDate(mail.internalDate)
			.setFlags(mail.flags)
			.setLabels(mail.labels)
			.setHeaders(mail.headers)

		if (parsedMailRFC822.parsedEnvelope) {
			imapMail.setEnvelope(parsedMailRFC822.parsedEnvelope)
		}

		if (parsedMailRFC822.parsedBodyText) {
			imapMail.setBodyText(parsedMailRFC822.parsedBodyText)
		}

		if (parsedMailRFC822.parsedAttachments) {
			imapMail.setAttachments(parsedMailRFC822.parsedAttachments)
		}

		return imapMail
	}
}
