/** The tray never emits into the showcase, so listening is a no-op that hands
 * back a well-behaved unlisten function. */
export const listen = () => Promise.resolve(() => {});
export const emit = () => Promise.resolve();
export const once = () => Promise.resolve(() => {});
