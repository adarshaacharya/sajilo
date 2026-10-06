/** The Directory tool's list: the numbers and official sites people in Nepal
 * go looking for. The data is the `directory` config pack
 * (`data/config/directory.json`); screens read it with `useDirectory()`,
 * and the landing page reads the bundled copy from here. */

import bundled from "../../../../../../data/config/directory.json";
import type { Contact } from "../../../types/api/Contact";
import type { ContactCategory } from "../../../types/api/ContactCategory";
import type { Website } from "../../../types/api/Website";
import type { WebsiteType as GeneratedWebsiteType } from "../../../types/api/WebsiteType";

export type Category = ContactCategory;
export type DirectorySection = "phones" | "websites";
export type WebsiteType = GeneratedWebsiteType;
export type { Contact, Website };

/* Read straight from the JSON, not through `shared/lib/directory`: the
 * landing page imports this file and must not pull in the Tauri bridge. */
export const CONTACTS = bundled.contacts as readonly Contact[];
export const WEBSITES = bundled.websites as readonly Website[];
