import { addParamsToUrl, isSuspensionResponse, RestClient } from "../../rest/RestClient.js"
import { CryptoFacade, encryptBytes } from "../../crypto/CryptoFacade.js"
import { concat, lazyAsync, neverNull, promiseMap, splitUint8ArrayInChunks, uint8ArrayToBase64, uint8ArrayToString } from "@tutao/tutanota-utils"
import { ArchiveDataType, MAX_BLOB_SIZE_BYTES } from "../../../common/TutanotaConstants.js"

import { HttpMethod, MediaType, resolveTypeReference } from "../../../common/EntityFunctions.js"
import { assertWorkerOrNode, isApp, isDesktop } from "../../../common/Env.js"
import type { SuspensionHandler } from "../../SuspensionHandler.js"
import { BlobService } from "../../../entities/storage/Services.js"
import { aes128Decrypt, sha256Hash } from "@tutao/tutanota-crypto"
import type { FileUri, NativeFileApp } from "../../../../native/common/FileApp.js"
import type { AesApp } from "../../../../native/worker/AesApp.js"
import { InstanceMapper } from "../../crypto/InstanceMapper.js"
import { Aes128Key } from "@tutao/tutanota-crypto/dist/encryption/Aes.js"
import { Blob, BlobReferenceTokenWrapper, createBlobReferenceTokenWrapper } from "../../../entities/sys/TypeRefs.js"
import { FileReference } from "../../../common/utils/FileUtils.js"
import { handleRestError } from "../../../common/error/RestError.js"
import { ProgrammingError } from "../../../common/error/ProgrammingError.js"
import { IServiceExecutor } from "../../../common/ServiceRequest.js"
import { BlobGetInTypeRef, BlobPostOut, BlobPostOutTypeRef, BlobServerAccessInfo, createBlobGetIn } from "../../../entities/storage/TypeRefs.js"
import { AuthDataProvider } from "../UserFacade.js"
import { tryServers } from "../../rest/EntityRestClient.js"
import { BlobAccessTokenFacade, BlobReferencingInstance } from "../BlobAccessTokenFacade.js"
import { DateProvider } from "../../common/DateProvider.js"

assertWorkerOrNode()
export const BLOB_SERVICE_REST_PATH = `/rest/${BlobService.app}/${BlobService.name.toLowerCase()}`

/**
 * The BlobFacade uploads and downloads blobs to/from the blob store.
 *
 * It requests tokens from the BlobAccessTokenService and download and uploads the blobs to/from the BlobService.
 *
 * In case of upload it is necessary to make a request to the BlobReferenceService or use the referenceTokens returned by the BlobService PUT in some other service call.
 * Otherwise, the blobs will automatically be deleted after some time. It is not allowed to reference blobs manually in some instance.
 */
export class BlobFacade {
	constructor(
		private readonly authDataProvider: AuthDataProvider,
		private readonly serviceExecutor: IServiceExecutor,
		private readonly restClient: RestClient,
		private readonly suspensionHandler: SuspensionHandler,
		private readonly fileApp: NativeFileApp,
		private readonly aesApp: AesApp,
		private readonly instanceMapper: InstanceMapper,
		private readonly cryptoFacade: CryptoFacade,
		private readonly blobAccessTokenFacade: BlobAccessTokenFacade,
		private readonly dateProvider: DateProvider,
	) {}

	/**
	 * Encrypts and uploads binary data to the blob store. The binary data is split into multiple blobs in case it
	 * is too big.
	 *
	 * @returns blobReferenceToken that must be used to reference a blobs from an instance. Only to be used once.
	 */
	async encryptAndUpload(
		archiveDataType: ArchiveDataType,
		blobData: Uint8Array,
		ownerGroupId: Id,
		sessionKey: Aes128Key,
	): Promise<BlobReferenceTokenWrapper[]> {
		const blobAccessTokenFactory = () => this.blobAccessTokenFacade.requestWriteToken(archiveDataType, ownerGroupId)

		const chunks = splitUint8ArrayInChunks(MAX_BLOB_SIZE_BYTES, blobData)
		return promiseMap(chunks, async (chunk) => await this.encryptAndUploadChunk(chunk, blobAccessTokenFactory, sessionKey))
	}

