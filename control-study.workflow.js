// ============================================================================
//  control-study.workflow.js  —  PHASE 2: 패자 대조군 연구
//
//  Breaks the survivorship-bias ceiling of phase 1. Phase 1 coded 111 confirmed
//  1M+ HITS and found 55% "fit" the "familiar base + novel twist" hypothesis —
//  but with no denominator (no losers), that cannot show the pattern DISCRIMINATES
//  hits. This workflow builds a matched CONTROL group of Steam games (2020-2026)
//  that did NOT reach 1M, codes both arms BLIND with the identical rubric, and
//  asks: is `fits` actually more common in hits than in comparable non-hits?
//
//  Design (approved plan):
//   - Match controls to hits on COARSE genre × release-year (antecedents), NOT on
//     base-concept/familiarity/price (the exposure being tested).
//   - 4 ordered outcome bands: flop < modest < moderate/near-miss < hit
//     → Cochran-Armitage monotone-trend test (stronger than a single 2x2).
//   - "Shipped-and-tried" filter = earnestness (real playable game, >=~20 reviews),
//     NOT quality/team/budget — filtering on quality would rig toward the hypothesis.
//   - Seeded RNG random draw from the eligible frame (no cherry-picking).
//   - HARD WALL: an outcome-auditor agent bands each control; a separate blind
//     coder codes design-DNA seeing ONLY store-page/identity material (no sales,
//     no review counts, no arm label). `fits` is computed deterministically.
//   - The 111 hits are RE-CODED BLIND through the same path (symmetry); the
//     blind-vs-original hit rate quantifies phase-1 confirmation bias.
//
//  Sandbox has no filesystem: the 111 hits + matching frame arrive via `args`
//  (see scripts/make_args.js). The script RETURNS the joined dataset + stats +
//  report; the caller writes report/ files.
//
//  Math.random / Date are banned in the sandbox → a seeded PRNG (mulberry32)
//  provides the reproducible random draw.
// ============================================================================

export const meta = {
  name: 'steam-control-study',
  description: 'Matched loser control-group study: does "familiar base + novel twist" discriminate 1M+ hits from comparable non-hits? Blind coding + 2x2 + monotone-gradient.',
  phases: [
    { title: 'Discover', detail: 'frame-pull non-1M controls per coarse-genre × band' },
    { title: 'Audit', detail: 'blind outcome-auditor bands each control (sealed)' },
    { title: 'BlindCode', detail: 'design-DNA coder over shuffled hits+controls, outcome-stripped' },
    { title: 'Compare', detail: '2x2, RD/RR/OR, Cochran-Armitage gradient, gate decomposition' },
    { title: 'Synthesis', detail: 'red-team the control group, Korean comparison report' },
  ],
}

