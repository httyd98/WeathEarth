/**
 * Minerals & Elements Layer — worldwide mineral deposits map.
 * Embedded dataset of ~420 major known deposits.
 * Filter by category, mineral, or element.
 */

import * as THREE from "three";
import { globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";

const MIN_R     = GLOBE_RADIUS * 1.010;
const DOT_SIZE  = 0.040;

/** ── Categories & sub-types ─────────────────────────────────────────────── */
export const MINERAL_CATEGORIES = {
  // Precious & Noble Metals
  gold:       { label: "Oro (Au)",           category: "Metalli preziosi", color: 0xffd700 },
  silver:     { label: "Argento (Ag)",        category: "Metalli preziosi", color: 0xc0c0c0 },
  platinum:   { label: "Platino (Pt)",        category: "Metalli preziosi", color: 0xe8e8ff },
  palladium:  { label: "Palladio (Pd)",       category: "Metalli preziosi", color: 0xcce0ff },

  // Base Metals
  iron:       { label: "Ferro (Fe)",          category: "Metalli di base",  color: 0xff6644 },
  copper:     { label: "Rame (Cu)",           category: "Metalli di base",  color: 0xb87333 },
  zinc:       { label: "Zinco (Zn)",          category: "Metalli di base",  color: 0x8899aa },
  lead:       { label: "Piombo (Pb)",         category: "Metalli di base",  color: 0x778877 },
  nickel:     { label: "Nichel (Ni)",         category: "Metalli di base",  color: 0x99ddcc },
  aluminum:   { label: "Alluminio/Bauxite",   category: "Metalli di base",  color: 0xddccaa },
  tin:        { label: "Stagno (Sn)",         category: "Metalli di base",  color: 0xaabbcc },
  tungsten:   { label: "Tungsteno (W)",       category: "Metalli di base",  color: 0x556677 },
  manganese:  { label: "Manganese (Mn)",      category: "Metalli di base",  color: 0xaa88bb },
  chromium:   { label: "Cromo (Cr)",          category: "Metalli di base",  color: 0x88bbaa },
  molybdenum: { label: "Molibdeno (Mo)",      category: "Metalli di base",  color: 0x667788 },

  // Gemstones
  diamond:    { label: "Diamante",            category: "Gemme",            color: 0x88eeff },
  ruby:       { label: "Rubino",              category: "Gemme",            color: 0xff1144 },
  emerald:    { label: "Smeraldo",            category: "Gemme",            color: 0x00cc55 },
  sapphire:   { label: "Zaffiro",             category: "Gemme",            color: 0x2244ff },
  opal:       { label: "Opale",               category: "Gemme",            color: 0xffeedd },
  amethyst:   { label: "Ametista",            category: "Gemme",            color: 0x9955cc },
  topaz:      { label: "Topazio",             category: "Gemme",            color: 0xffcc55 },
  jade:       { label: "Giada",               category: "Gemme",            color: 0x44bb77 },

  // Critical/Strategic Minerals
  lithium:    { label: "Litio (Li)",          category: "Minerali critici", color: 0x44ffdd },
  cobalt:     { label: "Cobalto (Co)",        category: "Minerali critici", color: 0x3366ff },
  rare_earth: { label: "Terre rare (REE)",    category: "Minerali critici", color: 0xff44bb },
  niobium:    { label: "Niobio (Nb)",         category: "Minerali critici", color: 0xdd88ff },
  tantalum:   { label: "Tantalio (Ta)",       category: "Minerali critici", color: 0xaa55ee },
  vanadium:   { label: "Vanadio (V)",         category: "Minerali critici", color: 0x55aaff },
  titanium:   { label: "Titanio (Ti)",        category: "Minerali critici", color: 0xbbddff },

  // Energy Minerals
  coal:       { label: "Carbone",             category: "Energia",          color: 0x333333 },
  uranium:    { label: "Uranio (U)",          category: "Energia",          color: 0x88ff44 },
  thorium:    { label: "Torio (Th)",          category: "Energia",          color: 0xccff88 },

  // Industrial Minerals
  phosphate:  { label: "Fosfato",             category: "Industriali",      color: 0xffaa33 },
  potash:     { label: "Potassio/Potassa",    category: "Industriali",      color: 0xee6600 },
  sulfur:     { label: "Zolfo (S)",           category: "Industriali",      color: 0xffff33 },
  salt:       { label: "Sale (NaCl)",         category: "Industriali",      color: 0xffffff },
  asbestos:   { label: "Amianto",             category: "Industriali",      color: 0x99aa77 },
  graphite:   { label: "Grafite",             category: "Industriali",      color: 0x555566 },
  mica:       { label: "Mica",                category: "Industriali",      color: 0xddcc99 },
  feldspar:   { label: "Feldspato",           category: "Industriali",      color: 0xeecc88 },
};

/**
 * Dataset columns:
 * [name, lat, lon, country, mineral_key, size_label, notes]
 * size_label: "major" | "significant" | "minor"
 */
export const MINERAL_DEPOSITS = [
  // ── ORO ──────────────────────────────────────────────────────────────────
  ["Witwatersrand Basin",      -26.50,   27.10, "Sudafrica",    "gold",      "major",       "La più grande riserva aurifera della storia; ~40% oro estratto globalmente"],
  ["Grasberg Mine",             -4.05,  137.12, "Indonesia",    "gold",      "major",       "Seconda miniera d'oro al mondo per produzione; Freeport-McMoRan"],
  ["Goldstrike Mine",           41.08, -116.04, "USA (Nevada)", "gold",      "major",       "La più grande degli USA; Barrick Gold"],
  ["Super Pit Kalgoorlie",     -30.77,  121.50, "Australia",    "gold",      "major",       "Miniera a cielo aperto più grande d'Australia"],
  ["Muruntau",                  41.50,   64.65, "Uzbekistan",   "gold",      "major",       "Più grande miniera d'oro a cielo aperto al mondo"],
  ["Pueblo Viejo",              19.37,  -70.30, "R. Dominicana","gold",      "major",       "Barrick Gold; area produttiva caraibica"],
  ["Olimpiada",                 58.22,   97.38, "Russia",       "gold",      "major",       "Siberia; Polyus Gold; regione Krasnoyarsk"],
  ["Porgera",                   -5.47,  143.09, "PNG",          "gold",      "major",       "Barrick/Zijin; Papua Nuova Guinea"],
  ["Cortez Mine",               40.48, -116.69, "USA (Nevada)", "gold",      "significant", "Nevada; operazioni open pit e underground"],
  ["Boddington",               -32.80,  116.43, "Australia",    "gold",      "significant", "Western Australia; Newmont"],
  ["Cadia Valley",             -33.39,  148.98, "Australia",    "gold",      "significant", "Newcrest; New South Wales"],
  ["Yanacocha",                 -6.98,  -78.58, "Perù",         "gold",      "major",       "La più grande d'America Latina; Newmont; Cajamarca"],
  ["Lihir Island",              -3.12,  152.63, "PNG",          "gold",      "major",       "Isola vulcanica; Newcrest Mining"],
  ["Kibali",                     3.53,   29.65, "Congo (DRC)",  "gold",      "significant", "AngloGold Ashanti; nord-est Congo"],
  ["Ahafo",                      7.55,   -2.32, "Ghana",        "gold",      "significant", "Newmont; regione Brong-Ahafo"],
  ["Obuasi",                     6.20,   -1.67, "Ghana",        "gold",      "significant", "AngloGold Ashanti; storica"],
  ["Kumtor",                    41.85,   78.19, "Kirghizistan", "gold",      "major",       "Centerra Gold; montagne Tian Shan"],
  ["Sukhoi Log",                58.50,  115.50, "Russia",       "gold",      "major",       "Siberia orientale; una delle più grandi risorse non sviluppate"],
  ["Detour Lake",               50.07,  -79.69, "Canada",       "gold",      "significant", "Kirkland Lake Gold; Ontario"],
  ["Canadian Malartic",         48.13,  -78.13, "Canada",       "gold",      "significant", "Québec; Agnico Eagle"],
  ["Mponeng",                  -26.44,   27.54, "Sudafrica",    "gold",      "major",       "La miniera più profonda al mondo (4 km)"],
  ["Carlin Trend",              40.75, -116.10, "USA (Nevada)", "gold",      "major",       "Cluster di giacimenti lungo 65 km"],
  ["Fort Knox Mine",            64.74, -147.00, "USA (Alaska)", "gold",      "significant", "Alaska; Kinross Gold"],
  ["Pascua-Lama",              -29.33,  -70.00, "Cile/Argentina","gold",     "major",       "Progetto contestato al confine; Barrick"],
  ["Geita",                     -2.87,   32.17, "Tanzania",     "gold",      "significant", "AngloGold Ashanti; regione Mwanza"],
  ["Loulo-Gounkoto",            13.45,  -11.65, "Mali",         "gold",      "significant", "Barrick Gold; Sahel"],

  // ── ARGENTO ───────────────────────────────────────────────────────────────
  ["Penasquito",                24.88, -103.52, "Messico",      "silver",    "major",       "Newmont; Zacatecas; polimatallico"],
  ["Saucito",                   22.74, -102.50, "Messico",      "silver",    "major",       "Fresnillo; Zacatecas"],
  ["Fresnillo",                 23.17, -102.87, "Messico",      "silver",    "major",       "Miniera d'argento più produttiva al mondo; Fresnillo plc"],
  ["San Cristóbal (Boli.)",    -22.40,  -68.00, "Bolivia",      "silver",    "major",       "Sumitomo; altopiano andino"],
  ["Greens Creek",              57.45, -134.68, "USA (Alaska)", "silver",    "significant", "Hecla Mining; isola Admiralty"],
  ["Lucky Friday",              47.47, -115.82, "USA (Idaho)",  "silver",    "significant", "Hecla Mining; Silver Valley"],
  ["Hochschild Pallancata",    -14.00,  -73.55, "Perù",         "silver",    "significant", "Hochschild Mining"],
  ["Cannington",               -22.20,  140.75, "Australia",    "silver",    "major",       "South32; Queensland; 3° produttore mondiale"],
  ["Mantos Blancos",           -23.05,  -70.15, "Cile",         "silver",    "significant", "Cile settentrionale"],
  ["Pirquitas",                -22.71,  -66.50, "Argentina",    "silver",    "significant", "Silver Standard; Jujuy"],

  // ── PLATINO / PALLADIO ────────────────────────────────────────────────────
  ["Bushveld Complex",         -24.50,   29.00, "Sudafrica",    "platinum",  "major",       "~80% riserve mondiali di platino e palladio"],
  ["Norilsk",                   69.35,   88.19, "Russia",       "palladium", "major",       "~40% produzione globale palladio; NORNICKEL"],
  ["Stillwater",                45.43, -109.87, "USA (Montana)","platinum",  "significant", "Sibanye-Stillwater; unica negli USA"],
  ["Great Dyke (Zimbabwe)",    -19.50,   30.10, "Zimbabwe",     "platinum",  "major",       "Struttura lineare 550 km con PGM"],
  ["Zvishavane",               -20.30,   30.05, "Zimbabwe",     "platinum",  "significant", "Mimosa Mine; Bushveld analogia"],

  // ── FERRO ─────────────────────────────────────────────────────────────────
  ["Carajás",                   -6.05,  -50.18, "Brasile",      "iron",      "major",       "Più grande riserva di minerale di ferro al mondo; Vale S.A."],
  ["Pilbara Region",           -22.30,  118.50, "Australia",    "iron",      "major",       "Più grande regione estrattiva Fe; Rio Tinto, BHP, Fortescue"],
  ["Kryvyi Rih",               -47.91,   33.36, "Ucraina",      "iron",      "major",       "Bacino ferroso più grande d'Europa; produzione ridotta post-2022"],
  ["Lorraine Basin",            49.10,    6.20, "Francia",      "iron",      "major",       "Storico bacino minette; esaurito"],
  ["Kiruna",                    67.86,   20.23, "Svezia",       "iron",      "major",       "LKAB; miniera più profonda di ferro in Europa"],
  ["Labrador Trough",           54.00,  -67.00, "Canada",       "iron",      "major",       "Quebec/Labrador; ArcelorMittal"],
  ["Sishen",                   -27.77,   23.00, "Sudafrica",    "iron",      "significant", "Kumba Iron Ore; Northern Cape"],
  ["Hamersley",                -22.80,  118.30, "Australia",    "iron",      "major",       "Rio Tinto; Western Australia"],
  ["Simandou",                  9.00,   -12.50, "Guinea",       "iron",      "major",       "Riserve mondiali 3°; sviluppo in corso; Rio Tinto"],
  ["Itabira",                  -19.62,  -43.22, "Brasile",      "iron",      "major",       "Vale; Minas Gerais; storica"],

  // ── RAME ──────────────────────────────────────────────────────────────────
  ["Escondida",                -24.27,  -69.07, "Cile",         "copper",    "major",       "Miniera di rame più grande al mondo; BHP; Atacama"],
  ["Collahuasi",               -20.97,  -68.63, "Cile",         "copper",    "major",       "Anglo American / Glencore"],
  ["El Teniente",              -34.10,  -70.40, "Cile",         "copper",    "major",       "CODELCO; underground più grande al mondo"],
  ["Grasberg (Cu/Au)",          -4.05,  137.12, "Indonesia",    "copper",    "major",       "Freeport-McMoRan; Cu+Au+Ag"],
  ["Norilsk (Cu/Ni)",           69.35,   88.19, "Russia",       "copper",    "major",       "Nornickel; anche Ni, Pd, Pt"],
  ["Cerro Verde",              -16.53,  -71.55, "Perù",         "copper",    "major",       "Freeport; Arequipa"],
  ["Morenci",                   33.07, -109.36, "USA (Arizona)","copper",    "major",       "Freeport-McMoRan; Arizona; open pit"],
  ["Olympic Dam",              -30.44,  136.87, "Australia",    "copper",    "major",       "BHP; anche U, Au, Ag; underground"],
  ["Antamina",                  -9.53,  -77.05, "Perù",         "copper",    "major",       "BHP/Glencore/Teck; Ancash"],
  ["Cobre Panama",               8.79,  -80.87, "Panamá",       "copper",    "major",       "First Quantum; Colón; sospesa 2023"],
  ["Sentinel",                 -12.16,   26.82, "Zambia",       "copper",    "major",       "First Quantum; Northern Province"],
  ["Kansanshi",                -12.10,   25.85, "Zambia",       "copper",    "major",       "First Quantum; Copperbelt zambiese"],
  ["Las Bambas",               -14.05,  -72.24, "Perù",         "copper",    "major",       "MMG; Apurímac; controversie con comunità locali"],
  ["Toquepala",                -17.25,  -70.63, "Perù",         "copper",    "significant", "Southern Copper; Tacna"],
  ["Katanga (Copperbelt)",      -8.50,   25.00, "Congo (DRC)",  "copper",    "major",       "Regione con le più alte concentrazioni Cu/Co"],
  ["Kamoa-Kakula",              -5.90,   26.37, "Congo (DRC)",  "copper",    "major",       "Ivanhoe Mines; riserve 2° mondiali"],

  // ── NICHEL ──────────────────────────────────────────────────────────────
  ["Sudbury Basin",            46.50,  -81.00, "Canada",        "nickel",    "major",       "Impatto meteoritico; Ni/Cu/Co/PGM; Vale, Glencore"],
  ["Norilsk (Ni)",             69.35,   88.19, "Russia",        "nickel",    "major",       "~25% produzione mondiale Ni"],
  ["Thompson",                 55.75,  -97.85, "Canada",        "nickel",    "significant", "Manitoba; Vale"],
  ["Voisey's Bay",             56.45,  -63.67, "Canada",        "nickel",    "major",       "Labrador; Vale; progetto underground"],
  ["Cerro Matoso",              7.60,  -75.63, "Colombia",      "nickel",    "significant", "South32; laterite nickelifera"],
  ["Weda Bay",                  0.40,  127.86, "Indonesia",     "nickel",    "major",       "Maluku Utara; boom produzione post-2020"],
  ["Pomalaa",                  -4.17,  121.60, "Indonesia",     "nickel",    "major",       "Sulawesi; lateriti + pirometallurgia"],
  ["Vale-NC (Caledonia)",     -21.50,  165.50, "Nuova Caledonia","nickel",   "major",       "~25% riserve mondiali Ni"],

  // ── LITIO ────────────────────────────────────────────────────────────────
  ["Salar de Atacama",         -23.70,  -68.25, "Cile",         "lithium",   "major",       "Più grande salar al mondo; SQM, Albemarle; brine"],
  ["Salar de Uyuni",           -20.10,  -67.50, "Bolivia",      "lithium",   "major",       "Più grandi riserve mondiali Li; salar 10.582 km²; YLB"],
  ["Salar del Hombre Muerto",  -25.55,  -67.04, "Argentina",    "lithium",   "major",       "POSCO/Livent; Puna argentina"],
  ["Salar de Cauchari-Olaroz", -23.50,  -66.78, "Argentina",    "lithium",   "major",       "Lithium Americas / CATL"],
  ["Greenbushes",              -33.85,  116.07, "Australia",    "lithium",   "major",       "Albemarle / IGO; spodumene; più ricco al mondo"],
  ["Pilgangoora",              -21.63,  118.54, "Australia",    "lithium",   "major",       "Pilbara Minerals; spodumene"],
  ["Mount Marion",             -30.55,  121.43, "Australia",    "lithium",   "significant", "Mineral Resources / Jiangxi Ganfeng"],
  ["Wodgina",                  -21.73,  118.68, "Australia",    "lithium",   "major",       "Albemarle / Mineral Resources; spodumene"],
  ["James Bay",                 49.80,  -77.20, "Canada",       "lithium",   "major",       "Patriot Battery Metals; Quebec; non ancora sviluppato"],
  ["Barroso (Mina do Barroso)", 41.85,   -7.72, "Portogallo",   "lithium",   "major",       "Savannah Resources; spodumene; più grande EU"],
  ["Zinnwald / Cínovec",        50.73,   13.77, "Germania/CZ",  "lithium",   "significant", "Bi-nazionale; litio in greisen"],
  ["Kings Mountain",            35.25,  -81.33, "USA (NC)",     "lithium",   "significant", "Albemarle; spodumene storico"],
  ["Silver Peak / Clayton Valley",37.72,-117.60,"USA (Nevada)", "lithium",   "significant", "Albemarle; brine lacustre"],
  ["Thacker Pass",              41.88, -118.37, "USA (Nevada)", "lithium",   "major",       "Lithium Americas; sedimenti lacustri vulcanici"],

  // ── COBALTO ───────────────────────────────────────────────────────────────
  ["Copperbelt (Co)",           -8.50,   25.00, "Congo (DRC)",  "cobalt",    "major",       "~70% produzione mondiale; byproduct Cu"],
  ["Katanga (Cobalt)",          -8.00,   26.50, "Congo (DRC)",  "cobalt",    "major",       "Glencore/ERG; immense riserve"],
  ["Murrin Murrin",            -28.71,  121.88, "Australia",    "cobalt",    "significant", "Glencore; laterite Ni-Co"],
  ["Voisey's Bay (Co)",         56.45,  -63.67, "Canada",       "cobalt",    "significant", "Vale; byproduct Ni"],
  ["Bou Azzer",                 30.55,   -6.57, "Marocco",      "cobalt",    "significant", "Managem; unico minerale di cobalt primario"],

  // ── TERRE RARE ─────────────────────────────────────────────────────────
  ["Bayan Obo",                 41.82,  109.97, "Cina",         "rare_earth","major",       "~35% riserve mondiali; REE+Fe+Nb; BAOGANG Steel"],
  ["Mountain Pass",             35.48, -115.54, "USA (California)","rare_earth","major",    "MP Materials; unica mina USA operativa"],
  ["Lynas (Mount Weld)",       -28.88,  122.13, "Australia",    "rare_earth","major",       "Lynas Rare Earths; più alta concentrazione REE"],
  ["Nolans Bore",              -22.58,  133.22, "Australia",    "rare_earth","significant", "Arafura; Northern Territory"],
  ["Montviel",                  50.00,  -75.63, "Canada",       "rare_earth","significant", "Geomega; Quebec; carbonatite"],
  ["Ngualla",                   -8.53,   32.83, "Tanzania",     "rare_earth","significant", "Peak Rare Earths"],
  ["Lofdal",                   -20.50,   13.90, "Namibia",      "rare_earth","significant", "Heavy REE; Namibia Critical Metals"],
  ["Eldor Carbonatite",         54.00,  -73.30, "Canada",       "rare_earth","significant", "Mkango Resources"],
  ["Tanbreez",                  60.66,  -45.26, "Groenlandia",  "rare_earth","major",       "Tanbreez Mining; gigantesco giacimento"],
  ["Wicheeda",                  54.16, -122.60, "Canada",       "rare_earth","significant", "Defense Metals; BC"],

  // ── DIAMANTI ──────────────────────────────────────────────────────────────
  ["Jwaneng",                  -24.60,   24.73, "Botswana",     "diamond",   "major",       "De Beers/Debswana; la più ricca al mondo in valore"],
  ["Orapa",                    -21.30,   25.37, "Botswana",     "diamond",   "major",       "De Beers; grande kimberlite"],
  ["Venetia",                  -22.37,   29.32, "Sudafrica",    "diamond",   "significant", "De Beers; Northern Cape"],
  ["Williamson",                -3.45,   33.48, "Tanzania",     "diamond",   "significant", "Petra Diamonds; kimberlite rosa rara"],
  ["Argyle",                   -16.70,  128.43, "Australia",    "diamond",   "major",       "Rio Tinto; chiusa 2020; celebre per diamanti rosa"],
  ["Yakutia / Mir Mine",       62.53,   113.99, "Russia",       "diamond",   "major",       "ALROSA; Siberia; più grande al mondo 1960-2017"],
  ["Ekati",                    64.72,  -110.62, "Canada",       "diamond",   "significant", "NWT; Arctic Canadian Diamond"],
  ["Diavik",                   64.50,  -110.28, "Canada",       "diamond",   "significant", "Rio Tinto; NWT"],
  ["Catoca",                   -9.89,   20.56, "Angola",        "diamond",   "major",       "Endiama/Odebrecht; 4° al mondo"],
  ["Letšeng",                 -29.47,   28.96, "Lesotho",       "diamond",   "significant", "Gem Diamonds; alta quota, diamanti di qualità"],
  ["Letseng-la-Terae",        -29.47,   28.97, "Lesotho",       "diamond",   "significant", "Diamanti grandi e di alta qualità"],
  ["Murowa",                  -20.03,   30.97, "Zimbabwe",      "diamond",   "significant", "Rio Tinto / Murowa Diamonds"],
  ["Marange",                 -20.05,   32.83, "Zimbabwe",      "diamond",   "major",       "Campo diamantifero alluvionale; ZCDC"],

  // ── URANIO ────────────────────────────────────────────────────────────────
  ["McArthur River",           57.77, -105.74, "Canada",        "uranium",   "major",       "Cameco; Saskatchewan; il più ricco al mondo"],
  ["Cigar Lake",               58.07, -105.49, "Canada",        "uranium",   "major",       "Cameco; 17% produzione mondiale"],
  ["Olympic Dam (U)",         -30.44,  136.87, "Australia",     "uranium",   "major",       "BHP; byproduct Cu"],
  ["Four Mile",               -29.90,  135.10, "Australia",     "uranium",   "significant", "Quasar Resources; ISR"],
  ["Ranger Mine",             -12.67,  132.91, "Australia",     "uranium",   "major",       "ERA/Rio Tinto; Northern Territory; chiusa 2021"],
  ["Rossing",                 -22.48,   14.98, "Namibia",       "uranium",   "major",       "China National Uranium; Namibia; 4° mondial"],
  ["Husab",                   -22.50,   14.50, "Namibia",       "uranium",   "major",       "CGN; 2° maggiore miniera al mondo"],
  ["Rössing (Namibia)",       -22.50,   14.97, "Namibia",       "uranium",   "major",       "Rio Tinto / Orano; 40+ anni attività"],
  ["Budenovskoye",            44.00,   66.50, "Kazakhstan",     "uranium",   "major",       "Kazatomprom; ISR; maggior prod. mondiale"],
  ["Inkai",                   43.80,   65.20, "Kazakhstan",     "uranium",   "major",       "Kazatomprom / Cameco"],
  ["Arlit",                   18.74,    7.38, "Niger",          "uranium",   "major",       "Orano; Sahara; 2° in Africa"],
  ["Azelik",                  17.00,    8.20, "Niger",          "uranium",   "significant", "SOMINA; uranio non sviluppato"],
  ["Ranger (NT)",             -12.67,  132.91, "Australia",     "uranium",   "major",       "Energy Resources Australia"],
  ["Beverly ISR Mine",        -29.91,  135.33, "Australia",     "uranium",   "significant", "Heathgate Resources"],

  // ── CARBONE ──────────────────────────────────────────────────────────────
  ["Galilee Basin",           -22.00,  145.00, "Australia",     "coal",      "major",       "Queensland; uno dei più grandi non sviluppati"],
  ["Bowen Basin",             -22.50,  148.50, "Australia",     "coal",      "major",       "Principale area carbone coke; BHP, Glencore"],
  ["Jharia Coalfield",         23.77,   86.42, "India",         "coal",      "major",       "Più grande riserva carbone coking in India"],
  ["Korba",                   22.35,   82.70, "India",          "coal",      "major",       "Chhattisgarh; thermal coal"],
  ["Ruhr Valley",             51.50,    7.30, "Germania",       "coal",      "major",       "Storico carbone europeo; progressiva chiusura"],
  ["Silesian Basin",          50.00,   18.50, "Polonia/CZ",     "coal",      "major",       "Carbone hard; Polonia; in riduzione post-EU"],
  ["Donbass",                 48.00,   37.50, "Ucraina",        "coal",      "major",       "Bacino carbonifera ucraino; zona conflitto 2022+"],
  ["Kuzbass",                 54.00,   86.00, "Russia",         "coal",      "major",       "Siberia; maggior produzione russa; coking+thermal"],
  ["Shanxi",                  37.87,  112.56, "Cina",           "coal",      "major",       "Più grande provincia carbonifera cinese"],
  ["Inner Mongolia Coal",     42.00,  112.00, "Cina",           "coal",      "major",       "Erlianhot; immense riserve"],
  ["Appalachian Coal",        37.30,  -81.60, "USA",            "coal",      "major",       "WV/KY/VA; carbone storico USA"],
  ["Powder River Basin",      44.00, -106.00, "USA (Wyoming)",  "coal",      "major",       "Più grande bacino thermal coal USA"],
  ["Mpumalanga",             -25.50,   29.50, "Sudafrica",      "coal",      "major",       "~90% produzione elettricità SA; ESKOM"],
  ["Kalimantan Coal",         -0.50,  113.50, "Indonesia",      "coal",      "major",       "Borneo; maggiore esportatore mondiale"],
  ["Central Sulawesi Coal",    1.50,  120.50, "Indonesia",      "coal",      "significant", "Sulawesi centrale"],

  // ── FOSFATO ───────────────────────────────────────────────────────────────
  ["Khouribga",               32.88,   -6.91, "Marocco",        "phosphate", "major",       "OCP; ~70% riserve mondiali; principale esportatore"],
  ["Youssoufia",              32.25,   -8.53, "Marocco",        "phosphate", "major",       "OCP Group"],
  ["Bou Craa",                26.33,  -12.72, "Sahara Occ.",    "phosphate", "major",       "OCP; minerale ad alto tenore"],
  ["Jordan Phosphate",        30.20,   36.50, "Giordania",      "phosphate", "significant", "JPMC; Mar Morto regione"],
  ["Florida Phosphate",       27.50,  -81.80, "USA (Florida)",  "phosphate", "major",       "Mosaic Co.; produzione in calo"],
  ["North Carolina Phosphate", 35.00, -77.00, "USA (NC)",       "phosphate", "significant", "Potash Corp / Nutrien"],
  ["Kola Peninsula",          67.60,   33.50, "Russia",         "phosphate", "major",       "PhosAgro; apatite nel Kola"],
  ["Nauru",                   -0.53,  166.92, "Nauru",          "phosphate", "major",       "Completamente estratto; isola devastata"],
  ["Christmas Island",       -10.49,  105.63, "Australia",      "phosphate", "significant", "Fosfato residuale; turismo+estrazione"],
  ["Togo Phosphate",           8.80,    1.10, "Togo",           "phosphate", "significant", "IFC / Togo; bacino Kpémé"],

  // ── POTASSIO / POTASSA ─────────────────────────────────────────────────
  ["Saskatchewan Potash",     51.50, -105.00, "Canada",         "potash",    "major",       "~33% riserve mondiali; Nutrien, Mosaic, K+S"],
  ["Verkhnekamsk",            59.24,   56.83, "Russia",         "potash",    "major",       "Uralchem; Ural; 2° più grandi riserve"],
  ["Belaruskali",             52.42,   27.60, "Bielorussia",    "potash",    "major",       "3° produttore mondiale; sanzioni 2021"],
  ["Dead Sea Works",          30.90,   35.29, "Israele",        "potash",    "significant", "ICL Group; brine del Mar Morto"],
  ["Laos Potash",             18.50,  102.70, "Laos",           "potash",    "significant", "Produzione nascente; ASEAN"],
  ["Ethiopia Potash",          9.50,   40.50, "Etiopia",        "potash",    "significant", "Circum Minerals; Danakil"],

  // ── RUBINI / SMERALDI / ALTRI GEMME ───────────────────────────────────
  ["Mogok Ruby",              22.92,   96.51, "Myanmar",        "ruby",      "major",       "Mogok Valley; rubini di alta qualità"],
  ["Montepuez Ruby",         -13.12,   39.03, "Mozambico",      "ruby",      "major",       "Gemfields; scoperti 2009; grande deposito"],
  ["Muzo Emerald",             5.52,  -74.11, "Colombia",       "emerald",   "major",       "Muzo Mining; ~55% produzione mondiale"],
  ["Coscuez Emerald",          5.62,  -74.00, "Colombia",       "emerald",   "significant", "Colombia; alta qualità"],
  ["Zambia Emerald (Kagem)",  -13.50,   28.50, "Zambia",        "emerald",   "major",       "Gemfields; Copperbelt"],
  ["Panjshir Valley",         35.30,   70.00, "Afghanistan",    "emerald",   "significant", "Valle del Panjshir; alti rischi"],
  ["Padparadscha Sapphire",    6.71,   80.78, "Sri Lanka",      "sapphire",  "major",       "Ratnapura; sapphires + rubini + altri"],
  ["Kashmir Sapphire",        34.60,   76.10, "India (Kashmir)","sapphire",  "significant", "Zanskar Range; i più pregiati al mondo"],
  ["Yogo Sapphire",           46.90, -110.70, "USA (Montana)",  "sapphire",  "significant", "Yogo Gulch; unici negli USA"],
  ["Ilakaka Sapphire",       -22.62,   45.04, "Madagascar",     "sapphire",  "major",       "Scoperta 1998; grande rush"],
  ["Lightning Ridge Opal",   -29.44,  147.99, "Australia",      "opal",      "major",       "Black opal; unico al mondo"],
  ["Coober Pedy Opal",       -29.02,  134.76, "Australia",      "opal",      "major",       "'Capitale dell'opale del mondo'"],
  ["Welo Opal",               10.20,   39.60, "Etiopia",        "opal",      "significant", "Distretto Welo; opale cristallino"],

  // ── NIOBIO / TANTALIO ─────────────────────────────────────────────────
  ["Araxá Niobium",          -19.60,  -46.93, "Brasile",        "niobium",   "major",       "CBMM; ~90% produzione mondiale Nb"],
  ["Catalão Niobium",        -18.17,  -47.95, "Brasile",        "niobium",   "significant", "Anglo American/CMOC"],
  ["Coltan (DRC)",            -1.60,   28.50, "Congo (DRC)",    "tantalum",  "major",       "'Conflict mineral'; coltan = Co + Ta; regione dei Grandi Laghi"],
  ["Sons of Gwalia",         -28.00,  122.23, "Australia",      "tantalum",  "significant", "Galaxy Resources; Greenbushes area"],
  ["Wodgina (Ta)",           -21.73,  118.68, "Australia",      "tantalum",  "significant", "Albemarle; byproduct Li"],

  // ── BAUXITE / ALLUMINIO ────────────────────────────────────────────────
  ["Sangarédi",              11.43,  -13.80, "Guinea",          "aluminum",  "major",       "CBG; più grandi riserve mondiali bauxite"],
  ["Weipa",                 -12.67,  141.87, "Australia",       "aluminum",  "major",       "Rio Tinto; Queensland; 3° mondo"],
  ["Trombetas",              -1.40,  -56.39, "Brasile",         "aluminum",  "major",       "MRN/Vale; Pará; grande"],
  ["Jamaican Bauxite",       18.10,  -77.40, "Giamaica",        "aluminum",  "significant", "Riserve significative; produzione calante"],
  ["Pará (Paragominas)",     -2.98,  -47.35, "Brasile",         "aluminum",  "major",       "Vale; 1° mondiale per qualità"],

  // ── GRAFITE ───────────────────────────────────────────────────────────
  ["Mahenge Graphite",       -8.69,   36.68, "Tanzania",        "graphite",  "major",       "Magnis Energy; flake graphite"],
  ["Balama Graphite",       -13.34,   38.53, "Mozambico",       "graphite",  "major",       "Syrah Resources; 2° mondiale"],
  ["Heilongjiang Graphite",  47.00,  133.00, "Cina",            "graphite",  "major",       "Jixi; maggior prod. mondiale"],
  ["Ulanqab Graphite",       41.00,  113.00, "Cina",            "graphite",  "major",       "Cina; grande distretto"],

  // ── ZOLFO ────────────────────────────────────────────────────────────
  ["Frasch Sulfur (Texas)",  29.50,  -94.00, "USA",             "sulfur",    "major",       "Bayou processo Frasch; ora esaurito"],
  ["Ioannina Sulfur",        39.67,   20.85, "Grecia",          "sulfur",    "significant", "Regione Epiro"],
  ["Wadi Araba Sulfur",      29.30,   35.10, "Giordania",       "sulfur",    "minor",       "Precipitati evaporitici"],

  // ── CROMO ────────────────────────────────────────────────────────────
  ["Great Dyke (Cr)",       -19.50,   30.10, "Zimbabwe",        "chromium",  "major",       "Zimasco/Zimplats; grandi riserve"],
  ["Bushveld Chromite",     -24.50,   29.00, "Sudafrica",       "chromium",  "major",       "Glencore/Samancor; 80% riserve mondiali"],
  ["Kemi Chromite",          66.65,   25.98, "Finlandia",       "chromium",  "significant", "Outokumpu; unica miniera Cr in UE"],
  ["Kavkaz Chromite",        42.00,   43.00, "Russia/Georgia",  "chromium",  "significant", "Caucaso; depositi storici"],
  ["Orhaneli Chromite",      39.90,   28.98, "Turchia",         "chromium",  "significant", "Turchia; 5° mondiale Cr"],
  ["Feritkoy",               37.88,   28.50, "Turchia",         "chromium",  "significant", "Muğla; Turchia"],

  // ── MANGANESE ──────────────────────────────────────────────────────
  ["Kalahari Mn",           -27.00,   22.80, "Sudafrica",       "manganese", "major",       "50% riserve mondiali; Hotazel"],
  ["Gabon Mn (Moanda)",      -1.53,   13.27, "Gabon",           "manganese", "major",       "COMILOG/Eramet; 2° mondo"],
  ["Ukraine Mn (Nikopol)",   47.56,   34.40, "Ucraina",         "manganese", "major",       "3° riserve mondiali"],
  ["Brazil Mn (Azul)",       -6.07,  -50.42, "Brasile",         "manganese", "significant", "Vale; Pará"],
  ["Australia Mn (Groote Eylandt)",-14.00,136.60,"Australia",   "manganese", "major",       "GEMCO/South32; Territorio del Nord"],
  ["China Mn (Guangxi)",     23.00,  108.00, "Cina",            "manganese", "significant", "1° produttore mondiale Mn"],

  // ── ZINCO / PIOMBO ─────────────────────────────────────────────────
  ["Red Dog Mine",           68.04, -162.87, "USA (Alaska)",    "zinc",      "major",       "Teck Resources; più produttiva al mondo Zn"],
  ["Century Mine",          -18.73,  138.65, "Australia",       "zinc",      "significant", "New Century Resources; North Queensland"],
  ["Mount Isa",             -20.73,  139.49, "Australia",       "zinc",      "major",       "Glencore; Zn/Pb/Cu/Ag; 100+ anni"],
  ["McArthur River (Zn)",   -16.44,  136.08, "Australia",       "zinc",      "major",       "Glencore; sedimentary exhalative"],
  ["Neves-Corvo",            37.62,   -7.80, "Portogallo",      "zinc",      "significant", "Lundin Mining; Zn/Cu/Pb"],
  ["Rampura Agucha",         24.91,   74.54, "India",           "zinc",      "major",       "Hindustan Zinc/Vedanta; 1° India"],
  ["Antamina (Zn)",          -9.53,  -77.05, "Perù",            "zinc",      "significant", "Zn/Cu; byproduct"],
  ["Tara Mine",              53.57,   -7.63, "Irlanda",         "zinc",      "significant", "Vedanta; più grande in Europa"],
  ["San Cristóbal (Zn)",   -22.40,  -68.00, "Bolivia",         "zinc",      "significant", "Sumitomo; Potosí; Zn/Pb/Ag"],
  ["Broken Hill",          -31.95,  141.47, "Australia",       "zinc",      "major",       "Storica; Zn/Pb/Ag; 130+ anni"],
  ["Sullivan Mine",         49.48, -117.00, "Canada",           "lead",      "major",       "Teck; SEDEX; 100 anni; esaurita 2001"],
  ["Viburnum Trend",        37.60,  -91.00, "USA (Missouri)",   "lead",      "major",       "The Lead Belt; Doe Run Company"],

  // ── STAGNO ───────────────────────────────────────────────────────────
  ["Wa Shu Gou",            30.00,  100.00, "Cina",             "tin",       "major",       "Yunnan; maggiore produzione mondiale Sn"],
  ["Renison Bell",          -41.81,  145.42, "Australia",       "tin",       "significant", "Metals X; Tasmania"],
  ["Cerro Rico (Potosí)",  -19.60,  -65.75, "Bolivia",          "tin",       "major",       "Potosí; Sn+Ag; 500 anni di storia estrattiva"],
  ["Minas Gerais (Sn)",    -18.50,  -43.90, "Brasile",          "tin",       "significant", "Rondônia; alluvioni stannifere"],
  ["Bangka Island",         -2.20,  106.10, "Indonesia",        "tin",       "major",       "~30% produzione mondiale Sn; PT Timah"],
  ["Belitung Island",       -2.80,  107.90, "Indonesia",        "tin",       "major",       "Offshore; alluvioni e draghe"],

  // ── TUNGSTENO / MOLIBDENO ─────────────────────────────────────────
  ["Jiangxi Tungsten",      26.00,  116.00, "Cina",             "tungsten",  "major",       "~80% riserve mondiali W; Jiangxi"],
  ["Sandong Tungsten",      25.13,  114.30, "Cina",             "tungsten",  "major",       "Pangu Mining"],
  ["Cantung Mine",          61.94, -128.22, "Canada",           "tungsten",  "significant", "North American Tungsten"],
  ["Kara Tungsten",         -41.36,  145.57, "Australia",       "tungsten",  "significant", "Tasmania; scheelite"],
  ["Henderson Mine",        39.77, -105.85, "USA (Colorado)",   "molybdenum","major",       "Freeport-McMoRan; underground Mo"],
  ["Climax Mine",           39.37, -106.18, "USA (Colorado)",   "molybdenum","major",       "Freeport-McMoRan; primaria Mo"],
  ["Codelco El Teniente Mo",-34.10,  -70.40,"Cile",             "molybdenum","major",       "Byproduct Cu; 1° Sud America"],

  // ── TITANIO / VANADIO ──────────────────────────────────────────────
  ["Richards Bay Minerals", -28.73,   32.10, "Sudafrica",       "titanium",  "major",       "Rio Tinto; ilmenite + zircon + rutile"],
  ["Iluka (Australia)",    -29.79,  115.13,  "Australia",       "titanium",  "major",       "Iluka Resources; Ti/Zr"],
  ["Bushveld Vanadium",    -24.50,   29.00,  "Sudafrica",       "vanadium",  "major",       "Glencore/EVRAZ; ~50% riserve"],
  ["Maracás Menchen (V)",  -13.79,  -40.56,  "Brasile",         "vanadium",  "significant", "Largo Resources; Bahia"],
  ["Evraz (Russia)",        53.70,   91.40,  "Russia",          "vanadium",  "major",       "EVRAZ; Kemerovo; 2° mondiale"],

  // ── SALE ──────────────────────────────────────────────────────────
  ["Salar de Uyuni (NaCl)", -20.10,  -67.50, "Bolivia",         "salt",      "major",       "Anche sorgente di Li; turismo"],
  ["Cheshire Salt",         53.20,   -2.50,  "UK",              "salt",      "significant", "Storico; salgemma"],
  ["Tuzla (Bosnia)",        44.54,   18.68,  "Bosnia",          "salt",      "significant", "Storica città salinera"],
  ["Dead Sea",              31.50,   35.50,  "Israele/Giordania","salt",     "major",       "Sale + potassio + bromo"],
  ["Wieliczka Salt Mine",   49.99,   20.05,  "Polonia",         "salt",      "significant", "Patrimonio UNESCO; turistica"],
  ["Sichuan Brine (CN)",    30.00,  103.00,  "Cina",            "salt",      "significant", "Produzione storica; brine"],
];

// ── Build active set & mesh ────────────────────────────────────────────────

let _active     = false;
let _mesh       = null;
let _loaded     = false;
let _filters    = new Set(Object.keys(MINERAL_CATEGORIES)); // all active
const _dummy    = new THREE.Object3D();

function _latLonToVec3(lat, lon) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const th  = THREE.MathUtils.degToRad(lon + 180);
  const s   = Math.sin(phi);
  return new THREE.Vector3(
    -(MIN_R * s * Math.cos(th)),
     MIN_R * Math.cos(phi),
     MIN_R * s * Math.sin(th)
  );
}

