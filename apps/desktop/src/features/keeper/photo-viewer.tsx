import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import { api, type KeeperAttachment, type KeeperOwnerKind } from "../../shared/lib/ipc";
import { PHOTOS_CHANGED } from "./_components/photo-strip";

const MAX_ZOOM = 8;

type View = { scale: number; x: number; y: number };

/**
 * The photo viewer: its own resizable window, opened from a document or
 * reminder. Fits the photo on arrival; scroll or pinch to zoom where the
 * pointer is, drag to pan, double-click to swap between fit and actual size.
 * Arrow keys step through the photos, Escape closes.
 */
export function PhotoViewer() {
  const { t } = useSettings();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const ownerKind = (params.get("kind") ?? "record") as KeeperOwnerKind;
  const ownerId = params.get("owner") ?? "";

  const [photos, setPhotos] = useState<KeeperAttachment[]>([]);
  const [index, setIndex] = useState(() => Number(params.get("index") ?? 0) || 0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [fit, setFit] = useState(1);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);

  const photo = photos[Math.min(index, photos.length - 1)];

  const load = useCallback(
    () =>
      api
        .listKeeperAttachments(ownerKind, ownerId)
        .then((list) => {
          setPhotos(list ?? []);
          if ((list ?? []).length === 0) closeWindow();
        })
        .catch(() => {}),
    [ownerKind, ownerId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const announce = useCallback(async () => {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(PHOTOS_CHANGED, { ownerKind, ownerId }).catch(() => {});
  }, [ownerKind, ownerId]);

  // Full images are fetched as they're shown, and kept for going back.
  useEffect(() => {
    if (!photo || urls[photo.id]) return;
    let cancelled = false;
    api
      .getKeeperAttachment(photo.id)
      .then((buffer) => {
        if (cancelled) return;
        const url = URL.createObjectURL(new Blob([buffer], { type: "image/jpeg" }));
        setUrls((current) => ({ ...current, [photo.id]: url }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photo, urls]);

  // Release the full-size images when the viewer closes — not on every
  // change, which would free ones still on screen.
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  useEffect(
    () => () => {
      for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url);
    },
    [],
  );

  /** Scale that shows the whole photo with a little breathing room. */
  const measureFit = useCallback(() => {
    const box = stage.current?.getBoundingClientRect();
    if (!box || !photo) return 1;
    return Math.min((box.width - 48) / photo.width, (box.height - 48) / photo.height, 1);
  }, [photo]);

  const reset = useCallback(() => {
    const next = measureFit();
    setFit(next);
    setView({ scale: next, x: 0, y: 0 });
  }, [measureFit]);

  useEffect(() => {
    reset();
    const observer = new ResizeObserver(reset);
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, [reset]);

  /** Zoom to `scale`, keeping the point under (px, py) — relative to the
   * stage centre — where it is. */
  const zoomTo = useCallback(
    (scale: number, px = 0, py = 0) =>
      setView((current) => {
        const next = Math.min(Math.max(scale, fit), MAX_ZOOM);
        if (next === fit) return { scale: fit, x: 0, y: 0 };
        const ratio = next / current.scale;
        return { scale: next, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio };
      }),
    [fit],
  );

  const pointer = (clientX: number, clientY: number) => {
    const box = stage.current?.getBoundingClientRect();
    return box
      ? { px: clientX - box.left - box.width / 2, py: clientY - box.top - box.height / 2 }
      : { px: 0, py: 0 };
  };

  const onWheel = (event: React.WheelEvent) => {
    const { px, py } = pointer(event.clientX, event.clientY);
    // Trackpad pinch arrives as a ctrl-wheel with small deltas; a mouse wheel
    // as larger steps. Both zoom.
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0022));
    zoomTo(view.scale * factor, px, py);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (view.scale <= fit) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, view };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent) => {
    const start = drag.current;
    if (!start) return;
    setView({
      ...start.view,
      x: start.view.x + event.clientX - start.x,
      y: start.view.y + event.clientY - start.y,
    });
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    const { px, py } = pointer(event.clientX, event.clientY);
    // Fit ⇄ actual size; a photo smaller than the window goes to twice fit.
    zoomTo(view.scale > fit ? fit : Math.max(1, fit * 2), px, py);
  };

  const go = useCallback(
    (step: number) => {
      if (photos.length < 2) return;
      setIndex((current) => (current + step + photos.length) % photos.length);
    },
    [photos.length],
  );

  const rotate = async () => {
    if (!photo || busy) return;
    setBusy(true);
    try {
      await api.rotateKeeperAttachment(photo.id);
      setUrls((current) => {
        const { [photo.id]: stale, ...rest } = current;
        if (stale) URL.revokeObjectURL(stale);
        return rest;
      });
      await load();
      await announce();
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!photo) return;
    const { save: pick } = await import("@tauri-apps/plugin-dialog");
    const destination = await pick({
      defaultPath: `sajilo-photo-${index + 1}.jpg`,
      filters: [{ name: "JPEG", extensions: ["jpg", "jpeg"] }],
    });
    if (destination) await api.exportKeeperAttachment(photo.id, destination).catch(() => {});
  };

  const remove = async () => {
    if (!photo) return;
    const { ask } = await import("@tauri-apps/plugin-dialog");
    const ok = await ask(t("keeper.photos.delete-body"), {
      title: t("keeper.photos.delete-title"),
      kind: "warning",
    });
    if (!ok) return;
    await api.deleteKeeperAttachment(photo.id).catch(() => {});
    setIndex((current) => Math.max(0, Math.min(current, photos.length - 2)));
    await load();
    await announce();
  };

  // Keyboard, window-wide.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "Escape") closeWindow();
      else if (event.key === "0") reset();
      else if (event.key === "=" || event.key === "+") zoomTo(view.scale * 1.25);
      else if (event.key === "-") zoomTo(view.scale / 1.25);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, reset, zoomTo, view.scale]);

  // A new photo starts fitted.
  useEffect(() => {
    if (photo) reset();
  }, [photo?.id, reset, photo]);

  const url = photo ? urls[photo.id] : undefined;
  const percent = photo ? Math.round(view.scale * 100) : 100;

  return (
    <div className="viewer fixed inset-0 flex select-none flex-col bg-[#111113] text-[#f5f5f7]">
      <div
        ref={stage}
        role="application"
        aria-label={t("keeper.photos.title")}
        className={`relative min-h-0 flex-1 overflow-hidden ${
          view.scale > fit ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
        }`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {photo && (
          <img
            key={photo.id}
            src={url ?? photo.thumbnail}
            alt=""
            draggable={false}
            className="viewer-image absolute top-1/2 left-1/2 max-w-none"
            style={{
              width: photo.width,
              height: photo.height,
              transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              transition: dragging ? "none" : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
              filter: url ? "none" : "blur(6px)",
            }}
          />
        )}

        {photos.length > 1 && (
          <>
            <NavButton side="left" label={t("keeper.photos.previous")} onClick={() => go(-1)} />
            <NavButton side="right" label={t("keeper.photos.next")} onClick={() => go(1)} />
          </>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 px-4 pt-1 pb-4">
        {photos.length > 1 && (
          <div className="flex max-w-full gap-1.5 overflow-x-auto px-1 py-1">
            {photos.map((entry, position) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setIndex(position)}
                aria-label={t("keeper.photos.open").replace("{n}", String(position + 1))}
                aria-current={position === index}
                className={`size-11 shrink-0 overflow-hidden rounded-md transition ${
                  position === index
                    ? "opacity-100 ring-2 ring-[color:var(--color-accent-mark)]"
                    : "opacity-45 hover:opacity-80"
                }`}
              >
                <img
                  src={entry.thumbnail}
                  alt=""
                  draggable={false}
                  className="size-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <span className="px-2 text-[11px] font-medium tabular-nums text-white/70">
            {photos.length > 0 ? `${index + 1} / ${photos.length}` : "—"}
          </span>
          <Divider />
          <ToolButton
            icon="minus"
            label={t("keeper.photos.zoom-out")}
            onClick={() => zoomTo(view.scale / 1.25)}
          />
          <button
            type="button"
            onClick={reset}
            title={t("keeper.photos.fit")}
            className="min-w-12 rounded-full px-2 py-1 text-[11px] font-medium tabular-nums text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            {view.scale <= fit ? t("keeper.photos.fit") : `${percent}%`}
          </button>
          <ToolButton
            icon="plus"
            label={t("keeper.photos.zoom-in")}
            onClick={() => zoomTo(view.scale * 1.25)}
          />
          <Divider />
          <ToolButton
            icon="rotate"
            label={t("keeper.photos.rotate")}
            onClick={rotate}
            disabled={busy}
          />
          <ToolButton icon="export" label={t("keeper.photos.save")} onClick={save} />
          <ToolButton
            icon="trash"
            label={t("keeper.photos.delete-title")}
            onClick={remove}
            danger
          />
        </div>
      </div>
    </div>
  );
}

function closeWindow() {
  import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => getCurrentWindow().close())
    .catch(() => {});
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px bg-white/15" />;
}

function ToolButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex size-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
        danger
          ? "text-[#ff6a5a] hover:bg-[#ff6a5a]/15"
          : "text-white/80 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon name={icon} className="size-4" />
    </button>
  );
}

function NavButton({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      aria-label={label}
      className={`absolute top-1/2 ${side === "left" ? "left-3" : "right-3"} flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 opacity-0 backdrop-blur-md transition hover:bg-black/60 hover:text-white focus-visible:opacity-100 [.viewer:hover_&]:opacity-100`}
    >
      <Icon name="chevronLeft" className={`size-4 ${side === "right" ? "rotate-180" : ""}`} />
    </button>
  );
}