// ============================================================================
//  SECTION 0 — CONFIG + args
// ============================================================================
// Phase-1 hits are injected here by scripts/inject_hits.js (sandbox has no FS,
// and 42KB is unwieldy to inline in a tool call). args.hits overrides if provided.
const HITS_INLINE = /*__HITS_DATA__*/ [{"title":"Grand Theft Auto V","app_id":271590,"developer":"Rockstar North / Rockstar Games","year":2013,"genre":"Action-adventure","orig_fits":false,"orig_familiarity":5,"orig_max_novelty":0,"copies_m":230},{"title":"Black Myth: Wukong","app_id":2358720,"developer":"Game Science (Game Science Interactive Technology Co., Ltd.)","year":2024,"genre":"Action RPG","orig_fits":false,"orig_familiarity":5,"orig_max_novelty":2,"copies_m":30},{"title":"Palworld","app_id":1623730,"developer":"Pocketpair","year":2024,"genre":"Open-world survival/crafting","orig_fits":true,"orig_familiarity":5,"orig_max_novelty":4,"copies_m":25},{"title":"Terraria","app_id":105600,"developer":"Re-Logic","year":2011,"genre":"Action-adventure sandbox survival","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":4,"copies_m":70},{"title":"Elden Ring","app_id":1245620,"developer":"FromSoftware","year":2022,"genre":"Action RPG","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":30},{"title":"Human: Fall Flat","app_id":477160,"developer":"No Brakes Games","year":2016,"genre":"Puzzle-platformer","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":58},{"title":"NARAKA: BLADEPOINT","app_id":1203220,"developer":"24 Entertainment (NetEase subsidiary)","year":2021,"genre":"Battle Royale","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":4,"copies_m":10},{"title":"Baldur's Gate 3","app_id":1086940,"developer":"Larian Studios","year":2023,"genre":"CRPG (party-based role-playing game)","orig_fits":false,"orig_familiarity":4,"orig_max_novelty":3,"copies_m":20},{"title":"Helldivers 2","app_id":553850,"developer":"Arrowhead Game Studios","year":2024,"genre":"Cooperative third-person shooter","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":20},{"title":"Cyberpunk 2077","app_id":1091500,"developer":"CD Projekt Red","year":2020,"genre":"Action RPG","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":40},{"title":"Hogwarts Legacy","app_id":990080,"developer":"Avalanche Software","year":2023,"genre":"Action RPG","orig_fits":false,"orig_familiarity":5,"orig_max_novelty":0,"copies_m":40},{"title":"It Takes Two","app_id":1426210,"developer":"Hazelight Studios","year":2021,"genre":"Co-op action-adventure / puzzle-platformer","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":30},{"title":"Valheim","app_id":892970,"developer":"Iron Gate Studio (Iron Gate AB)","year":2021,"genre":"Survival / Open-world crafting","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":4,"copies_m":12},{"title":"Stardew Valley","app_id":413150,"developer":"ConcernedApe (Eric Barone)","year":2016,"genre":"Farming sim / life sim","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":50},{"title":"Among Us","app_id":945360,"developer":"InnerSloth","year":2018,"genre":"Social deduction","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":3,"copies_m":8},{"title":"No Man's Sky","app_id":275850,"developer":"Hello Games","year":2016,"genre":"Survival/Exploration","orig_fits":false,"orig_familiarity":2,"orig_max_novelty":5,"copies_m":30},{"title":"Sons Of The Forest","app_id":1326470,"developer":"Endnight Games","year":2023,"genre":"Survival horror / open-world survival crafting","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":2,"copies_m":14},{"title":"Diablo IV","app_id":2344520,"developer":"Blizzard Entertainment","year":2023,"genre":"Action RPG","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":2,"copies_m":10},{"title":"PEAK","app_id":3527290,"developer":"Aggro Crab / Landfall Games","year":2025,"genre":"Co-op physics platformer / climbing survival","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":11},{"title":"Phasmophobia","app_id":739630,"developer":"Kinetic Games","year":2020,"genre":"Co-op survival horror","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":4,"copies_m":25},{"title":"Vampire Survivors","app_id":1794680,"developer":"poncle (Luca Galante)","year":2022,"genre":"Roguelike / bullet-heaven survival","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":15},{"title":"Monster Hunter Wilds","app_id":2246340,"developer":"Capcom","year":2025,"genre":"Action RPG","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":2,"copies_m":11.4},{"title":"Enshrouded","app_id":1203620,"developer":"Keen Games","year":2024,"genre":"Survival action RPG","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":5.5},{"title":"Fall Guys: Ultimate Knockout","app_id":1097150,"developer":"Mediatonic","year":2020,"genre":"Party / Battle Royale Platformer","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":4,"copies_m":11},{"title":"Content Warning","app_id":2881650,"developer":"Landfall Games","year":2024,"genre":"Co-op survival horror","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":6},{"title":"Core Keeper","app_id":1621690,"developer":"Pugstorm","year":2024,"genre":"Survival sandbox / crafting","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":3,"copies_m":3},{"title":"Balatro","app_id":2379780,"developer":"LocalThunk (solo, pseudonymous)","year":2024,"genre":"Roguelike deckbuilder","orig_fits":true,"orig_familiarity":5,"orig_max_novelty":5,"copies_m":6.5},{"title":"Grounded","app_id":962130,"developer":"Obsidian Entertainment","year":2022,"genre":"Survival","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":5},{"title":"Dead by Daylight","app_id":381210,"developer":"Behaviour Interactive","year":2016,"genre":"Asymmetric multiplayer horror","orig_fits":true,"orig_familiarity":5,"orig_max_novelty":4,"copies_m":20},{"title":"Manor Lords","app_id":1363080,"developer":"Slavic Magic (Grzegorz \"Greg\" Styczeń)","year":2024,"genre":"City-builder / real-time strategy","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":3.5},{"title":"V Rising","app_id":1604030,"developer":"Stunlock Studios","year":2022,"genre":"Survival / Action-RPG","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":5.5},{"title":"Starfield","app_id":1716740,"developer":"Bethesda Game Studios","year":2023,"genre":"Action RPG","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":2,"copies_m":3},{"title":"Assassin's Creed Valhalla","app_id":2208920,"developer":"Ubisoft Montreal (lead), with Ubisoft Sofia, Singapore, Kyiv, Bucharest and others","year":2020,"genre":"Action RPG / Open-world","orig_fits":false,"orig_familiarity":5,"orig_max_novelty":2,"copies_m":20},{"title":"Split Fiction","app_id":2001120,"developer":"Hazelight Studios","year":2025,"genre":"Co-op action-adventure","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":7},{"title":"STAR WARS Jedi: Fallen Order","app_id":1172380,"developer":"Respawn Entertainment","year":2019,"genre":"Action-adventure","orig_fits":false,"orig_familiarity":5,"orig_max_novelty":2,"copies_m":12},{"title":"DAVE THE DIVER","app_id":1868140,"developer":"MINTROCKET (Nexon subsidiary)","year":2023,"genre":"Action-adventure / simulation management hybrid","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":8},{"title":"Call of Duty: Modern Warfare II (2022)","app_id":1938090,"developer":"Infinity Ward","year":2022,"genre":"First-person shooter","orig_fits":false,"orig_familiarity":5,"orig_max_novelty":0,"copies_m":23},{"title":"Clair Obscur: Expedition 33","app_id":1903340,"developer":"Sandfall Interactive","year":2025,"genre":"Turn-based JRPG","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":4,"copies_m":8},{"title":"Elden Ring Nightreign","app_id":2622380,"developer":"FromSoftware","year":2025,"genre":"Action RPG / Roguelike co-op","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":7.5},{"title":"MECCHA CHAMELEON","app_id":4704690,"developer":"Lemorion_1224 (with Haganeiro) — self-published as Ambition Games","year":2026,"genre":"Party / Social Deduction Hide-and-Seek","orig_fits":true,"orig_familiarity":5,"orig_max_novelty":4,"copies_m":12.6},{"title":"ARC Raiders","app_id":1808500,"developer":"Embark Studios","year":2025,"genre":"Extraction shooter / PvPvE third-person shooter","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":16},{"title":"Dyson Sphere Program","app_id":1366540,"developer":"Youthcat Studio","year":2021,"genre":"Factory automation / management simulation","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":3},{"title":"Path of Exile 2","app_id":2694490,"developer":"Grinding Gear Games","year":2024,"genre":"Action RPG","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":2,"copies_m":4.9},{"title":"Satisfactory","app_id":526870,"developer":"Coffee Stain Studios","year":2024,"genre":"Factory building / automation simulation","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":8},{"title":"WUCHANG: Fallen Feathers","app_id":2277560,"developer":"Leenzee","year":2025,"genre":"Action RPG","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":2,"copies_m":1.2},{"title":"Monster Hunter Rise","app_id":1446780,"developer":"Capcom","year":2021,"genre":"Action RPG / Monster Hunting","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":2,"copies_m":18.6},{"title":"Buckshot Roulette","app_id":2835570,"developer":"Mike Klubnika","year":2024,"genre":"Psychological horror / party game","orig_fits":true,"orig_familiarity":5,"orig_max_novelty":4,"copies_m":8},{"title":"Deep Rock Galactic","app_id":548430,"developer":"Ghost Ship Games","year":2020,"genre":"Co-op FPS","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":10},{"title":"Farming Simulator 22","app_id":1248130,"developer":"GIANTS Software","year":2021,"genre":"Farming/life simulation","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":0,"copies_m":6},{"title":"Sea of Thieves","app_id":1172620,"developer":"Rare Ltd.","year":2018,"genre":"Action-adventure / open-world co-op","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":40},{"title":"Resident Evil Village","app_id":1196590,"developer":"Capcom","year":2021,"genre":"Survival Horror","orig_fits":false,"orig_familiarity":5,"orig_max_novelty":3,"copies_m":14.9},{"title":"Forza Horizon 5","app_id":1551360,"developer":"Playground Games","year":2021,"genre":"Racing","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":2,"copies_m":8},{"title":"Hunt: Showdown (now Hunt: Showdown 1896)","app_id":594650,"developer":"Crytek","year":2019,"genre":"Extraction shooter / survival horror FPS","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":10},{"title":"Dead Cells","app_id":588650,"developer":"Motion Twin (original), Evil Empire (post-launch/DLC development)","year":2018,"genre":"Roguelike action-platformer / Metroidvania","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":11},{"title":"NEEDY STREAMER OVERLOAD (JP: Needy Girl Overdose)","app_id":1451940,"developer":"Xemono (solo developer Torii Megumi)","year":2022,"genre":"Visual novel / life-sim (ADV)","orig_fits":true,"orig_familiarity":5,"orig_max_novelty":4,"copies_m":3},{"title":"Atomic Heart","app_id":668580,"developer":"Mundfish","year":2023,"genre":"First-person shooter / action-adventure with immersive-sim and light RPG elements","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":4.5},{"title":"Cult of the Lamb","app_id":1313140,"developer":"Massive Monster","year":2022,"genre":"Roguelike action / base-building sim hybrid","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":4,"copies_m":7},{"title":"Megabonk","app_id":3405340,"developer":"Vedinad","year":2025,"genre":"Roguelike survival / bullet-heaven (\"survivors-like\")","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":4,"copies_m":2},{"title":"Mortal Kombat 1","app_id":1971870,"developer":"NetherRealm Studios","year":2023,"genre":"Fighting game","orig_fits":false,"orig_familiarity":5,"orig_max_novelty":0,"copies_m":8},{"title":"NBA 2K24","app_id":2338770,"developer":"Visual Concepts","year":2023,"genre":"Sports simulation","orig_fits":false,"orig_familiarity":5,"orig_max_novelty":0,"copies_m":9},{"title":"Nioh 2","app_id":1325200,"developer":"Team Ninja (Koei Tecmo)","year":2020,"genre":"Action RPG","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":3.2},{"title":"Cities: Skylines II","app_id":949230,"developer":"Colossal Order (Iceflake Studios took over development starting 2026 after Colossal Order/Paradox split)","year":2023,"genre":"City-builder / management simulation","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":0,"copies_m":2.15},{"title":"Ghost of Tsushima","app_id":2215430,"developer":"Sucker Punch Productions","year":2020,"genre":"Action-adventure","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":4,"copies_m":13},{"title":"Remnant 2","app_id":1282100,"developer":"Gunfire Games","year":2023,"genre":"Action RPG / Third-Person Shooter","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":3.5},{"title":"Call of Duty: Black Ops 6","app_id":2933620,"developer":"Treyarch (with Raven Software and other Activision studios)","year":2024,"genre":"First-person shooter","orig_fits":false,"orig_familiarity":5,"orig_max_novelty":0,"copies_m":14},{"title":"Battlefield 6","app_id":2807960,"developer":"EA DICE (with Motive Studio, Ripple Effect Studios, Criterion Games)","year":2025,"genre":"First-person shooter","orig_fits":false,"orig_familiarity":4,"orig_max_novelty":0,"copies_m":20},{"title":"Lies of P","app_id":1627720,"developer":"Round8 Studio (Team Nough)","year":2023,"genre":"Action RPG / Soulslike","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":4},{"title":"Factorio","app_id":427520,"developer":"Wube Software","year":2020,"genre":"Factory automation / simulation","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":6.2},{"title":"The Planet Crafter","app_id":1284190,"developer":"Miju Games","year":2024,"genre":"Survival crafting / simulation","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":2},{"title":"Persona 3 Reload","app_id":2161700,"developer":"P-Studio / Atlus","year":2024,"genre":"JRPG","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":3},{"title":"Resident Evil Requiem","app_id":3764200,"developer":"Capcom","year":2026,"genre":"Survival Horror","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":2,"copies_m":6.5},{"title":"Loop Hero","app_id":1282730,"developer":"Four Quarters","year":2021,"genre":"Roguelike deckbuilder / idle auto-battler","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":5,"copies_m":2},{"title":"Warhammer 40,000: Space Marine 2","app_id":2183900,"developer":"Saber Interactive","year":2024,"genre":"Third-person action shooter","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":0,"copies_m":7},{"title":"The Elder Scrolls IV: Oblivion Remastered","app_id":2623190,"developer":"Bethesda Game Studios / Virtuos (Paris studio, co-development)","year":2025,"genre":"Action RPG / Open-world RPG","orig_fits":false,"orig_familiarity":5,"orig_max_novelty":2,"copies_m":5},{"title":"Grim Dawn","app_id":219990,"developer":"Crate Entertainment","year":2016,"genre":"Action RPG","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":7.5},{"title":"Astroneer","app_id":361420,"developer":"System Era Softworks","year":2019,"genre":"Sandbox survival / exploration adventure","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":7.5},{"title":"Metaphor: ReFantazio","app_id":2679460,"developer":"Studio Zero (Atlus)","year":2024,"genre":"Japanese RPG","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":2},{"title":"EA Sports FC 24","app_id":null,"developer":"EA Vancouver / EA Romania","year":2023,"genre":"Sports simulation","orig_fits":false,"orig_familiarity":5,"orig_max_novelty":0,"copies_m":10},{"title":"Resident Evil 4 (Remake)","app_id":2050650,"developer":"Capcom (Capcom Division 1)","year":2023,"genre":"Survival Horror / Action-Horror","orig_fits":false,"orig_familiarity":4,"orig_max_novelty":2,"copies_m":10},{"title":"Kingdom Come: Deliverance II","app_id":1771300,"developer":"Warhorse Studios","year":2025,"genre":"Action RPG","orig_fits":false,"orig_familiarity":2,"orig_max_novelty":0,"copies_m":6},{"title":"Ranch Simulator: Build, Hunt, Farm","app_id":1119730,"developer":"Toxic Dog","year":2023,"genre":"Farming/Life Simulation","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":3,"copies_m":1.4},{"title":"Hades","app_id":1145360,"developer":"Supergiant Games","year":2020,"genre":"Action roguelike / hack-and-slash","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":5,"copies_m":9.3},{"title":"PowerWash Simulator","app_id":1290000,"developer":"FuturLab","year":2022,"genre":"Simulation","orig_fits":true,"orig_familiarity":5,"orig_max_novelty":4,"copies_m":8},{"title":"inZOI","app_id":2456740,"developer":"inZOI Studio (Krafton internal studio; game is NOT developed by Lionheart Studio, which is a separate Krafton subsidiary known for Dungeon Stalkers/other titles)","year":2025,"genre":"Life simulation","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":4,"copies_m":1.2},{"title":"Crimson Desert","app_id":3321460,"developer":"Pearl Abyss","year":2026,"genre":"Action RPG / Open-world Action-Adventure","orig_fits":false,"orig_familiarity":4,"orig_max_novelty":0,"copies_m":6},{"title":"Lords of the Fallen (2023)","app_id":1501750,"developer":"Hexworks (CI Games studio)","year":2023,"genre":"Action RPG (Soulslike)","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":2.3},{"title":"Last Epoch","app_id":899770,"developer":"Eleventh Hour Games","year":2024,"genre":"Action RPG (ARPG) / hack-and-slash loot game","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":3.5},{"title":"Diablo II: Resurrected","app_id":2418260,"developer":"Blizzard Entertainment (remaster co-developed with Vicarious Visions)","year":2021,"genre":"Action RPG","orig_fits":false,"orig_familiarity":4,"orig_max_novelty":2,"copies_m":5},{"title":"Chivalry 2","app_id":1824220,"developer":"Torn Banner Studios","year":2021,"genre":"Multiplayer first/third-person melee combat action","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":2,"copies_m":3.5},{"title":"HITMAN 3 (later rebranded HITMAN World of Assassination)","app_id":1659040,"developer":"IO Interactive","year":2021,"genre":"Stealth / action-adventure","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":25},{"title":"Dying Light 2 Stay Human","app_id":534380,"developer":"Techland","year":2022,"genre":"Action RPG / Survival","orig_fits":false,"orig_familiarity":4,"orig_max_novelty":2,"copies_m":10},{"title":"Stray","app_id":1332010,"developer":"BlueTwelve Studio","year":2022,"genre":"Adventure / Puzzle-platformer","orig_fits":false,"orig_familiarity":2,"orig_max_novelty":4,"copies_m":6},{"title":"Space Engineers","app_id":244850,"developer":"Keen Software House","year":2019,"genre":"Sandbox / survival engineering simulation","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":4,"copies_m":4.5},{"title":"TCG Card Shop Simulator","app_id":3070070,"developer":"OPNeon Games (solo developer Sia Ding Shen) — note: task brief attributed this game to Auroch Digital/1Up Studio, but research finds no connection; actual developer/publisher is OPNeon Games, a small Malaysia-based indie studio","year":2024,"genre":"Simulation / Tycoon","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":4,"copies_m":2.7},{"title":"DRAGON BALL: Sparking! ZERO","app_id":1790600,"developer":"Spike Chunsoft","year":2024,"genre":"Fighting","orig_fits":false,"orig_familiarity":5,"orig_max_novelty":0,"copies_m":6.5},{"title":"Tale of Immortal (鬼谷八荒)","app_id":1468810,"developer":"Ghost Valley Studio (鬼谷工作室)","year":2021,"genre":"Action RPG / Cultivation Sandbox","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":5},{"title":"Gray Zone Warfare","app_id":2479810,"developer":"MADFINGER Games","year":2024,"genre":"Extraction shooter / tactical FPS","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":3,"copies_m":1.5},{"title":"RV There Yet?","app_id":3949040,"developer":"Nuggets Entertainment (Skövde, Sweden)","year":2025,"genre":"Co-op physics/adventure simulation","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":4.5},{"title":"Inscryption","app_id":1092790,"developer":"Daniel Mullins Games","year":2021,"genre":"Roguelike deckbuilder / card-battler","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":5,"copies_m":2.5},{"title":"Teardown","app_id":1167630,"developer":"Tuxedo Labs","year":2022,"genre":"Action / Physics Sandbox","orig_fits":false,"orig_familiarity":2,"orig_max_novelty":0,"copies_m":3.5},{"title":"Subnautica 2","app_id":1962700,"developer":"Unknown Worlds Entertainment","year":2026,"genre":"Survival/Exploration/Crafting","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":2,"copies_m":4.1},{"title":"Wo Long: Fallen Dynasty","app_id":1448440,"developer":"Team Ninja (Koei Tecmo)","year":2023,"genre":"Soulslike Action RPG","orig_fits":false,"orig_familiarity":4,"orig_max_novelty":3,"copies_m":1.8},{"title":"PAYDAY 3","app_id":1272080,"developer":"Starbreeze Studios","year":2023,"genre":"Co-op FPS heist shooter","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":1,"copies_m":2.2},{"title":"Dragon's Dogma 2","app_id":2054970,"developer":"Capcom","year":2024,"genre":"Action RPG","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":0,"copies_m":4},{"title":"S.T.A.L.K.E.R. 2: Heart of Chornobyl","app_id":1643320,"developer":"GSC Game World","year":2024,"genre":"Immersive-sim / survival FPS with open-world RPG elements","orig_fits":false,"orig_familiarity":2,"orig_max_novelty":0,"copies_m":3},{"title":"Farming Simulator 25","app_id":2300320,"developer":"GIANTS Software","year":2024,"genre":"Simulation","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":0,"copies_m":4.5},{"title":"Liar's Bar","app_id":null,"developer":"Curve Animation","year":2024,"genre":"Multiplayer party / social deduction","orig_fits":true,"orig_familiarity":5,"orig_max_novelty":4,"copies_m":3},{"title":"Chained Together","app_id":2567870,"developer":"Anegar Games","year":2024,"genre":"Co-op physics platformer","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":4},{"title":"R.E.P.O.","app_id":3241660,"developer":"Semiwork","year":2025,"genre":"Co-op survival horror","orig_fits":true,"orig_familiarity":3,"orig_max_novelty":4,"copies_m":11},{"title":"Schedule I","app_id":3164500,"developer":"TVGS (Tyler's Video Game Studio)","year":2025,"genre":"Business/crime management simulation","orig_fits":true,"orig_familiarity":4,"orig_max_novelty":4,"copies_m":8},{"title":"Hollow Knight: Silksong","app_id":1030300,"developer":"Team Cherry","year":2025,"genre":"Metroidvania / Action-adventure platformer","orig_fits":false,"orig_familiarity":3,"orig_max_novelty":0,"copies_m":7}]
const A = (typeof args === 'object' && args) ? args : {}
const HITS = (Array.isArray(A.hits) && A.hits.length) ? A.hits : HITS_INLINE
const SEED = (A && A.seed) || 20260703
const CONTROL_TARGET = 111          // 1:1 with hits (windowed)
const OVERSAMPLE = 150              // discover more, then eligibility-filter down
const BAND_QUOTA = { moderate: 45, modest: 40, flop: 26 } // near-miss overweighted
const MDL = { disc: 'sonnet', audit: 'sonnet', code: 'sonnet', analyze: 'opus', synth: 'opus' }
const TODAY = '2026-07-03'

