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
        if (event.target.tagName === 'INPUT') return;
        const cb = d3.select(this).select("input").node();
        cb.checked = !cb.checked;
        updateCountrySelection(d, cb.checked);
      });

  countryItems.append("input")
    .attr("type", "checkbox")
    .on("change", (event, d) => {
      updateCountrySelection(d, event.target.checked);
    });

  countryItems.append("span")
    .text(d => d);
  d3.select("#countrySel-dropdown").style("display", "block");
}
//sets up the click event listener to show or hide the country selection dropdown
function bindDropdownToggles() {
  const trigger = document.getElementById("countrySel-trigger");
  const dropdown = document.getElementById("countrySel-dropdown");

  if (trigger && dropdown) {
    trigger.addEventListener("click", () => {
      dropdown.classList.toggle("show"); 
      const isHidden = dropdown.style.display === "none" || dropdown.style.display === "";
      dropdown.style.display = isHidden ? "block" : "none";
    });
  }
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

async function main() {
  try {
    await loadData();
	updateStatBadges();
	initCountryList();
	bindDropdownToggles();
    const testCountry = Data.countries[0];
    const testYear = 2010;
    const yearData = Data.byCountryYear.get(testCountry)?.get(testYear);

    console.log(`Test Result for ${testCountry} in ${testYear}:`, yearData);
  } catch (error) {
    console.error("Data loading failed: Check if the CSV filename is correct:", error);
  }
}


main();