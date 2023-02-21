import { AuthDataProvider } from "./UserFacade.js"
import { lazyAsync } from "@tutao/tutanota-utils"
import { BlobGetInTypeRef, BlobServerAccessInfo } from "../../entities/storage/TypeRefs.js"
import { resolveTypeReference } from "../../common/EntityFunctions.js"

export class BlobStorageAuthDataProvider {
	constructor(private authDataProvider: AuthDataProvider) {}

	public async createQueryParams(blobAccessTokenFactory: lazyAsync<BlobServerAccessInfo>, additionalRequestOptions: Dict): Promise<Dict> {
		var blobServerAccessInfo = await blobAccessTokenFactory()
		const BlobGetInTypeModel = await resolveTypeReference(BlobGetInTypeRef)
		return Object.assign(
			additionalRequestOptions,
			{
				blobAccessToken: blobServerAccessInfo.blobAccessToken,
				v: BlobGetInTypeModel.version,
			},
			this.authDataProvider.createAuthHeaders(),
		)
	}
}