// Identical hypothesis rubric as phase 1 — this is the whole point.
const HYPOTHESIS_RUBRIC = `
Code the game's design DNA for the hypothesis "a hit takes an ALREADY GLOBALLY-FAMILIAR
game/concept and adds ONE OR MORE novel, user-friendly twists". Code on DESIGN MERITS
ALONE — do NOT consider whether the game sold well.
  - base_familiarity_score (1-5): 5 = famous even to non-gamers (Russian roulette,
    hide-and-seek, tag, liar's dice); 3 = famous within gaming (Prop Hunt, roguelike,
    extraction shooter); 1 = obscure / genuinely original, no clear base.
  - A "twist" is a concrete departure (mechanic swap, genre fusion, co-op/social layer,
    embodiment, aesthetic reframe, roguelike layer, radical simplification, price/scope
    disruption). twist_novelty_score 1-5 (5 = not seen before this game).
  - base_concept_type "original_no_clear_base" ⇒ fits=false by design (falsifiability).
The deterministic verdict fits = (base_familiarity>=3) AND (twist_present) AND
(max twist_novelty>=3) is computed downstream — you only supply the inputs honestly.`

// ============================================================================
//  SECTION 1 — deterministic PRNG (Math.random is sandbox-banned)
// ============================================================================
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(SEED)
function seededSample(arr, n) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {   // seeded Fisher-Yates
    const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

// ============================================================================
//  SECTION 2 — coarse genre bucketing (for antecedent matching)
// ============================================================================
const GENRE_RULES = [
  ['extraction-coop-horror', /extraction|lethal|found.?footage|content warning|coop.*horror|co-op.*horror/i],
  ['coop-party-physics', /physics|ragdoll|foddian|chained|party|climb|only up|getting over/i],
  ['social-deduction', /social deduction|among us|traitor|impostor|deception|werewolf|bluff|liar/i],
  ['survival-horror', /survival horror|horror|phasmo|ghost|scary/i],
  ['roguelike', /rogueli|roguelite|vampire survivors|hades|deck.?build|card battler/i],
  ['survival-craft', /survival|craft|open.?world surviv|base.?build|voxel/i],
  ['farming-life-sim', /farming|life sim|cozy|stardew|animal|fishing|cooking/i],
  ['shooter', /shooter|fps|first-person shooter|third-person shooter|battle royale|tactical/i],
  ['soulslike-action', /soulslike|souls|action rpg|hack.?and.?slash|character action|elden|sekiro/i],
  ['arpg-looter', /\barpg\b|action role-playing|diablo|path of exile|looter/i],
  ['strategy-4x', /strategy|4x|grand strateg|city build|colony|tower defense|rts|auto.?battler|manor/i],
  ['fighting', /fighting|fighter|versus|tekken|street fighter|brawler/i],
  ['sports-racing', /sports|racing|football|soccer|basketball|nba|driving|sim racing/i],
  ['sandbox-sim', /simulator|simulation|management|tycoon|business|job|supermarket|automation|factory/i],
  ['narrative-adventure', /narrative|adventure|story|visual novel|walking sim|puzzle|platformer|metroidvania/i],
]
function coarseGenre(g, extra) {
  const s = ((g || '') + ' ' + (extra || '')).toLowerCase()
  for (const [bucket, re] of GENRE_RULES) if (re.test(s)) return bucket
  return 'other'
}

// ============================================================================
//  SECTION 3 — SCHEMAS
// ============================================================================
const twistItem = {
  type: 'object',
  properties: {
    twist_type: { type: 'string', enum: ['mechanical_swap', 'genre_fusion', 'co_op_social_layer', 'input_embodiment', 'aesthetic_reframe', 'procedural_roguelike_layer', 'physics_jank_emergence', 'accessibility_simplification', 'narrative_reframe', 'price_or_scope_disruption'] },
    twist_description: { type: 'string' },
    twist_novelty_score: { type: 'integer', minimum: 1, maximum: 5 },
  },
  required: ['twist_type', 'twist_novelty_score'],
}
const ControlCandidateSchema = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          steam_app_id: { type: ['integer', 'null'] },
          developer: { type: ['string', 'null'] },
          release_year: { type: ['integer', 'null'] },
          est_copies_thousands: { type: ['number', 'null'] },
          review_count_est: { type: ['integer', 'null'] },
          looks_like_asset_flip: { type: 'boolean' },
          source: { type: 'string' },
        },
        required: ['title', 'source'],
      },
    },
  },
  required: ['candidates'],
}
const BandAuditSchema = {
  type: 'object',
  properties: {
    canonical_title: { type: 'string' },
    est_copies_thousands: { type: ['number', 'null'] },
    review_count: { type: ['integer', 'null'] },
    peak_ccu: { type: ['integer', 'null'] },
    band: { type: 'string', enum: ['flop', 'modest', 'moderate', 'would_be_hit_1M_plus'] },
    band_confidence: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
    shipped_and_tried: { type: 'boolean' },
    eligibility_reason: { type: 'string' },
    inflation_flags: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' } },
  },
  required: ['band', 'shipped_and_tried'],
}
// BLIND design-DNA — no sales/reviews/ccu/arm. Ex-ante positioning only.
const BlindCodeSchema = {
  type: 'object',
  properties: {
    canonical_title: { type: 'string' },
    base_concept_name: { type: 'string' },
    base_concept_type: { type: 'string', enum: ['real_world_game', 'established_videogame_genre_or_mode', 'physical_party_activity', 'licensed_or_franchise_IP', 'folklore_mythology', 'original_no_clear_base'] },
    base_familiarity_score: { type: 'integer', minimum: 1, maximum: 5 },
    twist_present: { type: 'boolean' },
    twists: { type: 'array', items: twistItem },
    primary_hook_one_sentence: { type: 'string' },
    // ex-ante positioning (set at/ before launch — legitimate discriminators)
    co_op: { type: 'boolean' },
    player_count_max: { type: ['integer', 'null'] },
    price_usd_launch: { type: ['number', 'null'] },
    art_style: { type: ['string', 'null'] },
    production_value_tier: { type: ['integer', 'null'], minimum: 1, maximum: 5 },
    team_size: { type: ['integer', 'null'] },
    solo_dev: { type: 'boolean' },
    is_sequel: { type: 'boolean' },
    is_licensed_IP: { type: 'boolean' },
    is_new_original_IP: { type: 'boolean' },
    research_confidence: { type: 'integer', minimum: 1, maximum: 5 },
    sources_count: { type: ['integer', 'null'] },
    outcome_leaked: { type: 'boolean' },
    leaked_note: { type: ['string', 'null'] },
  },
  required: ['base_concept_type', 'base_familiarity_score', 'twist_present'],
}
const DimensionSchema = {
  type: 'object',
  properties: {
    dimension: { type: 'string' }, headline: { type: 'string' }, findings: { type: 'string' },
    tables: { type: 'array', items: { type: 'object' } }, caveats: { type: 'string' },
  },
  required: ['dimension', 'headline', 'findings'],
}

