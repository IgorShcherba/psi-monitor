import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { monitor } from "./monitor.js";

yargs(hideBin(process.argv))
  .command("monitor", "Fetch Lighthouse scores and save results", {}, monitor)
  .help().argv;