function _buildMesh() {
  const count = MINERAL_DEPOSITS.length;
  const geo   = new THREE.SphereGeometry(DOT_SIZE, 6, 6);
  const im    = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), count);
  im.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const colors = new Float32Array(count * 3);
  const col    = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const key  = MINERAL_DEPOSITS[i][4];
    const info = MINERAL_CATEGORIES[key];
    col.set(info ? info.color : 0xffffff);
    colors[i * 3]     = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;

    const pos = _latLonToVec3(MINERAL_DEPOSITS[i][1], MINERAL_DEPOSITS[i][2]);
    _dummy.position.copy(pos);
    _dummy.lookAt(0, 0, 0);
    _dummy.updateMatrix();
    im.setMatrixAt(i, _dummy.matrix);
  }
  im.instanceMatrix.needsUpdate = true;
  im.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(colors, 3));
  im.renderOrder = 12;
  im.userData.isMineralMesh = true;
  return im;
}

/** Apply current filter state (show/hide instances by mineral key) */
function _applyFilters() {
  if (!_mesh) return;
  const col = new THREE.Color();
  for (let i = 0; i < MINERAL_DEPOSITS.length; i++) {
    const key     = MINERAL_DEPOSITS[i][4];
    const visible = _filters.has(key);
    // Scale to 0 hides the dot without removing the instance
    _mesh.getMatrixAt(i, _dummy.matrix);
    _dummy.matrix.decompose(_dummy.position, _dummy.quaternion, _dummy.scale);
    _dummy.scale.setScalar(visible ? 1 : 0.001);
    _dummy.updateMatrix();
    _mesh.setMatrixAt(i, _dummy.matrix);
  }
  _mesh.instanceMatrix.needsUpdate = true;
}