// ============================================================================
//  SECTION 4 — PROMPTS
// ============================================================================
function discoveryPrompt(bucket, band, exclude) {
  const bandDesc = {
    moderate: 'sold roughly 100,000 to 800,000 copies (a near-miss: found a real audience but did NOT break out to 1M)',
    modest: 'sold roughly 10,000 to 100,000 copies (shipped, got some traction, did not break out)',
    flop: 'sold roughly 1,000 to 10,000 copies (a genuine commercial failure that nonetheless really shipped)',
  }[band]
  return `You are a games-market researcher. Today is ${TODAY}. Use web search + estimator sites (Gamalytic, VG Insights, SteamSpy, SteamDB).
TASK: list Steam games in the "${bucket}" genre bucket, RELEASED 2020-2026, that ${bandDesc}.
These are CONTROLS for a study — we specifically want games that did NOT reach 1,000,000 copies. Do NOT list famous 1M+ hits.
Requirements: real, playable, genuinely-shipped games (a coherent concept + real mechanics on the Steam store page). It is FINE — encouraged — to include ugly, low-budget, solo-dev, or poorly-reviewed games as long as they earnestly shipped. EXCLUDE asset-flips, troll/shovelware uploads, non-game "software", and permanently-unreleased/abandoned pages.
For each: title, steam_app_id if known, developer, release_year, est_copies_thousands (your best estimate in THOUSANDS, e.g. 45 = 45k), review_count_est, and looks_like_asset_flip.
Return 8-20 candidates. Prefer breadth. ${exclude.length ? 'Do NOT include these known hits: ' + exclude.slice(0, 60).join('; ') : ''}`
}
function auditPrompt(c) {
  return `You are an adversarial outcome auditor. Today is ${TODAY}. Steam never publishes sales; all figures are estimates.
Independently research "${c.title}"${c.steam_app_id ? ` (appid ${c.steam_app_id})` : ''}${c.developer ? `, dev ${c.developer}` : ''} and determine its commercial BAND. Cross-check >=2 methods (Boxleiter: review_count x ~30-60; owner bands; peak CCU).
Assign band: flop (<10k copies) | modest (10k-100k) | moderate (100k-~800k) | would_be_hit_1M_plus (>=~1M — do NOT let a real hit slip into the control group). Give band_confidence A/B/C/D and inflation_flags.
ALSO judge shipped_and_tried: TRUE if it is a real, playable, genuinely-released game (coherent concept + real mechanics + minimal market exposure, ~>=20 reviews OR a verified owner band). FALSE only for asset-flips, troll/shovelware, non-games, or abandoned/never-really-released pages. DO NOT fail a game for being ugly, low-budget, solo-made, or badly reviewed — earnestness, not quality.`
}
function blindCodePrompt(item) {
  return `You are a game-design analyst. Today is ${TODAY}. Code ONE game's DESIGN on its merits. Use web search but read primarily the STEAM STORE PAGE (description, tags, screenshots, trailer) and general design coverage.

GAME: "${item.title}"${item.app_id ? ` (appid ${item.app_id})` : ''}${item.developer ? `, dev ${item.developer}` : ''}${item.year ? `, ${item.year}` : ''}.

CRITICAL — you are coding BLIND to commercial outcome. Do NOT seek out or rely on sales figures, review COUNTS, or player counts. Code purely from what the game IS. If you incidentally see how well it sold, set outcome_leaked=true, note it, and still code on design grounds only. Record sources_count = how many distinct sources you consulted (keep it small; the store page is usually enough).

${HYPOTHESIS_RUBRIC}

Provide: base_concept_name, base_concept_type, base_familiarity_score, twists[] (type+novelty+desc), twist_present, primary_hook, and ex-ante positioning set at launch: co_op, player_count_max, price_usd_launch, art_style, production_value_tier (1-5 by apparent polish/scope), team_size, solo_dev, is_sequel, is_licensed_IP, is_new_original_IP, research_confidence (1-5; low is fine for obscure games — do not refuse), sources_count, outcome_leaked.`
}
function dimensionPrompt(dim, stats, sample) {
  return `You are a data analyst interpreting a matched control-group study (Steam 1M+ HITS vs comparable non-hit CONTROLS, 2020-2026, all coded BLIND with an identical rubric). Reason ONLY from the computed statistics + sample rows below. Be quantitative and precise about what the numbers do and do not show. This is observational — association, not causation.

DIMENSION: ${dim.key} — ${dim.desc}

COMPUTED STATISTICS:
${JSON.stringify(stats)}

SAMPLE ROWS (arm, band, blind design-DNA), ${sample.length}:
${JSON.stringify(sample)}

Return: a one-line headline, a findings paragraph citing the exact numbers (RD/OR/CI/trend as relevant), optional small tables, and caveats. If a contrast's CI crosses zero or RD<15pts, say it is INCONCLUSIVE (not "no difference").`
}
function redteamPrompt(stats) {
  return `You are a skeptical methodologist. A study built a "loser control group" to test whether "familiar base + novel twist" discriminates Steam 1M+ hits from non-hits. Stats: ${JSON.stringify(stats)}.
Write the STRONGEST honest rebuttal in KOREAN (4-7 sentences): attack the control group as potentially rigged (eligibility filter, band misclassification, information-availability asymmetry inflating twist detection on well-documented hits), the residual confounding (marketing, wishlists, timing, luck), the attenuation-toward-null from coding noise (so a null is partly explainable by noise), and that this remains association, not causation. Be specific to the numbers.`
}
function reportPrompt(stats, dims, redteamKo, criticKo) {
  return `Write a KOREAN (한국어) comparison report in clean GitHub Markdown. Today ${TODAY}. Audience: a game designer/founder. Base every claim ONLY on the data. Game names in original language.

This is PHASE 2 (control-group extension) of a study whose PHASE 1 found 55% of 111 Steam 1M+ hits "fit" the "익숙한 베이스 + 독창적 변주" pattern — but winners-only, so it could not show the pattern DISCRIMINATES hits. Phase 2 added a matched, blind-coded control group of non-hits.

COMPUTED STATS: ${JSON.stringify(stats)}
DIMENSION FINDINGS: ${JSON.stringify(dims)}
RED-TEAM (한국어, include verbatim in a box): ${redteamKo}
COMPLETENESS CRITIC: ${criticKo}

Required sections (한국어):
1. "## 핵심 결론" — Does "익숙한 베이스 + 변주"(fits) actually discriminate hits from comparable non-hits? Give P(fits|hit) vs P(fits|control) BOTH BLIND, the risk difference + OR with CIs, and whether it is conclusive (RD>=~18pt powered; RD<15 = 결론 불가). State the answer plainly.
2. "## 단조 추세 (flop→modest→moderate→hit)" — the 4-band gradient + Cochran-Armitage; is there a dose-response?
3. "## 무엇이 실제로 히트를 가르나 — 게이트 분해 & 특징 랭킹" — decompose fits into its 3 gates (familiarity>=3 / twist_present / novelty>=3): which gate carries the signal? Then the ex-ante feature discrimination ranking (specific twist types, price, co-op, team size). Highlight if "익숙한 베이스" does NOT discriminate but a specific twist / price / co-op does.
3b. Note the ex-ante vs reception distinction: reception traits (streamer/short-form virality) are CONSEQUENCES of being a hit and were excluded from discrimination as circular.
4. "## 확증편향 정량화" — blind hit fits-rate vs phase-1's unblinded 55%; the delta; inter-coder disagreement.
5. "## 수정된 테제" — given all this, restate what the data supports: is the hypothesis a discriminator, a necessary-not-sufficient trait, or non-discriminating?
6. "## 한계" — include the red-team box; association≠causation; control-as-convenience-sample; attenuation-toward-null; matching imperfection; leakage.
Return ONLY the markdown.`
}

