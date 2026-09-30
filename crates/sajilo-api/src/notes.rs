//! Notes, as the Notes tab reads them. Ids are permanent: renaming or moving a
//! note or folder never changes one. Times are RFC 3339, UTC.

dto! {
    /// A folder, with how many notes (not in the Trash) it holds.
    pub struct NoteFolder {
        pub id: String,
        pub name: String,
        /// `daily` for the folder the day's notes go in, `user` otherwise.
        pub role: String,
        pub count: u32,
    }

    /// A note as the list shows it.
    pub struct NoteSummary {
        pub id: String,
        pub folder_id: String,
        /// The first line, plain. Empty for a note with nothing in it yet.
        pub title: String,
        pub preview: String,
        pub tags: Vec<String>,
        pub open_tasks: u32,
        pub done_tasks: u32,
        pub pinned: bool,
        pub created_at: String,
        pub updated_at: String,
        /// Which heading the list files it under (`today`, `yesterday`,
        /// `week`, or `2083-05` for a BS month), and that heading's words.
        pub group: String,
        pub group_label: String,
    }

    /// Everything the Notes tab's list needs, newest first, pinned on top.
    pub struct NotesList {
        pub folders: Vec<NoteFolder>,
        pub notes: Vec<NoteSummary>,
        /// The note open when Notes was last left, to open it again.
        pub last_open: Option<String>,
        /// How many notes are in the Trash.
        pub trash_count: u32,
    }

    /// A note in the Trash, most recently deleted first.
    pub struct NoteTrashed {
        pub id: String,
        pub title: String,
        pub preview: String,
        pub deleted_at: String,
        /// Days until it's deleted for good.
        pub days_left: u32,
    }

    /// One note, to edit.
    pub struct NoteDocument {
        pub id: String,
        pub folder_id: String,
        /// The note itself, in Markdown.
        pub body: String,
        /// Goes up with every save; a save must name the revision it edited.
        pub revision: u32,
        /// Where the cursor was, in characters from the start.
        pub cursor: Option<u32>,
        /// Notes that link here with `[[this note]]`.
        pub linked_from: Vec<NoteBacklink>,
    }

    pub struct NoteBacklink {
        pub id: String,
        pub title: String,
        /// The line that holds the link, plain.
        pub line: String,
    }

    /// What a save changed.
    pub struct NoteSaved {
        pub id: String,
        pub revision: u32,
        pub title: String,
    }

    /// A search result, with the words that matched marked.
    pub struct NoteSearchHit {
        pub id: String,
        pub folder_id: String,
        pub title: Vec<NoteTextPart>,
        pub snippet: Vec<NoteTextPart>,
    }

    pub struct NoteTextPart {
        pub text: String,
        pub hit: bool,
    }
}
