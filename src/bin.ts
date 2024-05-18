#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { monitor } from "./monitor";

void yargs(hideBin(process.argv))
  .option("config", {
    alias: "c",
    type: "string",
    description: "Path to the config JSON file",
    default: "./config.json",
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
      await monitor(
        args.config as string,
        args.retries as number,
        args.delay as number
      );
    }
  )
  .demandCommand(1, "You need to specify a command to run")
  .help().argv;
