# iMapa pozemku

Webová appka (PWA) s mapou záhrady a denníkom ku každej rastline. Beží na GitHub Pages, dáta a fotky sú na zdieľanom Google Disku za prihlásením cez Google.

Repozitár obsahuje len kód. Údaje o konkrétnom pozemku (hranice, model domu, ortofotá, `garden.json`) sa sem neukladajú.

## Nástroje (`tools/`)

Skripty pre Node.js na prípravu podkladov. Inštalácia: `cd tools && npm install`.

| Skript | Čo robí |
| --- | --- |
| `step_info.mjs <subor.stp>` | Vypíše telesá zo STEP a ich rozmery v mm |
| `step_tree.mjs <subor.stp>` | Vypíše strom zostavy STEP |
| `step_footprint.mjs <subor.stp> <vystup.svg>` | Pôdorys telies ako SVG |
| `fit_house.mjs` | Osadí model domu do S-JTSK podľa rohov strechy z ortofota, zapíše `data/georef.json` |
| `overlay_check.mjs` | Kontrolný náhľad: ortofoto, hranice KN a osadený model |

## Zdroje dát

Ortofoto, terén a hranice parciel: © ÚGKK SR, licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
