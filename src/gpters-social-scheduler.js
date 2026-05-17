import "dotenv/config";
import { spawn } from "node:child_process";

const HOUR = Number.parseInt(process.env.GPTERS_DIGEST_HOUR || "6", 10);
const MINUTE = Number.parseInt(process.env.GPTERS_DIGEST_MINUTE || "30", 10);
const TIME_ZONE = "Asia/Seoul";

function nowInSeoul() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(
    `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}+09:00`,
  );
}

function nextRunDelay() {
  const now = nowInSeoul();
  const next = new Date(now);
  next.setHours(HOUR, MINUTE, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function runDigest() {
  const child = spawn(process.execPath, ["src/gpters-social-digest.js"], {
    stdio: "inherit",
    shell: false,
  });

  child.on("close", (code) => {
    if (code !== 0) {
      console.error(`Digest exited with code ${code}`);
    }
    scheduleNext();
  });
}

function scheduleNext() {
  const delay = nextRunDelay();
  const minutes = Math.round(delay / 60000);
  console.log(`Next GPTers social digest in ${minutes} minutes (${TIME_ZONE} ${HOUR}:${String(MINUTE).padStart(2, "0")}).`);
  setTimeout(runDigest, delay);
}

scheduleNext();