	/**
	 * Encrypts and uploads binary data stored as a file to the blob store. The binary data is split into multiple blobs in case it
	 * is too big.
	 *
	 * @returns blobReferenceToken that must be used to reference a blobs from an instance. Only to be used once.
	 */
	async encryptAndUploadNative(
		archiveDataType: ArchiveDataType,
		fileUri: FileUri,
		ownerGroupId: Id,
		sessionKey: Aes128Key,
	): Promise<BlobReferenceTokenWrapper[]> {
		if (!isApp() && !isDesktop()) {
			throw new ProgrammingError("Environment is not app or Desktop!")
		}
		const blobAccessTokenFactory = () => this.blobAccessTokenFacade.requestWriteToken(archiveDataType, ownerGroupId)
		const chunkUris = await this.fileApp.splitFile(fileUri, MAX_BLOB_SIZE_BYTES)
		return promiseMap(chunkUris, async (chunkUri) => {
			return this.encryptAndUploadNativeChunk(chunkUri, blobAccessTokenFactory, sessionKey)
		})
	}

	/**
	 * Downloads multiple blobs, decrypts and joins them to unencrypted binary data.
	 *
	 * @param archiveDataType
	 * @param blobs to be retrieved
	 * @param referencingInstance that directly references the blobs
	 * @returns Uint8Array unencrypted binary data
	 */
	async downloadAndDecrypt(archiveDataType: ArchiveDataType, referencingInstance: BlobReferencingInstance): Promise<Uint8Array> {
		const blobAccessInfoFactory = () => this.blobAccessTokenFacade.requestReadTokenBlobs(archiveDataType, referencingInstance)
		const sessionKey = neverNull(await this.cryptoFacade.resolveSessionKeyForInstance(referencingInstance.getEntity()))
		const blobData = await promiseMap(referencingInstance.getBlobs(), (blob) => this.downloadAndDecryptChunk(blob, blobAccessInfoFactory, sessionKey))
		return concat(...blobData)
	}

	/**
	 * Downloads multiple blobs, decrypts and joins them to unencrypted binary data which will be stored as a file on the
	 * device.
	 *
	 * @param archiveDataType
	 * @param blobs to be retrieved
	 * @param referencingInstance that directly references the blobs
	 * @param fileName is written to the returned FileReference
	 * @param mimeType is written to the returned FileReference
	 * @returns FileReference to the unencrypted binary data
	 */
	async downloadAndDecryptNative(
		archiveDataType: ArchiveDataType,
		referencingInstance: BlobReferencingInstance,
		fileName: string,
		mimeType: string,
	): Promise<FileReference> {
		if (!isApp() && !isDesktop()) {
			throw new ProgrammingError("Environment is not app or Desktop!")
		}
		const blobAccessInfoFactory = () => this.blobAccessTokenFacade.requestReadTokenBlobs(archiveDataType, referencingInstance)
		const sessionKey = neverNull(await this.cryptoFacade.resolveSessionKeyForInstance(referencingInstance.getEntity()))
		const decryptedChunkFileUris: FileUri[] = []
		let looped = 0
		for (const blob of referencingInstance.getBlobs()) {
			looped++
			try {
				decryptedChunkFileUris.push(await this.downloadAndDecryptChunkNative(blob, blobAccessInfoFactory, sessionKey))
			} catch (e) {
				for (const decryptedChunkFileUri of decryptedChunkFileUris) {
					await this.fileApp.deleteFile(decryptedChunkFileUri)
				}
				throw e
			}
		}
		console.log("looped", looped)
		// now decryptedChunkFileUris has the correct order of downloaded blobs, and we need to tell native to join them
		// check if output already exists and return cached?
		try {
			const decryptedFileUri = await this.fileApp.joinFiles(fileName, decryptedChunkFileUris)
			const size = await this.fileApp.getSize(decryptedFileUri)
			return {
				_type: "FileReference",
				name: fileName,
				mimeType,
				size,
				location: decryptedFileUri,
			}
		} finally {
			for (const tmpBlobFile of decryptedChunkFileUris) {
				await this.fileApp.deleteFile(tmpBlobFile)
			}
		}
	}

