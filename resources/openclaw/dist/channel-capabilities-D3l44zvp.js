import { r as getBundledChannelPlugin } from "./bundled-DcYUmgzC.js";
import { a as normalizeAnyChannelId } from "./registry-9YoS2BJP.js";
import { t as getChannelPlugin } from "./registry-MkxNn1Ue.js";
import "./plugins-t2ejWcVy.js";
import { t as findBundledPackageChannelMetadata } from "./bundled-package-channel-metadata-DcX8S5Zo.js";
//#region src/commands/doctor/channel-capabilities.ts
const DEFAULT_DOCTOR_CHANNEL_CAPABILITIES = {
	dmAllowFromMode: "topOnly",
	groupModel: "sender",
	groupAllowFromFallbackToAllowFrom: true,
	warnOnEmptyGroupSenderAllowlist: true
};
function mergeDoctorChannelCapabilities(capabilities) {
	return {
		dmAllowFromMode: capabilities?.dmAllowFromMode ?? DEFAULT_DOCTOR_CHANNEL_CAPABILITIES.dmAllowFromMode,
		groupModel: capabilities?.groupModel ?? DEFAULT_DOCTOR_CHANNEL_CAPABILITIES.groupModel,
		groupAllowFromFallbackToAllowFrom: capabilities?.groupAllowFromFallbackToAllowFrom ?? DEFAULT_DOCTOR_CHANNEL_CAPABILITIES.groupAllowFromFallbackToAllowFrom,
		warnOnEmptyGroupSenderAllowlist: capabilities?.warnOnEmptyGroupSenderAllowlist ?? DEFAULT_DOCTOR_CHANNEL_CAPABILITIES.warnOnEmptyGroupSenderAllowlist
	};
}
function getManifestDoctorCapabilities(channelId) {
	return findBundledPackageChannelMetadata(channelId)?.doctorCapabilities;
}
/** Resolve doctor behavior capabilities from channel metadata, plugin runtime, or defaults. */
function getDoctorChannelCapabilities(channelName) {
	if (!channelName) return DEFAULT_DOCTOR_CHANNEL_CAPABILITIES;
	const manifestCapabilities = getManifestDoctorCapabilities(channelName);
	if (manifestCapabilities) return mergeDoctorChannelCapabilities(manifestCapabilities);
	const channelId = normalizeAnyChannelId(channelName);
	if (!channelId) return DEFAULT_DOCTOR_CHANNEL_CAPABILITIES;
	const pluginDoctor = getChannelPlugin(channelId)?.doctor ?? getBundledChannelPlugin(channelId)?.doctor;
	if (pluginDoctor) return mergeDoctorChannelCapabilities(pluginDoctor);
	return mergeDoctorChannelCapabilities(getManifestDoctorCapabilities(channelId));
}
//#endregion
export { getDoctorChannelCapabilities as t };
