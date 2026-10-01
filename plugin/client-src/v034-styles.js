// 0.3.4: REQ-075 split-sheet purple (overrides the 0.3.3 blue sheet frame), REQ-073 multiview slots, REQ-074 hint.
// Loaded after v033Css so the same selectors win; colour is always paired with the text 「拆件图」.
export const v034Css = `
.tw-shell{--tw-role-purple:#7c4dcc}
.tw-shell .tw-role-ink-purple{color:var(--tw-role-purple)}
.tw-shell .tw-role-purple{--tw-role:var(--tw-role-purple)}
.tw-shell .tw-sheet-plan{border-left-color:var(--tw-role-purple)}
.tw-shell .tw-sheet-plan .tw-strip-grid .tw-pick-card.chosen{border-color:var(--tw-role-purple);box-shadow:0 0 0 2px color-mix(in srgb,var(--tw-role-purple) 45%,transparent)}
.tw-shell .tw-sheet-plan .tw-whole-preview .tw-output-image{outline:2px solid var(--tw-role-purple);outline-offset:1px;border-radius:8px}
.tw-shell .tw-role-card[data-sheet=true]{border-width:3px}
.tw-shell .tw-rel-group.is-sheet{outline-color:color-mix(in srgb,var(--tw-role-purple) 70%,transparent)}
.tw-shell .tw-rel-sheet-note{color:var(--tw-role-purple)}
.tw-shell .tw-multiview-plan{margin-top:14px;border-left:4px solid var(--tw-role-green);padding-left:10px}
.tw-shell .tw-view-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:8px 0}
.tw-shell .tw-view-slot{display:flex;flex-direction:column;gap:5px;padding:7px;border:1px dashed var(--tps-border,#cfd8d1);border-radius:10px}
.tw-shell .tw-view-slot.filled{border-style:solid}
.tw-shell .tw-view-slot[data-view=front]>strong{color:var(--tw-role-green)}
.tw-shell .tw-view-slot .tw-output-image img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border-radius:6px}
.tw-shell .tw-view-empty{display:grid;place-items:center;aspect-ratio:1;border-radius:6px;background:color-mix(in srgb,var(--tps-text,#000) 5%,transparent);font-size:12px;color:var(--tps-muted,#6e7f73)}
.tw-shell .tw-moderation-hint{border-left:3px solid var(--tw-role-red);padding-left:8px}
`
export const v034ApprovalCss = `.tw-shell .tw-approval-views{display:flex;flex-wrap:wrap;gap:6px}.tw-shell .tw-approval-views .tw-approval-input{flex:0 0 auto}`
