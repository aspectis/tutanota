import {IServiceExecutor} from "../../../api/common/ServiceRequest.js"
import {EntityClient} from "../../../api/common/EntityClient.js"
import {createImportMailData, createImportMailPostIn, Mail, MailTypeRef} from "../../../api/entities/tutanota/TypeRefs.js"
import {ImportMailService} from "../../../api/entities/tutanota/Services.js"
import {RecipientList} from "../../../api/common/recipients/Recipient.js"
import {ConversationType, GroupType, MailMethod, MailPhishingStatus, MailState, ReplyType} from "../../../api/common/TutanotaConstants.js"
import {Attachments} from "@tutao/oxmsg/dist/types/attachments.js"
import {byteLength} from "@tutao/tutanota-utils"
import {UNCOMPRESSED_MAX_SIZE} from "../../../api/worker/Compression.js"
import {MailBodyTooLargeError} from "../../../api/common/error/MailBodyTooLargeError.js"
import {aes128RandomKey, encryptKey} from "@tutao/tutanota-crypto"
import {UserFacade} from "../../../api/worker/facades/UserFacade.js"

interface ImportMailParams {
	subject: string
	bodyText: string
	sentDate: Date
	receivedDate: Date
	state: MailState
	unread: boolean
	messageId: string
	senderMailAddress: string
	senderName: string
	confidential: boolean
	method: MailMethod
	replyType: ReplyType
	differentEnvelopeSender: string
	phishingStatus: MailPhishingStatus
	headers: string
	replyTos: RecipientList
	toRecipients: RecipientList
	ccRecipients: RecipientList
	bccRecipients: RecipientList
	attachments: Attachments | null
	previousMessageId: Id | null
	conversationType: ConversationType
	imapUid: number
	imapFolderSyncState: IdTuple
}

/**
 * The ImportMailFacade is responsible for importing mails to the Tutanota server.
 * The facade communicates directly with the ImportMailService.
 */
export class ImportMailFacade {

	constructor(
		private readonly userFacade: UserFacade,
		private readonly serviceExecutor: IServiceExecutor,
		private readonly entityClient: EntityClient,
	) {
	}

	// TODO might be beneficial to supply one ImapMail object?
	async importMail({
						 subject,
						 bodyText,
						 sentDate,
						 receivedDate,
						 state,
						 unread,
						 messageId,
						 senderMailAddress,
						 senderName,
						 confidential,
						 method,
						 replyType,
						 differentEnvelopeSender,
						 phishingStatus,
						 headers,
						 replyTos,
						 toRecipients,
						 ccRecipients,
						 bccRecipients,
						 attachments,
						 previousMessageId,
						 conversationType,
						 imapUid,
						 imapFolderSyncState,
					 }: ImportMailParams): Promise<Mail> {
		if (byteLength(bodyText) > UNCOMPRESSED_MAX_SIZE) {
			throw new MailBodyTooLargeError(`Can't update draft, mail body too large (${byteLength(bodyText)})`)
		}

		// TODO get mailGroup of import mailGroup, this is probably returning the first mailGroup !?
		const mailGroupId = this.userFacade.getGroupId(GroupType.Mail)

		const userGroupKey = this.userFacade.getUserGroupKey()
		const mailGroupKey = this.userFacade.getGroupKey(mailGroupId)

		const sk = aes128RandomKey()
		const service = createImportMailPostIn()
		service.ownerEncSessionKey = encryptKey(mailGroupKey, sk)
		service.previousMessageId = previousMessageId
		service.conversationType = conversationType
		service.imapUid = imapUid.toString()
		service.imapFolderSyncState = imapFolderSyncState

		service.mailData = createImportMailData({
			subject,
			compressedBodyText: bodyText,
			sentDate,
			receivedDate,
			state,
			unread,
			messageId,
			senderMailAddress,
			senderName,
			confidential,
			method,
			replyType,
			differentEnvelopeSender,
			phishingStatus,
			compressedHeaders: headers,
			// replyTos: replyTos.map(recipientToEncryptedMailAddress),
			// toRecipients: toRecipients.map(recipientToDraftRecipient),
			// ccRecipients: ccRecipients.map(recipientToDraftRecipient),
			// bccRecipients: bccRecipients.map(recipientToDraftRecipient),
			// addedAttachments: await this._createAddedAttachments(attachments, [], mailGroupId, mailGroupKey, true), // TODO Do not produce duplicates
		})

		const importMailPostOut = await this.serviceExecutor.post(ImportMailService, service, {sessionKey: sk})
		return this.entityClient.load(MailTypeRef, importMailPostOut.mail)
	}
}
