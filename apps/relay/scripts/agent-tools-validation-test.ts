// Tests for agent tool argument parsing, boundary clamping, and input validation
// in tasks/agent-tools.ts.
import assert from "node:assert/strict";
import { validateAgentToolArguments } from "../src/tasks/agent-tools.js";

// 1. list_directory
const listValid = validateAgentToolArguments("list_directory", { path: "/workspace", depth: 3 });
assert.deepEqual(listValid, { path: "/workspace", depth: 3 });

// Clamps depth between 1 and 6, defaults to 2
assert.equal(validateAgentToolArguments("list_directory", { path: "/w", depth: 0 }).depth, 1);
assert.equal(validateAgentToolArguments("list_directory", { path: "/w", depth: 10 }).depth, 6);
assert.equal(validateAgentToolArguments("list_directory", { path: "/w" }).depth, 2);
assert.equal(validateAgentToolArguments("list_directory", { path: "/w", depth: "invalid" }).depth, 2);

// Missing or invalid path throws
assert.throws(() => validateAgentToolArguments("list_directory", { path: "" }), /path is invalid/);
assert.throws(() => validateAgentToolArguments("list_directory", { path: "   " }), /path is invalid/);
assert.throws(() => validateAgentToolArguments("list_directory", { path: "a".repeat(1001) }), /path is invalid/);

// 2. read_file
const readValid = validateAgentToolArguments("read_file", { path: "/f.txt", offset: 10, length: 500 });
assert.deepEqual(readValid, { path: "/f.txt", offset: 10, length: 500 });

// Length defaults to 240, clamped to max 1200
assert.equal(validateAgentToolArguments("read_file", { path: "/f.txt" }).length, 240);
assert.equal(validateAgentToolArguments("read_file", { path: "/f.txt", length: 5000 }).length, 1200);
assert.equal(validateAgentToolArguments("read_file", { path: "/f.txt", length: -5 }).length, 240);

// 3. read_binary_file
const binaryValid = validateAgentToolArguments("read_binary_file", {
  path: "/bin",
  offset: 128,
  length: 1000,
  expected_revision: "rev-abc",
});
assert.deepEqual(binaryValid, {
  path: "/bin",
  offset: 128,
  length: 1000,
  expected_revision: "rev-abc",
});

// Clamping defaults: offset 0, length 65536, max length 262144
const binaryClamped = validateAgentToolArguments("read_binary_file", { path: "/bin", offset: -10, length: 500000 });
assert.equal(binaryClamped.offset, 0);
assert.equal(binaryClamped.length, 262144);

// 4. get_file_info
assert.deepEqual(validateAgentToolArguments("get_file_info", { path: "/f" }), { path: "/f" });

// 5. write_file
const writeValid = validateAgentToolArguments("write_file", { path: "/f", content: "hello", mode: "append" });
assert.deepEqual(writeValid, { path: "/f", content: "hello", mode: "append" });

// Mode defaults to rewrite
assert.equal(validateAgentToolArguments("write_file", { path: "/f", content: "hello" }).mode, "rewrite");

// Content too large or non-string throws
assert.throws(() => validateAgentToolArguments("write_file", { path: "/f", content: 123 }), /content is invalid/);
assert.throws(() => validateAgentToolArguments("write_file", { path: "/f", content: "a".repeat(200001) }), /content is invalid or too large/);

// 6. edit_block
const editValid = validateAgentToolArguments("edit_block", {
  file_path: "/f",
  old_string: "foo",
  new_string: "bar",
  expected_replacements: 3,
});
assert.deepEqual(editValid, {
  file_path: "/f",
  old_string: "foo",
  new_string: "bar",
  expected_replacements: 3,
});

// Clamping expected_replacements between 1 and 20, default 1
assert.equal(validateAgentToolArguments("edit_block", { file_path: "/f", old_string: "a", new_string: "b" }).expected_replacements, 1);
assert.equal(validateAgentToolArguments("edit_block", { file_path: "/f", old_string: "a", new_string: "b", expected_replacements: 100 }).expected_replacements, 20);

// Oversized string throws
assert.throws(() => validateAgentToolArguments("edit_block", { file_path: "/f", old_string: "a".repeat(200001), new_string: "b" }), /edit_block content is invalid or too large/);

// 7. Command execution
const cmdValid = validateAgentToolArguments("start_process" as never, { command: "npm test", cwd: "/app" });
assert.deepEqual(cmdValid, { command: "npm test", cwd: "/app", background: true });

// Optional cwd omitted when blank or undefined
assert.deepEqual(
  validateAgentToolArguments("start_process" as never, { command: "npm test", cwd: "" }),
  { command: "npm test", background: true },
);
assert.throws(() => validateAgentToolArguments("start_process" as never, { command: "" }), /command is invalid/);
assert.throws(() => validateAgentToolArguments("start_process" as never, { command: "a".repeat(4001) }), /command is invalid/);

console.log("PASS: agent tool argument validation, boundary clamping and input bounds checking");
