# DnDesk

A local campaign wiki and toolkit for D&D: the world, its people, the campaign, characters, spells and crafting. Here it holds the world of Eldoria.

## Using it

DnDesk is a desktop app for Windows and macOS. It's installed once and keeps the world in a database in a `data` folder you choose.

- **First start:** choose the data folder in a normal folder dialog, or the folder that holds it. The app remembers it; ⚙ → Data & backups shows where it is and can change it.
  - **A folder with no world yet:** the app offers to start a new one, as a player would.
  - **A folder from before the database:** one with `eldoria.json` is converted once, by itself and checked, and the old JSON files stay where they are.
- **Windows:** the installer (`DnDesk-Setup-<version>.exe`) installs for your user only and updates itself. When a new version is downloaded, a bar offers *Restart and update*.
- **macOS:** the app isn't signed with an Apple Developer ID, so the first time, right-click it and choose *Open*. It can't install updates itself; a bar says when a new version is out, with a download link.
- **Only one copy runs at a time.** Starting it again brings the open window forward.

### Editing

- **E** or the ✎ Edit button edits the open entry. **Esc** or **Done** goes back. **＋** in the top bar, "New …" in a menu or on a list creates an entry.
- Changes save by themselves about a second after you stop typing. The top bar shows the save status, and **Ctrl+S** saves right away.
- In the text, type `[[` to link to another entry. Paste or drop a picture to store it in `data/images`. 🔒 Secret wraps text that only the DM should see.
- Relations (memberships, family, home, ...) are edited on either entry and show up on both.
- **Dropdowns** (an item's kind, a spell's school, …) pick from lists kept in the world. **Archive → Lists** (DM mode) shows them all: rename, reorder, add and remove options.
  - Entries point at an option rather than copying its name, so renaming it renames it everywhere.
  - An option that's in use can't be removed; the page shows which entries use it.
  - Options marked 🔒 are the ones the app relies on (an item being a Weapon, a spell needing a Saving throw, …). They can be renamed but not removed.
- **🕘** on an entry's page shows its earlier versions and can go back to one. A version is kept each time the entry changes, at most every 10 minutes, and the last 40 are kept. Going back keeps the version it replaces, so it can be undone.

### DM mode and player mode

**⚙ → DM mode** switches what the app shows. The setting is saved with the world. Nothing is deleted when you switch.

- **DM mode** (your Eldoria) shows everything.
- **Player mode** is for a player's own copy.
  - The menus are Character, Campaign (the campaigns, with their session notes), World (Atlas, Timeline, Calendar, places and events), Spells and Crafting. People, the Archive, Initiative and encounters are hidden.
  - The home page shows the characters, the campaign, the tools, favourites, the regions and links, but not the deities and races.
  - New entries can be characters, campaigns, sessions, places, events, spells and items.
  - DM-only text is never shown.

To set up a player:
1. They install DnDesk and choose an empty folder as the data folder.
2. The app offers **Start a new world here**, which starts in player mode.
3. They import the world (⚙ → Export the world…) or the entries you send them; importing a newer file later updates their copy.

### Character sheet

A player character's page is its character sheet, filled in right on the page.

- **What you fill in:** level and ability scores. Each ability has a card with its saving throw and the skills that use it; click a save to mark proficiency, and click a skill to cycle it: proficient, then expertise, then none.
- **Hit points:** current, max and temporary HP. Type `-7` or `+5` in *Damage / heal* to apply it; temporary HP soak up damage first. **Long rest** restores HP and gives back half your hit dice.
- **Inventory:** items from the world with a quantity, plus anything else by name. Clicking an item opens its card in a pop-up, where it can also be equipped or attuned. Only items marked *Requires attunement* can be attuned.
- **Equipped card** (beside the sheet, in place of the relation cards): the worn armor and wielded weapons, and the three attunement slots. What's equipped or attuned is shown there and not in the inventory.
- **Drag and drop:** drag an item from the inventory onto *Equipped* to wear or wield it. A ring or other magical item is attuned instead. Drag it onto the attunement slots to attune it, and back to the inventory to take it off.
- **Player mode:** the inventory sits beside the sheet under *Equipped*, where *Mentioned in* is in DM mode. Weapons and armor can be equipped, and magic items attuned.
- **Proficiencies:** picked from the same lists the items use:
  - armor: Light, Medium, Heavy, Shield
  - weapons: Simple, Martial, or single base weapons such as Rapier
  - tools: the Tool items in the world
  - languages, plus a line for anything else
