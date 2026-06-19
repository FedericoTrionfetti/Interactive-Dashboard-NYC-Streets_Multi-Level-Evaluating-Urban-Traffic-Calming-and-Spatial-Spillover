# NYC Vision Zero Dashboard: Evaluating Urban Traffic Calming and Spatial Spillover

This repository contains the codebase and research documentation for my Master's Thesis project. It introduces a comprehensive, multi-level interactive dashboard designed to evaluate the physical interventions of New York City's **Vision Zero** program (2015–2022).

---

## 🔬 The Research: Academic Context & Contributions

Road traffic injuries remain a leading cause of preventable death in urban environments. While many cities adopt Vision Zero policies, the scientific evaluation of these interventions often suffers from aggregation bias (MAUP), homogeneity assumptions, and lack of traffic exposure data. 

This thesis addresses these limitations through an integrated spatial panel data analysis at the **road segment level (RCSTA)**. 

### Core Research Questions
1. **The Equity Problem (Allocation):** What socio-economic characteristics (e.g., Median Household Income) predict the installation of traffic-calming measures? Are these life-saving investments distributed equitably across the city's income strata?
2. **The Spillover Problem (Effectiveness):** Do interventions genuinely reduce crashes, or do they merely displace the risk onto adjacent, untreated segments? 

### The Core Metric: The Risk Rate
To genuinely measure safety improvements, this platform moves beyond absolute crash counts by utilizing the **Risk Rate**. This metric normalizes crash frequencies by **actual traffic exposure (AADT - Annual Average Daily Traffic)** and adjusts for seasonal variation, isolating the true protective effect of an intervention from mere changes in traffic volume.

---

## 💻 The Software: Dashboard Architecture

The dashboard is structured into a progressive 3-level analytical funnel, guiding users from a macroscopic view of the entire city network down to a microscopic evaluation of a single road segment.

### Level 0: Macro Network Analysis
**Goal:** Understand the decision drivers behind intervention installations and discover socio-demographic patterns.
- **Interactive Network Map:** Visualizes thousands of treated and untreated segments.
- **Parallel Coordinates Plot (PCP):** Explores multidimensional data (income, density, lanes, speed limit). The backend dynamically deduplicates road segments to prevent overlapping biases caused by multiple interventions on a single road.
- **Crossfiltering System:** Allows slicing the data by installation year, intervention type, and pre-intervention severity indexes.

### Level 1: Filtered Cohort Overview
**Goal:** Evaluate the aggregate performance of a specific, filtered cohort of interventions.
- **Pre/Post Scatter Plot:** Contrasts the Crash Reduction % against the Traffic Volume Reduction %. Crucial for spotting outliers where an apparent drop in crashes is merely the result of a drop in traffic.
- **Segment Details Table:** Sorts and identifies candidate segments based on their pre-intervention Risk Rates and their Degree of Intervention (DoI).

### Level 2: Micro/Local Effectiveness Analysis
**Goal:** The ultimate investigative tool to evaluate real effectiveness and detect **Spatial Spillover** (risk displacement).
- **Target Analysis:** Evaluates the pre- and post-intervention Risk Rate for the isolated target segment via interactive line plots and precise tooltips.
- **Local Spatial Filter:** Uses a radius slider to dynamically capture "Local Segments" (physical neighbors).
- **Spillover Detection:** Instantly identifies adjacent streets that experienced an *increase* in Risk Rate following the target's intervention, answering whether safety was improved or simply relocated to neighboring neighborhoods.

---

## 🛠️ Tech Stack & Directory Structure

- **`backend/`**: Python application (`app.py`) serving a robust REST API. Handles complex spatial joins, data deduplication, progressive mathematical reductions (handling zero-denominators), and Parquet file parsing (`crash_monthly_panel.parquet`).
- **`frontend/`**: Modular JavaScript application separated by logic (`map.js`, `charts.js`, `level0.js`, `level1.js`, `level2.js`, `utils.js`). Uses D3.js, DC.js, and mapping libraries to render responsive SVG visualizations.
- **`data/`**: Processed datasets containing NYC VZV crash and infrastructure data merged with ACS census socio-demographics.

---

## 👨‍💻 Author
**Federico Trionfetti**
Data Science Master's Degree (Honor Program) - Sapienza University of Rome
