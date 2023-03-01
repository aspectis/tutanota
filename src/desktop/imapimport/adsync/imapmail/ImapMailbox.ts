import {ListTreeResponse, StatusObject} from "imapflow"

export class ImapMailboxStatus {
	path: string
	messageCount?: number
	uidNext: number
	uidValidity: bigint
	highestModSeq?: bigint

	constructor(path: string, uidNext: number, uidValidity: bigint) {
		this.path = path
		this.uidNext = uidNext
		this.uidValidity = uidValidity
	}

	setMessageCount(messageCount: number): this {
		this.messageCount = messageCount
		return this
	}

	setHighestModSeq(highestModSeq: bigint): this {
		this.highestModSeq = highestModSeq
		return this
	}

	static fromImapFlowStatusObject(statusObject: StatusObject): ImapMailboxStatus {
		// @ts-ignore // TODO types
		let imapMailboxStatus = new ImapMailboxStatus(statusObject.path, statusObject.uidNext, statusObject.uidValidity)

		// @ts-ignore
		if (statusObject.messages) {
			// @ts-ignore
			imapMailboxStatus.setMessageCount(statusObject.messages)
		}

		if (statusObject.highestModSeq) {
			imapMailboxStatus.setHighestModSeq(statusObject.highestModSeq)
		}

		return imapMailboxStatus
	}
}

export class ImapMailbox {

	name: string
	path: string
	pathDelimiter: string
	flags: string[]
	specialUse: string
	disabled: boolean
	subFolders?: ImapMailbox[]
	status?: ImapMailboxStatus

	constructor(
		name: string,
		path: string,
		pathDelimiter: string,
		flags: string[],
		specialUse: string,
		disabled: boolean,
	) {
		this.name = name
		this.path = path
		this.pathDelimiter = pathDelimiter
		this.flags = flags
		this.specialUse = specialUse
		this.disabled = disabled
	}

	setSubFolders(subFolders: ImapMailbox[]): this {
		this.subFolders = subFolders
		return this
	}

	setStatus(status: ImapMailboxStatus): this {
		this.status = status
		return this
	}

	static fromImapFlowListTreeResponse(listTreeResponse: ListTreeResponse) {
		let imapMailbox = new ImapMailbox(
			listTreeResponse.name,
			listTreeResponse.path,
			listTreeResponse.delimiter,
			listTreeResponse.flags,
			listTreeResponse.specialUse,
			listTreeResponse.disabled,
		).setSubFolders(listTreeResponse.folders.map(value => ImapMailbox.fromImapFlowListTreeResponse(value)))

		return imapMailbox
	}
}
