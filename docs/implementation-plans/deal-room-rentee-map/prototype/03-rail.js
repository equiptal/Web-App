/* ── 03-rail.js ──────────────────────────────────────────────────
 * Edge tool rail: shell, buttons, badges, presence rules (T33).
 *
 * Verbatim from deal-room-rentee-map-v2.html. REFERENCE ONLY — prototype code uses
 * React.createElement, inline styles and fixture data. Read it for STRUCTURE,
 * GEOMETRY and ORDER; build with this repo's conventions. design.md is the distilled
 * version, this is the receipt.
 */

  railShell(children,open){ return h('div',{id:'dpRail',style:{position:'absolute',top:'31%',right:'12px',display:'flex',flexDirection:'column',gap:'11px',zIndex:25,
    opacity:open?0:1,pointerEvents:open?'none':'auto',transition:'opacity .2s'}},children); }


  railBtn(o){ return h('button',{key:o.k,onClick:o.onClick,title:o.lbl,
    style:{position:'relative',width:'52px',height:'52px',borderRadius:'17px',background:'#fff',border:'none',boxShadow:'0 5px 16px rgba(15,34,56,.18)',
      fontSize:'21px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontFamily:'inherit',opacity:o.dormant?.55:1,transition:'transform .13s'}},
    o.ic,
    o.badge?h('span',{style:{position:'absolute',top:'-5px',insetInlineStart:'-5px',minWidth:'19px',height:'19px',padding:'0 5px',borderRadius:'10px',background:o.badge.c,
      color:'#fff',fontSize:o.badge.t==='✓'?'9px':'10px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',
      animation:o.badge.pulse?'dpVbadge 1.8s ease-in-out infinite':'none'}},o.badge.t):null,
    o.ring?h('span',{style:{position:'absolute',inset:'-4px',borderRadius:'20px',border:'2px solid rgba(37,99,235,.55)',opacity:0,animation:'dpRing 2.6s ease-out infinite',pointerEvents:'none'}}):null,
    o.dot?h('span',{style:{position:'absolute',top:'-4px',insetInlineStart:'-4px',width:'14px',height:'14px',borderRadius:'50%',background:C.green,border:'2.5px solid #fff'}}):null);
  }


  rRail(){ const open=this.drawerOpen, sel=this.selSup!=null, u=this.curUnitRec();
    // With no registered machine there is nothing to select, but the panel still holds the company
    // documents and the explanation — so the button must exist anyway.
    const noMachines = sel && unitsOf(this.curSup()||{}).length===0;
    const machineSel = sel && (this.selUnit!=null || noMachines);
    const jump=(k)=>()=>{ if(this.selSup==null) return; this.openDrawer(k); };
    const needs = u ? (!u.confirmed || this.unitReadiness(u).band!=='green') : false;
    const btns=[];
    // Off-platform: no listing to scope a machine panel to, and no deal room to chat in.
    if(sel&&this.isOff(this.curSup())){
      // Two surfaces, as on the live card: equipment detail, and the submission as submitted.
      return this.railShell([
        this.railBtn({k:'offequip',ic:'🏗️',lbl:'المعدّة والمستندات',onClick:()=>this.openDrawer('offequip')}),
        this.railBtn({k:'sub',ic:'🧾',lbl:'عرض العرض المُقدَّم',onClick:()=>{ this.subOpen=true; this.up(); }}),
      ],open);
    }
    // Equipment: only once a machine is chosen — the panel is scoped to one machine, so without
    // a choice the button would open a guess.
    if(machineSel) btns.push(this.railBtn({k:'equip',ic:'🏗️',lbl:'المعدّة والمستندات',onClick:jump('equip'),
      badge: u ? (needs?{t:'!',c:C.amber,pulse:false}:{t:'✓',c:C.green}) : null}));
    // Chat: only once a supplier is chosen — there is no room to open before that.
    const waiting=this.bubbleArrival();
    if(sel||waiting) btns.push(h('div',{key:'chatwrap',style:{position:'relative'}},
      this.rChatBubble(),
      this.railBtn({k:'chat',ic:'💬',lbl:'المحادثة',
        onClick:()=>{ if(this.selSup==null){ if(waiting) this.openArrival(waiting); return; } this.openDrawer('chat'); },
        badge: this.unread ? {t:AR(this.unread),c:C.red,pulse:true}
             : (!sel&&waiting) ? {t:AR(this.pendingArrivals().filter(function(x){return x.kind!=='bid';}).length),c:C.red,pulse:true} : null,
        dot:sel&&!this.unread&&(!!this.S.newInChat||!!this.pendingCard)})));
    if(!btns.length) return null;
    return this.railShell(btns,open);
  }
