import { beforeAll, describe, expect, test } from "bun:test";
import type { Word } from "@bankai/schemas";
import type { RawClaim } from "../src/models/extract";
import {
  findNames,
  ground,
  redactNames,
  scrubNames,
  vocabOf,
  type Vocab,
} from "../src/note/ground";
import { cleanWord, foldSpoken } from "../src/note/spoken";
import { loadMini } from "./helpers";

let vocab: Vocab;
beforeAll(async () => {
  vocab = vocabOf(await loadMini());
});

const words = (...t: string[]): Word[] =>
  t.map((text, i) => ({ i, text, start: i * 0.5, end: i * 0.5 + 0.4 }));

const claim = (over: Partial<RawClaim>): RawClaim => ({
  type: "status",
  word_start: 0,
  word_end: 0,
  tag: null,
  activity_id: null,
  status_value: null,
  location: null,
  delay_days: null,
  spoken_date: null,
  component: null,
  issue_kind: null,
  owner_role: null,
  text: "x",
  ...over,
});

const g = (c: RawClaim, w: Word[]) => ground(c, w, vocab, "n001.wav");
const dropped = (r: ReturnType<typeof g>) => ("dropped" in r ? r.dropped.reason : null);

describe("spoken", () => {
  test("cleanWord strips punctuation and lowercases", () => {
    expect(cleanWord(" GEN-3,")).toBe("gen-3");
    expect(cleanWord("B.")).toBe("b");
  });

  test("foldSpoken turns number words into digits and splits hyphens", () => {
    expect(foldSpoken(["Gen", "three"])).toEqual(["gen", "3"]);
    expect(foldSpoken(["twenty", "one", "days"])).toEqual(["21", "days"]);
    expect(foldSpoken(["gen-three."])).toEqual(["gen", "3"]);
    expect(foldSpoken(["elec", "zero", "two"])).toEqual(["elec", "0", "2"]);
  });
});

