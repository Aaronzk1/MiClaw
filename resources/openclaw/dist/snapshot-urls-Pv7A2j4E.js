import { a as normalizeLowercaseStringOrEmpty, c as normalizeOptionalString } from "./string-coerce-mnp54Vah.js";
import "./string-coerce-runtime-CEGJWkQ_.js";
import { _ as INTERACTIVE_ROLES, g as CONTENT_ROLES, v as STRUCTURAL_ROLES } from "./chrome-BWowRFBm.js";
import { Script } from "node:vm";
//#region extensions/browser/src/browser/evaluate-source.ts
const FUNCTION_SOURCE_PATTERN = /^(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/;
const EXPRESSION_RESULT_NAME = "__openclawEvaluateExpressionResult";
function canParseAsExpression(source) {
	try {
		new Script(`"use strict";\n(${source});`);
		return true;
	} catch {
		return false;
	}
}
function normalizeBrowserEvaluateFunctionSource(source, params = {}) {
	const trimmed = source.trim();
	if (!trimmed) return "";
	if (FUNCTION_SOURCE_PATTERN.test(trimmed) && canParseAsExpression(trimmed)) return trimmed;
	const argumentName = params.argumentName;
	const args = argumentName ? `(${argumentName})` : "()";
	if (canParseAsExpression(trimmed)) {
		const invokeArgs = argumentName ? argumentName : "";
		return [
			`${args} => {`,
			`const ${EXPRESSION_RESULT_NAME} = (${trimmed});`,
			`return typeof ${EXPRESSION_RESULT_NAME} === "function" ? ${EXPRESSION_RESULT_NAME}(${invokeArgs}) : ${EXPRESSION_RESULT_NAME};`,
			"}"
		].join("\n");
	}
	return `async ${args} => {\n${trimmed}\n}`;
}
//#endregion
//#region extensions/browser/src/browser/url-pattern.ts
/**
* URL pattern matching for Browser response and wait tools.
*/
function wildcardPatternToRegExp(pattern) {
	let source = "^";
	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index] ?? "";
		if (char === "*") {
			if (pattern[index + 1] === "*") {
				source += ".*";
				index += 1;
			} else source += "[^/]*";
			continue;
		}
		source += char.replace(/[\\^$+?.()|[\]{}]/gu, "\\$&");
	}
	source += "$";
	return new RegExp(source, "u");
}
/** Matches exact, wildcard, or substring URL patterns against a browser URL. */
function matchBrowserUrlPattern(pattern, url) {
	const trimmedPattern = pattern.trim();
	if (!trimmedPattern) return false;
	if (trimmedPattern === url) return true;
	if (trimmedPattern === "*") return true;
	if (trimmedPattern.includes("*")) return wildcardPatternToRegExp(trimmedPattern).test(url);
	return url.includes(trimmedPattern);
}
//#endregion
//#region extensions/browser/src/browser/form-fields.ts
/**
* Browser form field normalization.
*
* Converts model/client fill field payloads into the compact field shape used
* by Playwright and Chrome MCP fill actions.
*/
/** Default field type for fill actions when no type is provided. */
const DEFAULT_FILL_FIELD_TYPE = "text";
function normalizeBrowserFormFieldRef(value) {
	return normalizeOptionalString(value) ?? "";
}
function normalizeBrowserFormFieldType(value) {
	return (normalizeOptionalString(value) ?? "") || "text";
}
/** Normalize a form field value to the types accepted by fill actions. */
function normalizeBrowserFormFieldValue(value) {
	return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : void 0;
}
/** Normalize one form field descriptor from untrusted route/tool input. */
function normalizeBrowserFormField(record) {
	const ref = normalizeBrowserFormFieldRef(record.ref);
	if (!ref) return null;
	const type = normalizeBrowserFormFieldType(record.type);
	const value = normalizeBrowserFormFieldValue(record.value);
	return value === void 0 ? {
		ref,
		type
	} : {
		ref,
		type,
		value
	};
}
//#endregion
//#region extensions/browser/src/browser/pw-role-snapshot.ts
/**
* Playwright role snapshot helpers.
*
* Converts ARIA or AI snapshots into compact role/name text with stable refs
* and duplicate disambiguation for agent actions.
*/
/** Compute snapshot line/char/ref statistics. */
function getRoleSnapshotStats(snapshot, refs) {
	const interactive = Object.values(refs).filter((r) => INTERACTIVE_ROLES.has(r.role)).length;
	return {
		lines: snapshot.split("\n").length,
		chars: snapshot.length,
		refs: Object.keys(refs).length,
		interactive
	};
}
function getIndentLevel(line) {
	const match = line.match(/^(\s*)/);
	return match ? Math.floor(match[1].length / 2) : 0;
}
function matchInteractiveSnapshotLine(line, options) {
	const depth = getIndentLevel(line);
	if (options.maxDepth !== void 0 && depth > options.maxDepth) return null;
	const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
	if (!match) return null;
	const roleRaw = match[2];
	const name = match[3];
	const suffix = match[4];
	if (roleRaw.startsWith("/")) return null;
	return {
		roleRaw,
		role: normalizeLowercaseStringOrEmpty(roleRaw),
		...name ? { name } : {},
		suffix
	};
}
function createRoleNameTracker() {
	const counts = /* @__PURE__ */ new Map();
	const refsByKey = /* @__PURE__ */ new Map();
	return {
		counts,
		refsByKey,
		getKey(role, name) {
			return `${role}:${name ?? ""}`;
		},
		getNextIndex(role, name) {
			const key = this.getKey(role, name);
			const current = counts.get(key) ?? 0;
			counts.set(key, current + 1);
			return current;
		},
		trackRef(role, name, ref) {
			const key = this.getKey(role, name);
			const list = refsByKey.get(key) ?? [];
			list.push(ref);
			refsByKey.set(key, list);
		},
		getDuplicateKeys() {
			const out = /* @__PURE__ */ new Set();
			for (const [key, refs] of refsByKey) if (refs.length > 1) out.add(key);
			return out;
		}
	};
}
function removeNthFromNonDuplicates(refs, tracker) {
	const duplicates = tracker.getDuplicateKeys();
	for (const [ref, data] of Object.entries(refs)) {
		const key = tracker.getKey(data.role, data.name);
		if (!duplicates.has(key)) delete refs[ref]?.nth;
	}
}
function compactTree(tree) {
	const lines = tree.split("\n");
	const result = [];
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (line.includes("[ref=")) {
			result.push(line);
			continue;
		}
		if (line.includes(":") && !line.trimEnd().endsWith(":")) {
			result.push(line);
			continue;
		}
		const currentIndent = getIndentLevel(line);
		let hasRelevantChildren = false;
		for (let j = i + 1; j < lines.length; j += 1) {
			if (getIndentLevel(lines[j]) <= currentIndent) break;
			if (lines[j]?.includes("[ref=")) {
				hasRelevantChildren = true;
				break;
			}
		}
		if (hasRelevantChildren) result.push(line);
	}
	return result.join("\n");
}
function processLine(line, refs, options, tracker, nextRef) {
	const depth = getIndentLevel(line);
	if (options.maxDepth !== void 0 && depth > options.maxDepth) return null;
	const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
	if (!match) return options.interactive ? null : line;
	const [, prefix, roleRaw, name, suffix] = match;
	if (roleRaw.startsWith("/")) return options.interactive ? null : line;
	const role = normalizeLowercaseStringOrEmpty(roleRaw);
	const isInteractive = INTERACTIVE_ROLES.has(role);
	const isContent = CONTENT_ROLES.has(role);
	const isStructural = STRUCTURAL_ROLES.has(role);
	if (options.interactive && !isInteractive) return null;
	if (options.compact && isStructural && !name) return null;
	if (!(isInteractive || isContent && name)) return line;
	const ref = nextRef();
	const nth = tracker.getNextIndex(role, name);
	tracker.trackRef(role, name, ref);
	refs[ref] = {
		role,
		name,
		nth
	};
	let enhanced = `${prefix}${roleRaw}`;
	if (name) enhanced += ` "${name}"`;
	enhanced += ` [ref=${ref}]`;
	if (nth > 0) enhanced += ` [nth=${nth}]`;
	if (suffix) enhanced += suffix;
	return enhanced;
}
function buildInteractiveSnapshotLines(params) {
	const out = [];
	for (const line of params.lines) {
		const parsed = matchInteractiveSnapshotLine(line, params.options);
		if (!parsed) continue;
		if (!INTERACTIVE_ROLES.has(parsed.role)) continue;
		const resolved = params.resolveRef(parsed);
		if (!resolved?.ref) continue;
		params.recordRef(parsed, resolved.ref, resolved.nth);
		let enhanced = `- ${parsed.roleRaw}`;
		if (parsed.name) enhanced += ` "${parsed.name}"`;
		enhanced += ` [ref=${resolved.ref}]`;
		if ((resolved.nth ?? 0) > 0) enhanced += ` [nth=${resolved.nth}]`;
		if (params.includeSuffix(parsed.suffix)) enhanced += parsed.suffix;
		out.push(enhanced);
	}
	return out;
}
/** Normalize a role snapshot ref accepted by browser actions. */
function parseRoleRef(raw) {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed.startsWith("ref=") ? trimmed.slice(4) : trimmed;
	if (/^e\d+$/i.test(normalized)) return normalized;
	if (/^\d{1,9}$/.test(normalized)) return normalized;
	return null;
}
/** Build a role snapshot and refs from Playwright ARIA snapshot text. */
function buildRoleSnapshotFromAriaSnapshot(ariaSnapshot, options = {}) {
	const lines = ariaSnapshot.split("\n");
	const refs = {};
	const tracker = createRoleNameTracker();
	let counter = 0;
	const nextRef = () => {
		counter += 1;
		return `e${counter}`;
	};
	if (options.interactive) {
		const result = buildInteractiveSnapshotLines({
			lines,
			options,
			resolveRef: ({ role, name }) => {
				const ref = nextRef();
				const nth = tracker.getNextIndex(role, name);
				tracker.trackRef(role, name, ref);
				return {
					ref,
					nth
				};
			},
			recordRef: ({ role, name }, ref, nth) => {
				refs[ref] = {
					role,
					name,
					nth
				};
			},
			includeSuffix: (suffix) => suffix.includes("[")
		});
		removeNthFromNonDuplicates(refs, tracker);
		return {
			snapshot: result.join("\n") || "(no interactive elements)",
			refs
		};
	}
	const result = [];
	for (const line of lines) {
		const processed = processLine(line, refs, options, tracker, nextRef);
		if (processed !== null) result.push(processed);
	}
	removeNthFromNonDuplicates(refs, tracker);
	const tree = result.join("\n") || "(empty)";
	return {
		snapshot: options.compact ? compactTree(tree) : tree,
		refs
	};
}
function parseAiSnapshotRef(suffix) {
	const eMatch = suffix.match(/\[ref=(e\d+)\]/i);
	if (eMatch) return eMatch[1];
	const numMatch = suffix.match(/\[ref=(\d{1,9})\]/);
	return numMatch ? numMatch[1] : null;
}
/**
* Build a role snapshot from Playwright's AI snapshot output while preserving Playwright's own
* aria-ref ids (e.g. ref=e13). This makes the refs self-resolving across calls.
*/
/** Build a role snapshot and refs from Playwright AI snapshot text. */
function buildRoleSnapshotFromAiSnapshot(aiSnapshot, options = {}) {
	const lines = aiSnapshot.split("\n");
	const refs = {};
	if (options.interactive) return {
		snapshot: buildInteractiveSnapshotLines({
			lines,
			options,
			resolveRef: ({ suffix }) => {
				const ref = parseAiSnapshotRef(suffix);
				return ref ? { ref } : null;
			},
			recordRef: ({ role, name }, ref) => {
				refs[ref] = {
					role,
					...name ? { name } : {}
				};
			},
			includeSuffix: () => true
		}).join("\n") || "(no interactive elements)",
		refs
	};
	const out = [];
	for (const line of lines) {
		const depth = getIndentLevel(line);
		if (options.maxDepth !== void 0 && depth > options.maxDepth) continue;
		const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
		if (!match) {
			out.push(line);
			continue;
		}
		const roleRaw = match[2];
		const name = match[3];
		const suffix = match[4];
		if (roleRaw.startsWith("/")) {
			out.push(line);
			continue;
		}
		const role = normalizeLowercaseStringOrEmpty(roleRaw);
		const isStructural = STRUCTURAL_ROLES.has(role);
		if (options.compact && isStructural && !name) continue;
		const ref = parseAiSnapshotRef(suffix);
		if (ref) refs[ref] = {
			role,
			...name ? { name } : {}
		};
		out.push(line);
	}
	const tree = out.join("\n") || "(empty)";
	return {
		snapshot: options.compact ? compactTree(tree) : tree,
		refs
	};
}
//#endregion
//#region extensions/browser/src/browser/snapshot-urls.ts
/** Appends a compact numbered link list to a snapshot string. */
function appendSnapshotUrls(snapshot, urls) {
	if (urls.length === 0) return snapshot;
	return `${snapshot}\n\nLinks:\n${urls.map((entry, index) => `${index + 1}. ${entry.text} -> ${entry.url}`).join("\n")}`;
}
//#endregion
export { parseRoleRef as a, normalizeBrowserFormFieldValue as c, getRoleSnapshotStats as i, matchBrowserUrlPattern as l, buildRoleSnapshotFromAiSnapshot as n, DEFAULT_FILL_FIELD_TYPE as o, buildRoleSnapshotFromAriaSnapshot as r, normalizeBrowserFormField as s, appendSnapshotUrls as t, normalizeBrowserEvaluateFunctionSource as u };
