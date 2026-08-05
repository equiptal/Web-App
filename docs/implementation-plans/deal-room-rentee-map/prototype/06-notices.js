/* ── 06-notices.js ───────────────────────────────────────────────
 * Toast and the transient arrival popup.
 *
 * Verbatim from deal-room-rentee-map-v2.html. REFERENCE ONLY — prototype code uses
 * React.createElement, inline styles and fixture data. Read it for STRUCTURE,
 * GEOMETRY and ORDER; build with this repo's conventions. design.md is the distilled
 * version, this is the receipt.
 */

  rToast(){ if(!this.toastMsg) return null;
    return h('div',{style:{position:'fixed',bottom:'150px',left:'50%',transform:'translateX(-50%)',zIndex:210,background:C.deep,color:'#fff',
      borderRadius:'12px',padding:'11px 18px',fontSize:'12.5px',fontWeight:600,boxShadow:'0 14px 34px rgba(9,20,34,.4)',animation:'dpToast .2s ease',maxWidth:'min(560px,86vw)',textAlign:'center',lineHeight:1.7}},this.toastMsg);
  }


  rNotif(){ const n=this.notif; if(!n) return null;
    const s=this.curSup();
    const declined=n.resolution==='declined';
    const plain=n.resolution==='chat';
    const isBid=n.resolution==='bid';
    return h('div',{style:{position:'fixed',bottom:'150px',insetInlineStart:'26px',zIndex:212,width:'340px',
      background:'#fff',borderRadius:'16px',border:'1px solid '+C.blt,borderInlineStart:'4px solid '+(isBid?C.green:plain?C.blue:declined?C.amber:C.green),
      boxShadow:'0 18px 44px rgba(9,20,34,.28)',padding:'12px 13px',animation:'dpFade .22s ease'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'9px',marginBottom:'7px'}},
        h('span',{style:{width:'30px',height:'30px',borderRadius:'50%',flexShrink:0,background:s&&s.verified?C.green:C.amber,color:'#fff',fontSize:'11px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}},s?s.initials:'—'),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:'11.5px',fontWeight:800,color:C.deep,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},s?s.name:'المورد'),
          h('div',{style:{fontSize:'9px',fontWeight:800,color:C.muted,marginTop:'1px',fontFamily:'ui-monospace,monospace',direction:'ltr',textAlign:'start'}},
            n.ref? ('↩ '+n.ref+(n.serial?(' · '+n.serial):'')) : (isBid?'عرض جديد':'رسالة جديدة'))),
        h('button',{onClick:()=>this.dismissNotif(),title:'إخفاء',style:{background:'none',border:0,color:C.muted,fontSize:'13px',fontWeight:900,cursor:'pointer',padding:'2px 4px',fontFamily:'inherit'}},'✕')),
      h('div',{style:{fontSize:'11.5px',fontWeight:600,color:C.navy,lineHeight:1.7}},n.txt),
      h('button',{onClick:()=>{ if(isBid){ this.revealBid(this.notif.supIdx); } else this.openChatFromNotif(); },
        style:{width:'100%',marginTop:'10px',background:C.blue,border:0,color:'#fff',borderRadius:'10px',padding:'9px',fontSize:'11.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},
        isBid?'اعرضه في القائمة':'افتح المحادثة'));
  }
