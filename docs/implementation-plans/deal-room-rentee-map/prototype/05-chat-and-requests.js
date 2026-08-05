/* ── 05-chat-and-requests.js ─────────────────────────────────────
 * Chat panel, the request cards the renter composes, and the arrival bubble anchored to the chat button.
 *
 * Verbatim from deal-room-rentee-map-v2.html. REFERENCE ONLY — prototype code uses
 * React.createElement, inline styles and fixture data. Read it for STRUCTURE,
 * GEOMETRY and ORDER; build with this repo's conventions. design.md is the distilled
 * version, this is the receipt.
 */

  pChat(){ const S=this.S; const typed=S.chips.filter(c=>c.kind==='me').length;
    const attOpt=(ic,t,s,kind)=>h('button',{key:kind,onClick:()=>this.attSend(kind),style:{display:'flex',alignItems:'center',gap:'9px',background:'none',border:'none',borderRadius:'11px',padding:'9px 10px',textAlign:'start',cursor:'pointer',fontFamily:'inherit',width:'100%'},onMouseEnter:e=>e.currentTarget.style.background=C.s2,onMouseLeave:e=>e.currentTarget.style.background='none'},
      h('span',{style:{width:'34px',height:'34px',borderRadius:'10px',background:C.blueLt,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',flexShrink:0}},ic),
      h('div',{style:{minWidth:0}},h('div',{style:{fontSize:'11.5px',fontWeight:800,color:C.deep}},t),h('div',{style:{fontSize:'9px',fontWeight:700,color:C.muted,marginTop:'2px'}},s)));
    const sugg=(k,lbl)=>h('button',{key:k,onClick:()=>this.chSuggest(k),style:{flexShrink:0,background:'#fff',border:'1px solid '+C.border,borderRadius:'16px',padding:'6px 11px',fontSize:'10.5px',fontWeight:700,color:C.navy,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},lbl);
    return h('div',{style:{display:'flex',flexDirection:'column',height:'100%'}},
      // supplier header — follows the SELECTED supplier (was hardcoded to the first fixture row)
      h('div',{style:{flexShrink:0,background:C.blue,padding:'11px 14px',display:'flex',alignItems:'center',gap:'11px'}},
        h('div',{style:{width:'42px',height:'42px',borderRadius:'50%',background:C.green,border:'2px solid rgba(255,255,255,.5)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'14px',fontWeight:900,flexShrink:0}},(this.curSup()?this.curSup().initials:'—')),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{color:'#fff',fontSize:'14px',fontWeight:900,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},(this.curSup()?this.curSup().name:'—')+(this.curSup()&&this.curSup().verified?' ✓':'')),
          h('div',{style:{color:'rgba(255,255,255,.78)',fontSize:'10.5px',marginTop:'2px'}},'مورد · '+(this.curSup()?this.curSup().city:'—')+' · 🟢 متصل الآن')),
        h('button',{onClick:()=>this.simSupplierChat(),title:'محاكاة: المورد يكتب رسالة',style:{width:'34px',height:'34px',borderRadius:'50%',border:'1.5px solid rgba(255,255,255,.3)',background:'rgba(255,255,255,.1)',color:'#fff',fontSize:'14px',cursor:'pointer',flexShrink:0}},'💬'),
        h('button',{onClick:()=>this.simSupplierMedia(),title:'محاكاة: المورد يرسل صورة',style:{width:'34px',height:'34px',borderRadius:'50%',border:'1.5px solid rgba(255,255,255,.3)',background:'rgba(255,255,255,.1)',color:'#fff',fontSize:'14px',cursor:'pointer',flexShrink:0}},'📷'),
        h('button',{onClick:()=>this.inAppCall(),title:'اتصال داخل التطبيق',style:{width:'40px',height:'40px',borderRadius:'50%',border:'1.5px solid rgba(255,255,255,.35)',background:'rgba(255,255,255,.14)',color:'#fff',fontSize:'16px',cursor:'pointer',flexShrink:0}},'📞')),
      // stream
      h('div',{ref:el=>{ if(el) requestAnimationFrame(()=>{ el.scrollTop=el.scrollHeight; }); },style:{flex:1,overflowY:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:'8px',background:'#E9EEF3'}},
        h('div',{style:{alignSelf:'flex-start',background:'#fff',borderRadius:'13px 13px 13px 4px',padding:'9px 12px',fontSize:'12.5px',color:C.deep,maxWidth:'80%',lineHeight:1.7,boxShadow:'0 1px 2px rgba(0,0,0,.08)'}},'أهلاً! المعدّة جاهزة لأي استفسار 👋'),
        S.chips.map((c,i)=>this.chatMsg(c,i))),
      this.rChatTabs(),
      this.rPendingCard(),
      // suggestion row (before user types) — showcases the mediator
      typed===0? h('div',{style:{flexShrink:0,display:'flex',gap:'7px',padding:'9px 12px 0',background:'#fff',overflowX:'auto'}},
        h('span',{style:{flexShrink:0,fontSize:'10px',fontWeight:800,color:C.muted,alignSelf:'center'}},'جرّب:'),
        sugg('phone','رقم جوال'), sugg('price','سعر باليوم'), sugg('plain','سؤال عادي')) : null,
      // composer
      h('div',{style:{flexShrink:0,position:'relative',padding:'10px 12px 11px',background:'#fff',borderTop:'1px solid '+C.blt,display:'flex',gap:'8px',alignItems:'center'}},
        this.attOpen? h('div',{style:{position:'absolute',bottom:'62px',insetInlineStart:'12px',zIndex:40,background:'#fff',borderRadius:'15px',boxShadow:'0 12px 34px rgba(15,34,56,.28)',padding:'7px',display:'flex',flexDirection:'column',gap:'3px',width:'270px',border:'1px solid '+C.blt}},
          attOpt('📄','مستند — العنوان الوطني','الوسيط يتعرّف عليه ويعرض إضافته لمستنداتك','addr'),
          attOpt('🖼️','صورة من موقع المشروع','يعرض تثبيتها على خريطة الصفقة','site'),
          attOpt('🎞️','وسائط أخرى','لا تصنيف — تمرّ بصمت','other')) : null,
        h('button',{onClick:()=>this.toggleAtt(),title:'إرفاق',style:{width:'38px',height:'38px',borderRadius:'50%',border:'1px solid '+C.border,background:this.attOpen?C.blueLt:'#fff',color:this.attOpen?C.blue:C.muted,fontSize:'16px',cursor:'pointer',flexShrink:0}},'📎'),
        h('input',{ref:el=>this._chatInput=el,placeholder:'اكتب رسالة…',style:{flex:1,minWidth:0,background:C.s2,border:'1px solid '+C.border,borderRadius:'20px',padding:'10px 14px',fontSize:'12.5px',outline:'none',fontFamily:'inherit',color:C.deep},
          onKeyDown:e=>{ if(e.key==='Enter'){ const v=e.target.value; e.target.value=''; this.chSend(v); } }}),
        h('span',{style:{fontSize:'18px',flexShrink:0,cursor:'default'}},'🎙️'),
        h('button',{onClick:()=>{ if(this._chatInput){ const v=this._chatInput.value; this._chatInput.value=''; this.chSend(v); } },title:'إرسال',style:{width:'40px',height:'40px',borderRadius:'50%',background:C.blue,color:'#fff',border:'none',fontSize:'14px',cursor:'pointer',transform:'scaleX(-1)',flexShrink:0}},'➤')));
  }


  rChatBubble(){
    if(this.bubbleHidden) return null;
    const a=this.bubbleArrival(); if(!a) return null;
    const more=this.pendingArrivals().filter(function(x){return x.kind!=='bid';}).length-1;
    const warm=a.kind==='refusal';
    // Filled, not tinted: this competes with a full map for attention, so an outlined card lost.
    const fill=warm?'#B26206':'#1D4ED8';
    return h('div',{style:{position:'absolute',top:'-8px',right:'66px',width:'262px',zIndex:26,
      background:fill,border:'2px solid #fff',borderRadius:'15px',padding:'11px 12px',
      boxShadow:'0 14px 36px rgba(9,20,34,.40), 0 0 0 4px '+(warm?'rgba(217,119,6,.22)':'rgba(37,99,235,.22)'),
      animation:'dpVbadge 1.6s ease-in-out 3, dpFade .22s ease',textAlign:'start'}},
      // tail — points at the chat button
      h('span',{style:{position:'absolute',top:'24px',right:'-8px',width:'14px',height:'14px',background:fill,
        borderTop:'2px solid #fff',borderRight:'2px solid #fff',transform:'rotate(45deg)'}}),
      h('div',{style:{display:'flex',alignItems:'center',gap:'6px',marginBottom:'5px'}},
        h('span',{style:{fontSize:'9.5px',fontWeight:800,color:'#fff',background:'rgba(255,255,255,.22)',borderRadius:'20px',padding:'2px 8px'}},this.arrivalKindLabel(a.kind)),
        h('div',{style:{flex:1}}),
        more>0?h('span',{style:{fontSize:'8.5px',fontWeight:900,color:fill,background:'#fff',borderRadius:'20px',padding:'1px 7px'}},'+'+AR(more)):null,
        h('button',{onClick:e=>{ e.stopPropagation(); this.hideBubble(); },title:'إخفاء',
          style:{background:'none',border:0,color:'rgba(255,255,255,.85)',fontSize:'12px',fontWeight:900,cursor:'pointer',fontFamily:'inherit',padding:'0 2px',lineHeight:1}},'✕')),
      h('button',{onClick:()=>{ this.bubbleHidden=false; this.openArrival(a); },
        style:{display:'block',width:'100%',textAlign:'start',background:'none',border:0,padding:0,cursor:'pointer',fontFamily:'inherit'}},
        h('div',{style:{fontSize:'11.5px',fontWeight:900,color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},a.supName),
        h('div',{style:{fontSize:'10.5px',fontWeight:600,color:'rgba(255,255,255,.92)',lineHeight:1.65,marginTop:'3px',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},a.txt),
        a.ref?h('div',{style:{fontSize:'8.5px',fontWeight:800,color:'rgba(255,255,255,.75)',marginTop:'4px',fontFamily:'ui-monospace,monospace',direction:'ltr',textAlign:'start'}},'↩ '+a.ref+(a.serial?(' · '+a.serial):'')):null,
        h('div',{style:{display:'inline-block',fontSize:'9.5px',fontWeight:900,color:fill,background:'#fff',borderRadius:'20px',padding:'4px 11px',marginTop:'8px'}},'افتح المحادثة ‹')));
  }


  bubbleArrival(){ return this.pendingArrivals().filter(function(a){return a.kind!=='bid';})[0]||null; }


  pendingArrivals(){ return (this.arrivals||[]).filter(function(a){return !a.read;}); }


  openArrival(a){
    a.read=true;
    if(a.kind==='bid'){ this.revealBid(a.supIdx); return; }
    if(a.supIdx!=null && a.supIdx!==this.selSup) this.selectSup(a.supIdx);
    this.openDrawer('chat');
  }


  rRequestCard(c,draft){ const st=this.cardState(c);
    const f=this.unitByRef(c);
    const tpl = f ? FLEET.find(x=>x.serial===f.u.serial) : null;
    const title = c.scope==='company' ? (this.curSup()?this.curSup().name:'الشركة')
                : tpl ? (tpl.model+' · '+tpl.spec)
                : f ? (this.curUnit().model+' · '+this.curUnit().spec) : 'المعدّة';
    return h('div',{style:{background:'#fff',border:'1.5px solid '+(draft?C.blue:C.blt),borderRadius:'14px',overflow:'hidden',boxShadow:draft?'0 6px 18px rgba(37,99,235,.16)':'0 1px 3px rgba(0,0,0,.10)'}},
      // identity strip — image + name + serial, all looked up from equipmentId
      h('div',{style:{display:'flex',alignItems:'center',gap:'9px',padding:'9px 11px',background:C.s2,borderBottom:'1px solid '+C.blt}},
        h('span',{style:{width:'34px',height:'34px',borderRadius:'9px',flexShrink:0,background:c.scope==='company'?'linear-gradient(135deg,#1E4A7A,'+C.blue+')':'linear-gradient(135deg,#F2C94C,#E19A2E)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px'}},c.scope==='company'?'🏢':'🏗️'),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:'11.5px',fontWeight:800,color:C.deep,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},title),
          c.serial? h('div',{style:{fontSize:'9.5px',fontWeight:700,color:C.muted,marginTop:'1px',fontFamily:'ui-monospace,monospace',direction:'ltr',textAlign:'start'}},c.serial):null),
        h('span',{style:{flexShrink:0,fontSize:'9px',fontWeight:800,color:C.muted,fontFamily:'ui-monospace,monospace',direction:'ltr'}},c.ref)),
      h('div',{style:{padding:'10px 11px'}},
        h('div',{style:{fontSize:'10px',fontWeight:800,color:C.blue,marginBottom:'5px'}},this.cardKindLabel(c)),
        (c.docTypes&&c.docTypes.length)
          ? h('div',{style:{display:'flex',flexWrap:'wrap',gap:'5px',marginBottom:'7px'}},
              c.docTypes.map((n,j)=>h('span',{key:j,style:{fontSize:'9.5px',fontWeight:700,color:C.navy,background:C.s2,border:'1px solid '+C.blt,borderRadius:'7px',padding:'3px 8px'}},n)))
          : h('div',{style:{fontSize:'11.5px',fontWeight:600,color:C.navy,lineHeight:1.7,marginBottom:'7px'}},c.text),
        // the live answer — no stored status, re-read from the machine on every render
        h('div',{style:{display:'flex',alignItems:'center',gap:'7px',paddingTop:'8px',borderTop:'1px dashed '+C.blt}},
          h('span',{style:{width:'8px',height:'8px',borderRadius:'50%',background:st.color,flexShrink:0}}),
          h('span',{style:{fontSize:'10.5px',fontWeight:800,color:st.color}},st.txt))),
      draft? h('div',{style:{display:'flex',gap:'8px',padding:'0 11px 11px'}},
        h('button',{onClick:()=>{this.pendingCard=null;this.up();},style:{flex:1,background:'#fff',border:'1.5px solid '+C.border,color:C.navy,borderRadius:'10px',padding:'9px',fontSize:'12px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},'إلغاء'),
        h('button',{onClick:()=>this.sendPendingCard(),style:{flex:2,background:C.blue,border:0,color:'#fff',borderRadius:'10px',padding:'9px',fontSize:'12px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},'أرسل الطلب')) : null);
  }


  chatMsg(c,i){
    if(c.kind==='reply') return h('div',{key:i,style:{alignSelf:'flex-start',maxWidth:'86%'}},this.rReplyCard(c.reply));
    // A sent request keeps its card form — the renter and the supplier look at the same object.
    if(c.card) return h('div',{key:i,style:{alignSelf:'flex-end',maxWidth:'86%',width:'86%'}},this.rRequestCard(c.card,false));
    if(c.kind==='me') return h('div',{key:i,style:{alignSelf:'flex-end',background:'#D9EEFF',borderRadius:'13px 13px 4px 13px',padding:'9px 12px',fontSize:'12.5px',color:C.deep,maxWidth:'80%',lineHeight:1.7,boxShadow:'0 1px 2px rgba(0,0,0,.08)'}},c.txt);
    if(c.kind==='media'){ const me=c.who==='me';
      return h('div',{key:i,style:{alignSelf:me?'flex-end':'flex-start',display:'flex',alignItems:'center',gap:'9px',background:me?'#D9EEFF':'#fff',borderRadius:me?'13px 13px 4px 13px':'13px 13px 13px 4px',padding:'9px 11px',maxWidth:'80%',boxShadow:'0 1px 2px rgba(0,0,0,.08)'}},
        h('span',{style:{width:'36px',height:'36px',borderRadius:'10px',background:C.blueLt,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'17px',flexShrink:0}},c.ic),
        h('div',{style:{minWidth:0}},h('div',{style:{fontSize:'11.5px',fontWeight:800,color:C.deep}},c.name),h('div',{style:{fontSize:'9px',fontWeight:700,color:C.muted,marginTop:'2px'}},c.sub))); }
    if(c.kind==='ai'){ if(c.dismissed) return null;
      return h('div',{key:i,style:{alignSelf:'stretch',background:'linear-gradient(180deg,#F4F9FF,#ECF3FE)',border:'1.5px dashed '+C.blueBd,borderRadius:'14px',padding:'10px 12px',margin:'2px 2px'}},
        h('div',{style:{display:'flex',alignItems:'center',gap:'6px',marginBottom:'6px'}},
          h('span',{style:{fontSize:'12px'}},'✨'),
          h('span',{style:{fontSize:'10px',fontWeight:800,color:C.blue}},'مساعد مُعدّاتك'),
          h('span',{style:{fontSize:'8.5px',fontWeight:800,color:C.muted,background:'#fff',border:'1px solid '+C.blt,borderRadius:'8px',padding:'2px 7px'}},'يظهر لك فقط'),
          h('button',{onClick:()=>this.aiDismiss(i),title:'إخفاء',style:{marginInlineStart:'auto',background:'none',border:'none',color:C.muted,fontSize:'12px',fontWeight:900,cursor:'pointer',padding:'2px 4px'}},'✕')),
        h('div',{style:{fontSize:'11.5px',fontWeight:600,color:C.navy,lineHeight:1.8},dangerouslySetInnerHTML:{__html:c.txt}}),
        c.done
          ? h('div',{style:{marginTop:'8px',background:C.greenLt,border:'1px solid '+C.greenBd,color:C.green,borderRadius:'10px',padding:'7px 10px',fontSize:'10.5px',fontWeight:800,textAlign:'center'}},'✓ '+c.doneTxt)
          : h('div',{style:{display:'flex',gap:'7px',marginTop:'9px'}},
              c.actions.map((a,j)=>h('button',{key:j,onClick:()=>this.aiAct(i,j),style:a.ghost
                ? {flex:'0 0 auto',background:'#fff',color:C.muted,border:'1.5px solid '+C.border,borderRadius:'10px',padding:'8px 12px',fontSize:'10.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}
                : {flex:1,background:C.blue,color:'#fff',border:'none',borderRadius:'10px',padding:'8px',fontSize:'10.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},a.lbl)))); }
    // narration chip — centered system line
    const bd=c.who==='me'?C.blue:C.green;
    return h('div',{key:i,style:{alignSelf:'center',maxWidth:'88%',background:'rgba(255,255,255,.92)',borderInlineStart:'3px solid '+bd,borderRadius:'10px',padding:'6px 12px',fontSize:'10.5px',fontWeight:700,color:'#41607a',textAlign:'center',lineHeight:1.6,boxShadow:'0 1px 2px rgba(0,0,0,.06)'}},c.txt);
  }


  renderVals(){
    return {
      devBarEl:null,
      supplierChip:this.rSupplierChip(),
      requestSummary:this.rRequest(),
      modeToggleEl:this.rModeToggle(),
      itemStripEl:this.itemsMode==='multi'?this.rItemStrip():null,
      // Colour explanation lives in the bid panel footer (rColourKey) — a floating overlay at
      // z-index 23 sat behind that panel in RTL, so it was invisible in the one state that needed it.
      mapLegend:null,
      guideEl:this.rBidsPanel(),   // the bid list is the entry point and stays visible in every state
      railEl:this.rRail(),
      drawerEl:this.rDrawer(),
      priceBarEl:this.selSup==null?null:(this.isOff(this.curSup())?this.rOffPriceBar():this.rPriceBar()),
      quoteModalEl:(this.quoteOpen||this.unitPick)?h(React.Fragment,null,
        this.quoteOpen?h('div',{key:'q'},this.rQuoteModal()):null,
        this.unitPick?h('div',{key:'p'},this.rUnitPickModal()):null):null,
      agreeModalEl:this.agreeOpen?this.rAgreeModal():null,
      supplierModalEl:this.supplierOpen?this.rSupplierModal():null,
      supplierViewModalEl:h(React.Fragment,null,
        this.supViewOpen?this.rSupplierViewModal():null,
        this.rSubmissionModal()),
      tourEl:this.tourOn?this.rTour():null,
      toastEl:h(React.Fragment,null,this.rToast(),this.rNotif()),
    };
  }
