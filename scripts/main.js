console.log("!!! SCRIPT IS ALIVE !!!");

// 1. Shared data and app state

// Data is the shared cache after the CSV is loaded and reorganized.
const Data = {
  raw: [],
  countries: [],
  crops: [],
  years: [],
  iso3Map: new Map(),
  byCountryYearCrop: null,
  byCountryYear: null,
  riskRows: [],
};

// Predefined story cards defined by significant years in global agriculture history.
const STORY_CARDS = {
  1961: "The Green Revolution begins. The introduction of high-yield seed varieties and synthetic fertilizers triggers a massive upward trend in global agricultural production.",
  1991: "The fall of the Soviet Union. Notice the volatility in Eastern European yields as agricultural systems undergo sudden, massive restructuring.",
  1998: "A historically severe El Niño weather pattern strikes. Watch the yield drops in Southeast Asian countries as droughts restrict rice production.",
  2008: "The Global Food Price Crisis. A combination of severe weather shocks and export bans pushes the global food supply chain to its breaking point.",
  2012: "A historic drought sweeps across the American Midwest. If you filter to the USA and Maize, you will see a sharp dip in yields this year.",
  2022: "Major geopolitical conflicts disrupt the export of wheat, sunflower oil, and crucial synthetic fertilizers, threatening global food security."
};



// State is the current dashboard selection that every chart reads from.
const State = {
  selectedCountries: new Set(), // Sets keep filter selections unique.
  selectedCrops: new Set(),
  selectedCountry: null,
  selectedCrop: "ALL",
  metric: "Yield",
  year: 2010,
  window: 5,
  trendCrops: new Set()
};

const CROP_COLOURS = {
  "Barley":        "#e8a838",
  "Cassava, fresh":"#38e8a8",
  "Maize (corn)":  "#e84888",
  "Potatoes":      "#a838e8",
  "Rice":          "#38b2e8",
  "Soya beans":    "#88e838",
  "Wheat":         "#e86038"
};

// harcoded dictionary for historical events to show as shaded bands on the temperature chart, with crop icons for the most affected crops
const HISTORICAL_EVENTS = [
  // events before 1990
  { start: 1972, end: 1973, crops: ["Wheat", "Rice"], title: "Global Food Crisis & El Niño", desc: "Massive Soviet grain purchases combined with global weather anomalies spiked prices and disrupted supplies." },
  { start: 1982, end: 1983, crops: ["Wheat", "Maize (corn)"], title: "Super El Niño", desc: "One of the strongest El Niño events on record caused severe droughts in Australia and Africa." },
  
  // events after 1990
  { start: 1991, end: 1991, crops: ["Wheat", "Barley", "Potatoes"], title: "Soviet Union Collapse", desc: "Massive agricultural restructuring caused temporary drops in Eastern Europe." },
  { start: 1997, end: 1998, crops: ["Rice", "Maize (corn)"], title: "Severe El Niño", desc: "Global droughts heavily impacted rice and maize yields in Asia." },
  { start: 2007, end: 2008, crops: ["Wheat", "Rice", "Maize (corn)", "Soya beans"], title: "Food Price Crisis", desc: "Droughts in grain-producing nations combined with high oil prices." },
  { start: 2012, end: 2012, crops: ["Maize (corn)", "Soya beans"], title: "North American Drought", desc: "Severe heatwave disrupted US maize and soybean production." },
  { start: 2022, end: 2023, crops: ["Wheat", "Barley"], title: "Geopolitical Conflict", desc: "Supply chain disruptions affecting global wheat and fertilizer exports." }
];
// 2. Load and organize the dataset

// Load the CSV once, then build faster lookup tables for the charts.
async function loadData() {
  const raw = await d3.csv("data/Merged_FAOSTAT_Cleaned.csv", d => ({
    country:    d.Country,
    iso3:       d.ISO3,
    year:       +d.Year,
    crop:       d.Crop,
    element:    d.Element,
    agriValue:  +d.Agri_Value  || 0,
    tempChange: +d.Temp_Change || null,
  }));

  Data.raw = raw;

  // Shared lists used by controls and chart domains.
  Data.countries = [...new Set(raw.map(d => d.country))].sort();
  Data.crops      = [...new Set(raw.map(d => d.crop))].sort();
  Data.years      = [...new Set(raw.map(d => d.year))].sort((a, b) => a - b);

  // Build a map from country name to ISO3 code for joining with the topojson later.
  raw.forEach(d => { if (!Data.iso3Map.has(d.country)) Data.iso3Map.set(d.country, d.iso3); });

  // Nested lookup for country/year/crop-specific rows.
  Data.byCountryYearCrop = d3.group(raw, d => d.country, d => d.year, d => d.crop);

  // Country/year summary used by charts that do not need crop-level detail.
  Data.byCountryYear = new Map();
  Data.countries.forEach(country => {
    const byYear = new Map();
    const yearGroups = Data.byCountryYearCrop.get(country);
    if (!yearGroups) return;
    yearGroups.forEach((cropMap, year) => {
      let tempVals = [], yieldVals = [], prodVals = [], areaVals = [];
      cropMap.forEach((rows) => {
        rows.forEach(row => {
          if (row.tempChange !== null) tempVals.push(row.tempChange);
          if (row.element === "Yield")           yieldVals.push(row.agriValue);
          if (row.element === "Production")       prodVals.push(row.agriValue);
          if (row.element === "Area harvested")   areaVals.push(row.agriValue);
        });
      });
      byYear.set(year, {
        avgTemp:    tempVals.length   ? d3.mean(tempVals)   : null,
        avgYield:   yieldVals.length  ? d3.mean(yieldVals)  : null,
        totalProd:  prodVals.length   ? d3.sum(prodVals)    : null,
        totalArea:  areaVals.length   ? d3.sum(areaVals)    : null,
      });
    });
    Data.byCountryYear.set(country, byYear);
  });

  console.log("Total Rows Loaded:", Data.raw.length);
  console.log("Countries Found:", Data.countries.length);
  console.log("Sample Country (United Kingdom):", Data.byCountryYear.get("United Kingdom"));
  
  return raw;
}

// 3. Controls and selection UI

// Fill the header badges from the loaded dataset.
function updateStatBadges() {
  document.getElementById("stat-countries").textContent = Data.countries.length;
  document.getElementById("stat-crops").textContent = Data.crops.length;
  if (Data.years && Data.years.length > 0) {
    const startYear = Data.years[0];
    const endYear = Data.years[Data.years.length - 1];
    document.getElementById("stat-years").textContent = `${startYear}–${endYear}`;
  }
}

