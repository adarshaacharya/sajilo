/**
 * How much text each kind of field takes, in characters. The same numbers as
 * `sajilo_core::limits`, which the save commands enforce (a Rust test keeps
 * the two equal); here they stop typing at the limit, via `maxLength`.
 */
export const LIMITS = {
  TITLE: 120,
  NAME: 80,
  SHORT: 120,
  NOTE: 2000,
  URL: 500,
  CHECKLIST_ITEM: 120,
  CHECKLIST_ITEMS: 50,
  FIELD_LABEL: 60,
  FIELD_VALUE: 500,
  FIELDS: 30,
  SEARCH: 100,
  NOTE_BODY: 100000,
  FOLDER: 60,
} as const;
