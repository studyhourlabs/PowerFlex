import { config } from "./config.js";
import { getDemoFlexEvents, loadAgentFiles, loadPrivateData } from "./data.js";
import { askOpenClawForDecision } from "./openclaw.js";
import { submitBatteryAction } from "./action.js";
import { appendEvidence } from "./evidence.js";
import { sendTelegram } from "./telegram.js";
import type { EvidenceRecord } from "./types.js";

async function main(): Promise<void> {
  console.log(`Starting PowerFlex demo: ${config.demoRuns} runs`);
  console.log(`PowerFlex agent mode: ${config.openClawDryRun ? "disabled" : "real OpenCLAW"}`);
  console.log(`Battery action mode: ${config.actionApiMode}`);
  console.log(`Telegram enabled: ${config.telegramEnabled}`);

  const [events, privateData, agentFiles] = await Promise.all([
    getDemoFlexEvents(config.demoRuns),
    loadPrivateData(),
    loadAgentFiles()
  ]);

  if (events.length === 0) {
    throw new Error("No flex events returned from API");
  }

  for (let index = 0; index < config.demoRuns; index += 1) {
    const run = index + 1;
    const event = events[index % events.length]!;
    console.log(`\nRun ${run}/${config.demoRuns}: ${event.fu_id ?? "unknown event"}`);

    const decision = await askOpenClawForDecision({
      run,
      event,
      privateData,
      agentFiles
    });
    const batteryAction = await submitBatteryAction(event, decision);
    const record: EvidenceRecord = {
      run,
      timestamp: new Date().toISOString(),
      event,
      decision,
      batteryAction
    };

    const evidence = await appendEvidence(record);
    await sendTelegram(record);

    console.log(`Evidence CSV: ${evidence.csvPath}`);
    console.log(`Dashboard: ${evidence.dashboardPath}`);

    if (run < config.demoRuns) {
      await sleep(config.demoIntervalMs);
    }
  }

  console.log("\nPowerFlex demo completed.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