// Show the current country/crop filter summary beside the controls.
function updateSelectionInfo() {
  const countryCount = State.selectedCountries.size;
  const cropCount = State.selectedCrops.size;

  const cLabel = countryCount === 0 ? "all countries"
    : countryCount === 1 ? [...State.selectedCountries][0]
    : `${countryCount} countries`;

  const pLabel = cropCount === 0 ? "all crops"
    : cropCount === 1 ? [...State.selectedCrops][0]
    : `${cropCount} crops`;

  d3.select("#selInfo").text(`Showing ${cLabel} and ${pLabel}`);
}
// Build the country checkbox list.
function initCountryList() {
  const countryList = d3.select("#countrySel-list");

  const countryItems = countryList.selectAll(".multisel-item")
    .data(Data.countries)
    .join("div")
      .attr("class", "multisel-item")
      .attr("data-value", d => d)
      .on("click", function(event, d) {
		event.stopPropagation();
        if (event.target.tagName === 'INPUT') return;
        const cb = d3.select(this).select("input").node();
        cb.checked = !cb.checked;
        updateCountrySelection(d, cb.checked);
      });

  countryItems.append("input")
    .attr("type", "checkbox")
    .on("change", (event, d) => {
	  event.stopPropagation();
      updateCountrySelection(d, event.target.checked);
    });

  countryItems.append("span")
    .text(d => d);
}

// Open one multi-select dropdown at a time, then close it on outside click.
function bindDropdownToggles() {
  const configs = [
    { triggerId: "countrySel-trigger", dropdownId: "countrySel-dropdown" },
    { triggerId: "cropSel-trigger", dropdownId: "cropSel-dropdown" }
  ];

  configs.forEach(conf => {
    const trigger = document.getElementById(conf.triggerId);
    const dropdown = document.getElementById(conf.dropdownId);

    if (trigger && dropdown) {
      trigger.onclick = (e) => {
        e.stopPropagation(); 
        const isShowing = dropdown.style.display === "block";
        document.querySelectorAll('.multisel-dropdown').forEach(d => d.style.display = 'none');
        
        dropdown.style.display = isShowing ? "none" : "block";
      };
    }
  });
  document.addEventListener("click", () => {
    document.getElementById("countrySel-dropdown").style.display = "none";
    document.getElementById("cropSel-dropdown").style.display = "none";
  });
}
// Keep country filter state, header badge, and dropdown text in sync.
function updateCountrySelection(country, isChecked) {
  if (isChecked) State.selectedCountries.add(country);
  else State.selectedCountries.delete(country);

  const badge = document.getElementById("stat-selected");
  const count = State.selectedCountries.size;
  
  if (badge) {
    badge.textContent = count === 0 ? "All Countries" : 
                        count === 1 ? Array.from(State.selectedCountries)[0] : 
                        `${count} Countries`;
  }

  const placeholder = document.querySelector("#countrySel-pills .multisel-placeholder");
  if (placeholder) {
    placeholder.textContent = count > 0 ? `${count} selected` : "All countries";
  }

  updateSelectionInfo();

  if (typeof updateAll === "function") updateAll();

  console.log("State updated:", Array.from(State.selectedCountries));
}
// Build the crop checkbox list.
function initCropList() {
  const cropList = d3.select("#cropSel-list");

  const cropItems = cropList.selectAll(".multisel-item")
    .data(Data.crops)
    .join("div")
      .attr("class", "multisel-item")
      .attr("data-value", d => d)
      .on("click", function(event, d) {
		event.stopPropagation();
        if (event.target.tagName === 'INPUT') return;
        
        const cb = d3.select(this).select("input").node();
        cb.checked = !cb.checked;
        updateCropSelection(d, cb.checked);
      });


  cropItems.append("input")
    .attr("type", "checkbox")
    .on("change", (event, d) => {
		event.stopPropagation();
      updateCropSelection(d, event.target.checked);
    });
  cropItems.append("span")
    .text(d => d);
}
// Keep crop filter state and dropdown text in sync.
function updateCropSelection(crop, isChecked) {
  if (isChecked) {
    State.selectedCrops.add(crop);
  } else {
    State.selectedCrops.delete(crop);
  }

  const count = State.selectedCrops.size;
  const placeholder = document.querySelector("#cropSel-pills .multisel-placeholder");
  
  if (placeholder) {
    placeholder.textContent = count > 0 ? `${count} crops selected` : "All crops";
  }

  updateSelectionInfo();

  if (typeof updateAll === "function") updateAll();
  
  console.log("Crops Selected:", Array.from(State.selectedCrops));
}

const tt = {
  el: null,
  // Reuse the page tooltip, or create one if the HTML is missing it.
  getEl() {
    if (!this.el) {
      this.el = document.getElementById("tooltip");
      if (!this.el) {
        this.el = document.createElement("div");
        this.el.id = "tooltip";
        document.body.appendChild(this.el);
      }
    }
    return this.el;
  },
  // Show tooltip content near the pointer.
  show(evt, html) {
    this.getEl().innerHTML = html;
    this.getEl().classList.add("visible");
    this.move(evt);
  },
  // Keep the tooltip inside the viewport.
  move(evt) {
    const x = evt.clientX + 14;
    const y = evt.clientY - 10;
    const w = this.getEl().offsetWidth;
    const h = this.getEl().offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.getEl().style.left = (x + w > vw ? evt.clientX - w - 14 : x) + "px";
    this.getEl().style.top  = (y + h > vh ? evt.clientY - h - 10 : y) + "px";
  },
  hide() {
    clearTimeout(this.hideTimeout);
    this.hideTimeout = setTimeout(() => {
      this.getEl().classList.remove("visible");
    }, 80);
  }
};

// 4. Shared helpers used by multiple charts

// Select one country from chart clicks, or clear the selection.
function setSelectedCountry(countryName) {
  if (!countryName || countryName === "ALL") {
    State.selectedCountries.clear();
  } else {
    State.selectedCountries = new Set([countryName]);
  }

  updateSelectionInfo();
}

// Select one crop from chart clicks, or clear the crop selection.
function setSelectedCrop(cropName) {
  if (!cropName || cropName === "ALL") {
    State.selectedCrops.clear();
  } else {
    State.selectedCrops = new Set([cropName]);
  }
  syncSelectionState();
}

// Empty crop selection means select "all crops" across the dashboard.
function getSelectedCropNames() {
  return State.selectedCrops.size ? [...State.selectedCrops] : [...Data.crops];
}

function updateStoryCard() {
  const cardEl = document.getElementById("dynamic-story-text");
  if (!cardEl) return; // Failsafe if the HTML element isn't added yet

  // Find the closest story year that is less than or equal to the current slider year
  const years = Object.keys(STORY_CARDS).map(Number).sort((a,b) => b - a);
  let activeStory = "Use the slider to explore the historical context of global agriculture.";
  let activeYear = null;

  for (let y of years) {
    if (State.year >= y) {
      activeStory = STORY_CARDS[y];
      activeYear = y;
      break;
    }
  }

  // Update the HTML inside the card
  cardEl.innerHTML = activeYear
    ? `<strong>Era starting ~${activeYear}:</strong> ${activeStory}`
    : activeStory;
}

// Central redraw path after any filter or chart interaction changes State.
function updateAll() {
  TempChart.update();
  CropTrendChart.update();
  RiskMapChart.update();
  BarChart.update();
  HeatmapChart.update();
  updateStoryCard();
  document.getElementById("yearLabel").textContent = State.year;
  document.getElementById("yearSlider").value = State.year;
}

