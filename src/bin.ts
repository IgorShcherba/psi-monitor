#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { monitor } from "./monitor";

void yargs(hideBin(process.argv))
  .option("config", {
    alias: "c",
    type: "string",
    description: "Path to the config JSON file",
    demandOption: true,
    default: "./config.json",
  })
  .command(
    "run",
    "Fetch Lighthouse scores and save results",
    {},
    async (args) => {
      await monitor(args.config as string);
    }
  )
  .demandCommand(1, "You need to specify a command to run")
  .help().argv;
