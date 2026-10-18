import assert from "node:assert/strict";
import { createFleetCapacitySampler } from "./fleet-capacity.ts";
const sample=createFleetCapacitySampler();
const first=sample();
assert(first && first.memoryTotalMB>=first.memoryAvailableMB && first.memoryAvailableMB>=0);
const second=sample();
assert(second && second.observedAt);
if(second.cpuPercent!==undefined)assert(second.cpuPercent>=0 && second.cpuPercent<=100);
console.log("Node fleet OS metrics tests passed");
