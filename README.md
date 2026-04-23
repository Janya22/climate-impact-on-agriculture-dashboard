# Climate Impact on Global Agriculture Dashboard

## Overview
An interactive data visualization dashboard that explores the relationship between temperature change and agricultural production across 184 countries and 7 staple crops from 1961 to 2023.

The project focuses on identifying climate stress patterns using correlation-based analysis and multiple visualizations.

## Project Description
This dashboard allows users to analyze how rising temperatures relate to key agricultural metrics:

- Yield (kg/ha)  
- Production (tonnes)  
- Area Harvested (hectares)  

It combines multiple visualizations to present a clear data-driven narrative on the impact of climate change on food production.

## Data Sources
- FAOSTAT Crops and Livestock Data (Kaggle)  
- IMF Climate Data Portal  

## Dataset Structure
```bash
data/
├── raw_data_kaggle.csv
├── raw_data_imf.csv
└── Merged_FAOSTAT_Cleaned.csv
```

## Features

### Interactive Controls
- Selection of metric (Yield, Production, Area Harvested)  
- Adjustable year range (1961–2023)  
- Multi-selection of countries and crops  
- Reset functionality  

### Visualizations

#### Temperature Trend Map
Displays global temperature anomalies over time.

#### Crop Trend Line Chart
Shows agricultural trends across selected years.

#### Climate Risk Map
Highlights regions with potential climate-related risks.

#### Country Ranking Bar Chart
Ranks countries based on selected metrics.

#### Correlation Heatmap
Displays country–crop level correlation between temperature change and agricultural metrics.

- Correlation range: -1 to 1  
- Indicates strength and direction of relationships  
- Helps identify hidden patterns  

## Key Insight
Global agricultural trends may appear stable due to technological advancements such as improved seeds, fertilizers, and irrigation.

This dashboard addresses this by focusing on country–crop level analysis to reveal uneven climate impacts and identify vulnerable regions.

## Technologies Used
- HTML5  
- CSS3  
- JavaScript  
- D3.js (v7)  
- TopoJSON  

## Project Structure
```bash
├── index.html
├── main.js
├── main.css
└── d3.v7.min.js
```

## How to Run
- Clone or download the repository  
- Open `index.html` in a web browser  
- Use the controls to explore the data  

No server setup required.

## Collaborators
- Janya Rathnakumar (Me)
- Asma Sathar  
- Laiba Shehzad  
- Razin Mohammed  

## Tags
#DataVisualization #ClimateChange #Agriculture #D3js #JavaScript #DataAnalytics #Dashboard
