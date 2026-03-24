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
}

//updates charts when state is changed
function updateAll() {
  TempChart.update();
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

//loads data and initializes all controls and initial chart render
async function main() {
  try {
    await loadData();
	updateStatBadges();
	initCountryList();
	bindDropdownToggles();
	initCropList();
	TempChart.init();
	TempChart.update();
    const testCountry = Data.countries[0];
    const testYear = 2010;
    const yearData = Data.byCountryYear.get(testCountry)?.get(testYear);

    console.log(`Test Result for ${testCountry} in ${testYear}:`, yearData);
  } catch (error) {
    console.error("Data loading failed: Check if the CSV filename is correct:", error);
  }
}


main();