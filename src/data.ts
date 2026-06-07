import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { FlexEvent, PrivateData } from "./types.js";

export async function fetchFlexEvents(limit = 5): Promise<FlexEvent[]> {
  const url = new URL(config.flexEventsUrl);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET flex events failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { results?: FlexEvent[] };
  return payload.results ?? [];
}

export async function getDemoFlexEvents(limit = 5): Promise<FlexEvent[]> {
  const liveEvents = await fetchFlexEvents(limit).catch((error) => {
    console.warn(
      `Live flex event API failed; using replay events. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return [];
  });

  const uniqueLiveEvents = dedupeByEventId(liveEvents).filter(isUsefulDemoEvent);
  if (uniqueLiveEvents.length >= limit) {
    return uniqueLiveEvents.slice(0, limit);
  }

  const replayEvents = await readDataJson("replay-flex-events.json");
  const replay = Array.isArray(replayEvents) ? (replayEvents as FlexEvent[]) : [];
  return [...uniqueLiveEvents, ...replay].slice(0, limit);
}

export async function loadPrivateData(): Promise<PrivateData> {
  const [companyProfile, depotOps, bessAssets] = await Promise.all([
    fetchJson(config.privateCompanyProfileUrl, "private company profile"),
    fetchJson(config.privateDepotOpsUrl, "private depot ops"),
    fetchJson(config.privateBessAssetsUrl, "private BESS assets")
  ]);

  return { companyProfile, depotOps, bessAssets };
}

export async function loadAgentFiles(): Promise<{ agents: string; identity: string }> {
  const [agents, identity] = await Promise.all([
    fs.readFile(config.agentInstructionsPath, "utf8"),
    fs.readFile(config.identityPath, "utf8")
  ]);

  return { agents, identity };
}

async function readDataJson(fileName: string): Promise<unknown> {
  const body = await fs.readFile(path.join(config.rootDir, "data", fileName), "utf8");
  return JSON.parse(body);
}

async function fetchJson(url: string, label: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`GET ${label} failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<unknown>;
}

function dedupeByEventId(events: FlexEvent[]): FlexEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = event.fu_id ?? JSON.stringify(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isUsefulDemoEvent(event: FlexEvent): boolean {
  return (
    event.zone === "Halstead" &&
    typeof event.utilisation_mw_req === "number" &&
    event.utilisation_mw_req > 0 &&
    typeof event.utilisation_price === "number" &&
    event.utilisation_price >= 300
  );
}
