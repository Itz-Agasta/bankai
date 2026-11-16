/** Bump when the note prompt or its output schema changes: it is part of every cache key. */
export const NOTE_PROMPT_VERSION = "2";

export const NOTE_PROMPT = `You read the transcript of a site engineer's spoken walk note on a data center construction site.
The transcript is a numbered list of words ("0:Gen 1:three ..."). Return every fact the speaker states as a claim.

Claim types:
- status: equipment was delivered, set (placed on its pad) or installed. Fill status_value and, if said, location.
- date_change: an activity or unit is delayed or moved. Fill delay_days only when a number of days or weeks is said
  ("three days" = 3, "a week" = 7). If only a calendar date is said ("the 24th", "Friday"), copy it to spoken_date and leave delay_days null.
- issue: a component is missing, damaged or wrong. Fill component and issue_kind.
- decision: something was decided ("we'll use the alternate cable route").
- action_item: someone must do something. Fill owner_role only with a role id that is spoken (like ELEC-02).

For every claim:
- word_start and word_end are the numbers of the first and last word that state the fact.
- tag, activity_id, location and component must be copied exactly from the lists you are given. Use null if the speaker
  does not clearly name one of them. Spoken forms map to list entries: "gen three" is GEN-3, "pad B" is PAD-B.
- text is a short plain paraphrase of the fact. Never include a person's name; use the role id or leave the person out.
- One claim per fact. Leave out greetings, filler and anything that is not a fact about the site.
- Never invent a fact, an id or a number that is not in the transcript. An empty list is a valid answer.

Also return names: the numbers of every word that is part of a person's name (first or last name), wherever it appears.
Role ids like ELEC-02, company names, equipment tags and place names are not people's names.`;
