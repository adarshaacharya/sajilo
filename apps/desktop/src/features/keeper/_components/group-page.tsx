import { Icon } from "../../../shared/components/icon";
import {
  api,
  type KeeperAttachmentSummary,
  type KeeperPerson,
  type KeeperRecord,
} from "../../../shared/lib/ipc";
import { personName, recordName, recordSummary } from "../_lib/documents";
import { daysUntil, type TFn } from "../_lib/shared";
import { PhotoBadge, usePhotoSummaries } from "./photo-strip";
import { RecordDue } from "./record-detail";
import { DueTile, LetterTile } from "./rows";

/** Every copy of one kind of paper — each citizenship in the family — led by
 * whose it is, since that is what tells them apart. */
export function GroupPage({
  name,
  records,
  people,
  onOpen,
  onAddAnother,
  t,
}: {
  name: string;
  records: readonly KeeperRecord[];
  people: readonly KeeperPerson[];
  onOpen: (id: string) => void;
  onAddAnother: () => void;
  t: TFn;
}) {
  const photos = usePhotoSummaries("record");
  return (
    <div className="space-y-2.5">
      <section className="surface-card px-3">
        {records.map((record) => {
          // Insurance and warranties vary within the kind (life vs vehicle,
          // fridge vs phone), so their own name joins the detail line.
          const own = recordName(t, record);
          const detail = [own !== name ? own : null, recordSummary(record)]
            .filter(Boolean)
            .join(" · ");
          return (
            <div
              key={record.id}
              className="flex items-center gap-2.5 border-b border-divider py-2.5 last:border-0"
            >
              <button
                type="button"
                onClick={() => onOpen(record.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                {record.expiryDate ? (
                  <DueTile date={record.expiryDate} days={daysUntil(record.expiryDate.ad)} />
                ) : (
                  <LetterTile text={personName(t, people, record.personId)} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">
                    {personName(t, people, record.personId)}
                  </span>
                  {detail && (
                    <span className="mt-0.5 block truncate text-[10px] text-text-muted">
                      {detail}
                    </span>
                  )}
                </span>
                {record.links.length > 0 && (
                  <Icon name="link" className="size-3 shrink-0 text-text-muted" />
                )}
                <RecordDue record={record} t={t} />
              </button>
              {photos.get(record.id) && (
                <PhotoBadge
                  summary={photos.get(record.id) as KeeperAttachmentSummary}
                  onOpen={() => api.openKeeperViewer("record", record.id, 0).catch(() => {})}
                  t={t}
                />
              )}
            </div>
          );
        })}
      </section>
      <button
        type="button"
        onClick={onAddAnother}
        className="flex items-center gap-1 px-0.5 text-[10px] font-medium text-accent-mark hover:underline"
      >
        <Icon name="plus" className="size-2.5" />
        {t("keeper.add-another").replace("{type}", name)}
      </button>
    </div>
  );
}
