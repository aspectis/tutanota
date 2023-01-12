import Mithril, {Component, Vnode} from "mithril"
import {client} from "../misc/ClientDetector.js"
import {MailViewerAttrs} from "../mail/view/MailViewer.js"

export class PinchZoom {

	private evCache: PointerEvent[] = []
	private touchCount = 0
	private prevDiff = -1
	private maxScale = -1
	private minScale = -1
	private currentScale = -1
	private xMiddle = -1
	private yMiddle = -1
	private touchIDs: Set<number> = new Set<number>()

	constructor(private readonly root: HTMLElement) {
		this.root.ontouchend = (e) => {
			this.removeTouches()
			// console.log("touch end")
		}
		this.root.ontouchmove = (e) => {
			this.touchmove_handler(e)
			// console.log("touch move")
		}
		this.root.ontouchcancel = (e) => {
			this.removeTouches()
			// console.log("touch cancel")
		}
	}

	private touchmove_handler(ev: TouchEvent) {
		// console.log(ev)
		if (ev.touches.length === 2) {
			// Calculate the distance between the two pointers
			const curDiff = Math.sqrt(
				Math.pow(ev.touches[1].clientX - ev.touches[0].clientX, 2) + Math.pow(ev.touches[1].clientY - ev.touches[0].clientY, 2)
			)
			// console.log(this.touchIDs)
			if (!(this.touchIDs.has(ev.touches[0].identifier) && this.touchIDs.has(ev.touches[1].identifier))) { // in case of a new touch
				this.xMiddle = (ev.touches[1].pageX + ev.touches[0].pageX) / 2 // keep initial zoom center for whole zoom operation even if fingers are moving
				this.yMiddle = (ev.touches[1].pageY + ev.touches[0].pageY) / 2
				this.prevDiff = -1;
			}
			// console.log(curDiff)
			// console.log("prev" + this.prevDiff)

			if (this.prevDiff > 0) {
				const additionalFactor = 1.01
				const changeFactor = 40 * window.devicePixelRatio // should be dependent on the devices dpi?
				this.zoom((curDiff - this.prevDiff) / changeFactor, this.xMiddle, this.yMiddle)
			}

			this.touchIDs = new Set<number>([ev.touches[0].identifier, ev.touches[1].identifier])

			// Cache the distance for the next move event
			this.prevDiff = curDiff
		}
	}

	private zoom(zoomModifier: number, centerX: number, centerY: number) {
		const child = this.root
		console.log("zoom")
		if (!client.isMobileDevice() || !child) {
			return
		}
		// console.log("container Width", containerWidth)
		// console.log("child scroll width", child.scrollWidth)

		if (this.currentScale === -1) {
			const realScale = child.getBoundingClientRect().width / child.offsetWidth
			// console.log("actual scale", realScale)
			const containerWidth = child.offsetWidth
			const width = child.scrollWidth
			this.saveScale(realScale) //containerWidth / width
		}
		// console.log("current scale", this.currentScale)
		if (zoomModifier > 0) { // zooming in
			this.currentScale = Math.min(this.currentScale + zoomModifier, this.maxScale) // * multiplier
			child.style.transform = `scale(${this.currentScale})`
			// const heightDiff = child.scrollHeight - child.scrollHeight * this.currentScale
			// child.style.marginBottom = `${-heightDiff}px`
		} else {
			this.currentScale = Math.max(this.currentScale + zoomModifier, this.minScale) // * multiplier
			child.style.transform = `scale(${this.currentScale})`
			// const heightDiff = child.scrollHeight - child.scrollHeight * scale
			// child.style.marginBottom = `${-heightDiff}px`
		}

		// ios 15 bug: transformOrigin magically disappears so we ensure that it's always set
		// console.log(`${parseInt(centerX.toString())}px ${parseInt(centerY.toString())}px`)
		const heightDiff = child.scrollHeight - child.scrollHeight * this.currentScale
		const widthDiff = child.scrollWidth - child.scrollWidth * this.currentScale
		// console.log(child.scrollHeight)
		// console.log("heightDiff", heightDiff)
		// console.log("widthDiff", widthDiff)
		// console.log("x and y", centerX, centerY)
		// console.log(this.topScrollValue)
		// child.style.transformOrigin = `${centerX}px ${centerY + this.topScrollValue}px` // FIXME should consider were mail body is currently placed, especially when zoomed out
		child.style.transformOrigin = "top left"
		// child.style.transformOrigin = `${centerX}px ${0}px`
		// child.style.translate = `${-widthDiff}px`
		// child.style.transformBox = ""
		child.style.transition = "transform 300ms ease-in-out"
	}

	/**
	 *
	 * @param scale reset if no values given
	 * @private
	 */
	private saveScale(scale: number = -1) {
		console.log("change scale")
		if (scale === -1) {
			this.currentScale = -1
			this.maxScale = -1
			this.minScale = -1
		} else {
			this.currentScale = scale
			this.minScale = scale - 0.1 // should further zooming out be possible? //FIXME
			this.maxScale = scale + 1
		}
	}

	private removeTouches() {
		this.touchIDs.clear()
	}
}