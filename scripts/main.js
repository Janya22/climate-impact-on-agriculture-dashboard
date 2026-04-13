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
  riskRangeStart: null,
  riskRangeEnd: null,
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
  startYear: 1961,
  year: 2010,
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
    tempChange: d.Temp_Change === "" ? null : +d.Temp_Change,
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

function shortLabel(value, maxLength = 18) {
  const label = String(value);
  return label.length > maxLength ? `${label.slice(0, maxLength - 3)}...` : label;
}

// Use the selected start and end years as the visible range for line charts.
function getSelectedYearRange() {
  const minYear = Data.years[0];
  const maxYear = Data.years[Data.years.length - 1];
  return [
    Math.max(minYear, Math.min(State.startYear, State.year)),
    Math.min(maxYear, Math.max(State.startYear, State.year))
  ];
}

function updateStoryCard() {
  const cardEl = document.getElementById("dynamic-story-text");
  if (!cardEl) return; // Failsafe if the HTML element isn't added yet

  let activeStory = "Use the slider to explore the historical context of global agriculture.";
  let activeYear = null;

  // STRICT MATCH: Only display the story if the slider is exactly on the year the event occurred
  if (STORY_CARDS[State.year]) {
    activeStory = STORY_CARDS[State.year];
    activeYear = State.year;
  }

  // Update the HTML inside the card with the new heading format
  cardEl.innerHTML = activeYear
    ? `<strong style="color: #2255aa; font-size: 15px;">Major event of '${activeYear}':</strong> ${activeStory}`
    : activeStory;
}

// Central redraw path after any filter or chart interaction changes State.
function updateAll() {
  const [rangeStart, rangeEnd] = getSelectedYearRange();
  if (Data.riskRangeStart !== rangeStart || Data.riskRangeEnd !== rangeEnd) {
    computeRiskRows(rangeStart, rangeEnd);
  }
  TempChart.update();
  CropTrendChart.update();
  RiskMapChart.update();
  BarChart.update();
  HeatmapChart.update();
  updateStoryCard();
  const startYearInput = document.getElementById("startYearInput");
  const startYearSlider = document.getElementById("startYearSlider");
  const yearInput = document.getElementById("yearInput");
  const yearSlider = document.getElementById("yearSlider");
  if (startYearInput) startYearInput.value = State.startYear;
  if (startYearSlider) startYearSlider.value = State.startYear;
  if (yearInput) yearInput.value = State.year;
  if (yearSlider) yearSlider.value = State.year;
  updateYearRangeFill();
}

function updateYearRangeFill() {
  const fill = document.getElementById("yearRangeFill");
  if (!fill || !Data.years.length) return;

  const minYear = Data.years[0];
  const maxYear = Data.years[Data.years.length - 1];
  const span = maxYear - minYear || 1;
  const left = ((State.startYear - minYear) / span) * 100;
  const right = ((State.year - minYear) / span) * 100;

  fill.style.left = `${Math.min(left, right)}%`;
  fill.style.width = `${Math.abs(right - left)}%`;
}

// Connect top-level controls to State and redraw the dashboard on change.
function bindFilterControls() {
  const yearSlider = document.getElementById("yearSlider");
  const startYearSlider = document.getElementById("startYearSlider");
  const startYearInput = document.getElementById("startYearInput");
  const yearInput = document.getElementById("yearInput");
  const resetBtn = document.getElementById("resetBtn");

  function normalizeYear(value) {
    const minYear = Data.years[0];
    const maxYear = Data.years[Data.years.length - 1];
    const nextYear = Math.round(+value);
    return Number.isFinite(nextYear) ? Math.max(minYear, Math.min(maxYear, nextYear)) : null;
  }

  function setStartYear(value) {
    const nextYear = normalizeYear(value);
    if (nextYear == null) return updateAll();
    State.startYear = nextYear;
    if (State.startYear > State.year) State.year = State.startYear;
    updateAll();
  }

  function setYear(value) {
    const nextYear = normalizeYear(value);
    if (nextYear == null) return updateAll();
    State.year = nextYear;
    if (State.year < State.startYear) State.startYear = State.year;
    updateAll();
  }

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
    yearSlider.min = Data.years[0];
    yearSlider.max = Data.years[Data.years.length - 1];
    yearSlider.addEventListener("input", function() {
      setYear(this.value);
    });
  }

  if (startYearSlider) {
    startYearSlider.min = Data.years[0];
    startYearSlider.max = Data.years[Data.years.length - 1];
    startYearSlider.value = State.startYear;
    startYearSlider.addEventListener("input", function() {
      setStartYear(this.value);
    });
  }

  if (startYearInput) {
    startYearInput.min = Data.years[0];
    startYearInput.max = Data.years[Data.years.length - 1];
    State.startYear = +startYearInput.value;
    startYearInput.addEventListener("change", function() {
      setStartYear(this.value);
    });
    startYearInput.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        setStartYear(this.value);
        this.blur();
      }
    });
  }

  if (yearInput) {
    yearInput.min = Data.years[0];
    yearInput.max = Data.years[Data.years.length - 1];
    yearInput.value = State.year;
    yearInput.addEventListener("change", function() {
      setYear(this.value);
    });
    yearInput.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        setYear(this.value);
        this.blur();
      }
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
  if (!vals.length) {
    rows.forEach(r => { r[outputKey] = 0; });
    return;
  }
  const min = d3.min(vals);
  const max = d3.max(vals);
  const span = (max - min) || 1;
  rows.forEach(r => {
    r[outputKey] = r[inputKey] == null ? 0 : (r[inputKey] - min) / span;
  });
}

