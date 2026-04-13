Climate Risks Dashboard
An interactive data visualisation dashboard that explores the relationship between temperature change and agricultural production across 184 countries and 7 staple crops from 1961 to 2023.
The project focuses on identifying potential climate stress patterns using correlation-based analysis and multiple visualisations.
 
Project Overview
This dashboard allows users to analyse how rising temperatures relate to agricultural metrics such as:
•	Yield (kg/ha)
•	Production (tonnes)
•	Area Harvested (hectares)
It combines multiple visualisations to present a clear data story on the impact of climate change on food production.
Regions highlighted represent potential climate stress hotspots, based on correlation rather than direct causation.
 
Features
Interactive Controls
•	Selection of metric (Yield, Production, Area Harvested)
•	Adjustable year range (1961–2023)
•	Multi-selection of countries and crops
•	Reset functionality for quick analysis
 
Visualisations
Temperature Trend Map
Displays global temperature anomalies over time.
Crop Trend Line Chart
Shows agricultural trends across selected years.
Climate Risk Map
Highlights regions with potential climate-related risks.
Country Ranking Bar Chart
Ranks countries based on selected metrics.
Correlation Heat Map
Displays country–crop level correlation between temperature change and the selected agricultural metric.
A colour scale ranging from -1 to 1 represents the strength and direction of relationships.
 
Key Insight
Global agricultural trends may appear stable due to technological advancements such as improved seeds, fertilizers, and irrigation.
This dashboard addresses this by focusing on country–crop level analysis to reveal uneven impacts of climate change and identify more vulnerable regions.
 
Technologies Used
•	HTML5
•	CSS3
•	JavaScript
•	D3.js (v7)
•	TopoJSON
 
Project Structure
index.html – Main dashboard layout
main.js – Data processing and visualisations
main.css – Styling and UI design
d3.v7.min.js – D3 library
 
How to Run
1.	Download or clone the repository
2.	Open the index.html file in a web browser
3.	Use the controls to explore the data
No server setup is required.
 
Data Sources
•	FAOSTAT Crops and Livestock Data (Kaggle)
•	IMF Climate Data Portal
