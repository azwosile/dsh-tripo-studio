// 0.3.0 studio layout (REQ-048～051), reshaped in 0.3.2 into a canvas-first vertical flow (REQ-062～066);
// 0.3.1 additions (REQ-056～060) at the end. Appended after workflow/appearance CSS so it only
// re-arranges regions; colours keep using the existing --tps-* palette and glass tokens.
// Never put backdrop-filter on .tw-root/.tw-workspace/.tw-canvas: it would trap fixed overlays.
export const studioCss = `
.tw-shell .tw-root.tw-studio{display:flex;flex-direction:column;gap:8px;padding:10px 14px 12px;overflow:auto}
.tw-shell .tw-studio>*{flex:none}
.tw-shell .tw-studio :is(.tw-appbar,.tw-library,.tw-lib-rail,.tw-inspector,.tw-dock){background:var(--tps-glass,var(--tps-surface,#fff));border:1px solid var(--tps-border,#dce2d9);border-radius:12px;backdrop-filter:var(--tps-frost);-webkit-backdrop-filter:var(--tps-frost);box-shadow:var(--tps-shadow,none)}
.tw-shell .tw-studio .tw-appbar{display:flex;flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;text-align:left;gap:8px;flex-wrap:wrap;margin:0;padding:6px 10px}
.tw-shell .tw-studio .tw-brand{display:flex;align-items:baseline;gap:8px;margin-right:4px;white-space:nowrap}
.tw-shell .tw-studio .tw-brand strong{font-size:14px;letter-spacing:.2px}
.tw-shell .tw-studio .tw-project-pick{display:flex;align-items:center;gap:6px;margin:0}
.tw-shell .tw-studio .tw-project-pick>span{font-size:11px;color:var(--tps-muted,#6e7f73);white-space:nowrap}
.tw-shell .tw-studio .tw-project-pick select{width:200px;max-width:40vw}
.tw-shell .tw-studio .tw-appbar-spacer{flex:1 1 0}
.tw-shell .tw-studio .tw-appbar :is(select,button,.tw-pill){height:var(--tps-control-height,34px);min-height:0;box-sizing:border-box;margin-top:0;margin-bottom:0;padding-top:0;padding-bottom:0}
.tw-shell .tw-studio .tw-appbar :is(.tw-pill,.tw-connect){flex:none;width:188px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;text-align:center;white-space:nowrap;min-height:var(--tps-control-height,32px)}
.tw-shell .tw-studio .tw-appbar button[aria-expanded=true]{border-color:var(--tps-accent,#315d49)}
.tw-shell .tw-studio .tw-alert{margin:0}
.tw-shell .tw-studio .tw-upgrade code{font-size:11px;overflow-wrap:anywhere}
.tw-shell .tw-studio .tw-upgrade{display:block}
.tw-shell .tw-studio .tw-upgrade button{margin-left:8px;white-space:nowrap;padding:2px 10px}
.tw-shell .tw-studio .tw-steps{display:flex;flex-wrap:wrap;gap:4px;margin:0}
.tw-shell .tw-studio .tw-steps button{display:flex;gap:6px;align-items:baseline;padding:5px 14px;border:2px solid transparent;border-radius:8px;box-shadow:none;transform:none}
.tw-shell .tw-studio .tw-steps button[aria-current=step]{border:2px solid var(--tps-accent,#315d49);font-weight:650}
.tw-shell .tw-studio .tw-steps b{font-size:11px}
.tw-shell .tw-studio .tw-stepbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.tw-shell .tw-studio .tw-stepbar .tw-steps{flex:1 1 auto}
.tw-shell .tw-studio .tw-step-tools{display:flex;gap:6px;align-items:center;margin-left:auto}
.tw-shell .tw-studio .tw-step-tools button{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;white-space:nowrap}
.tw-shell .tw-studio .tw-lib-toggle[aria-expanded=true]{border-color:var(--tps-accent,#315d49)}
/* 0.3.2 REQ-062: [rail | library] + one vertical flow (canvas, then parameters); the whole page scrolls. */
.tw-shell .tw-studio .tw-workspace{position:relative;display:grid;grid-template-columns:44px minmax(0,1fr);gap:10px;align-items:start}
.tw-shell .tw-studio .tw-workspace[data-lib=push]{grid-template-columns:clamp(196px,17vw,260px) minmax(0,1fr)}
.tw-shell .tw-studio .tw-flow{display:flex;flex-direction:column;gap:10px;min-width:0}
.tw-shell .tw-studio .tw-library{min-height:0;display:flex;flex-direction:column;overflow:hidden}
.tw-shell .tw-studio .tw-library[data-mode=push]{position:sticky;top:8px;max-height:calc(100vh - 24px)}
.tw-shell .tw-studio .tw-library[data-mode=overlay]{position:fixed;z-index:60;left:calc(var(--tw-vp-left,0px) + 8px);top:calc(var(--tw-vp-top,0px) + 8px);bottom:calc(var(--tw-vp-bottom,0px) + 8px);width:min(280px,calc(var(--tw-vp-width,100vw) - 32px));background:var(--tps-surface-color,var(--tps-surface,#fff));box-shadow:0 18px 48px rgba(0,0,0,.28)}
.tw-shell .tw-studio .tw-lib-scrim{position:fixed;z-index:59;left:var(--tw-vp-left,0px);top:var(--tw-vp-top,0px);bottom:var(--tw-vp-bottom,0px);width:var(--tw-vp-width,100vw);background:rgba(10,16,20,.28)}
.tw-shell .tw-studio .tw-lib-close{order:3;padding:2px 9px!important;min-height:0!important;font-size:14px;line-height:1.2}
.tw-shell .tw-studio .tw-lib-rail{position:sticky;top:8px;display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:6px 4px;width:44px;box-sizing:border-box}
.tw-shell .tw-studio .tw-lib-rail button{display:flex;flex-direction:column;align-items:center;gap:1px;padding:5px 0!important;min-height:0!important;font-size:12px;line-height:1.1;border-radius:8px}
.tw-shell .tw-studio .tw-lib-rail button b{font-size:9px;font-weight:500;opacity:.7}
.tw-shell .tw-studio .tw-lib-rail button[aria-pressed=true]{border-color:var(--tps-accent,#315d49)}
.tw-shell .tw-studio .tw-lib-rail .tw-rail-open{font-size:15px}
.tw-shell .tw-studio .tw-lib-rail .tw-rail-import{position:relative;overflow:hidden;display:flex;justify-content:center;padding:5px 0;border:1px solid var(--tps-border,#dce2d9);border-radius:8px;cursor:pointer;font-size:14px;background:var(--tps-control-fill,transparent)}
.tw-shell .tw-studio .tw-lib-rail .tw-rail-import input{position:absolute;inset:0;opacity:0;cursor:pointer}
.tw-shell .tw-studio .tw-canvas{min-width:0;border-radius:12px}
.tw-shell .tw-studio .tw-canvas>.tw-panel{padding:16px 18px;margin:0}
/* REQ-063: parameters below the canvas, laid out in columns; the action row sits at its bottom. */
.tw-shell .tw-studio .tw-inspector{display:flex;flex-direction:column;overflow:visible}
.tw-shell .tw-studio .tw-inspector .tw-insp-body{columns:2 320px;column-gap:22px;overflow:visible;flex:none}
.tw-shell .tw-studio .tw-inspector .tw-insp-body>*{break-inside:avoid}
.tw-shell .tw-studio .tw-inspector .tw-insp-body>.tw-insp-title{column-span:all}
.tw-shell .tw-studio .tw-inspector .tw-insp-foot{justify-content:flex-end}
.tw-shell .tw-studio .tw-inspector .tw-insp-foot>button{flex:0 1 auto;min-width:180px}
/* REQ-064: sticky "go" bar when the action row is below the visible area. */
.tw-shell .tw-studio .tw-gobar{position:fixed;z-index:50;left:calc(var(--tw-vp-left,0px) + max(12px,(var(--tw-vp-width,100vw) - 760px)/2));width:min(736px,calc(var(--tw-vp-width,100vw) - 24px));bottom:calc(var(--tw-vp-bottom,0px) + 12px);box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--tps-border,#dce2d9);border-radius:12px;background:var(--tps-surface-color,var(--tps-surface,#fff));box-shadow:0 10px 30px rgba(0,0,0,.18)}
.tw-shell .tw-studio .tw-gobar-text{flex:1 1 auto;min-width:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tw-shell .tw-studio .tw-gobar button{flex:none;padding:6px 12px}
.tw-shell .tw-studio .tw-canvas .tw-section-title{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-bottom:8px;min-width:0}
.tw-shell .tw-studio .tw-canvas .tw-section-title h2{overflow-wrap:anywhere;min-width:0}
.tw-shell .tw-studio .tw-canvas .tw-section-title h2{margin:0;font-size:16px}
/* Library */
.tw-shell .tw-studio .tw-lib-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 10px 6px}
.tw-shell .tw-studio .tw-lib-head h2{font-size:14px;margin:0}
.tw-shell .tw-studio .tw-lib-import{margin:0!important;padding:5px 11px!important;min-height:0!important;width:auto!important;font-size:12px;border-radius:7px;background:var(--tps-accent,#315d49);color:var(--tps-on-accent,#fff);border:0;cursor:pointer;display:inline-flex;align-items:center;position:relative;overflow:hidden}
.tw-shell .tw-studio .tw-lib-import input{position:absolute;inset:0;opacity:0;cursor:pointer}
.tw-shell .tw-studio .tw-lib-search{margin:0 10px 6px;width:calc(100% - 20px)!important;min-width:0;font-size:12px}
.tw-shell .tw-studio .tw-lib-filters{display:flex;flex-wrap:wrap;gap:4px;padding:0 10px 8px;border-bottom:1px solid var(--tps-border,#dce2d9)}
.tw-shell .tw-studio .tw-lib-filters button{padding:2px 9px;font-size:11px;border-radius:999px;min-height:0}
.tw-shell .tw-studio .tw-lib-filters button[aria-pressed=true]{background:var(--tps-accent,#315d49);color:var(--tps-on-accent,#fff);border-color:transparent}
.tw-shell .tw-studio .tw-lib-filters b{font-weight:500;opacity:.75}
.tw-shell .tw-studio .tw-lib-scroll{flex:1;min-height:0;overflow:auto;padding:8px 10px 10px}
.tw-shell .tw-studio .tw-lib-grid{grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;grid-auto-rows:max-content}
.tw-shell .tw-studio .tw-lib-grid .tw-image-commands{margin:3px 0 0}
.tw-shell .tw-studio .tw-lib-grid .tw-image-commands button{padding:2px 6px;font-size:10px;min-height:0;opacity:.8}
.tw-shell .tw-studio .tw-lib-models h3{font-size:12px;margin:12px 0 6px}
.tw-shell .tw-studio .tw-lib-model{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:6px;align-items:center;padding:6px 0;border-top:1px solid var(--tps-border,#dce2d9)}
.tw-shell .tw-studio .tw-lib-model strong{display:block;font-size:12px;overflow-wrap:anywhere}
.tw-shell .tw-studio .tw-lib-model :is(button,a){padding:2px 8px;font-size:11px;min-height:0}
/* Inspector */
.tw-shell .tw-studio .tw-insp-body{padding:12px 14px}
.tw-shell .tw-studio .tw-insp-body>label,.tw-shell .tw-studio .tw-insp-body .tw-fold>label{display:block;margin:0 0 10px}
.tw-shell .tw-studio .tw-insp-title{font-size:13px;margin:0 0 10px;display:flex;align-items:baseline;gap:8px}
.tw-shell .tw-studio .tw-insp-title small{display:inline;font-weight:400}
.tw-shell .tw-studio div.tw-insp-title h3{font-size:13px;margin:0}
.tw-shell .tw-studio .tw-insp-foot{flex:none;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 14px;border-top:1px solid var(--tps-border,#dce2d9)}
.tw-shell .tw-studio .tw-insp-foot>button{flex:1 1 auto}
.tw-shell .tw-studio .tw-insp-foot .tw-actions{display:flex;flex-wrap:wrap;gap:8px;margin:0;width:100%}
.tw-shell .tw-studio .tw-insp-foot .tw-actions button{flex:1 1 auto}
.tw-shell .tw-studio .tw-insp-foot .tw-actions small{flex-basis:100%}
.tw-shell .tw-studio .tw-inspector .tw-image-edit{margin-top:14px;padding-top:12px;border-top:1px solid var(--tps-border,#dce2d9)}
.tw-shell .tw-studio .tw-inspector .tw-fields{grid-template-columns:1fr}
.tw-shell .tw-studio .tw-inspector .tw-convert{margin:14px 0 4px;padding:12px}
.tw-shell .tw-studio .tw-inspector .tw-manual-import{margin:0;padding:12px}
.tw-shell .tw-studio .tw-source-mini{display:grid;grid-template-columns:64px minmax(0,1fr);gap:10px;align-items:center;margin:0 0 10px}
.tw-shell .tw-studio .tw-source-mini img{height:72px}
.tw-shell .tw-studio .tw-fold{border:1px dashed var(--tps-border,#cfd8cf);border-radius:9px;padding:6px 10px;margin:8px 0}
.tw-shell .tw-studio .tw-fold>summary{cursor:pointer;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:4px 0;font-weight:600}
.tw-shell .tw-studio .tw-fold[open]>summary{margin-bottom:8px}
.tw-shell .tw-studio .tw-info{margin:4px 0 10px;font-size:11px;color:var(--tps-muted,#6e7f73)}
.tw-shell .tw-studio .tw-info>summary{cursor:pointer;width:max-content;list-style:none}
.tw-shell .tw-studio .tw-info>summary::-webkit-details-marker{display:none}
.tw-shell .tw-studio .tw-info>div{padding:6px 8px;margin-top:4px;border-radius:7px;background:var(--tps-control-fill,var(--tps-base,#f4f6f2));line-height:1.7}
.tw-shell .tw-studio .tw-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:500;border:1px solid var(--tps-border,#cfd8cf);white-space:nowrap}
.tw-shell .tw-studio .tw-chip.run{color:#2d5b8a;border-color:#9fbfdc}
.tw-shell .tw-studio .tw-chip.ok{color:#2c6a49;border-color:#9fcdb3}
.tw-shell .tw-studio .tw-chip.bad{color:#a4372f;border-color:#e0a8a2}
.tw-shell[data-theme=dark] .tw-studio .tw-chip.run{color:#a9ccf2}.tw-shell[data-theme=dark] .tw-studio .tw-chip.ok{color:#9fdcb8}.tw-shell[data-theme=dark] .tw-studio .tw-chip.bad{color:#f2aaa3}
.tw-shell .tw-studio .tw-legend{margin:0 0 10px;padding-left:18px;font-size:12px;line-height:1.9}
/* Canvas pages */
.tw-shell .tw-studio .tw-hero{display:flex;flex-direction:column;align-items:center;gap:8px}
/* REQ-065: the canvas image may use up to 72vh. */
.tw-shell .tw-studio .tw-hero-image img{height:min(72vh,960px);width:auto;max-width:100%;object-fit:contain;margin:auto;border-radius:10px}
.tw-shell .tw-studio .tw-canvas-empty{display:grid;place-items:center;text-align:center;min-height:320px;align-content:center;gap:8px}
.tw-shell .tw-studio .tw-origin-row{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 8px;align-items:stretch}
.tw-shell .tw-studio .tw-origin-row .tw-image-tile{flex:0 0 104px}
.tw-shell .tw-studio .tw-origin-arrow{align-self:center;font-size:18px;opacity:.6}
.tw-shell .tw-studio .tw-crop-viewport{min-height:200px}
/* Relations (source → part → 3D) */
.tw-shell .tw-studio .tw-rel-summary{font-size:12px;margin:0 0 10px}
.tw-shell .tw-studio .tw-rel-head,.tw-shell .tw-studio .tw-rel-group{display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px}
.tw-shell .tw-studio .tw-rel-head{font-size:11px;color:var(--tps-muted,#6e7f73);padding:0 4px 4px;grid-template-columns:150px minmax(0,1.25fr) minmax(0,.8fr)}
.tw-shell .tw-studio .tw-rel-group{padding:12px 4px;border-top:1px solid var(--tps-border,#dce2d9)}
.tw-shell .tw-studio .tw-rel-source{display:flex;flex-direction:column;gap:6px;min-width:0}
.tw-shell .tw-studio .tw-rel-actions{display:flex;flex-wrap:wrap;gap:4px}
.tw-shell .tw-studio .tw-rel-actions button,.tw-shell .tw-studio .tw-rel-line button{padding:2px 8px;font-size:11px;min-height:0}
.tw-shell .tw-studio .tw-rel-parts{display:flex;flex-direction:column;gap:6px;min-width:0}
.tw-shell .tw-studio .tw-rel-row{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,.8fr);gap:8px;align-items:center;padding-left:calc(var(--depth,0) * 18px)}
.tw-shell .tw-studio .tw-rel-part{display:grid;grid-template-columns:56px minmax(0,1fr);gap:8px;align-items:center;padding:6px;border:1px solid var(--tps-border,#dce2d9);border-radius:9px;background:var(--tps-surface,#fff)}
.tw-shell .tw-studio .tw-rel-part.on{border-color:var(--tps-accent,#315d49);box-shadow:0 0 0 1px var(--tps-accent,#315d49)}
.tw-shell .tw-studio .tw-rel-thumb{padding:0!important;border:0!important;background:var(--tps-base,#f4f6f2)!important;border-radius:7px;cursor:zoom-in}
.tw-shell .tw-studio .tw-rel-thumb img{display:block;width:56px;height:56px;object-fit:contain}
.tw-shell .tw-studio .tw-rel-meta{min-width:0}
.tw-shell .tw-studio .tw-rel-meta strong{display:block;font-size:12px;overflow-wrap:anywhere}
.tw-shell .tw-studio .tw-rel-line{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:3px;font-size:11px}
.tw-shell .tw-studio .tw-rel-line label{display:inline-flex;gap:4px;align-items:center;margin:0}
.tw-shell .tw-studio .tw-rel-arrow{opacity:.55}
.tw-shell .tw-studio .tw-rel-models,.tw-shell .tw-studio .tw-rel-model{display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-width:0}
.tw-shell .tw-studio .tw-rel-file{display:inline-flex;gap:4px;align-items:center;font-size:11px}
.tw-shell .tw-studio .tw-rel-file :is(button,a){padding:1px 7px;font-size:11px;min-height:0}
/* Task dock */
.tw-shell .tw-studio .tw-dock{display:flex;flex-direction:column;min-height:0}
.tw-shell .tw-studio .tw-dock-head{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 10px}
.tw-shell .tw-studio .tw-dock-toggle{font-weight:650;border:0!important;background:transparent!important;padding:4px 6px!important}
.tw-shell .tw-studio .tw-dock-spacer{flex:1}
.tw-shell .tw-studio .tw-dock-head>button:not(.tw-dock-toggle){padding:4px 10px;font-size:12px}
/* REQ-066: tasks are an ordinary block at the bottom of the page (no inner scroll). */
.tw-shell .tw-studio .tw-dock{scroll-margin-top:8px}
.tw-shell .tw-studio .tw-dock-body{padding:0 10px 10px;border-top:1px solid var(--tps-border,#dce2d9)}
.tw-shell .tw-studio .tw-dock-body .tw-job{margin:8px 0}
/* Narrow DSH slot (0.3.2 REQ-062): the same vertical flow without the rail; the library is a drawer. */
.tw-shell .tw-studio[data-narrow=true]{padding:8px}
.tw-shell .tw-studio[data-narrow=true] .tw-workspace{grid-template-columns:minmax(0,1fr)}
.tw-shell .tw-studio[data-narrow=true] .tw-inspector .tw-insp-foot>button{flex:1 1 auto;min-width:0}
.tw-shell .tw-studio[data-narrow=true] .tw-step-tools{margin-left:0;width:100%}
.tw-shell .tw-studio[data-narrow=true] .tw-step-tools button{flex:1 1 0;justify-content:center}
.tw-shell .tw-studio[data-narrow=true] .tw-appbar-spacer{display:none}
.tw-shell .tw-studio[data-narrow=true] .tw-project-pick select{width:150px}
.tw-shell .tw-studio[data-narrow=true] .tw-steps{flex-wrap:nowrap;overflow-x:auto}
.tw-shell .tw-studio[data-narrow=true] .tw-steps button{padding:6px 8px;font-size:11px;white-space:nowrap;flex:none}
.tw-shell .tw-studio[data-narrow=true] .tw-brand strong{display:none}
.tw-shell .tw-studio[data-narrow=true] .tw-canvas-empty{min-height:200px}
.tw-shell .tw-studio[data-narrow=true] .tw-rel-group,.tw-shell .tw-studio[data-narrow=true] .tw-rel-head{grid-template-columns:1fr}
.tw-shell .tw-studio[data-narrow=true] .tw-rel-head{display:none}
.tw-shell .tw-studio[data-narrow=true] .tw-rel-row{grid-template-columns:1fr}
.tw-shell .tw-studio[data-narrow=true] .tw-rel-arrow{display:none}
.tw-shell .tw-studio[data-narrow=true] .tw-hero-image img{height:auto;max-height:72vh}
/* Synchronous fallback before the ResizeObserver reports: never let the 3-column grid overflow. */
@media (max-width:819px){.tw-shell .tw-studio .tw-workspace{grid-template-columns:minmax(0,1fr)}.tw-shell .tw-studio .tw-lib-rail{display:none}}
/* ---- 0.3.1 (REQ-056～060) ---- */
/* REQ-056: several task cards per row; toolbars, confirmations and the hidden list span the row. */
.tw-shell .tw-jobs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:10px;align-items:start}
.tw-shell .tw-jobs>:not(.tw-job){grid-column:1/-1}
.tw-shell .tw-studio .tw-dock-body .tw-job{margin:0}
.tw-shell .tw-jobs .tw-job{min-width:0;margin:0}
.tw-shell .tw-jobs .tw-task-outputs{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin:8px 0}
.tw-shell .tw-jobs .tw-output-image img{height:110px}
/* REQ-058: 3D reference image (locally rendered still of a downloaded model). */
.tw-shell .tw-model-thumb{position:relative;display:grid;place-items:center;aspect-ratio:1;width:100%;min-width:0;padding:0!important;border:1px solid var(--tps-border,#dce2d9)!important;border-radius:9px;background:radial-gradient(circle at 50% 38%,color-mix(in srgb,var(--tps-surface,#fff) 90%,transparent),color-mix(in srgb,var(--tps-base,#eef1ec) 80%,transparent))!important;overflow:hidden;color:var(--tps-muted,#6b766d)}
.tw-shell button.tw-model-thumb{cursor:zoom-in}
.tw-shell button.tw-model-thumb:hover{border-color:var(--tps-accent,#315d49)!important}
.tw-shell .tw-model-thumb img{display:block;width:100%;height:100%;object-fit:contain}
.tw-shell .tw-thumb-empty{display:grid;place-items:center;gap:2px;font-size:22px;line-height:1;text-align:center}
.tw-shell .tw-thumb-empty small{font-size:10px;line-height:1.3}
.tw-shell .tw-model-thumb.small{width:64px;flex:none}
.tw-shell .tw-model-thumb.small .tw-thumb-empty{font-size:16px}
.tw-shell .tw-model-thumb.small .tw-thumb-empty small{display:none}
.tw-shell .tw-job-ref{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:6px;margin:6px 0}
.tw-shell .tw-job-ref>.tw-model-thumb:only-child{grid-column:1/-1;max-width:220px}
.tw-shell .tw-job-ref-input{position:relative;padding:0!important;border:1px solid var(--tps-border,#dce2d9)!important;border-radius:9px;background:var(--tps-base,#f4f6f2)!important;overflow:hidden;cursor:zoom-in;aspect-ratio:1;min-width:0}
.tw-shell .tw-job-ref-input img{display:block;width:100%;height:100%;object-fit:contain}
.tw-shell .tw-job-ref-input small,.tw-shell .tw-job-ref>.tw-model-thumb:not(.small)::after{position:absolute;left:6px;bottom:5px;padding:1px 6px;border-radius:6px;font-size:10px;background:color-mix(in srgb,var(--tps-surface,#fff) 82%,transparent);color:var(--tps-text,#1d2a24)}
.tw-shell .tw-job-ref>.tw-model-thumb:not(.small)::after{content:'3D 参考图'}
.tw-shell .tw-job-ref-arrow{color:var(--tps-muted,#6b766d)}
/* REQ-057 creation-page library: 3D models as tiles like images. */
.tw-shell .tw-studio .tw-lib-model-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.tw-shell .tw-studio .tw-lib-model{display:flex;flex-direction:column;gap:4px;padding:0;border-top:0;min-width:0}
.tw-shell .tw-studio .tw-lib-model-meta small{display:block;font-size:10px;color:var(--tps-muted,#6b766d)}
.tw-shell .tw-studio .tw-lib-model-cmd{display:flex;gap:4px}
/* REQ-059/060 relation page: direct (uncropped) modelling row and glass part cards. */
.tw-shell .tw-studio .tw-rel-part,.tw-shell .tw-studio .tw-rel-model{background:var(--tps-control-fill,var(--tps-surface,#fff));border-color:var(--tps-border,#dce2d9)}
.tw-shell .tw-studio .tw-rel-model{padding:4px;border:1px solid var(--tps-border,#dce2d9);border-radius:9px}
.tw-shell .tw-studio .tw-rel-thumb{background:color-mix(in srgb,var(--tps-base,#f4f6f2) 70%,transparent)!important}
@supports (backdrop-filter:blur(1px)){.tw-shell[data-surface=glass] .tw-studio :is(.tw-rel-part,.tw-rel-model){backdrop-filter:var(--tps-frost);-webkit-backdrop-filter:var(--tps-frost)}}
@media (prefers-reduced-transparency:reduce){.tw-shell .tw-studio :is(.tw-rel-part,.tw-rel-model){background:var(--tps-surface-color,var(--tps-surface,#fff));backdrop-filter:none}}
.tw-shell .tw-studio .tw-rel-direct .tw-rel-part{border-style:dashed}
/* REQ-057 3D preview page asset library. */
.tw-shell .tps-preview3d .tps-import{width:100%;margin-bottom:10px}
.tw-shell .tps-preview3d .tps-project{display:block;margin-bottom:8px}
.tw-shell .tps-preview3d .tps-project select,.tw-shell .tps-preview3d .tps-search{width:100%;box-sizing:border-box;min-height:var(--tps-control-height,34px);border:1px solid var(--tps-border,#e5e9e1);border-radius:7px;padding:4px 8px;font:inherit;font-size:12px}
.tw-shell .tps-preview3d .tps-search{margin-bottom:10px}
.tw-shell .tps-preview3d .tps-3d-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;margin:6px 0 10px}
.tw-shell .tps-preview3d .tps-3d-card{position:relative;min-width:0}
.tw-shell .tps-preview3d .tps-3d-open{display:flex;flex-direction:column;gap:4px;width:100%;padding:4px!important;border:1px solid var(--tps-border,#e5e9e1);border-radius:10px;text-align:left;cursor:pointer;font:inherit;color:inherit}
.tw-shell .tps-preview3d .tps-3d-card.on .tps-3d-open{border-color:var(--tps-accent,#315d49);box-shadow:0 0 0 1px var(--tps-accent,#315d49)}
.tw-shell .tps-preview3d .tps-3d-open:disabled{cursor:default;opacity:.85}
.tw-shell .tps-preview3d .tps-3d-caption strong{display:block;font-size:11px;font-weight:600;overflow-wrap:anywhere}
.tw-shell .tps-preview3d .tps-3d-caption small{font-size:10px;color:var(--tps-muted,#6b766d)}
.tw-shell .tps-preview3d .tps-3d-download{position:absolute;top:8px;right:8px;padding:0 7px;border-radius:6px;font-size:12px;text-decoration:none;border:1px solid var(--tps-border,#e5e9e1)}
.tw-shell .tps-preview3d .tps-stage-empty{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:8px;padding:24px;text-align:center;font-size:12px;color:var(--tps-muted,#6b766d);pointer-events:none}
.tw-shell .tps-preview3d .tps-stage-empty span{font-size:34px}
.tw-shell .tps-preview3d .tps-grid{flex:1 1 auto}
`
