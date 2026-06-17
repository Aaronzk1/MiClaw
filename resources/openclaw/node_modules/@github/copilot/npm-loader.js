#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import{spawnSync as n}from"node:child_process";import{fileURLToPath as i}from"node:url";import{isNonGlibcLinuxSync as s}from"detect-libc";async function a(){for(const o of p())try{const t=i(import.meta.resolve(`@github/copilot-${o}-${process.arch}`)),e=n(t,process.argv.slice(2),{stdio:"inherit"});process.exit(c(e,t))}catch{}parseInt(process.versions.node.split(".")[0],10)<24&&(console.error(`GitHub Copilot CLI requires Node.js v24 or higher. Currently using v${process.versions.node}.`),process.exit(1));try{await import("./index.js")}catch(o){console.error("Failed to load GitHub Copilot CLI:",o),process.exit(1)}}a().catch(()=>{});function c(r,o){if(r.error)throw r.error;if(r.signal)throw process.stderr.write(`GitHub Copilot native binary at ${o} was terminated by signal ${r.signal}.
`),new Error(`Native binary terminated by signal ${r.signal}`);return r.status??1}function p(){return process.platform==="linux"?l()?["linuxmusl","linux"]:["linux"]:[process.platform]}function l(){return s()}export{c as handleSpawnResult};
