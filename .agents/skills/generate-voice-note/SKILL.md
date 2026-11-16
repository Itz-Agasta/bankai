---
name: generate-voice-note
description: Write one synthetic site walk note (script, TTS audio, scenario) for the voice eval set. Use when asked to add a voice note, walk note, audio test case or TTS sample for Bankai.
---

# Make a synthetic voice note

A voice note is one exam question for `process_site_note`: an engineer's short spoken update, and the claims Bankai should pull out of it.

Track 02 privacy rule: **synthetic voices only.** Never record yourself or anyone else. Never put a real person's name in a script. The only exception is one made-up first name, to test that Bankai removes it (step 2).

## Steps

1. Read the project files in `data/projects/<project>/` and pick what the note talks about: tags (`GEN-3`), locations (`PAD-B`), PO components (`controls cabinet`), activities (`A30 Load bank test`).
2. Write the script as a person would say it, at most 200 characters (Orpheus's limit):
   - Tags as spoken: "gen three", "transformer one". Locations as spoken: "pad B".
   - Mix claim types: `status` (delivered, set, installed), `date_change` ("delayed three days"), `issue` (missing or damaged component), `decision`, `action_item`.
   - Owners only as role IDs: "action for ELEC-02". To test name scrubbing, a script may say one made-up first name; Bankai must drop it.
   - Add a trap now and then: a wrong pad, a superseded location, a component not on the PO, a date with no number of days.
3. Save it as `eval/voice/<id>.txt`. Number it one past the highest `nNNN` in `eval/voice/`: `nNNN-<short-description>`.
4. Make the audio (costs about $0.004 per note; needs `GROQ_API_KEY`):

   ```bash
   bun packages/core/scripts/tts.ts eval/voice/<id>.txt eval/audio/<id>.wav <voice>
   ```

   Voices: `autumn`, `diana`, `hannah`, `austin`, `daniel`, `troy`. Rotate them so the set is not one voice.
5. Write `eval/voice/<id>.json` (file name, script name and audio name share the id):

   ```json
   {
     "id": "n004-tx1-delivered",
     "project": "alpha",
     "audio": "n004-tx1-delivered.wav",
     "expected": {
       "status": "confirmed",
       "claims": [{ "type": "status", "tag": "TX-1", "value": "delivered" }]
     }
   }
   ```

   Work out `expected` from the script and the project files, never from what Bankai currently outputs. `status` is `flagged` when a claim conflicts with the records (wrong pad) and `needs_human` when the note can't be settled (a calendar date with no day count, an unknown tag).
6. Run `just validate-eval` until it says `OK`.
7. Commit on a branch (`data/<short-name>`), push, open a PR with `gh pr create`. In the body, say in one line why each expected claim is right.

File format: `docs/data-format.md`.
