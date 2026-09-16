import fs from "node:fs";
import { REPORTS_DIR, RESULTS_DIR, SCREENS_DIR } from "./dod-shared";

export default async function globalSetup() {
  fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
  fs.rmSync(SCREENS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}
