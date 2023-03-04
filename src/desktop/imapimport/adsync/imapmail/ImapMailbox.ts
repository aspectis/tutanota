import {ListTreeResponse, StatusObject} from "imapflow"
import {SyncSessionMailbox} from "../SyncSessionMailbox.js"

export class ImapMailboxStatus {
	path: string
	messageCount?: number
	uidNext: number
	uidValidity: bigint
	highestModSeq: bigint | null // null indicates that the CONDSTORE IMAP extension, and therefore highestModSeq, is not supported

	constructor(path: string, uidNext: number, uidValidity: bigint, highestModSeq: bigint | null) {
		this.path = path
		this.uidNext = uidNext
		this.uidValidity = uidValidity
		this.highestModSeq = highestModSeq
	}

	setMessageCount(messageCount: number): this {
		this.messageCount = messageCount
		return this
	}

	static fromImapFlowStatusObject(statusObject: StatusObject): ImapMailboxStatus {
		// @ts-ignore // TODO types
		let imapMailboxStatus = new ImapMailboxStatus(statusObject.path, statusObject.uidNext, statusObject.uidValidity, statusObject.highestModSeq)

		// @ts-ignore
		if (statusObject.messages) {
			// @ts-ignore
			imapMailboxStatus.setMessageCount(statusObject.messages)
		}

		return imapMailboxStatus
	}
}

export class ImapMailbox {

	name?: string
	path: string
	pathDelimiter?: string
	flags?: string[]
	specialUse?: string
	disabled?: boolean
	subFolders?: ImapMailbox[]

	constructor(path: string) {
		this.path = path
	}

	setName(name: string): this {
		this.name = name
		return this
	}

	setPathDelimiter(pathDelimiter: string): this {
		this.pathDelimiter = pathDelimiter
		return this
	}

	setFlags(flags: string[]): this {
		this.flags = flags
		return this
	}

	setSpecialUse(specialUse: string): this {
		this.specialUse = specialUse
		return this
	}

	setDisabled(disabled: boolean): this {
		this.disabled = disabled
		return this
	}

	setSubFolders(subFolders: ImapMailbox[]): this {
		this.subFolders = subFolders
		return this
	}

	static fromImapFlowListTreeResponse(listTreeResponse: ListTreeResponse): ImapMailbox {
		return new ImapMailbox(listTreeResponse.path)
			.setName(listTreeResponse.name)
			.setPathDelimiter(listTreeResponse.delimiter)
			.setFlags(listTreeResponse.flags)
			.setSpecialUse(listTreeResponse.specialUse)
			.setDisabled(listTreeResponse.disabled)
			.setSubFolders(listTreeResponse.folders.map(value => ImapMailbox.fromImapFlowListTreeResponse(value)))
	}

	static fromSyncSessionMailbox(syncSessionMailbox: SyncSessionMailbox): ImapMailbox {
		return new ImapMailbox(syncSessionMailbox.mailboxState.path)
	}
}
