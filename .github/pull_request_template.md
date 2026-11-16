## Summary

What changes and why, in two or three lines. Add a small diagram, file tree or diff sketch if it makes the point faster.

## Evidence

- **Before:** failing test, output or screenshot
- **After:** passing test, output or screenshot

## Merge danger

**Door:** two-way (easy to roll back) or one-way (hard to undo)

**Blast radius:** what this can break, in one word, then a line if needed

## Checklist

- [ ] `just check-ci`, `just types` and `just test` pass
- [ ] `just validate-eval` passes, and `just validate-data` on any project you changed
- [ ] No real people, faces or names in photos or audio; people appear only as role IDs (`SUPT-01`)
- [ ] Every photo has EXIF stripped (`just strip-exif eval/photos`)
- [ ] Labels and expected answers come from the plate or the project files, never from what Bankai outputs
