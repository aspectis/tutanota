const {ImapFlow} = require('imapflow');

export class FetchUidRange {
	fromUid?: number
	toUid?: number
	private fromSeq: number = 1
	private toSeq?: number
	private imapClient: typeof ImapFlow
	private readonly mailCount: number | null

	constructor(imapClient: typeof ImapFlow, mailCount: number | null) {
		this.imapClient = imapClient
		this.mailCount = mailCount
	}

	async initFetchUidRange(initialFrom: number, initialDownloadBlockSize: number, isUid: boolean) {
		await this.updateFetchUidRange(initialFrom, initialDownloadBlockSize, isUid)
	}

	async continueFetchUidRange(downloadBlockSize: number) {
		await this.updateFetchUidRange(this.toSeq ? this.toSeq + 1 : 1, downloadBlockSize, false)
	}

	private async updateFetchUidRange(from: number, downloadBlockSize: number, isUid: boolean) {
		if (this.mailCount != null && from > this.mailCount) {
			this.toUid = undefined // we reached the end and can stop the download // TODO optimize this
			return
		}

		let fetchFromSeqMail = await this.imapClient.fetchOne(`${from}`, {seq: true, uid: true}, {uid: isUid})
		this.fromSeq = fetchFromSeqMail.seq
		this.fromUid = fetchFromSeqMail.uid

		let fetchToSeq = fetchFromSeqMail.seq + downloadBlockSize
		if (this.mailCount && fetchToSeq > this.mailCount) {
			fetchToSeq = this.mailCount
		}

		let fetchToSeqMail: FetchMessageObject = await this.imapClient.fetchOne(`${fetchToSeq}`, {seq: true, uid: true})
		this.toSeq = fetchToSeqMail.seq
		this.toUid = fetchToSeqMail.uid
	}
}