	private async encryptAndUploadChunk(
		chunk: Uint8Array,
		blobAccessTokenFactory: lazyAsync<BlobServerAccessInfo>,
		sessionKey: Aes128Key,
	): Promise<BlobReferenceTokenWrapper> {
		const encryptedData = encryptBytes(sessionKey, chunk)
		const blobHash = uint8ArrayToBase64(sha256Hash(encryptedData).slice(0, 6))
		const blobAccessToken = await blobAccessTokenFactory()
		return tryServers(
			blobAccessToken.servers,
			async (serverUrl) => {
				const response = await this.restClient.request(BLOB_SERVICE_REST_PATH, HttpMethod.POST, {
					queryParams: () => this.blobAccessTokenFacade.createQueryParams(blobAccessTokenFactory, { blobHash }),
					body: encryptedData,
					responseType: MediaType.Json,
					baseUrl: serverUrl,
				})
				return await this.parseBlobPostOutResponse(response)
			},
			`can't upload to server`,
		)
	}

	private async encryptAndUploadNativeChunk(
		fileUri: FileUri,
		blobAccessTokenFactory: lazyAsync<BlobServerAccessInfo>,
		sessionKey: Aes128Key,
	): Promise<BlobReferenceTokenWrapper> {
		const encryptedFileInfo = await this.aesApp.aesEncryptFile(sessionKey, fileUri)
		const encryptedChunkUri = encryptedFileInfo.uri
		const blobHash = await this.fileApp.hashFile(encryptedChunkUri)
		const blobServerAccessInfo = await blobAccessTokenFactory()

		return tryServers(
			blobServerAccessInfo.servers,
			async (serverUrl) => {
				const serviceUrl = new URL(BLOB_SERVICE_REST_PATH, serverUrl)
				const fullUrlFactory = async () => {
					const queryParams = await this.blobAccessTokenFacade.createQueryParams(blobAccessTokenFactory, { blobHash })
					return addParamsToUrl(serviceUrl, queryParams)
				}
				return await this.uploadNative(encryptedChunkUri, fullUrlFactory)
			},
			`can't upload to server from native`,
		)
	}

	private async uploadNative(location: string, fullUrlFactory: lazyAsync<URL>): Promise<BlobReferenceTokenWrapper> {
		if (this.suspensionHandler.isSuspended()) {
			return this.suspensionHandler.deferRequest(() => this.uploadNative(location, fullUrlFactory))
		}
		const fullUrl = await fullUrlFactory()
		const { suspensionTime, responseBody, statusCode, errorId, precondition } = await this.fileApp.upload(location, fullUrl.toString(), HttpMethod.POST, {}) // blobReferenceToken in the response body

		if (statusCode === 201 && responseBody != null) {
			return this.parseBlobPostOutResponse(uint8ArrayToString("utf-8", responseBody))
		} else if (responseBody == null) {
			throw new Error("no response body")
		} else if (isSuspensionResponse(statusCode, suspensionTime)) {
			this.suspensionHandler.activateSuspensionIfInactive(Number(suspensionTime))
			return this.suspensionHandler.deferRequest(() => this.uploadNative(location, fullUrlFactory))
		} else {
			throw handleRestError(statusCode, ` | PUT ${fullUrl.toString()} failed to natively upload blob`, errorId, precondition)
		}
	}

	private async parseBlobPostOutResponse(jsonData: string): Promise<BlobReferenceTokenWrapper> {
		const responseTypeModel = await resolveTypeReference(BlobPostOutTypeRef)
		const instance = JSON.parse(jsonData)
		const { blobReferenceToken } = await this.instanceMapper.decryptAndMapToInstance<BlobPostOut>(responseTypeModel, instance, null)
		return createBlobReferenceTokenWrapper({ blobReferenceToken })
	}

