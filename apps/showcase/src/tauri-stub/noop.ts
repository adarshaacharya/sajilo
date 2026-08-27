/** Every Tauri plugin the app imports, reduced to nothing.
 *
 * The showcase runs the real UI in a plain browser tab, where none of these
 * exist. A missing export would be a hard module error, so the proxy answers
 * any name with a function that resolves to undefined. */
const nothing = () => Promise.resolve(undefined);

export const open = nothing;
export const enable = nothing;
export const disable = nothing;
export const isEnabled = () => Promise.resolve(false);
export const check = () => Promise.resolve(null);
export const relaunch = nothing;
export const exit = nothing;
export const save = nothing;
export const message = nothing;
export const confirm = () => Promise.resolve(false);
export const requestPermission = () => Promise.resolve("denied");
export const isPermissionGranted = () => Promise.resolve(false);
export const sendNotification = nothing;
export const readTextFile = nothing;
export const writeTextFile = nothing;

export default {};
