import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, before } from "node:test";

import {
  arrange,
  config,
  generate,
  improvisations,
  listRagas,
  listTaals,
  loadData,
  parseIntent,
  ragaDetail,
  validateSequence,
} from "../../src/raga_composer/static/js/core/index.js";
import { tokenize, Swara } from "../../src/raga_composer/static/js/core/notation.js";

const ROOT = new URL("../..", import.meta.url).pathname;

async function readJson(path) {
  return JSON.parse(await readFile(join(ROOT, path), "utf-8"));
}

async function fetchJson(path) {
  if (path === "data/ragas.json") return readJson("src/raga_composer/data/ragas.json");
  if (path === "data/compositions.json") return readJson("src/raga_composer/data/compositions.json");
  if (path === "data/taals.json") return readJson("tests/js/fixtures/taals.json");
  throw new Error(`Unexpected data path: ${path}`);
}

function notes(tokens) {
  return tokenize(tokens.join(" ")).filter((token) => token instanceof Swara);
}

function assertNoViolations(raga, tokens) {
  const result = validateSequence({ raga, tokens });
  assert.deepEqual(result.violations, [], `${raga}: ${tokens.join(" ")}`);
}

before(async () => {
  await loadData(fetchJson);
});

describe("fixture parity", () => {
  it("matches tokenization fixtures", async () => {
    const fixtures = await readJson("tests/js/fixtures/tokens.json");
    for (const fixture of fixtures) {
      if (fixture.error) {
        assert.throws(() => validateSequence({ raga: "Yaman", tokens: fixture.text }), { message: fixture.error, status: 422 });
      } else {
        assert.deepEqual(tokenize(fixture.text).map(String), fixture.tokens);
      }
    }
  });

  it("matches reference data fixtures", async () => {
    const fixtures = await readJson("tests/js/fixtures/ragas.json");
    assert.deepEqual(listRagas(), fixtures.list);
    for (const [name, detail] of Object.entries(fixtures.details)) {
      assert.deepEqual(ragaDetail(name), detail);
    }
    assert.deepEqual(listTaals(), await readJson("tests/js/fixtures/taals.json"));
    assert.deepEqual(config(), await readJson("tests/js/fixtures/config.json"));
  });

  it("matches intent fixtures", async () => {
    const fixtures = await readJson("tests/js/fixtures/intents.json");
    for (const fixture of fixtures) {
      assert.deepEqual(parseIntent(fixture.request), fixture.response);
    }
  });

  it("matches validation fixtures", async () => {
    const fixtures = await readJson("tests/js/fixtures/validation.json");
    for (const fixture of fixtures) {
      assert.deepEqual(validateSequence(fixture.request), fixture.response);
    }
  });

  it("matches arrange fixtures", async () => {
    const fixtures = await readJson("tests/js/fixtures/arrange.json");
    for (const fixture of fixtures) {
      assert.deepEqual(arrange(fixture.request), fixture.response);
    }
  });
});

describe("generation properties", () => {
  it("generates valid seeded patterns for every raga and taal", () => {
    const ragas = listRagas();
    const taals = listTaals();
    assert.equal(ragas.length, 93);
    for (const raga of ragas) {
      for (const taal of taals) {
        const response = generate({
          raga: raga.name,
          text: `ascending ending on S in ${taal.name}`,
          seed: taal.beats,
        });
        assert.equal(response.intention.beats, taal.beats);
        assert.equal(response.intention.taal, taal.name);
        for (const pattern of response.patterns) {
          assert.equal(pattern.notes_per_beat, response.intention.notes_per_beat);
          assert.equal(pattern.tokens.length, response.intention.beats * response.intention.notes_per_beat);
          assertNoViolations(raga.name, pattern.tokens);
          const swaras = notes(pattern.tokens);
          assert.equal(swaras.at(-1).semitone, 0);
          assert.ok(swaras.at(-1).pitch >= swaras[0].pitch, `${raga.name} ${taal.name}: ${pattern.tokens.join(" ")}`);
        }
        assert.deepEqual(
          generate({ raga: raga.name, text: `ascending ending on S in ${taal.name}`, seed: 123 }),
          generate({ raga: raga.name, text: `ascending ending on S in ${taal.name}`, seed: 123 }),
        );
      }
    }
  });
});

describe("improvisation properties", () => {
  it("builds valid seeded improvisation groups for every raga and taal", () => {
    const expected = {
      "sthayi-alaap": { short: 5, avartan: 2 },
      "antara-alaap": { short: 5, avartan: 2 },
      "sthayi-taan": { short: 5, double: 2 },
      "antara-taan": { short: 5, double: 2 },
    };
    for (const raga of listRagas()) {
      for (const taal of listTaals()) {
        const response = improvisations(raga.name, { taal: taal.name, seed: taal.beats });
        assert.equal(response.raga, raga.name);
        assert.equal(response.taal, taal.name);
        assert.equal(response.taal_beats, taal.beats);
        assert.deepEqual(response.groups.map((group) => group.key), Object.keys(expected));
        for (const group of response.groups) {
          const counts = {};
          for (const item of group.items) {
            counts[item.kind] = (counts[item.kind] ?? 0) + 1;
            assert.equal(item.tokens.length, item.beats * item.notes_per_beat);
            assertNoViolations(raga.name, item.tokens);
            const lastNote = item.tokens.filter((token) => token !== "_" && token !== "-").at(-1);
            assert.equal(lastNote, group.key.startsWith("sthayi") ? "S" : "S'");
            if (item.kind === "avartan") assert.equal(item.beats, taal.beats);
            if (item.kind === "double") assert.equal(item.beats, taal.beats * 2);
          }
          assert.deepEqual(counts, expected[group.key]);
          assert.equal(new Set(group.items.map((item) => item.tokens.join(" "))).size, group.items.length);
        }
        assert.deepEqual(
          improvisations(raga.name, { taal: taal.name, seed: 99 }),
          improvisations(raga.name, { taal: taal.name, seed: 99 }),
        );
      }
    }
  });
});
