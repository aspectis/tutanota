import { lazyAsync } from "@tutao/tutanota-utils"
import { ArchiveDataType } from "../../common/TutanotaConstants"
import { assertWorkerOrNode } from "../../common/Env"
import { BlobAccessTokenService } from "../../entities/storage/Services"
import { Blob } from "../../entities/sys/TypeRefs.js"
import { IServiceExecutor } from "../../common/ServiceRequest"
import {
	BlobGetInTypeRef,
	BlobServerAccessInfo,
	createBlobAccessTokenPostIn,
	createBlobReadData,
	createBlobWriteData,
	createInstanceId,
} from "../../entities/storage/TypeRefs"
import { DateProvider } from "../../common/DateProvider.js"
import { resolveTypeReference } from "../../common/EntityFunctions.js"
import { AuthDataProvider } from "./UserFacade.js"
import { SomeEntity } from "../../common/EntityTypes.js"

assertWorkerOrNode()

export interface BlobReferencingInstance {
	getElementId(): Id

	getListId(): Id | null

	getBlobs(): Blob[]

	getEntity(): SomeEntity
}

/**
 * The BlobAccessTokenFacade requests blobAccessTokens from the BlobAccessTokenService to get or post to the BlobService (binary blobs)
 * or DefaultBlobElementResource (instances).
 *
 * All tokens are cached.
 */
export class BlobAccessTokenFacade {
	// cache for blob access tokens that are valid for the whole archive (key:<archiveId>)
	private readonly readArchiveCache: BlobAccessTokenCache<string>
	// cache for blob access tokens that are valid for blobs from a given instance were the user does not own the archive (key:<instanceElementId>).
	private readonly readBlobCache: BlobAccessTokenCache<string>
	// cache for upload requests are valid for the whole archive (key:<ownerGroup + archiveDataType>).
	private readonly writeCache: BlobAccessTokenCache<string>

	constructor(
		private readonly serviceExecutor: IServiceExecutor,
		private readonly dateProvider: DateProvider,
		private readonly authDataProvider: AuthDataProvider,
	) {
		this.readArchiveCache = new BlobAccessTokenCache<Id>(dateProvider)
		this.readBlobCache = new BlobAccessTokenCache<Id>(dateProvider)
		this.writeCache = new BlobAccessTokenCache<string>(dateProvider)
	}

	/**
	 * Requests a token that allows uploading blobs for the given ArchiveDataType and ownerGroup.
	 * @param archiveDataType The type of data that should be stored.
	 * @param ownerGroupId The ownerGroup were the data belongs to (e.g. group of type mail)
	 */
	async requestWriteToken(archiveDataType: ArchiveDataType, ownerGroupId: Id): Promise<BlobServerAccessInfo> {
		const requestNewToken = async () => {
			const tokenRequest = createBlobAccessTokenPostIn({
				archiveDataType,
				write: createBlobWriteData({
					archiveOwnerGroup: ownerGroupId,
				}),
			})
			const { blobAccessInfo } = await this.serviceExecutor.post(BlobAccessTokenService, tokenRequest)
			return blobAccessInfo
		}
		const key = ownerGroupId + archiveDataType
		return this.writeCache.getToken(key, requestNewToken)
	}

	/**
	 * Requests a token that grants read access to all blobs that are referenced by the given instance.
	 * A user must be owner of the instance but must not be owner of the archive were the blobs are stored in.
	 * @param archiveDataType specify the data type
	 * @param referencingInstance the instance that references the blobs
	 */
	async requestReadTokenBlobs(archiveDataType: ArchiveDataType, referencingInstance: BlobReferencingInstance): Promise<BlobServerAccessInfo> {
		const requestNewToken = async () => {
			const archiveId = this.getArchiveId(referencingInstance.getBlobs())
			const instanceListId = referencingInstance.getListId()
			const instanceId = referencingInstance.getElementId()
			const instanceIds = [createInstanceId({ instanceId })]
			const tokenRequest = createBlobAccessTokenPostIn({
				archiveDataType,
				read: createBlobReadData({
					archiveId,
					instanceListId,
					instanceIds,
				}),
			})
			const { blobAccessInfo } = await this.serviceExecutor.post(BlobAccessTokenService, tokenRequest)
			return blobAccessInfo
		}
		return this.readBlobCache.getToken(referencingInstance.getElementId(), requestNewToken)
	}

	/**
	 * Requests a token that grants access to all blobs stored in the given archive. The user must own the archive (member of group)
	 * @param archiveId ID for the archive to read blobs from
	 */
	async requestReadTokenArchive(archiveId: Id): Promise<BlobServerAccessInfo> {
		const requestNewToken = async () => {
			const tokenRequest = createBlobAccessTokenPostIn({
				archiveDataType: null,
				read: createBlobReadData({
					archiveId,
					instanceIds: [],
				}),
			})
			const { blobAccessInfo } = await this.serviceExecutor.post(BlobAccessTokenService, tokenRequest)
			return blobAccessInfo
		}
		return this.readArchiveCache.getToken(archiveId, requestNewToken)
	}

	private getArchiveId(blobs: Blob[]) {
		if (blobs.length == 0) {
			throw new Error("must pass blobs")
		}
		let archiveIds = new Set(blobs.map((b) => b.archiveId))
		if (archiveIds.size != 1) {
			throw new Error(`only one archive id allowed, but was ${archiveIds}`)
		}
		return blobs[0].archiveId
	}

	/**
	 *
	 * @param blobAccessTokenFactory
	 * @param additionalRequestParams
	 */
	public async createQueryParams(blobAccessTokenFactory: lazyAsync<BlobServerAccessInfo>, additionalRequestParams: Dict): Promise<Dict> {
		var blobServerAccessInfo = await blobAccessTokenFactory()
		const BlobGetInTypeModel = await resolveTypeReference(BlobGetInTypeRef)
		return Object.assign(
			additionalRequestParams,
			{
				blobAccessToken: blobServerAccessInfo.blobAccessToken,
				v: BlobGetInTypeModel.version,
			},
			this.authDataProvider.createAuthHeaders(),
		)
	}
}

class BlobAccessTokenCache<K> {
	private cache: Map<K, BlobServerAccessInfo>
	private dateProvider: DateProvider

	constructor(dateProvider: DateProvider) {
		this.cache = new Map<K, BlobServerAccessInfo>()
		this.dateProvider = dateProvider
	}

	private canBeUsedForAnotherRequest(blobServerAccessInfo: BlobServerAccessInfo): boolean {
		return blobServerAccessInfo.expires.getTime() > this.dateProvider.now()
	}

	public async getToken(key: K, loader: () => Promise<BlobServerAccessInfo>): Promise<BlobServerAccessInfo> {
		const cached = this.cache.get(key)
		if (cached && this.canBeUsedForAnotherRequest(cached)) {
			return cached
		} else {
			const newToken = await loader()
			this.cache.set(key, newToken)
			return newToken
		}
	}
}