// Connect top-level controls to State and redraw the dashboard on change.
function bindFilterControls() {
  const yearSlider = document.getElementById("yearSlider");
  const yearLabel = document.getElementById("yearLabel");
  const windowSel = document.getElementById("windowSel");
  const resetBtn = document.getElementById("resetBtn");

  const metricSel = document.getElementById("metricSel");
  if (metricSel) {
    metricSel.addEventListener("change", function() {
      State.metric = this.value;
      BarChart.setMetric(this.value);
      updateAll();
    });
  }

  if (yearSlider) {
    State.year = +yearSlider.value;
    yearSlider.addEventListener("input", function() {
      State.year = +this.value;
      if (yearLabel) yearLabel.textContent = this.value;
      updateAll();
    });
  }

  if (windowSel) {
    State.window = +windowSel.value;
    windowSel.addEventListener("change", function() {
      State.window = +this.value;
      updateAll();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      State.selectedCountries.clear();
      State.selectedCrops.clear();
      document.querySelectorAll("#countrySel-list input[type='checkbox']").forEach(cb => cb.checked = false);
      document.querySelectorAll("#cropSel-list input[type='checkbox']").forEach(cb => cb.checked = false);
      const badge = document.getElementById("stat-selected");
      if (badge) badge.textContent = "All Countries";
      const countryPh = document.querySelector("#countrySel-pills .multisel-placeholder");
      if (countryPh) countryPh.textContent = "All countries";
      const cropPh = document.querySelector("#cropSel-pills .multisel-placeholder");
      if (cropPh) cropPh.textContent = "All crops";
      updateSelectionInfo();
      updateAll();
    });
  }
}

// Summarize one country across the selected year window and crop filter.
function getCountryStat(country, centerYear, windowSize, cropFilter = null) {
  const half  = Math.floor(windowSize / 2);
  const yrs   = d3.range(centerYear - half, centerYear + half + 1);
  const yearMap = Data.byCountryYear.get(country);
  if (!yearMap) return null;

  let temps = [], yields = [], prods = [], areas = [];

  if (!cropFilter || cropFilter.size === 0) {
    yrs.forEach(y => {
      const s = yearMap.get(y);
      if (!s) return;
      if (s.avgTemp   != null) temps.push(s.avgTemp);
      if (s.avgYield  != null) yields.push(s.avgYield);
      if (s.totalProd != null) prods.push(s.totalProd);
      if (s.totalArea != null) areas.push(s.totalArea);
    });
  } else {
    const countryYearMap = Data.byCountryYearCrop.get(country);
    if (!countryYearMap) return null;
    yrs.forEach(y => {
      const byYear = countryYearMap.get(y);
      if (!byYear) return;
      cropFilter.forEach(crop => {
        const rows = byYear.get(crop);
        if (!rows) return;
        rows.forEach(row => {
          if (row.tempChange !== null) temps.push(row.tempChange);
          if (row.element === "Yield")          yields.push(row.agriValue);
          if (row.element === "Production")      prods.push(row.agriValue);
          if (row.element === "Area harvested")  areas.push(row.agriValue);
        });
      });
    });
  }

  if (!temps.length && !yields.length) return null;
  return {
    avgTemp:   temps.length  ? d3.mean(temps)  : null,
    avgYield:  yields.length ? d3.mean(yields) : null,
    totalProd: prods.length  ? d3.sum(prods)   : null,
    totalArea: areas.length  ? d3.sum(areas)   : null,
  };
}

// 5. Risk scoring and map helpers

// Pearson correlation: -1 means opposite movement, +1 means same direction.
function pearsonCorr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const ma = d3.mean(a), mb = d3.mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (!da || !db) return null;
  return num / Math.sqrt(da * db);
}

// Standard deviation helps measure how unstable yield is over time.
function stdDev(values) {
  if (!values.length) return null;
  const mean = d3.mean(values);
  return Math.sqrt(d3.mean(values.map(v => (v - mean) * (v - mean))));
}

// Simple linear slope used to estimate the temperature trend direction.
function linearSlope(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;
  const mx = d3.mean(x), my = d3.mean(y);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    den += (x[i] - mx) * (x[i] - mx);
  }
  return den ? num / den : null;
}

// Convert a metric to a 0-1 range so different risk factors can combine.
function normalizeRows(rows, inputKey, outputKey) {
  const vals = rows.map(r => r[inputKey]).filter(v => v != null && isFinite(v));
  const min = d3.min(vals);
  const max = d3.max(vals);
  const span = (max - min) || 1;
  rows.forEach(r => {
    r[outputKey] = r[inputKey] == null ? 0 : (r[inputKey] - min) / span;
  });
}

// Precompute risk values for each country/crop pair before drawing the map.
function computeRiskRows() {
  const results = [];

  Data.countries.forEach(country => {
    const byYear = Data.byCountryYearCrop.get(country);
    if (!byYear) return;

    Data.crops.forEach(crop => {
      const years = [];
      const yieldVals = [];
      const tempVals = [];

      byYear.forEach((cropMap, year) => {
        const recs = cropMap.get(crop);
        if (!recs) return;
        const ys = recs.filter(r => r.element === "Yield").map(r => r.agriValue);
        const ts = recs.map(r => r.tempChange).filter(v => v != null);
        if (!ys.length || !ts.length) return;
        years.push(+year);
        yieldVals.push(d3.mean(ys));
        tempVals.push(d3.mean(ts));
      });

      if (new Set(years).size < 10) return;

      // Higher risk is tied to negative yield-temperature correlation, warming trend, and yield variability.
      const corr = pearsonCorr(yieldVals, tempVals);
      const negCorr = corr != null && corr < 0 ? Math.abs(corr) : 0;
      const tempSlope = linearSlope(years, tempVals);
      const variability = d3.mean(yieldVals) ? (stdDev(yieldVals) / d3.mean(yieldVals)) : null;

      results.push({
        country,
        crop,
        correlation: corr,
        negCorr,
        tempSlope,
        yieldVariability: variability,
      });
    });
  });

  normalizeRows(results, "negCorr", "normCorr");
  normalizeRows(results, "tempSlope", "normTempSlope");
  normalizeRows(results, "yieldVariability", "normVariability");

  results.forEach(r => {
    r.riskScore = r.normCorr * r.normTempSlope * r.normVariability;
    r.riskCategory = r.riskScore < 0.25 ? "Low Risk"
      : r.riskScore < 0.5 ? "Moderate Risk"
      : r.riskScore < 0.75 ? "High Risk"
      : "Severe Risk";
  });

  Data.riskRows = results;
}

