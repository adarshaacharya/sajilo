/** Links still lead somewhere.
 *
 * In the desktop app a headline opens in the system browser; in a browser tab
 * the equivalent is a new tab. Worth wiring rather than stubbing away: the
 * panel in the lightbox is usable, and a news list whose stories go nowhere
 * would be the one place the showcase stopped being the real thing. */
export const openUrl = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer");
  return Promise.resolve();
};

export const openPath = openUrl;
export const revealItemInDir = () => Promise.resolve();
