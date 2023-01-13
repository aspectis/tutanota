import { client } from "../misc/ClientDetector.js"
import stream from "mithril/stream"

enum MoveDirection {
	X,
	Y,
}

type CoordinatePair = {
	x: number
	y: number
}

export class PinchZoom {
	private evCache: PointerEvent[] = []
	private touchCount = 0
	// pinching
	private prevDiff = -1
	private maxScale = -1
	private minScale = -1
	private currentScale = -1
	private xMiddle = -1
	private yMiddle = -1
	private pinchTouchIDs: Set<number> = new Set<number>()

	// dragging
	private dragTouchIDs: Set<number> = new Set<number>()
	private offsetX = -1
	private offsetY = -1
	private startX = -1
	private startY = -1
	private currentX = -1
	private currentY = -1
	private lastOffsetX = 0 //what should be the default that can never be reached be?
	private lastOffsetY = 0
	private currentTransformOrigin: CoordinatePair = { x: 0, y: 0 }
	private lastTransformOrigin: CoordinatePair = { x: 0, y: 0 }
	private transformOriginNotInitialized = true

	private topScrollValue: number = 0

	constructor(
		private readonly root: HTMLElement,
		private readonly parent: HTMLElement,
		private readonly topScrollValues: Array<stream<number>>,
		private readonly leftScrollValues: Array<stream<number>>,
	) {
		console.log("new Pinch to zoom----------------")
		this.setInitialScale(1)
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
		switch (ev.touches.length) {
			case 1:
				this.dragHandling(ev)
				break
			case 2:
				this.pinchHandling(ev)
				break
			default:
				break
		}
	}

	private pinchHandling(ev: TouchEvent) {
		// Calculate the distance between the two pointers
		const curDiff = Math.sqrt(Math.pow(ev.touches[1].clientX - ev.touches[0].clientX, 2) + Math.pow(ev.touches[1].clientY - ev.touches[0].clientY, 2))
		// console.log(this.touchIDs)
		if (!(this.pinchTouchIDs.has(ev.touches[0].identifier) && this.pinchTouchIDs.has(ev.touches[1].identifier))) {
			// in case of a new touch
			this.xMiddle = (ev.touches[1].pageX + ev.touches[0].pageX) / 2 // keep initial zoom center for whole zoom operation even if fingers are moving
			this.yMiddle = (ev.touches[1].pageY + ev.touches[0].pageY) / 2
			this.prevDiff = -1
		}
		// console.log(curDiff)
		// console.log("prev" + this.prevDiff)

		if (this.prevDiff > 0) {
			const additionalFactor = 1.01
			const changeFactor = 40 * window.devicePixelRatio // should be dependent on the devices dpi?
			this.zoom((curDiff - this.prevDiff) / changeFactor, this.xMiddle, this.yMiddle)
		}

		this.pinchTouchIDs = new Set<number>([ev.touches[0].identifier, ev.touches[1].identifier])

		// Cache the distance for the next move event
		this.prevDiff = curDiff
	}

	private dragHandling(ev: TouchEvent) {
		//FIXME check for new touch
		if (this.currentScale > 1) {
			// otherwise no need to drag
			ev.preventDefault()
			const newX = ev.touches[0].pageX
			const newY = ev.touches[0].pageY
			if (!this.dragTouchIDs.has(ev.touches[0].identifier)) {
				console.log("new touch")
				this.dragTouchIDs = new Set<number>([ev.touches[0].identifier])
				this.startX = newX
				this.startY = newY
				this.currentX = newX
				this.currentY = newY
			}

			// if (this.offsetX !== newX && this.offsetX !== -1) {
			this.moveBy(newX - this.currentX, newY - this.currentY)
			// this.directMove(this.currentX - newX, this.currentY - newY)
			// }
			// if (this.offsetY !== newY && this.offsetY !== -1) {
			// 	this.moveBy(MoveDirection.Y, newY - this.currentY)
			// }
			// this.offsetX = newX
			// this.offsetY = newY
			this.currentX = newX
			this.currentY = newY
		}
	}

	private directMove(changeX: number, changeY: number) {
		this.root.style.top = this.root.offsetTop - changeY + "px"
		this.root.style.left = this.root.offsetLeft - changeX + "px"
	}

