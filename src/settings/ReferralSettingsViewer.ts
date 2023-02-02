import m, { Children } from "mithril"
import type { EntityUpdateData } from "../api/main/EventController"
import { isUpdateForTypeRef } from "../api/main/EventController"
import type { UpdatableSettingsViewer } from "./SettingsView"
import { getReferralLink, ReferralLinkViewer } from "../misc/news/items/ReferralLinkViewer.js"
import { UserTypeRef } from "../api/entities/sys/TypeRefs.js"
import { locator } from "../api/main/MainLocator.js"

/**
 * Section in user settings to display the referral link and let users share it.
 */
export class ReferralSettingsViewer implements UpdatableSettingsViewer {
	private referralLink: string = ""

	constructor() {
		this.refreshReferralLink()
	}

	view(): Children {
		return m(".mt-l.plr-l.pb-xl", m(ReferralLinkViewer, { referralLink: this.referralLink }))
	}

	async entityEventsReceived(updates: ReadonlyArray<EntityUpdateData>): Promise<void> {
		for (const update of updates) {
			const { instanceId } = update
			if (isUpdateForTypeRef(UserTypeRef, update)) {
				await locator.entityClient.load(UserTypeRef, instanceId)
				this.refreshReferralLink()
			}
		}
	}

	private refreshReferralLink() {
		getReferralLink().then((link) => {
			this.referralLink = link
			m.redraw()
		})
	}
}
