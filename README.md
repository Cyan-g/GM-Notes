# GM Notes

A local campaign wiki and toolkit for tabletop roleplaying games: the world and its people, campaigns and sessions,
characters, spells, items and crafting. Everything stays on your computer; players can follow along with their own
copy.

## Using it

GM Notes is a desktop app for Windows and macOS. Each world lives in its own folder, as a database plus its pictures,
files and backups.

- **Install:** on Windows, `GM-Notes-Setup-<version>.exe` installs for your user and updates itself (a bar offers
  *Restart and update*). On macOS the app isn't signed, so open it the first time with right-click → *Open*; a bar
  says when a new version is out.
- **First start:** choose a folder. An empty one gets a new world, starting either with the SRD 5.2.1 content (spells,
  feats, species, backgrounds, tools, the dropdown lists and a standard calendar; shown as *D&D 5e*), empty, or from
  an exported world file. Then pick *I'm the DM* or *I'm a player* (⚙ → *DM mode* switches later).
- **Several worlds:** the world's name at the top left switches between them, makes new ones or opens another
  folder. Every world has a permanent ID; a copied folder can become a separate world or count as the same one moved.
- **Renamed:** GM Notes used to be DnDesk. Its settings carry over, and the file names (`dndesk.sqlite`,
  `.dndesk.json`) stay, so old worlds, backups and exports keep working.

### Writing the world

- **Entries** of many types (NPCs, places, organizations, items, spells, creatures, sessions, notes…), with fields
  from the schema and Markdown text. `[[` links another entry, pictures can be pasted or dropped, and 🔒 *Secret*
  marks GM-only text. Relations (membership, family, home…) show on both ends.
- **Keys:** **E** edits, **Esc** / *Done* goes back, **Ctrl K** searches names, aliases and text, **Ctrl S** saves
  at once (it also saves by itself). ← and Alt+← / Alt+→ move through history.
- **Dropdowns** come from lists kept with the world (Archive → Lists): rename, reorder, add, remove. Entries point at
  an option, so a rename shows everywhere; options in use, or that the app relies on (🔒), can't be removed.
- **Sessions** follow their number; a new one starts with the last one's headings and open checklist items.
  Checklists (`- [ ]`) can be ticked right on the page.
- **🕘 History** keeps an entry's earlier versions (one per 10 minutes, the last 40) and can go back to one.
- **Maps:** a place's map has pins for the places in it. Set a scale, measure routes of several legs with travel time
  and arrival date at a pace or vehicle of your choice, and save named routes.
- **Calendar:** your own months, leap rule, weekdays, moons, eras and holidays; dates follow when months move.
- **Cards:** spells and items print as poker-size cards (nine to a page, PDF), one at a time or every row of a filtered
  table, styled to taste. GM-only text is never printed.
- **Theme:** colours, plus heading and text fonts, including fonts that ship with the app.

### DM mode and player mode

