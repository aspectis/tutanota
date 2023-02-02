import o from "ospec"
import { DateProvider } from "../../../../../src/api/common/DateProvider.js"
import { NewsModel } from "../../../../../src/misc/news/NewsModel.js"
import { object, when } from "testdouble"
import { ReferralLinkViewer } from "../../../../../src/misc/news/items/ReferralLinkViewer.js"
import { getDayShifted } from "@tutao/tutanota-utils"
import { ReferralLinkNews } from "../../../../../src/misc/news/items/ReferralLinkNews.js"
import { timestampToGeneratedId } from "../../../../../src/api/common/utils/EntityUtils.js"

o.spec("ReferralLinkNews", function () {
	let dateProvider: DateProvider
	let newsModel: NewsModel
	let referralViewModel: ReferralLinkViewer
	let referralLinkNews: ReferralLinkNews

	o.beforeEach(function () {
		dateProvider = object()
		newsModel = object()
		referralViewModel = object()
		referralLinkNews = new ReferralLinkNews(newsModel, dateProvider, timestampToGeneratedId(0))
	})

	o("ReferralLinkNews not shown if account is not old enough", function () {
		when(dateProvider.now()).thenReturn(getDayShifted(new Date(0), 6).getTime())
		o(referralLinkNews.isShown()).equals(false)
	})

	o("ReferralLinkNews shown if account is old enough", function () {
		when(dateProvider.now()).thenReturn(getDayShifted(new Date(0), 7).getTime())
		o(referralLinkNews.isShown()).equals(true)
	})
})