// ============================================================================
//  SECTION 5 — STATS (deterministic)
// ============================================================================
const computeFits = c => (c.base_familiarity_score >= 3) && !!c.twist_present &&
  ((Array.isArray(c.twists) ? c.twists : []).reduce((m, t) => Math.max(m, t.twist_novelty_score || 0), 0) >= 3)
const maxNov = c => (Array.isArray(c.twists) ? c.twists : []).reduce((m, t) => Math.max(m, t.twist_novelty_score || 0), 0)
const r2 = x => Math.round(x * 1000) / 1000
function wilson(k, n) {
  if (!n) return [0, 0]
  const z = 1.96, p = k / n, d = 1 + z * z / n
  const c = (p + z * z / (2 * n)) / d
  const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
  return [r2(Math.max(0, c - h)), r2(Math.min(1, c + h))]
}
function twoByTwo(hitK, hitN, ctrlK, ctrlN) {
  const p1 = hitK / hitN, p2 = ctrlK / ctrlN
  const rd = p1 - p2
  const rdSE = Math.sqrt(p1 * (1 - p1) / hitN + p2 * (1 - p2) / ctrlN)
  const a = hitK + 0.5, b = hitN - hitK + 0.5, c = ctrlK + 0.5, d = ctrlN - ctrlK + 0.5
  const or = (a * d) / (b * c)
  const logSE = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d)
  return {
    p_hit: r2(p1), p_hit_ci: wilson(hitK, hitN), p_ctrl: r2(p2), p_ctrl_ci: wilson(ctrlK, ctrlN),
    risk_difference: r2(rd), rd_ci: [r2(rd - 1.96 * rdSE), r2(rd + 1.96 * rdSE)], rd_points: Math.round(rd * 100),
    risk_ratio: p2 ? r2(p1 / p2) : null,
    odds_ratio: r2(or), or_ci: [r2(Math.exp(Math.log(or) - 1.96 * logSE)), r2(Math.exp(Math.log(or) + 1.96 * logSE))],
    powered: Math.abs(rd) >= 0.18, verdict: Math.abs(rd) < 0.15 ? 'INCONCLUSIVE (RD<15pt)' : (rd > 0 ? 'fits MORE common in hits' : 'fits MORE common in controls'),
  }
}
function cochranArmitage(bands) { // bands: [{score, n, k}]
  const N = bands.reduce((s, b) => s + b.n, 0), R = bands.reduce((s, b) => s + b.k, 0)
  if (!N || !R || R === N) return { z: null, p: null, note: 'degenerate' }
  const p = R / N
  const num = bands.reduce((s, b) => s + b.score * (b.k - b.n * p), 0)
  const sumNt = bands.reduce((s, b) => s + b.n * b.score, 0)
  const sumNt2 = bands.reduce((s, b) => s + b.n * b.score * b.score, 0)
  const varT = p * (1 - p) * (sumNt2 - sumNt * sumNt / N)
  if (varT <= 0) return { z: null, p: null, note: 'zero variance' }
  const z = num / Math.sqrt(varT)
  const pval = 2 * (1 - normCdf(Math.abs(z)))
  return { z: r2(z), p: r2(pval), monotone_increasing: z > 0 }
}
function normCdf(x) { // Abramowitz-Stegun
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-x * x / 2)
  let pr = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - pr : pr
}
function featureContrast(hits, ctrls, pred, label) {
  const hK = hits.filter(pred).length, cK = ctrls.filter(pred).length
  const t = twoByTwo(hK, hits.length, cK, ctrls.length)
  return { feature: label, hit_pct: Math.round(t.p_hit * 100), ctrl_pct: Math.round(t.p_ctrl * 100), rd_points: t.rd_points, odds_ratio: t.odds_ratio }
}

