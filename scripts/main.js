console.log("!!! SCRIPT IS ALIVE !!!");
const Data = {
  raw: [],
  countries: [],
  crops: [],
  years: [],
  iso3Map: new Map(),
  byCountryYearCrop: null,
  byCountryYear: null
};

const State = {
  selectedCountries: new Set(), // set to prevent duplicates 
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

  // Unique sorted collections
  Data.countries = [...new Set(raw.map(d => d.country))].sort();
  Data.crops      = [...new Set(raw.map(d => d.crop))].sort();
  Data.years      = [...new Set(raw.map(d => d.year))].sort((a, b) => a - b);

  // Build iso3Map: country name → iso3
  raw.forEach(d => { if (!Data.iso3Map.has(d.country)) Data.iso3Map.set(d.country, d.iso3); });

  /*
   * Build byCountryYearCrop:
   *  Map<countryName → Map<year → Map<cropName → { yield, prod, area, temp }>>>
   */
  Data.byCountryYearCrop = d3.group(raw, d => d.country, d => d.year, d => d.crop);

  /*
   * Build byCountryYear:
   *  Map<countryName → Map<year → { avgTemp, yield, production, area }>>
   * Aggregated across all crops (mean for temp, sum for production/area, mean for yield).
   */
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

//gets the data for number of countires, crops, time span to be mentioned in the badges at header
function updateStatBadges() {
  document.getElementById("stat-countries").textContent = Data.countries.length;
  document.getElementById("stat-crops").textContent = Data.crops.length;
  if (Data.years && Data.years.length > 0) {
    const startYear = Data.years[0];
    const endYear = Data.years[Data.years.length - 1];
    document.getElementById("stat-years").textContent = `${startYear}–${endYear}`;
  }
}

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
//generates list of countries in the dropdown 
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
//   d3.select("#countrySel-dropdown").style("display", "block");
}
//sets up the click event listener to show or hide the country and crop selection dropdown
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
//handles the logic of updating the state when a country is selected or deselected, and also updates the badge and placeholder text accordingly
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
//generates list of crops in the dropdown and sets up the click event listener to select / deselect crops
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
//handles the logic of updating the state when a crop is selected or deselected and updating the placeholder
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
  //returns the tooltip element and creates it if it does not exist
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
  //shows tooltip content near the pointer
  show(evt, html) {
    this.getEl().innerHTML = html;
    this.getEl().classList.add("visible");
    this.move(evt);
  },
  //changes tooltip position so it stays visible 
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

//sets one selected country or clears selection when all is passed
function setSelectedCountry(countryName) {
  if (!countryName || countryName === "ALL") {
    State.selectedCountries.clear();
  } else {
    State.selectedCountries = new Set([countryName]);
  }

  updateSelectionInfo();
}

function setSelectedCrop(cropName) {
  if (!cropName || cropName === "ALL") {
    State.selectedCrops.clear();
  } else {
    State.selectedCrops = new Set([cropName]);
  }
  syncSelectionState();
}

function getSelectedCropNames() {
  return State.selectedCrops.size ? [...State.selectedCrops] : [...Data.crops];
}

//updates charts when state is changed
function updateAll() {
  TempChart.update();
  CropTrendChart.update();
  RiskMapChart.update();
  document.getElementById("yearLabel").textContent = State.year;
  document.getElementById("yearSlider").value = State.year;
}