// World-atlas uses numeric country IDs, while the CSV uses ISO3 codes.
const ISO3_TO_NUM = {
  "AFG":"4","ALB":"8","DZA":"12","AGO":"24","ARG":"32","ARM":"51","AUS":"36",
  "AUT":"40","AZE":"31","BGD":"50","BLR":"112","BEL":"56","BLZ":"84","BEN":"204",
  "BTN":"64","BOL":"68","BIH":"70","BWA":"72","BRA":"76","BGR":"100","BFA":"854",
  "BDI":"108","CPV":"132","KHM":"116","CMR":"120","CAN":"124","CAF":"140",
  "TCD":"148","CHL":"152","CHN":"156","COL":"170","COD":"180","COG":"178",
  "CRI":"188","CIV":"384","HRV":"191","CUB":"192","CYP":"196","CZE":"203",
  "DNK":"208","DJI":"262","DOM":"214","ECU":"218","EGY":"818","SLV":"222",
  "ERI":"232","EST":"233","ETH":"231","FJI":"242","FIN":"246","FRA":"250",
  "GAB":"266","GMB":"270","GEO":"268","DEU":"276","GHA":"288","GRC":"300",
  "GTM":"320","GIN":"324","GNB":"624","HTI":"332","HND":"340","HUN":"348",
  "IND":"356","IDN":"360","IRN":"364","IRQ":"368","IRL":"372","ISR":"376",
  "ITA":"380","JAM":"388","JPN":"392","JOR":"400","KAZ":"398","KEN":"404",
  "PRK":"408","KOR":"410","KWT":"414","KGZ":"417","LAO":"418","LVA":"428",
  "LBN":"422","LSO":"426","LBR":"430","LBY":"434","LTU":"440","MDG":"450",
  "MWI":"454","MYS":"458","MDV":"462","MLI":"466","MRT":"478","MEX":"484",
  "MDA":"498","MNG":"496","MAR":"504","MOZ":"508","MMR":"104","NAM":"516",
  "NPL":"524","NLD":"528","NZL":"554","NIC":"558","NER":"562","NGA":"566",
  "NOR":"578","OMN":"512","PAK":"586","PAN":"591","PNG":"598","PRY":"600",
  "PER":"604","PHL":"608","POL":"616","PRT":"620","ROU":"642","RUS":"643",
  "RWA":"646","SAU":"682","SEN":"686","SLE":"694","SOM":"706","ZAF":"710",
  "ESP":"724","LKA":"144","SDN":"729","SWZ":"748","SWE":"752","CHE":"756",
  "SYR":"760","TJK":"762","TZA":"834","THA":"764","TGO":"768","TTO":"780",
  "TUN":"788","TUR":"792","TKM":"795","UGA":"800","UKR":"804","GBR":"826",
  "USA":"840","URY":"858","UZB":"860","VEN":"862","VNM":"704","YEM":"887",
  "ZMB":"894","ZWE":"716","MKD":"807","SRB":"688","MNE":"499","SVK":"703",
  "SVN":"705","LUX":"442","ISL":"352","MLT":"470","GUY":"328","SUR":"740",
  "PRK":"408","TLS":"626","SSD":"728","COM":"174","MUS":"480","SYC":"690",
  "MDG":"450","ZAN":"834","TZA":"834","STP":"678","CPV":"132","GNQ":"226",
  "CAF":"140","ERI":"232","DJI":"262","SOM":"706","ETH":"231","KEN":"404",
  "UGA":"800","RWA":"646","BDI":"108","TZA":"834","MOZ":"508","MWI":"454",
  "ZMB":"894","ZWE":"716","BWA":"72","NAM":"516","ZAF":"710","LSO":"426",
  "SWZ":"748","MDG":"450","COM":"174","MUS":"480","SYC":"690","STP":"678",
  "CPV":"132","GNQ":"226","GAB":"266","COG":"178","COD":"180","CMR":"120",
  "NGA":"566","BEN":"204","GHA":"288","CIV":"384","LBR":"430","SLE":"694",
  "GIN":"324","GNB":"624","SEN":"686","GMB":"270","MLI":"466","NER":"562",
  "BFA":"854","TGO":"768","MRT":"478","MAR":"504","DZA":"12","TUN":"788",
  "LBY":"434","EGY":"818","SDN":"729","ETH":"231","ERI":"232","DJI":"262",
  "SOM":"706","KEN":"404","UGA":"800","TZA":"834","RWA":"646","BDI":"108"
};

// Convert a world-atlas country ID back to the CSV country name.
function countryFromTopoId(numId) {
  const id = String(numId);
  for (const [iso3, num] of Object.entries(ISO3_TO_NUM)) {
    if (num !== id) continue;
    for (const [name, code] of Data.iso3Map.entries()) {
      if (code === iso3) return name;
    }
  }
  return null;
}

// 6. Chart modules
// Each chart follows the same pattern:
// init() creates the SVG structure once.
// update() redraws the chart whenever State changes.

