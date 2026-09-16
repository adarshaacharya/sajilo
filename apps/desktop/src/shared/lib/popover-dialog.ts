import { api } from "./ipc";

/**
 * Runs a native dialog from the popover without the popover vanishing under
 * it. The dialog takes focus, and the popover otherwise hides on focus-out;
 * pinning holds it open until the dialog is answered, then focus returns.
 */
export async function withPopoverPinned<T>(dialog: () => Promise<T>): Promise<T> {
  await api.pinPopover(true).catch(() => {});
  try {
    return await dialog();
  } finally {
    await api.pinPopover(false).catch(() => {});
  }
}
