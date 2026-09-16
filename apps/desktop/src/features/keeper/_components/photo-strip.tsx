import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { api, type KeeperAttachment, type KeeperOwnerKind } from "../../../shared/lib/ipc";
import { withPopoverPinned } from "../../../shared/lib/popover-dialog";
import type { TFn } from "../_lib/shared";

/** Kept in step with `attachments::MAX_PER_OWNER`. */
const MAX_PHOTOS = 10;
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "heic"];
/** Fired by the viewer window after a delete or rotate, so strips refresh. */
export const PHOTOS_CHANGED = "keeper-photos-changed";

/** A 56px-tall tile as wide as the photo's shape asks, within reason. */
const tileWidth = (photo: KeeperAttachment) =>
  Math.round(Math.min(Math.max((56 * photo.width) / photo.height, 42), 100));

const isImagePath = (path: string) =>
  IMAGE_EXTENSIONS.includes(path.split(".").pop()?.toLowerCase() ?? "");

/**
 * The photos on one document or reminder, and the ways to add more: the
 * button, dropping files onto the window, or pasting a screenshot. Opening one
 * hands off to the viewer window — the popover is no place to read a passport.
 */
export function PhotoStrip({
  ownerKind,
  ownerId,
  t,
}: {
  ownerKind: KeeperOwnerKind;
  ownerId: string;
  t: TFn;
}) {
  const [photos, setPhotos] = useState<KeeperAttachment[]>([]);
  const [adding, setAdding] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const room = MAX_PHOTOS - photos.length - adding;

  const load = useCallback(
    () =>
      api
        .listKeeperAttachments(ownerKind, ownerId)
        .then((list) => setPhotos(list ?? []))
        .catch(() => {}),
    [ownerKind, ownerId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // The viewer is another window; it says when this owner's photos changed.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<{ ownerKind: string; ownerId: string }>(PHOTOS_CHANGED, (event) => {
          if (event.payload.ownerKind === ownerKind && event.payload.ownerId === ownerId) load();
        }),
      )
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, [ownerKind, ownerId, load]);

  const run = useCallback(
    async (count: number, task: () => Promise<unknown>) => {
      if (count === 0) return;
      setError("");
      setAdding((current) => current + count);
      try {
        await task();
      } catch (reason) {
        setError(typeof reason === "string" ? reason : t("keeper.photos.failed"));
      } finally {
        setAdding((current) => current - count);
        load();
      }
    },
    [load, t],
  );

  const addPaths = useCallback(
    (paths: string[]) => {
      const images = paths.filter(isImagePath).slice(0, Math.max(0, room));
      if (paths.length > 0 && images.length === 0) {
        setError(t("keeper.photos.not-image"));
        return;
      }
      run(images.length, () => api.addKeeperAttachmentsFromPaths(ownerKind, ownerId, images));
    },
    [ownerKind, ownerId, room, run, t],
  );

  const choose = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await withPopoverPinned(() =>
      open({
        multiple: true,
        directory: false,
        filters: [{ name: t("keeper.photos.title"), extensions: IMAGE_EXTENSIONS }],
      }),
    );
    if (picked) addPaths(Array.isArray(picked) ? picked : [picked]);
  };

  // Files dropped anywhere on the window land here while this strip is open.
  const addPathsRef = useRef(addPaths);
  addPathsRef.current = addPaths;
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((event) => {
          const { type } = event.payload;
          if (type === "enter" || type === "over") setDragging(true);
          else if (type === "leave") setDragging(false);
          else if (type === "drop") {
            setDragging(false);
            addPathsRef.current(event.payload.paths);
          }
        }),
      )
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  // ⌘V / Ctrl+V with an image on the clipboard — a screenshot, say.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null)
        .slice(0, Math.max(0, room));
      if (files.length === 0) return;
      event.preventDefault();
      run(files.length, async () => {
        for (const file of files) {
          await api.addKeeperAttachmentBytes(
            ownerKind,
            ownerId,
            new Uint8Array(await file.arrayBuffer()),
          );
        }
      });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [ownerKind, ownerId, room, run]);

  const remove = async (photo: KeeperAttachment) => {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    const ok = await withPopoverPinned(() =>
      ask(t("keeper.photos.delete-body"), {
        title: t("keeper.photos.delete-title"),
        kind: "warning",
      }),
    );
    if (!ok) return;
    await api.deleteKeeperAttachment(photo.id).catch(() => {});
    load();
  };

  const empty = photos.length === 0 && adding === 0;

  return (
    <div className="space-y-1.5">
      {empty ? (
        <button
          type="button"
          onClick={choose}
          className={`flex w-full items-center gap-2.5 rounded-lg border border-dashed px-2.5 py-2.5 text-left transition-colors ${
            dragging
              ? "border-[color:var(--color-accent-mark)] bg-[color:color-mix(in_srgb,var(--color-accent-mark)_10%,transparent)]"
              : "border-control-border hover:border-[color:color-mix(in_srgb,var(--color-accent-mark)_55%,transparent)] hover:bg-surface-hover"
          }`}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[7px] bg-[color:color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] text-accent-mark">
            <Icon name="plus" className="size-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-medium">
              {dragging ? t("keeper.photos.drop") : t("keeper.photos.add")}
            </span>
            <span className="block truncate text-[10px] text-text-muted">
              {t("keeper.photos.hint")}
            </span>
          </span>
        </button>
      ) : (
        <div className="space-y-1.5">
          {/* Same caption style as the details above it. */}
          <p className="text-[10px] text-text-muted">
            {t("keeper.photos.title")} · {photos.length}
          </p>
          <div
            className={`-m-1 flex flex-wrap gap-1.5 rounded-lg p-1 transition-colors ${
              dragging
                ? "bg-[color:color-mix(in_srgb,var(--color-accent-mark)_10%,transparent)] outline outline-1 outline-dashed outline-[color:var(--color-accent-mark)]"
                : ""
            }`}
          >
            {photos.map((photo, index) => (
              <div key={photo.id} className="group relative">
                <button
                  type="button"
                  onClick={() => api.openKeeperViewer(ownerKind, ownerId, index).catch(() => {})}
                  aria-label={t("keeper.photos.open").replace("{n}", String(index + 1))}
                  // Tiles follow the photo's shape, so a landscape ID card shows
                  // edge to edge instead of being cropped to a square.
                  style={{ width: tileWidth(photo) }}
                  className="block h-14 overflow-hidden rounded-[7px] border border-divider bg-surface-hover transition-transform duration-150 hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mark"
                >
                  <img
                    src={photo.thumbnail}
                    alt=""
                    draggable={false}
                    className="size-full object-cover"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => remove(photo)}
                  aria-label={t("keeper.photos.delete-title")}
                  className="absolute -top-1 -right-1 hidden size-4 items-center justify-center rounded-full border border-divider bg-[color:var(--color-surface)] text-[11px] leading-none text-holiday shadow-sm group-hover:flex focus-visible:flex"
                >
                  ×
                </button>
              </div>
            ))}
            {adding > 0 && (
              <span className="flex size-14 items-center justify-center rounded-[7px] border border-divider bg-surface-hover">
                <Icon name="refresh" className="size-3.5 animate-spin text-text-muted" />
              </span>
            )}
            {room > 0 && (
              <button
                type="button"
                onClick={choose}
                aria-label={t("keeper.photos.add")}
                className="flex size-14 items-center justify-center rounded-[7px] border border-dashed border-control-border text-accent-mark transition-colors hover:border-[color:var(--color-accent-mark)] hover:bg-[color:color-mix(in_srgb,var(--color-accent-mark)_8%,transparent)]"
              >
                <Icon name="plus" className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="px-0.5 text-[10px] text-holiday">{error}</p>}
    </div>
  );
}