// Chart: temperature trends by country.
const TempChart = (() => {
  let svg, width, height, margin;

  // Create the temperature chart SVG layers once.
  function init() {
    const container = document.getElementById("mapPanel");
    width = container.clientWidth - 32;
    height = 300;
    margin = { top: 20, right: 20, bottom: 40, left: 56 };

    svg = d3.select("#tempSvg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto; background: #fafbfc;");
    svg.selectAll("*").remove();
    svg.append("g").attr("class", "axis x-axis-temp").attr("transform", `translate(0,${height - margin.bottom})`);
    svg.append("g").attr("class", "axis y-axis-temp").attr("transform", `translate(${margin.left},0)`);
    svg.append("g").attr("class", "temp-lines");
    svg.append("g").attr("class", "event-bands");
    svg.append("g").attr("class", "temp-lines");
    console.log("TempChart initialized with width:", width, "height:", height);
  }

  // Draw one temperature trend line per selected country.
  function update() {
    let countries = [];
    if (State.selectedCountries.size) {
      countries = [...State.selectedCountries];
    } else {
      countries = [...Data.countries];
    }

    const series = countries.map(country => {
      const vals = [];
      const yearMap = Data.byCountryYear.get(country) || new Map();
      yearMap.forEach((s, y) => {
        if (s.avgTemp != null) vals.push({ year: +y, temp: s.avgTemp });
      });
      vals.sort((a, b) => a.year - b.year);

      if (State.window > 1 && vals.length > 1) {
        const half = Math.floor(State.window / 2);
        const smoothed = vals.map((point, index) => {
          const start = Math.max(0, index - half);
          const end = Math.min(vals.length - 1, index + half);
          const segment = vals.slice(start, end + 1);
          return { year: point.year, temp: d3.mean(segment, d => d.temp) };
        });
        return { country, vals: smoothed };
      }

      return { country, vals };
    }).filter(s => s.vals.length > 1);

    console.log("TempChart update - series count:", series.length, "data points sample:", series.slice(0, 3));
    if (!series.length) {
      console.warn("No valid data series for TempChart");
      return;
    }

    const allPoints = series.flatMap(s => s.vals);
    const x = d3.scaleLinear().domain(d3.extent(allPoints, d => d.year)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain(d3.extent(allPoints, d => d.temp)).nice().range([height - margin.bottom, margin.top]);

    const activeEvents = HISTORICAL_EVENTS.filter(e => {
      // Temp chart only cares about the country, NOT the crops
      return !e.country || (State.selectedCountries.size > 0 && State.selectedCountries.has(e.country));
    });

    const bandSel = svg.select(".event-bands").selectAll(".event-band").data(activeEvents, d => d.title);
    bandSel.join(
      enter => enter.append("rect")
        .attr("class", "event-band")
        .attr("y", margin.top)
        .attr("height", height - margin.top - margin.bottom)
        .attr("fill", "#c02020")
        .attr("opacity", 0.08) // Faint red background
        .on("mousemove", (evt, d) => {
          tt.show(evt, `
            <div class="tt-title">${d.start}${d.start !== d.end ? '–' + d.end : ''}: ${d.title}</div>
            <div class="tt-row"><span class="tt-val">${d.desc}</span></div>
          `);
        })
        .on("mouseleave", () => tt.hide())
        .call(applyBandPosition, x),
      update => update.call(applyBandPosition, x),
      exit => exit.remove()
    );

    // Helper to position bands
    function applyBandPosition(selection, xScale) {
      selection
        .attr("x", d => d.start === d.end ? xScale(d.start) - 6 : xScale(d.start))
        .attr("width", d => d.start === d.end ? 12 : Math.max(xScale(d.end) - xScale(d.start), 2));
    }

    svg.select(".x-axis-temp").call(d3.axisBottom(x).ticks(8).tickFormat(d3.format("d")));
    svg.select(".y-axis-temp").call(d3.axisLeft(y).ticks(6));

    const line = d3.line().x(d => x(d.year)).y(d => y(d.temp)).curve(d3.curveMonotoneX);

    svg.select(".temp-lines").selectAll(".temp-line").data(series, d => d.country).join(
      enter => enter.append("path")
        .attr("class", "temp-line")
        .attr("fill", "none")
        .attr("stroke", "#2255aa")
        .attr("stroke-width", 1.2)
        .attr("opacity", 0.55)
        .attr("d", d => line(d.vals))
        .on("mousemove", (evt, d) => {
          tt.show(evt, `<div class=\"tt-title\">${d.country}</div>`);
        })
        .on("mouseleave", () => tt.hide())
        .on("click", (evt, d) => {
          setSelectedCountry(d.country);
          updateAll();
        }),
      update => update
        .attr("stroke", d => State.selectedCountries.size && State.selectedCountries.has(d.country) ? "#c02020" : "#2255aa")
        .attr("stroke-width", d => State.selectedCountries.size && State.selectedCountries.has(d.country) ? 2.2 : 1.2)
        .attr("opacity", d => State.selectedCountries.size && !State.selectedCountries.has(d.country) ? 0.15 : 0.65)
        .attr("d", d => line(d.vals)),
      exit => exit.remove()
    );
  }

  return { init, update };
})();

// Chart: crop trends by metric.
const CropTrendChart = (() => {
  let svg, width, height, margin;

  // Create the crop trend SVG layers and legend once.
  function init() {
    const container = document.getElementById("scatterPanel");
    width = container.clientWidth - 32;
    height = 300;
    margin = { top: 20, right: 20, bottom: 40, left: 60 };

    svg = d3.select("#trendSvg").attr("width", width).attr("height", height);
    svg.append("g").attr("class", "axis x-axis-trend").attr("transform", `translate(0,${height - margin.bottom})`);
    svg.append("g").attr("class", "axis y-axis-trend").attr("transform", `translate(${margin.left},0)`);
    svg.append("g").attr("class", "trend-lines");
    svg.append("g").attr("class", "event-bands");
    svg.append("g").attr("class", "trend-lines");
    svg.append("text")
      .attr("class", "y-label-trend")
      .attr("transform", "rotate(-90)")
      .attr("x", -(height / 2))
      .attr("y", 13)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "#5a7490");

    drawLegend();
  }
  
  // Creates the interactive legend pills that toggle crop visibility.
  function drawLegend() {
    const wrap = document.getElementById("trendLegend");
    wrap.innerHTML = "";
    Data.crops.forEach(crop => {
      const pill = document.createElement("div");
      pill.className = "legend-pill active";
      pill.innerHTML = `<span class="legend-swatch" style="background:${CROP_COLOURS[crop] || "#8aabcc"}"></span>${crop}`;
      pill.addEventListener("click", () => {
        if (State.trendCrops.has(crop)) {
          State.trendCrops.delete(crop);
          pill.classList.remove("active");
        } else {
          State.trendCrops.add(crop);
          pill.classList.add("active");
        }
        
        // Treat "none" and "all" as the same default view.
        if (State.trendCrops.size === 0 || State.trendCrops.size === Data.crops.length) {
          State.trendCrops.clear();
          wrap.querySelectorAll(".legend-pill").forEach(el => el.classList.add("active"));
        }

        update();
      });
      wrap.appendChild(pill);
    });
  }

  // Redraw crop metric lines for the active filters.
  function update() {
    const selectedCrops = getSelectedCropNames();
    let activeCrops = State.trendCrops.size
      ? new Set(selectedCrops.filter(crop => State.trendCrops.has(crop)))
      : new Set(selectedCrops);
    if (!activeCrops.size) activeCrops = new Set(selectedCrops);
    const selectedCountries = State.selectedCountries;

    // Labels follow the currently selected agricultural metric.
    const METRIC_UNIT = { "Yield": "kg/ha", "Production": "t", "Area harvested": "ha" };
    const METRIC_LABEL = { "Yield": "Yield (kg/ha)", "Production": "Production (t)", "Area harvested": "Area Harvested (ha)" };
    const metric = State.metric;
    const unit = METRIC_UNIT[metric] || metric;

    const titleEl = document.getElementById("trendTitle");
    if (titleEl) titleEl.textContent = `Crop ${METRIC_LABEL[metric] || metric} Trend Over Time`;
    svg.select(".y-label-trend").text(unit);

    // Keep only rows needed for the current metric/crop/country filters.
    const rows = Data.raw.filter(d =>
      d.element === metric &&
      activeCrops.has(d.crop) &&
      (selectedCountries.size === 0 || selectedCountries.has(d.country))
    );

    // Each line uses the mean metric value for a crop in each year.
    const grouped = d3.rollups(
      rows,
      v => d3.mean(v, d => d.agriValue),
      d => d.crop,
      d => d.year
    ).map(([crop, yearVals]) => ({
      crop,
      vals: yearVals.map(([year, val]) => ({ year: +year, val })).sort((a, b) => a.year - b.year)
    })).filter(s => s.vals.length > 1);

    if (!grouped.length) return;

    const allPoints = grouped.flatMap(s => s.vals);
    const x = d3.scaleLinear().domain(d3.extent(allPoints, d => d.year)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, d3.max(allPoints, d => d.val) * 1.05]).nice().range([height - margin.bottom, margin.top]);

    svg.select(".x-axis-trend").call(d3.axisBottom(x).ticks(8).tickFormat(d3.format("d")));
    svg.select(".y-axis-trend").call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(",.0f")));
    
    // If the event has a country, it must match the selected countries. If it has crops, at least one must match the current crops on the chart. If it has neither, it's always active.
    const activeEvents = HISTORICAL_EVENTS.filter(e => {
      const countryMatch = !e.country || (State.selectedCountries.size > 0 && State.selectedCountries.has(e.country));
      let cropMatch = true; 
      if (e.crops && e.crops.length > 0) {
        cropMatch = e.crops.some(c => activeCrops.has(c)); 
      }

      return countryMatch && cropMatch; 
    });

    const bandSel = svg.select(".event-bands").selectAll(".event-band").data(HISTORICAL_EVENTS);
    bandSel.join(
      enter => enter.append("rect")
        .attr("class", "event-band")
        .attr("y", margin.top)
        .attr("height", height - margin.top - margin.bottom)
        .attr("fill", "#c02020")
        .attr("opacity", 0.08) // Faint red background
        .on("mousemove", (evt, d) => {
          tt.show(evt, `
            <div class="tt-title">${d.start}${d.start !== d.end ? '–' + d.end : ''}: ${d.title}</div>
            <div class="tt-row"><span class="tt-val">${d.desc}</span></div>
          `);
        })
        .on("mouseleave", () => tt.hide())
        .call(applyBandPosition, x),
      update => update.call(applyBandPosition, x),
      exit => exit.remove()
    );

    function applyBandPosition(selection, xScale) {
      selection
        .attr("x", d => d.start === d.end ? xScale(d.start) - 6 : xScale(d.start))
        .attr("width", d => d.start === d.end ? 12 : Math.max(xScale(d.end) - xScale(d.start), 2));
    }

    const line = d3.line().x(d => x(d.year)).y(d => y(d.val)).curve(d3.curveMonotoneX);

    svg.select(".trend-lines").selectAll(".crop-line").data(grouped, d => d.crop).join(
      enter => enter.append("path")
        .attr("class", "crop-line")
        .attr("fill", "none")
        .attr("stroke", d => CROP_COLOURS[d.crop] || "#8aabcc")
        .attr("stroke-width", 2)
        .attr("d", d => line(d.vals))
        .on("mousemove", (evt, d) => {
          tt.show(evt, `<div class=\"tt-title\">${d.crop}</div>`);
        })
        .on("mouseleave", () => tt.hide()),
      update => update
        .attr("stroke", d => CROP_COLOURS[d.crop] || "#8aabcc")
        .attr("d", d => line(d.vals)),
      exit => exit.remove()
    );
  }

  return { init, update };
})();

