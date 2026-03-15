/**
 * Volcano Layer — active volcanoes worldwide.
 * Embedded dataset (~160 major active/notable volcanoes).
 * Click a marker to see a detailed info card.
 */

import * as THREE from "three";
import { globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";

const VOL_R     = GLOBE_RADIUS * 1.012;
const BASE_SIZE = 0.048;

/**
 * Dataset columns:
 * [name, lat, lon, country, elev_m, type, last_eruption, vei_max, status, description]
 * status: "Erupting" | "Warning" | "Watch" | "Normal"
 */
export const VOLCANOES = [
  // ── EUROPA ──────────────────────────────────────────────────────────────────
  ["Etna",                  37.748,  15.000, "Italia",             3329, "Stratovolcano", "2024", 3, "Erupting", "Vulcano più attivo d'Europa; alta frequenza di colate laviche ed esplosioni dal cratere"],
  ["Stromboli",             38.789,  15.213, "Italia",              924, "Stratovolcano", "2024", 2, "Erupting",  "'Faro del Mediterraneo'; eruzioni quasi continue da oltre 2.000 anni"],
  ["Vesuvio",               40.821,  14.426, "Italia",             1281, "Stratovolcano", "1944", 5, "Watch",    "Responsabile della distruzione di Pompei nel 79 d.C.; il più pericoloso d'Europa"],
  ["Campi Flegrei",         40.827,  14.139, "Italia",              458, "Caldeira",      "1538", 6, "Warning",  "Supervulcano con bradisismo in accelerazione; 500.000 persone nella zona rossa"],
  ["Vulcano",               38.404,  14.962, "Italia",              500, "Stratovolcano", "1890", 3, "Watch",    "Accresciuta attività fumarolica dal 2021; dà il nome ai vulcani"],
  ["Pantelleria",           36.760,  11.989, "Italia",              836, "Caldeira",      "1891", 2, "Normal",   "Isola vulcanica con sorgenti termali sottomarinae"],
  ["Santorini (Thera)",     36.404,  25.396, "Grecia",              566, "Caldeira",      "1950", 7, "Watch",    "Eruzione minoica ~1600 a.C.; caldeira con attività idrotermale a Nea Kameni"],
  ["Teide",                 28.272, -16.642, "Spagna (Canarie)",   3715, "Stratovolcano", "1909", 3, "Watch",    "Terzo vulcano più grande del mondo su isola; punto più alto di Spagna"],
  ["La Palma (Tajogaite)",  28.570, -17.840, "Spagna (Canarie)",   1949, "Stratovolcano", "2021", 3, "Normal",   "Eruzione del 2021 durò 85 giorni; coulée lavica raggiunse il mare"],
  ["Hekla",                 63.983, -19.666, "Islanda",            1491, "Stratovolcano", "2000", 4, "Watch",    "Erutta in media ogni 10 anni; 'porta dell'inferno' nel Medioevo"],
  ["Katla",                 63.633, -19.050, "Islanda",            1512, "Caldeira",      "1918", 5, "Warning",  "Subcalderaico sotto ghiacciaio Mýrdalsjökull; atteso a breve termine"],
  ["Grímsvötn",             64.416, -17.316, "Islanda",            1725, "Caldeira",      "2011", 4, "Watch",    "Vulcano sottoghiacciaio più attivo d'Islanda; eruzione 2011 fermò voli"],
  ["Eyjafjallajökull",      63.633, -19.617, "Islanda",            1651, "Stratovolcano", "2010", 4, "Normal",   "Eruzione del 2010 paralizzò il traffico aereo europeo per settimane"],
  ["Bárðarbunga",           64.633, -17.533, "Islanda",            2009, "Caldeira",      "2015", 4, "Normal",   "Sistema di dyke del 2014; colata lavica Holuhraun tra le più grandi del XX sec."],
  ["Askja",                 65.048, -16.754, "Islanda",            1516, "Caldeira",      "1961", 5, "Watch",    "Caldera con lago cratico; eruzione 1875 di cenere su tutta Scandinavia"],
  ["Krafla",                65.717, -16.783, "Islanda",             818, "Caldeira",      "1984", 3, "Normal",   "Sistemi di fessure; eruzione 1975-1984 (crisi di Krafla)"],
  ["Laki",                  64.070, -18.230, "Islanda",             818, "Fissura",       "1783", 6, "Normal",   "Eruzione del 1783 causò carestia globale e -1°C su tutto il pianeta"],

  // ── AFRICA ──────────────────────────────────────────────────────────────────
  ["Nyiragongo",            -1.520,  29.250, "Congo (DRC)",        3470, "Stratovolcano", "2021", 2, "Erupting",  "Uno dei laghi di lava più grandi del mondo; eruzione 2021 distrusse parti di Goma"],
  ["Nyamuragira",           -1.408,  29.200, "Congo (DRC)",        3058, "Shield",        "2024", 2, "Erupting",  "Vulcano africano più attivo; colate laviche frequenti"],
  ["Ol Doinyo Lengai",      -2.764,  35.914, "Tanzania",           2878, "Stratovolcano", "2017", 2, "Watch",    "Unico vulcano al mondo che emette lava carbonatitica: liquida a 500°C, nera"],
  ["Erta Ale",              13.600,  40.667, "Etiopia",             613, "Shield",        "2024", 1, "Erupting",  "Lago di lava quasi permanente; nel remoto deserto Danakil a -116 m slm"],
  ["Nabro",                 13.370,  41.700, "Eritrea",            2218, "Caldeira",      "2011", 4, "Normal",   "Eruzione del 2011 sorpresa; SO2 rilevato da satellite"],
  ["Fogo (Pico)",           14.950, -24.350, "Capo Verde",         2829, "Stratovolcano", "2015", 3, "Normal",   "Eruzione del 2014-15 distrusse villaggi alle pendici"],
  ["Cameroon Mountain",      4.203,   9.170, "Camerun",            4095, "Stratovolcano", "2000", 2, "Normal",   "Unico vulcano attivo nella catena delle montagne del Camerun"],

  // ── ASIA ──────────────────────────────────────────────────────────────────
  ["Sakurajima",            31.585, 130.657, "Giappone",           1117, "Stratovolcano", "2024", 3, "Erupting",  "Tra i vulcani più attivi del Giappone; erutta centinaia di volte l'anno"],
  ["Aso",                   32.884, 131.104, "Giappone",           1592, "Caldeira",      "2023", 3, "Warning",  "Grande caldeira 25 km × 18 km con vulcano centrale attivo (Nakadake)"],
  ["Fuji",                  35.361, 138.728, "Giappone",           3776, "Stratovolcano", "1707", 4, "Watch",    "Vulcano simbolo del Giappone; ultima eruzione 1707; alta probabilità futura"],
  ["Merapi",                -7.541, 110.446, "Indonesia",          2930, "Stratovolcano", "2023", 4, "Warning",  "Tra i più pericolosi al mondo; pyroclastic flows ricorrenti vicino a Yogyakarta"],
  ["Krakatau / Anak Krakatau",-6.102,105.423,"Indonesia",           338, "Caldeira",      "2023", 4, "Erupting",  "Anak Krakatau emerso nel 1930; crollo laterale 2018 causò tsunami e ~430 vittime"],
  ["Tambora",               -8.250, 117.993, "Indonesia",          2722, "Stratovolcano", "1815", 7, "Normal",   "Eruzione del 1815: più grande degli ultimi 10.000 anni; causò 'anno senza estate' 1816"],
  ["Rinjani",               -8.412, 116.467, "Indonesia",          3726, "Stratovolcano", "2019", 4, "Watch",    "Vulcano sacro con lago cratico Segara Anak e piccolo cono Baru"],
  ["Semeru",                -8.108, 112.922, "Indonesia",          3676, "Stratovolcano", "2024", 4, "Warning",  "Vulcano più alto di Giava; pyroclastic flows frequenti"],
  ["Sinabung",               3.170,  98.392, "Indonesia",          2460, "Stratovolcano", "2023", 4, "Watch",    "Risvegliato dopo 400 anni nel 2010; continua a eruttare"],
  ["Agung",                 -8.343, 115.508, "Indonesia",          3031, "Stratovolcano", "2019", 5, "Watch",    "Vulcano sacro dei balinesi; eruzione 2017-19 causò evacuazioni"],
  ["Ruang",                  2.300, 125.367, "Indonesia",           725, "Stratovolcano", "2024", 4, "Erupting",  "Grande eruzione esplosiva aprile 2024; evacuazioni di massa nel Sulawesi"],
  ["Dukono",                 1.693, 127.894, "Indonesia",          1335, "Caldeira",      "2024", 3, "Erupting",  "Eruzioni quasi continue da oltre 30 anni; emissioni quotidiane di cenere"],
  ["Ibu",                    1.488, 127.630, "Indonesia",          1325, "Stratovolcano", "2024", 3, "Erupting",  "Attività quasi continua nelle Isole Molucche settentrionali"],
  ["Karangetang",             2.781, 125.408, "Indonesia",          1827, "Stratovolcano", "2023", 4, "Warning",  "Uno dei vulcani più attivi dell'Indonesia; eruzioni frequenti"],
  ["Kerinci",               -1.697, 101.264, "Indonesia",          3800, "Stratovolcano", "2023", 3, "Watch",    "Vulcano più alto di Sumatra"],
  ["Marapi (Sumatra)",      -0.382, 100.474, "Indonesia",          2891, "Stratovolcano", "2023", 4, "Erupting",  "Eruzione mortale dicembre 2023; colpì alpinisti in vetta"],
  ["Kelud",                 -7.930, 112.308, "Indonesia",          1731, "Stratovolcano", "2014", 4, "Normal",   "Lago cratico esplosivo; eruzione 2014 cenere fino a Yogyakarta e Bali"],
  ["Pinatubo",              15.130, 120.350, "Filippine",          1486, "Stratovolcano", "1991", 6, "Normal",   "Eruzione del 1991: seconda più grande del XX sec.; abbassò temp. globali di 0,5°C"],
  ["Mayon",                 13.257, 123.685, "Filippine",          2463, "Stratovolcano", "2023", 4, "Warning",  "Cono più perfetto del mondo; ~50 eruzioni dal 1616; evacuazioni nel 2023"],
  ["Taal",                  14.002, 120.993, "Filippine",           311, "Caldeira",      "2020", 4, "Watch",    "Vulcano dentro un lago dentro una caldeira; tsunami lavico nel 1754"],
  ["Klyuchevskaya Sopka",   56.057, 160.638, "Russia",             4750, "Stratovolcano", "2024", 4, "Erupting",  "Vulcano più alto d'Eurasia; eruzioni quasi continue; pennacchi a 15 km"],
  ["Bezymianny",            55.972, 160.595, "Russia",             2882, "Stratovolcano", "2024", 4, "Erupting",  "Esplosione laterale storica nel 1956; model per St Helens 1980"],
  ["Shiveluch",             56.653, 161.360, "Russia",             3283, "Stratovolcano", "2023", 5, "Erupting",  "Massima eruzione esplosiva del 2023 in Kamchatka; colonna 20 km"],
  ["Ruapehu",              -39.281, 175.568, "Nuova Zelanda",      2797, "Stratovolcano", "2007", 3, "Watch",    "Vulcano più alto Isola del Nord; lahar del 1953 causò disastro ferroviario"],
  ["Whakaari (White Island)",-37.520,177.183,"Nuova Zelanda",       321, "Stratovolcano", "2019", 3, "Watch",    "Eruzione phreática 2019 uccise 22 turisti"],
  ["Popocatépetl",          19.023, -98.622, "Messico",            5426, "Stratovolcano", "2024", 5, "Warning",  "'El Popo'; il vulcano più pericoloso del Messico; ~26 milioni di persone nel raggio 100 km"],
  ["Colima",                19.514,-103.620, "Messico",            3850, "Stratovolcano", "2023", 4, "Warning",  "'Volcán de Fuego'; pyroclastic flows ricorrenti"],
  ["Alaid",                 50.861, 155.565, "Russia",             2339, "Stratovolcano", "2022", 4, "Watch",    "Il più alto delle Isole Curili; cono perfetto"],

  // ── AMERICHE ────────────────────────────────────────────────────────────────
  ["Mount St. Helens",      46.200,-122.180, "USA",                2549, "Stratovolcano", "2008", 5, "Watch",    "Eruzione catastrofica 1980; collasso laterale uccise 57 persone; attiva fino al 2008"],
  ["Shishaldin",            54.756,-163.970, "USA (Alaska)",       2857, "Stratovolcano", "2024", 4, "Erupting",  "Uno dei vulcani più attivi delle Aleutine; pennacchi di vapore continui"],
  ["Pavlof",                55.418,-161.894, "USA (Alaska)",       2518, "Stratovolcano", "2024", 4, "Erupting",  "Frequenti eruzioni esplosive; impatta traffico aereo su rotte Asia-USA"],
  ["Redoubt",               60.485,-152.742, "USA (Alaska)",       3108, "Stratovolcano", "2009", 5, "Watch",    "Lahars verso Cook Inlet; banche cenere su Anchorage"],
  ["Novarupta / Katmai",    58.270,-155.160, "USA (Alaska)",        841, "Lava dome",     "1912", 6, "Normal",   "Eruzione del 1912: più grande del XX sec.; crea la 'Valle dei 10.000 fumi'"],
  ["Yellowstone",           44.430,-110.670, "USA (Wyoming)",      2805, "Caldeira/Supervulcano","640000 AC", 8, "Watch", "Supervulcano; camera magmatica attiva; attesa di una mega-eruzione futura"],
  ["Long Valley Caldera",   37.700,-118.870, "USA (California)",   2788, "Caldeira",     "760000 AC", 7, "Watch", "Campi di domi lavici recenti; bradisismo monitorato"],
  ["Kilauea",               19.421,-155.287, "USA (Hawaii)",       1222, "Shield",        "2024", 1, "Erupting",  "Uno dei vulcani più attivi al mondo; eruzioni continue dal 1983 al 2018 e post-2020"],
  ["Mauna Loa",             19.475,-155.608, "USA (Hawaii)",       4169, "Shield",        "2022", 2, "Watch",    "Il vulcano più grande della Terra in volume; eruzione 2022 dopo 38 anni"],
  ["Santa María / Santiaguito",14.756,-91.598,"Guatemala",         3772, "Stratovolcano", "2024", 6, "Erupting",  "Domo Santiaguito in costante accrescimento dal 1922; pyroclastic flows quotidiani"],
  ["Fuego",                 14.473, -90.880, "Guatemala",          3763, "Stratovolcano", "2024", 5, "Erupting",  "Tra i più attivi dell'America Centrale; pyroclastic flows del 2018 uccisero ~200 persone"],
  ["Pacaya",                14.381, -90.601, "Guatemala",          2552, "Complesso",     "2024", 3, "Erupting",  "Quasi continua attività effusiva; flussi lavici frequenti"],
  ["Nevado del Ruiz",        4.895, -75.322, "Colombia",           5321, "Stratovolcano", "2023", 6, "Warning",  "Lahar 1985 causò 23.000 morti (Armero); attivo di nuovo nel 2023"],
  ["Cotopaxi",              -0.677, -78.437, "Ecuador",            5897, "Stratovolcano", "2023", 5, "Warning",  "Tra i vulcani attivi più alti del mondo; ripresa attività 2015 e 2022"],
  ["Sangay",                -2.005, -78.341, "Ecuador",            5230, "Stratovolcano", "2024", 5, "Erupting",  "Uno dei vulcani più attivi della Terra per continuità; eruzioni plurisettimanali"],
  ["El Reventador",         -0.077, -77.656, "Ecuador",            3562, "Stratovolcano", "2024", 4, "Erupting",  "Eruzione quasi continua; spesso visibile da Quito"],
  ["Sabancaya",            -15.787, -71.857, "Perù",               5967, "Stratovolcano", "2024", 3, "Erupting",  "Tra i più attivi delle Ande peruviane; emissioni di SO2 costanti"],
  ["Ubinas",               -16.355, -70.903, "Perù",               5672, "Stratovolcano", "2024", 4, "Warning",  "Vulcano più attivo del Perù; evacuazioni ricorrenti"],
  ["Villarrica",           -39.422, -71.936, "Cile",               2847, "Stratovolcano", "2024", 4, "Erupting",  "Lago di lava attivo nel cono sommitale; eruzione del 2015 causò evacuazioni"],
  ["Lascar",               -23.370, -67.730, "Cile",               5592, "Stratovolcano", "2023", 4, "Watch",    "Il più attivo del nord Cile; emissioni continue di SO2"],
  ["Soufrière Hills",       16.720, -62.180, "Montserrat",         1050, "Stratovolcano", "2023", 4, "Warning",  "In attività quasi continua dal 1995; Plymouth sepolta nel 1997"],
  ["Pelée",                 14.809, -61.165, "Martinica",          1394, "Stratovolcano", "1932", 4, "Watch",    "Eruzione 1902 distrusse Saint-Pierre con surge piroclastico (30.000 vittime)"],
  ["La Soufrière (St. Vincent)",13.336,-61.180,"St. Vincent",      1220, "Stratovolcano", "2021", 4, "Normal",   "Eruzione esplosiva 2021; evacuazioni di massa; 32 anni di quiescenza"],
  ["Masaya",                11.985, -86.161, "Nicaragua",           635, "Caldeira",      "2024", 3, "Erupting",  "Lago di lava spesso visibile; chiamato 'Bocca dell'inferno' dai colonizzatori spagnoli"],
  ["San Cristóbal",         12.702, -87.004, "Nicaragua",          1745, "Stratovolcano", "2024", 3, "Erupting",  "Il più alto del Nicaragua; emissioni continue di SO2"],
  ["Turrialba",             10.025, -83.767, "Costa Rica",         3340, "Stratovolcano", "2019", 3, "Watch",    "Chiuse l'aeroporto di San José nel 2016 per emissioni di cenere"],
  ["Poás",                  10.198, -84.233, "Costa Rica",         2708, "Caldeira",      "2019", 3, "Watch",    "Lago iper-acido (pH < 0); geyser fumarola; fra i più acidi della Terra"],

  // ── OCEANIA / PACIFICO ───────────────────────────────────────────────────
  ["Piton de la Fournaise", -21.244,  55.708, "Francia (Réunion)",  2632, "Shield",       "2024", 2, "Erupting",  "Tra i vulcani più attivi del mondo; eruzioni plurime ogni anno"],
  ["Ulawun",                -5.050, 151.330, "Papua Nuova Guinea",  2334, "Stratovolcano", "2023", 5, "Warning",  "Tra i vulcani più pericolosi del Pacifico; classificato 'decade volcano'"],
  ["Bagana",                -6.137, 155.196, "Papua Nuova Guinea",  1855, "Lava cone",    "2024", 4, "Erupting",  "Quasi continua attività nel Bougainville da decenni; accrescimento costante"],
  ["Rabaul",                -4.271, 152.203, "Papua Nuova Guinea",   688, "Caldeira",     "2023", 4, "Erupting",  "Doppio cono (Tavurvur e Vulcan); eruzione 1994 seppellì parte della città"],
  ["Ambrym",               -16.250, 168.120, "Vanuatu",             1334, "Caldeira",     "2024", 4, "Erupting",  "Tra i tre laghi di lava permanenti al mondo; caldera attivissima"],
  ["Yasur",                -19.530, 169.447, "Vanuatu",              361, "Stratovolcano", "2024", 3, "Erupting",  "In eruzione quasi continua da almeno 800 anni; 'faro del Pacifico' dei navigatori"],
  ["Hunga Tonga-Hunga Ha'apai",-20.536,-175.380,"Tonga",            -150, "Caldeira sottomarina","2022", 5, "Normal", "Mega-eruzione 15 gen 2022: onda d'urto globale, tsunami, nube a 57 km di quota"],
  ["Erebus",               -77.530, 167.167, "Antartide",           3794, "Stratovolcano", "2024", 1, "Erupting",  "Il vulcano più meridionale del mondo; lago di lava fuso permanente"],

  // ── ULTERIORI VULCANI NOTEVOLI ──────────────────────────────────────────
  ["Witori / Pago",         -5.576, 150.516, "Papua Nuova Guinea",   724, "Caldeira",     "2004", 3, "Normal",   "Sistema calderico sull'isola di Umboi"],
  ["Lopevi",               -16.507, 168.346, "Vanuatu",             1413, "Stratovolcano", "2021", 4, "Watch",    "Isola vulcanica remota; eruzioni esplosive ricorrenti"],
  ["Tofua",                -19.750,-175.067, "Tonga",                515, "Caldeira",     "2023", 3, "Watch",    "Isola con caldeira; eruzione del 1787 causò ammutinamento del Bounty"],
  ["Pagan",                 18.130, 145.800, "USA (Isole Marianne)",  570, "Stratovolcano", "2021", 4, "Watch",   "Isola evacuata nel 1981; sporadiche eruzioni"],
  ["Suwanosejima",          29.638, 129.714, "Giappone",             796, "Stratovolcano", "2024", 3, "Erupting",  "Uno dei più attivi delle Ryūkyū; centinaia di eruzioni all'anno"],
  ["Nishinoshima",          27.247, 140.874, "Giappone",             161, "Isola vulcanica","2020", 3, "Watch",   "Isola cresciuta enormemente dal 2013 grazie all'attività"],
  ["Piton des Neiges",     -21.090,  55.480, "Francia (Réunion)",   3070, "Shield",       "22000 AC", 2, "Normal","Vulcano spento più alto dell'Oceano Indiano"],
  ["Miyakejima",            34.094, 139.530, "Giappone",             775, "Stratovolcano", "2005", 4, "Watch",   "Emissioni continue di SO2; evacuazione 2000-2005"],
  ["Fukutoku-Okanoba",      24.284, 141.480, "Giappone",             -14, "Sottomarino",  "2021", 4, "Watch",   "Eruzione 2021 creò temporaneamente una nuova isola"],
  ["Heard Island",         -53.106,  73.513, "Australia",            2745, "Shield",      "2019", 3, "Watch",   "Vulcano attivo nell'Oceano Indiano meridionale subantartico"],
  ["Deception Island",     -62.967, -60.645, "Antartide",             542, "Caldeira",    "1970", 4, "Normal",  "Caldeira allagata; porto naturale; attività fumarolica subacquea"],
  ["Kick 'em Jenny",        12.300, -61.637, "Grenada (offshore)",   -185, "Sottomarino",  "2001", 2, "Watch",   "Vulcano sottomarino nei Caraibi; potenziale tsunami"],
  ["Cerro Azul (Fernandina)",-0.350, -91.550,"Ecuador (Galápagos)", 1476, "Shield",       "2022", 4, "Erupting", "Uno dei più attivi delle Galápagos; torrette a 90° ogni anno"],
  ["Wolf (Galápagos)",      -0.022, -91.332, "Ecuador (Galápagos)", 1707, "Shield",       "2022", 4, "Erupting", "Il più alto delle Galápagos; eruzione del 2015 prima in 33 anni"],
  ["Semisopochnoi",         51.930, 179.597, "USA (Alaska)",         1221, "Caldeira",    "2024", 4, "Erupting", "Eruzioni frequenti; impatto su rotte aeree trans-pacifico"],
  ["Great Sitkin",          52.076,-176.130, "USA (Alaska)",         1740, "Stratovolcano","2023", 4, "Warning",  "Attività anomala persistente; colata lavica nel 2021-23"],
  ["Cleveland",             52.825,-169.944, "USA (Alaska)",         1730, "Stratovolcano","2023", 3, "Watch",   "Eruzione esplosiva ciclica; posizione remota"],
  ["Bogoslof",              53.930,-168.034, "USA (Alaska)",          150, "Sottomarino",  "2017", 4, "Normal",  "Eruzione 2016-17 creò/modificò l'isola; nube a 12 km"],
  ["Okmok",                 53.428,-168.132, "USA (Alaska)",         1073, "Caldeira",     "2008", 5, "Watch",   "Grande caldeira con lago; eruzione 2008 causò ano senza estate in Alaska"],
  ["Mount Spurr",           61.299,-152.251, "USA (Alaska)",         3374, "Stratovolcano","1992", 4, "Watch",   "Eruzione del 1992: cenere coprì Anchorage"],
  ["Katmai / Novarupta",    58.277,-154.953, "USA (Alaska)",         2047, "Caldeira",     "1912", 6, "Normal",  "Eruzione del 1912: più grande del XX secolo; Valle dei 10.000 fumi"],
  ["Ruapehu (NZ)",         -39.281, 175.568, "Nuova Zelanda",        2797, "Stratovolcano","2007", 3, "Watch",   "Lahar del 1953 causò disastro ferroviario (151 vittime); sciovia in cima"],
  ["Tongariro",            -39.157, 175.632, "Nuova Zelanda",        1978, "Stratovolcano","2012", 3, "Watch",   "Eruzione 2012 prima in 115 anni; eruzioni phreátiche ricorrenti"],
  ["Ol Doinyo Lengai",      -2.764,  35.914, "Tanzania",             2878, "Stratovolcano","2017", 2, "Watch",   "Lava carbonatitica unica al mondo; si solidifica in bianco a contatto con l'aria"],
  ["Nevado del Huila",       2.930, -76.030, "Colombia",             5364, "Stratovolcano","2012", 4, "Normal",  "Il più alto della Colombia; lahars verso Valle del Cauca"],
  ["Galeras",                1.220, -77.358, "Colombia",             4276, "Stratovolcano","2010", 4, "Watch",   "Ha ucciso scienziati durante un'escursione nel 1993"],
  ["Tungurahua",            -1.467, -78.442, "Ecuador",              5023, "Stratovolcano","2016", 4, "Normal",  "'La Gola del Fuoco'; eruzioni quasi continue dal 1999 al 2016"],
  ["Popocatépetl",          19.023, -98.622, "Messico",              5426, "Stratovolcano","2024", 5, "Warning", "In fase di intensa attività; 6 milioni di persone nel raggio 40 km"],
  ["Nevado de Colima",      19.514,-103.620, "Messico",              3860, "Stratovolcano","2023", 4, "Warning",  "Pyroclastic flows frequenti; monitoraggio H24"],
  ["Iztaccíhuatl",          19.180, -98.640, "Messico",              5286, "Stratovolcano","Ancient", 4, "Normal","'Donna addormentata'; attualmente quiescente"],
  ["Citlaltépetl",          19.029, -97.268, "Messico",              5636, "Stratovolcano","1687", 4, "Watch",   "Terzo picco nord-americano; crater con emissioni fumaroliche"],
  ["El Chichón",            17.360, -93.228, "Messico",              1150, "Lava dome",    "1982", 5, "Watch",   "Eruzione del 1982 uccise 2.000 persone; abbassò temperature globali"],
  ["Cerro Negro (Nic.)",    12.506, -86.702, "Nicaragua",             728, "Cinder cone",  "1999", 3, "Watch",   "Il più giovane d'America Centrale (nato 1850); vulcano nero e basso"],
  ["Concepción",            11.538, -85.622, "Nicaragua",            1700, "Stratovolcano","2020", 4, "Watch",   "Attivo nell'Isola di Ometepe nel Lago Nicaragua"],
  ["Santa Ana (Ilamatepec)",13.853, -89.630, "El Salvador",          2381, "Stratovolcano","2005", 4, "Normal",  "Punto più alto del Salvador; lago iper-acido nel cratere"],
  ["Izalco",                13.813, -89.632, "El Salvador",          1950, "Stratovolcano","1966", 3, "Normal",  "'Faro del Pacifico'; eruzioni quasi continue 1770–1958"],
  ["Arenal",                10.463, -84.703, "Costa Rica",           1670, "Stratovolcano","2010", 4, "Normal",  "Eruzione quasi continua 1968-2010; ora in quiescenza relativa"],
  ["Barú (Panamá)",          8.808, -82.543, "Panamá",              3474, "Stratovolcano","1550", 4, "Normal",   "Punto più alto di Panama; attività fumarolica"],
  ["Heard Island",         -53.106,  73.513, "Australia",            2745, "Shield",       "2019", 3, "Watch",   "Attivo nell'Oceano Indiano subantartico; monitorato da satellite"],
];

// Colori per stato di attività
const STATUS_COLORS = {
  "Erupting": 0xff2200,
  "Warning":  0xff8800,
  "Watch":    0xffee00,
  "Normal":   0x44aaff,
};

let _active    = false;
let _mesh      = null;
let _loaded    = false;
const _dummy   = new THREE.Object3D();

// Per-status visibility filter (all on by default)
const _statusFilters = { Erupting: true, Warning: true, Watch: true, Normal: true };

function _applyStatusFilters() {
  if (!_mesh) return;
  for (let i = 0; i < VOLCANOES.length; i++) {
    const status  = VOLCANOES[i][8];
    const visible = _statusFilters[status] !== false;
    _mesh.getMatrixAt(i, _dummy.matrix);
    _dummy.matrix.decompose(_dummy.position, _dummy.quaternion, _dummy.scale);
    _dummy.scale.setScalar(visible ? 1 : 0.001);
    _dummy.updateMatrix();
    _mesh.setMatrixAt(i, _dummy.matrix);
  }
  _mesh.instanceMatrix.needsUpdate = true;
}

function _latLonToVec3(lat, lon, r = VOL_R) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const th  = THREE.MathUtils.degToRad(lon + 180);
  const s   = Math.sin(phi);
  return new THREE.Vector3(
    -(r * s * Math.cos(th)),
     r * Math.cos(phi),
     r * s * Math.sin(th)
  );
}