	private moveBy(changeX: number, changeY: number) {
		// FIXME maybe combine, no need for separate direction
		// if (direction === MoveDirection.X) {
		// this.root.style.translate = `${changeBY / this.currentScale}px, 0px`
		// this.root.style.transform = `translate(${-changeX}px, ${changeY}px) scale(${this.currentScale})`
		// } else if (direction === MoveDirection.Y) {
		// this.root.style.translate = `0px, ${changeBY / this.currentScale}px`
		// this.root.style.transform = `translate(0px, ${changeBY / this.currentScale}px) scale(${this.currentScale})`
		// }

		// if (this.lastOffsetY === -1 && this.lastOffsetX === -1) {
		// 	this.lastOffsetX = this.currentX + generatedOffset.x
		// 	this.lastOffsetY = this.currentY + generatedOffset.y
		// } else {
		// 	this.lastOffsetX = this.currentX + generatedOffset.x //FIXME
		// 	this.lastOffsetY = this.currentY + generatedOffset.y
		// }

		this.updateTransformOrigin()
		const scalingFactor = this.interpolateTransformation()
		console.log(`scaling factor`, scalingFactor)
		this.root.style.transformOrigin = `${this.currentTransformOrigin.x * scalingFactor}px ${this.currentTransformOrigin.y * scalingFactor}px` // I guess not super correct //FIXME shouldn't be necessary??!
		// this.root.style.transformOrigin = "top left"
		// this.root.style.transition = "transform 300ms ease-in-out"
		// console.log(`changeBy: ${-changeX}, ${changeY}, current scale: ${this.currentScale}, transform origin: x=${this.currentX + generatedOffset.x}, y=${this.currentY + generatedOffset.y}`)
	}

	private interpolateTransformation(): number {
		const inverted = this.maxScale - this.currentScale // inverted relationship
		return Math.pow(this.minScale + inverted, 3)
	}

	private invalidBorder(): boolean {
		if (
			this.root.style.left > this.parent.style.left ||
			this.root.style.right < this.parent.style.right ||
			this.root.style.top > this.parent.style.top ||
			this.root.style.bottom < this.parent.style.bottom
		) {
			return true
		}
		return false
	}

	private updateTransformOrigin() {
		if (this.invalidBorder()) {
			return
		}
		if (this.transformOriginNotInitialized) {
			const generatedOffset = this.generateOffset()
			this.currentTransformOrigin = {
				x: this.startX + (this.startX - this.currentX) + generatedOffset.x,
				y: this.startY + (this.startY - this.currentY) + generatedOffset.y,
			}
			this.lastTransformOrigin.x = this.currentTransformOrigin.x
			this.lastTransformOrigin.y = this.currentTransformOrigin.y
			this.transformOriginNotInitialized = false
		} else {
			this.currentTransformOrigin = {
				x: this.lastTransformOrigin.x + (this.startX - this.currentX),
				y: this.lastTransformOrigin.y + (this.startY - this.currentY),
			}
		}
		console.log(`transform origin: x-${this.currentTransformOrigin.x}, y-${this.currentTransformOrigin.y}`)
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
		if (zoomModifier > 0) {
			// zooming in
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

		const generatedOffset = this.generateOffset()

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
		// child.style.transformOrigin = "top left" // definitely works but looks not nice
		// child.style.transformOrigin = `${centerX}px ${0}px`
		console.log("scrolltop", this.root.scrollTop)
		// this.updateTransformOrigin()
		child.style.transformOrigin = `${centerX + generatedOffset.x}px ${centerY + generatedOffset.y}px`
		// child.style.transformOrigin = `${this.currentTransformOrigin.x}px ${this.currentTransformOrigin.x}px`
		// child.style.transformBox = ""
		child.style.transition = "transform 300ms ease-in-out"
	}

	private generateOffset(): CoordinatePair {
		console.log(`top scroll root: ${this.root.scrollTop}`)
		let xOffset = 0
		let yOffset = 0
		// if (this.lastOffsetX === -1 || this.lastOffsetY === -1) {
		for (const xStream of this.leftScrollValues) {
			xOffset += xStream()
		}
		for (const yStream of this.topScrollValues) {
			yOffset += yStream()
		}
		// 	this.lastOffsetX = xOffset
		// 	this.lastOffsetY = yOffset
		// }
		// return { x: this.lastOffsetX, y: this.lastOffsetY }
		return { x: xOffset, y: yOffset }
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
			this.minScale = scale //- 0.1 // should further zooming out be possible? //FIXME
			this.maxScale = scale + 1
		}
		console.log("new scale", this.currentScale)
	}

	setInitialScale(scale: number) {
		console.log("initialize scaling", scale)
		if (this.currentScale === -1) {
			this.saveScale(scale)
		}
	}

	private removeTouches() {
		this.lastTransformOrigin.x = this.currentTransformOrigin.x
		this.lastTransformOrigin.y = this.currentTransformOrigin.y
		this.pinchTouchIDs.clear()
		this.dragTouchIDs.clear()
	}
}
