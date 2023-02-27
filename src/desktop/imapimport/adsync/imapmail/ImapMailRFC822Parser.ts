import {ImapMailAttachment, ImapMailEnvelope} from "./ImapMail.js"
import * as Stream from "stream"

const MailParser = require('mailparser').MailParser;

export class ImapMailRFC822Parser {
	parsedEnvelope?: ImapMailEnvelope
	parsedBodyText?: string
	parsedAttachments?: ImapMailAttachment[] = []

	constructor(source: Buffer) {
		let parser = new MailParser()

		parser.on('headers', (headersMap: Map<string, object>) => {
			this.parsedEnvelope = ImapMailEnvelope.fromMailParserHeadersMap(headersMap)
		})

		parser.on('data', async (data: any) => {
			if (data.type === 'text') {
				this.parsedBodyText = data.textAsHtml
			}

			if (data.type == 'attachment') {
				let binary = await this.bufferFromStream(data.content)
				let imapMailAttachment = new ImapMailAttachment(data.size, data.contentType, binary)
				this.parsedAttachments?.push(imapMailAttachment)

				data.content.on('end', () => data.release())
			}
		})

		parser.end(source)

	}

	private bufferFromStream(stream: Stream): Promise<Buffer> {
		const chunks: Buffer[] = []
		return new Promise((resolve, reject) => {
			stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
			stream.on('error', (err) => reject(err));
			stream.on('end', () => resolve(Buffer.concat(chunks)));
		})
	}
}