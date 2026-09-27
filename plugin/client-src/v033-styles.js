// 0.3.3 (REQ-067～072): role colours, 文生图/图生图 tabs, balance check and storage feedback.
// Role colours are fixed hues (green = 主要, blue = 次要, red = 基准) mixed with the theme text colour so they
// stay readable in both light and dark appearance; the colour is always paired with a text label.
export const v033Css = `
.tw-shell{--tw-role-green:#2f8a4f;--tw-role-blue:#2f6fbf;--tw-role-red:#c2412f}
.tw-shell .tw-role-ink-green{color:var(--tw-role-green)}
.tw-shell .tw-role-ink-blue{color:var(--tw-role-blue)}
.tw-shell .tw-role-ink-red{color:var(--tw-role-red)}
.tw-shell .tw-role-green{--tw-role:var(--tw-role-green)}
.tw-shell .tw-role-blue{--tw-role:var(--tw-role-blue)}
.tw-shell .tw-role-red{--tw-role:var(--tw-role-red)}
.tw-shell .tw-role-legend{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}
.tw-shell .tw-role-legend.compact{margin:6px 0}
.tw-shell .tw-role-tag{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;border:1px solid color-mix(in srgb,var(--tw-role) 45%,transparent);background:color-mix(in srgb,var(--tw-role) 12%,transparent);font-size:12px;font-weight:600;color:var(--tps-text,inherit)}
.tw-shell .tw-role-tag i{width:9px;height:9px;border-radius:50%;background:var(--tw-role);flex:none}
.tw-shell .tw-role-tag small{font-weight:400;color:var(--tps-muted,#6e7f73);margin-left:2px}
.tw-shell .tw-role-switch{display:inline-flex;border:1px solid var(--tps-border,#cfd8d1);border-radius:8px;overflow:hidden;margin:4px 0}
.tw-shell .tw-role-switch .tw-role-btn{border:0;border-radius:0;min-height:26px;padding:2px 9px;font-size:12px;background:transparent;color:var(--tps-text,inherit);box-shadow:none}
.tw-shell .tw-role-switch .tw-role-btn+.tw-role-btn{border-left:1px solid var(--tps-border,#cfd8d1)}
.tw-shell .tw-role-switch .tw-role-btn[aria-pressed=true]{background:var(--tw-role);color:#fff;font-weight:700}
.tw-shell .tw-role-switch.compact .tw-role-btn{min-height:22px;padding:1px 7px;font-size:11px}
.tw-shell .tw-role-grid{grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}
.tw-shell .tw-role-card{position:relative;border:2px solid color-mix(in srgb,var(--tw-role) 55%,transparent);box-shadow:inset 4px 0 0 var(--tw-role)}
.tw-shell .tw-role-card.chosen{border-color:var(--tw-role);background:color-mix(in srgb,var(--tw-role) 9%,var(--tps-surface,transparent))}
.tw-shell .tw-role-badge{position:absolute;left:6px;top:6px;padding:1px 7px;border-radius:999px;background:var(--tw-role);color:#fff;font-size:11px;font-weight:700;pointer-events:none}
.tw-shell .tw-role-quick{margin:4px 0 8px}
.tw-shell .tw-plan-intro{margin:0 0 10px;font-size:12.5px;line-height:1.6}
.tw-shell .tw-sheet-plan{border-left:4px solid var(--tw-role-blue);padding-left:10px}
.tw-shell .tw-plan-summary{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12.5px;margin-bottom:6px}
.tw-shell .tw-rel-row.tw-role-row .tw-rel-part{box-shadow:inset 4px 0 0 var(--tw-role);padding-left:6px}
.tw-shell .tw-rel-group.is-sheet{outline:2px solid color-mix(in srgb,var(--tw-role-blue) 60%,transparent);outline-offset:2px;border-radius:10px}
.tw-shell .tw-rel-sheet-note{display:block;margin-top:4px;color:var(--tw-role-blue)}
.tw-shell .tw-gen-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;column-span:all}
.tw-shell .tw-insp-body>[role=tabpanel]{display:contents}
.tw-shell .tw-insp-body>[role=tabpanel]>*{break-inside:avoid}
.tw-shell .tw-insp-body>[role=tabpanel]>label{display:block;margin:0 0 10px}
.tw-shell .tw-insp-body>[role=tabpanel]>.tw-insp-title{column-span:all}
.tw-shell .tw-gen-tab{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 10px;text-align:left;border:1px solid var(--tps-border,#cfd8d1);border-radius:10px;background:transparent;min-height:auto}
.tw-shell .tw-gen-tab b{font-size:14px}
.tw-shell .tw-gen-tab small{font-size:11px;color:var(--tps-muted,#6e7f73);font-weight:400}
.tw-shell .tw-gen-tab[aria-selected=true]{border:2px solid var(--tps-accent,#315d49);background:color-mix(in srgb,var(--tps-accent,#315d49) 16%,transparent);box-shadow:inset 0 -3px 0 var(--tps-accent,#315d49)}
.tw-shell .tw-gen-tab[aria-selected=true] b::before{content:'● ';color:var(--tps-accent,#315d49)}
.tw-shell .tw-gen-mode-note{margin:4px 0;padding:4px 8px;border-radius:8px;font-size:12px;background:color-mix(in srgb,var(--tps-accent,#315d49) 10%,transparent)}
.tw-shell .tw-gen-input{display:flex;gap:10px;align-items:center;justify-content:flex-start;margin-bottom:8px;text-align:left;column-span:all}
.tw-shell .tw-gen-input .tw-output-image{width:auto;flex:none;padding:0}
.tw-shell .tw-insp-body>[role=tabpanel]>.tw-image-edit{break-inside:auto}
.tw-shell .tw-gen-input img{width:64px;height:64px;object-fit:contain;border-radius:8px;background:var(--tps-base,#f3f5f2)}
.tw-shell .tw-gen-input small{display:block;color:var(--tps-muted,#6e7f73)}
.tw-shell .tw-kind-tag{font-weight:700;color:var(--tps-accent,#315d49)}
.tw-shell .tw-approval-input,.tw-shell .tw-job-input{display:flex;align-items:center;gap:8px;margin:4px 0}
.tw-shell .tw-approval-input img,.tw-shell .tw-job-input img{width:52px;height:52px;object-fit:contain;border-radius:6px;background:var(--tps-base,#f3f5f2)}
.tw-shell .tw-job-input{border:0;background:transparent;padding:0;min-height:auto;text-align:left}
.tw-shell .tw-approval-noinput{display:block;margin:4px 0;color:var(--tps-muted,#6e7f73)}
.tw-shell .tw-balance-check{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:8px 0;padding:8px 10px;border:1px solid var(--tps-border,#cfd8d1);border-radius:10px;font-size:12.5px}
.tw-shell .tw-balance-check small{margin-left:6px;color:var(--tps-muted,#6e7f73)}
.tw-shell .tw-balance-check.short{border-color:var(--tps-danger,#993e32);background:var(--tps-danger-bg,#fff0eb)}
.tw-shell .tw-balance-check strong{flex-basis:100%}
.tw-shell .tw-balance-pill{min-height:24px;padding:2px 10px;border-radius:999px;font-size:12px}
.tw-shell .tw-storage-done{color:var(--tps-success,#265c40)}
.tw-shell .tw-storage-confirm{scroll-margin:12px}
`
