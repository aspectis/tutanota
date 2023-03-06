import {ImapMailAttachment, ImapMailEnvelope} from "./ImapMail.js"
import * as Stream from "stream"

const MailParser = require('mailparser').MailParser;

export interface ParsedImapRFC822 {
	parsedEnvelope?: ImapMailEnvelope
	parsedBodyText?: string
	parsedAttachments?: ImapMailAttachment[]
}

export class ImapMailRFC822Parser {
	private parser: typeof MailParser

	constructor() {
		this.parser = new MailParser()
	}

	async parseSource(source: Buffer): Promise<ParsedImapRFC822> {
		return new Promise<ParsedImapRFC822>((resolve, reject) => {
			let parsedImapRFC822: ParsedImapRFC822 = {}

			this.parser.on('headers', (headersMap: Map<string, object>) => {
				parsedImapRFC822.parsedEnvelope = ImapMailEnvelope.fromMailParserHeadersMap(headersMap)
			})

			this.parser.on('data', async (data: any) => {
				if (data.type === 'text') {
					parsedImapRFC822.parsedBodyText = data.textAsHtml
				}

				if (data.type == 'attachment') {
					let binary = await this.bufferFromStream(data.content)
					let imapMailAttachment = new ImapMailAttachment(data.size, data.contentType, binary)
					parsedImapRFC822.parsedAttachments?.push(imapMailAttachment)
					data.release()
				}
			})

			this.parser.on('error', (err: Error) => reject(err))

			this.parser.on("end", () => {
				resolve(parsedImapRFC822)
			})

			this.parser.end(source)
		})
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
