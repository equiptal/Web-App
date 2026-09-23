---
description: Read and keep Yara's to-do list. The live board is a published artifact whose database is the source of truth; docs/todo.json and docs/TODO.md are the local copies. Show what is open, add what he sends in his own words, tick items off, and respect the priorities and notes he set himself.
---

# /todo · the list, kept

## Where the list lives

**The live board**, reachable from any device, phone included:

```
https://claude.ai/code/artifact/e8e07079-a0b6-423a-b820-7c9d6d1353c1
```

Its **database is the source of truth**. Read it and write it with the Artifact tool:

- read: `action: "read_db"`, that `url`, `db_op: "query"` (or `"list"`), `collection: "tasks"`
- write: `action: "write_db"`, same `url`, `db_op: "update"` (one task) or `"batch"` (several)
- a picture: `action: "upload_asset"` with the file, then put the returned id on the task as
  `images: [{ id: "<asset id>" }]`

One document per task in `tasks`:

```json
{
  "text": "Clicking on the bid doesn't take me directly where to the request",
  "rank": "P1",
  "labels": ["web"],
  "notes": "",
  "images": [{ "id": "b71269cc59b5fcfc37e29f8960de3344" }],
  "done": false,
  "doneAt": null,
  "order": 20
}
```

`rank` is what he typed in the box beside the task: `P1` to `P9`, or `null` for unranked. P1 is the
most urgent, and a band appears on the board for every rank he has used. `labels` are `web`, `app`,
`test` and nothing else. `order` sets the order inside a band, low first.

**The local copies**, for reading in the editor, for a readable git diff, and for when there is no
network:

| File | What it is |
|---|---|
| `docs/todo.json` | The local copy of the same list |
| `docs/TODO.md` | Generated from that JSON. **Never edit it**, it is overwritten |
| `docs/todo-images/` | The pictures, local copies |
| `scripts/todo-server.mjs` | The offline board: `node scripts/todo-server.mjs`, add `--lan` for the phone |
| `scripts/todo-lib.mjs` | `readList()`, `writeList()`, the markdown mirror. Use it, never re-parse by hand |

**They can drift**, because he edits the live board and the local files are a copy. So: read the
DATABASE when he asks what is on the list, and after any write to it, mirror the whole list into
`docs/todo.json` through `writeList()` in the same turn. If the two already disagree when you look,
say so and ask which one to keep; never overwrite the board from a stale local copy without asking.

## The rules, and they are hard

1. **His words, verbatim.** Copy a note as he wrote it into `text`. Do not tighten it, do not correct
   the spelling, do not translate it, do not turn a question into an instruction.
2. **Nothing he did not say.** No diagnosis, no file paths, no «ask him about this» inside a task.
   If one is too vague to act on, that question goes in the chat.
3. **Three labels only**: `web`, `app`, `test`.
4. **`rank` and `notes` are HIS.** Never set a rank, never change one he set, never write into
   `notes` unless he asks for something to go there. A new task arrives `rank: null`, `notes: ""`.
5. **A picture belongs to its task.** Never drop one, never move it to another task. A screenshot he
   sends is uploaded with `upload_asset` and its id appended to that task's `images`, and kept in
   `docs/todo-images/` as the local copy.
6. **Only what he gave.** Never seed the list from the change log, from an audit, or from something a
   session noticed. Those go in the chat. He decides what is on his list.
7. **Keep the ids.** A document id is how the board tracks a task; a new id makes a second task.

## What the argument means

### `/todo` with nothing after it

Read the database and report it in the chat: one count line, then each rank band in order, one line
per task with its labels. Do not print the done tasks unless asked.

### `/todo add <text>`

One document per note he sends, in his words, labelled, `rank: null`, `order` above the current
highest. Check for a near-duplicate first and say so rather than adding a second. Report back the
lines you wrote, nothing else.

### `/todo done <a word from the task>`

Set `done: true` and `doneAt` to today. Match on his words; if two tasks match, print both and ask
which. If the work happened in this session, say in one line what proved it. If nothing proved it,
say that plainly and ask whether it should stay open. Never tick a task you did not see finished.

### `/todo note <word> <text>`

Append his text to that task's `notes`, verbatim.

### `/todo drop <word>`

`db_op: "delete"` on that document. Print the task in full and **ask before writing**.

### `/todo edit <word> <text>`

Replace `text`. `rank`, `notes`, `labels`, `images` and `order` survive untouched.

### `/todo sync`

Read every task from the database and write the local copies through `writeList()`. Report how many
tasks, and name anything that differed.

### `/todo board`

Give him the artifact link. For the offline board, start `node scripts/todo-server.mjs --lan` and
give him both addresses.

## What this command does NOT do

- It does not do the work. `/todo done yard` records a finish, it does not perform one.
- It does not commit. The local files are left in the working tree like every other change.
- It does not rank. The P is his, always.
- It does not duplicate the change log. `CLAUDE.md` explains a finished change; this list is what is
  still owed, in his own handwriting.
