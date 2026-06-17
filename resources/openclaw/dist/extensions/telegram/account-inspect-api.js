import { t as inspectTelegramAccount } from "../../account-inspect-BHv-ag3o.js";
//#region extensions/telegram/account-inspect-api.ts
function inspectTelegramReadOnlyAccount(cfg, accountId) {
	return inspectTelegramAccount({
		cfg,
		accountId
	});
}
//#endregion
export { inspectTelegramReadOnlyAccount };