function _buildMesh() {
  const geo = new THREE.SphereGeometry(BASE_SIZE, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });

  // We need per-instance color → use InstancedMesh with color attribute
  const count = VOLCANOES.length;
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), count);
  im.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  // Set per-instance colors
  const colors = new Float32Array(count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const status = VOLCANOES[i][8];
    col.set(STATUS_COLORS[status] ?? 0xffffff);
    colors[i * 3]     = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;

    const pos = _latLonToVec3(VOLCANOES[i][1], VOLCANOES[i][2]);
    _dummy.position.copy(pos);
    _dummy.lookAt(0, 0, 0);
    _dummy.updateMatrix();
    im.setMatrixAt(i, _dummy.matrix);
  }

  im.instanceMatrix.needsUpdate = true;
  im.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(colors, 3));
  im.material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  });

  im.renderOrder = 12;
  im.userData.isVolcanoMesh = true;
  return im;
}

export function enableVolcanoes() {
  _active = true;
  if (!_loaded) {
    _mesh  = _buildMesh();
    _loaded = true;
  }
  globeGroup.add(_mesh);
  _mesh.visible = true;
  _applyStatusFilters();
}

export function disableVolcanoes() {
  _active = false;
  if (_mesh) globeGroup.remove(_mesh);
}

/** Return the instanced mesh for raycasting in main.js */
export function getVolcanoMesh() { return _loaded ? _mesh : null; }

/** Get data object for a specific instance index */
export function getVolcanoData(index) {
  const v = VOLCANOES[index];
  if (!v) return null;
  return {
    name:       v[0],
    lat:        v[1],
    lon:        v[2],
    country:    v[3],
    elevation:  v[4],
    type:       v[5],
    lastErupt:  v[6],
    vei:        v[7],
    status:     v[8],
    description:v[9],
  };
}

export const VOLCANO_STATUS_COLORS = STATUS_COLORS;

export function setVolcanoStatusFilter(status, visible) {
  _statusFilters[status] = visible;
  if (_active && _mesh) _applyStatusFilters();
}

export function getVolcanoStatusFilter(status) { return _statusFilters[status] !== false; }
