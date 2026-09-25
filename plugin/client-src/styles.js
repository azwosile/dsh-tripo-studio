/**
 * Workbench stylesheet, kept as a string so the client bundle stays a single
 * script (DSH client bundles carry their own CSS, no sidecar file).
 * Colors ride the DSH alias variables so the panel follows the app theme.
 */
export const css = `
.tps-root{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--tps-base,#f6f7f4);color:var(--tps-text,#28352f);font-size:13px;overflow:hidden}
.tps-head{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--tps-border,#e5e9e1);flex:0 0 auto}
.tps-head h1{font-size:14px;margin:0;font-weight:600}
.tps-head p{margin:0;font-size:11px;color:var(--tps-muted,#8b958b)}
.tps-badge{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11px;padding:5px 9px;border-radius:6px;border:1px solid var(--tps-border,#e0e6d7);background:var(--tps-hover,#eef3e9);color:var(--tps-muted,#63794e)}
.tps-badge i{width:6px;height:6px;border-radius:50%;background:#71985f;display:inline-block}
.tps-grid{flex:1 1 auto;display:grid;grid-template-columns:264px minmax(280px,1fr) 220px;gap:12px;padding:12px 14px;min-height:0}
.tps-col{background:var(--tps-surface,#fff);border:1px solid var(--tps-border,#e3e7df);border-radius:10px;overflow:auto;padding:16px;min-height:0}
.tps-col.center{background:#eeeeea;padding:0;display:flex;flex-direction:column;overflow:hidden}
.tps-title{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600;margin-bottom:14px}
.tps-title em{font-style:normal;font-size:8px;letter-spacing:1.2px;color:var(--tps-subtle,#a4aca3);font-weight:400}
.tps-tabs{display:flex;padding:3px;background:var(--tps-hover,#f1f3ee);border-radius:7px;margin-bottom:16px}
.tps-tabs button{flex:1;border:0;background:none;padding:7px 0;border-radius:5px;font:inherit;font-size:12px;color:var(--tps-muted,#8b958b);cursor:pointer}
.tps-tabs button.on{background:var(--tps-surface,#fff);color:var(--tps-accent,#365f48);font-weight:600;box-shadow:0 1px 4px #273d3110}
.tps-label{display:flex;justify-content:space-between;font-size:12px;font-weight:500;margin-bottom:8px;color:var(--tps-muted,#5a675d)}
.tps-field{margin-bottom:18px}
.tps-field textarea{width:100%;box-sizing:border-box;min-height:104px;resize:vertical;background:var(--tps-base,#fafbf8);border:1px solid var(--tps-border,#e5e9e1);border-radius:7px;padding:11px;font:inherit;font-size:12px;line-height:1.8;color:inherit}
.tps-count{font-size:9px;color:var(--tps-subtle,#a3aa9e);margin-top:6px;text-align:right}
.tps-drop{display:block;border:1px dashed var(--tps-border,#bac9ad);background:var(--tps-hover,#f6f9f1);border-radius:8px;height:112px;text-align:center;font-size:11px;line-height:1.8;color:var(--tps-muted,#8fa084);cursor:pointer;overflow:hidden;padding:8px;box-sizing:border-box}
.tps-drop img{max-width:100%;max-height:100%;object-fit:contain}
.tps-drop small{display:block;font-size:9px;color:var(--tps-subtle,#a1ad96)}
.tps-styles{display:flex;gap:6px}
.tps-styles button{flex:1;border:1px solid var(--tps-border,#e7eae4);background:none;border-radius:7px;padding:9px 2px;font:inherit;font-size:10px;color:var(--tps-muted,#8a9489);cursor:pointer;display:grid;gap:4px;justify-items:center}
.tps-styles button span{font-size:20px;line-height:1.1}
.tps-styles button.on{background:var(--tps-hover,#edf3e9);border-color:var(--tps-accent,#95ae89);color:var(--tps-accent,#42623b)}
.tps-split{display:flex;gap:10px}
.tps-split>div{flex:1;min-width:0}
.tps-select{width:100%;padding:8px;border-radius:6px;border:1px solid var(--tps-border,#e2e7dd);background:var(--tps-surface,#fff);color:inherit;font:inherit;font-size:11px}
.tps-range{width:100%;accent-color:#69895b;margin:6px 0 0}
.tps-tips{display:flex;justify-content:space-between;font-size:9px;color:var(--tps-subtle,#adb5a5);margin-top:6px}
.tps-switch{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px}
.tps-switch small{display:block;font-size:9px;color:var(--tps-subtle,#9da696);margin-top:4px}
.tps-switch input{appearance:none;width:30px;height:18px;border-radius:12px;background:#cccccc88;position:relative;cursor:pointer;flex:0 0 auto;border:0}
.tps-switch input:checked{background:#6d8d60}
.tps-switch input:after{content:'';position:absolute;left:3px;top:3px;width:12px;height:12px;border-radius:50%;background:#fff;transition:transform .18s}
.tps-switch input:checked:after{transform:translateX(12px)}
.tps-cta{margin-top:20px;border-top:1px solid var(--tps-border,#edf0e6);padding-top:14px}
.tps-cost{display:flex;justify-content:space-between;font-size:10px;color:var(--tps-muted,#909d89);margin-bottom:10px}
.tps-primary{width:100%;border:0;border-radius:7px;background:var(--tps-accent,#315d45);color:#fff;padding:12px;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.tps-primary span{float:right}
.tps-primary:disabled{opacity:.6;cursor:progress}
.tps-hint{font-size:9px;color:var(--tps-subtle,#abb2a5);text-align:center;margin:8px 0 0}
.tps-vtop{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--tps-border,#dce0d8);flex:0 0 auto;background:var(--tps-surface,#f7f8f4)}
.tps-vtop strong{font-size:11px;font-weight:500}
.tps-tag{font-size:8px;border:1px solid var(--tps-border,#d8ddd0);border-radius:3px;padding:2px 4px;color:var(--tps-subtle,#9a9f91)}
.tps-stage{position:relative;flex:1 1 auto;min-height:220px;overflow:hidden}
.tps-stage canvas{display:block;position:absolute;inset:0;width:100%;height:100%}
.tps-tools{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:4px;align-items:center;padding:4px;border-radius:9px;background:var(--tps-surface,#ffffffdd);border:1px solid var(--tps-border,#e0e5db);box-shadow:0 4px 18px #3345330f}
.tps-tools button{width:30px;height:28px;border:0;background:none;border-radius:5px;cursor:pointer;font-size:17px;color:var(--tps-muted,#95a28a)}
.tps-tools button.on{background:var(--tps-hover,#eaf0e4);color:var(--tps-accent,#536f43)}
.tps-tools em{width:1px;height:18px;background:var(--tps-border,#dfe5d9);display:inline-block}
.tps-corner{position:absolute;top:12px;left:14px;font-size:8px;letter-spacing:1.1px;color:var(--tps-subtle,#9da695);pointer-events:none}
.tps-hintline{position:absolute;bottom:56px;width:100%;text-align:center;font-size:9px;color:var(--tps-subtle,#99a190);pointer-events:none}
.tps-vfoot{display:flex;gap:12px;align-items:center;padding:8px 14px;font-size:9px;color:var(--tps-muted,#929b89);border-top:1px solid var(--tps-border,#dce0d8);background:var(--tps-surface,#f2f3ee);flex:0 0 auto}
.tps-vfoot b{font-weight:500;color:var(--tps-text,#68785b)}
.tps-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:color-mix(in srgb,var(--tps-base,#f1f4e8) 88%,transparent);backdrop-filter:blur(4px);z-index:2}
.tps-loading strong{font-size:13px;font-weight:500}
.tps-loading p{font-size:10px;color:var(--tps-muted,#9aaa8a);margin:0}
.tps-spin{width:30px;height:30px;border:2px solid #d3ddc9;border-top-color:#5c8150;border-radius:50%;animation:tps-spin 1s linear infinite}
.tps-bar{width:170px;height:3px;background:#dce5d1;overflow:hidden}
.tps-bar i{display:block;height:100%;background:#688957;transition:width .3s}
.tps-icon{width:44px;height:44px;border-radius:10px;border:1px solid var(--tps-border,#e2e9da);background:var(--tps-hover,#f1f5ec);display:grid;place-items:center;font-size:20px;color:var(--tps-accent,#89a172)}
.tps-name{font-size:14px;font-weight:500;margin:12px 0 4px}
.tps-sub{font-size:8px;letter-spacing:1px;color:var(--tps-subtle,#a0a991);margin:0}
.tps-status{display:flex;justify-content:space-between;font-size:9px;color:var(--tps-muted,#a3ad96);margin-top:14px}
.tps-status b{font-weight:400;border:1px solid var(--tps-border,#e0eacc);border-radius:4px;padding:3px 5px;color:var(--tps-accent,#88a067)}
.tps-h3{font-size:11px;font-weight:500;margin:16px 0 12px;color:var(--tps-muted,#677259);border-top:1px solid var(--tps-border,#edf0e6);padding-top:14px}
.tps-dl{display:grid;grid-template-columns:1fr auto;gap:9px;font-size:10px;margin:0;color:var(--tps-muted,#a0aa93)}
.tps-dl dd{margin:0;text-align:right;color:var(--tps-text,#697a58)}
.tps-sw{display:flex;gap:9px;margin:4px 0 14px}
.tps-sw button{width:22px;height:22px;border-radius:50%;border:3px solid var(--tps-surface,#fff);cursor:pointer;box-shadow:0 0 0 1px var(--tps-border,#e2e6dd)}
.tps-sw button.on{box-shadow:0 0 0 1px var(--tps-accent,#6d8760)}
.tps-export{margin-top:16px;border-top:1px solid var(--tps-border,#edf0e6);padding-top:14px}
.tps-export h4{margin:0 0 6px;font-size:12px;font-weight:500;color:var(--tps-muted,#586d4e)}
.tps-export p{margin:0 0 10px;font-size:10px;line-height:1.7;color:var(--tps-subtle,#a1ad95)}
.tps-secondary{width:100%;border:1px solid var(--tps-border,#dce2d9);background:var(--tps-surface,#fcfdfb);border-radius:7px;padding:10px;font:inherit;font-size:10px;text-align:left;cursor:pointer;color:inherit}
.tps-secondary span{float:right;font-size:8px;color:var(--tps-subtle,#a0ae92)}
.tps-assets{margin:0 14px 12px;border:1px solid var(--tps-border,#e5e9e1);border-radius:10px;background:var(--tps-surface,#fdfefa);padding:10px 12px;flex:0 0 auto}
.tps-assets-head{display:flex;align-items:center;gap:14px;font-size:12px;color:var(--tps-muted,#a2ab98);margin-bottom:8px}
.tps-assets-head button{border:0;background:none;font:inherit;font-size:12px;color:inherit;cursor:pointer;padding:0}
.tps-assets-head button.on{color:var(--tps-accent,#435a36);font-weight:600}
.tps-assets-head span{margin-left:auto;font-size:9px;color:var(--tps-subtle,#adb5a1)}
.tps-cards{display:flex;gap:10px;overflow-x:auto}
.tps-card{min-width:212px;max-width:280px;flex:1;display:flex;align-items:center;gap:10px;padding:9px;border:1px solid var(--tps-border,#e8ecdf);border-radius:8px;background:var(--tps-surface,#fdfefa);cursor:pointer;font:inherit;text-align:left;color:inherit}
.tps-card.on{border-color:var(--tps-accent,#a8ba96)}
.tps-thumb{width:48px;height:48px;border-radius:6px;display:grid;place-items:center;font-size:26px;color:#63765a;flex:0 0 auto}
.tps-card strong{display:block;font-size:11px;font-weight:500;margin-bottom:6px}
.tps-card small{font-size:9px;color:var(--tps-subtle,#a4af95)}
.tps-empty{font-size:11px;color:var(--tps-subtle,#a1b092);padding:10px 2px}
.tps-toast{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);background:#2e4438;color:#fff;font-size:11px;padding:10px 16px;border-radius:8px;z-index:9;max-width:80%}
.tps-fallback{padding:24px;font-size:12px;line-height:1.9;color:var(--tps-muted,#7d8a80)}
.tps-modal{position:absolute;inset:0;display:grid;place-items:center;background:#253b3555;backdrop-filter:blur(2px);z-index:10;padding:20px}
.tps-modal-card{background:var(--tps-surface,#fff);border:1px solid var(--tps-border,#dbe2d5);border-radius:14px;padding:22px 24px;max-width:430px;box-shadow:0 18px 60px #20352d22}
.tps-modal-card h2{margin:6px 0 10px;font-size:18px;font-weight:600}
.tps-modal-card p{font-size:12px;line-height:1.9;color:var(--tps-muted,#859578);margin:0 0 14px}
.tps-note{font-size:11px;line-height:1.9;padding:12px;border-radius:8px;border:1px solid var(--tps-border,#e0e8d8);background:var(--tps-hover,#f1f5eb);color:var(--tps-muted,#7b8f6c)}
.tps-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}
.tps-actions button{border:0;border-radius:7px;padding:10px 16px;font:inherit;font-size:12px;cursor:pointer;background:var(--tps-hover,#eef3e9);color:inherit}
.tps-actions button.go{background:var(--tps-accent,#315d45);color:#fff}
.tps-side{display:grid;place-items:center;width:100%;height:100%}
.tps-side svg{display:block}
@media (max-width:1320px){.tps-grid{grid-template-columns:246px minmax(240px,1fr)}.tps-col.details{display:none}}
@media (max-width:1080px){.tps-grid{grid-template-columns:1fr}.tps-col.create{max-height:44%}}
@keyframes tps-spin{to{transform:rotate(360deg)}}
`
export default css
