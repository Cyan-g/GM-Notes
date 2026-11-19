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
- **Menus:** the top menus link pages and tables only, never single entries (those are reached from their tables, search and links; the one shortcut is Campaign › *Latest session*). Types open their dashboard table where there is one (NPCs, characters, organizations, spells, items), else their list. Each table is in one menu: Spells has All spells, Cantrips and Leveled spells; Crafting has Recipes, Ingredients, Potions & poisons and Scrolls; Archive has Weapons, Armor, Tools and Other items.
- Changes save by themselves about a second after you stop typing. The top bar shows the save status, and **Ctrl+S** saves right away.
- In the text, type `[[` to link to another entry. Paste or drop a picture to store it in `data/images`. 🔒 Secret wraps text that only the DM should see.
- Relations (memberships, family, home, ...) are edited on either entry and show up on both.
- **Dropdowns** (an item's kind, a spell's school, …) pick from lists kept in the world. **Archive → Lists** (DM mode) shows them all: rename, reorder, add and remove options. Weapon properties and ingredient properties are lists too, and their options can have a description (a property's rule): it pops up when you hover the property. A weapon's or ingredient's properties are picked from a dropdown.
  - Entries point at an option rather than copying its name, so renaming it renames it everywhere.
  - An option that's in use can't be removed; the page shows which entries use it.
  - Options marked 🔒 are the ones the app relies on (an item being a Weapon, a spell needing a Saving throw, …). They can be renamed but not removed.
- **🕘** on an entry's page shows its earlier versions and can go back to one. A version is kept each time the entry changes, at most every 10 minutes, and the last 40 are kept. Going back keeps the version it replaces, so it can be undone.

### DM mode and player mode

**⚙ → DM mode** switches what the app shows. The setting is saved with the world. Nothing is deleted when you switch.

- **DM mode** (your Eldoria) shows everything.
- **Player mode** is for a player's own copy.
  - The menus are Character, Campaign (the campaigns, with their session notes) and World (Atlas, Timeline, Calendar, places and events). The spellbook and workbench are tabs on the character's page instead of the Spells and Crafting menus. People, the Archive, Combat and encounters are hidden. New entries can also be notes.
  - The home page shows the characters, the campaign, the tools, favourites, the regions and links, but not the deities and races.
  - New entries can be characters, campaigns, sessions, places, events, spells and items.
  - DM-only text is never shown.

To set up a player:
1. They install DnDesk and choose an empty folder as the data folder.
2. The app offers **Start a new world here**, which starts in player mode. The new world already has every dropdown list, the standard calendar, the races, subclasses, spells, feats and Tool items (see *The starting world* below).
3. They import the world (⚙ → Export the world…) or the entries you send them; importing a newer file later updates their copy.

### Character sheet

A player character's page is its character sheet for play: HP, hit dice, inspiration and the inventory change there. The character is built on its **✎ Edit** page, which shows the whole sheet with everything else editable (the text editor isn't there: the character's notes are written in the *Notes* box at the bottom of its page, with ✎ Write).

- **Classes (multiclassing):** on the Edit page, *＋ Class* adds a class from the Classes list, each with its own level and, if there are Subclass entries for it, a subclass. The character's level is the sum; a character without a class has a plain level instead. The icon follows the highest level class: a game-icons.net picture in the text colour (battle-axe for Barbarian, lyre for Bard, holy symbol for Cleric, oak leaf for Druid, crossed swords for Fighter, fist for Monk, templar shield for Paladin, bow for Ranger, cloak and dagger for Rogue, magic swirl for Sorcerer, eye for Warlock, spell book for Wizard, tinker for Artificer; see Credits). Without a class, or with a homebrew one, it stays 🛡️.
- **What you fill in:** the classes and ability scores. Each ability has a card with its saving throw and the skills that use it; click a save to mark proficiency, and click a skill to cycle it: proficient, then expertise, then none.
- **Hit points:** current, max and temporary HP. Type `-7` or `+5` in *Damage / heal* to apply it; temporary HP soak up damage first.
- **Hit dice:** each class brings its die (d12 Barbarian; d10 Fighter, Paladin, Ranger; d6 Sorcerer, Wizard; d8 the others, and a homebrew class picks one). The sheet has a row per die size, each spent on its own. **Long rest** restores HP and gives back half the level in hit dice, biggest dice first.
- **Inventory:** items from the world with a quantity, plus anything else by name. Clicking an item opens its card in a pop-up, where it can also be equipped or attuned. Only items marked *Requires attunement* can be attuned.
- **Equipped card** (beside the sheet, in place of the relation cards): the worn armor and wielded weapons, and the three attunement slots. What's equipped or attuned is shown there and not in the inventory.
- **Drag and drop:** drag an item from the inventory onto *Equipped* to wear or wield it (weapons, armor, and anything else with effects, such as boots or a cloak). An item that requires attunement is attuned instead. Drag it onto the attunement slots to attune it, and back to the inventory to take it off.
- **Equipped and inventory:** under the sheet, *Equipped* (what is worn and wielded, the attunement slots and the active gear) sits beside the inventory, half and half; in DM and player mode alike.
- **Proficiencies:** picked from the same lists the items use:
  - armor: Light, Medium, Heavy, Shield
  - weapons: Simple, Martial, or single base weapons such as Rapier
  - tools: the Tool items in the world
  - languages, plus a line for anything else
- **Also:** money, speed, inspiration and features.
- **Worked out for you:**
  - modifiers and the proficiency bonus (from the level)
  - saves, skills and passive Perception
  - armor class from the equipped armor and shield, e.g. "14 + dex(max 2)", or 10 + DEX without armor, plus the AC effects of the gear. A number typed under AC overrides it.
  - an attack line for each equipped weapon: finesse weapons use the better of STR and DEX, ranged weapons DEX, plus the attack and damage effects of the gear. The proficiency bonus is added only if the character is proficient with the weapon; ⚠ marks one they aren't
  - ⚠ on the AC and in *Equipped* for armor or a shield worn without the proficiency for it
  - the spell save DC and attack bonus, from the casting ability of the highest level spellcasting class unless you pick another
- **Gear effects:** an item's *Effects* (on its ✎ Edit page) say what it does to whoever uses it: AC, an ability score
  (added, raised to a value like Gauntlets of Ogre Power's STR 19, or forced to one even when lower, like a cursed ring's INT 6), all saves or one, attack and damage rolls, spell
  attack and save DC, a skill, advantage or disadvantage on a skill or a save, typed extra weapon damage ("+ 2
  necrotic", optionally only when proficient), speed, initiative, max HP, a resistance, a condition immunity, a sense
  (Darkvision 120 ft), or a feature line. They count while the item is
  worn or wielded, or, for an item that requires attunement, while attuned. A weapon's attack and damage effects count
  for that weapon only. Numbers changed by gear get a ✦; hovering shows where they come from ("16 Chain mail · +1 Ring
  of Protection"), and *Equipped* lists the active gear with what each item adds. Gear resistances and features show
  under *Features & traits*. (Data version 25 turned the old free-text Bonus field into effects.)
- **Requirements:** an item's *Requirements* (on its Edit page) name minimum ability scores, classes (or any
  spellcaster), races (a subrace counts) and skill proficiencies, plus a note that isn't checked. A character who
  doesn't meet them can't equip the item, or attune to it if it needs attunement: the button is greyed out and says
  why, and a drop onto *Equipped* is refused. Heavy armor is the exception: below its Strength it can be worn, at
  −10 ft speed. An item already in use that no longer fits gets a ⚠. The card shows "Requires" or "Attunement by".
- **Spells and charges from items:** an item's *Spells* (on its ✎ Edit page) are spells its user can cast while it's
  in use: for some of its *Charges*, once per short or long rest or per day, at will, or *prepared* (cast with the
  character's own slots), optionally at a set level. *Regains* notes how charges come back (e.g. "1d4 at dawn"; that's
  done by hand). The Spellbook's *From items* card lists them with their item, attack or save and a *Cast* button that
  spends the charges or marks the use; *Short rest* there and *Long rest* give uses back. *Equipped* shows each item's
  charges with − and ＋.
- **In a fight:** Combat (the initiative tracker) takes the PC's AC, HP and initiative from the sheet.

**How items match proficiencies.** Each item says what it needs:
- **A weapon:** its *Weapon category* (Simple or Martial) and its *Base weapon* (Rapier). A standard base weapon also tells the category. A weapon with neither, such as a wand, needs no proficiency.
- **Armor:** its *Armor type*. Clothing needs no proficiency.
- **A tool:** an item of the kind Tool *is* the tool. A recipe's *Crafted with* links to one, and the Workbench checks the character is proficient with it.

**The current character.** "☆ Make current character" at the top of a sheet makes that character the one the other tools are about:

- **Spellbook:** shows the character's own spellbook: spells, slots and prepared spells. The spell attack and save DC come from their sheet once its scores and casting ability are filled in; until then they're typed in.
- **Workbench:** uses the character's recipes and the tool proficiencies from their sheet (set on its ✎ Edit page; the recipes show which tools are missing). The ingredient pouch is the ingredients in their inventory, which the sheet lists separately as *Ingredient pouch*. Crafting takes the ingredients out of the inventory and puts the result in.
- **Tabs:** a character's page has *Overview* (the sheet), *Family tree*, *📖 Spellbook* and *⚗️ Workbench*; the last two are that character's own, whether or not they're the current one.
- **Character menu** (player mode): clicking it opens the current character's sheet; hovering offers *New character…* and *All characters*, the list where the current one is marked ★ current.

With no current character, the Spellbook and Workbench use the world's own; the Spellbook then takes typed numbers, and the Workbench picks its tools itself.

### Maps and travel

A place with a map picture shows it with pins for the places in it (✎ Edit pins adds, moves and links them).

- **Scale:** in ✎ Edit pins, *⚖ Set scale*: click two points a known distance apart (the ends of the map's scale
  bar, or two towns) and type the distance in miles or feet. Each map has its own.
- **Measure:** *📏 Measure* on a map, then click points or pins to lay a route of several legs. It shows each leg's
  length, the total, the travel time and the arrival date in the world calendar (setting out today). Pick a pace or
  vehicle: the 5e slow, normal and fast paces (18 / 24 / 30 miles in an 8-hour travel day) or a ship, galley,
  airship and the like, which travel around the clock. A leg can be marked difficult terrain (half speed).
- **Routes:** name a route and save it; the map's *Routes* list shows each with its distance and time, a box to draw
  it on the map, *Open* to change it and ✕ to delete it.
- **Own paces and vehicles** (a griffon, a sand skiff): *Paces & vehicles…* under Measure, with their mph and
  whether they travel all day.

### The calendar

**World → Calendar → ⚙ Edit calendar** changes the world's calendar:
- **Structure:** its name, the months and their length, which month gets the leap day (every 4 years, except every 100, except every 400; or none) and the weekdays.
- **Moons:** each with its cycle in days and today's phase.
- **Eras:** dates show the era's short name (its initials unless you give one), e.g. "892 AC". The first era also covers every year before it; years below 0 count backwards.
- **Holidays:** they repeat every year.
- **Timeline colours:** for each event category (the categories themselves are in Archive → Lists) and for sessions. A session appears on the timeline when its *Show on the timeline* box is ticked.
- **Today stays put:** it keeps the weekday and moon phases picked on the page, whatever else changes.
- **Dates follow their month:** when months are moved, or one before them is removed, dates move with them. Saving warns first about dates that no longer fit:
  - a date in a removed last month keeps its number, so adding a month back brings it back;
  - a date in another removed month keeps only its year;
  - a day past a shortened month's end stays as it is.

### Several worlds

The desktop app can keep several worlds (your campaign, a one-shot, a player's own copy) and switch between them. Each world is its own folder with its database, pictures, files and backups.
- **Switching:** click the world's name at the top left (it also has *Home*), or ⚙ → *Switch world*. Both list your worlds, last opened first. The open one is saved before switching. The start screen lists them too.
- **New world…** asks for a name and makes a folder for it inside your worlds folder (chosen the first time). The world starts from the starting world, in player mode.
- **Open a world folder…** opens a world anywhere else (and adds it to the list). ✕ takes a world off the list; its folder stays.
- **World ID:** every world gets a permanent ID the first time it's opened. It's kept by backups and restores and isn't part of exports. Sharing with players will use it, so a player's world only ever follows the right one of your worlds.
- **Copies:** if the same ID turns up in a second folder that still holds a world, the app asks: *Make it a separate world* (a new ID, e.g. after copying a world to start a new campaign from it) or *It's the same world, moved* (the list forgets the old folder). A world whose old folder is gone simply moved.

### Sharing with players through a shared folder

Players' worlds can follow yours through a shared folder, e.g. a Google Drive folder you share with them as *Viewer* (each player adds it to their own Drive so it syncs to their computer). One way only: nothing ever comes back.
- **Publishing (you):** ⚙ → *Publish for players…* asks for the shared folder once, then shows what would go out and what changed since the last publish, including what players will lose. *Publish now* writes `<shared folder>/<world ID>/world.json` and the pictures and files, named by their content so Drive only moves what changed.
- **What's shared:** every entry marked *Known to players*, without DM-only text, the dropdown lists, the calendar and today's date. Never: characters, campaigns, sessions, encounters, creatures, or anything *DM only*.
- **Joining (a player):** in the world list (the world's name at the top left, or ⚙ → *Switch world*), *Join a shared world…* → pick the shared folder → *Join*. A new world is made and filled from it.
- **Staying up to date:** a joined world checks on start and every 5 minutes (⚙ → *Check for updates* any time). A backup is made, then the shared entries are replaced, entries you stopped sharing are removed (the player's own entries keep the name where they pointed at them), your lists win (options the player added stay), and the calendar and today's date are yours.
- **Shared entries are read-only** for the player (no Edit; the page says where they come from). On people and places (NPCs, organizations, places, deities, events) players have **Your notes**, which updates never touch. Their characters, campaigns, sessions and notes are all theirs.
- **Versions:** a publish from a newer DnDesk asks the player to update first.

### Sharing entries and the world

An entry, or the whole world, can be sent to someone else who has this app, and sent again later to bring their copy up to date.

- **⇩ Export** on an entry's page saves it as `<name>.dndesk.json`, with everything it points at, and what those point at in turn: *Located in*, race, recipes and their tools, a scroll's spell, shop stock, map pins, a character's inventory, spellbook, recipes and tools. Tick *Also what its text links to* to follow the `[[links]]` in the text too.
- **⚙ → Export the world…** saves every entry, the connections between them, every dropdown list, your calendar (as edited in *⚙ Edit calendar*), the timeline's colours and today's date.
- **Never exported:** campaigns, sessions, encounters and creatures stay with the DM.
- **DM-only text** is left out unless you tick *Include the DM-only parts of the text*. **Hidden entries** (not known to the players) go along unless you untick *Include entries hidden from the players*; their connections stay out with them.
- **Choosing types:** the *Take along* chips leave whole types out.
- **Links to what stays home** stay links, so they work wherever that entry exists (the other side has it, or it came in earlier); elsewhere a link becomes plain words and a field leaves it out. A field that loses something on import keeps your own value. A hidden entry left out is never linked in the file (a link to it keeps only its words).
- **⚙ → Import from a file…** (top right) brings one in and shows what's new, what's updated and what's already the same.
  - **Updating:** an entry you already have is updated. It counts as the same entry if it has the same id (it came from the same world, even if it was renamed since), or else the same type and name. Untick an updated one to keep yours.
  - **DM-only text:** a file without DM-only text never wipes out DM-only text you have.
  - **Connections:** they're matched by their two ends and kind, then added or updated.
  - **Dropdown lists:** choices are matched to your options by id, then by name; one you don't have is added. A world's file also carries over renamed options.
  - **Calendar:** a world's file brings its calendar, timeline colours and today's date; the tick box is on when they differ from yours. So a player who imports your world gets your calendar in place of the standard one.

Everything is saved in `data/`:

| Path | What |
| --- | --- |
| `data/dndesk.sqlite` | the world: every entry, relation and setting, the play state, and earlier versions of changed and deleted entries |
| `data/images/`, `data/files/` | pictures and attached files (character sheets) |
| `data/backups/` | copies of the database (`dndesk-<date>.sqlite`): one at most every 10 minutes while you edit, thinned out over time (see below) |

### Backups

**⚙ → Data & backups** (top right) has two tools:

- **Make a backup copy** copies the database (with SQLite's own safe copy), pictures and files into a folder you choose, for example on your PC. Each copy is a new folder named `DnDesk-backup-<world>-<date>`, so copies of several worlds can share the folder. The app remembers the folder, and the ⚙ gets a dot when the last backup copy is more than a week old.
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

### The starting world

Every new world starts from `app/src/seed/world.json`, which ships inside the app. It holds:
- every dropdown list;
- the standard calendar: Gregorian months and leap day, the real moon, BC and AD, today 1 January of year 1, and the sessions' timeline colour. It's not taken from your world: a world makes its own on the Calendar page (*⚙ Edit calendar*), and a player gets yours by importing your world;
- the races, subclasses, spells, feats and Tool items, without DM-only text or pictures. Links to anything else become plain words.

`npm run seed` rebuilds it from your world (`../data`, or a folder given after the command); commit it and the next build ships it. The seed records its data version, so after an upgrade step a new world from an older seed is brought up to date like any older data. Rebuilding it now and then keeps it current.

### Credits

- **Menu and page icons:** also [game-icons.net](https://game-icons.net), same artists and licence: world, sands-of-time, calendar, sword-clash, family-tree, enlightenment, magic-palm, level-three, cauldron, scroll-quill, herbs-bundle, round-bottom-flask, tied-scroll, broadsword, breastplate, toolbox, backpack, checklist. They're in `app/src/icons/ui.ts`.
- **Entry type icons:** also [game-icons.net](https://game-icons.net), same artists and licence: person, character, vertical-banner, position-marker, elf-ear, angel-wings, spiked-dragon-head, swap-bag, sparkles, laurels, scroll-unfurled, hourglass, rolling-dices, campfire, crossed-sabres, quill-ink, notebook. They're in `app/src/icons/types.ts`.
- **Class icons:** [game-icons.net](https://game-icons.net) by Lorc, Delapouite and the other game-icons.net artists, under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The chosen icons (tinker, battle-axe, lyre, holy-symbol, oak-leaf, crossed-swords, fist, templar-shield, bow-arrow, cloak-dagger, magic-swirl, warlock-eye, spell-book) are in `app/src/icons/classes.ts`, taken from the `@iconify-json/game-icons` package. The same credit is on the Data page.

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