function bindFilterControls() {
  const yearSlider = document.getElementById("yearSlider");
  const yearLabel = document.getElementById("yearLabel");
  const windowSel = document.getElementById("windowSel");
  const resetBtn = document.getElementById("resetBtn");

  const metricSel = document.getElementById("metricSel");
  if (metricSel) {
    metricSel.addEventListener("change", function() {
      State.metric = this.value;
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

const TempChart = (() => {
  let svg, width, height, margin;

  //initialises SVG, dimensions and chart groups for temp chhart
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
    console.log("TempChart initialized with width:", width, "height:", height);
  }

  //renders and updates temperature lines, axes and interactions
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
// Helper functions for Chart 2 

// Chart 2 - Crop Trend Lines 
const CropTrendChart = (() => {
  let svg, width, height, margin;

  function init() {
    const container = document.getElementById("scatterPanel");
    width = container.clientWidth - 32;
    height = 300;
    margin = { top: 20, right: 20, bottom: 40, left: 60 };

    svg = d3.select("#trendSvg").attr("width", width).attr("height", height);
    svg.append("g").attr("class", "axis x-axis-trend").attr("transform", `translate(0,${height - margin.bottom})`);
    svg.append("g").attr("class", "axis y-axis-trend").attr("transform", `translate(${margin.left},0)`);
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
        
        // If everything is unchecked, default back to showing everything
        if (State.trendCrops.size === 0 || State.trendCrops.size === Data.crops.length) {
          State.trendCrops.clear();
          wrap.querySelectorAll(".legend-pill").forEach(el => el.classList.add("active"));
        }

        update();
      });
      wrap.appendChild(pill);
    });
  }

  function update() {
    const selectedCrops = getSelectedCropNames();
    let activeCrops = State.trendCrops.size
      ? new Set(selectedCrops.filter(crop => State.trendCrops.has(crop)))
      : new Set(selectedCrops);
    if (!activeCrops.size) activeCrops = new Set(selectedCrops);
    const selectedCountries = State.selectedCountries;

    // Setup labels based on the selection (Yield, Production, Area Harvested)
    const METRIC_UNIT = { "Yield": "kg/ha", "Production": "t", "Area harvested": "ha" };
    const METRIC_LABEL = { "Yield": "Yield (kg/ha)", "Production": "Production (t)", "Area harvested": "Area Harvested (ha)" };
    const metric = State.metric;
    const unit = METRIC_UNIT[metric] || metric;

    const titleEl = document.getElementById("trendTitle");
    if (titleEl) titleEl.textContent = `Crop ${METRIC_LABEL[metric] || metric} Trend Over Time`;
    svg.select(".y-label-trend").text(unit);

    // Filter the raw data to see only what we need for the current view
    const rows = Data.raw.filter(d =>
      d.element === metric &&
      activeCrops.has(d.crop) &&
      (selectedCountries.size === 0 || selectedCountries.has(d.country))
    );

    // Calculate Mean value for each crop-year
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

//loads data and initializes all controls and initial chart render
async function main() {
  try {
    await loadData();
    computeRiskRows();

    const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
	updateStatBadges();
	initCountryList();
	bindDropdownToggles();
  bindFilterControls();
	initCropList();
	TempChart.init();
  CropTrendChart.init();
  RiskMapChart.init(world);
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

function stdDev(values) {
  if (!values.length) return null;
  const mean = d3.mean(values);
  return Math.sqrt(d3.mean(values.map(v => (v - mean) * (v - mean))));
}

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

function normalizeRows(rows, inputKey, outputKey) {
  const vals = rows.map(r => r[inputKey]).filter(v => v != null && isFinite(v));
  const min = d3.min(vals);
  const max = d3.max(vals);
  const span = (max - min) || 1;
  rows.forEach(r => {
    r[outputKey] = r[inputKey] == null ? 0 : (r[inputKey] - min) / span;
  });
}

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

const RiskMapChart = (() => {
  let svg, g, path, projection, width, height, features, color;

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

  
  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom)
     .on("wheel.zoom", null)   
     .call(zoom);
  }

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

/* =====================================================================
   CHART 4 – HORIZONTAL BAR CHART
   Supports ranking by: Temperature Anomaly, Yield, Production, Area Harvested.
   Supports direction: highest (top) or lowest (bottom) N countries.
   Automatically mirrors the global metric selector when it changes.
   ===================================================================== */
   const BarChart = (() => {
    let svg, width, height, margin;
  
    // ---- Local bar chart state ----
    // barMetric: "temp" | "Yield" | "Production" | "Area harvested"
    // barRank  : "top"  | "bottom"
    // barN     : number of countries shown
    const local = { barMetric: "temp", barRank: "top", barN: 15 };
  
    // Metric metadata: label shown on axis and tooltip
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
  
      // Wire up inline controls
      bindBarControls();
    }

    /**
   * Bind the three inline bar-chart controls:
   * - #barMetricSel : what to rank by
   * - #rankToggle buttons : top / bottom
   * - #barNSel : how many countries
   */
  function bindBarControls() {
    // Metric selector — user explicitly choosing locks it from global sync
    document.getElementById("barMetricSel").addEventListener("change", function() {
      local.barMetric    = this.value;
      local.userOverride = true;  // prevent global metric from overriding this choice
      update();
    });

    // Rank direction toggle
    document.querySelectorAll(".rank-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        local.barRank = this.dataset.rank;
        // Update active styling
        document.querySelectorAll(".rank-btn").forEach(b => {
          const isActive = b.dataset.rank === local.barRank;
          b.style.background = isActive ? "#1a3a6b" : "#f5f7fa";
          b.style.color       = isActive ? "#fff"    : "#4a6080";
          b.style.fontWeight  = isActive ? "700"     : "400";
        });
        update();
      });
    });

    // N selector
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

      // Pick the value for the selected bar metric
      let value;
      if      (local.barMetric === "temp")             value = stat.avgTemp;
      else if (local.barMetric === "Yield")            value = stat.avgYield;
      else if (local.barMetric === "Production")       value = stat.totalProd;
      else if (local.barMetric === "Area harvested")   value = stat.totalArea;

      if (value == null) return;
      rows.push({ country, value, temp: stat.avgTemp });
    });

    // Sort direction
    rows.sort((a, b) => local.barRank === "top" ? b.value - a.value : a.value - b.value);
    return rows.slice(0, local.barN);
  }

  function update() {
    const data = buildBarData();
    if (!data.length) return;

    const meta   = METRIC_META[local.barMetric] || METRIC_META["temp"];
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    // X scale — always starts at 0 for bar chart readability
    const xMax = d3.max(data, d => d.value);
    const xMin = local.barRank === "bottom" ? d3.min(data, d => d.value) * 0.92 : 0;
    const xScale = d3.scaleLinear()
      .domain([xMin, xMax * 1.08])
      .range([0, innerW]);

    const yScale = d3.scaleBand()
      .domain(data.map(d => d.country))
      .range([margin.top, margin.top + innerH])
      .padding(0.22);

    // Colour scale — driven by metric palette
    const cScale = d3.scaleSequential()
      .domain([d3.min(data, d => d.value), xMax])
      .interpolator(d3.interpolateRgbBasis(meta.colorPalette));

    // Axes
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

    // ---- Update panel title ----
    const cropStr = State.selectedCrops.size === 0 ? "All Crops"
      : State.selectedCrops.size === 1 ? [...State.selectedCrops][0]
      : `${State.selectedCrops.size} Crops`;
    document.getElementById("barPanelTitle").textContent =
      `Country Rankings — ${meta.label} · ${cropStr} · ${State.year}`;

main();