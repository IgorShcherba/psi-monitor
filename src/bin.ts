#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { monitor } from "./monitor";
import { config } from "dotenv";
import { join } from "path";

void yargs(hideBin(process.argv))
  .option("env", {
    alias: "e",
    type: "string",
    description: "Path to the .env file",
    demandOption: true,
    default: ".env",
  })
  .option("retries", {
    alias: "r",
    type: "number",
    description: "Number of retries",
    default: 3,
  })
  .option("delay", {
    alias: "d",
    type: "number",
    description: "Delay between retries in milliseconds",
    default: 500,
  })
  .command(
    "run",
    "Fetch Lighthouse scores and save results",
    {},
    async (args) => {
      // Load the .env file
      const envPath = join(process.cwd(), args.env as string);
      config({ path: envPath });
      await monitor(args.retries as number, args.delay as number);
    }
  )
  .demandCommand(1, "You need to specify a command to run")
  .help().argv;
