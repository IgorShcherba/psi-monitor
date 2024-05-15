# Lighthouse Performance Monitor

This project monitors the performance of web pages using PageSpeed Insights API. It fetches Lighthouse scores for specified pages, saves the results in JSON format, and records key metrics in a CSV file for analysis.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Results Storage](#results-storage)

## Prerequisites

- [Node.js](https://nodejs.org/)
- A PageSpeed Insights API key from Google

## Installation

1. Clone the repository:

   ```sh
   git clone git@github.com:IgorShcherba/psi-monitor.git
   cd psi-monitor
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

## Usage

1. Create a `.env` file in the root directory of the project and configure the necessary environment variables. Refer to the [Environment Variables](#environment-variables) section for details.

2. Run the monitor script to fetch Lighthouse scores and save results:

   ```sh
   npm run monitor
   ```

## Environment Variables

Create a `.env` file in the root directory and set the following environment variables:

```env
API_KEY=your_psi_api_key
PAGES=Shelf:https://www-staging.autozone.com.mx/baterias-arranque-y-carga/bateria,Category:https://www-staging.autozone.com.mx/refacciones
```

## Scripts

**npm run monitor**: Fetches Lighthouse scores for the specified in the .env pages and saves results in JSON and CSV formats.

## Results Storage

JSON Files: The full Lighthouse result for each page is saved as a JSON file in the results/YYYY-MM-DD directory, where YYYY-MM-DD is the current date.
CSV File: Key performance metrics are saved in a metrics.csv file in the results/YYYY-MM-DD directory. Each row in the CSV file corresponds to a page, including the title, URL, date, and various performance metrics such as First Contentful Paint, Largest Contentful Paint, Speed Index, Total Blocking Time, Cumulative Layout Shift.
