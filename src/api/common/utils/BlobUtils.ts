import { AuthDataProvider } from "../../worker/facades/UserFacade.js"
import { resolveTypeReference } from "../EntityFunctions.js"
import { BlobGetInTypeRef, BlobServerAccessInfo } from "../../entities/storage/TypeRefs.js"
import { lazyAsync } from "@tutao/tutanota-utils"
import { DateProvider } from "../DateProvider.js"

async function createParams(options: Dict, authDataProvider: AuthDataProvider): Promise<Dict> {
	const { blobAccessToken, blobHash, _body } = options
	const BlobGetInTypeModel = await resolveTypeReference(BlobGetInTypeRef)
	return Object.assign(
		{
			blobAccessToken,
			blobHash,
			_body,
			v: BlobGetInTypeModel.version,
		},
		authDataProvider.createAuthHeaders(),
	)
}

export async function queryParamsFactoryFactory(
	blobAccessInfoFactory: lazyAsync<BlobServerAccessInfo>,
	options: Dict,
	dateProvider: DateProvider,
	authDataProvider: AuthDataProvider,
) {
	let blobAccessInfo = await blobAccessInfoFactory()
	return {
		queryParamsFactory: async () => {
			if (blobAccessInfo.expires.getTime() < dateProvider.now()) {
				blobAccessInfo = await blobAccessInfoFactory()
			}
			return createParams(
				Object.assign(options, {
					blobAccessToken: blobAccessInfo.blobAccessToken,
				}),
				authDataProvider,
			)
		},
		servers: blobAccessInfo.servers,
	}
}
