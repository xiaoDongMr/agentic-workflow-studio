import {
  CANVAS_OFFSET_X,
  CANVAS_OFFSET_Y,
} from '@/features/workflow/editor/workflow-editor.config'

type ViewportPositionResolver = (event: MouseEvent) => { x: number; y: number }

export function getVisibleCanvasAddPlacement(
  shell: HTMLElement | null,
  getPosFromMouseEvent: ViewportPositionResolver | undefined,
) {
  if (!shell || !getPosFromMouseEvent) {
    return undefined
  }

  const rect = shell.getBoundingClientRect()
  if (!rect.width || !rect.height) {
    return undefined
  }

  const panelAnchorEvent = new MouseEvent('mousemove', {
    clientX: rect.left + rect.width / 2 - 180,
    clientY: rect.top + Math.min(rect.height * 0.45, rect.height - 260),
  })
  const panelPosition = getPosFromMouseEvent(panelAnchorEvent)

  return {
    panelPosition,
    position: {
      x: Math.max(Math.round(panelPosition.x - CANVAS_OFFSET_X), 0),
      y: Math.max(Math.round(panelPosition.y - CANVAS_OFFSET_Y), 0),
    },
  }
}
