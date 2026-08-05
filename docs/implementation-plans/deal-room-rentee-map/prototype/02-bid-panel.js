/* ── 02-bid-panel.js ─────────────────────────────────────────────
 * The bid list — the entry point, visible in every state — rows, sort tabs, and the colour key hosted inside the panel.
 *
 * Verbatim from deal-room-rentee-map-v2.html. REFERENCE ONLY — prototype code uses
 * React.createElement, inline styles and fixture data. Read it for STRUCTURE,
 * GEOMETRY and ORDER; build with this repo's conventions. design.md is the distilled
 * version, this is the receipt.
 */

  rBidsPanel(){ const list=this.sortedBids(); if(!list.length) return null;
    const best=Math.min.apply(null,list.map(s=>s.rate));
    const sorts=[['price','الأقل سعراً'],['dist','الأقرب']];
    const card=(s)=>{ const i=SUPPLIERS.indexOf(s), on=(this.selSup===i), dim=(this.selSup!=null&&!on);
      const flash=(this.flashBid===i);
      return h('button',{key:s.id,id:'bidrow-'+s.id,onClick:()=>this.selectSup(i),
        onMouseEnter:()=>{ this.hoverSup=i; this.updateLeaflet(false); },
        onMouseLeave:()=>{ if(this.hoverSup===i){ this.hoverSup=null; this.updateLeaflet(false); } },
        style:{position:'relative',flexShrink:0,width:'100%',textAlign:'start',display:'flex',flexDirection:'column',gap:'9px',background:on?C.blueLt:'#fff',border:'1.5px solid '+(on?C.blue:(s.rate===best?C.greenBd:C.blt)),borderRadius:'14px',padding:'12px 13px 12px 17px',cursor:'pointer',fontFamily:'inherit',boxShadow:on?'0 4px 14px rgba(37,99,235,.18)':'0 2px 6px rgba(15,34,56,.05)',opacity:dim?.55:1,transition:'.15s',overflow:'hidden',
          animation:flash?'dpPing 1.2s ease-out 2':'none',
          borderColor:flash?C.blue:(on?C.blue:(s.rate===best?C.greenBd:C.blt))}},
        // just-arrived marker — a live list mutation the renter did not trigger needs to be findable
        (SUPPLIERS.indexOf(s)===this.freshBid)?h('span',{key:'fresh',style:{position:'absolute',top:'10px',insetInlineEnd:'12px',fontSize:'8.5px',fontWeight:800,color:'#fff',background:C.green,borderRadius:'20px',padding:'2px 8px'}},'وصل الآن'):null,
        // selection accent + tick — the row's own state, no 'select' button needed
        on?h('span',{key:'acc',style:{position:'absolute',insetInlineStart:0,top:0,bottom:0,width:'4px',background:C.blue}}):null,
        on?h('span',{key:'tick',style:{position:'absolute',top:'10px',insetInlineStart:'10px',width:'20px',height:'20px',borderRadius:'50%',background:C.blue,color:'#fff',fontSize:'11px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}},'✓'):null,
        h('div',{style:{display:'flex',alignItems:'center',gap:'10px'}},
          h('div',{style:{width:'36px',height:'36px',borderRadius:'50%',background:s.verified?C.green:C.amber,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'12.5px',flexShrink:0}},s.initials),
          h('div',{style:{flex:1,minWidth:0}},
            h('div',{style:{fontSize:'12.5px',fontWeight:700,color:C.deep,display:'flex',gap:'4px',alignItems:'center'}},s.name,s.verified?h('span',{style:{color:C.green,fontSize:'10px'}},'✓'):null),
            h('div',{style:{fontSize:'10px',color:C.muted,fontWeight:600,marginTop:'2px'}},
              this.isOff(s) ? s.city : (s.deals+' صفقة · '+s.city))),
          this.isOff(s)?h('span',{style:{flexShrink:0,fontSize:'8.5px',fontWeight:800,color:'#8a4f08',background:C.amberLt,border:'1px solid '+C.amberBd,borderRadius:'20px',padding:'2px 7px'}},'من خارج المنصّة'):null,
          null),
        h('div',{style:{display:'flex',alignItems:'flex-end',gap:'10px',borderTop:'1px dashed '+C.blt,paddingTop:'9px'}},
          h('div',{style:{minWidth:0}},
            h('div',{style:{fontSize:'9px',fontWeight:700,color:C.muted,marginBottom:'1px'}},'سعر العرض'),
            h('div',{style:{fontSize:'17px',fontWeight:800,color:C.deep,letterSpacing:'-.2px'}},AR(s.rate),h('span',{style:{fontSize:'10px',fontWeight:600,color:C.muted,marginInlineStart:'3px'}},'ر.س / يوم')),
            s.rate===best?h('div',{style:{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'9.5px',color:C.green,fontWeight:800,marginTop:'3px',background:C.greenLt,border:'1px solid '+C.greenBd,borderRadius:'20px',padding:'1px 7px'}},'أقل سعر في العروض'):null),
          h('div',{style:{flex:1}}),
          this.isOff(s)
            ? h('div',{style:{textAlign:'end',flexShrink:0}},
                h('div',{style:{fontSize:'9px',fontWeight:700,color:C.muted,marginBottom:'1px'}},'المدينة'),
                h('div',{style:{fontSize:'11.5px',fontWeight:800,color:C.navy}},s.city),
                h('div',{style:{fontSize:'9px',color:C.muted,fontWeight:600,marginTop:'2px'}},'لا موقع على الخريطة'))
            : h('div',{style:{textAlign:'end',flexShrink:0}},
                h('div',{style:{fontSize:'9px',fontWeight:700,color:C.muted,marginBottom:'1px'}},'المسافة'),
                h('div',{style:{fontSize:'12.5px',fontWeight:800,color:C.navy}},toAr(s.km)+' كم'),
                h('div',{style:{fontSize:'9.5px',color:C.muted,fontWeight:600,marginTop:'2px'}},'وصول '+s.eta))),
        (()=>{ // offered vs identified — the renter must see what has paperwork and what is only a claim
          if(this.isOff(s)) return h('div',{style:{display:'flex',alignItems:'center',gap:'7px',alignSelf:'stretch',background:C.amberLt,border:'1px solid '+C.amberBd,borderRadius:'10px',padding:'7px 9px'}},
            h('span',{style:{fontSize:'11px'}},'🧾'),
            h('span',{style:{fontSize:'9.5px',fontWeight:700,color:'#8a4f08',lineHeight:1.6}},
              AR(offeredOf(s))+' وحدة بمستندات وصور · بلا معدّة مسجّلة'));
          const off=offeredOf(s), idn=identifiedOf(s), gh=(s.ghost||0), sites=siteCountOf(s);
          if(off<=1 && !gh) return null;
          return h('div',{style:{display:'flex',flexDirection:'column',gap:'5px',alignSelf:'stretch',background:C.s2,border:'1px solid '+C.blt,borderRadius:'10px',padding:'8px 9px'}},
            h('div',{style:{display:'flex',alignItems:'center',gap:'6px',fontSize:'10.5px',fontWeight:700,color:C.deep}},
              h('span',{},AR(off)+' وحدات معروضة'),
              sites>1?h('span',{style:{fontSize:'9px',fontWeight:700,color:C.blue,background:C.blueLt,border:'1px solid '+C.blueBd,borderRadius:'6px',padding:'1px 6px'}},AR(sites)+' مواقع'):null),
            h('div',{style:{display:'flex',alignItems:'center',gap:'6px',fontSize:'9.5px',fontWeight:700,color:C.green}},
              h('span',{},'✓'),h('span',{},AR(idn)+' محدَّدة — رقم تسلسلي ومستندات وموقع')),
            gh?h('div',{style:{display:'flex',alignItems:'center',gap:'6px',fontSize:'9.5px',fontWeight:700,color:'#8a4f08'}},
              h('span',{},'?'),h('span',{},AR(gh)+' غير محدَّدة — لا يمكن فحص جاهزيتها')):null);
        })(),
        null);
    };
    return h('div',{style:{background:'rgba(255,255,255,.97)',backdropFilter:'blur(10px)',border:'1px solid '+C.blt,borderRadius:'18px',boxShadow:'0 16px 44px rgba(15,34,56,.18)',display:'flex',flexDirection:'column',overflow:'hidden',maxHeight:'calc(100vh - 250px)'}},
      h('div',{style:{padding:'13px 15px 11px',borderBottom:'1px solid '+C.blt}},
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
          h('div',{style:{fontSize:'13.5px',fontWeight:700,color:C.deep}},'العروض المستلمة'),
          h('span',{style:{fontSize:'10.5px',fontWeight:700,color:C.blue,background:C.blueLt,border:'1px solid '+C.blueBd,borderRadius:'7px',padding:'2px 7px'}},AR(list.length)),
          h('div',{style:{flex:1}}),
          h('button',{onClick:()=>this.simNewBid(),title:'محاكاة: وصول عرض جديد الآن',
            style:{background:C.greenLt,border:'1px solid '+C.greenBd,color:C.green,borderRadius:'8px',padding:'3px 9px',fontSize:'9.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'⚡ عرض جديد'),
          h('span',{style:{fontSize:'9.5px',fontWeight:600,color:C.muted}},REQ_ID)),
        h('div',{style:{fontSize:'10.5px',color:C.muted,fontWeight:600,marginTop:'5px',lineHeight:1.6}}, this.itemsMode==='multi'?'مورّدون يزايدون على البند المحدّد — اختر أحدهم من الخريطة أو القائمة':'اختر مورّداً من الخريطة أو القائمة لفتح غرفة صفقته'),
        h('div',{style:{display:'flex',gap:'5px',marginTop:'10px',background:C.surface,padding:'3px',borderRadius:'10px'}},
          sorts.map(o=>h('button',{key:o[0],onClick:()=>this.setBidSort(o[0]),style:{flex:1,background:this.bidSort===o[0]?'#fff':'transparent',border:'1px solid '+(this.bidSort===o[0]?C.blueBd:'transparent'),color:this.bidSort===o[0]?C.blue:C.muted,borderRadius:'8px',padding:'6px 4px',fontSize:'10.5px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',boxShadow:this.bidSort===o[0]?'0 1px 3px rgba(15,34,56,.08)':'none'}},o[1]))),
        this.rDistFilter()),
      h('div',{style:{flex:1,overflowY:'auto',minHeight:0,padding:'11px',display:'flex',flexDirection:'column',gap:'9px',background:C.s2}}, list.map(card)),
      this.rColourKey());
  }


  rColourKey(){ const open=!!this.keyOpen;
    const mach=[[C.green,true,'✓','مؤكّدة — أكّد المورد ساحتها في جاهزية العرض'],[C.red,false,'؟','غير مؤكّدة — لم يؤكّدها بعد']];
    return h('div',{style:{flexShrink:0,borderTop:'1px solid '+C.blt,background:'#fff'}},
      h('button',{onClick:()=>{ this.keyOpen=!open; this.up(); },
        style:{width:'100%',display:'flex',alignItems:'center',gap:'8px',background:'none',border:0,padding:'9px 14px',cursor:'pointer',fontFamily:'inherit'}},
        h('span',{style:{width:'16px',height:'16px',borderRadius:'50%',flexShrink:0,background:C.blueLt,border:'1px solid '+C.blueBd,color:C.blue,fontSize:'10px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}},'؟'),
        h('span',{style:{flex:1,textAlign:'start',fontSize:'10.5px',fontWeight:800,color:C.deep}},'ما معنى الألوان؟'),
        h('span',{style:{color:C.muted,fontSize:'11px',transform:open?'rotate(90deg)':'none',transition:'.15s'}},'‹')),
      open? h('div',{style:{padding:'0 14px 12px'}},
        // One scale: every pin is a machine, so every pin follows the same two colours.
        h('div',{style:{fontSize:'9.5px',fontWeight:800,color:C.muted,marginBottom:'7px'}},'كل دبّوس على الخريطة = معدّة واحدة'),
        mach.map(r=>h('div',{key:r[3],style:{display:'flex',alignItems:'center',gap:'7px',marginBottom:'5px'}},
          h('span',{style:{width:'14px',height:'14px',borderRadius:'50%',flexShrink:0,background:'#fff',border:'2.5px '+(r[1]?'solid':'dashed')+' '+r[0],display:'flex',alignItems:'center',justifyContent:'center',fontSize:'7.5px',fontWeight:900,color:r[0]}},r[2]),
          h('span',{style:{fontSize:'10px',fontWeight:700,color:C.navy}},r[3]))),
        h('div',{style:{marginTop:'9px',paddingTop:'8px',borderTop:'1px solid '+C.blt,fontSize:'9.5px',fontWeight:600,color:C.muted,lineHeight:1.7}},
          '«غير مؤكّدة» لا تعني غير متوفّرة — تعني أن المورد لم يحدّد ساحتها في جاهزية العرض بعد. اطلب التأكيد من لوحة المعدّة.'),
        h('div',{style:{fontSize:'9.5px',fontWeight:600,color:C.muted,marginTop:'6px',lineHeight:1.7}},
          'الوحدات المضافة كعدد فقط لا تظهر على الخريطة — لا توجد معدّة مسجّلة لها.')) : null);
  }


  sortedBids(){ const k=this.bidSort;
    return this.bidsFor().slice().sort((a,b)=> k==='dist'? a.km-b.km : a.rate-b.rate);
  }


  selectSup(i){ const s=SUPPLIERS[i];
    if(this.selSup!=null) this._supStates[this.selSup]=this.S;
    if(this.selSup!==i) this.selUnit=null;   // a machine choice does not carry across fleets
    this.selSup=i;
    if(this._supStates[i]) this.S=this._supStates[i];
    else { const st=freshState(); st.price.sup.rate=s.rate;
      // Seed the negotiated count from what this bid actually OFFERS (capped at the stepper max).
      // Hardcoding 1 made a 4-unit offer open as a 1-unit deal, which hid the whole scope question.
      st.qty=Math.max(1,Math.min(4,offeredOf(s)));
      const pm=st.terms.filter(t=>t.id==='price_main')[0]; if(pm) pm.agreedVal=AR(s.rate)+' ر.س / يوم';
      st.chips=[{who:'sup',txt:'تمت مطابقة معدّة '+s.name+' تلقائياً مع طلبك'}];
      this._supStates[i]=st; this.S=st; }
    if(s.status==='new') s.status='seen';
    this.drawerOpen=false; this.quoteOpen=false; this.agreeOpen=false; this.activePanel=null;
    this.up(); setTimeout(()=>this.updateLeaflet(true),70);
  }


  bandCount(){ return {shown:this.bidsFor().length, total:this.allBids().length}; }


  rDistFilter(){ const b=this.kmBand, c=this.bandCount();
    return h('div',{style:{marginTop:'8px'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'6px',marginBottom:'6px'}},
        h('span',{style:{fontSize:'9.5px',fontWeight:800,color:C.muted}},'المسافة'),
        h('div',{style:{flex:1}}),
        b!=null? h('span',{style:{fontSize:'9.5px',fontWeight:800,color:C.blue}},AR(c.shown)+' من '+AR(c.total)+' عروض'):null,
        b!=null? h('button',{onClick:()=>this.setDistBand(null),title:'إلغاء التصفية',
          style:{background:'none',border:0,color:C.muted,fontSize:'9.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',padding:'0 2px'}},'إلغاء ✕'):null),
      h('div',{style:{display:'flex',gap:'5px'}},
        this.distBands().map(o=>{ const on=(this.kmBand===o[0]);
          return h('button',{key:String(o[0]),onClick:()=>this.setDistBand(o[0]),
            style:{flex:1,background:on?C.blueLt:'#fff',border:'1px solid '+(on?C.blueBd:C.border),color:on?C.blue:C.muted,borderRadius:'8px',padding:'5px 3px',fontSize:'9.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},o[1]); })),
      (this.kmBand!=null && this.allBids().some(s=>typeof s.km!=='number'))
        ? h('div',{style:{fontSize:'8.5px',fontWeight:600,color:C.muted,lineHeight:1.7,marginTop:'5px'}},
            'العروض بلا موقع معروف (من خارج المنصّة) تبقى ظاهرة — المسافة غير معلومة، وليست بعيدة.')
        : null);
  }


  rItemStrip(){ const items=this.items||[];
    return h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:'10px',padding:'9px 22px',background:'#fff',borderBottom:'1px solid '+C.blt,overflowX:'auto',zIndex:29}},
      h('div',{style:{display:'flex',flexDirection:'column',gap:'1px',flexShrink:0,paddingInlineEnd:'12px',borderInlineEnd:'1px solid '+C.blt}},
        h('span',{style:{fontSize:'11px',fontWeight:700,color:C.deep,fontFamily:'ui-monospace,monospace',direction:'ltr'}},RFQ_ID),
        h('span',{style:{fontSize:'9.5px',fontWeight:600,color:C.muted}},'طلب متعدّد البنود')),
      items.map((st,i)=>{ const u=FLEET[st.unitIdx], on=i===this.activeItem;
        const save=this.S; this.S=st; const total=st.price.agreed||this.currentAsk(); const agreed=!!st.price.agreed; const waiting=!agreed&&st.price.turn==='supplier'; const conf=st.availabilityConfirmed; this.S=save;
        const dotC=agreed?C.green:(waiting?C.amber:C.blue);
        return h('button',{key:i,onClick:()=>this.switchItem(i),
          style:{flexShrink:0,display:'flex',alignItems:'center',gap:'9px',background:on?C.blueLt:'#fff',border:'1.5px solid '+(on?C.blue:C.border),borderRadius:'12px',padding:'7px 12px',cursor:'pointer',fontFamily:'inherit',textAlign:'start'}},
          h('div',{style:{width:'30px',height:'30px',borderRadius:'8px',background:on?'#fff':C.surface,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px',flexShrink:0}},st.icon),
          h('div',{style:{minWidth:0}},
            h('div',{style:{fontSize:'12px',fontWeight:700,color:C.deep,whiteSpace:'nowrap'}},u.spec),
            h('div',{style:{display:'flex',alignItems:'center',gap:'6px',marginTop:'2px'}},
              h('span',{style:{width:'7px',height:'7px',borderRadius:'50%',background:dotC,flexShrink:0}}),
              h('span',{style:{fontSize:'10px',fontWeight:600,color:C.muted}},AR(st.qty)+' وحدة · '),
              h('span',{style:{fontSize:'10.5px',fontWeight:700,color:C.deep,fontFamily:'ui-monospace,monospace',direction:'ltr'}},fmtEN(total)),
              h('span',{style:{fontSize:'9px',fontWeight:600,color:C.muted}},'ر.س'))),
          on?h('span',{style:{fontSize:'10px',fontWeight:700,color:C.blue,flexShrink:0}},'●'):null); }),
      h('div',{style:{flex:1}}),
      h('div',{style:{flexShrink:0,fontSize:'10.5px',fontWeight:600,color:C.muted,paddingInlineStart:'12px',borderInlineStart:'1px solid '+C.blt}},'💬 المحادثة موحّدة · الشروط تُضبط مرّة وتُعمّم'));
  }