// ============================================================================
//  SECTION 6 — PHASES
// ============================================================================
async function discoverControls() {
  // target buckets = coarse-genre distribution of the hits (antecedent match)
  const bucketWeights = {}
  for (const h of HITS) {
    if (!(h.year >= 2020 && h.year <= 2026)) continue
    const b = coarseGenre(h.genre)
    bucketWeights[b] = (bucketWeights[b] || 0) + 1
  }
  const buckets = Object.keys(bucketWeights).filter(b => b !== 'other').concat(['other'])
  const excludeHits = HITS.map(h => h.title)
  const bands = ['moderate', 'modest', 'flop']
  const jobs = []
  for (const bucket of buckets) for (const band of bands) jobs.push({ bucket, band })
  log(`Control discovery: ${jobs.length} (bucket × band) frame pulls across ${buckets.length} genre buckets`)
  const rows = await parallel(jobs.map(j => () =>
    agent(discoveryPrompt(j.bucket, j.band, excludeHits), {
      label: `disc:${j.bucket}:${j.band}`, phase: 'Discover', schema: ControlCandidateSchema, model: MDL.disc, effort: 'low',
    }).then(r => ({ ...(r || {}), _bucket: j.bucket, _band: j.band }))))

  // merge + dedup + basic eligibility (drop obvious asset flips + known hits)
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const hitNorms = new Set(HITS.map(h => norm(h.title)))
  const master = new Map()
  for (const r of rows) {
    if (!r || !Array.isArray(r.candidates)) continue
    for (const c of r.candidates) {
      if (!c || !c.title) continue
      const k = c.steam_app_id ? 'id' + c.steam_app_id : 'nm' + norm(c.title)
      if (hitNorms.has(norm(c.title))) continue           // never a known hit
      if (c.looks_like_asset_flip) continue
      if (!master.has(k)) master.set(k, { title: c.title, steam_app_id: c.steam_app_id || null, developer: c.developer || null, release_year: c.release_year || null, est_copies_thousands: c.est_copies_thousands ?? null, review_count_est: c.review_count_est ?? null, bucket: r._bucket, disc_band: r._band })
    }
  }
  let pool = [...master.values()].filter(c => (c.release_year == null) || (c.release_year >= 2020 && c.release_year <= 2026))
  // seeded random draw, with band quotas from discovery-band label
  const byBand = { moderate: [], modest: [], flop: [] }
  for (const c of pool) (byBand[c.disc_band] || byBand.modest).push(c)
  let picked = []
  for (const band of Object.keys(BAND_QUOTA)) picked = picked.concat(seededSample(byBand[band] || [], BAND_QUOTA[band]))
  if (picked.length < CONTROL_TARGET) { // backfill from remaining
    const chosen = new Set(picked.map(c => c.title))
    picked = picked.concat(seededSample(pool.filter(c => !chosen.has(c.title)), OVERSAMPLE - picked.length))
  }
  picked = picked.slice(0, OVERSAMPLE)
  log(`Discovered ${pool.length} eligible candidates → sampled ${picked.length} for audit`)
  return picked
}