describe("ground", () => {
  const n001 = words("Gen", "three", "is", "set", "on", "pad", "B.");

  test("grounds a tag spoken as two words", () => {
    const r = g(claim({ tag: "GEN-3", status_value: "set", location: "PAD-B", word_end: 6 }), n001);
    if (!("claim" in r)) throw new Error(`dropped: ${dropped(r)}`);
    expect(r.claim.exact).toBe(false);
    expect(r.claim.span).toEqual({
      kind: "audio_span",
      ref: "n001.wav@0.0-3.4",
      quote: "Gen three is set on pad B.",
    });
  });

  test("one token GEN-3 with punctuation is exact", () => {
    const r = g(
      claim({ tag: "GEN-3", status_value: "set", word_end: 2 }),
      words("GEN-3,", "was", "set"),
    );
    expect("claim" in r && r.claim.exact).toBe(true);
  });

  test("generator number three grounds to GEN-3", () => {
    const r = g(
      claim({ tag: "GEN-3", status_value: "set", word_end: 4 }),
      words("generator", "number", "three", "is", "set"),
    );
    expect(dropped(r)).toBeNull();
  });

  test("gen tree is not GEN-3", () => {
    const r = g(
      claim({ tag: "GEN-3", status_value: "set", word_end: 3 }),
      words("gen", "tree", "is", "set"),
    );
    expect(dropped(r)).toBe("tag_not_in_span");
  });

  test("a tag outside the span is dropped", () => {
    const r = g(claim({ tag: "GEN-3", status_value: "set", word_start: 2, word_end: 3 }), n001);
    expect(dropped(r)).toBe("tag_not_in_span");
  });

  test("a location not spoken is dropped", () => {
    const r = g(claim({ tag: "GEN-3", status_value: "set", location: "PAD-C", word_end: 6 }), n001);
    expect(dropped(r)).toBe("location_not_in_span");
  });

  test("a delay needs its number next to days", () => {
    const w = words("load", "bank", "test", "is", "delayed", "three", "days");
    const c = (d: number) => claim({ type: "date_change", delay_days: d, word_end: 6 });
    expect(dropped(g(c(3), w))).toBeNull();
    expect(dropped(g(c(4), w))).toBe("number_not_in_span");
    const week = words("pushed", "a", "week");
    expect(dropped(g(claim({ type: "date_change", delay_days: 7, word_end: 2 }), week))).toBeNull();
  });

  test("an activity must be spoken", () => {
    const w = words("load", "bank", "test", "is", "delayed", "three", "days");
    const ok = claim({ type: "date_change", activity_id: "A30", delay_days: 3, word_end: 6 });
    expect(dropped(g(ok, w))).toBeNull();
    const wrong = claim({ type: "date_change", activity_id: "A10", delay_days: 3, word_end: 6 });
    expect(dropped(g(wrong, w))).toBe("activity_not_in_span");
  });

  test("a component must be spoken", () => {
    const w = words("the", "controls", "cabinet", "door", "is", "damaged");
    const c = (component: string) =>
      claim({ type: "issue", component, issue_kind: "damaged", word_end: 5 });
    expect(dropped(g(c("controls cabinet"), w))).toBeNull();
    expect(dropped(g(c("day tank"), w))).toBe("component_not_in_span");
  });

  test("a status verb must be spoken", () => {
    const w = words("gen", "three", "came", "in");
    expect(
      dropped(g(claim({ tag: "GEN-3", status_value: "delivered", word_end: 3 }), w)),
    ).toBeNull();
    expect(dropped(g(claim({ tag: "GEN-3", status_value: "installed", word_end: 3 }), w))).toBe(
      "verb_not_in_span",
    );
  });

  test("an owner that is not a spoken role id becomes null, claim kept", () => {
    const w = words("action", "for", "ELEC-02:", "confirm", "cable");
    const kept = g(claim({ type: "action_item", owner_role: "ELEC-02", word_end: 4 }), w);
    expect("claim" in kept && kept.claim.owner_role).toBe("ELEC-02");
    const spoken = g(
      claim({ type: "action_item", owner_role: "ELEC-02", word_end: 4 }),
      words("action", "for", "elec", "zero", "two"),
    );
    expect("claim" in spoken && spoken.claim.owner_role).toBe("ELEC-02");
    const name = g(claim({ type: "action_item", owner_role: "Ravi", word_end: 4 }), w);
    expect("claim" in name && name.claim.owner_role).toBeNull();
    const unspoken = g(claim({ type: "action_item", owner_role: "MECH-01", word_end: 4 }), w);
    expect("claim" in unspoken && unspoken.claim.owner_role).toBeNull();
  });

  test("a span of 61 words is span_too_long", () => {
    const w = words(...Array.from({ length: 70 }, () => "set"));
    expect(dropped(g(claim({ word_end: 60 }), w))).toBe("span_too_long");
  });

  test("a span past the last word is bad_span", () => {
    expect(dropped(g(claim({ word_end: 7 }), n001))).toBe("bad_span");
    expect(dropped(g(claim({ word_start: 3, word_end: 2 }), n001))).toBe("bad_span");
  });
});

describe("names", () => {
  const n003 = words(
    "Action",
    "for",
    "ELEC-02:",
    "confirm",
    "cable",
    "delivery",
    "by",
    "Friday.",
    "Ravi",
    "said",
    "the",
    "controls",
    "cabinet",
    "door",
    "is",
    "damaged.",
    "Ask",
    "Priya",
    "about",
    "Pad",
    "B",
    "and",
    "Cummins.",
  );

  test("findNames catches mid-sentence and speaker names, not vocab or weekdays", () => {
    expect([...findNames(n003, vocab)].sort()).toEqual(["priya", "ravi"]);
  });

  test("redactNames replaces names in the words", () => {
    const r = redactNames(n003, findNames(n003, vocab));
    expect(r[8]!.text).toBe("[name]");
    expect(r[17]!.text).toBe("[name]");
    expect(r[7]!.text).toBe("Friday.");
  });

  test("scrubNames removes names from text, keeps tags, places, makers and roles", () => {
    expect(
      scrubNames(
        "Ravi says GEN-3 door at Pad B by Cummins damaged, tell ELEC-02",
        new Set(["ravi"]),
      ),
    ).toBe("says GEN-3 door at Pad B by Cummins damaged, tell ELEC-02");
  });
});

