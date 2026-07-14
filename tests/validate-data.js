const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "buildings.json"), "utf8")
);
const nonBuildingRequirements = new Set([
  "food",
  "lumber",
  "stone",
  "ore",
  "gold",
  "special"
]);

assert.ok(Object.keys(data).length > 0, "Building data must not be empty");

for (const [building, levels] of Object.entries(data)) {
  const levelNumbers = Object.keys(levels).map(Number).sort((a, b) => a - b);
  assert.equal(levelNumbers[0], 1, `${building} must start at level 1`);

  for (let level = 1; level <= levelNumbers.at(-1); level += 1) {
    const entry = levels[level];
    assert.ok(entry, `${building} is missing level ${level}`);
    assert.ok(
      entry.requirements && typeof entry.requirements === "object",
      `${building} level ${level} is missing requirements`
    );

    for (const [requirement, requiredLevel] of Object.entries(entry.requirements)) {
      if (nonBuildingRequirements.has(requirement)) continue;

      assert.ok(
        data[requirement],
        `${building} level ${level} references unknown building ${requirement}`
      );
      assert.ok(
        data[requirement][requiredLevel],
        `${building} level ${level} references missing ${requirement} level ${requiredLevel}`
      );
    }
  }
}

console.log(`Validated ${Object.keys(data).length} buildings.`);
