const NEIGHBORHOOD_KEYS = [
  "neighborhood",
  "neighbourhood",
  "community area",
  "community_area",
  "redfin neighborhood",
  "redfin_neighborhood",
];

const MRED_CHICAGO_AREA_NEIGHBORHOODS: Record<string, string> = {
  "8001": "Rogers Park",
  "8002": "West Ridge",
  "8003": "Uptown",
  "8004": "Lincoln Square",
  "8005": "North Center",
  "8006": "Lake View",
  "8007": "Lincoln Park",
  "8008": "Near North Side",
  "8009": "Edison Park",
  "8010": "Norwood Park",
  "8011": "Jefferson Park",
  "8012": "Forest Glen",
  "8013": "North Park",
  "8014": "Albany Park",
  "8015": "Portage Park",
  "8016": "Irving Park",
  "8017": "Dunning",
  "8018": "Montclare",
  "8019": "Belmont Cragin",
  "8020": "Hermosa",
  "8021": "Avondale",
  "8022": "Logan Square",
  "8023": "Humboldt Park",
  "8024": "West Town",
  "8025": "Austin",
  "8026": "West Garfield Park",
  "8027": "East Garfield Park",
  "8028": "Near West Side",
  "8029": "North Lawndale",
  "8030": "South Lawndale",
  "8031": "Lower West Side",
  "8032": "Loop",
  "8033": "Near South Side",
  "8034": "Armour Square",
  "8035": "Douglas",
  "8036": "Oakland",
  "8037": "Fuller Park",
  "8038": "Grand Boulevard",
  "8039": "Kenwood",
  "8040": "Washington Park",
  "8041": "Hyde Park",
  "8042": "Woodlawn",
  "8043": "South Shore",
  "8044": "Chatham",
  "8045": "Avalon Park",
  "8046": "South Chicago",
  "8047": "Burnside",
  "8048": "Calumet Heights",
  "8049": "Roseland",
  "8050": "Pullman",
  "8051": "South Deering",
  "8052": "East Side",
  "8053": "West Pullman",
  "8054": "Riverdale",
  "8055": "Hegewisch",
  "8056": "Garfield Ridge",
  "8057": "Archer Heights",
  "8058": "Brighton Park",
  "8059": "McKinley Park",
  "8060": "Bridgeport",
  "8061": "New City",
  "8062": "West Elsdon",
  "8063": "Gage Park",
  "8064": "Clearing",
  "8065": "West Lawn",
  "8066": "Chicago Lawn",
  "8067": "West Englewood",
  "8068": "Englewood",
  "8069": "Greater Grand Crossing",
  "8070": "Ashburn",
  "8071": "Auburn Gresham",
  "8072": "Beverly",
  "8073": "Washington Heights",
  "8074": "Mount Greenwood",
  "8075": "Morgan Park",
  "8076": "O'Hare",
  "8077": "Edgewater",
};

function toCleanText(value: unknown) {
  if (value === null || value === undefined) return null;

  const text = String(value).replace(/^neighbou?rhood\s*:\s*/i, "").trim();
  return text.length > 0 && text.length <= 80 ? text : null;
}

export function isNeighborhoodKey(key: string) {
  return NEIGHBORHOOD_KEYS.includes(key.trim().toLowerCase());
}

export function getNeighborhoodFromMredArea(value: unknown) {
  const areaCode = toCleanText(value)?.match(
    /\b(80(?:0[1-9]|[1-6]\d|7[0-7]))\b/,
  )?.[1];

  return areaCode ? MRED_CHICAGO_AREA_NEIGHBORHOODS[areaCode] ?? null : null;
}

export function getNeighborhoodFromExtractedFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const metadata = value as Record<string, unknown>;
  const neighborhoodEntry = Object.entries(metadata).find(([key]) =>
    isNeighborhoodKey(key),
  );
  const neighborhood = toCleanText(neighborhoodEntry?.[1]);

  if (neighborhood) return neighborhood;

  const areaEntry = Object.entries(metadata).find(
    ([key]) => key.trim().toLowerCase() === "area",
  );

  return getNeighborhoodFromMredArea(areaEntry?.[1]);
}