async function auditControls(cands) {
  const audited = await pipeline(cands,
    (c) => agent(auditPrompt(c), { label: `audit:${c.title}`, phase: 'Audit', schema: BandAuditSchema, model: MDL.audit, effort: 'medium' })
      .then(v => (v ? { ...c, audit: v } : null)))
  // keep eligible, non-hit; map band; cap to CONTROL_TARGET keeping near-miss weight
  const bandMap = { flop: 'flop', modest: 'modest', moderate: 'moderate', would_be_hit_1M_plus: 'HIT_LEAK' }
  const eligible = audited.filter(Boolean).filter(c => c.audit.shipped_and_tried && bandMap[c.audit.band] !== 'HIT_LEAK')
    .map(c => ({ ...c, band: bandMap[c.audit.band] || 'modest' }))
  const byBand = { moderate: [], modest: [], flop: [] }
  for (const c of eligible) (byBand[c.band] || byBand.modest).push(c)
  let final = []
  for (const band of Object.keys(BAND_QUOTA)) final = final.concat(seededSample(byBand[band], BAND_QUOTA[band]))
  const chosen = new Set(final.map(c => c.title))
  if (final.length < CONTROL_TARGET) final = final.concat(seededSample(eligible.filter(c => !chosen.has(c.title)), CONTROL_TARGET - final.length))
  final = final.slice(0, CONTROL_TARGET)
  const leaked = audited.filter(Boolean).filter(c => bandMap[c.audit.band] === 'HIT_LEAK').length
  log(`Audited ${audited.filter(Boolean).length}; ${eligible.length} eligible non-hits; ${leaked} would-be-hits excluded; final controls ${final.length}`)
  return final
}

async function blindCodePool(controls) {
  // pool = controls + hits, outcome stripped; each coded blind and independently.
  const pool = controls.map(c => ({ title: c.title, app_id: c.steam_app_id, developer: c.developer, year: c.release_year, arm: 'control', band: c.band }))
    .concat(HITS.map(h => ({ title: h.title, app_id: h.app_id, developer: h.developer, year: h.year, arm: 'hit', band: 'hit', orig: h })))
  log(`Blind coding ${pool.length} items (${controls.length} controls + ${HITS.length} hits), outcome-stripped`)
  const coded = await pipeline(pool,
    (item) => agent(blindCodePrompt(item), { label: `code:${item.arm}:${item.title}`, phase: 'BlindCode', schema: BlindCodeSchema, model: MDL.code, effort: 'medium' })
      .then(code => (code ? { ...item, code, fits: computeFits(code) } : null)))
  return coded.filter(Boolean)
}