// Chart: Risk score choropleth map.
const RiskMapChart = (() => {
  let svg, g, path, projection, width, height, features, color, zoom;

  // Set up the map projection, country paths, click/hover, and zoom.
  function init(world) {
    const container = document.getElementById("linePanel");
    width = container.clientWidth - 32;
    height = 280;

    svg = d3.select("#riskMapSvg").attr("width", width).attr("height", height);
    projection = d3.geoNaturalEarth1().scale(width / 7.5).translate([width / 2, height / 2 + 8]);
    path = d3.geoPath(projection);
    features = topojson.feature(world, world.objects.countries).features;
    console.log(features[0]); 
    color = d3.scaleSequential().domain([0, 1]).interpolator(d3.interpolateReds);

    g = svg.append("g");
    g.selectAll("path")
      .data(features)
      .join("path")
      .attr("class", "country-path")
      .attr("d", path)
      .on("mousemove", onMove)
      .on("mouseleave", () => tt.hide())
      .on("click", onClick);

  
  zoom = d3.zoom()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom)
     .on("wheel.zoom", null)   
     .call(zoom);

  // Reset zoom/pan without changing dashboard filters.
  const resetViewBtn = document.getElementById("resetViewBtn");
  if (resetViewBtn) {
    resetViewBtn.addEventListener("click", () => {
      svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
    });
  }
  }

  // Keep the highest-risk crop row for each country.
  function riskByCountry() {
    const rows = State.selectedCrops.size === 0
      ? Data.riskRows
      : Data.riskRows.filter(r => State.selectedCrops.has(r.crop));

    const best = new Map();
    rows.forEach(r => {
      const prev = best.get(r.country);
      if (!prev || r.riskScore > prev.riskScore) best.set(r.country, r);
    });
    return best;
  }

  // Recolor countries and dim non-selected countries.
  function update() {
    const byCountry = riskByCountry();

    g.selectAll(".country-path")
      .attr("fill", d => {
        const country = countryFromTopoId(d.id);
        const row = country ? byCountry.get(country) : null;
        return row ? color(row.riskScore) : "#c7d6e5";
      })
      .attr("class", d => {
        const country = countryFromTopoId(d.id);
        if (!State.selectedCountries.size) return "country-path";
        return State.selectedCountries.has(country) ? "country-path selected" : "country-path dimmed";
      });
  }

  // Tooltip shows the top risk row for the hovered country.
  function onMove(evt, d) {
    const country = countryFromTopoId(d.id);
    if (!country) return tt.hide();

    const rows = State.selectedCrops.size === 0
      ? Data.riskRows.filter(r => r.country === country)
      : Data.riskRows.filter(r => r.country === country && State.selectedCrops.has(r.crop));
    if (!rows.length) return tt.hide();

    const r = rows.sort((a, b) => b.riskScore - a.riskScore)[0];
    tt.show(evt, `
      <div class="tt-title">${country}</div>
      <div class="tt-row"><span class="tt-key">Risk Score</span><span class="tt-val">${r.riskScore.toFixed(3)}</span></div>
      <div class="tt-row"><span class="tt-key">Category</span><span class="tt-val">${r.riskCategory}</span></div>
      <div class="tt-row"><span class="tt-key">Crop</span><span class="tt-val">${r.crop}</span></div>
      <div class="tt-row"><span class="tt-key">Correlation</span><span class="tt-val">${r.correlation == null ? "—" : r.correlation.toFixed(3)}</span></div>
      <div class="tt-row"><span class="tt-key">TempSlope</span><span class="tt-val">${r.tempSlope == null ? "—" : r.tempSlope.toFixed(5)}</span></div>
      <div class="tt-row"><span class="tt-key">Yield Variability</span><span class="tt-val">${r.yieldVariability == null ? "—" : r.yieldVariability.toFixed(3)}</span></div>
    `);
  }

  // Clicking a country toggles the country filter.
  function onClick(evt, d) {
    const country = countryFromTopoId(d.id);
    if (!country) return;
    if (State.selectedCountries.size === 1 && State.selectedCountries.has(country)) {
      setSelectedCountry("ALL");
    } else {
      setSelectedCountry(country);
    }
    updateAll();
  }

  return { init, update };
})();

