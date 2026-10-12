/**
 * The zoom and move buttons of every graph and map (the owner, 12 Oct): small, in the bottom-right
 * corner of the drawing — zoom in, zoom out, fit, and four arrows that move the view.
 */
import { IconButton } from "./IconButton";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ICON_SM, Maximize2, ZoomIn, ZoomOut } from "./icons";

export function ZoomControls({ onZoom, onMove, onFit }: { onZoom: (by: number) => void; onMove: (dx: number, dy: number) => void; onFit: () => void }) {
  return (
    <div className="zoomctl" role="group" aria-label="Zoom and move">
      <div className="zoomctl__pad">
        <IconButton size="sm" className="zoomctl__up" label="Move up" icon={<ArrowUp size={ICON_SM} />} onClick={() => onMove(0, 1)} />
        <IconButton size="sm" className="zoomctl__left" label="Move left" icon={<ArrowLeft size={ICON_SM} />} onClick={() => onMove(1, 0)} />
        <IconButton size="sm" className="zoomctl__fit" label="Fit" icon={<Maximize2 size={ICON_SM} />} onClick={onFit} />
        <IconButton size="sm" className="zoomctl__right" label="Move right" icon={<ArrowRight size={ICON_SM} />} onClick={() => onMove(-1, 0)} />
        <IconButton size="sm" className="zoomctl__down" label="Move down" icon={<ArrowDown size={ICON_SM} />} onClick={() => onMove(0, -1)} />
      </div>
      <div className="zoomctl__zoom">
        <IconButton size="sm" label="Zoom in" icon={<ZoomIn size={ICON_SM} />} onClick={() => onZoom(1.25)} />
        <IconButton size="sm" label="Zoom out" icon={<ZoomOut size={ICON_SM} />} onClick={() => onZoom(0.8)} />
      </div>
    </div>
  );
}
