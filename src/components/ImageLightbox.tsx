"use client";

import { X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt = "Receipt", onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  // Refs so event-handler closures always see fresh values
  const scaleRef = useRef(1);
  const posRef = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  scaleRef.current = scale;
  posRef.current = pos;

  // Escape key + lock body scroll
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Non-passive wheel listener so preventDefault() actually works
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      applyScaleRef(scaleRef.current * factor, cx, cy);
    };
    stage.addEventListener("wheel", handler, { passive: false });
    return () => stage.removeEventListener("wheel", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyScaleRef(next: number, ox = 0, oy = 0) {
    next = Math.min(10, Math.max(1, next));
    let newPos: { x: number; y: number };
    if (next === 1) {
      newPos = { x: 0, y: 0 };
    } else {
      const ratio = next / scaleRef.current;
      newPos = {
        x: posRef.current.x * ratio + ox * (1 - ratio),
        y: posRef.current.y * ratio + oy * (1 - ratio),
      };
    }
    scaleRef.current = next;
    posRef.current = newPos;
    setScale(next);
    setPos(newPos);
  }

  function onMouseDown(e: React.MouseEvent) {
    if (scaleRef.current <= 1) return;
    e.preventDefault();
    setDragging(true);
    dragOrigin.current = {
      mx: e.clientX, my: e.clientY,
      px: posRef.current.x, py: posRef.current.y,
    };
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragOrigin.current) return;
    const newPos = {
      x: dragOrigin.current.px + (e.clientX - dragOrigin.current.mx),
      y: dragOrigin.current.py + (e.clientY - dragOrigin.current.my),
    };
    posRef.current = newPos;
    setPos(newPos);
  }

  function stopDrag() {
    setDragging(false);
    dragOrigin.current = null;
  }

  function onDoubleClick(e: React.MouseEvent) {
    const rect = stageRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    applyScaleRef(scaleRef.current > 1 ? 1 : 2.5, cx, cy);
  }

  const cursorStyle = scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in";

  return (
    <div
      className="lb-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="lb-toolbar">
        <button
          className="lb-btn"
          onClick={() => applyScaleRef(scaleRef.current / 1.4)}
          disabled={scale <= 1}
          title="Zoom out"
        >
          <ZoomOut size={16} />
        </button>
        <span className="lb-scale">{Math.round(scale * 100)}%</span>
        <button
          className="lb-btn"
          onClick={() => applyScaleRef(scaleRef.current * 1.4)}
          disabled={scale >= 10}
          title="Zoom in"
        >
          <ZoomIn size={16} />
        </button>
        <div className="lb-sep" />
        <button className="lb-btn lb-btn-close" onClick={onClose} title="Close (Esc)">
          <X size={16} />
        </button>
      </div>

      <div
        ref={stageRef}
        className="lb-stage"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onDoubleClick={onDoubleClick}
        style={{ cursor: cursorStyle }}
      >
        <img
          src={src}
          alt={alt}
          className="lb-img"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: dragging ? "none" : "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          draggable={false}
        />
      </div>

      <p className="lb-hint">Scroll to zoom · Drag to pan · Double-click to reset</p>
    </div>
  );
}
