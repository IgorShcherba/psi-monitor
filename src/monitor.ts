import { format } from "date-fns";
import fs from "fs-extra";
import path, { dirname } from "path";
import dotenv from "dotenv";
import { createObjectCsvWriter } from "csv-writer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const urls = process.env.URLS
  ? process.env.URLS.split(",").map((url) => url.trim())
  : [];
if (urls.length === 0) {
  throw new Error("URLs are not defined in the environment variables");
}

async function fetchLighthouseScore(url: string) {
  console.log(`Fetching Lighthouse score for ${url}`);
  const response = await fetch(
    `https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
      url
    )}&category=performance&strategy=mobile`
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

function sanitizeFilename(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/[\/?&]/g, "_");
}

async function saveResults(url: string, data: any) {
  const date = format(new Date(), "yyyy-MM-dd");
  const dir = path.join(__dirname, "../results", date);
  await fs.ensureDir(dir);
  const sanitizedFilename = sanitizeFilename(url) + ".json";
  const filePath = path.join(dir, sanitizedFilename);
  await fs.writeJson(filePath, data, { spaces: 2 });
  console.log(`Results saved to ${filePath}`);
}

async function saveMetricsToCSV(url: string, data: any) {
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
      { id: "url", title: "URL" },
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
    url,
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
  const fetchPromises = urls.map(async (url) => {
    try {
      const data = await fetchLighthouseScore(url);
      await saveResults(url, data);
      await saveMetricsToCSV(url, data);
    } catch (error) {
      console.error(
        //@ts-expect-error
        `Error fetching Lighthouse score for ${url}: ${error.message}`
      );
    }
  });

  await Promise.all(fetchPromises);
}

export { monitor };