describe("review fixes: grounding doubts", () => {
  test("a span naming two project tags is ambiguous", () => {
    const w = words(
      "GEN-3",
      "was",
      "delivered",
      "today,",
      "GEN-4",
      "is",
      "still",
      "on",
      "the",
      "truck.",
    );
    const r = g(claim({ tag: "GEN-4", status_value: "delivered", word_end: 9 }), w);
    expect("claim" in r && r.claim.doubt).toBe("ambiguous_span");
  });

  test("a span naming one tag twice is not ambiguous", () => {
    const w = words("GEN-3", "arrived,", "yes", "gen", "three");
    const r = g(claim({ tag: "GEN-3", status_value: "delivered", word_end: 4 }), w);
    expect("claim" in r && r.claim.doubt).toBeNull();
  });

  test("a negated status verb is in doubt", () => {
    const w = words("Gen", "three", "is", "not", "set", "yet,", "pad", "B", "is", "still", "wet.");
    const r = g(claim({ tag: "GEN-3", status_value: "set", word_end: 10 }), w);
    expect("claim" in r && r.claim.doubt).toBe("negated");
    const w2 = words("gen", "three", "hasn't", "arrived");
    const r2 = g(claim({ tag: "GEN-3", status_value: "delivered", word_end: 3 }), w2);
    expect("claim" in r2 && r2.claim.doubt).toBe("negated");
  });

  test("a span over 30 words is span_too_long", () => {
    const w = words(...Array.from({ length: 40 }, () => "set"));
    expect(dropped(g(claim({ word_end: 30 }), w))).toBe("span_too_long");
  });
});

describe("review fixes: names in lowercase transcripts", () => {
  test("a lowercase name before a speech verb is found", () => {
    const w = words("confirm", "cable", "delivery", "by", "friday", "ravi", "said", "the", "door");
    expect([...findNames(w, vocab)]).toEqual(["ravi"]);
  });
});

describe("live fix: incidental activity", () => {
  test("an unspoken activity on a status claim is cleared, not fatal", () => {
    const w = words("GEN-3", "has", "been", "set", "on", "PAD-A", "this", "morning,");
    const r = g(
      claim({
        tag: "GEN-3",
        status_value: "set",
        location: "PAD-A",
        activity_id: "A20",
        word_end: 7,
      }),
      w,
    );
    expect("claim" in r && r.claim.activity_id).toBeNull();
  });

  test("an unspoken activity on a date change still drops it", () => {
    const w = words("GEN-3", "is", "delayed", "three", "days");
    const r = g(claim({ type: "date_change", activity_id: "A30", delay_days: 3, word_end: 4 }), w);
    expect(dropped(r)).toBe("activity_not_in_span");
  });
});

describe("cubic fixes: grounding", () => {
  test("a spoken date outside the span drops the claim", () => {
    const w = words("set", "slips", "to", "friday");
    const ok = g(claim({ type: "date_change", spoken_date: "Friday", word_end: 3 }), w);
    expect(dropped(ok)).toBeNull();
    const bad = g(claim({ type: "date_change", spoken_date: "Friday", word_end: 1 }), w);
    expect(dropped(bad)).toBe("date_not_in_span");
  });

  test("an issue kind that was not said is cleared", () => {
    const w = words("the", "controls", "cabinet", "door", "is", "loose");
    const r = g(
      claim({ type: "issue", component: "controls cabinet", issue_kind: "damaged", word_end: 5 }),
      w,
    );
    expect("claim" in r && r.claim.issue_kind).toBeNull();
    const w2 = words("controls", "cabinet", "is", "missing");
    const r2 = g(
      claim({ type: "issue", component: "controls cabinet", issue_kind: "missing", word_end: 3 }),
      w2,
    );
    expect("claim" in r2 && r2.claim.issue_kind).toBe("missing");
  });

  test("a day late is one day", () => {
    const w = words("terminate", "gen", "three", "is", "a", "day", "late");
    expect(dropped(g(claim({ type: "date_change", delay_days: 1, word_end: 6 }), w))).toBeNull();
  });

  test("an activity must be said as a phrase", () => {
    const w = words("test", "the", "load", "bank", "is", "delayed", "three", "days");
    const r = g(claim({ type: "date_change", activity_id: "A30", delay_days: 3, word_end: 7 }), w);
    expect(dropped(r)).toBe("activity_not_in_span");
  });

  test("foldTokens ignores Object.prototype names", () => {
    expect(foldSpoken(["constructor", "toString"])).toEqual(["constructor", "tostring"]);
  });
});

describe("cubic fixes: names", () => {
  test("a calendar word used as a name before a speech verb is found", () => {
    expect([...findNames(words("then", "may", "said", "ok"), vocab)]).toEqual(["may"]);
  });

  test("possessive and hyphenated names are redacted", () => {
    const w = words("check", "Ravi's", "note,", "and", "Mary-Ann", "agreed");
    const names = findNames(w, vocab);
    const r = redactNames(w, names);
    expect(r[1]!.text).toBe("[name]");
    expect(r[4]!.text).toBe("[name]");
  });
});
