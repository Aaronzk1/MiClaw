import { n as resolveGlobalSingleton } from "./global-singleton-PwlQSEal.js";
//#region src/cron/active-jobs.ts
/** Tracks in-process cron executions so schedulers and wake paths avoid duplicate runs. */
const CRON_ACTIVE_JOB_STATE_KEY = Symbol.for("openclaw.cron.activeJobs");
function getCronActiveJobState() {
	return resolveGlobalSingleton(CRON_ACTIVE_JOB_STATE_KEY, () => ({ activeJobIds: /* @__PURE__ */ new Set() }));
}
/** Marks a cron job id as currently executing for duplicate-run suppression. */
function markCronJobActive(jobId) {
	if (!jobId) return;
	getCronActiveJobState().activeJobIds.add(jobId);
}
/** Clears the active marker when a cron run exits or is abandoned. */
function clearCronJobActive(jobId) {
	if (!jobId) return;
	getCronActiveJobState().activeJobIds.delete(jobId);
}
/** Returns whether the given cron job id is currently executing in this process. */
function isCronJobActive(jobId) {
	if (!jobId) return false;
	return getCronActiveJobState().activeJobIds.has(jobId);
}
/** Returns whether any cron run is active in this process. */
function hasActiveCronJobs() {
	return getCronActiveJobState().activeJobIds.size > 0;
}
//#endregion
export { markCronJobActive as i, hasActiveCronJobs as n, isCronJobActive as r, clearCronJobActive as t };
