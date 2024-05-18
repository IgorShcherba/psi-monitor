import { format } from "date-fns";
import fs from "fs-extra";
import path from "path";
import { setTimeout } from "timers/promises";

import { createObjectCsvWriter } from "csv-writer";

interface PageConfig {
  title: string;
  url: string;
}

interface Config {
  apiKey: string;
  pages: PageConfig[];
}

const readConfig = async (configPath: string): Promise<Config> => {
  console.log(`Reading config from ${configPath}`);
  const data = await fs.readJson(configPath);
  if (!data.apiKey) {
    throw new Error("API key is not defined in the config file");
  }
  if (!data.pages || !Array.isArray(data.pages)) {
    throw new Error("Pages are not defined correctly in the config file");
  }
  return data;
};

const parsePages = (pages: PageConfig[]) => {
  return pages.map((page) => {
    if (!page.title || !page.url) {
      throw new Error(`Invalid page entry: ${JSON.stringify(page)}`);
    }
    return { title: page.title.trim(), url: page.url.trim() };
  });
};

async function fetchLighthouseScore({
  url,
  apiKey,
  signal,
  retries = 3,
  delay = 500,
}: {
  url: string;
  apiKey: string;
  signal: AbortSignal;
  retries: number;
  delay: number;
}): Promise<any> {
  console.log(`Fetching Lighthouse score for ${url}`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
          url
        )}&category=performance&strategy=mobile&key=${apiKey}`,
        { signal }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Failed to fetch Lighthouse score for ${url}: ${error.error.message}`
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (signal.aborted) {
        console.log("Request aborted by the user.");
        throw error;
      }
      //@ts-expect-error
      console.error(`Attempt ${attempt} failed: ${error.message}`);

      if (attempt < retries) {
        console.log(`Retrying in ${delay}ms...`);
        await setTimeout(delay);
      } else {
        console.log(`Failed after ${retries} attempts.`);
        throw error;
      }
    }
  }
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

async function monitor(
  configPath: string = "./config.json",
  retries: number,
  delay: number
) {
  const config = await readConfig(configPath);

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

  const apiKey = config.apiKey;
  const pages = parsePages(config.pages);

  if (pages.length === 0) {
    throw new Error("PAGES are not defined in the environment variables");
  }

  if (!apiKey) {
    throw new Error("PSI_API_KEY is not defined in the environment variables");
  }

  const controller = new AbortController();
  const signal = controller.signal;
  let successCount = 0;
  let failureCount = 0;

  process.on("SIGINT", () => {
    console.log("Aborting requests...");
    controller.abort();
  });

  for (const { title, url } of pages) {
    try {
      const data = await fetchLighthouseScore({
        url,
        apiKey,
        signal,
        retries,
        delay,
      });
      await saveResults(title, data);
      await saveMetricsToCSV(title, data);
      successCount++;
    } catch (error) {
      if (signal.aborted) {
        console.log("Request aborted by the user.");
        break;
      }
      failureCount++;
      console.error(
        //@ts-expect-error
        `Error fetching Lighthouse score for ${url}: ${error.message}`
      );
    }
  }

  console.info(`\nSummary:`);
  console.log(`Successful requests: ${successCount}`);
  console.log(`Failed requests: ${failureCount}`);
}

export { monitor };