const RISK_WEIGHTS = {
  sensitivity: 0.30,
  warming: 0.25,
  variability: 0.20,
  exposure: 0.15,
  yieldDecline: 0.10,
};

// Precompute risk values for each country/crop pair before drawing the map.
function computeRiskRows(rangeStart = Data.years[0], rangeEnd = Data.years[Data.years.length - 1]) {
  const results = [];

  Data.countries.forEach(country => {
    const byYear = Data.byCountryYearCrop.get(country);
    if (!byYear) return;

    Data.crops.forEach(crop => {
      const years = [];
      const yieldVals = [];
      const tempVals = [];
      const areaVals = [];
      const productionVals = [];

      byYear.forEach((cropMap, year) => {
        if (+year < rangeStart || +year > rangeEnd) return;
        const recs = cropMap.get(crop);
        if (!recs) return;
        const ys = recs.filter(r => r.element === "Yield").map(r => r.agriValue);
        const ts = recs.map(r => r.tempChange).filter(v => v != null);
        const areas = recs.filter(r => r.element === "Area harvested").map(r => r.agriValue);
        const prods = recs.filter(r => r.element === "Production").map(r => r.agriValue);
        if (!ys.length || !ts.length) return;
        years.push(+year);
        yieldVals.push(d3.mean(ys));
        tempVals.push(d3.mean(ts));
        areaVals.push(areas.length ? d3.sum(areas) : null);
        productionVals.push(prods.length ? d3.sum(prods) : null);
      });

      if (new Set(years).size < 10) return;

      // Indicator-based risk: hazard, exposure, and vulnerability/sensitivity signals.
      const corr = pearsonCorr(yieldVals, tempVals);
      const negCorr = corr != null && corr < 0 ? Math.abs(corr) : 0;
      const tempSlope = linearSlope(years, tempVals);
      const tempWarming = tempSlope != null && tempSlope > 0 ? tempSlope : 0;
      const meanYield = d3.mean(yieldVals);
      const yieldSlope = linearSlope(years, yieldVals);
      const yieldTrend = meanYield ? yieldSlope / meanYield : null;
      const yieldDecline = yieldTrend != null && yieldTrend < 0 ? Math.abs(yieldTrend) : 0;
      const variability = meanYield ? (stdDev(yieldVals) / meanYield) : null;
      const areaExposure = d3.mean(areaVals.filter(v => v != null));
      const productionExposure = d3.mean(productionVals.filter(v => v != null));
      const cropExposure = areaExposure || productionExposure || null;

      results.push({
        country,
        crop,
        correlation: corr,
        negCorr,
        tempSlope,
        tempWarming,
        yieldSlope,
        yieldTrend,
        yieldDecline,
        yieldVariability: variability,
        cropExposure,
        exposureSource: areaExposure ? "Area harvested" : productionExposure ? "Production" : null,
      });
    });
  });

  normalizeRows(results, "negCorr", "normSensitivity");
  normalizeRows(results, "tempWarming", "normWarming");
  normalizeRows(results, "yieldVariability", "normVariability");
  normalizeRows(results, "cropExposure", "normExposure");
  normalizeRows(results, "yieldDecline", "normYieldDecline");

  results.forEach(r => {
    r.riskScore =
      (RISK_WEIGHTS.sensitivity * r.normSensitivity) +
      (RISK_WEIGHTS.warming * r.normWarming) +
      (RISK_WEIGHTS.variability * r.normVariability) +
      (RISK_WEIGHTS.exposure * r.normExposure) +
      (RISK_WEIGHTS.yieldDecline * r.normYieldDecline);
    r.riskCategory = r.riskScore < 0.25 ? "Low Risk"
      : r.riskScore < 0.5 ? "Moderate Risk"
      : r.riskScore < 0.75 ? "High Risk"
      : "Severe Risk";
  });

  Data.riskRows = results;
  Data.riskRangeStart = rangeStart;
  Data.riskRangeEnd = rangeEnd;
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
  "ATG":"28","BHS":"44","BHR":"48","BRB":"52","BRN":"96","COK":"184",
  "DMA":"212","FRO":"234","GUF":"254","PYF":"258","GRD":"308","GLP":"312",
  "MTQ":"474","NCL":"540","NIU":"570","PRI":"630","QAT":"634","KNA":"659",
  "LCA":"662","VCT":"670","WSM":"882","SGP":"702","SLB":"90","TON":"776",
  "ARE":"784","VUT":"548",
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
  const id = +numId;
  for (const [iso3, num] of Object.entries(ISO3_TO_NUM)) {
    if (+num !== id) continue;
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
    svg.append("g").attr("class", "event-bands");
    svg.append("g").attr("class", "temp-lines");
    console.log("TempChart initialized with width:", width, "height:", height);
  }

  // Draw one temperature trend line per selected country.
  function update() {
    const [rangeStart, rangeEnd] = getSelectedYearRange();
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

      return { country, vals: vals.filter(d => d.year >= rangeStart && d.year <= rangeEnd) };
    }).filter(s => s.vals.length > 0);

    console.log("TempChart update - series count:", series.length, "data points sample:", series.slice(0, 3));
    if (!series.length) {
      console.warn("No valid data series for TempChart");
      return;
    }

    const allPoints = series.flatMap(s => s.vals);
    const xDomain = rangeStart === rangeEnd ? [rangeStart - 1, rangeEnd + 1] : [rangeStart, rangeEnd];
    const x = d3.scaleLinear().domain(xDomain).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain(d3.extent(allPoints, d => d.temp)).nice().range([height - margin.bottom, margin.top]);

    const activeEvents = HISTORICAL_EVENTS.filter(e => {
      // Temp chart only cares about the country, NOT the crops
      const inRange = e.start <= rangeEnd && e.end >= rangeStart;
      return inRange && (!e.country || (State.selectedCountries.size > 0 && State.selectedCountries.has(e.country)));
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

    const tickCount = rangeStart === rangeEnd ? 3 : Math.min(8, Math.max(2, rangeEnd - rangeStart + 1));
    svg.select(".x-axis-temp").call(d3.axisBottom(x).ticks(tickCount).tickFormat(d3.format("d")));
    svg.select(".y-axis-temp").call(d3.axisLeft(y).ticks(6));

    const line = d3.line().x(d => x(d.year)).y(d => y(d.temp)).curve(d3.curveMonotoneX);

    svg.select(".temp-lines").selectAll(".temp-line").data(series.filter(s => s.vals.length > 1), d => d.country).join(
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
    const [rangeStart, rangeEnd] = getSelectedYearRange();
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
    const visibleYears = rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`;
    if (titleEl) titleEl.textContent = `Crop ${METRIC_LABEL[metric] || metric} Trend (${visibleYears})`;
    svg.select(".y-label-trend").text(unit);

    // Keep only rows needed for the current metric/crop/country filters.
    const rows = Data.raw.filter(d =>
      d.element === metric &&
      d.year >= rangeStart &&
      d.year <= rangeEnd &&
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
    })).filter(s => s.vals.length > 0);

    if (!grouped.length) {
      svg.select(".trend-lines").selectAll(".crop-line").remove();
      svg.select(".event-bands").selectAll(".event-band").remove();
      return;
    }

    const allPoints = grouped.flatMap(s => s.vals);
    const xDomain = rangeStart === rangeEnd ? [rangeStart - 1, rangeEnd + 1] : [rangeStart, rangeEnd];
    const x = d3.scaleLinear().domain(xDomain).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, d3.max(allPoints, d => d.val) * 1.05]).nice().range([height - margin.bottom, margin.top]);

    const tickCount = rangeStart === rangeEnd ? 3 : Math.min(8, Math.max(2, rangeEnd - rangeStart + 1));
    svg.select(".x-axis-trend").call(d3.axisBottom(x).ticks(tickCount).tickFormat(d3.format("d")));
    svg.select(".y-axis-trend").call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(",.0f")));
    
    // If the event has a country, it must match the selected countries. If it has crops, at least one must match the current crops on the chart. If it has neither, it's always active.
    const activeEvents = HISTORICAL_EVENTS.filter(e => {
      const inRange = e.start <= rangeEnd && e.end >= rangeStart;
      const countryMatch = !e.country || (State.selectedCountries.size > 0 && State.selectedCountries.has(e.country));
      let cropMatch = true; 
      if (e.crops && e.crops.length > 0) {
        cropMatch = e.crops.some(c => activeCrops.has(c)); 
      }

      return inRange && countryMatch && cropMatch; 
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

    function applyBandPosition(selection, xScale) {
      selection
        .attr("x", d => d.start === d.end ? xScale(d.start) - 6 : xScale(d.start))
        .attr("width", d => d.start === d.end ? 12 : Math.max(xScale(d.end) - xScale(d.start), 2));
    }

    const line = d3.line().x(d => x(d.year)).y(d => y(d.val)).curve(d3.curveMonotoneX);

    svg.select(".trend-lines").selectAll(".crop-line").data(grouped.filter(s => s.vals.length > 1), d => d.crop).join(
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
        .attr("stroke-width", 2)
        .attr("d", d => line(d.vals)),
      exit => exit.remove()
    );
  }

  return { init, update };
})();

// Chart: Risk score choropleth map.
const RiskMapChart = (() => {
  let svg, g, legendG, path, projection, width, height, mapHeight, features, color, zoom;

  // Set up the map projection, country paths, click/hover, and zoom.
  function init(world) {
    const container = document.getElementById("linePanel");
    width = container.clientWidth - 32;
    mapHeight = 280;
    height = 330;

    svg = d3.select("#riskMapSvg").attr("width", width).attr("height", height);
    projection = d3.geoNaturalEarth1().scale(width / 7.5).translate([width / 2, mapHeight / 2 + 8]);
    path = d3.geoPath(projection);
    features = topojson.feature(world, world.objects.countries).features;
    color = d3.scaleLinear()
      .domain([0, 0.25, 0.5, 0.75, 1])
      .range(["#d9f0e4", "#7fcdbb", "#f1d65b", "#e76f51", "#8f1d3d"])
      .clamp(true);

    const defs = svg.append("defs");
    const noDataPattern = defs.append("pattern")
      .attr("id", "riskNoDataPattern")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 6)
      .attr("height", 6);

    noDataPattern.append("rect")
      .attr("width", 6)
      .attr("height", 6)
      .attr("fill", "#eef1f4");

    noDataPattern.append("path")
      .attr("d", "M0,6 L6,0")
      .attr("stroke", "#aeb8c5")
      .attr("stroke-width", 1);

    const legendGradient = defs.append("linearGradient")
      .attr("id", "riskLegendGradient")
      .attr("x1", "0%")
      .attr("x2", "100%")
      .attr("y1", "0%")
      .attr("y2", "0%");

    color.domain().forEach(value => {
      legendGradient.append("stop")
        .attr("offset", `${value * 100}%`)
        .attr("stop-color", color(value));
    });

    g = svg.append("g");
    g.selectAll("path")
      .data(features)
      .join("path")
      .attr("class", "country-path")
      .attr("d", path)
      .on("mousemove", onMove)
      .on("mouseleave", () => tt.hide())
      .on("click", onClick);

    drawLegend();
  
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

  function drawLegend() {
    const legendWidth = Math.min(340, width * 0.52);
    const legendHeight = 8;
    const legendX = 14;
    const legendY = mapHeight + 22;
    const thresholds = [
      { label: "Low", x: 0 },
      { label: "Moderate", x: 0.25 },
      { label: "High", x: 0.5 },
      { label: "Severe", x: 0.75 },
      { label: "1.0", x: 1 },
    ];

    legendG = svg.append("g")
      .attr("class", "risk-legend")
      .attr("transform", `translate(${legendX}, ${legendY})`);

    legendG.append("text")
      .attr("class", "risk-legend-title")
      .attr("x", 0)
      .attr("y", -8)
      .text("Risk score");

    legendG.append("rect")
      .attr("class", "risk-legend-bar")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("rx", 3)
      .attr("ry", 3)
      .attr("fill", "url(#riskLegendGradient)");

    legendG.selectAll(".risk-legend-tick")
      .data(thresholds)
      .join("g")
      .attr("class", "risk-legend-tick")
      .attr("transform", d => `translate(${d.x * legendWidth}, 0)`)
      .call(tick => {
        tick.append("line")
          .attr("y2", legendHeight + 5);
        tick.append("text")
          .attr("y", legendHeight + 17)
          .attr("text-anchor", d => d.x === 0 ? "start" : d.x === 1 ? "end" : "middle")
          .text(d => d.label);
      });

    const noDataX = legendX + legendWidth + 30;
    const noData = svg.append("g")
      .attr("class", "risk-legend no-data-legend")
      .attr("transform", `translate(${noDataX}, ${legendY - 1})`);

    noData.append("rect")
      .attr("width", 18)
      .attr("height", 10)
      .attr("fill", "#eef1f4");

    noData.append("rect")
      .attr("width", 18)
      .attr("height", 10)
      .attr("fill", "url(#riskNoDataPattern)");

    noData.append("text")
      .attr("x", 25)
      .attr("y", 9)
      .text("No data");
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
    const [rangeStart, rangeEnd] = getSelectedYearRange();
    const title = document.getElementById("riskMapTitle");
    if (title) title.textContent = `Yield-Based Climate Risk Map - ${rangeStart}-${rangeEnd}`;

    const byCountry = riskByCountry();

    g.selectAll(".country-path")
      .attr("fill", d => {
        const country = countryFromTopoId(d.id);
        const row = country ? byCountry.get(country) : null;
        return row ? color(row.riskScore) : "url(#riskNoDataPattern)";
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
      <div class="tt-row"><span class="tt-key">Temp Sensitivity</span><span class="tt-val">${r.normSensitivity.toFixed(2)}</span></div>
      <div class="tt-row"><span class="tt-key">Warming Trend</span><span class="tt-val">${r.normWarming.toFixed(2)}</span></div>
      <div class="tt-row"><span class="tt-key">Yield Variability Score</span><span class="tt-val">${r.normVariability.toFixed(2)}</span></div>
      <div class="tt-row"><span class="tt-key">Exposure</span><span class="tt-val">${r.normExposure.toFixed(2)}</span></div>
      <div class="tt-row"><span class="tt-key">Yield Decline</span><span class="tt-val">${r.normYieldDecline.toFixed(2)}</span></div>
      <div class="tt-row"><span class="tt-key">Correlation</span><span class="tt-val">${r.correlation == null ? "—" : r.correlation.toFixed(3)}</span></div>
      <div class="tt-row"><span class="tt-key">Temp Slope</span><span class="tt-val">${r.tempSlope == null ? "—" : r.tempSlope.toFixed(5)}</span></div>
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
      const stat = getCountryStat(country, State.year, 1, State.selectedCrops);
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
      .call(d3.axisLeft(yScale).tickSize(0).tickFormat(d => shortLabel(d, 18)))
      .selectAll("text")
        .attr("fill","#1a2a3a")
        .attr("font-size","10px")
        .each(function(d) {
          d3.select(this).selectAll("title").data([d]).join("title").text(d);
        });
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
    const [rangeStart, rangeEnd] = getSelectedYearRange();
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
          if (+year < rangeStart || +year > rangeEnd) return;
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
    const [rangeStart, rangeEnd] = getSelectedYearRange();
    const title = document.querySelector("#heatPanel .section-title");
    if (title) title.textContent = `Climate Sensitivity Matrix (Country x Crop Correlation) - ${rangeStart}-${rangeEnd}`;

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
      .call(d3.axisBottom(xScale).tickSize(3).tickFormat(d => shortLabel(d, 16)))
      .selectAll("text")
        .each(function(d) {
          d3.select(this).selectAll("title").data([d]).join("title").text(d);
        });
    svg.select(".y-axis-heat").transition().duration(400)
      .call(d3.axisLeft(yScale).tickSize(0).tickFormat(d => shortLabel(d, 20)))
      .selectAll("text")
        .attr("fill", d => State.selectedCountries.size && State.selectedCountries.has(d) ? "#c02020" : "#5a7490")
        .attr("font-size", "9.5px")
        .attr("font-weight", d => State.selectedCountries.size && State.selectedCountries.has(d) ? "700" : "400")
        .each(function(d) {
          d3.select(this).selectAll("title").data([d]).join("title").text(d);
        });
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

    const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json");

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
