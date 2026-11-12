#!/usr/bin/env node
// refmark command: hands the arguments to the CLI and exits with its status code
import { main } from '../src/cli.mjs';

process.exitCode = await main(process.argv.slice(2));
