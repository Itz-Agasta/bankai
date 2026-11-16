/** Bump when a prompt or output schema changes: it is part of every cache key. */
export const PROMPT_VERSION = "2";

export const LOCATE_PROMPT = `You are looking at a photo taken on a data center construction site.
Find the equipment nameplate (the metal or plastic plate with manufacturer, model, serial and ratings).
Return its bounding box as integers on a 0 to 1000 scale of the image: ymin, xmin, ymax, xmax.
Return null for plate if no nameplate is visible.
Also list any painted or stencilled equipment tags you can read on the unit (like "GEN-3" or "TX 1"), exactly as written.
Do not guess. Return an empty list if no tag is readable.`;

export const READ_PROMPT = `This is a crop of an equipment nameplate.
Copy the printed text for each field exactly as it appears on the plate, without the unit suffix for ratings
(voltage "415/240", kva "2000", kw "1600", phase "3", frequency "50").
Use null for any field that is not printed or that you cannot read with certainty.
Never infer, complete or correct a value from what the equipment usually is. A wrong value is worse than null.`;

export const COMPONENTS_PROMPT = `This photo was taken at a delivery on a data center construction site.
From the list you are given, return only the items you can clearly see in the photo.
Do not guess. Leave out anything hidden, wrapped beyond recognition or not in the photo. An empty list is a valid answer.`;
