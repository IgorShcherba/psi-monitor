import { format } from "date-fns";
import fs from "fs-extra";
import path from "path";
import { setTimeout } from "timers/promises";
import inquirer from "inquirer";
import { createObjectCsvWriter } from "csv-writer";

interface PageConfig {
  context: string;
  title: string;
  url: string;
}

interface Config {
  apiKey: string;
  pages: PageConfig[];
  retries?: number;
  delay?: number;
  resultsDir?: string;
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
    if (!page.context || !page.title || !page.url) {
      throw new Error(`Invalid page entry: ${JSON.stringify(page)}`);
    }
    return {
      context: page.context.trim(),
      title: page.title.trim(),
      url: page.url.trim(),
    };
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

type SaveResultsArgs = {
  context: string;
  title: string;
  data: any;
  resultsDir: string;
};

async function saveResults({
  context,
  title,
  data,
  resultsDir,
}: SaveResultsArgs) {
  const date = format(new Date(), "yyyy-MM-dd");
  const dir = path.join(resultsDir, context, date);
  await fs.ensureDir(dir);
  const sanitizedFilename = `${title}-${format(
    new Date(),
    "yyyy-MM-dd_HH:mm:ss"
  )}.json`;
  const filePath = path.join(dir, sanitizedFilename);
  await fs.writeJson(filePath, data, { spaces: 2 });
  console.log(`Results saved to ${filePath}`);
}

async function saveMetricsToCSV({
  title,
  data,
  resultsDir,
  context,
}: SaveResultsArgs) {
  const date = format(new Date(), "yyyy-MM-dd");
  const dir = path.join(resultsDir, date);
  await fs.ensureDir(dir);

  const csvPath = path.join(resultsDir, context, "metrics.csv");
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

async function retryWithDelay(
  fn: () => Promise<any>,
  retries: number,
  delay: number
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < retries) {
        //@ts-expect-error
        console.error(`Attempt ${attempt} failed: ${error.message}`);
        console.log(`Retrying in ${delay}ms...`);
        await setTimeout(delay);
      } else {
        console.error(`Failed after ${retries} attempts.`);
        throw error;
      }
    }
  }
}

async function monitor(configPath: string) {
  const config = await readConfig(configPath);
  const {
    apiKey,
    resultsDir = "../results",
    retries = 3,
    delay = 3000,
    pages,
  } = config;

  const parsedPages = parsePages(pages);

  const controller = new AbortController();
  const signal = controller.signal;

  process.on("SIGINT", () => {
    console.log("Aborting requests...");
    controller.abort();
  });

  let successCount = 0;
  let failureCount = 0;
  let failedPages: PageConfig[] = [];

  for (const page of parsedPages) {
    try {
      const data = await retryWithDelay(
        () =>
          fetchLighthouseScore({
            url: page.url,
            apiKey,
            signal,
            retries,
            delay,
          }),
        retries,
        delay
      );
      await saveResults({
        context: page.context,
        title: page.title,
        data,
        resultsDir,
      });
      await saveMetricsToCSV({
        context: page.context,
        title: page.title,
        data,
        resultsDir,
      });
      successCount++;
    } catch (error) {
      if (signal.aborted) {
        console.log("Request aborted by the user.");
        break;
      }
      console.error(
        // @ts-expect-error
        `Error fetching Lighthouse score for ${page.url}: ${error.message}`
      );
      failureCount++;
      failedPages.push(page);
    }
  }

  console.log(`\nSummary:`);
  console.log(`Successful requests: ${successCount}`);
  console.log(`Failed requests: ${failureCount}`);

  if (failedPages.length > 0) {
    const { retry } = await inquirer.prompt([
      {
        type: "confirm",
        name: "retry",
        message: `There were ${failedPages.length} failed pages. Do you want to retry them?`,
      },
    ]);

    if (retry) {
      successCount = 0;
      failureCount = 0;
      const newFailedPages: PageConfig[] = [];

      for (const page of failedPages) {
        try {
          const data = await retryWithDelay(
            () =>
              fetchLighthouseScore({
                url: page.url,
                apiKey,
                signal,
                retries,
                delay,
              }),
            retries,
            delay
          );
          await saveResults({
            context: page.context,
            title: page.title,
            data,
            resultsDir,
          });
          await saveMetricsToCSV({
            context: page.context,
            title: page.title,
            data,
            resultsDir,
          });
          successCount++;
        } catch (error) {
          if (signal.aborted) {
            console.log("Request aborted by the user.");
            break;
          }
          console.error(
            // @ts-expect-error
            `Error fetching Lighthouse score for ${page.url}: ${error.message}`
          );
          failureCount++;
          newFailedPages.push(page);
        }
      }

      console.log(`\nRetry Summary:`);
      console.log(`Successful requests: ${successCount}`);
      console.log(`Failed requests: ${failureCount}`);

      if (newFailedPages.length > 0) {
        console.log(`Failed pages after retry: ${newFailedPages.length}`);
        console.log(`Failed pages: ${JSON.stringify(newFailedPages, null, 2)}`);
      }
    }
  }
}

export { monitor };