// Chart: Bar chart country ranking by a selected metric.
const BarChart = (() => {
  let svg, width, height, margin;

  // Local state for the bar chart's own controls.
  // barMetric: "temp" | "Yield" | "Production" | "Area harvested"
  // barRank  : "top"  | "bottom"
  // barN     : number of countries shown
  const local = { barMetric: "temp", barRank: "top", barN: 15 };

  // Labels, formatters, and colors for each ranking metric.
  const METRIC_META = {
    temp:             { label: "Mean Temp. Anomaly (°C)",  fmt: v => v.toFixed(2)+"°C",       colorPalette: ["#2255aa","#e87030","#c02020"] },
    "Yield":          { label: "Avg Yield (kg/ha)",         fmt: v => d3.format(",.0f")(v),    colorPalette: ["#bde0a8","#38a830","#1a5a10"] },
    "Production":     { label: "Total Production (t)",      fmt: v => d3.format(".3s")(v),     colorPalette: ["#a8d4f0","#1a7abf","#093a6b"] },
    "Area harvested": { label: "Area Harvested (ha)",       fmt: v => d3.format(".3s")(v),     colorPalette: ["#f0d890","#d49820","#7a5000"] },
  };

  function init() {
    const container = document.getElementById("barPanel");
    width  = container.clientWidth - 32;
    height = 300;
    margin = { top: 10, right: 90, bottom: 38, left: 115 };

    svg = d3.select("#barSvg")
      .attr("width",  width)
      .attr("height", height);

    svg.append("g").attr("class","axis x-axis-bar").attr("transform",`translate(0,${height-margin.bottom})`);
    svg.append("g").attr("class","axis y-axis-bar").attr("transform",`translate(${margin.left},0)`);
    svg.append("text").attr("class","bar-x-lbl")
      .attr("x",(margin.left + width - margin.right)/2)
      .attr("y",height - 4)
      .attr("text-anchor","middle").attr("fill","#4a6080").attr("font-size","10px");

    bindBarControls();
  }
  // Bind the metric, rank direction, and top-N controls inside the bar panel.
  function bindBarControls() {
    // A manual bar-metric choice stops the global metric dropdown from overriding it.
    document.getElementById("barMetricSel").addEventListener("change", function() {
      local.barMetric    = this.value;
      local.userOverride = true;
      update();
    });

    document.querySelectorAll(".rank-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        local.barRank = this.dataset.rank;
        document.querySelectorAll(".rank-btn").forEach(b => {
          const isActive = b.dataset.rank === local.barRank;
          b.style.background = isActive ? "#1a3a6b" : "#f5f7fa";
          b.style.color       = isActive ? "#fff"    : "#4a6080";
          b.style.fontWeight  = isActive ? "700"     : "400";
        });
        update();
      });
    });

    document.getElementById("barNSel").addEventListener("change", function() {
      local.barN = +this.value;
      update();
    });
  }

  function buildBarData() {
    const rows = [];
    Data.countries.forEach(country => {
      const stat = getCountryStat(country, State.year, State.window, State.selectedCrops);
      if (!stat) return;

      // Pick the value for the selected bar metric.
      let value;
      if      (local.barMetric === "temp")             value = stat.avgTemp;
      else if (local.barMetric === "Yield")            value = stat.avgYield;
      else if (local.barMetric === "Production")       value = stat.totalProd;
      else if (local.barMetric === "Area harvested")   value = stat.totalArea;

      if (value == null) return;
      rows.push({ country, value, temp: stat.avgTemp });
    });

    // Sort and trim to the requested number of countries.
    rows.sort((a, b) => local.barRank === "top" ? b.value - a.value : a.value - b.value);
    return rows.slice(0, local.barN);
  }

  // Rebuild the ranking and redraw bars for the selected metric.
  function update() {
    const data = buildBarData();
    if (!data.length) return;

    const meta   = METRIC_META[local.barMetric] || METRIC_META["temp"];
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    // Bottom rankings can include very small values, so start near the minimum.
    const xMax = d3.max(data, d => d.value);
    const xMin = local.barRank === "bottom" ? d3.min(data, d => d.value) * 0.92 : 0;
    const xScale = d3.scaleLinear()
      .domain([xMin, xMax * 1.08])
      .range([0, innerW]);

    const yScale = d3.scaleBand()
      .domain(data.map(d => d.country))
      .range([margin.top, margin.top + innerH])
      .padding(0.22);

    // Color intensity follows the selected ranking value.
    const cScale = d3.scaleSequential()
      .domain([d3.min(data, d => d.value), xMax])
      .interpolator(d3.interpolateRgbBasis(meta.colorPalette));

    // Axes and labels.
    const xFmt = local.barMetric === "temp"
      ? v => v.toFixed(1)+"°"
      : d3.format(".2s");
    svg.select(".x-axis-bar").transition().duration(400)
      .call(d3.axisBottom(xScale).ticks(5).tickFormat(xFmt));
    svg.select(".y-axis-bar").transition().duration(400)
      .call(d3.axisLeft(yScale).tickSize(0))
      .selectAll("text").attr("fill","#1a2a3a").attr("font-size","10px");
    svg.select(".y-axis-bar .domain").remove();

    // X-axis label
    const rankDir = local.barRank === "top" ? `▲ Top ${local.barN}` : `▼ Bottom ${local.barN}`;
    svg.select(".bar-x-lbl").text(`${rankDir} countries — ${meta.label}`);

    // Match the panel title to the active ranking and crop filter.
    const cropStr = State.selectedCrops.size === 0 ? "All Crops"
      : State.selectedCrops.size === 1 ? [...State.selectedCrops][0]
      : `${State.selectedCrops.size} Crops`;
    document.getElementById("barPanelTitle").textContent =
      `Country Rankings — ${meta.label} · ${cropStr} · ${State.year}`;

    const barSel = svg.selectAll(".bar-rect").data(data, d => d.country);
    barSel.join(
      enter => enter.append("rect")
        .attr("class","bar-rect")
        .attr("x", margin.left + xScale(xMin))
        .attr("y", d => yScale(d.country))
        .attr("width", 0)
        .attr("height", yScale.bandwidth())
        .attr("fill", d => cScale(d.value))
        .attr("rx", 3)
        .on("click", (evt, d) => {
          setSelectedCountry(d.country);
          updateAll();
        })
        .on("mousemove", (evt, d) => {
          const tempStr = d.temp != null ? d.temp.toFixed(3)+"°C" : "—";
          tt.show(evt, `
            <div class="tt-title">${d.country}</div>
            <div class="tt-row"><span class="tt-key">${meta.label}</span><span class="tt-val">${meta.fmt(d.value)}</span></div>
            <div class="tt-row"><span class="tt-key">Temp Anomaly</span><span class="tt-val">${tempStr}</span></div>
          `);
        })
        .on("mouseleave", () => tt.hide())
        .transition().duration(500)
        .attr("width", d => Math.max(0, xScale(d.value) - xScale(xMin))),
      upd => upd.transition().duration(500)
        .attr("y", d => yScale(d.country))
        .attr("height", yScale.bandwidth())
        .attr("x", margin.left + xScale(xMin))
        .attr("width", d => Math.max(0, xScale(d.value) - xScale(xMin)))
        .attr("fill", d => cScale(d.value)),
      exit => exit.transition().duration(300).attr("width",0).remove()
    );

    // Numeric value labels at the end of each bar.
    const lblSel = svg.selectAll(".bar-val-lbl").data(data, d => d.country);
    lblSel.join(
      enter => enter.append("text")
        .attr("class","bar-val-lbl")
        .attr("x", d => margin.left + xScale(d.value) + 4)
        .attr("y", d => yScale(d.country) + yScale.bandwidth()/2 + 4)
        .attr("fill","#4a6080").attr("font-size","9px")
        .text(d => meta.fmt(d.value))
        .attr("opacity",0)
        .transition().duration(500).attr("opacity",1),
      upd => upd.transition().duration(500)
        .attr("x", d => margin.left + xScale(d.value) + 4)
        .attr("y", d => yScale(d.country) + yScale.bandwidth()/2 + 4)
        .text(d => meta.fmt(d.value)),
      exit => exit.remove()
    );

    // Highlight the selected country if another chart selected one.
    svg.selectAll(".bar-rect")
      .attr("stroke", d => State.selectedCountries.size && State.selectedCountries.has(d.country) ? "#c02020" : "none")
      .attr("stroke-width", 2);
  }

  // Let the global metric dropdown sync this chart until the user overrides it.
  function setMetric(metric) {
    if (!local.userOverride) {
      local.barMetric = metric;
      const sel = document.getElementById("barMetricSel");
      if (sel) sel.value = metric;
      update();
    }
  }

    return { init, update, setMetric };
})();

