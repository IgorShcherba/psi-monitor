#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { monitor } from "./monitor.js";
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
  .command(
    "run",
    "Fetch Lighthouse scores and save results",
    {},
    async (args) => {
      // Load the .env file
      const envPath = join(process.cwd(), args.env as string);
      config({ path: envPath });
      await monitor();
    }
  )
  .demandCommand(1, "You need to specify a command to run")
  .help().argv;
