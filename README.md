# Multi-Level Evaluation of Urban Traffic Calming and Spatial Spillover

**Master's Thesis Project**  
**Data Science Master's Degree (Honor Program)**  
**Sapienza University of Rome**

This repository hosts a full-stack, interactive dashboard designed to evaluate the real-world effectiveness of NYC's Vision Zero traffic-calming interventions. By combining a Python/Flask backend with a dynamic DC.js/Mapbox frontend, the tool enables a multi-level spatial and temporal analysis of road safety measures.

---

## 🔬 Research Context & Addressed Limitations

This project overcomes several critical limitations identified in existing road safety literature:
1. **The Equity Problem:** Does safety investment favour high-income areas? The dashboard integrates socio-economic variables (e.g., Median Household Income) at the segment level to evaluate intervention allocation equity.
2. **The Heterogeneity Problem:** Interventions are not all equal. The analysis strictly disaggregates multiple types of Traffic Calming Measures (TCMs).
3. **The Exposure Problem:** A reduction in crashes may simply reflect a reduction in traffic. This dashboard evaluates safety using the **Risk Rate**—seasonally adjusted crashes normalized by Annual Average Daily Traffic (AADT).
4. **The Aggregation Problem (MAUP):** Analysis is anchored to the granular road segment (RCSTA) rather than aggregated Census Tracts.
5. **The Spillover Problem:** Does traffic calming eliminate risk or just displace it? The system measures spatial spillover to adjacent, untreated segments.

---

## ⚙️ Dashboard Architecture & Progressive Workflow

The interface is structured into three progressive analytical levels, guiding the user from macro-allocation to micro-effectiveness.

### Level 0: Macro Network Analysis
**Goal:** Understand decision drivers behind intervention installations and socio-demographic patterns.
- **Crossfilters & Interactive Map:** Filter thousands of treated and untreated arterial segments by installation year, intervention type, or pre-intervention severity.
- **Deduplicated Parallel Coordinates Plot (PCP):** Explores stable road-level metrics (e.g., length, density, income, speed limits). The PCP automatically deduplicates segments to avoid artificial overlaps caused by multiple interventions on the same road, providing precise Mean/Range statistics for Treated vs. Untreated cohorts via dynamic tooltips.

### Level 1: Filtered Cohort Overview
**Goal:** Assess the average performance of the selected cohort and identify outliers.
- **Scatter Plot (Crash Reduction vs AADT Reduction):** A vital tool to verify true safety improvements. A massive drop in crashes is only considered a success if it outpaces the drop in traffic volume.
- **Segment Details Table:** Sort interventions by their baseline Risk Rate, Degree of Intervention (DoI), or normalized Risk Reduction percentage.

### Level 2: Micro/Local Effectiveness Analysis
**Goal:** Evaluate local spillover effects for a single, isolated intervention.
- **Target vs Local Segments:** Isolates the treated segment and utilizes a dynamic radius slider to fetch "Local Segments" (neighbors).
- **Risk Rate Analysis:** The backend (`app.py` & Parquet panels) dynamically recalculates the pre/post Risk Rate for both the target and its neighbors. Colors scale from green (safety improved) to red (risk increased), highlighting potential risk displacement.
- **Future Pre/Post Analysis:** A dedicated panel provides granular event data (Crash Type, Victim Type, Time Scatterplots) to dissect *how* the nature of crashes changed after the intervention.

---

## 🛠️ Technology Stack
- **Backend:** Python, Flask, Pandas, PyArrow (Parquet for fast panel data querying).
- **Frontend:** JavaScript, DC.js, D3.js, Crossfilter, Leaflet / Mapbox.
- **Data Source:** NYC Open Data (Vision Zero View, Crash Data, AADT).

## 👨‍💻 Author
**Federico Trionfetti**
Data Science Master's Degree (Honor Program) - Sapienza University of Rome
