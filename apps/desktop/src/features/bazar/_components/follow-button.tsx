import { Icon } from "../../../shared/components/icon";

export function FollowButton({ followed, onToggle }: { followed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`shrink-0 p-1 ${followed ? "text-[color:var(--color-accent-mark)]" : "text-text-muted"}`}
      aria-label={followed ? "Unfollow" : "Follow"}
    >
      {followed ? (
        <Icon name="starFill" className="size-3.5" />
      ) : (
        <Icon name="star" className="size-3.5" />
      )}
    </button>
  );
}
