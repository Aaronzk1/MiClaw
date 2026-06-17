import { n as modelKey } from "./model-ref-shared-CqcindZs.js";
import { p as isLocalBaseUrl } from "./shared-B3B7qn2l.js";
//#region src/commands/models/list.model-row.ts
/** Converts registry/catalog models into printable model-list rows. */
/** Builds a display row, preserving configured tags and alias metadata. */
function toModelRow(params) {
	const { model, key, tags, aliases = [], availableKeys, allowProviderAvailabilityFallback = false } = params;
	if (!model) return {
		key,
		name: key,
		input: "-",
		contextWindow: null,
		local: null,
		available: null,
		tags: [...tags, "missing"],
		missing: true
	};
	const input = model.input.join("+") || "text";
	const local = isLocalBaseUrl(model.baseUrl ?? "");
	const modelIsAvailable = availableKeys?.has(modelKey(model.provider, model.id)) ?? false;
	const available = availableKeys !== void 0 && !allowProviderAvailabilityFallback ? modelIsAvailable : modelIsAvailable || (params.hasAuthForProvider?.(model.provider) ?? false);
	const aliasTags = aliases.length > 0 ? [`alias:${aliases.join(",")}`] : [];
	const mergedTags = new Set(tags);
	if (aliasTags.length > 0) {
		for (const tag of mergedTags) if (tag === "alias" || tag.startsWith("alias:")) mergedTags.delete(tag);
		for (const tag of aliasTags) mergedTags.add(tag);
	}
	return {
		key,
		name: model.name || model.id,
		input,
		contextWindow: model.contextWindow ?? null,
		...typeof model.contextTokens === "number" ? { contextTokens: model.contextTokens } : {},
		local,
		available,
		tags: Array.from(mergedTags),
		missing: false
	};
}
//#endregion
export { toModelRow as t };
