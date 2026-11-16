import { afterAll, describe, expect, test } from "bun:test";
import { fakeExtractor, fakeTranscriber } from "@bankai/core";
import { NoteRun, VerifyResult } from "@bankai/schemas";
import { extractScript, N001, transcript } from "../../../packages/core/test/fixtures/notes";
import { cleanup, PLATE } from "./helpers";
import { form, startTest, stopAll } from "./http-helpers";

afterAll(async () => {
  await stopAll();
  await cleanup();
});

const plate = () => Bun.file(PLATE);
const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 9]);
const post = (url: URL, body: FormData) => fetch(url, { method: "POST", body });
const errCode = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

describe("HTTP API", () => {
  test("health reports the project", async () => {
    const s = await startTest();
    const r = await fetch(s.at("/api/health"));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, demo: false, project: "mini" });
  });

  test("verify a multipart photo, then status lists its update", async () => {
    const s = await startTest();
    const r = await post(s.at("/api/verify"), form({ photos: plate(), location: "PAD-B" }));
    expect(r.status).toBe(200);
    const out = VerifyResult.parse(await r.json());
    expect(out.verdict.status).toBe("confirmed");
    const st = (await (await fetch(s.at("/api/status"))).json()) as {
      pending_updates: { id: string }[];
    };
    expect(st.pending_updates.map((u) => u.id)).toEqual([out.proposed_updates[0]!.id]);
  });

  test("the same photo twice is accepted", async () => {
    const s = await startTest();
    const r = await post(s.at("/api/verify"), form({ photos: [plate(), plate()] }));
    expect(r.status).toBe(200);
    VerifyResult.parse(await r.json());
  });

  test("a photos field that is text is 400", async () => {
    const s = await startTest();
    const r = await post(s.at("/api/verify"), form({ photos: "plate.jpg" }));
    expect(r.status).toBe(400);
    expect(await errCode(r)).toBe("INPUT_UNSUPPORTED");
  });

  test("no photos is 400", async () => {
    const s = await startTest();
    const r = await post(s.at("/api/verify"), form({ location: "PAD-B" }));
    expect(r.status).toBe(400);
    expect(await errCode(r)).toBe("INPUT_UNSUPPORTED");
  });

  test("more than six photos is 400", async () => {
    const s = await startTest();
    const r = await post(s.at("/api/verify"), form({ photos: Array(7).fill(plate()) }));
    expect(r.status).toBe(400);
  });

  test("a text file as a photo is 400", async () => {
    const s = await startTest();
    const txt = new File(["hello"], "plate.jpg", { type: "image/jpeg" });
    const r = await post(s.at("/api/verify"), form({ photos: txt }));
    expect(r.status).toBe(400);
    expect(await errCode(r)).toBe("INPUT_UNSUPPORTED");
  });

  test("a path form field is ignored", async () => {
    const s = await startTest();
    const r = await post(s.at("/api/verify"), form({ photos: plate(), path: "/etc/passwd" }));
    expect(r.status).toBe(200);
    const body = JSON.stringify(await r.json());
    expect(body).not.toContain("passwd");
    expect(body).toMatch(/[0-9a-f]{64}\.jpg/);
  });

  test("delivery without photos", async () => {
    const s = await startTest();
    const r = await post(s.at("/api/delivery"), form({ po: "PO-1042", line: "14" }));
    expect(r.status).toBe(200);
    VerifyResult.parse(await r.json());
  });

  test("a delivery line that is not a number is 400", async () => {
    const s = await startTest();
    const r = await post(s.at("/api/delivery"), form({ po: "PO-1042", line: "x" }));
    expect(r.status).toBe(400);
  });

  test("note upload returns a NoteRun", async () => {
    const s = await startTest({
      models: {
        speech: fakeTranscriber("fake-speech", { "*": transcript(N001) }),
        extract: fakeExtractor("fake-extract", extractScript()),
      },
    });
    const r = await post(s.at("/api/notes"), form({ audio: new Blob([WAV]) }));
    expect(r.status).toBe(200);
    NoteRun.parse(await r.json());
  });

  test("note without speech models is 503", async () => {
    const s = await startTest();
    const r = await post(s.at("/api/notes"), form({ audio: new Blob([WAV]) }));
    expect(r.status).toBe(503);
    expect(await errCode(r)).toBe("PERCEPTION_UNAVAILABLE");
  });

  test("unknown route is 404 JSON", async () => {
    const s = await startTest();
    const r = await fetch(s.at("/api/nope"));
    expect(r.status).toBe(404);
    expect(await errCode(r)).toBe("NOT_FOUND");
  });
});