function buildStats(coded) {
  const hits = coded.filter(r => r.arm === 'hit')
  const ctrls = coded.filter(r => r.arm === 'control')
  const c = r => r.code
  // primary 2x2 (blind)
  const main = twoByTwo(hits.filter(r => r.fits).length, hits.length, ctrls.filter(r => r.fits).length, ctrls.length)
  // 4-band gradient
  const bandScore = { flop: 0, modest: 1, moderate: 2, hit: 3 }
  const bandRows = ['flop', 'modest', 'moderate', 'hit'].map(b => {
    const g = coded.filter(r => r.band === b)
    return { band: b, score: bandScore[b], n: g.length, k: g.filter(r => r.fits).length, fits_pct: g.length ? Math.round(g.filter(r => r.fits).length / g.length * 100) : null }
  })
  const trend = cochranArmitage(bandRows.filter(b => b.n > 0).map(b => ({ score: b.score, n: b.n, k: b.k })))
  // gate decomposition
  const gate = (pred, label) => featureContrast(hits, ctrls, pred, label)
  const gates = [
    gate(r => c(r).base_familiarity_score >= 3, 'gate: familiarity>=3'),
    gate(r => !!c(r).twist_present, 'gate: twist_present'),
    gate(r => maxNov(c(r)) >= 3, 'gate: max_novelty>=3'),
  ]
  // ex-ante feature discrimination
  const twistTypes = ['aesthetic_reframe', 'co_op_social_layer', 'genre_fusion', 'mechanical_swap', 'price_or_scope_disruption', 'narrative_reframe', 'accessibility_simplification', 'physics_jank_emergence', 'input_embodiment', 'procedural_roguelike_layer']
  const feats = [
    gate(r => c(r).base_familiarity_score >= 4, 'familiarity>=4'),
    gate(r => maxNov(c(r)) >= 4, 'novelty>=4'),
    gate(r => !!c(r).co_op, 'co_op'),
    gate(r => typeof c(r).price_usd_launch === 'number' && c(r).price_usd_launch < 10, 'price<$10'),
    gate(r => typeof c(r).price_usd_launch === 'number' && c(r).price_usd_launch < 20, 'price<$20'),
    gate(r => (c(r).team_size && c(r).team_size <= 5) || c(r).solo_dev, 'team<=5/solo'),
    gate(r => !!c(r).is_sequel, 'is_sequel'),
    gate(r => !!c(r).is_licensed_IP, 'licensed_IP'),
    gate(r => !!c(r).is_new_original_IP, 'new_original_IP'),
    ...twistTypes.map(t => gate(r => (c(r).twists || []).some(x => x.twist_type === t), 'twist:' + t)),
  ].sort((a, b) => Math.abs(b.rd_points) - Math.abs(a.rd_points))
  // confirmation-bias quantification: blind hit fits vs original unblinded
  const hitsWithOrig = hits.filter(r => r.orig)
  const blindFit = hitsWithOrig.filter(r => r.fits).length
  const origFit = hitsWithOrig.filter(r => r.orig.orig_fits).length
  const disagree = hitsWithOrig.filter(r => r.fits !== r.orig.orig_fits).length
  const leakRate = Math.round(coded.filter(r => c(r).outcome_leaked).length / coded.length * 100)
  // leakage sensitivity: 2x2 on non-leaked only
  const hNL = hits.filter(r => !c(r).outcome_leaked), cNL = ctrls.filter(r => !c(r).outcome_leaked)
  const mainNoLeak = (hNL.length && cNL.length) ? twoByTwo(hNL.filter(r => r.fits).length, hNL.length, cNL.filter(r => r.fits).length, cNL.length) : null
  // confidence sensitivity: research_confidence>=3
  const hHC = hits.filter(r => (c(r).research_confidence || 0) >= 3), cHC = ctrls.filter(r => (c(r).research_confidence || 0) >= 3)
  const mainHiConf = (hHC.length && cHC.length) ? twoByTwo(hHC.filter(r => r.fits).length, hHC.length, cHC.filter(r => r.fits).length, cHC.length) : null

  return {
    generated: TODAY, window: '2020-2026', seed: SEED,
    n_hits: hits.length, n_controls: ctrls.length,
    control_band_counts: { flop: ctrls.filter(r => r.band === 'flop').length, modest: ctrls.filter(r => r.band === 'modest').length, moderate: ctrls.filter(r => r.band === 'moderate').length },
    primary_2x2_blind: main,
    band_gradient: bandRows, cochran_armitage: trend,
    gate_decomposition: gates,
    feature_discrimination_ranked: feats,
    confirmation_bias: { n: hitsWithOrig.length, blind_fits_pct: hitsWithOrig.length ? Math.round(blindFit / hitsWithOrig.length * 100) : null, original_unblinded_fits_pct: hitsWithOrig.length ? Math.round(origFit / hitsWithOrig.length * 100) : null, blind_vs_orig_disagreement_pct: hitsWithOrig.length ? Math.round(disagree / hitsWithOrig.length * 100) : null },
    sensitivity: { leak_rate_pct: leakRate, primary_no_leak: mainNoLeak, primary_hi_confidence: mainHiConf },
  }
}

async function analyze(coded, stats) {
  const sample = coded.map(r => ({ arm: r.arm, band: r.band, fits: r.fits, fam: r.code.base_familiarity_score, nov: maxNov(r.code), base_type: r.code.base_concept_type, twists: (r.code.twists || []).map(t => t.twist_type), co_op: r.code.co_op, price: r.code.price_usd_launch, team: r.code.team_size, leaked: r.code.outcome_leaked, conf: r.code.research_confidence }))
  const DIMS = [
    { key: 'primary_discrimination', desc: 'Does fits discriminate hits from controls? Interpret the 2x2 (RD/OR/CI) and whether it is conclusive.' },
    { key: 'monotone_gradient', desc: 'Interpret the flop→modest→moderate→hit fits gradient and Cochran-Armitage trend.' },
    { key: 'gate_decomposition', desc: 'Which of the 3 fits gates (familiarity>=3 / twist_present / novelty>=3) actually separates hits from controls?' },
    { key: 'feature_discrimination', desc: 'From the ranked ex-ante feature table, what ACTUALLY separates hits from controls (specific twist types, price, co-op, team)? Contrast with what does NOT.' },
    { key: 'confirmation_bias', desc: 'Interpret blind hit fits-rate vs phase-1 unblinded 55%; the delta and disagreement as a measure of coding bias/noise.' },
    { key: 'revised_thesis', desc: 'Synthesize: is "familiar base + twist" a discriminator, necessary-not-sufficient, or non-discriminating? What is the honest revised claim?' },
  ]
  return await parallel(DIMS.map(d => () => agent(dimensionPrompt(d, stats, sample), { label: `dim:${d.key}`, phase: 'Compare', schema: DimensionSchema, model: MDL.analyze, effort: 'high' }))).then(a => a.filter(Boolean))
}

async function synthesize(stats, dims) {
  const [redteamKo, criticKo] = await parallel([
    () => agent(redteamPrompt(stats), { label: 'red-team', phase: 'Synthesis', model: MDL.synth, effort: 'high' }),
    () => agent(`In 2-4 Korean sentences, critique completeness of this control study given stats ${JSON.stringify(stats)}: what genres/bands are thin, what would strengthen it?`, { label: 'critic', phase: 'Synthesis', model: MDL.synth, effort: 'medium' }),
  ])
  const report = await agent(reportPrompt(stats, dims, redteamKo || '', criticKo || ''), { label: 'final-report', phase: 'Synthesis', model: MDL.synth, effort: 'high' })
  return { redteamKo, criticKo, report }
}

// ============================================================================
//  MAIN
// ============================================================================
if (!HITS.length) throw new Error('args.hits is empty — pass the phase-1 hits payload via args')

phase('Discover')
const cands = await discoverControls()

phase('Audit')
const controls = await auditControls(cands)

phase('BlindCode')
const coded = await blindCodePool(controls)
log(`Blind coding complete: ${coded.filter(r => r.arm === 'control').length} controls + ${coded.filter(r => r.arm === 'hit').length} hits`)

const stats = buildStats(coded)
log(`Primary blind 2x2: fits hit ${stats.primary_2x2_blind.p_hit} vs control ${stats.primary_2x2_blind.p_ctrl} | RD ${stats.primary_2x2_blind.rd_points}pt | OR ${stats.primary_2x2_blind.odds_ratio} | ${stats.primary_2x2_blind.verdict}`)

phase('Compare')
const dims = await analyze(coded, stats)

phase('Synthesis')
const synth = await synthesize(stats, dims)

return {
  meta: { window: '2020-2026', generated: TODAY, seed: SEED, phase: 'control-study' },
  stats,
  coded: coded.map(r => ({ title: r.title, app_id: r.app_id, developer: r.developer, year: r.year, arm: r.arm, band: r.band, fits: r.fits, code: r.code, orig: r.orig ? { fits: r.orig.orig_fits, familiarity: r.orig.orig_familiarity, max_novelty: r.orig.orig_max_novelty, copies_m: r.orig.copies_m } : null })),
  dimensions: dims,
  redteam_ko: synth.redteamKo,
  critic_ko: synth.criticKo,
  report_markdown: synth.report,
}
