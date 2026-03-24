/* =====================================================================
   DATA LOADING AND PREPROCESSING
   ===================================================================== */
/**
 * Load CSV and build lookup structures.
 */
async function loadData() {
  const raw = await d3.csv("Merged_FAOSTAT_Cleaned.csv", d => ({
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

  return raw;
}