// Chart: country-by-crop correlation heat map.
const HeatmapChart = (() => {
  let svg, width, height, margin;
  let xScale, yScale, colorScale;
  const MAX_COUNTRIES = 24;

  // Create fixed SVG layers for axes and heat map cells.
  function init() {
    const container = document.getElementById("heatPanel");
    width  = container.clientWidth - 32;
    height = 300;
    margin = { top: 10, right: 20, bottom: 35, left: 140 };

    svg = d3.select("#heatSvg")
      .attr("width",  width)
      .attr("height", height);

    svg.append("g").attr("class","axis x-axis-heat").attr("transform",`translate(0,${height-margin.bottom})`);
    svg.append("g").attr("class","axis y-axis-heat").attr("transform",`translate(${margin.left},0)`);

    svg.append("g").attr("class","heat-cells");

  }

  // Build one correlation value for each visible country/crop pair.
  function buildHeatData() {
    const metric = State.metric;
    const countries = State.selectedCountries.size
      ? [...State.selectedCountries]
      : Data.countries.slice(0, MAX_COUNTRIES);
    const crops = getSelectedCropNames();

    const rows = [];
    countries.forEach(country => {
      const cMap = Data.byCountryYearCrop.get(country);
      if (!cMap) return;

      crops.forEach(crop => {
        const tempVals = [];
        const metricVals = [];
        const yearsSeen = new Set();

        cMap.forEach((cropMap, year) => {
          const recs = cropMap.get(crop);
          if (!recs) return;
          const tVals = recs.map(r => r.tempChange).filter(v => v != null);
          const aVals = recs.filter(r => r.element === metric).map(r => r.agriValue);
          if (!tVals.length || !aVals.length) return;
          yearsSeen.add(+year);
          tempVals.push(d3.mean(tVals));
          metricVals.push(metric === "Production" || metric === "Area harvested" ? d3.sum(aVals) : d3.mean(aVals));
        });

        // Require enough years so sparse country/crop pairs do not look precise.
        const corr = yearsSeen.size >= 10 ? pearsonCorr(tempVals, metricVals) : null;
        rows.push({ country, crop, corr });
      });
    });

    return { rows, countries, crops };
  }

  // Redraw axes and cells using the current filters and selected metric.
  function update() {
    const { rows, countries, crops } = buildHeatData();
    if (!rows.length) return;

    xScale = d3.scaleBand()
      .domain(crops)
      .range([margin.left, width - margin.right])
      .padding(0.05);

    yScale = d3.scaleBand()
      .domain(countries)
      .range([margin.top, height - margin.bottom])
      .padding(0.05);

    colorScale = d3.scaleDiverging([-1, 0, 1], d3.interpolateRdBu);


    svg.select(".x-axis-heat").transition().duration(400)
      .call(d3.axisBottom(xScale).tickSize(3));
    svg.select(".y-axis-heat").transition().duration(400)
      .call(d3.axisLeft(yScale).tickSize(0))
      .selectAll("text")
        .attr("fill", d => State.selectedCountries.size && State.selectedCountries.has(d) ? "#c02020" : "#5a7490")
        .attr("font-size", "9.5px")
        .attr("font-weight", d => State.selectedCountries.size && State.selectedCountries.has(d) ? "700" : "400");
    svg.select(".y-axis-heat .domain").remove();

    // Use country + crop as a unique ID for each heat map cell.
    const cellSel = svg.select(".heat-cells").selectAll(".heat-cell").data(rows, d => d.country + "|" + d.crop);
    cellSel.join(
      enter => enter.append("rect")
        .attr("class","heat-cell")
        .attr("x", d => xScale(d.crop))
        .attr("y", d => yScale(d.country))
        .attr("width",  xScale.bandwidth())
        .attr("height", yScale.bandwidth())
        .attr("fill", d => d.corr != null ? colorScale(d.corr) : "#e6eef7")
        .attr("opacity",0)
        .on("mousemove", onCellMouseMove)
        .on("mouseleave", () => tt.hide())
        .on("click", onCellClick)
        .transition().duration(400).attr("opacity", 1),
      update => update.transition().duration(400)
        .attr("x", d => xScale(d.crop))
        .attr("y", d => yScale(d.country))
        .attr("width",  xScale.bandwidth())
        .attr("height", yScale.bandwidth())
        .attr("fill", d => d.corr != null ? colorScale(d.corr) : "#e6eef7")
        .attr("stroke", d => State.selectedCountries.size && State.selectedCountries.has(d.country) ? "#1a3a6b" : "var(--bg)")
        .attr("stroke-width", d => State.selectedCountries.size && State.selectedCountries.has(d.country) ? 0.8 : 0.3),
      exit => exit.transition().duration(200).attr("opacity",0).remove()
    );
  }

  // Cell hover explains the exact correlation value.
  function onCellMouseMove(evt, d) {
    tt.show(evt, `
      <div class="tt-title">${d.country} — ${d.crop}</div>
      <div class="tt-row"><span class="tt-key">Correlation</span><span class="tt-val">${d.corr != null ? d.corr.toFixed(3) : "—"}</span></div>
    `);
    tt.move(evt);
  }

  // Clicking a cell filters the rest of the dashboard to that country/crop.
  function onCellClick(evt, d) {
    setSelectedCountry(d.country);
    setSelectedCrop(d.crop);
    updateAll();
  }

  return { init, update };
})();

// 7. Startup flow

// Load data, create controls/charts, and trigger the first render.
async function main() {
  try {
    // Load the data first, because controls and charts depend on Data.
    await loadData();
    computeRiskRows();

    const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");

    // Build the filters and connect their event listeners.
    updateStatBadges();
    initCountryList();
    initCropList();
    bindDropdownToggles();
    bindFilterControls();

    // Create chart SVG layers before calling updateAll().
    TempChart.init();
    CropTrendChart.init();
    RiskMapChart.init(world);
    BarChart.init();
    HeatmapChart.init();

    // Sync text labels, then draw the initial dashboard.
    updateSelectionInfo();
    TempChart.update();
    CropTrendChart.update();
    const testCountry = Data.countries[0];
    const testYear = 2010;
    const yearData = Data.byCountryYear.get(testCountry)?.get(testYear);
    updateAll();
    bindControls();
    console.log(`Test Result for ${testCountry} in ${testYear}:`, yearData);
  } catch (error) {
    console.error("Data loading failed: Check if the CSV filename is correct:", error);
  }
}

main();
