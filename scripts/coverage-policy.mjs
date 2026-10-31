// Measured on master c4bc77f, CI run 40998299997. Raise these floors as tests grow.
// Keep production source inclusion unchanged; --target remains a strict 90% check.
// Retiring the TypeScript runtime removed 125 mostly covered functions, leaving
// 1013 of 1341 covered (75.5%), so the TypeScript functions floor moved from 76 to 75.
// Relay coverage now measures test:coverage (the security suite plus the other relay
// suites CI runs) and new entry, device and organization tests: 89.24% lines, 82.65%
// branches and 96.56% functions, so its floors moved to 88/88/82/95.
export const COVERAGE_TARGET=90;
export const COVERAGE_FLOORS={
 typescript:{lines:50,statements:50,branches:80,functions:75},
 relay:{lines:90,statements:90,branches:83,functions:96},
 agent:{statements:78},
 core:{statements:90},
 apps:{lines:90,statements:90,branches:90,functions:90},
};
export function coverageThresholds(scope,strict=false){
 const floors=COVERAGE_FLOORS[scope];
 if(!floors)throw Error('Unknown coverage scope: '+scope);
 return Object.fromEntries(Object.entries(floors).map(([metric,value])=>[metric,strict?COVERAGE_TARGET:value]));
}
