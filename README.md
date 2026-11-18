# DnDesk

A local campaign wiki for D&D, here holding the world of Eldoria. It replaced the Obsidian vault.

The data files keep their names (`data/eldoria.json`, `eldoria-…` backups): they belong to the world, not the app.

## Using it

1. Double-click **DnDesk.html**. It opens in Edge, Chrome or Brave. In Brave, first set `brave://flags/#file-system-access-api` to Enabled.
2. The first time, choose the folder it is in (`DnDesk`) or the **data** folder inside it. The browser remembers it; later it may ask you once per visit to allow access again.

### Editing

- **E** or the ✎ Edit button edits the open entry. **Esc** or **Done** goes back. **＋** in the top bar, "New …" in a menu or on a list creates an entry.
- Changes save by themselves about a second after you stop typing. The top bar shows the save status, and **Ctrl+S** saves right away.
- In the text, type `[[` to link to another entry. Paste or drop a picture to store it in `data/images`. 🔒 Secret wraps text that only the DM should see.
- Relations (memberships, family, home, ...) are edited on either entry and show up on both.
- Keep the app open in one tab only: two tabs would overwrite each other's saves.

### DM mode and player mode

**⚙ → DM mode** switches what the app shows. The setting is saved with the world. Nothing is deleted when you switch.

- **DM mode** (your Eldoria) shows everything.
- **Player mode** is for a player's own copy.
  - The menus are Character, Campaign (the campaigns, with their session notes), World (Atlas, Timeline, Calendar, places and events), Spells and Crafting. People, the Archive, Initiative and encounters are hidden.
  - The home page shows the characters, the campaign, the tools, favourites, the regions and links, but not the deities and races.
  - New entries can be characters, campaigns, sessions, places, events, spells and items.
  - DM-only text is never shown.

To set up a player: give them `DnDesk.html` in a folder of its own. They open it and choose that folder. Because there's no world in it yet, the app offers **Start a new world here**. That creates the `data` folder and starts in player mode. Then they import the spells, items and maps you send them.

### Character sheet

A player character's page is its character sheet, filled in right on the page.

- **What you fill in:** level, ability scores, proficient saves, and skills. Click a skill to cycle it: proficient, then expertise, then none.
- **Hit points:** current, max and temporary HP. Type `-7` or `+5` in *Damage / heal* to apply it; temporary HP soak up damage first. **Long rest** restores HP and gives back half your hit dice.
- **Inventory:** items from the world with a quantity, plus anything else by name. Weapons and armor can be equipped, and magic items attuned.
- **Also:** money, speed, inspiration, proficiencies and languages, and features.
- **Worked out for you:**
  - modifiers and the proficiency bonus (from the level)
  - saves, skills and passive Perception
  - armor class from the equipped armor and shield, e.g. "14 + dex(max 2)", or 10 + DEX without armor. A number typed under AC overrides it.
  - an attack line for each equipped weapon: finesse weapons use the better of STR and DEX, ranged weapons DEX, and a "+1" in the item's Bonus field counts
  - the spell save DC and attack bonus, from the class's casting ability unless you pick another
- **In a fight:** the initiative tracker takes the PC's AC, HP and initiative from the sheet.
- **The Spellbook** takes its spell attack and save DC from the character picked at the top (in a world with one character, that one). With no character picked, you type them in.

### Sharing entries

Spells, items and maps can be sent to someone else who has this app.

- **⇩ Export** on a spell's, item's or map's page saves it as `<name>.dndesk.json`.
  - **Spells and items** bring along what they need to work: a recipe's ingredients (and the ingredients of those), a scroll's spell, and any spells linked in an item's text. Other links in the text become plain words. DM-only text is left out unless you tick the box.
  - **Maps** are a place with only its name and map picture: no text, no pins, and no *Located in*.
- **⚙ → Import from a file…** (top right) brings one in.
  - If you already have an entry with the same type and name, you choose to keep yours or replace it. Replacing a map only swaps the picture; your text and pins stay.
  - Ingredients and spells you already have are reused as they are.
- Relations never travel.

Everything is saved in `data/`:

| Path | What |
| --- | --- |
| `data/eldoria.json` | the world: every entry, relation and setting |
| `data/session.json` | what changes during play: the initiative tracker, the spellbook and the crafting pouch (kept apart so a click in a fight doesn't rewrite the world) |
| `data/images/`, `data/files/` | pictures and attached files (character sheets) |
| `data/backups/` | earlier versions of both files (`eldoria-…`, `session-…`): one at most every 10 minutes, and only when that file changed, thinned out over time (see below) |
| `data/migration-report.md` | what the last import from Obsidian couldn't convert |

### Backups

**⚙ → Data & backups** (top right) has two tools:

- **Back up** copies the database, pictures and files into a folder you choose, for example on your PC. Each copy is a new folder named `DnDesk-backup-<date>`. The app remembers the folder, and the ⚙ gets a dot when the last copy is more than a week old.
- **Earlier versions** lists the automatic backups in `data/backups`. **Go back to this** restores one, after saving the current state as a backup of its own, so a restore can be undone.

The automatic backups keep everything from the last 2 hours, then the newest of each hour for 2 days, of each day for 2 months, and of each month for good. Only files named `eldoria-<date>.json` or `session-<date>.json` are ever deleted; anything else in that folder (like `before-migrate-…`) stays.

### Safety while saving

- **One tab edits.** The first tab to open the data edits it; any other tab opens read-only and says so in a bar under the menu.
- **Changes made elsewhere aren't overwritten.** Before each save the app checks that `eldoria.json` and `session.json` are still the files it loaded. If something else changed it, saving stops and the bar offers *Reload* (take the other version) or *Overwrite* (keep this tab's; the other version goes to the backups first).
- **Damaged data isn't saved.** If more than 10 entries would vanish in one save (deleting in the app goes one at a time), or the result wouldn't read back, the save is refused with a message, and *Reload* brings back the last saved state.
- **Newer data stays safe from older app files.** If the data was saved by a newer `DnDesk.html` than the one open, it opens read-only.

## Developing it

The source is in `app/` (Vue 3 + TypeScript + Vite). Node is only needed for development, not for using the app.

The folder is a git repository for the app's code and `DnDesk.html`. `data/` is ignored: the campaign data is protected by the backups above, not by git. The stick is FAT32, which doesn't record file owners, so on another PC (or under another drive letter) git refuses with "dubious ownership" until you run `git config --global --add safe.directory <path>`, for example `D:/Worlds/DnDesk`.

```bash
cd app
npm install
npm run dev        # http://localhost:5199, reads ../data; add ?write to the address to also save
npm run build      # type-checks and writes ../DnDesk.html
```

The switch from Obsidian happened on 2026-11-15. The vault was archived as `the old vault backup`, and from then on the app is the only place to edit. The import script was removed afterwards (it's in the git history, `app/scripts/migrate.mjs`), so nothing can overwrite the data with the old vault any more.

Changes to the data's shape happen in `upgrade()` in `app/src/store.ts`: each step raises `version`, and runs once when the app opens older data. `DATA_VERSION` at the top must match the last step.