*DM mode* (the GM's view) shows everything. Player mode is for a player's copy: a Character menu, the shared world, their own notes,
characters and NPCs; the Archive, combat, encounters and GM-only text are hidden. The mode is saved with the world.

### Characters

A player character's page is its sheet for play; ✎ Edit builds it.

- **Creation wizard:** *New character…* walks through class and level (any level, with subclass), species and
  background with their choices, ability scores (standard array, point buy or typed, plus the species', the
  background's or a custom bonus), proficiencies and languages, feats at their levels, hit points (average or typed
  rolls), starting equipment (an option of the class and the background's items or gold), spells (cantrips, prepared
  spells and a wizard's spellbook, counted by the rules), and name, looks and story. Steps can be taken in any order
  and say what's still open; the summary makes the character with sheet, inventory and spellbook filled in. The
  twelve SRD classes bring their rules (`app/src/classRules.ts`); another class is filled in by hand. Class features
  aren't added; write them on the sheet. *Make a blank one instead* skips the wizard.

- **Built from:** classes (multiclassing, with subclasses), ability scores, proficiencies picked from the same lists
  items use, species, background, money, speed and features.
- **Worked out:** modifiers, proficiency bonus, saves, skills, passive Perception, AC from the armor worn, an attack
  line per weapon (⚠ without proficiency), spell save DC and attack, hit dice per die size, and spell slots from the
  class levels (multiclass table, pact slots, Mystic Arcanum).
- **Play:** damage and healing, temporary HP, rests, inspiration, an inventory with drag and drop onto *Equipped*
  (armor, weapons, three attunement slots). A number that changes glows for a moment: green up, red down.
- **Gear effects:** what an item does while worn, wielded or attuned: AC, ability scores (added, raised to or forced
  to a value), saves, attack and damage, spell attack and DC, skills, advantage, extra damage, speed, initiative, max
  HP, resistances, condition immunities, senses, features. Changed numbers get a ✦ and say where they come from.
  Items can also give spells with charges, and have requirements (scores, classes, species, skills) that are checked
  when equipping.
- **Species and backgrounds:** set up by the GM, picked on the character. Their traits carry effects, proficiencies
  and languages, spells, uses per rest and choices the player makes on the sheet (a lineage, skills, a tool); a
  subrace adds its main race's traits. The Races list shows subraces under their race (▾/▸ folds them), a race's
  page lists its subraces with their bonuses and traits, and the creation wizard asks for the race, then the subrace. Every granted proficiency can be swapped by the player. Ability score bonuses
  (fixed, picks, alternatives, a cap) and a background's starting equipment are stored as data and only handed out by
  the creation wizard.
- **The current character** (☆ on a sheet) is the one the Spellbook (spells, slots, prepared spells, spells from items
  and species) and the Workbench (recipes, tools, the ingredient pouch; crafting takes and gives items) are about.
- **Combat:** the initiative tracker takes AC, initiative and HP from the sheets, tracks conditions with rounds left,
  concentration checks and death saves.

**How items match proficiencies:** a weapon by its category or base weapon, armor by its type (clothing needs
none), and a Tool item *is* the tool; a recipe's *Crafted with* names it.

### Sharing with players

- **Live on your network:** ⚙ → *Share with players…* → *Start hosting*. Players find the session by themselves (or
  type the address) and enter the world's code once; *New code* drops everyone. *Send now* sends to everyone
  connected. Five wrong codes lock a computer out for five minutes. Allow GM Notes on private networks when Windows
  asks.
- **Through a shared folder** (e.g. a Google Drive folder shared as *Viewer*): *Publish now* writes the world there,
  pictures named by their content so only changes sync. Joined worlds check on start and every 5 minutes.
- **Joining:** the world list has *Join a live session…* and *Join a shared world…*; a world can use both.
- **What goes out:** entries marked *Known to players* without GM-only text, the lists, the calendar and today's
  date; never characters, campaigns, sessions, encounters or creatures. Nothing comes back. Shared entries are
  read-only for players, who keep their own notes on them; their own entries are never touched by an update.
- **Files:** ⇩ *Export* sends one entry with what it points at, ⚙ → *Export the world…* everything; ⚙ → *Import from a
  file…* shows what's new and updated before bringing it in. GM-only text and hidden entries are opt-in or opt-out.

### Your data

| Path | What |
| --- | --- |
| `data/dndesk.sqlite` | the world: entries, relations, settings, play state and earlier versions |
| `data/images/`, `data/files/` | pictures and attached files |
| `data/backups/` | automatic copies (`dndesk-<date>.sqlite`), at most one per 10 minutes |

- **Backups:** automatic ones are kept for 2 hours, then hourly for 2 days, daily for 2 months and monthly for good.
  ⚙ → *Data & backups* restores one (saving the current state first), brings back deleted entries and makes a full
  copy to a folder of your choice (the ⚙ gets a dot after a week without one).
- **Data check:** each opening checks fields, links and relations, and lists problems without changing anything.
  Imported files are checked too.
- **Safe saving:** only changes are written, in one transaction. The database refuses malformed data, a save never
  overwrites changes made elsewhere without asking, more than 10 deletions in one save are refused, and data from a
  newer app version opens read-only.

## Developing it

The source is in `app/` (Vue 3 + TypeScript + Vite; the desktop shell is Electron). `data/` isn't in git; the backups
protect it.

```bash
cd app
npm install
npm run dev        # the pages in a browser at http://localhost:5199, on ../data/dndesk.sqlite; add ?write to save
npm run build      # type-check and build into dist/
npm run desktop    # build and open the desktop app
npm run dist       # Windows installer, into %LOCALAPPDATA%\GM-Notes-build
npm run seed       # rebuild the starting world from ../data (or a folder given after it)
```

- **Schema:** `app/src/model/schema.ts` describes every entry type and its fields; forms, pages, the data check
  (`validate.ts`) and the field types (`EntryFields`, `byKey`) all come from it. Adding a field there is enough.
- **Data versions:** changes to the data's shape are steps in `upgrade()` in `app/src/store.ts`; each raises
  `version` once, and `DATA_VERSION` must match the last.
- **Desktop shell** (`app/electron/`): `main.cjs` (window, data folder, updates, live sessions in `live.cjs`),
  `db.cjs` (the database on Node's built-in `node:sqlite`, transactions, history), `preload.cjs` (the only bridge the
  pages get).
- **The starting world** (`app/src/seed/world.json`) holds the dropdown lists, a Gregorian calendar, and only what may
  be published: the SRD 5.2.1 spells and feats (`app/scripts/srd-5.2.1.json` where your world lacks them), species
  (`srd-species.json`), backgrounds and their tools (`srd-backgrounds.json`), and Tool items with facts but no text.
  Homebrew stays in your world.
- **FAT32 / exFAT drives:** git may need `git config --global --add safe.directory <folder>`, and `npm run dist`
  builds on the local disk because the packager needs finer file times.

**Releasing:** raise `version` in `app/package.json`, commit, tag (`v1.2.3`) and push both.
`.github/workflows/release.yml` builds the Windows installer and the Mac `.dmg`/`.zip` into a draft release and
publishes it, which is where the apps look for updates. A tag uses the workflow as it was in that commit.

## Credits

- **Fonts:** Cinzel, EB Garamond, Cormorant Garamond, IM Fell English, Uncial Antiqua, MedievalSharp, Almendra, Alegreya, Crimson Pro, Lora and Atkinson Hyperlegible, each under the [SIL Open Font License 1.1](https://openfontlicense.org), from Google Fonts. They're in `app/src/fonts/`, each with its licence (OFL.txt), latin characters only.
- **Spells, feats, species, backgrounds and class rules from the SRD:** this work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode. Those entries end with a *Source* line; the same credit is on the Data page.
- **Class icons:** [game-icons.net](https://game-icons.net) by Lorc, Delapouite and the other game-icons.net artists, under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The chosen icons (tinker, battle-axe, lyre, holy-symbol, oak-leaf, crossed-swords, fist, templar-shield, bow-arrow, cloak-dagger, magic-swirl, warlock-eye, spell-book) are in `app/src/icons/classes.ts`, taken from the `@iconify-json/game-icons` package. The same credit is on the Data page.
- **Menu and page icons:** also [game-icons.net](https://game-icons.net), same artists and licence: world, sands-of-time, calendar, sword-clash, family-tree, enlightenment, magic-palm, level-three, cauldron, scroll-quill, herbs-bundle, round-bottom-flask, tied-scroll, broadsword, breastplate, toolbox, backpack, checklist; and for buttons and headings backward-time, rolling-dices, desk, round-star, checked-shield, skull-crossed-bones, plain-dagger, treasure-map, save, palette, measure-tape, scales, pin, coffee-cup, night-sleep, hazard-sign, cog, save-arrow, paper-arrow, share, cloud-download, upgrade, padlock, party-popper, crown, family-tree, linked-rings, mona-lisa, lightning-arc, house, world, moon. They're in `app/src/icons/ui.ts`. The calendar's moon phases are drawn by the app (`MoonPhase.vue`).
- **Entry type icons:** also [game-icons.net](https://game-icons.net), same artists and licence: person, character, vertical-banner, position-marker, elf-ear, backpack, angel-wings, spiked-dragon-head, swap-bag, sparkles, laurels, scroll-unfurled, hourglass, rolling-dices, campfire, crossed-sabres, quill-ink, notebook. They're in `app/src/icons/types.ts`.
- **Condition icons:** also [game-icons.net](https://game-icons.net), same artists and licence: blindfold, charm, hearing-disabled, tired-eye, terror, grab, knockout, invisible, frozen-body, stone-bust, poison-bottle, half-body-crawling, manacles, knocked-out-stars, sleepy, concentration-orb. They're in `app/src/icons/conditions.ts`, and show on combat cards, the initiative strip, statblock condition immunities and item immunities.
