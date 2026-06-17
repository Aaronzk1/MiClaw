import { d as inspectProviderToolSchemasWithPlugin, g as normalizeProviderToolSchemasWithPlugin } from "./provider-runtime-CJtW0nDR.js";
import { t as log } from "./logger-B8odRltZ.js";
//#region src/agents/embedded-agent-runner/tool-schema-runtime.ts
function buildProviderToolSchemaContext(params, provider) {
	return {
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env,
		provider,
		modelId: params.modelId,
		modelApi: params.modelApi,
		model: params.model,
		tools: params.tools
	};
}
/**
* Runs provider-owned tool-schema normalization without encoding provider
* families in the embedded runner.
*/
function normalizeProviderToolSchemas(params) {
	const provider = params.provider.trim();
	const pluginNormalized = normalizeProviderToolSchemasWithPlugin({
		provider,
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env,
		runtimeHandle: params.runtimeHandle,
		allowRuntimePluginLoad: params.allowRuntimePluginLoad,
		context: buildProviderToolSchemaContext(params, provider)
	});
	return Array.isArray(pluginNormalized) ? pluginNormalized : params.tools;
}
/**
* Logs provider-owned tool-schema diagnostics after normalization.
*/
function logProviderToolSchemaDiagnostics(params) {
	const provider = params.provider.trim();
	const diagnostics = inspectProviderToolSchemasWithPlugin({
		provider,
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env,
		runtimeHandle: params.runtimeHandle,
		allowRuntimePluginLoad: params.allowRuntimePluginLoad,
		context: buildProviderToolSchemaContext(params, provider)
	});
	if (!Array.isArray(diagnostics)) return;
	if (diagnostics.length === 0) return;
	const summary = summarizeProviderToolSchemaDiagnostics(diagnostics);
	log.warn(`provider tool schema diagnostics: ${diagnostics.length} ${diagnostics.length === 1 ? "tool" : "tools"} for ${params.provider}: ${summary}`, {
		provider: params.provider,
		toolCount: params.tools.length,
		diagnosticCount: diagnostics.length,
		tools: params.tools.map((tool, index) => `${index}:${tool.name}`),
		diagnostics: diagnostics.map((diagnostic) => ({
			index: diagnostic.toolIndex,
			tool: diagnostic.toolName,
			violations: diagnostic.violations.slice(0, 12),
			violationCount: diagnostic.violations.length
		}))
	});
}
function summarizeProviderToolSchemaDiagnostics(diagnostics) {
	const visible = diagnostics.slice(0, 6).map((diagnostic) => {
		const violationCount = diagnostic.violations.length;
		return `${diagnostic.toolName || "unknown"} (${violationCount} ${violationCount === 1 ? "violation" : "violations"})`;
	});
	const remaining = diagnostics.length - visible.length;
	return remaining > 0 ? `${visible.join(", ")}, +${remaining} more` : visible.join(", ");
}
//#endregion
//#region src/agents/tool-schema-projection.ts
function unreadableRuntimeToolEntry(toolIndex) {
	return {
		ok: false,
		diagnostic: {
			toolName: `tool[${toolIndex}]`,
			toolIndex,
			violations: [`tool[${toolIndex}] is unreadable`]
		}
	};
}
function readRuntimeToolEntries(tools) {
	let length;
	try {
		length = tools.length;
	} catch {
		return [unreadableRuntimeToolEntry(0)];
	}
	const entries = [];
	for (let toolIndex = 0; toolIndex < length; toolIndex += 1) try {
		entries.push({
			ok: true,
			tool: tools[toolIndex],
			toolIndex
		});
	} catch {
		entries.push(unreadableRuntimeToolEntry(toolIndex));
	}
	return entries;
}
function readToolProjectionField(tool, field) {
	try {
		return {
			readable: true,
			value: tool[field]
		};
	} catch {
		return { readable: false };
	}
}
function isJsonValue(value) {
	if (value === null) return true;
	switch (typeof value) {
		case "boolean":
		case "number":
		case "string": return true;
		case "object":
			if (Array.isArray(value)) return value.every(isJsonValue);
			return Object.values(value).every(isJsonValue);
		default: return false;
	}
}
function isJsonObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function serializeToolInputSchema(value, path) {
	let text;
	try {
		text = JSON.stringify(value);
	} catch {
		return {
			schema: {},
			violations: [`${path} is not JSON-serializable`]
		};
	}
	if (!text) return {
		schema: {},
		violations: [`${path} is not JSON-serializable`]
	};
	const parsed = JSON.parse(text);
	if (!isJsonValue(parsed)) return {
		schema: {},
		violations: [`${path} is not a JSON value`]
	};
	return {
		schema: parsed,
		violations: []
	};
}
function findDynamicSchemaKeywordViolations(schema, path) {
	if (Array.isArray(schema)) return schema.flatMap((entry, index) => findDynamicSchemaKeywordViolations(entry, `${path}[${index}]`));
	if (!isJsonObject(schema)) return [];
	const violations = [];
	for (const key of ["$dynamicRef", "$dynamicAnchor"]) if (key in schema) violations.push(`${path}.${key}`);
	for (const [key, value] of Object.entries(schema)) {
		if (!value || typeof value !== "object") continue;
		if (schemaMapKeywords.has(key) && isJsonObject(value)) for (const [schemaName, childSchema] of Object.entries(value)) violations.push(...findDynamicSchemaKeywordViolations(childSchema, `${path}.${key}.${schemaName}`));
		else violations.push(...findDynamicSchemaKeywordViolations(value, `${path}.${key}`));
	}
	return violations;
}
const schemaMapKeywords = new Set([
	"$defs",
	"definitions",
	"dependencies",
	"dependentSchemas",
	"patternProperties",
	"properties"
]);
/** Projects one runtime tool input schema to JSON and reports runtime incompatibilities. */
function projectRuntimeToolInputSchema(schema, path = "parameters") {
	const projection = serializeToolInputSchema(schema, path);
	const violations = [...projection.violations];
	if (!isJsonObject(projection.schema)) violations.push(`${path} must be a JSON object schema`);
	else if (projection.schema.type !== void 0 && projection.schema.type !== "object") violations.push(`${path}.type must be "object"`);
	violations.push(...findDynamicSchemaKeywordViolations(projection.schema, path));
	return {
		schema: projection.schema,
		violations
	};
}
function inspectToolSchema(tool, toolIndex, mode) {
	const nameRead = readToolProjectionField(tool, "name");
	const toolName = nameRead.readable && typeof nameRead.value === "string" && nameRead.value ? nameRead.value : `tool[${toolIndex}]`;
	const descriptorViolations = nameRead.readable ? [] : [`${toolName}.name is unreadable`];
	const parametersRead = readToolProjectionField(tool, "parameters");
	if (!parametersRead.readable) return {
		toolName,
		toolIndex,
		violations: [...descriptorViolations, `${toolName}.parameters is unreadable`]
	};
	if (mode === "provider-normalizable" && parametersRead.value === void 0) return descriptorViolations.length > 0 ? {
		toolName,
		toolIndex,
		violations: descriptorViolations
	} : void 0;
	const schemaPath = `${toolName}.parameters`;
	const projection = projectRuntimeToolInputSchema(parametersRead.value, schemaPath);
	const projectionViolations = mode === "runtime" ? projection.violations : projection.violations.filter((violation) => violation !== `${schemaPath}.$dynamicRef` && violation !== `${schemaPath}.$dynamicAnchor` && !violation.endsWith(".$dynamicRef") && !violation.endsWith(".$dynamicAnchor"));
	const violations = [...descriptorViolations, ...projectionViolations];
	return violations.length > 0 ? {
		toolName,
		toolIndex,
		violations
	} : void 0;
}
function inspectToolEntries(entries, mode) {
	const diagnostics = [];
	const compatibleTools = [];
	for (const entry of entries) {
		if (!entry.ok) {
			diagnostics.push(entry.diagnostic);
			continue;
		}
		const diagnostic = inspectToolSchema(entry.tool, entry.toolIndex, mode);
		if (diagnostic) {
			diagnostics.push(diagnostic);
			continue;
		}
		compatibleTools.push(entry.tool);
	}
	return {
		tools: compatibleTools,
		diagnostics
	};
}
/** Inspects runtime tool schemas and returns diagnostics without filtering tools. */
function inspectRuntimeToolInputSchemas(tools) {
	return [...inspectToolEntries(readRuntimeToolEntries(tools), "runtime").diagnostics];
}
/** Filters tools to those with schemas accepted by the runtime as-is. */
function filterRuntimeCompatibleTools(tools) {
	return inspectToolEntries(readRuntimeToolEntries(tools), "runtime");
}
/** Filters tools to those that providers can normalize before dispatch. */
function filterProviderNormalizableTools(tools) {
	return inspectToolEntries(readRuntimeToolEntries(tools), "provider-normalizable");
}
//#endregion
export { logProviderToolSchemaDiagnostics as a, projectRuntimeToolInputSchema as i, filterRuntimeCompatibleTools as n, normalizeProviderToolSchemas as o, inspectRuntimeToolInputSchemas as r, filterProviderNormalizableTools as t };
