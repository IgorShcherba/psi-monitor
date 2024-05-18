import { format } from "date-fns";
import fs from "fs-extra";
import path from "path";

import { createObjectCsvWriter } from "csv-writer";
import { config } from "dotenv";

const parsePages = (pagesString: string) => {
  return pagesString.split(",").map((page) => {
    const index = page.indexOf(":");
    if (index === -1) throw new Error(`Invalid page entry: ${page}`);
    const title = page.substring(0, index).trim();
    const url = page.substring(index + 1).trim();
    return { title, url };
  });
};

async function fetchLighthouseScore(url: string, apiKey: string) {
  console.log(`Fetching Lighthouse score for ${url}`);
  const response = await fetch(
    `https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
      url
    )}&category=performance&strategy=mobile&key=${apiKey}`
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Failed to fetch Lighthouse score for ${url}: ${error.error.message}`
    );
  }
  const data = await response.json();
  return data;
}

async function saveResults(title: string, data: any) {
  const date = format(new Date(), "yyyy-MM-dd");
  const dir = path.join(__dirname, "../results", date);
  await fs.ensureDir(dir);
  const sanitizedFilename = `${title}-${format(
    new Date(),
    "yyyy-MM-dd_HH:mm:ss"
  )}.json`;
  const filePath = path.join(dir, sanitizedFilename);
  await fs.writeJson(filePath, data, { spaces: 2 });
  console.log(`Results saved to ${filePath}`);
}

async function saveMetricsToCSV(title: string, data: any) {
  const date = format(new Date(), "yyyy-MM-dd");
  const dir = path.join(__dirname, "../results", date);
  await fs.ensureDir(dir);

  const csvPath = path.join(__dirname, "../results", "metrics.csv");
  let append = false;
  try {
    await fs.access(csvPath);
    const st = await fs.stat(csvPath);
    append = st.size > 0;
  } catch (error) {
    console.log("File does not exist, creating a new one");
  }

  const csvWriter = createObjectCsvWriter({
    path: csvPath,
    header: [
      { id: "title", title: "Page" },
      { id: "date", title: "Date" },
      { id: "firstContentfulPaint", title: "First Contentful Paint" },
      { id: "largestContentfulPaint", title: "Largest Contentful Paint" },
      { id: "cumulativeLayoutShift", title: "Cumulative Layout Shift" },
      { id: "totalBlockingTime", title: "Total Blocking Time" },
      { id: "speedIndex", title: "Speed Index" },
    ],
    append,
  });

  const lighthouse = data.lighthouseResult;

  const lighthouseMetrics = {
    "First Contentful Paint":
      lighthouse.audits["first-contentful-paint"].displayValue,
    "Largest Contentful Paint":
      lighthouse.audits["largest-contentful-paint"].displayValue,
    "Cumulative Layout Shift":
      lighthouse.audits["cumulative-layout-shift"].displayValue,
    "Total Blocking Time":
      lighthouse.audits["total-blocking-time"].displayValue,
    "Speed Index": lighthouse.audits["speed-index"].displayValue,
  };

  const record = {
    title,
    date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
    firstContentfulPaint: lighthouseMetrics["First Contentful Paint"],
    largestContentfulPaint: lighthouseMetrics["Largest Contentful Paint"],
    cumulativeLayoutShift: lighthouseMetrics["Cumulative Layout Shift"],
    totalBlockingTime: lighthouseMetrics["Total Blocking Time"],
    speedIndex: lighthouseMetrics["Speed Index"],
  };

  await csvWriter.writeRecords([record]);
  console.log(`Metrics saved to ${csvPath}`);
}
async function monitor() {
  // const fetchPromises = pages.map(async ({ title, url }) => {
  //   try {
  //     const data = await fetchLighthouseScore(url);
  //     await saveResults(title, data);
  //     await saveMetricsToCSV(title, data);
  //   } catch (error) {
  //     console.error(
  //       //@ts-expect-error
  //       `Error fetching Lighthouse score for ${url}: ${error.message}`
  //     );
  //   }
  // });

  // await Promise.all(fetchPromises);
  config();

  const apiKey = process.env.PSI_API_KEY;
  const pages = process.env.PAGES ? parsePages(process.env.PAGES) : [];
  if (pages.length === 0) {
    throw new Error("PAGES are not defined in the environment variables");
  }

  if (!apiKey) {
    throw new Error("PSI_API_KEY is not defined in the environment variables");
  }

  for (const { title, url } of pages) {
    try {
      const data = await fetchLighthouseScore(url, apiKey);
      await saveResults(title, data);
      await saveMetricsToCSV(title, data);
    } catch (error) {
      console.error(
        //@ts-expect-error
        `Error fetching Lighthouse score for ${url}: ${error.message}`
      );
    }
  }
}

export { monitor };