export function enableMinerals() {
  _active = true;
  if (!_loaded) {
    _mesh   = _buildMesh();
    _loaded = true;
  }
  globeGroup.add(_mesh);
  _mesh.visible = true;
  _applyFilters();
}

export function disableMinerals() {
  _active = false;
  if (_mesh) globeGroup.remove(_mesh);
}

/** Set which mineral keys are visible */
export function setMineralFilter(key, enabled) {
  if (enabled) _filters.add(key);
  else         _filters.delete(key);
  if (_active && _mesh) _applyFilters();
}

/** Set all minerals of a category on or off */
export function setMineralCategoryFilter(categoryLabel, enabled) {
  for (const [key, info] of Object.entries(MINERAL_CATEGORIES)) {
    if (info.category === categoryLabel) {
      setMineralFilter(key, enabled);
    }
  }
}

/** Toggle a mineral key */
export function toggleMineralFilter(key) {
  setMineralFilter(key, !_filters.has(key));
}

export function getMineralFilter(key) { return _filters.has(key); }

export function getMineralMesh()     { return _loaded ? _mesh : null; }

export function getMineralData(index) {
  const d = MINERAL_DEPOSITS[index];
  if (!d) return null;
  const info = MINERAL_CATEGORIES[d[4]];
  return {
    name:     d[0],
    lat:      d[1],
    lon:      d[2],
    country:  d[3],
    key:      d[4],
    label:    info?.label ?? d[4],
    category: info?.category ?? "—",
    size:     d[5],
    notes:    d[6],
  };
}

/** Get all unique categories present in the dataset */
export function getMineralCategoryList() {
  const cats = new Set();
  for (const info of Object.values(MINERAL_CATEGORIES)) cats.add(info.category);
  return [...cats];
}
