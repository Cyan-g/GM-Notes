# Eldoria app

A local campaign wiki that replaces the Obsidian vault.

## Using it

1. Double-click **Eldoria.html**. It opens in Edge, Chrome or Brave. In Brave, first set `brave://flags/#file-system-access-api` to Enabled.
2. The first time, choose the **data** folder next to it. The browser remembers it; later it may ask you once per visit to allow access again.

### Editing

- **E** or the ✎ Edit button edits the open entry. **Esc** or **Done** goes back. **＋** in the top bar, "New …" in a menu or on a list creates an entry.
- Changes save by themselves about a second after you stop typing. The top bar shows the save status, and **Ctrl+S** saves right away.
- In the text, type `[[` to link to another entry. Paste or drop a picture to store it in `data/images`. 🔒 Secret wraps text that only the DM should see.
- Relations (memberships, family, home, ...) are edited on either entry and show up on both.
- Keep the app open in one tab only: two tabs would overwrite each other's saves.

Everything is saved in `data/`:

| Path | What |
| --- | --- |
| `data/eldoria.json` | the whole database |
| `data/images/`, `data/files/` | pictures and attached files (character sheets) |
| `data/backups/` | the previous version, kept at most every 10 minutes (last 40) |
| `data/migration-report.md` | what the last import from Obsidian couldn't convert |

### Backups

**💾** (Data & backups) at the right of the top bar has two tools:

- **Back up** copies the database, pictures and files into a folder you choose, for example on your PC. Each copy is a new folder named `Eldoria-backup-<date>`. The app remembers the folder, and the 💾 turns red when the last copy is more than a week old.
- **Earlier versions** lists the automatic backups in `data/backups`. **Go back to this** restores one, after saving the current state as a backup of its own, so a restore can be undone.

## Developing it

The source is in `app/` (Vue 3 + TypeScript + Vite). Node is only needed for development, not for using the app.

The folder is a git repository for the app's code and `Eldoria.html`. `data/` is ignored: the campaign data is protected by the backups above, not by git. The stick is FAT32, which doesn't record file owners, so on another PC (or under another drive letter) git refuses with "dubious ownership" until you run `git config --global --add safe.directory <path>`, for example `D:/Worlds/Eldoria-App`.

```bash
cd app
npm install
npm run dev        # http://localhost:5199, reads ../data; add ?write to the address to also save
npm run build      # type-checks and writes ../Eldoria.html
npm run migrate    # re-imports the Obsidian vault (../../Eldoria) into ../data/eldoria.json
```

The switch from Obsidian happened on 2026-11-15. The vault was archived as `the old vault backup`, and from then on the app is the only place to edit. **Don't run the migration again.**

`npm run migrate` overwrites `data/eldoria.json` and never changes the vault itself. Once anything has been edited in the app, it refuses to run, because it would throw those edits away. `npm run migrate -- --force` runs it anyway, after saving the current file as `data/backups/before-migrate-<time>.json`.
