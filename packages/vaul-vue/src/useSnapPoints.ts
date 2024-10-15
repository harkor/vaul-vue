import type { DrawerDirection } from './types'
import { type ComponentPublicInstance, computed, nextTick, onBeforeUnmount, onMounted, type Ref, ref, watch } from 'vue'
import { TRANSITIONS, VELOCITY_THRESHOLD } from './constants'
import { isVertical, set } from './helpers'

interface useSnapPointsProps {
  activeSnapPoint: Ref<number | string | null | undefined>
  snapPoints: Ref<(number | string)[] | undefined>
  fadeFromIndex: Ref<number | undefined>
  drawerRef: Ref<ComponentPublicInstance | null>
  overlayRef: Ref<ComponentPublicInstance | null>
  onSnapPointChange: (activeSnapPointIndex: number, snapPointsOffset: number[]) => void
  direction: Ref<DrawerDirection>
  container?: HTMLElement | null | undefined
  snapToSequentialPoint?: Ref<boolean>
}

export function useSnapPoints({
  activeSnapPoint,
  snapPoints,
  drawerRef,
  overlayRef,
  fadeFromIndex,
  onSnapPointChange,
  direction,
  container,
  snapToSequentialPoint,
}: useSnapPointsProps) {
  const windowDimensions = ref(typeof window !== 'undefined'
    ? {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      }
    : undefined)

  function onResize() {
    windowDimensions.value = {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    }
  }

  onMounted(() => {
    if (typeof window !== 'undefined')
      window.addEventListener('resize', onResize)
  })

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined')
      window.removeEventListener('resize', onResize)
  })

  const isLastSnapPoint = computed(
    () =>
      (snapPoints.value
        && activeSnapPoint.value === snapPoints.value[snapPoints.value.length - 1])
        ?? null,
  )

  const activeSnapPointIndex = computed(
    () => snapPoints.value?.findIndex(snapPoint => snapPoint === activeSnapPoint.value) ?? null,
  )

  const shouldFade = computed(
    () =>
      (snapPoints.value
        && snapPoints.value.length > 0
        && (fadeFromIndex?.value || fadeFromIndex?.value === 0)
        && !Number.isNaN(fadeFromIndex?.value)
        && snapPoints.value[fadeFromIndex?.value] === activeSnapPoint.value)
        || !snapPoints.value,
  )

  const snapPointsOffset = computed(
    () =>
      snapPoints.value?.map((snapPoint) => {
        const containerSize = container
          ? { width: container.getBoundingClientRect().width, height: container.getBoundingClientRect().height }
          : typeof window !== 'undefined'
            ? { width: window.innerWidth, height: window.innerHeight }
            : { width: 0, height: 0 }

        const isPx = typeof snapPoint === 'string'
        let snapPointAsNumber = 0

        if (isPx)
          snapPointAsNumber = Number.parseInt(snapPoint, 10)

        if (isVertical(direction.value)) {
          const height = isPx ? snapPointAsNumber : windowDimensions.value ? snapPoint * containerSize.height : 0

          if (windowDimensions.value)
            return direction.value === 'bottom' ? containerSize.height - height : -containerSize.height + height

          return height
        }
        const width = isPx ? snapPointAsNumber : windowDimensions.value ? snapPoint * containerSize.width : 0

        if (windowDimensions.value)
          return direction.value === 'right' ? containerSize.width - width : -containerSize.width + width

        return width
      }) ?? [],
  )

  const activeSnapPointOffset = computed(() =>
    activeSnapPointIndex.value !== null
      ? snapPointsOffset.value?.[activeSnapPointIndex.value]
      : null,
  )

  const snapToPoint = (dimension: number) => {
    const newSnapPointIndex = snapPointsOffset.value?.findIndex(snapPointDim => snapPointDim === dimension) ?? null

    // nextTick to allow el to be mounted before setting it.
    nextTick(() => {
      onSnapPointChange(newSnapPointIndex, snapPointsOffset.value)
      set(drawerRef.value?.$el, {
        transition: `transform ${TRANSITIONS.DURATION}s cubic-bezier(${TRANSITIONS.EASE.join(',')})`,
        transform: isVertical(direction.value) ? `translate3d(0, ${dimension}px, 0)` : `translate3d(${dimension}px, 0, 0)`,
      })
    })

    if (
      snapPointsOffset.value
      && newSnapPointIndex !== snapPointsOffset.value.length - 1
      && fadeFromIndex.value !== undefined
      && newSnapPointIndex !== fadeFromIndex.value
      && newSnapPointIndex < fadeFromIndex.value
    ) {
      set(overlayRef.value?.$el, {
        transition: `opacity ${TRANSITIONS.DURATION}s cubic-bezier(${TRANSITIONS.EASE.join(',')})`,
        opacity: '0',
      })
    }
    else {
      set(overlayRef.value?.$el, {
        transition: `opacity ${TRANSITIONS.DURATION}s cubic-bezier(${TRANSITIONS.EASE.join(',')})`,
        opacity: '1',
      })
    }

    activeSnapPoint.value
      = snapPoints.value?.[Math.max(newSnapPointIndex, 0)]
  }

  watch(
    [activeSnapPoint, snapPoints, snapPointsOffset],
    () => {
      if (activeSnapPoint.value) {
        const newIndex
          = snapPoints.value?.findIndex(snapPoint => snapPoint === activeSnapPoint.value) ?? -1

        if (
          snapPointsOffset.value
          && newIndex !== -1
          && typeof snapPointsOffset.value[newIndex] === 'number'
        ) {
          snapToPoint(snapPointsOffset.value[newIndex])
        }
      }
    },
    {
      immediate: true, // if you want to run the effect immediately as well
    },
  )

  function onRelease({
    draggedDistance,
    closeDrawer,
    velocity,
    dismissible,
  }: {
    draggedDistance: number
    closeDrawer: () => void
    velocity: number
    dismissible: boolean
  }) {
    if (fadeFromIndex === undefined)
      return

    const currentPosition
    = direction.value === 'bottom' || direction.value === 'right'
      ? (activeSnapPointOffset.value ?? 0) - draggedDistance
      : (activeSnapPointOffset.value ?? 0) + draggedDistance
    const isOverlaySnapPoint = activeSnapPointIndex.value === (fadeFromIndex.value ?? 0) - 1
    const isFirst = activeSnapPointIndex.value === 0
    const hasDraggedUp = draggedDistance > 0

    if (isOverlaySnapPoint) {
      set(overlayRef.value?.$el, {
        transition: `opacity ${TRANSITIONS.DURATION}s cubic-bezier(${TRANSITIONS.EASE.join(',')})`,
      })
    }

    if (!snapToSequentialPoint?.value && velocity > 2 && !hasDraggedUp) {
      if (dismissible)
        closeDrawer()
      else snapToPoint(snapPointsOffset.value[0]) // snap to initial point
      return
    }

    if (!snapToSequentialPoint?.value && velocity > 2 && hasDraggedUp && snapPointsOffset.value && snapPoints.value) {
      snapToPoint(snapPointsOffset.value[snapPoints.value.length - 1] as number)
      return
    }

    // Find the closest snap point to the current position
    const closestSnapPoint = snapPointsOffset.value?.reduce((prev, curr) => {
      if (typeof prev !== 'number' || typeof curr !== 'number')
        return prev

      return Math.abs(curr - currentPosition) < Math.abs(prev - currentPosition) ? curr : prev
    })

    const dim = isVertical(direction.value) ? window.innerHeight : window.innerWidth
    if (velocity > VELOCITY_THRESHOLD && Math.abs(draggedDistance) < dim * 0.4) {
      const dragDirection = hasDraggedUp ? 1 : -1 // 1 = up, -1 = down

      // Don't do anything if we swipe upwards while being on the last snap point
      if (dragDirection > 0 && isLastSnapPoint.value && snapPoints.value) {
        snapToPoint(snapPointsOffset.value[(snapPoints.value?.length ?? 0) - 1])
        return
      }

      if (isFirst && dragDirection < 0 && dismissible)
        closeDrawer()

      if (activeSnapPointIndex.value === null)
        return

      snapToPoint(snapPointsOffset.value[activeSnapPointIndex.value + dragDirection])
      return
    }

    snapToPoint(closestSnapPoint)
  }

  function onDrag({ draggedDistance }: { draggedDistance: number }) {
    if (activeSnapPointOffset.value === null)
      return
    const newValue
    = direction.value === 'bottom' || direction.value === 'right'
      ? (activeSnapPointOffset.value ?? 0) - draggedDistance
      : (activeSnapPointOffset.value ?? 0) + draggedDistance

    // Don't do anything if we exceed the last(biggest) snap point
    if ((direction.value === 'bottom' || direction.value === 'right') && newValue < snapPointsOffset.value[snapPointsOffset.value.length - 1])
      return

    if ((direction.value === 'top' || direction.value === 'left') && newValue > snapPointsOffset.value[snapPointsOffset.value.length - 1])
      return

    set(drawerRef.value?.$el, {
      transform: isVertical(direction.value) ? `translate3d(0, ${newValue}px, 0)` : `translate3d(${newValue}px, 0, 0)`,
    })
  }

  function getPercentageDragged(absDraggedDistance: number, isDraggingDown: boolean) {
    if (
      !snapPoints
      || typeof activeSnapPointIndex.value !== 'number'
      || !snapPointsOffset.value
      || fadeFromIndex === undefined
    ) {
      return null
    }

    // If this is true we are dragging to a snap point that is supposed to have an overlay
    const isOverlaySnapPoint = activeSnapPointIndex.value === (fadeFromIndex.value ?? 0) - 1
    const isOverlaySnapPointOrHigher = activeSnapPointIndex.value >= (fadeFromIndex.value ?? 0)

    if (isOverlaySnapPointOrHigher && isDraggingDown)
      return 0

    // Don't animate, but still use this one if we are dragging away from the overlaySnapPoint
    if (isOverlaySnapPoint && !isDraggingDown)
      return 1
    if (!shouldFade.value && !isOverlaySnapPoint)
      return null

    // Either fadeFrom index or the one before
    const targetSnapPointIndex = isOverlaySnapPoint
      ? activeSnapPointIndex.value + 1
      : activeSnapPointIndex.value - 1

    // Get the distance from overlaySnapPoint to the one before or vice-versa to calculate the opacity percentage accordingly
    const snapPointDistance = isOverlaySnapPoint
      ? snapPointsOffset.value[targetSnapPointIndex]
      - snapPointsOffset.value[targetSnapPointIndex - 1]
      : snapPointsOffset.value[targetSnapPointIndex + 1]
        - snapPointsOffset.value[targetSnapPointIndex]

    const percentageDragged = absDraggedDistance / Math.abs(snapPointDistance)

    if (isOverlaySnapPoint)
      return 1 - percentageDragged
    else
      return percentageDragged
  }

  return {
    isLastSnapPoint,
    activeSnapPoint,
    shouldFade,
    getPercentageDragged,
    activeSnapPointIndex,
    onRelease,
    onDrag,
    snapPointsOffset,
  }
}
