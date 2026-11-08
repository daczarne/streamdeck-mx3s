/**
 * Where the probes write what they find: a file in `out/`, named after the time the run started (YYYYMMDD_HHMMSS.txt,
 * in local time), to which each line is appended as soon as it's known, so a run that fails partway keeps what it
 * found. The terminal shows only the file's path, and what someone has to do while the run goes on. Importing it names
 * the run's file, which {@link start} begins.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The time a run started, as the name of its file: YYYYMMDD_HHMMSS, in local time.
 *
 * @param {Date} date
 * @returns {string}
 */
function timestamp(date) {
  const pad = (/** @type {number} */ value) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${day}_${time}`;
}

const startedAt = new Date();
const outDir = fileURLToPath(new URL("out/", import.meta.url));
export const outFile = `${outDir}${timestamp(startedAt)}.txt`;

/**
 * Appends a line to the run's file as soon as it's known, so a run that fails keeps what it found.
 *
 * @param {string} line
 * @returns {void}
 */
export function log(line) {
  appendFileSync(outFile, `${line}\n`);
}

/**
 * Appends a line to the run's file, and shows it on the terminal too, for what someone has to do while the run goes
 * on, such as the clicks that enter a passkey.
 *
 * @param {string} line
 * @returns {void}
 */
export function tell(line) {
  log(line);
  console.log(line);
}

/**
 * Begins the run's file, headed by the probe's name and arguments and the time the run started, and shows its path on
 * the terminal. A probe calls it once it has checked its arguments, so a usage error leaves no file.
 *
 * @returns {void}
 */
export function start() {
  mkdirSync(outDir, { recursive: true });
  console.log(`Probing, writing to ${outFile}`);
  const command = [basename(process.argv[1] ?? "probe"), ...process.argv.slice(2)].join(" ");
  log(`${command}, ${startedAt.toISOString()}`);
}
