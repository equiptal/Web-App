/**
 * Shared CSS for the public supplier bid form (`/bid/[token]`) and the renter-side read-only
 * "view submission" modal (SharedBidSubmissionModal). Kept in one place so the viewer renders
 * EXACTLY like the form — same layout, same classes — just filled with the supplier's answers.
 */
export const BID_FORM_CSS = `
.bidpage{--action:var(--brand);--action-dim:var(--brand-soft);--rentee:var(--info);--success:var(--ok);--success-bg:var(--ok-soft);--danger-bg:var(--danger-soft);--surface1:var(--surface);--line:var(--surface3);--r-md:10px;--r-lg:14px;--r-full:100px;
  min-height:100vh;background:var(--surface2);color:var(--navy);font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}
.bidpage.rtl{font-family:"IBM Plex Sans Arabic","Inter",sans-serif}
.bidpage *{box-sizing:border-box}
.bidpage .material-icons-outlined{font-family:'Material Icons Outlined';line-height:1}
.pubbar{background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:50}
.pubbar-in{max-width:1060px;margin:0 auto;display:flex;align-items:center;gap:13px;padding:12px 24px}
.rlogo{width:44px;height:44px;border-radius: var(--radius-md);flex:0 0 auto;background:linear-gradient(135deg,var(--rentee),var(--info-deep));color:var(--surface);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px}
.rlogo.rlogo-img{background:var(--surface);border:1px solid var(--border);overflow:hidden;padding:3px}
.rlogo.rlogo-img img{width:100%;height:100%;object-fit:contain}
.rmeta{min-width:0;flex:1 1 auto}
.rmeta .rlabel{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.rmeta .rname{font-size:18.5px;font-weight:800;letter-spacing:-.3px;line-height:1.15;overflow-wrap:anywhere}
.rmeta .rsub{font-size:11.5px;color:var(--muted);font-weight:600;display:flex;align-items:flex-start;gap:5px;margin-top:2px}
.rmeta .rsub span:last-child{min-width:0;overflow-wrap:anywhere}
.rmeta .rsub .material-icons-outlined{margin-top:1px;flex:0 0 auto}
.rmeta .rsub .material-icons-outlined{font-size:13px;color:var(--success)}
.pubbar .spacer{flex:1}
/* Language toggle — a compact segmented pill: light track with the active side as a navy pill. */
.langtog{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;background:var(--surface2);border:1px solid var(--border);border-radius:999px;padding:3px;}
.langtog button{border:0;background:transparent;color:var(--muted);min-width:40px;padding:6px 13px;font:inherit;font-weight:800;font-size:13px;line-height:1;cursor:pointer;border-radius:999px;transition:background .15s,color .15s}
.langtog button:hover{color:var(--navy)}
.langtog button.on{background:var(--navy);color:var(--surface);}
.langtog button.on:hover{color:var(--surface)}
.wrap{max-width:1060px;margin:0 auto;padding:22px 24px 24px}
.intro{margin:4px 0 18px}
.intro h1{margin:0 0 5px;font-size:22px;font-weight:800;letter-spacing:-.4px}
.intro p{margin:0;font-size:13.5px;color:var(--muted)}
.confirm-all{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:11px 15px;margin-bottom:14px;cursor:pointer}
.confirm-all.on{background:var(--success-bg);border-color:color-mix(in srgb, var(--ok) 35%, transparent)}
.confirm-all .ca-tx{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:800;color:var(--navy)}
.confirm-all .ca-tx .material-icons-outlined{font-size:18px;color:var(--success)}
.confirm-all .ca-sw{margin-inline-start:auto;position:relative;width:46px;height:26px;border-radius:100px;background:var(--border);border:0;cursor:pointer;flex:0 0 auto;transition:background .15s}
.confirm-all .ca-sw.on{background:var(--success)}
.confirm-all .ca-sw::after{content:"";position:absolute;top:3px;inset-inline-start:3px;width:20px;height:20px;border-radius:50%;background:var(--surface);transition:inset-inline-start .15s;}
.confirm-all .ca-sw.on::after{inset-inline-start:23px}
/* multi-unit confirmation note */
.units-note{display:flex;align-items:flex-start;gap:10px;background:var(--action-dim);border:1px solid color-mix(in srgb, var(--brand) 30%, transparent);border-radius:var(--r-md);padding:11px 13px;margin:-4px 0 12px}
.units-note.on{background:var(--success-bg);border-color:color-mix(in srgb, var(--ok) 35%, transparent)}
.units-note.needpick{outline: 2px solid color-mix(in srgb, var(--info) 40%, transparent); outline-offset: -2px}
.units-note > .un-lead{font-size:18px;color:var(--brand);flex:0 0 auto;margin-top:1px}
.units-note.on > .un-lead{color:var(--success)}
.units-note .un-tx{flex:1;font-size:12.5px;color:var(--navy);line-height:1.5}
.units-note .un-tx b{font-weight:800}
.units-note .un-box{flex:0 0 auto;width:22px;height:22px;border-radius: var(--radius-sm);border:2px solid var(--border);display:grid;place-items:center;background:var(--surface)}
.units-note.on .un-box{background:var(--success);border-color:var(--success)}
.units-note .un-box .material-icons-outlined{font-size:15px;color:var(--surface);opacity:0}
.units-note.on .un-box .material-icons-outlined{opacity:1}
.units-note input{display:none}
/* per-item / contract "Yes to all" toggle on a Terms subhead */
.subhead .yall{margin-inline-start:auto;display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:11px;font-weight:800;text-transform:none;letter-spacing:0;color:var(--navy-mid);background:none;border:0;cursor:pointer}
.subhead .yall.on{color:var(--success)}
.subhead .yall .yall-sw{position:relative;width:34px;height:19px;border-radius:100px;background:var(--border);transition:background .15s;flex:0 0 auto}
.subhead .yall.on .yall-sw{background:var(--success)}
.subhead .yall .yall-sw::after{content:"";position:absolute;top:2.5px;inset-inline-start:2.5px;width:14px;height:14px;border-radius:50%;background:var(--surface);transition:inset-inline-start .15s;}
.subhead .yall.on .yall-sw::after{inset-inline-start:17.5px}
.countdown{background:linear-gradient(135deg,var(--navy),var(--navy-deep));color:var(--surface);border-radius:var(--r-lg);padding:18px;margin-bottom:18px;text-align:center}
.cd-label{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--brand-pale);margin-bottom:13px}
.cd-label .material-icons-outlined{font-size:17px}
.cd-boxes{display:flex;align-items:center;justify-content:center;gap:10px}
.cd-box{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);border-radius:var(--r-md);padding:10px 0;width:74px}
.cd-box b{display:block;font-family:"IBM Plex Sans",monospace;font-size:28px;font-weight:700;line-height:1}
.cd-box span{font-size:10.5px;font-weight:700;color:rgba(255,255,255,.6);text-transform:uppercase;margin-top:5px;display:block}
.cd-sep{font-size:24px;color:rgba(255,255,255,.4)}
.cd-deadline{margin-top:13px;font-size:12.5px;color:rgba(255,255,255,.72);font-weight:600}
.cd-deadline b{color:var(--surface)}
.sec{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px 18px;margin-bottom:14px}
.sec-h{display:flex;align-items:center;gap:9px;margin:0 0 14px}
.sec-h h3{margin:0;font-size:15px;font-weight:800;letter-spacing:-.2px}
.sec-h .hdic{font-size:19px;color:var(--navy-mid)}
.sec-h .ro-tag{margin-inline-start:auto;font-size:10.5px;font-weight:800;text-transform:uppercase;color:var(--muted);background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-full);padding:3px 10px}
.subhead{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--navy-mid);margin:16px 0 9px}
.subhead .material-icons-outlined{font-size:15px;color:var(--navy-mid)}
.ro-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden}
.ro-cell{background:var(--surface2);padding:11px 13px}
.ro-cell .k{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:3px}
.ro-cell .v{font-size:13.5px;font-weight:700}
.maplink{display:inline-flex;align-items:center;gap:4px;color:var(--rentee);text-decoration:none}
.maplink .material-icons-outlined{font-size:15px}
.ro-hint{font-size:11.5px;color:var(--muted);font-style:italic;margin-top:9px}
.rnote{font-size:13.5px;color:var(--navy);line-height:1.6;white-space:pre-wrap;margin:0}
.iteminfo{display:flex;flex-wrap:wrap;gap:7px 18px;margin:0 0 4px;font-size:12.5px;color:var(--navy-mid)}
.iteminfo .ii b{color:var(--muted);font-weight:700}
.iteminfo .ii.note{display:inline-flex;align-items:center;gap:5px;color:var(--muted);font-style:italic}
.iteminfo .ii.note .material-icons-outlined{font-size:14px}
.item-hd{display:flex;align-items:center;justify-content:flex-start;gap:12px;margin:-16px -18px 14px;padding:14px 18px;background:linear-gradient(135deg,var(--navy),var(--navy-deep));color:var(--surface);border-radius:var(--r-lg) var(--r-lg) 0 0}
/* Equipment icon in a rounded tile (mirrors the web's equipment thumbnail); Material Symbols so glyphs
   the classic set lacks — e.g. forklift — still render. */
.bidpage .msym{font-family:'Material Symbols Outlined';font-weight:normal;font-style:normal;line-height:1;letter-spacing:normal;text-transform:none;white-space:nowrap;direction:ltr}
.item-hd .item-ic{flex:0 0 auto;width:42px;height:42px;display:grid;place-items:center;border-radius: var(--radius-md);background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18)}
.item-hd .item-ic .msym{font-size:25px;color:var(--brand-pale)}
.item-hd .item-ic .item-ic-img{width:32px;height:32px;object-fit:contain;border-radius: var(--radius-sm)}
.item-hd .inm-wrap{flex:1;min-width:0;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.item-hd .inm{font-size:17px;font-weight:800;letter-spacing:-.2px}
.item-hd .imeta{font-size:13px;color:rgba(255,255,255,.72);font-weight:700}
/* compact, self-sizing units pill — subtle tinted amber (single) / solid orange (multi); never stretches */
.item-hd .units-chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:800;letter-spacing:.01em;color:var(--surface);background:var(--brand);border:1px solid var(--brand);border-radius:var(--r-full);padding:3px 11px;white-space:nowrap}
.item-hd .units-chip .msym{font-size:14px}
/* Multi-unit: still subtle/light-grey (not bright orange) — just a touch more visible than single. */
.item-hd .units-chip.multi{background:var(--brand);border-color:var(--brand);color:var(--surface);}
.item-hd .ibadge{margin-inline-start:auto;flex:0 0 auto;font-size:10.5px;font-weight:800;color:rgba(255,255,255,.85);background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:var(--r-full);padding:4px 11px;white-space:nowrap}
/* Opt-out toggle — supplier bids on only the items they can supply (multi-item requests). */
.supply-tog{display:flex;align-items:center;gap:11px;width:100%;background:var(--success-bg);border:1px solid color-mix(in srgb, var(--ok) 35%, transparent);border-radius:var(--r-md);padding:11px 14px;margin-bottom:14px;cursor:pointer;font:inherit;text-align:start}
.supply-tog.off{background:var(--surface2);border-color:var(--border)}
.supply-tog .supply-sw{position:relative;width:44px;height:25px;border-radius:100px;background:var(--success);flex:0 0 auto;transition:background .15s}
.supply-tog.off .supply-sw{background:var(--border)}
.supply-tog .supply-sw::after{content:"";position:absolute;top:3px;inset-inline-start:22px;width:19px;height:19px;border-radius:50%;background:var(--surface);transition:inset-inline-start .15s;}
.supply-tog.off .supply-sw::after{inset-inline-start:3px}
.supply-tog .supply-tx{flex:1;font-size:13.5px;font-weight:800;color:var(--navy)}
.supply-tog .supply-skip{font-size:11.5px;font-weight:700;color:var(--muted);white-space:nowrap}
.skip-note{display:flex;align-items:flex-start;gap:10px;background:var(--surface2);border:1px dashed var(--border);border-radius:var(--r-md);padding:14px 16px;color:var(--navy-mid);font-size:13px;font-weight:600;line-height:1.5}
.skip-note .material-icons-outlined{font-size:19px;color:var(--muted);flex:0 0 auto;margin-top:1px}
.item-skipped .item-hd{filter:grayscale(.55);opacity:.7}
.tmtx-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--r-md)}
.tmtx{width:100%;border-collapse:collapse;font-size:12.5px;table-layout:fixed}
.tmtx th{background:var(--surface2);color:var(--navy-mid);font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:10px;border-bottom:1px solid var(--border);text-align:start}
.tmtx td{padding:12px 10px;border-inline-start:1px solid var(--line);vertical-align:top}
.tmtx td:first-child,.tmtx th:first-child{border-inline-start:0}
.tmtx .cval{font-size:12.5px;font-weight:700;margin-bottom:9px;line-height:1.4}
.tmtx .cval i{font-style:normal;color:var(--rentee)}
.tmtx .cval .cval-q{font-size:11px;font-weight:600;color:var(--muted);text-transform:none}
.tmtx .sval{margin-top:9px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tmtx .sval .sval-q{font-size:11px;font-weight:700;color:var(--navy-mid);text-transform:none}
/* Responsive term grid — cells wrap into as many rows as needed (no cramped wide table). */
/* Horizontal term rows, table-like (Term · Renter's ask · Your answer). One per row on
   tablet/mobile; two per row on wider screens (each card needs room for its three zones). */
.treqgrid{display:grid;grid-template-columns:1fr;gap:10px;align-items:stretch}
@media(min-width:760px){.treqgrid{grid-template-columns:1fr 1fr}}
.treqcell{display:flex;align-items:center;gap:14px;border:1px solid var(--line);border-radius: var(--radius-md);padding:11px 14px;background:var(--surface);min-width:0;transition: border-color .15s, background .15s}
.treqcell.ok{border-color:color-mix(in srgb, var(--ok) 32%, transparent);background:var(--ok-soft)}
.treqcell.declined{background:var(--danger-bg);border-color:color-mix(in srgb, var(--danger) 32%, transparent)}
.treqcell.needpick{background:var(--surface2);border-color:transparent;outline: 2px solid color-mix(in srgb, var(--info) 40%, transparent); outline-offset: -2px}
/* zone 1 — term name + explainer (takes remaining width). break-word (not anywhere) so long names
   like "Operator FAT — Accommodation/Transport" wrap between words, never mid-word ("Transpo·rt"). */
.treqcell .tc-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.treqcell .tc-name{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:800;text-transform:none;letter-spacing:-.1px;color:var(--navy);line-height:1.3;overflow-wrap:break-word;word-break:normal}
.treqcell .tc-name .material-icons-outlined{font-size:15px;flex:0 0 auto;width:24px;height:24px;display:grid;place-items:center;color:var(--navy-mid);background:var(--surface2);border-radius: var(--radius-sm)}
.treqcell .tc-hint{font-size:11px;color:var(--muted);font-weight:600;line-height:1.35;overflow-wrap:break-word}
.treqcell.ok .tc-name .material-icons-outlined{color:var(--success);background:var(--success-bg)}
.treqcell.declined .tc-name .material-icons-outlined{color:var(--danger);background:var(--surface)}
/* zones 2 & 3 — Renter's choice + Your answer: identical stacked mini-columns (label over box), both
   centered and equal height so the two labels sit on one line and the two boxes on the next. */
.treqcell .tc-rw,.treqcell .tc-sw{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;text-align:center}
.treqcell .tc-rw{max-width:38%}
.treqcell .tc-rw .q,.treqcell .tc-sw .q{color:var(--muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
.treqcell .tc-sw .q{color:var(--navy-mid)}
.treqcell .tc-rw i{display:inline-flex;align-items:center;justify-content:center;min-height:34px;font-style:normal;color:var(--rentee);font-weight:800;font-size:13px;background:color-mix(in srgb, var(--info) 8%, transparent);border:1px solid color-mix(in srgb, var(--info) 16%, transparent);border-radius: var(--radius-sm);padding:2px 12px;max-width:100%;overflow-wrap:break-word}
.treqcell .tc-sw .miniseg button{justify-content:center;padding:0 14px;height:34px;font-size:12px}
/* Mobile: stack the card — name on top, then "Renter's choice" and "Your choice" as full-width
   label→value rows — so the long term names never collide with the choice pills. */
@media(max-width:560px){
  .treqcell{flex-direction:column;align-items:stretch;gap:0}
  .treqcell .tc-main{width:100%}
  .treqcell .tc-rw,.treqcell .tc-sw{max-width:none;flex-direction:row;align-items:center;justify-content:space-between;gap:12px;text-align:start;margin-top:9px;padding-top:9px;border-top:1px solid var(--line)}
  .treqcell .tc-rw i{min-height:0;padding:5px 12px}
  .treqcell .tc-rw .q,.treqcell .tc-sw .q{white-space:nowrap}
}
.tmtx td.declined{background:var(--danger-bg)}
.tmtx td.needpick{background:var(--surface2);outline: 2px solid color-mix(in srgb, var(--info) 40%, transparent); outline-offset: -2px}
.celllbl{display:none}
.miniseg{display:inline-flex;border:1px solid var(--border);border-radius: var(--radius-sm);overflow:hidden;width:fit-content}
.miniseg button{border:0;background:var(--surface);color:var(--navy-mid);font:inherit;font-weight:700;font-size:11.5px;padding:6px 12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.miniseg button .material-icons-outlined{font-size:14px}
.miniseg button.ok.on{background:var(--success);color:var(--surface)}
.miniseg button.no.on{background:var(--danger);color:var(--surface)}
.treqs{display:flex;flex-direction:column;gap:8px}
.treq{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid var(--line);border-radius:var(--r-md);padding:12px 14px;background:var(--surface)}
.treq.no{background:var(--danger-bg);border-color:color-mix(in srgb, var(--danger) 28%, transparent)}
.treq-tx{min-width:0}
.treq-q{font-size:13.5px;font-weight:700;color:var(--navy);line-height:1.45}
.treq-q .treq-v{color:var(--rentee)}
.treq-req{font-size:11.5px;color:var(--muted);margin-top:3px;line-height:1.4}
.treq .miniseg{flex:0 0 auto}
@media(max-width:560px){.treq{flex-wrap:wrap}.treq .miniseg{margin-inline-start:auto}}
/* Pricing table can't shrink below its 5 columns; wrap it so a narrow phone scrolls it instead of
   widening the whole page. */
.ptbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.ptbl{width:100%;border-collapse:collapse;font-size:12.5px}
.ptbl th{background:var(--surface2);color:var(--navy-mid);font-size:10px;font-weight:800;text-transform:uppercase;padding:8px 10px;border-bottom:1px solid var(--border);text-align:start}
.ptbl th.num,.ptbl td.num{text-align:end}
.ptbl td{padding:10px;border-bottom:1px solid var(--line);vertical-align:middle}
.ptbl tbody tr:last-child td{border-bottom:0}
.ptbl .it-lbl{font-weight:700}
.ptbl .it-sub2{font-size:10.5px;color:var(--muted);margin-top:2px}
.ptbl-in{width:120px;text-align:end;border:1px solid var(--border);border-radius: var(--radius-sm);height:36px;padding:0 9px;font:inherit;font-size:13.5px;font-weight:700;color:var(--navy);background:var(--surface);outline:0}
.ptbl-in:focus{border-color:var(--brand);outline: 3px solid color-mix(in srgb, var(--brand) 12%, transparent); outline-offset: 0}
.ptbl-in.invalid{border-color:var(--danger);background:var(--danger-bg)}
.ptbl-ro{display:inline-block;min-width:90px;text-align:end;font-family:"IBM Plex Sans",monospace;font-weight:700;color:var(--navy)}
.ptbl .tot{font-family:"IBM Plex Sans",monospace;font-weight:700}
.itot{margin-top:10px;display:flex;justify-content:flex-end;gap:24px;flex-wrap:wrap}
.itot .r{font-size:12.5px;color:var(--muted);font-weight:600}
.itot .r b{font-family:"IBM Plex Sans",monospace;color:var(--navy);margin-inline-start:6px}
.itot .r.t{font-size:14px;font-weight:800;color:var(--navy)}
.itot .r.t b{color:var(--brand);font-size:16px}
.grand{display:flex;align-items:center;justify-content:space-between;background:var(--action-dim);border:1px solid color-mix(in srgb, var(--brand) 30%, transparent);border-radius:var(--r-md);padding:18px 20px;margin:0 0 16px}
.grand .gk{font-size:14px;font-weight:800}
.grand .gv{font-family:"IBM Plex Sans",monospace;font-size:24px;font-weight:800;color:var(--brand)}
.notes-field{margin-top:14px}
.notes-field label{display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.notes-field textarea{width:100%;min-height:64px;border:1px solid var(--border);border-radius:var(--r-md);padding:11px 13px;font:inherit;font-size:14px;color:var(--navy);outline:0;resize:vertical}
.notes-ro{font-size:13.5px;color:var(--navy);line-height:1.6;white-space:pre-wrap;margin:0}
.field{margin-bottom:14px}
.field label{display:block;font-size:12.5px;font-weight:700;color:var(--navy-mid);margin-bottom:7px}
.field label .reqx{color:var(--danger);font-weight:800}
/* "Optional" chip — every field is explicitly marked: red * when required, this pill otherwise. */
.optx{display:inline-block;margin-inline-start:6px;font-size:9.5px;font-weight:800;letter-spacing:.02em;text-transform:uppercase;color:var(--muted);background:var(--surface2);border:1px solid var(--border);border-radius: var(--radius-lg);padding:1px 7px;vertical-align:middle}
.reqx{color:var(--danger);font-weight:800}
.field input{width:100%;height:46px;border:1px solid var(--border);border-radius:var(--r-md);padding:0 13px;font:inherit;font-size:14px;color:var(--navy);outline:0}
.field input:focus{border-color:var(--brand);outline: 3px solid color-mix(in srgb, var(--brand) 12%, transparent); outline-offset: 0}
.field input:disabled,.field input[readonly]{background:var(--surface2);color:var(--navy);-webkit-text-fill-color:var(--navy);opacity:1}
.field.invalid input{border-color:var(--danger);background:var(--danger-bg)}
.field .err{display:none;font-size:11.5px;color:var(--danger);font-weight:700;margin-top:6px}
.field.invalid .err{display:block}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.btn{border:1px solid var(--border);background:var(--surface);border-radius:var(--r-md);padding:11px 18px;font:inherit;font-weight:700;font-size:13.5px;color:var(--navy);display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}
.btn.primary{background:var(--brand);border-color:var(--brand);color:var(--surface)}
.btn.lg{font-size:15px;padding:14px 26px}
.btn[disabled]{opacity:.6;cursor:not-allowed}
.btn .material-icons-outlined{font-size:18px}
.submit-err{display:flex;align-items:center;gap:8px;background:var(--danger-bg);border:1px solid color-mix(in srgb, var(--danger) 30%, transparent);color:var(--danger);border-radius:var(--r-md);padding:11px 14px;font-size:12.5px;font-weight:700;margin-bottom:12px}
.submit-err .material-icons-outlined{font-size:17px}
.submit-bar .btn{width:100%}
.submit-note{text-align:center;font-size:11.5px;color:var(--muted);margin-top:10px}
.footer-note{text-align:center;color:var(--muted);font-size:12px;margin-top:16px}
/* Footer — download-the-app CTA + a bigger "Powered by Moedatech". */
.pb-foot{max-width:1060px;margin:0 auto;padding:8px 24px 34px}
.dlapp{display:flex;align-items:center;gap:18px;background:linear-gradient(120deg,var(--surface2),var(--surface2) 62%);border:1px solid var(--border);border-radius: var(--radius-lg);padding:20px 22px;margin-bottom:10px}
.dlapp-foot{text-align:center;font-size:12px;color:var(--muted);font-weight:600;margin-bottom:18px}
.dlapp-brand{flex:0 0 auto;display:flex;align-items:center}
.dlapp-brand img{height:30px;width:auto}
.dlapp-ic{flex:0 0 auto;width:58px;height:58px;border-radius: var(--radius-lg);background:linear-gradient(135deg,var(--rentee),var(--info-deep));display:grid;place-items:center;}
.dlapp-ic img{width:36px;height:36px;object-fit:contain}
.dlapp-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.dlapp-tx b{font-size:16.5px;font-weight:800;color:var(--navy);letter-spacing:-.2px}
.dlapp-tx span{font-size:13px;color:var(--muted);line-height:1.5}
.dlapp-btns{display:flex;flex-direction:row;flex-wrap:wrap;justify-content:flex-end;gap:10px;flex:0 0 auto}
/* Official-style store badges (black pill · logo · two-line label). */
.store-badge{display:inline-flex;align-items:center;gap:10px;background:#000;border:1px solid #000;border-radius: var(--radius-md);padding:8px 15px;text-decoration:none;min-width:158px;transition:transform .12s}
.store-badge:hover{transform:translateY(-1px)}
.store-badge svg{width:22px;height:22px;flex:0 0 auto}
.store-badge .sb-tx{display:flex;flex-direction:column;line-height:1.15;text-align:start;color:var(--surface)}
.store-badge .sb-tx small{font-size:9px;font-weight:500;letter-spacing:.02em}
.store-badge .sb-tx b{font-size:15px;font-weight:700;letter-spacing:-.2px}
.pb-powered{text-align:center;color:var(--muted);font-size:14.5px;font-weight:700;letter-spacing:.02em}
.pb-powered b{color:var(--navy);font-weight:900;font-size:16px}
@media(max-width:600px){.dlapp{flex-wrap:wrap;gap:14px;padding:16px}.dlapp-btns{flex-direction:row;width:100%}.store-badge{flex:1;justify-content:center;min-width:0}}
.state{max-width:560px;margin:60px auto;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius: var(--radius-lg);padding:44px 34px}
.state .sic{width:78px;height:78px;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;background:var(--success-bg);color:var(--success)}
.state .sic.neutral{background:var(--surface2);color:var(--muted)}
.state .sic.err{background:var(--danger-bg);color:var(--danger)}
.state .sic .material-icons-outlined{font-size:44px}
.state h2{margin:0 0 9px;font-size:21px;font-weight:800}
.state p{margin:0 auto;max-width:42ch;font-size:14px;color:var(--muted)}
.state .recap{display:inline-flex;align-items:center;gap:8px;margin-top:18px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-full);padding:8px 16px;font-size:13px;font-weight:700;font-family:"IBM Plex Sans",monospace}
.state .recap .material-icons-outlined{font-size:16px;color:var(--muted)}
.state-actions{margin-top:22px}
.state-actions .btn{font-size:14px;padding:11px 20px}
.state-msg{text-align:center;color:var(--muted);padding:50px}
/* In-modal read-only viewer: strip the full-page chrome so the form body sits inside the dialog. */
.bidpage.inview{min-height:0;background:transparent}
.bidpage.inview .wrap{max-width:none;margin:0;padding:0}
.bidpage.inview .miniseg button{cursor:default}
@media (max-width:680px){.ro-grid{grid-template-columns:1fr 1fr}}
@media (max-width:600px){.wrap{padding:16px 14px 22px}.pubbar-in{padding:10px 12px;gap:10px}.rmeta .rname{font-size:16px}.rlogo{width:40px;height:40px}.langtog button{min-width:36px;padding:6px 11px;font-size:12.5px}.intro h1{font-size:19px}.sec{padding:14px}.item-hd{margin:-14px -14px 12px;padding:12px 14px}.item-hd .ibadge{display:none}
.tmtx-wrap{border:0;overflow:visible}.tmtx,.tmtx tbody{display:block;width:100%}.tmtx thead{display:none}.tmtx tr{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:10px;overflow:hidden}.tmtx td{display:block;border-bottom:1px solid var(--line);border-inline-start:1px solid var(--line);padding:11px 13px}.tmtx td:nth-child(odd){border-inline-start:0}.celllbl{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;color:var(--navy-mid);margin-bottom:5px}.cd-box{width:60px}.cd-box b{font-size:23px}
/* tighter pricing table + 16px inputs (stops iOS focus-zoom); frow + attach cards stack */
.ptbl td,.ptbl th{padding:9px 7px}.ptbl-in{width:84px}.frow{grid-template-columns:1fr}
.field input,.notes-field textarea{font-size:16px}
.qbanner{padding:14px}.item-hd .inm{font-size:16px}
.grand{padding:15px 16px}.grand .gv{font-size:21px}}

/* ── Attachment uploader (FileUploader) ─────────────────────────────────── */
.uploader{margin:6px 0 12px}
.up-list{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
.up-item{display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:var(--r-md);padding:8px 10px;background:var(--surface)}
.up-thumb{width:44px;height:44px;border-radius: var(--radius-sm);object-fit:cover;border:1px solid var(--border);flex:none}
.up-fic{font-size:26px;color:var(--navy-mid);flex:none}
.up-meta{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}
.up-fn{font-size:12.5px;color:var(--navy);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.up-sel{font:inherit;font-size:12px;font-weight:700;color:var(--navy);border:1px solid var(--border);border-radius: var(--radius-sm);padding:5px 8px;background:var(--surface);max-width:220px}
.up-kind{align-self:flex-start;font-size:11px;font-weight:800;color:var(--navy-mid);background:var(--surface);border:1px solid var(--border);border-radius: var(--radius-lg);padding:2px 9px}
.uprow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.uptog{display:inline-flex;border:1px solid var(--border);border-radius: var(--radius-sm);overflow:hidden}
.uptog button{border:none;background:var(--surface);font:inherit;font-size:11.5px;font-weight:800;color:var(--muted);padding:5px 11px;cursor:pointer}
.uptog button.on{background:var(--navy);color:var(--surface)}
.up-rm{flex:none;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius: var(--radius-sm);background:var(--surface);color:var(--muted);cursor:pointer}
.up-rm:hover{color:var(--danger);border-color:var(--danger-soft);background:var(--danger-soft)}
.up-rm .material-icons-outlined{font-size:18px}
.up-add{display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:13px;font-weight:800;color:var(--navy);border:1.5px dashed var(--border-strong);border-radius: var(--radius-sm);padding:9px 14px;background:var(--surface);cursor:pointer}
.up-add:hover:not(:disabled){background:var(--surface);border-color:var(--muted-light)}
.up-add:disabled{opacity:.6;cursor:default}
.up-add .material-icons-outlined{font-size:18px}
.up-err{margin-top:6px;font-size:12px;font-weight:700;color:var(--danger)}

/* ── FileUploader v2 — picker (choose type) + labeled slot, accent-driven ─── */
/* Instances set --ac / --ac-bg / --ac-bd inline for their section colour. */
.uploader{--ac:var(--navy-mid);--ac-bg:var(--background);--ac-bd:var(--border-strong)}
.u-pick{display:flex;gap:9px;align-items:stretch}
.u-sel{position:relative;flex:1;min-width:0}
.u-sel-btn{width:100%;display:flex;align-items:center;gap:8px;border:1px solid var(--ac-bd);background:var(--surface);border-radius: var(--radius-md);padding:10px 12px;font:inherit;font-size:13px;font-weight:700;color:var(--navy);cursor:pointer;text-align:start}
.u-sel-btn>span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.u-sel-car{color:var(--muted);font-size:20px}
.u-sel-back{position:fixed;inset:0;z-index:20}
.u-sel-menu{position:absolute;top:calc(100% + 6px);inset-inline:0;background:var(--surface);border:1px solid var(--border);border-radius: var(--radius-md);padding:5px;z-index:21;max-height:240px;overflow:auto}
.u-sel-mi{width:100%;display:flex;align-items:center;gap:9px;padding:9px 10px;border:none;background:none;border-radius: var(--radius-sm);font:inherit;font-size:13px;font-weight:600;color:var(--navy);cursor:pointer;text-align:start}
.u-sel-mi:hover{background:var(--ac-bg)}
.u-sel-mi.on{background:var(--ac-bg);color:var(--ac);font-weight:800}
.u-sel-dot{width:22px;height:22px;border-radius: var(--radius-sm);background:var(--ac-bg);color:var(--ac);display:flex;align-items:center;justify-content:center;flex:none;font-size:14px}
.u-sel-mi>span:nth-child(2){flex:1}
.u-sel-tick{margin-inline-start:auto;color:var(--ac);font-size:16px}
.u-up{display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:13px;font-weight:800;color:var(--surface);background:var(--ac);border:none;border-radius: var(--radius-md);padding:0 16px;cursor:pointer;white-space:nowrap}
.u-up:disabled{opacity:.6;cursor:default}
.u-up .material-icons-outlined{font-size:18px}
.u-pick-hint{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);margin-top:8px}
.u-pick-hint .material-icons-outlined{font-size:14px}
.u-slot{width:100%;display:flex;align-items:center;gap:11px;border:1.5px dashed var(--ac-bd);background:var(--ac-bg);border-radius: var(--radius-md);padding:13px 14px;cursor:pointer;font:inherit;text-align:start}
.u-slot:hover:not(:disabled){filter:brightness(.985)}
.u-slot:disabled{opacity:.6;cursor:default}
.u-slot-ic{width:34px;height:34px;border-radius: var(--radius-sm);background:var(--ac);color:var(--surface);display:flex;align-items:center;justify-content:center;flex:none;font-size:18px}
.u-slot-tx{display:flex;flex-direction:column;min-width:0}
.u-slot-nm{font-weight:800;font-size:13.5px;color:var(--navy)}
.u-slot-hint{font-size:11.5px;color:var(--muted)}
.u-slot-plus{margin-inline-start:auto;color:var(--ac);font-size:22px}
.u-files{display:flex;flex-direction:column;gap:8px;margin-top:11px}
.u-frow{display:flex;align-items:center;gap:10px;border:1px solid var(--ac-bd);background:var(--ac-bg);border-radius: var(--radius-md);padding:8px 10px}
.u-fic{width:32px;height:32px;border-radius: var(--radius-sm);background:var(--ac);color:var(--surface);display:flex;align-items:center;justify-content:center;flex:none;font-size:16px;overflow:hidden}
.u-fic.thumb{background:none}
.u-fic.thumb img{width:100%;height:100%;object-fit:cover}
.u-fmeta{min-width:0;flex:1;display:flex;flex-direction:column}
.u-fkind{font-size:12.5px;font-weight:800;color:var(--navy)}
.u-ffn{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.u-frm{color:var(--muted);background:none;border:none;cursor:pointer;display:flex;flex:none}
.u-frm .material-icons-outlined{font-size:18px}
.u-err{margin-top:8px;font-size:12px;font-weight:700;color:var(--danger)}

/* Attachment section card (colour header + pill) */
.att-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:13px}
/* two side-by-side cards (equipment photos + proof of ownership); stacks on mobile */
.att-row{display:grid;grid-template-columns:1fr 1fr;gap:13px;align-items:start;margin-top:20px}
.att-row .att-card{margin-bottom:13px}
@media(max-width:640px){.att-row{grid-template-columns:1fr;gap:0}}
/* delivery/return handled by the renter — read-only chip in the price cell */
.byrenter{display:inline-block;font-size:11.5px;font-weight:800;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius: var(--radius-lg);padding:2px 10px;white-space:nowrap}
/* uploaded-file "done" tick — distinguishes a stored file from the empty upload slot */
.u-fdone{color:var(--ok);font-size:19px;flex:none;margin-inline-start:2px}
/* compact "add another" shown in a slot once it already holds a file (vs the full dropzone) */
.u-slot-more{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12.5px;font-weight:800;color:var(--ac);background:none;border:none;cursor:pointer;padding:8px 2px 2px}
.u-slot-more .material-icons-outlined{font-size:18px}
.att-hd{display:flex;align-items:center;gap:11px;padding:13px 15px}
.att-tile{width:36px;height:36px;border-radius: var(--radius-md);display:flex;align-items:center;justify-content:center;flex:none;font-size:19px}
.att-tt{font-weight:800;font-size:14.5px;color:var(--navy)}
.att-dd{font-size:12px;color:var(--muted);margin-top:1px}
.att-pill{margin-inline-start:auto;font-size:10.5px;font-weight:800;letter-spacing:.3px;border-radius: var(--radius-lg);padding:3px 9px;white-space:nowrap}
.att-pill.req{background:var(--danger-soft);color:var(--danger);border:1px solid var(--danger-soft)}
.att-pill.opt{background:var(--surface2);color:var(--muted-dark);border:1px solid var(--surface3)}
.att-body{padding:0 15px 15px}
/* combine-into-one-file guidance under a document uploader */
.att-hint{display:flex;align-items:flex-start;gap:6px;margin:0 15px 13px;padding:8px 10px;background:var(--action-dim);border:1px solid color-mix(in srgb, var(--brand) 28%, transparent);border-radius: var(--radius-sm);font-size:11.5px;font-weight:600;line-height:1.45;color:var(--navy-mid)}
.att-hint .material-icons-outlined{font-size:15px;color:var(--brand);flex:0 0 auto;margin-top:1px}
/* Encouragement banner above the attachments — ties uploading to bid quality + winning the deal. */
.att-upsell{display:flex;align-items:flex-start;gap:13px;margin:20px 0 12px;padding:15px 17px;border-radius:var(--r-lg);background:var(--success-bg);border:1px solid color-mix(in srgb, var(--ok) 45%, transparent);border-inline-start:4px solid var(--success)}
.att-upsell .au-ic{flex:0 0 auto;font-size:26px;color:var(--surface);width:42px;height:42px;display:grid;place-items:center;background:var(--success);border-radius: var(--radius-md);}
.att-upsell .au-tx{display:flex;flex-direction:column;gap:3px;min-width:0}
.att-upsell .au-tx b{font-size:14.5px;font-weight:800;color:var(--ok-deep)}
.att-upsell .au-tx span{font-size:12.5px;color:var(--navy);font-weight:600;line-height:1.55}

/* Read-only attachment view (renter's submission viewer) — grouped by section, labeled */
.ro-att{margin-top:12px;display:flex;flex-direction:column;gap:12px}
.ro-grp{display:flex;flex-direction:column;gap:8px}
.ro-att-h{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)}
.ro-thumbs{display:flex;flex-wrap:wrap;gap:10px}
.ro-fig{display:inline-flex;flex-direction:column;gap:4px;width:66px;text-decoration:none}
.ro-fig img{width:66px;height:66px;object-fit:cover;border-radius: var(--radius-sm);border:1px solid var(--border)}
.ro-fig-lb{font-size:10.5px;font-weight:700;color:var(--navy-mid);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ro-chips{display:flex;flex-wrap:wrap;gap:8px}
.ro-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--navy);background:var(--surface);border:1px solid var(--border);border-radius: var(--radius-sm);padding:7px 11px;text-decoration:none}
.ro-chip:hover{background:var(--surface);border-color:var(--border-strong)}
.ro-chip .ic{font-size:15px;color:var(--muted)}
.ro-chip .dl{font-size:16px;color:var(--brand);margin-inline-start:2px}

/* ── Bid-quality ring ───────────────────────────────────────────────────── */
.qring{display:inline-flex;flex-direction:column;align-items:center;gap:4px;flex:none}
.qring-lb{font-size:11px;font-weight:800;letter-spacing:.2px}
.qbanner{display:flex;align-items:flex-start;gap:16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px 18px;margin-bottom:14px}
.qb-tx{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.qb-tx b{font-size:14px;color:var(--navy);font-weight:800}
.qb-tx span{font-size:12.5px;color:var(--muted);line-height:1.5}
/* Quality breakdown — one mini-meter per scoring dimension so the supplier sees what to improve. */
.qb-parts{display:flex;gap:10px 18px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
.qpart{flex:1 1 130px;min-width:120px;display:flex;flex-direction:column;gap:5px}
.qpart-h{display:flex;align-items:center;justify-content:space-between;gap:8px}
.qpart-lb{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:var(--navy);white-space:nowrap}
.qpart-lb .material-icons-outlined{font-size:15px;color:var(--muted)}
.qpart-pc{font-size:11.5px;font-weight:800;color:var(--muted);font-variant-numeric:tabular-nums}
.qpart-track{height:5px;border-radius:100px;background:var(--line);overflow:hidden}
.qpart-track i{display:block;height:100%;border-radius:100px;background:var(--brand);transition:width .4s ease,background .3s ease}
.qpart-w{font-size:10px;font-weight:600;color:var(--muted);opacity:.75;letter-spacing:.02em}
.qpart.done .qpart-lb,.qpart.done .qpart-pc{color:var(--success)}
.qpart.done .qpart-lb .material-icons-outlined{color:var(--success)}
.qpart.done .qpart-track i{background:var(--success)}
.qring-sm{margin-inline-start:auto}
`;
