import { c as normalizeOptionalString } from "./string-coerce-mnp54Vah.js";
import "./string-coerce-runtime-CEGJWkQ_.js";
import { u as ssrfPolicyFromDangerouslyAllowPrivateNetwork } from "./ssrf-policy-sZLyyYht.js";
import "./ssrf-runtime-BOGN5pUi.js";
import { t as resolveValidatedMatrixHomeserverUrl } from "./url-validation-Ck23jxmT.js";
import { n as maybeMigrateLegacyStorage, o as resolveMatrixStoragePaths, s as writeStorageMeta } from "./storage-6UUh27xf.js";
import "./config-BKydsp1f.js";
import fs from "node:fs";
//#region extensions/matrix/src/matrix/client/create-client.ts
let matrixCreateClientRuntimeDepsPromise;
async function loadMatrixCreateClientRuntimeDeps() {
	matrixCreateClientRuntimeDepsPromise ??= Promise.all([import("./sdk-ChGrWr0y.js"), import("./logging-2XoG6Avv.js")]).then(([sdkModule, loggingModule]) => ({
		MatrixClient: sdkModule.MatrixClient,
		ensureMatrixSdkLoggingConfigured: loggingModule.ensureMatrixSdkLoggingConfigured
	}));
	return await matrixCreateClientRuntimeDepsPromise;
}
async function createMatrixClient(params) {
	const { MatrixClient, ensureMatrixSdkLoggingConfigured } = await loadMatrixCreateClientRuntimeDeps();
	ensureMatrixSdkLoggingConfigured();
	const homeserver = await resolveValidatedMatrixHomeserverUrl(params.homeserver, { dangerouslyAllowPrivateNetwork: params.allowPrivateNetwork });
	const matrixClientUserId = normalizeOptionalString(params.userId);
	const userId = matrixClientUserId ?? "unknown";
	const storagePaths = params.persistStorage !== false ? resolveMatrixStoragePaths({
		homeserver,
		userId,
		accessToken: params.accessToken,
		accountId: params.accountId,
		deviceId: params.deviceId,
		env: process.env
	}) : null;
	if (storagePaths) {
		await maybeMigrateLegacyStorage({
			storagePaths,
			env: process.env
		});
		fs.mkdirSync(storagePaths.rootDir, { recursive: true });
		writeStorageMeta({
			storagePaths,
			homeserver,
			userId,
			accountId: params.accountId,
			deviceId: params.deviceId
		});
	}
	const cryptoDatabasePrefix = storagePaths ? `openclaw-matrix-${storagePaths.accountKey}-${storagePaths.tokenHash}` : void 0;
	return new MatrixClient(homeserver, params.accessToken, {
		userId: matrixClientUserId,
		password: params.password,
		deviceId: params.deviceId,
		encryption: params.encryption,
		localTimeoutMs: params.localTimeoutMs,
		initialSyncLimit: params.initialSyncLimit,
		storageRootDir: storagePaths?.rootDir,
		recoveryKeyPath: storagePaths?.recoveryKeyPath,
		idbSnapshotPath: storagePaths?.idbSnapshotPath,
		cryptoDatabasePrefix,
		autoBootstrapCrypto: params.autoBootstrapCrypto,
		ssrfPolicy: params.ssrfPolicy ?? ssrfPolicyFromDangerouslyAllowPrivateNetwork(params.allowPrivateNetwork),
		dispatcherPolicy: params.dispatcherPolicy
	});
}
//#endregion
export { createMatrixClient as t };
