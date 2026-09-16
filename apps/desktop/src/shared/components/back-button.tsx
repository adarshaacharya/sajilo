import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { useSettings } from "../context/settings-context";
import { Icon } from "./icon";

/**
 * The one back control, sized the way a macOS toolbar draws it: a small
 * chevron with no plate at rest and only a faint translucent one under the
 * pointer. It used to borrow `.icon-btn`, whose 26px solid hover square read as
 * a web button parked in the title bar.
 */
export function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useSettings();

  return (
    <button type="button" onClick={onClick} aria-label={t("action.back")} className="back-btn">
      <Icon name="chevronLeft" className="size-3" />
    </button>
  );
}

/** Back from a pushed page (settings, weather, a date's details): return to
 * wherever it was opened from, or to Today when the app was launched straight
 * onto it and there is nothing behind it to return to. */
export function useGoBack() {
  const navigate = useNavigate();
  const { key } = useLocation();
  return useCallback(() => (key === "default" ? navigate("/") : navigate(-1)), [key, navigate]);
}
