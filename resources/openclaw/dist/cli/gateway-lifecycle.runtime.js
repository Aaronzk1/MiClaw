import { s as normalizeOptionalLowercaseString } from "../string-coerce-mnp54Vah.js";
import { i as formatErrorMessage } from "../errors-BXgSefBE.js";
import { t as isContainerEnvironment } from "../container-environment-CNsJSTpY.js";
import { i as getRuntimeConfig } from "../io-Gi7-pyU-.js";
import "../config-C9RxTsn1.js";
import { a as consumeGatewaySigusr1RestartIntent, c as isGatewaySigusr1RestartExternallyAllowed, d as resetGatewayRestartStateForInProcessRestart, f as resolveGatewayRestartDeferralTimeoutMs, g as triggerOpenClawRestart, i as consumeGatewaySigusr1RestartAuthorization, l as markGatewaySigusr1RestartHandled, n as consumeGatewayRestartIntentPayloadSync, p as scheduleGatewaySigusr1Restart, r as consumeGatewayRestartIntentSync, u as peekGatewaySigusr1RestartReason } from "../restart-CiO1ILZU.js";
import { r as writeGatewayRestartHandoffSync } from "../restart-handoff-B55foNq9.js";
import { C as reloadTaskRegistryFromStore } from "../task-registry-FH-Ti23C.js";
import "../runtime-internal-DmbNZJaP.js";
import { p as writeDiagnosticStabilityBundleForFailureSync } from "../diagnostic-stability-bundle-iwf5z4wY.js";
import { d as listActiveEmbeddedRunSessionIds, f as listActiveEmbeddedRunSessionKeys, u as getActiveEmbeddedRunCount } from "../run-state-BYGFyjne.js";
import { S as waitForActiveEmbeddedRuns, n as abortEmbeddedAgentRun } from "../runs-B4dP_Q30.js";
import { t as markRestartAbortedMainSessions } from "../main-session-restart-recovery-Ce-iJuS6.js";
import { n as detectRespawnSupervisor } from "../supervisor-markers-DgM0YH9c.js";
import { a as markUpdateRestartSentinelFailure } from "../restart-sentinel-BFAG1Tav.js";
import { _ as waitForActiveTasks, a as getActiveTaskCount, m as resetAllLanes, p as markGatewayDraining } from "../command-queue-DGvXlE4p.js";
import { n as getInspectableActiveTaskRestartBlockers } from "../task-registry.maintenance-BO6_16yZ.js";
import { spawn } from "node:child_process";
//#region src/infra/process-respawn.ts
function isTruthy(value) {
	const normalized = normalizeOptionalLowercaseString(value);
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
function spawnDetachedGatewayProcess(opts = {}) {
	const args = [...process.execArgv, ...process.argv.slice(1)];
	const child = spawn(process.execPath, args, {
		env: opts.env ? {
			...process.env,
			...opts.env
		} : process.env,
		detached: true,
		stdio: "inherit"
	});
	child.unref();
	return {
		child,
		pid: child.pid ?? void 0
	};
}
/**
* Attempt to restart this process with a fresh PID.
* - supervised environments (launchd/systemd/schtasks): caller should exit and let supervisor restart
* - OPENCLAW_NO_RESPAWN=1: caller should keep in-process restart behavior (tests/dev)
* - unmanaged environments: caller should keep in-process restart behavior so
*   custom supervisors keep tracking the same gateway PID
*/
function restartGatewayProcessWithFreshPid(_opts = {}) {
	if (isTruthy(process.env.OPENCLAW_NO_RESPAWN)) return { mode: "disabled" };
	const supervisor = detectRespawnSupervisor(process.env);
	if (supervisor) {
		if (supervisor === "schtasks") {
			const restart = triggerOpenClawRestart();
			if (!restart.ok) return {
				mode: "failed",
				detail: restart.detail ?? `${restart.method} restart failed`
			};
		}
		return { mode: "supervised" };
	}
	if (process.platform === "win32") return {
		mode: "disabled",
		detail: "win32: detached respawn unsupported without Scheduled Task markers"
	};
	if (isContainerEnvironment()) return {
		mode: "disabled",
		detail: "container: use in-process restart to keep PID 1 alive"
	};
	return {
		mode: "disabled",
		detail: "unmanaged: use in-process restart to keep custom supervisor PID tracking stable"
	};
}
/**
* Update restarts must replace the OS process so the new code runs from a
* fresh module graph after package files have changed on disk.
*
* Unlike the generic restart path, update mode allows detached respawn on
* unmanaged Windows installs because there is no safe in-process fallback once
* the installed package contents have been replaced.
*/
function respawnGatewayProcessForUpdate(opts = {}) {
	if (isTruthy(process.env.OPENCLAW_NO_RESPAWN)) return {
		mode: "disabled",
		detail: "OPENCLAW_NO_RESPAWN"
	};
	const supervisor = detectRespawnSupervisor(process.env);
	if (supervisor) {
		if (supervisor === "schtasks") {
			const restart = triggerOpenClawRestart();
			if (!restart.ok) return {
				mode: "failed",
				detail: restart.detail ?? `${restart.method} restart failed`
			};
		}
		return { mode: "supervised" };
	}
	try {
		const { child, pid } = spawnDetachedGatewayProcess(opts);
		return {
			mode: "spawned",
			pid,
			child
		};
	} catch (err) {
		return {
			mode: "failed",
			detail: formatErrorMessage(err)
		};
	}
}
//#endregion
export { abortEmbeddedAgentRun, consumeGatewayRestartIntentPayloadSync, consumeGatewayRestartIntentSync, consumeGatewaySigusr1RestartAuthorization, consumeGatewaySigusr1RestartIntent, detectRespawnSupervisor, getActiveEmbeddedRunCount, getActiveTaskCount, getInspectableActiveTaskRestartBlockers, getRuntimeConfig, isGatewaySigusr1RestartExternallyAllowed, listActiveEmbeddedRunSessionIds, listActiveEmbeddedRunSessionKeys, markGatewayDraining, markGatewaySigusr1RestartHandled, markRestartAbortedMainSessions, markUpdateRestartSentinelFailure, peekGatewaySigusr1RestartReason, reloadTaskRegistryFromStore, resetAllLanes, resetGatewayRestartStateForInProcessRestart, resolveGatewayRestartDeferralTimeoutMs, respawnGatewayProcessForUpdate, restartGatewayProcessWithFreshPid, scheduleGatewaySigusr1Restart, waitForActiveEmbeddedRuns, waitForActiveTasks, writeDiagnosticStabilityBundleForFailureSync, writeGatewayRestartHandoffSync };
