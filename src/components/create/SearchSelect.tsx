"use client";

/**
 * The canvas's taxonomy pickers — now the house dropdown under its old name.
 *
 * ~~A dropdown with a filter box, kept local to the canvas because nothing else needed it (MREQ-AC-21).~~
 * Everything else needed it. On 2026-08-31 the owner asked for one dropdown across the product, and
 * this was the implementation worth keeping — so it moved to `@/components/Dropdown` and this file
 * is the alias the canvas already imports. Same props, same behaviour; `tone="field"` is unchanged.
 */

export { Dropdown as SearchSelect, type DropdownOption as SearchSelectOption } from "@/components/Dropdown";
