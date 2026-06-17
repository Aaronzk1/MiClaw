import { t as inspectDiscordAccount } from "./account-inspect-DVZXXjia.js";
import { O as fetchChannelPermissionsDiscord } from "./send.shared-SdWkx4sF.js";
import "./send-DU6EOsCH.js";
import { n as collectDiscordAuditChannelIdsForAccount, t as auditDiscordChannelPermissionsWithFetcher } from "./audit-core-BK6RTSya.js";
//#region extensions/discord/src/audit.ts
function collectDiscordAuditChannelIds(params) {
	return collectDiscordAuditChannelIdsForAccount(inspectDiscordAccount({
		cfg: params.cfg,
		accountId: params.accountId
	}).config);
}
async function auditDiscordChannelPermissions(params) {
	return await auditDiscordChannelPermissionsWithFetcher({
		...params,
		fetchChannelPermissions: fetchChannelPermissionsDiscord
	});
}
//#endregion
export { collectDiscordAuditChannelIds as n, auditDiscordChannelPermissions as t };