- **Also:** money, speed, inspiration and features.
- **Worked out for you:**
  - modifiers and the proficiency bonus (from the level)
  - saves, skills and passive Perception
  - armor class from the equipped armor and shield, e.g. "14 + dex(max 2)", or 10 + DEX without armor. A number typed under AC overrides it.
  - an attack line for each equipped weapon: finesse weapons use the better of STR and DEX, ranged weapons DEX, and a "+1" in the item's Bonus field counts. The proficiency bonus is added only if the character is proficient with the weapon; ⚠ marks one they aren't
  - ⚠ on the AC and in *Equipped* for armor or a shield worn without the proficiency for it
  - the spell save DC and attack bonus, from the class's casting ability unless you pick another
- **In a fight:** the initiative tracker takes the PC's AC, HP and initiative from the sheet.

**How items match proficiencies.** Each item says what it needs:
- **A weapon:** its *Weapon category* (Simple or Martial) and its *Base weapon* (Rapier). A standard base weapon also tells the category. A weapon with neither, such as a wand, needs no proficiency.
- **Armor:** its *Armor type*. Clothing needs no proficiency.
- **A tool:** an item of the kind Tool *is* the tool. A recipe's *Crafted with* links to one, and the Workbench checks the character is proficient with it.

**The current character.** "☆ Make current character" at the top of a sheet makes that character the one the other tools are about:

- **Spellbook:** shows the character's own spellbook: spells, slots and prepared spells. The spell attack and save DC come from their sheet once its scores and casting ability are filled in; until then they're typed in.
- **Workbench:** uses the character's recipes and the tool proficiencies from their sheet (changing them on the Workbench changes the sheet). The ingredient pouch is the ingredients in their inventory, which the sheet lists separately as *Ingredient pouch*. Crafting takes the ingredients out of the inventory and puts the result in.
- **Character menu** (player mode): clicking it opens the current character's sheet, and the menu marks them with ★.

With no current character, the Spellbook and Workbench use the world's own; the Spellbook then takes typed numbers.

### Sharing entries and the world

An entry, or the whole world, can be sent to someone else who has this app, and sent again later to bring their copy up to date.

- **⇩ Export** on an entry's page saves it as `<name>.dndesk.json`, with everything it points at, and what those point at in turn: *Located in*, race, recipes and their tools, a scroll's spell, shop stock, map pins, a character's inventory, spellbook, recipes and tools. Tick *Also what its text links to* to follow the `[[links]]` in the text too.
- **⚙ → Export the world…** saves every entry, the connections between them, every dropdown list, the calendar and today's date.
- **Never exported:** campaigns, sessions, encounters and creatures stay with the DM.
- **DM-only text** is left out unless you tick *Include the DM-only parts of the text*. **Hidden entries** (not known to the players) go along unless you untick *Include entries hidden from the players*; their connections stay out with them.
- **Choosing types:** the *Take along* chips leave whole types out.
- **Links to what stays home** stay links, so they work wherever that entry exists (the other side has it, or it came in earlier); elsewhere a link becomes plain words and a field leaves it out. A field that loses something on import keeps your own value. A hidden entry left out is never linked in the file (a link to it keeps only its words).
- **⚙ → Import from a file…** (top right) brings one in and shows what's new, what's updated and what's already the same.
  - **Updating:** an entry you already have is updated. It counts as the same entry if it has the same id (it came from the same world, even if it was renamed since), or else the same type and name. Untick an updated one to keep yours.
  - **DM-only text:** a file without DM-only text never wipes out DM-only text you have.
  - **Connections:** they're matched by their two ends and kind, then added or updated.
  - **Dropdown lists:** choices are matched to your options by id, then by name; one you don't have is added. A world's file also carries over renamed options.
  - **Calendar:** a world's file can update the calendar and today's date (a tick box).

Everything is saved in `data/`:

| Path | What |
| --- | --- |
| `data/dndesk.sqlite` | the world: every entry, relation and setting, the play state, and earlier versions of changed and deleted entries |
| `data/images/`, `data/files/` | pictures and attached files (character sheets) |
| `data/backups/` | copies of the database (`dndesk-<date>.sqlite`): one at most every 10 minutes while you edit, thinned out over time (see below) |

### Backups

**⚙ → Data & backups** (top right) has two tools:

