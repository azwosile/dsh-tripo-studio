/** Local-only surface tokens. Never redefine host --dsw-* / --we-* variables. */
export const appearanceCss = `
.tw-shell {
  --tps-base:#f3f5f3; --tps-surface:#ffffff; --tps-hover:#e8eeea;
  --tps-text:#202e28; --tps-muted:#52665b; --tps-subtle:#5b7063;
  --tps-border:#b8c8bd; --tps-accent:#315d49; --tps-on-accent:#fff;
  --tps-danger:#993e32; --tps-danger-bg:#fff0eb; --tps-success:#265c40;
  --tps-success-bg:#e6f3e9; --tps-shadow:0 6px 24px #142e2412;
  --tps-glass:var(--tps-surface); --tps-frost:none;
  position:relative; min-width:0; color-scheme:light; container:tripo-workbench / inline-size;
  background:var(--tps-base); color:var(--tps-text);
}
.tw-shell[data-theme=dark] {
  color-scheme:dark; --tps-base:#131c24; --tps-surface:#202c37; --tps-hover:#2d3d49;
  --tps-text:#edf4f7; --tps-muted:#b5c6cf; --tps-subtle:#a4b9c5;
  --tps-border:#526776; --tps-accent:#a6dfc4; --tps-on-accent:#10281d;
  --tps-danger:#ffb5a9; --tps-danger-bg:#432c2b; --tps-success:#b2e6c5;
  --tps-success-bg:#243e34; --tps-shadow:0 6px 24px #0003;
}
.tw-shell[data-theme-mode=host] {
  --tps-text:var(--dsw-alias-label-primary, var(--tps-theme-text));
  --tps-muted:var(--dsw-alias-label-secondary, var(--tps-theme-muted));
  --tps-subtle:var(--tps-muted);
  --tps-theme-text:#202e28; --tps-theme-muted:#52665b;
}
.tw-shell[data-theme-mode=host][data-theme=dark] {--tps-theme-text:#edf4f7;--tps-theme-muted:#b5c6cf}
/* WE intentionally sets --dsw-alias-bg-base:transparent. Our surface remains
   readable even with its glass alpha at minimum; tint is limited to 8%. */
body[data-we-wallpaper] .tw-shell[data-surface=glass] {
  background:transparent;
  --tps-glass:color-mix(in srgb, var(--tps-surface) 92%, var(--we-glass-color,var(--tps-surface)));
}
@supports (backdrop-filter:blur(1px)) {
  .tw-shell[data-surface=glass] {
    --tps-glass:color-mix(in srgb,var(--tps-surface) 92%,transparent);
    --tps-frost:blur(clamp(0px,var(--we-blur,20px),40px)) saturate(1.15);
  }
  body[data-we-wallpaper] .tw-shell[data-surface=glass] {
    --tps-glass:color-mix(in srgb,color-mix(in srgb,var(--tps-surface) 92%,var(--we-glass-color,var(--tps-surface))) 92%,transparent);
  }
}
.tw-shell .tw-topnav {
  position:relative; z-index:10; flex:none; flex-wrap:wrap; align-items:center; gap:10px 18px;
  padding:10px 18px; min-width:0; max-height:45%; overflow:auto;
  background:var(--tps-glass); color:var(--tps-text); border-color:var(--tps-border);
  backdrop-filter:var(--tps-frost); -webkit-backdrop-filter:var(--tps-frost); box-shadow:var(--tps-shadow);
}
.tw-nav-tabs {display:flex;flex-wrap:wrap;gap:5px;min-width:0;max-width:100%}
.tw-shell .tw-nav-tabs button {min-height:var(--tps-control-height,34px);padding:4px 12px;line-height:1.5;color:var(--tps-text);white-space:normal}
.tw-shell .tw-topnav button[aria-selected=true] {background:var(--tps-hover);color:var(--tps-text);box-shadow:inset 0 -2px var(--we-accent,var(--tps-accent))}
.tw-appearance {display:flex;flex-wrap:wrap;gap:8px 12px;margin-left:auto;max-width:100%;font-size:12px}
.tw-appearance label {display:flex;align-items:center;gap:6px;min-width:0}
.tw-appearance select {min-height:var(--tps-control-height,34px);max-width:100%;padding:3px 6px;border:1px solid var(--tps-border);border-radius:7px;background:var(--tps-surface);color:var(--tps-text);font:inherit}
.tw-shell :focus-visible {outline:3px solid var(--tps-accent);outline-offset:2px}
.tw-shell :is(.tw-panel,.tw-settings,.tps-col,.tps-head,.tps-assets) {background:var(--tps-glass);border-color:var(--tps-border);backdrop-filter:var(--tps-frost);-webkit-backdrop-filter:var(--tps-frost)}
.tw-shell .tw-root {background:transparent}
/* A non-blurred reading scrim protects headings between glass cards even over
   extreme white/black/high-frequency wallpapers, without a giant GPU filter. */
body[data-we-wallpaper] .tw-shell[data-surface=glass] :is(.tw-root,.tps-root) {
  background:color-mix(in srgb,var(--tps-base) 82%,transparent);
}
.tw-shell .tw-root :is(button,a) {transition:transform .16s}

.tw-shell .tps-root {background:transparent;color:var(--tps-text)}
.tw-shell :is(.tw-panel,.tw-settings) {box-shadow:var(--tps-shadow)}
.tw-shell .tw-steps button {background:var(--tps-glass);color:var(--tps-text);border-color:var(--tps-border)}
.tw-shell .tw-steps button[aria-current=step] {background:var(--tps-surface);border-color:var(--tps-accent)}
.tw-shell .tw-steps b,.tw-shell .tw-steps button[aria-current=step] b {color:var(--tps-accent)}
.tw-shell .tw-root :is(button,a):not(.tw-image-card) {min-height:var(--tps-control-height,34px)}
.tw-shell .tw-root :is(select,input:not([type=checkbox]):not([type=file])) {min-height:var(--tps-control-height,34px)}
.tw-shell :is(.tw-primary,.tps-primary),.tw-shell .tw-primary:hover:not(:disabled) {background:var(--tps-accent);border-color:var(--tps-accent);color:var(--tps-on-accent)}
.tw-shell :is(.tw-pill,.tw-alert) {background:var(--tps-success-bg);border-color:var(--tps-border);color:var(--tps-success)}
.tw-shell .tw-pill.ready {background:var(--tps-success-bg);border-color:var(--tps-border);color:var(--tps-success)}
.tw-shell .tw-alert.error {background:var(--tps-danger-bg);border-color:var(--tps-danger);color:var(--tps-danger)}
.tw-shell .tw-danger {color:var(--tps-danger)!important}
.tw-shell :is(.tw-upload,.tw-chips button) {color:var(--tps-muted);border-color:var(--tps-border)}
.tw-shell .tw-chips button.on {background:var(--tps-hover);color:var(--tps-text);border-color:var(--tps-accent)}
.tw-shell :is(.tw-settings pre,.tw-note,.tw-approval-list pre) {background:var(--tps-base);color:var(--tps-text);border-color:var(--tps-border)}
.tw-shell :is(.tw-job,.tw-model,.tw-approval-list,.tw-approval-list article) {border-color:var(--tps-border)}
.tw-shell .tw-dialog,.tw-shell .tps-modal-card {background:var(--tps-surface);color:var(--tps-text)}
.tw-shell .tw-dialog {border:1px solid var(--tps-border)}
.tw-shell .tw-image-card img {background:repeating-conic-gradient(var(--tps-hover) 0% 25%,var(--tps-base) 0% 50%) 50%/20px 20px}
.tw-shell .tw-image-card.chosen {border-color:var(--tps-accent);box-shadow:0 0 0 1px var(--tps-accent)}
.tw-shell .tw-crop {background:var(--tps-base)}
.tw-shell :is(.tw-model>span,.tw-job header span) {color:var(--tps-muted)}
.tw-shell :is(.tw-consent input,.tw-image-card input,.tps-range) {accent-color:var(--tps-accent)}
.tw-shell .tps-actions button.go {background:var(--tps-accent);color:var(--tps-on-accent)}
.tw-shell .tps-tools {max-width:calc(100% - 16px);flex-wrap:wrap;justify-content:center}
.tw-shell .tps-tools button {min-height:var(--tps-control-height,34px)}
.tw-shell .tw-projectbar label {min-width:0;max-width:100%}
.tw-shell .tw-projectbar select {max-width:100%}
@media(max-width:760px) {
  .tw-appearance {margin-left:0;gap:6px 10px}
  .tw-shell .tw-topnav {padding:8px 12px;gap:8px}
  .tw-nav-tabs {width:100%}
  .tw-shell .tw-nav-tabs button {padding:4px 8px}
}
@media(prefers-reduced-transparency:reduce) {
  .tw-shell[data-surface=glass] {--tps-glass:var(--tps-surface)!important;--tps-frost:none!important;background:var(--tps-base)!important}
}
@media(prefers-reduced-motion:reduce) {.tw-shell *{transition:none!important;scroll-behavior:auto!important}}
@media(forced-colors:active) {
  .tw-shell {--tps-surface:Canvas;--tps-base:Canvas;--tps-text:CanvasText;--tps-muted:CanvasText;--tps-border:ButtonText;--tps-accent:Highlight;--tps-on-accent:HighlightText}
  .tw-shell .tw-topnav button[aria-selected=true] {outline:2px solid Highlight}
}

/* v0.2.2: both parameter pages share owned theme + independent dimensions. */
.tw-shell {font-size:var(--tps-control-font,13px)}
.tw-shell .tps-root {font-size:var(--tps-control-font,13px)}
.tw-shell .tps-col.create {background:var(--tps-surface);color:var(--tps-text);color-scheme:inherit;min-width:0;max-height:none}
.tw-shell .tps-col.create :is(textarea,select) {background:var(--tps-base);color:var(--tps-text);border-color:var(--tps-border);color-scheme:inherit}
.tw-shell .tps-col.create :is(.tps-label,.tps-switch) {color:var(--tps-text)}
.tw-shell .tps-col.create :is(.tps-count,.tps-tips,.tps-hint,.tps-cost,.tps-drop small,.tps-switch small) {color:var(--tps-muted);font-size:max(11px,calc(var(--tps-control-font) - 2px))}
.tw-shell .tps-col.create .tps-tabs {background:var(--tps-base)}
.tw-shell .tps-col.create .tps-tabs button {color:var(--tps-muted)}
.tw-shell .tps-col.create .tps-tabs button.on {background:var(--tps-hover);color:var(--tps-text)}
.tw-shell .tps-col.create .tps-drop {background:var(--tps-base);color:var(--tps-muted)}
.tw-shell .tps-col.create .tps-switch input {background:var(--tps-border)}
.tw-shell .tps-col.create .tps-switch input:checked {background:var(--tps-accent)}
.tw-shell .tps-col.create .tps-switch input:after {background:var(--tps-surface)}
.tw-shell :is(.tps-select,.tps-primary,.tps-secondary,.tps-tabs button,.tps-styles button) {min-height:var(--tps-control-height);font-size:var(--tps-control-font)}
.tw-shell .tw-root :is(button,select,textarea,input:not([type=checkbox]):not([type=file])),.tw-shell .tps-field textarea {font-size:var(--tps-control-font)}
.tw-shell :is(.tps-tabs,.tps-styles,.tps-split,.tw-actions,.tw-fields,.tw-nav-tabs) {gap:var(--tps-control-gap)}
.tw-shell .tps-grid {grid-template-columns:var(--tps-params-width,280px) minmax(0,1fr) 220px;gap:var(--tps-control-gap)}
.tw-shell .tps-col.details {display:block;min-width:0}
.tw-shell .tps-head,.tw-shell .tps-vtop {gap:var(--tps-control-gap)}
.tw-shell .tps-field {margin-bottom:calc(var(--tps-control-gap) + 8px)}
.tw-control-settings {max-width:100%;font-size:12px}
.tw-control-settings summary {cursor:pointer;min-height:34px;border:1px solid var(--tps-border);border-radius:7px;padding:6px 10px;background:var(--tps-surface);color:var(--tps-text)}
.tw-control-settings[open] {flex-basis:100%;width:100%}
.tw-appearance:has(.tw-control-settings[open]) {flex-basis:100%;width:100%;margin-left:0}
.tw-control-form {margin-top:10px;padding:14px;border:1px solid var(--tps-border);border-radius:8px;background:var(--tps-surface);color:var(--tps-text);max-width:650px}
.tw-control-form p {margin:0 0 10px;color:var(--tps-muted);line-height:1.6}
.tw-control-form .tw-size-fields {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:12px 0}
.tw-control-form .tw-size-fields label {display:block;min-width:0}
.tw-control-form input {width:100%;min-width:0;font:inherit;min-height:34px;padding:5px 7px;border:1px solid var(--tps-border);border-radius:5px;background:var(--tps-base);color:var(--tps-text)}
.tw-control-form .tw-size-presets {display:flex;flex-wrap:wrap;gap:8px}
.tw-control-form .tw-size-presets button {border:1px solid var(--tps-border);background:var(--tps-base);color:var(--tps-text);font-size:12px;min-height:34px;padding:5px 10px}
.tw-control-form button[aria-pressed=true] {box-shadow:inset 0 -2px var(--tps-accent)}
.tw-control-form small {display:block;color:var(--tps-muted);margin-top:10px}
/* DSH owns sidebars and can narrow the MAIN SLOT while the window stays wide.
   Query this panel's width, not just the viewport. No host DOM class overrides. */
@container tripo-workbench (max-width:1100px) {
  .tw-shell .tw-columns {grid-template-columns:1fr}
  .tw-shell .tw-header {flex-direction:column}
  .tw-shell .tw-header-actions {justify-content:flex-start}
  .tw-shell .tps-grid {grid-template-columns:minmax(220px,min(var(--tps-params-width),45%)) minmax(0,1fr);overflow:auto;align-content:start}
  .tw-shell .tps-col.details {grid-column:1/-1;overflow:visible}
  .tw-shell .tps-col.create {overflow:visible}
  .tw-shell .tps-col.center {min-height:480px}
}
@container tripo-workbench (max-width:720px) {
  .tw-shell .tw-appearance {margin-left:0;gap:8px}
  .tw-shell .tw-nav-tabs {width:100%}
  .tw-shell .tw-topnav {padding:8px 10px;gap:8px}
  .tw-shell .tw-root {padding:18px 12px 30px}
  .tw-shell .tps-grid {display:flex;flex-direction:column;overflow:auto;padding:10px;align-content:normal}
  .tw-shell .tps-col.create,.tw-shell .tps-col.details {flex:none;width:100%;overflow:visible}
  .tw-shell .tps-col.center {flex:none;min-height:440px;width:100%}
  .tw-shell .tps-assets {max-height:160px;overflow:auto;flex:none}
  .tw-shell .tps-head {padding:10px;gap:8px}
  .tw-shell .tps-badge {margin-left:0}
  .tw-shell .tw-projectbar {flex-wrap:wrap}
  .tw-shell .tw-projectbar>span {margin-left:0}
  .tw-shell .tw-steps {grid-template-columns:repeat(2,minmax(0,1fr))}
  .tw-shell .tw-steps button {padding:10px;min-width:0}
  .tw-shell .tw-panel {padding:14px}
  .tw-shell .tw-fields {grid-template-columns:1fr}
  .tw-shell .tw-size-fields {grid-template-columns:repeat(2,minmax(0,1fr))}
  .tw-shell .tw-job header {flex-direction:column}
}

/* 0.2.5: reserve the actual desktop overlay height, not guessed right padding. */
.tw-shell {box-sizing:border-box;padding-top:var(--tps-host-inset,0px);--tps-base-color:#f3f5f3;--tps-surface-color:#fff;--tps-hover-color:#e8eeea;--tps-popup-text:#202e28}
.tw-shell[data-theme=dark] {--tps-base-color:#131c24;--tps-surface-color:#202c37;--tps-hover-color:#2d3d49;--tps-popup-text:#edf4f7}
.tw-shell .tw-topnav {overflow:visible;max-height:none;-webkit-app-region:no-drag}
.tw-shell .tw-appearance {align-items:center}
.tw-shell .tw-header-actions {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch;width:min(100%,420px);gap:10px}
.tw-shell .tw-header-actions > :is(.tw-pill,button) {width:100%;box-sizing:border-box;min-width:0;min-height:var(--tps-control-height);padding:7px 10px;display:flex;align-items:center;justify-content:center;font-size:var(--tps-control-font);white-space:normal;text-align:center;line-height:1.45}
.tw-shell .tw-projectbar {align-items:flex-end}
.tw-shell .tw-projectbar > label {display:flex;flex-direction:column;align-items:stretch;gap:6px;margin:0}
.tw-shell .tw-projectbar > label select,.tw-shell .tw-projectbar > button {margin:0;box-sizing:border-box;height:var(--tps-control-height);min-height:var(--tps-control-height);padding-top:0;padding-bottom:0}
.tw-shell .tw-projectbar > span {align-self:center}
.tw-shell .tw-floating {display:inline-flex;flex:none;font-size:12px}
.tw-shell .tw-floating > button {min-height:var(--tps-control-height);padding:4px 10px;border:1px solid var(--tps-border);border-radius:7px;background:var(--tps-surface);color:var(--tps-text);cursor:pointer;font:inherit}
.tw-shell .tw-floating-dialog {position:fixed;inset:max(56px,calc(var(--tps-host-inset,0px) + 12px)) 16px auto auto;margin:0;width:min(500px,calc(100vw - 32px));max-height:calc(100dvh - 100px);box-sizing:border-box;overflow:auto;overscroll-behavior:contain;border:1px solid var(--tps-border);border-radius:14px;padding:16px;background:var(--tps-surface-color);color:var(--tps-popup-text);box-shadow:0 18px 65px #0006;font:13px/1.65 system-ui,sans-serif;--tps-text:var(--tps-popup-text);--tps-muted:var(--tps-popup-text);--tps-base:var(--tps-base-color);--tps-surface:var(--tps-surface-color)}
.tw-shell .tw-floating-dialog::backdrop {background:#0002}
.tw-shell .tw-floating-heading {display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--tps-border)}
.tw-shell .tw-floating-dialog button {border:1px solid var(--tps-border);border-radius:7px;background:var(--tps-base-color);color:var(--tps-popup-text);padding:5px 10px;cursor:pointer;min-height:32px;font:inherit}
.tw-shell .tw-control-form {margin:10px 0 0;padding:0;border:0;max-width:none;background:var(--tps-surface-color)}
.tw-shell .tw-control-form .tw-size-fields {grid-template-columns:repeat(2,minmax(0,1fr))}
.tw-shell .tw-visual-form label {display:flex;flex-direction:column;align-items:stretch;gap:8px;margin:14px 0}
.tw-shell .tw-visual-form input[type=range] {width:100%;accent-color:var(--tps-accent)}
.tw-shell .tw-visual-form input[type=color] {width:100%;height:38px;padding:2px;background:var(--tps-base-color);border:1px solid var(--tps-border)}
.tw-shell .tw-visual-form .tw-size-presets {display:flex;flex-wrap:wrap;gap:8px}
.tw-shell .tw-model-tips {margin:8px 0}
.tw-shell .tw-model-tips code {overflow-wrap:anywhere;white-space:normal}
.tw-shell .tw-model-tips a {color:var(--tps-popup-text);text-decoration:underline}
.tw-shell[data-custom-text=true] {--tps-text:var(--tps-custom-text);--tps-muted:var(--tps-custom-text);--tps-subtle:var(--tps-custom-text)}
/* Change background alpha, NOT opacity of the entire DOM/text/canvas. */
.tw-shell[data-custom-opacity=true][data-surface=glass] {background:transparent;--tps-base:color-mix(in srgb,var(--tps-base-color) var(--tps-user-opacity),transparent);--tps-surface:color-mix(in srgb,var(--tps-surface-color) var(--tps-user-opacity),transparent);--tps-hover:color-mix(in srgb,var(--tps-hover-color) var(--tps-user-opacity),transparent);--tps-glass:var(--tps-surface)}
body[data-we-wallpaper] .tw-shell[data-custom-opacity=true][data-surface=glass] {--tps-glass:var(--tps-surface)}
@container tripo-workbench (max-width:480px) {.tw-shell .tw-projectbar > label{flex-basis:100%}.tw-shell .tw-header-actions{width:100%}}

/* Cost approvals remain readable regardless of decorative transparency. */
.tw-shell[data-custom-opacity=true] :is(.tw-dialog,.tps-modal-card) {background:var(--tps-surface-color);color:var(--tps-popup-text);--tps-surface:var(--tps-surface-color);--tps-base:var(--tps-base-color);--tps-text:var(--tps-popup-text);--tps-muted:var(--tps-popup-text)}
/* 0.2.8 owned palette; raw theme tokens remain unchanged for recovery/approval dialogs. */
.tw-shell[data-custom-base=true][data-surface] {--tps-base:var(--tps-user-base);background:var(--tps-base)}
.tw-shell[data-custom-base=true][data-surface=glass],body[data-we-wallpaper] .tw-shell[data-custom-base=true][data-surface=glass] {--tps-base:var(--tps-user-base);--tps-surface:color-mix(in srgb,var(--tps-surface-color) 84%,var(--tps-user-base));--tps-glass:var(--tps-surface);background:var(--tps-base)}
@supports (backdrop-filter:blur(1px)) {
 .tw-shell[data-custom-base=true][data-surface=glass],body[data-we-wallpaper] .tw-shell[data-custom-base=true][data-surface=glass] {--tps-base:color-mix(in srgb,var(--tps-user-base) var(--tps-user-opacity),transparent);--tps-glass:color-mix(in srgb,var(--tps-surface) var(--tps-user-opacity),transparent)}
}
.tw-shell[data-custom-accent=true] {--tps-accent:var(--tps-user-accent);--tps-on-accent:var(--tps-user-on-accent)}
.tw-shell[data-custom-accent=true] .tw-topnav button[aria-selected=true] {box-shadow:inset 0 -2px var(--tps-accent)}
.tw-shell .tw-topnav {background:var(--tps-top-fill,var(--tps-glass))}
.tw-shell[data-custom-top=true] .tw-topnav {--tps-top-fill:var(--tps-user-top);--tps-text:var(--tps-top-text);--tps-muted:var(--tps-top-text);--tps-surface:var(--tps-user-top);--tps-hover:color-mix(in srgb,var(--tps-user-top) 85%,var(--tps-top-text))}
@supports (backdrop-filter:blur(1px)) {
 .tw-shell[data-surface=glass] {--tps-frost:blur(var(--tps-blur,20px)) saturate(1.15)}
 .tw-shell[data-custom-top=true][data-surface=glass] .tw-topnav {--tps-top-fill:color-mix(in srgb,var(--tps-user-top) var(--tps-user-opacity),transparent)}
}
.tw-shell .tw-color-fields {margin:0;border:1px solid var(--tps-border);border-radius:8px;padding:10px;min-width:0}
.tw-shell .tw-visual-form label.tw-titlebar-switch {flex-direction:row;align-items:center}
.tw-shell .tw-visual-form .tw-titlebar-switch input {width:auto;flex:0 0 auto;min-height:0;margin:0}
.tw-shell .tw-color-fields {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.tw-shell .tw-color-fields .tw-size-presets {grid-column:1 / -1}
.tw-shell .tw-color-fields label {min-width:0;margin:8px 0}
@media(max-width:420px) {.tw-shell .tw-color-fields {grid-template-columns:1fr}}
.tw-shell .tw-preview-help {flex:none;margin:0;padding:10px 18px;background:var(--tps-glass);color:var(--tps-text);font-size:12px;line-height:1.6}
/* This sibling decoration sits BELOW Electron native caption/menu views and never handles input. */
.tripo-titlebar-glass {position:fixed;top:0;left:0;right:0;height:var(--tripo-titlebar-height);z-index:2147480000;pointer-events:none;user-select:none;background:var(--tripo-titlebar-safe);border-bottom:1px solid #8883;box-sizing:border-box}
.tripo-titlebar-glass[hidden] {display:none!important}
@supports (backdrop-filter:blur(1px)) {
 .tripo-titlebar-glass {background:color-mix(in srgb,color-mix(in srgb,var(--tripo-titlebar-safe) 80%,var(--tripo-titlebar-tint)) var(--tripo-titlebar-opacity,82%),transparent);backdrop-filter:blur(var(--tripo-titlebar-blur)) saturate(1.15);-webkit-backdrop-filter:blur(var(--tripo-titlebar-blur)) saturate(1.15)}
}
@media(prefers-reduced-transparency:reduce) {
 .tripo-titlebar-glass {background:var(--tripo-titlebar-safe)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
 .tw-shell .tw-topnav {background:var(--tps-user-top,var(--tps-surface-color))!important;backdrop-filter:none!important}
}
@media(forced-colors:active) {
 .tripo-titlebar-glass {background:Canvas!important;backdrop-filter:none!important}
 .tw-shell[data-custom-base=true][data-surface],.tw-shell[data-custom-top=true] .tw-topnav {background:Canvas!important;--tps-base:Canvas;--tps-surface:Canvas;--tps-text:CanvasText;--tps-muted:CanvasText;--tps-hover:Canvas;--tps-top-fill:Canvas}
 .tw-shell[data-custom-accent=true] {--tps-accent:Highlight;--tps-on-accent:HighlightText}
}

/* 0.2.8: decoration alpha never affects text; native option popups are opaque. */
.tw-shell {--tps-control-fill:var(--tps-surface-color);--tps-title-fill:var(--tps-user-top,var(--tps-surface-color))}
@supports (backdrop-filter:blur(1px)) {
 .tw-shell[data-surface=glass] {--tps-control-fill:color-mix(in srgb,var(--tps-surface-color) var(--tps-control-opacity,92%),transparent);--tps-title-fill:color-mix(in srgb,var(--tps-user-top,var(--tps-surface-color)) var(--tps-titlebar-opacity,82%),transparent)}
}
.tw-shell .tw-topnav {background:var(--tps-title-fill);--tps-control-fill:var(--tps-user-top,var(--tps-surface-color))}
@supports(backdrop-filter:blur(1px)){.tw-shell[data-surface=glass] .tw-topnav{--tps-control-fill:color-mix(in srgb,var(--tps-user-top,var(--tps-surface-color)) var(--tps-control-opacity,92%),transparent)}}
.tw-shell :is(.tw-root,.tw-topnav,.tps-col) :is(button,select,input:not([type=checkbox]):not([type=file]):not([type=range]):not([type=color]),textarea):not(.tw-image-card) {background:var(--tps-control-fill);color:var(--tps-text);border-color:var(--tps-border)}
.tw-shell .tw-steps button[aria-current=step] {background:var(--tps-control-fill);border:2px solid var(--tps-accent);box-shadow:inset 0 0 0 1px var(--tps-accent)}
.tw-shell .tw-topnav button[aria-selected=true] {background:var(--tps-control-fill)}
.tw-shell :is(select option,select optgroup) {background:var(--tps-surface-color)!important;color:var(--tps-popup-text)!important;color-scheme:inherit}
.tw-shell :is(.tw-dialog,.tw-floating-dialog,.tps-modal-card) {--tps-control-fill:var(--tps-surface-color)}
.tw-shell :is(.tw-dialog,.tw-floating-dialog,.tps-modal-card) :is(button,select,input,textarea) {background:var(--tps-surface-color);color:var(--tps-popup-text)}
.tw-shell .tw-model-plan {padding:16px;margin:12px 0 20px;border:2px solid var(--tps-accent);border-radius:12px}
.tw-shell .tw-storage-path {overflow-wrap:anywhere;white-space:normal}
.tw-shell .tw-price-note a {color:inherit;text-decoration:underline}
@media(prefers-reduced-transparency:reduce) {.tw-shell {--tps-control-fill:var(--tps-surface-color)!important;--tps-title-fill:var(--tps-surface-color)!important}}
@media(forced-colors:active) {.tw-shell {--tps-control-fill:Canvas!important;--tps-title-fill:Canvas!important}.tw-shell :is(select option,select optgroup) {background:Canvas!important;color:CanvasText!important}}

/* 0.2.9: links and inline credentials share control alpha; real safety dialogs remain legible. */
.tw-shell .tw-root :is(a,.tw-credentials button,.tw-credentials input:not([type=checkbox])) {background:var(--tps-control-fill);color:var(--tps-text)}
.tw-shell .tw-root :is(.tw-note,.tw-upload) {background:var(--tps-control-fill)}
.tw-shell .tw-doc-links {display:flex;flex-wrap:wrap;gap:10px;align-items:stretch;margin-top:16px}
.tw-shell .tw-doc-links a {display:inline-flex;align-items:center;white-space:normal;max-width:100%;overflow-wrap:anywhere;margin:0}
.tw-shell .tw-root[data-stage="0"] {background:transparent!important}
@supports(backdrop-filter:blur(1px)){.tw-shell[data-surface=glass]:has(.tw-root[data-stage="0"]) {background:transparent}}
.tw-shell .tw-prompt-hint {margin:8px 0 12px;overflow-wrap:anywhere}
.tw-shell .tw-image-edit {margin-top:24px;padding-top:20px;border-top:1px solid var(--tps-border)}
.tw-shell .tw-crop-toolbar {display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px}
.tw-shell .tw-crop-toolbar label {margin:0;min-width:0;max-width:100%}
.tw-shell .tw-crop-toolbar input[type=color] {width:72px;height:36px;padding:2px}
.tw-shell .tw-crop-toolbar input[type=file] {max-width:100%}
.tw-shell .tw-task-outputs {display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}
.tw-shell .tw-task-output {display:flex;flex-direction:column;gap:8px;max-width:100%;width:180px}
.tw-shell .tw-task-output img {width:100%;height:160px;object-fit:contain}
.tw-shell .tw-recovery {border:1px solid var(--tps-border);padding:12px;min-width:0}
.tw-shell .tw-recovery :is(p,small,legend),.tw-shell .tw-job :is(small,p) {overflow-wrap:anywhere}
.tw-shell .tw-delete-confirm {border:1px solid var(--tps-danger);padding:12px}
.tw-shell .tw-delete-confirm button {margin:4px}
.tw-shell :is(.tw-dialog,.tw-floating-dialog) {background:var(--tps-surface-color);color:var(--tps-popup-text)}
.tw-shell :is(.tw-dialog,.tw-floating-dialog) :is(a,pre,.tw-note) {background:var(--tps-surface-color);color:var(--tps-popup-text)}
@media(prefers-reduced-transparency:reduce){.tw-shell[data-surface=glass]{background:var(--tps-base)!important}}
@media(forced-colors:active){.tw-shell[data-surface=glass]{background:Canvas!important}}
/* Explicit paid-task review is neutral, irrespective of personalized green accents. */
.tw-shell .tw-modal{background:rgba(25,27,32,.68)}
.tw-shell .tw-approval-dialog{
  --tps-surface-color:#f8f9fb;--tps-base-color:#eef1f4;
  --tps-surface:#f8f9fb;--tps-base:#eef1f4;--tps-popup-text:#242b35;
  --tps-text:#242b35;--tps-muted:#485364;--tps-border:#cdd3dc;
  --tps-control-fill:#eef1f4;
  background:#f8f9fb;color:#242b35;border:1px solid #cdd3dc;
}
.tw-shell[data-theme=dark] .tw-approval-dialog{
  --tps-surface-color:#272d37;--tps-base-color:#323a46;
  --tps-surface:#272d37;--tps-base:#323a46;--tps-popup-text:#eef0f4;
  --tps-text:#eef0f4;--tps-muted:#d0d8e2;--tps-border:#536171;
  --tps-control-fill:#323a46;
  background:#272d37;color:#eef0f4;border-color:#536171;
}
.tw-shell .tw-approval-dialog .tw-primary{background:#414f64;border-color:#414f64;color:#fff}
.tw-shell .tw-approval-dialog .tw-primary:hover:not(:disabled){background:#303c4e;border-color:#303c4e}
.tw-shell .tw-approval-dialog .tw-consent input{accent-color:#414f64}

/* 0.2.11: semantic flow layout, control alpha without fading content. */
.tw-shell .tw-image-card{background:transparent}
.tw-shell .tw-image-card>div{background:var(--tps-control-fill)}
.tw-shell .tw-source-preview{display:grid;gap:6px;margin:12px 0 18px;min-width:0}
.tw-shell .tw-source-preview img{height:180px;object-fit:contain}
.tw-shell .tw-recovery,.tw-shell .tw-convert,.tw-shell .tw-manual-import{min-width:0;max-width:100%}
.tw-shell .tw-recovery h3,.tw-shell .tw-convert h3{margin:0 0 12px;font-size:var(--tps-control-font);line-height:1.65;overflow-wrap:anywhere}
.tw-shell .tw-model-fields{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}
.tw-shell .tw-model-fields>label{min-width:0;width:100%}
.tw-shell .tw-model-fields :is(input:not([type=checkbox]),select){box-sizing:border-box;width:100%;max-width:100%;height:var(--tps-control-height);min-width:0}
.tw-shell .tw-model-fields input[type=checkbox]{width:auto}
.tw-shell .tw-convert-actions{display:flex;flex-direction:column;align-items:flex-start;gap:12px;margin-top:16px}
.tw-shell .tw-convert-actions>button{height:auto;white-space:normal;max-width:100%;line-height:1.6}
.tw-shell .tw-convert-actions>p{margin:0;max-width:100%}
.tw-shell .tw-convert-actions a{display:inline-flex;align-items:center;white-space:normal;max-width:100%;line-height:1.6}
.tw-shell .tw-model-price-tips{margin:12px 0}
.tw-shell .tw-model-price-tips table{border-collapse:collapse;width:100%;text-align:left;font-size:12px}
.tw-shell .tw-model-price-tips :is(td,th){padding:6px;border-bottom:1px solid var(--tps-border)}
.tw-shell .tw-hidden-jobs{margin:16px 0;border:1px solid var(--tps-border);border-radius:8px;padding:12px;min-width:0}
.tw-shell .tw-hidden-jobs summary{cursor:pointer;overflow-wrap:anywhere}
.tw-shell .tw-hidden-job{margin:12px 0;overflow-wrap:anywhere}
@container tripo-workbench (max-width:620px){.tw-shell .tw-model-fields{grid-template-columns:1fr}}
@media(max-width:600px){.tw-shell .tw-model-fields{grid-template-columns:1fr}}
`