	private async downloadAndDecryptChunk(blob: Blob, blobAccessTokenFactory: lazyAsync<BlobServerAccessInfo>, sessionKey: Aes128Key): Promise<Uint8Array> {
		const { archiveId, blobId } = blob
		const blobServerAccessInfo = await blobAccessTokenFactory()
		const getData = createBlobGetIn({
			archiveId,
			blobId,
		})
		const BlobGetInTypeModel = await resolveTypeReference(BlobGetInTypeRef)
		const literalGetData = await this.instanceMapper.encryptAndMapToLiteral(BlobGetInTypeModel, getData, null)
		const body = JSON.stringify(literalGetData)

		return tryServers(
			blobServerAccessInfo.servers,
			async (serverUrl) => {
				const data = await this.restClient.request(BLOB_SERVICE_REST_PATH, HttpMethod.GET, {
					queryParams: () => this.blobAccessTokenFacade.createQueryParams(blobAccessTokenFactory, {}),
					body,
					responseType: MediaType.Binary,
					baseUrl: serverUrl,
					noCORS: true,
				})
				return aes128Decrypt(sessionKey, data)
			},
			`can't download from server `,
		)
	}

	private async downloadAndDecryptChunkNative(blob: Blob, blobAccessTokenFactory: lazyAsync<BlobServerAccessInfo>, sessionKey: Aes128Key): Promise<FileUri> {
		const { archiveId, blobId } = blob
		const getData = createBlobGetIn({
			archiveId,
			blobId,
		})
		const BlobGetInTypeModel = await resolveTypeReference(BlobGetInTypeRef)
		const literalGetData = await this.instanceMapper.encryptAndMapToLiteral(BlobGetInTypeModel, getData, null)
		const _body = JSON.stringify(literalGetData)

		const blobAccessInfo = await blobAccessTokenFactory()
		const blobFilename = blobId + ".blob"

		return tryServers(
			blobAccessInfo.servers,
			async (serverUrl) => {
				return await this.downloadNative(serverUrl, blobAccessTokenFactory, sessionKey, blobFilename, { _body })
			},
			`can't download native from server `,
		)
	}

	/**
	 * @return the uri of the decrypted blob
	 */
	private async downloadNative(
		serverUrl: string,
		blobAccessTokenFactory: lazyAsync<BlobServerAccessInfo>,
		sessionKey: Aes128Key,
		fileName: string,
		additionalParams: Dict,
	): Promise<FileUri> {
		if (this.suspensionHandler.isSuspended()) {
			return this.suspensionHandler.deferRequest(() => this.downloadNative(serverUrl, blobAccessTokenFactory, sessionKey, fileName, additionalParams))
		}
		const serviceUrl = new URL(BLOB_SERVICE_REST_PATH, serverUrl)
		const url = addParamsToUrl(serviceUrl, await this.blobAccessTokenFacade.createQueryParams(blobAccessTokenFactory, additionalParams))
		const { statusCode, encryptedFileUri, suspensionTime, errorId, precondition } = await this.fileApp.download(url.toString(), fileName, {})
		if (statusCode == 200 && encryptedFileUri != null) {
			const decryptedFileUrl = await this.aesApp.aesDecryptFile(sessionKey, encryptedFileUri)
			try {
				await this.fileApp.deleteFile(encryptedFileUri)
			} catch {
				console.log("Failed to delete encrypted file", encryptedFileUri)
			}
			return decryptedFileUrl
		} else if (isSuspensionResponse(statusCode, suspensionTime)) {
			this.suspensionHandler.activateSuspensionIfInactive(Number(suspensionTime))
			return this.suspensionHandler.deferRequest(() => this.downloadNative(serverUrl, blobAccessTokenFactory, sessionKey, fileName, additionalParams))
		} else {
			throw handleRestError(statusCode, ` | GET failed to natively download attachment`, errorId, precondition)
		}
	}
}