- **Back up** copies the database (with SQLite's own safe copy), pictures and files into a folder you choose, for example on your PC. Each copy is a new folder named `DnDesk-backup-<date>`. The app remembers the folder, and the ⚙ gets a dot when the last copy is more than a week old.
- **Earlier versions** lists the automatic backups in `data/backups`. **Go back to this** restores one, after saving the current database as `before-restore-<date>.sqlite`, so a restore can be undone.
- **Deleted entries** lists every deleted entry the database still remembers. **Bring back** restores it; its relations have to be added again.

The automatic backups keep everything from the last 2 hours, then the newest of each hour for 2 days, of each day for 2 months, and of each month for good. Only files named `dndesk-<date>.sqlite` are ever deleted; anything else in that folder stays.

### Data check

Every time the data is opened, the app checks it against what it expects:
- each entry's fields are ones its type has, with values of the right kind
- links in fields point at existing entries of the right type
- relations connect entries that exist
- favourites and the current character exist

The check never changes anything. **⚙ → Data & backups → Data check** lists what it found, with links to the entries. A bar under the menu appears only for serious problems.

Imported files are checked too. A damaged file is refused, and fields the app doesn't know or values of the wrong kind are left out.

### Safety while saving

- **Only what changed is written, as one transaction.** A save either lands completely or not at all, so a crash, a full disk or a pulled stick never leaves half a world.
- **The database enforces the basics itself:**
  - every entry has a known type, an id and a name
  - its fields are a JSON object
  - relations only connect existing entries, with a known kind
  - deleting an entry deletes its relations

  A bug that tries to write anything else is refused.
- **Changes made elsewhere aren't overwritten.** Each save checks that nothing else saved since the app loaded. If something did, saving stops and the bar offers *Reload* (take the other version) or *Overwrite* (keep this window's; the database is backed up first).
- **Mass deletions aren't saved.** If more than 10 entries would vanish in one save (deleting in the app goes one at a time), the save is refused with a message.
- **Newer data stays safe from an older app.** Data saved by a newer version opens read-only. Data from before data version 20 (early test versions) isn't opened or restored.

## Developing it

The source is in `app/` (Vue 3 + TypeScript + Vite). Node is only needed for development, not for using the app.

The folder is a git repository for the app's code. `data/` is ignored: the campaign data is protected by the backups above, not by git. The stick is FAT32, which doesn't record file owners, so on another PC (or under another drive letter) git refuses with "dubious ownership" until you run `git config --global --add safe.directory <path>`, for example `D:/Worlds/DnDesk`.

```bash
cd app
npm install
npm run dev        # the pages in a browser at http://localhost:5199, on ../data/dndesk.sqlite; add ?write to save
npm run build      # type-checks and builds the pages into dist/ (what the desktop app shows)
```

`app/src/model/schema.ts` describes every entry type and its fields. Forms, pages, the data check (`validate.ts`) and the field types all come from it:
- **Field types:** `EntryFields` gives each field key the type its kind stores, so `e.fields.recipe` is a `RecipeLine[]` and a misspelled key doesn't compile.
- **Keys only known at runtime** (a table column, a form field) go through `byKey(e.fields)`.
- **Adding a field:** adding it to the schema is enough.

### The desktop app

`app/electron/` holds the desktop shell:
- **`main.cjs`** owns the window, the data folder (remembered in the app's settings), the database, safe file writing for pictures, and updates.
- **`db.cjs`** is the database: the tables, saving changes as transactions, history, copies, and converting the old JSON files. It runs on the SQLite built into the app's Node (`node:sqlite`), so there's nothing to compile per platform. The dev server uses the same file.
- **`preload.cjs`** is the only bridge the pages get: a few named calls, no Node.
- **On the pages' side,** `src/storage/backend.ts` reaches the database and `src/storage/desktop.ts` the pictures and files, each with a desktop and a dev-server version.

```bash
cd app
npm run desktop    # build the pages and open them in the desktop app
npm run dist       # Windows installer, into %LOCALAPPDATA%\DnDesk-build
```

Building onto the USB stick fails: it's FAT32, which stores file times in 2-second steps, and the packager's lock file needs finer ones. So `npm run dist` builds on the local disk.

**Releasing a version:**
1. Raise `version` in `app/package.json`.
2. Commit, then tag the commit, e.g. `v0.2.0`.
3. Push the commit and the tag.

`.github/workflows/release.yml` then:
1. creates a draft release for the tag;
2. builds the Windows installer and the Mac `.dmg`/`.zip` on GitHub's machines, each uploading into the draft;
3. publishes the release once both are done. That's where the apps look for updates.

A tag's run uses the workflow as it was in that commit, so a fix to the workflow needs a new version and tag.

While the repository is private, the apps can't see its releases, so update checks quietly find nothing. That changes once it's public.


Changes to the data's shape happen in `upgrade()` in `app/src/store.ts`: each step raises `version`, and runs once when the app opens older data. `DATA_VERSION` at the top must match the last step.
