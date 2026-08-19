/* ── 04-machine-panel.js ─────────────────────────────────────────
 * The floating machine panel: drawer chrome, sticky identity header, three tabs, composition bar, fit grid, request rows, document lists, empty state.
 *
 * Verbatim from deal-room-rentee-map-v2.html. REFERENCE ONLY — prototype code uses
 * React.createElement, inline styles and fixture data. Read it for STRUCTURE,
 * GEOMETRY and ORDER; build with this repo's conventions. design.md is the distilled
 * version, this is the receipt.
 */

  rDrawer(){ if(!this.drawerOpen) return null;
    const p=this.activePanel;
    const META={equip:{t:'المعدّة والمطابقة',s:'الوحدة المعروضة مقابل ما طلبته',ic:'🏗️'},
                verif:{t:'التوثيق والمستندات',s:'ما يثبت جاهزية المورد والمعدّة',ic:'🛡️'},
                chat:{t:'المحادثة',s:'كل ما دار في غرفة الصفقة',ic:'💬'},
                terms:{t:'شروط التشغيل',s:'البنود المتفق عليها والمختلف عليها',ic:'📋'}};
    const m=META[p]||META.equip;
    // NOTE: this is the SECOND panel dispatcher (rPanel is the other). Both must know every panel —
    // adding a route to only one is why the submission viewer rendered nowhere.
    const body = p==='offequip'?this.pOffEquip() : p==='sub'?this.pSubmission() : p==='verif'?(this.eqTab='docs',this.pEquip()) : p==='chat'?this.pChat() : p==='terms'?this.pTerms() : this.pEquip();
    const w=this.drawerMax?'min(760px, calc(100% - 40px))':'420px';
    return h('div',{id:'dpDrawer',style:{position:'absolute',top:'14px',bottom:'14px',right:'14px',width:w,zIndex:40,display:'flex',flexDirection:'column',
      background:'#fff',border:'1px solid '+C.blt,borderRadius:'18px',boxShadow:'0 18px 48px rgba(15,34,56,.22)',overflow:'hidden',animation:'dpFade .18s ease'}},
      h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:'11px',padding:'13px 15px',borderBottom:'1px solid '+C.blt,background:C.s2}},
        h('div',{style:{width:'36px',height:'36px',borderRadius:'11px',background:C.blueLt,border:'1px solid '+C.blueBd,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'17px',flexShrink:0}},m.ic),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:'13.5px',fontWeight:700,color:C.deep}},m.t),
          h('div',{style:{fontSize:'10px',fontWeight:600,color:C.muted,marginTop:'2px'}},m.s)),
        h('button',{onClick:()=>this.toggleDrawerMax(),title:this.drawerMax?'تصغير':'توسيع',
          style:{width:'30px',height:'30px',borderRadius:'9px',background:'#fff',border:'1px solid '+C.border,color:C.muted,cursor:'pointer',fontSize:'13px',fontFamily:'inherit'}},this.drawerMax?'⤡':'⤢'),
        h('button',{onClick:()=>this.closeDrawer(),title:'إغلاق',
          style:{width:'30px',height:'30px',borderRadius:'50%',background:'#fff',border:'1px solid '+C.border,color:C.muted,cursor:'pointer',fontSize:'14px',fontFamily:'inherit'}},'✕')),
      h('div',{style:{flex:1,overflowY:'auto',minHeight:0,background:'#fff'}}, body));
  }


  rMachineHeader(){ const u=this.curUnit(), ur=this.curUnitRec(); if(!ur) return null;
    return h('div',{style:{background:'#fff',border:'1px solid '+C.blt,borderRadius:'14px',padding:'11px 12px',marginBottom:'10px'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'11px'}},
        h('div',{style:{width:'46px',height:'46px',borderRadius:'11px',background:'linear-gradient(135deg,#F2C94C,#E19A2E)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'22px',flexShrink:0}},'🏗️'),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:'12.5px',fontWeight:800,color:C.deep}},u.model+' · '+u.spec),
          h('div',{style:{fontSize:'10.5px',fontWeight:700,color:C.muted,marginTop:'2px',fontFamily:'ui-monospace,monospace',direction:'ltr',textAlign:'start'}},ur.serial+' · '+ur.year)),
        // Filled and saturated: this is the headline fact about the machine, and it must match the
        // colour of its own pin on the map (green confirmed / red not).
        h('span',{style:{flexShrink:0,display:'inline-flex',alignItems:'center',gap:'5px',fontSize:'10px',fontWeight:900,borderRadius:'20px',padding:'5px 11px',color:'#fff',
          background:ur.confirmed?'#12904A':'#C62A2A',boxShadow:'0 2px 8px '+(ur.confirmed?'rgba(18,144,74,.35)':'rgba(198,42,42,.35)')}},
          h('span',{style:{width:'7px',height:'7px',borderRadius:'50%',background:'rgba(255,255,255,.9)'}}),
          ur.confirmed?'التوفّر مؤكّد':'التوفّر غير مؤكّد')),
      this.rOfferSummary(),
      this.rUnitSwitch());
  }


  rMachineTabs(){ const tab=this.eqTab||'fit';
    const eqAtt=this.vfAttention(this.vfEquipDocs()), coAtt=this.vfAttention(this.vfCompanyDocs());
    const fitAtt=(this.fitGateOpen()?1:0)+((this.curUnitRec()&&!this.curUnitRec().confirmed)?1:0);
    const T=[['fit','التوفّر والمطابقة',fitAtt],['docs','مستندات المعدّة',eqAtt],['co','مستندات الشركة',coAtt]];
    return h('div',{style:{display:'flex',gap:'6px',marginBottom:'12px'}},
      T.map(x=>{ const on=tab===x[0];
        return h('button',{key:x[0],onClick:()=>{this.eqTab=x[0];this.up();},
          style:{position:'relative',flex:1,padding:'9px 4px',borderRadius:'11px',border:'1.5px solid '+(on?C.blue:C.blt),background:on?C.blueLt:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:'11px',fontWeight:800,color:on?C.blue:C.muted,lineHeight:1.3}},x[1],
          x[2]?h('span',{style:{position:'absolute',top:'-6px',insetInlineStart:'-5px',minWidth:'17px',height:'17px',borderRadius:'9px',background:C.red,color:'#fff',fontSize:'9.5px',fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid #fff'}},AR(x[2])):null); }));
  }


  rOfferSummary(){ const s=this.curSup(); if(!s) return null;
    const L=levelsOf(s), off=L.offered;
    if(off<2 && !L.claimed) return null;          // a single registered machine needs no breakdown
    const GOOD='#12904A', BAD='#C62A2A';
    // Off-platform units carry photos and documents but no listing — NOT the count-only padding below.
    if(this.isOff(s)){
      const sub=s.submission;
      return h('div',{style:{background:'#fff',border:'1px solid '+C.blt,borderRadius:'12px',padding:'10px 12px',marginBottom:'10px'}},
        h('div',{style:{fontSize:'11.5px',fontWeight:800,color:C.deep}},'قدّم المورد عرض سعر لـ'+this.unitsWord(off)),
        h('div',{style:{fontSize:'9.5px',fontWeight:700,color:C.muted,marginTop:'2px',marginBottom:'8px'}},'وهذا ما تتكوّن منه'),
        h('div',{style:{display:'flex',gap:'4px',marginBottom:'8px'}},
          h('span',{style:{flex:1,height:'16px',borderRadius:'4px',background:'repeating-linear-gradient(45deg,#8a4f08 0 5px,#D4A056 5px 10px)',display:'flex',alignItems:'center',justifyContent:'center'}},
            h('span',{style:{fontSize:'9px',fontWeight:900,color:'#fff',fontFamily:'ui-monospace,monospace',textShadow:'0 1px 2px rgba(15,34,56,.55)'}},AR(off)))),
        h('div',{style:{display:'flex',alignItems:'center',gap:'6px'}},
          h('span',{style:{width:'11px',height:'11px',borderRadius:'3px',flexShrink:0,background:'repeating-linear-gradient(45deg,#8a4f08 0 5px,#D4A056 5px 10px)'}}),
          h('span',{style:{fontSize:'10px',fontWeight:800,color:C.deep}},AR(off)+' من خارج المنصّة')),
        h('div',{style:{fontSize:'9.5px',fontWeight:600,color:C.muted,lineHeight:1.7,marginTop:'7px',paddingTop:'7px',borderTop:'1px solid '+C.blt}},
          'بمستندات وصور لكن بلا معدّة مسجّلة — لا رقم تسلسلي ولا موقع، فلا تظهر على الخريطة. يمكنك فحص كل ما أرسله من زر «عرض العرض المُقدَّم».'));
    }
    const buckets=[
      {n:L.confirmed,c:GOOD, label:'جاهزة ومؤكّدة',   sub:'معدّة مسجّلة وأكّد المورد ساحتها', dash:false},
      {n:L.located,  c:BAD,  label:'غير مؤكّدة',      sub:'معدّة مسجّلة ولم يؤكّد ساحتها بعد', dash:false},
      {n:L.claimed,  c:null, label:'غير مسجّلة',      sub:'عدد فقط — لا معدّة ولا مستندات ولا موقع', dash:true},
    ].filter(function(b){ return b.n>0; });
    const HATCH='repeating-linear-gradient(45deg,#5E7C93 0 5px,#8AA6BC 5px 10px)';
    const seg=b=>h('span',{key:'s'+b.label,title:b.label+' — '+b.sub,
      style:{flex:b.n,height:'16px',background:b.dash?HATCH:b.c,borderRadius:'4px',
        border:b.dash?'1px solid #4E6B80':'none',
        display:'flex',alignItems:'center',justifyContent:'center'}},
      h('span',{style:{fontSize:'9px',fontWeight:900,color:'#fff',fontFamily:'ui-monospace,monospace',textShadow:b.dash?'0 1px 2px rgba(15,34,56,.55)':'none'}},AR(b.n)));
    const key=b=>h('div',{key:'k'+b.label,style:{display:'flex',alignItems:'center',gap:'6px',minWidth:0}},
      h('span',{style:{width:'11px',height:'11px',borderRadius:'3px',flexShrink:0,
        background:b.dash?HATCH:b.c,border:b.dash?'1px solid #4E6B80':'none'}}),
      h('span',{style:{fontSize:'10px',fontWeight:800,color:C.deep,whiteSpace:'nowrap'}},AR(b.n)+' '+b.label));
    return h('div',{style:{background:'#fff',border:'1px solid '+C.blt,borderRadius:'12px',padding:'10px 12px',marginBottom:'10px'}},
      h('div',{style:{marginBottom:'9px'}},
        h('div',{style:{fontSize:'11.5px',fontWeight:800,color:C.deep}},'قدّم المورد عرض سعر لـ'+this.unitsWord(off)),
        h('div',{style:{fontSize:'9.5px',fontWeight:700,color:C.muted,marginTop:'2px'}},'وهذا ما تتكوّن منه')),
      h('div',{style:{display:'flex',gap:'4px',marginBottom:'8px'}},buckets.map(seg)),
      h('div',{style:{display:'flex',flexWrap:'wrap',gap:'12px'}},buckets.map(key)),
      L.claimed? h('div',{style:{fontSize:'9.5px',fontWeight:600,color:C.muted,lineHeight:1.7,marginTop:'7px',paddingTop:'7px',borderTop:'1px solid '+C.blt}},
        AR(L.claimed)+' من هذه الوحدات أضافها المورد كعدد فقط — بلا رقم تسلسلي ولا مستندات ولا موقع. لا تظهر على الخريطة ولا بين المعدّات أدناه، ولا يمكنك فحصها.') : null);
  }


  pEquip(){ const tab=this.eqTab||'fit';
    // Company documents still work with no machine; the other two tabs have no subject.
    if(!this.curUnitRec() && tab!=='co') return h('div',{style:{padding:'16px'}},
      this.rMachineTabs(), this.rOfferSummary(), this.rNoMachines());
    if(tab==='docs') return h('div',{style:{padding:'16px'}},this.rMachineHeader(),this.rMachineTabs(),this.rDocPanel(this.vfEquipDocs(),'equip'));
    if(tab==='co')   return h('div',{style:{padding:'16px'}},this.rMachineHeader(),this.rMachineTabs(),this.rDocPanel(this.vfCompanyDocs(),'company'));
    return this.pEquipFit();
  }


  pEquipFit(){ const u=this.curUnit(), gate=this.fitGateOpen();
    const ICN={ok:'✓',bad:'⚠',claim:'?',na:'—'};
    const stColor={ok:C.green,bad:C.red,claim:C.amber,na:C.muted};
    const stBg={ok:C.greenLt,bad:C.redLt,claim:C.amberLt,na:C.s2};
    const stBd={ok:C.greenBd,bad:C.redBd,claim:C.amberBd,na:C.border};
    const rows=this.eqSummary();
    const ur=this.curUnitRec(), rd=this.unitReadiness(ur);
    return h('div',{style:{padding:'16px'}},
      this.rMachineHeader(),
      this.rMachineTabs(),
      // images first — the renter recognises a machine by sight before he reads anything about it
      this.card([ this.h4('صور المعدّة'), this.rUnitPhotos() ]),

      // match against the request — a card again, not a foldout
      this.card([ this.h4('ملخّص المطابقة مع طلبك'),
        h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}},
          rows.map((r,i)=>h('div',{key:i,style:{gridColumn:r.full?'1 / -1':'auto',border:'1px solid '+stBd[r.st],background:stBg[r.st],borderRadius:'10px',padding:'9px 11px'}},
            h('div',{style:{fontSize:'9.5px',color:C.muted,fontWeight:600}},r.k),
            h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'6px',marginTop:'3px'}},
              h('span',{style:{fontSize:'12.5px',fontWeight:700,color:r.st==='bad'?C.red:r.st==='claim'?'#8a4f08':r.st==='na'?C.muted:C.navy}},r.v),
              h('span',{style:{fontSize:'14px',fontWeight:700,color:stColor[r.st]}},ICN[r.st]))))) ]),
      this.rFitActions());
  }


  rFitActions(){ const ur=this.curUnitRec(); if(!ur) return null;
    const row=(label,sub,onClick)=>h('button',{key:label,onClick:onClick,
      style:{width:'100%',display:'flex',alignItems:'center',gap:'10px',textAlign:'start',background:'#fff',border:'1.5px solid '+C.border,borderRadius:'12px',padding:'11px 12px',cursor:'pointer',fontFamily:'inherit',marginBottom:'8px'}},
      h('span',{style:{width:'24px',height:'24px',borderRadius:'8px',flexShrink:0,background:C.blueLt,border:'1px solid '+C.blueBd,color:C.blue,fontSize:'13px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}},'+'),
      h('span',{style:{flex:1,minWidth:0}},
        h('span',{style:{display:'block',fontSize:'12px',fontWeight:700,color:C.navy}},label),
        h('span',{style:{display:'block',fontSize:'9.5px',fontWeight:600,color:C.muted,marginTop:'1px'}},sub)),
      h('span',{style:{color:C.muted,fontSize:'12px',flexShrink:0}},'‹'));
    const acts=[];
    if(!ur.confirmed) acts.push(row('اطلب تأكيد التوفّر','ليؤكّد المورد ساحة هذه المعدّة',
      ()=>this.composeRequest(ur,{kind:'availability',text:'هل المعدّة '+ur.serial+' متوفّرة؟ حدّد ساحتها في جاهزية العرض لتأكيدها.'})));
    acts.push(row('اطلب معدّة أخرى','لترى ما لديه من نفس النوع',()=>this.askAnotherOfType()));
    // Stacked, not side by side. Two buttons in a row read as "pick one"; a list reads as "here is
    // what you can send", which is what these are — independent requests, either or both.
    return h('div',{style:{marginTop:'2px'}},
      acts.length>1? h('div',{style:{fontSize:'9.5px',fontWeight:700,color:C.muted,marginBottom:'7px'}},'أرسل أيّهما شئت أو كليهما — كل طلب مستقل') : null,
      acts);
  }


  rDocPanel(list,tab){
    const VF={ok:{ic:'✓',lbl:'موثّق',c:C.green,bg:C.greenLt,bd:C.greenBd},checking:{ic:'◔',lbl:'قيد الفحص',c:C.blue,bg:C.blueLt,bd:C.blueBd},deferred:{ic:'—',lbl:'مؤجّل باتفاق',c:C.amber,bg:C.amberLt,bd:C.amberBd},declared:{ic:'?',lbl:'إقرار ذاتي',c:C.amber,bg:C.amberLt,bd:C.amberBd},missing:{ic:'—',lbl:'غير متاح',c:C.muted,bg:C.s2,bd:C.border}};
    return h('div',{},
      h('div',{style:{fontSize:'10px',fontWeight:700,color:C.muted,marginBottom:'2px'}},
        tab==='equip'?'تخصّ الوحدة المختارة أعلاه':'تخصّ الشركة — لا تتغيّر بتغيير الوحدة'),
      this.rDocSelectBar(list,tab),
      list.map((d,i)=>{ const st=VF[d.s]||VF.missing; const hasDoc=d.s==='ok'||d.s==='checking';
        const picked=this.docSelected(tab,i);
        return h('div',{key:i,style:{display:'flex',alignItems:'center',gap:'10px',padding:'7px 10px',border:'1px solid '+(picked?C.blue:st.bd),borderRadius:'12px',marginBottom:'6px',background:picked?C.blueLt:(d.s==='ok'?'#fff':st.bg)}},
          h('button',{onClick:()=>this.toggleDoc(tab,i),title:'تحديد',
            style:{width:'20px',height:'20px',flexShrink:0,borderRadius:'6px',border:'2px solid '+(picked?C.blue:C.border),background:picked?C.blue:'#fff',color:'#fff',fontSize:'12px',fontWeight:900,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',padding:0}},picked?'✓':''),
          h('span',{style:{position:'relative',width:'34px',height:'34px',borderRadius:'9px',flexShrink:0,border:'1px solid '+C.blt,background:hasDoc?'#EDF2F7':C.s2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px',color:C.muted}},hasDoc?'📄':(d.s==='declared'?'?':'—'),
            h('span',{style:{position:'absolute',bottom:'-3px',insetInlineEnd:'-3px',width:'16px',height:'16px',borderRadius:'50%',background:st.c,color:'#fff',fontSize:'9px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid #fff'}},st.ic)),
          h('div',{style:{flex:1,minWidth:0}},
            h('div',{style:{fontSize:'12px',fontWeight:700,color:C.navy}},d.k),
            h('div',{style:{fontSize:'9.5px',fontWeight:600,marginTop:'2px',color:d.expSoon?C.amber:C.muted}},d.exp?((d.expSoon?'⚠ ينتهي قريباً · ':'✓ ')+d.exp):(d.meta||st.lbl))),
          hasDoc
            ? h('button',{onClick:()=>this.toast('تحميل المستند (نموذج)'),title:'تنزيل',style:{width:'30px',height:'30px',flexShrink:0,borderRadius:'9px',border:'1px solid '+C.blueBd,background:C.blueLt,color:C.blue,cursor:'pointer',fontSize:'14px',fontFamily:'inherit'}},'⤓')
            // not provided → ask for this one directly, without having to tick it first
            : h('button',{onClick:()=>this.requestOneDoc(d,tab),title:'اطلب هذا المستند',style:{flexShrink:0,borderRadius:'9px',border:'1px solid '+C.blueBd,background:C.blueLt,color:C.blue,cursor:'pointer',fontSize:'10px',fontWeight:800,fontFamily:'inherit',padding:'6px 10px'}},'+ طلب')); }),
      this.rDocConfirm(list,tab),
      this.rDlAsk(),
      // one send at a time: while the confirmation is open it owns the actions
      (this.docConfirm&&this.docConfirm.tab===tab)?null:this.rDocActions(list,tab));
  }


  rNoMachines(){
    return h('div',{style:{background:C.s2,border:'1.5px dashed '+C.border,borderRadius:'14px',padding:'16px 14px',textAlign:'center',marginBottom:'12px'}},
      h('div',{style:{fontSize:'26px',marginBottom:'6px'}},'🗒️'),
      h('div',{style:{fontSize:'12.5px',fontWeight:800,color:C.deep,marginBottom:'4px'}},'لا توجد معدّة مسجّلة في هذا العرض'),
      h('div',{style:{fontSize:'10.5px',fontWeight:600,color:C.muted,lineHeight:1.8}},
        'قدّم المورد سعراً وعدداً فقط، دون ربط أي معدّة مسجّلة — فلا رقم تسلسلي ولا مستندات معدّة ولا موقع، ولا شيء يمكن فحصه هنا. مستندات الشركة والمحادثة متاحة كالمعتاد.'),
      h('button',{onClick:()=>{ const s=this.curSup(); this.composeRequest({id:null,serial:null},{kind:'alternative',
          text:'عرضك لا يتضمّن معدّات مسجّلة. هل يمكنك ربط '+this.unitsWord(offeredOf(s))+' مسجّلة بعرضك حتى نتمكّن من فحصها؟'}); },
        style:{marginTop:'11px',background:C.blue,border:0,color:'#fff',borderRadius:'11px',padding:'10px 16px',fontSize:'11.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},
        'اطلب من المورد ربط معدّات مسجّلة'));
  }


  rUnitPhotos(){ const u=this.curUnitRec(); const n=this.unitPhotoCount(u); const SLOTS=['أمامية','اللوحة','العدّاد','جانبية'];
    return h('div',{style:{display:'flex',gap:'8px',marginTop:'10px',overflowX:'auto',paddingBottom:'2px'}},
      SLOTS.map((lbl,i)=>{ const has=i<n;
        return h('div',{key:i,title:lbl,style:{flexShrink:0,width:'74px'}},
          h('div',{style:{height:'58px',borderRadius:'11px',border:has?('1px solid '+C.blt):('1.5px dashed '+C.border),background:has?'#E8EEF5':C.s2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'19px',color:C.muted}}, has?'📷':'—'),
          h('div',{style:{fontSize:'8.5px',fontWeight:700,color:has?C.navy:C.muted,textAlign:'center',marginTop:'4px'}},lbl)); }));
  }


  eqSummary(){ const safety=this.S.docs.find(x=>x.id==='safety'); const u=this.curUnit();
    // Scope to the SELECTED machine where the machine carries the value; fall back to the request
    // item's template for attributes a listing does not hold per unit (fuel, attachments).
    const ur=this.curUnitRec();
    const year=ur?ur.year:u.year;
    const yNum=parseInt(String(year).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)),10);
    const yBad=Number.isFinite(yNum) && yNum < this.minYear();
    const certOk = ur ? !!ur.cert : (safety.state==='verified');
    return [
      {k:'النوع والحجم',v:u.spec,st:'ok',full:true},
      {k:'الصانع',v:u.maker||'غير مدخل',st:u.maker?'ok':'na'},
      {k:'سنة الصنع',v:yBad?(year+' · طلبت ٢٠٢٠+'):year,st:yBad?'bad':'ok',need:'سنة صنع ٢٠٢٠ أو أحدث'},
      {k:'نوع الوقود',v:u.fuel,st:'ok'},
      {k:'الملحقات',v:u.att||'غير مدخل',st:u.att?'ok':'na'},
      {k:'شهادة السلامة',v:safety.certType,st:certOk?'ok':'claim'},
    ].concat(this.S.operator?[{k:'شهادات المشغّل',v:'رخصة تشغيل · سلامة',st:'claim'}]:[]);
  }


  fitGateOpen(){ return this.eqNeeds().length>0 && !this.S.fitAccepted && !this.S.eligibleAsked; }


  openDrawer(panel){ this.activePanel=panel; this.drawerOpen=true;
    if(panel==='chat'){ this.unread=0; this.dismissNotifQuiet(); this.clearArrivalsFor(this.selSup); }
    this.up(); }


  rUnitSummaryCard(){ const u=this.curUnit(), ur=this.curUnitRec(); if(!ur) return null;
    const pct=this.unitMatchPct(), pc=pct>=100?C.green:pct>=50?C.amber:C.red;
    const docs=this.vfEquipDocs(), okN=docs.filter(d=>d.s==='ok').length;
    return h('div',{style:{background:'#fff',border:'1px solid '+C.blt,borderRadius:'14px',padding:'12px 13px',marginBottom:'12px',boxShadow:'0 2px 6px rgba(15,34,56,.05)'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'11px'}},
        h('div',{style:{width:'44px',height:'44px',borderRadius:'11px',background:'linear-gradient(135deg,#F2C94C,#E19A2E)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'21px',flexShrink:0}},'🏗️'),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:'12.5px',fontWeight:800,color:C.deep,fontFamily:'ui-monospace,monospace',direction:'ltr',textAlign:'start'}},ur.serial),
          h('div',{style:{fontSize:'10.5px',fontWeight:600,color:C.muted,marginTop:'2px'}},u.model+' · '+u.spec+' · '+ur.year)),
        h('button',{onClick:()=>this.askSwap(),title:'اطلب من المورد وحدة أخرى',
          style:{flexShrink:0,background:C.blueLt,border:'1px solid '+C.blueBd,color:C.blue,borderRadius:'9px',padding:'5px 10px',fontSize:'10.5px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},'استبدال')),
      h('div',{style:{marginTop:'11px'}},
        h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:'10px',fontWeight:700,marginBottom:'5px'}},
          h('span',{style:{color:C.muted}},'التوافق مع طلبك'),
          h('span',{style:{color:pc}},toAr(pct)+'٪')),
        h('div',{style:{height:'7px',borderRadius:'6px',background:'#E4EAF1',overflow:'hidden'}},
          h('div',{style:{height:'100%',width:pct+'%',background:pc,borderRadius:'6px'}}))),
      h('button',{onClick:()=>{this.activePanel='equip';this.eqTab='docs';this.up();},
        style:{width:'100%',marginTop:'11px',display:'flex',alignItems:'center',gap:'9px',background:C.s2,border:'1px solid '+C.blt,borderRadius:'11px',padding:'9px 11px',cursor:'pointer',fontFamily:'inherit'}},
        h('span',{style:{fontSize:'15px'}},'📄'),
        h('span',{style:{flex:1,textAlign:'start',fontSize:'11.5px',fontWeight:700,color:C.deep}},'مستندات المعدّة'),
        h('span',{style:{fontSize:'11px',fontWeight:800,color:okN===docs.length?C.green:C.amber}},AR(okN)+'/'+AR(docs.length)),
        okN===docs.length?h('span',{style:{fontSize:'9.5px',fontWeight:800,color:'#fff',background:C.green,borderRadius:'20px',padding:'2px 8px'}},'مكتمل ✓'):null,
        h('span',{style:{color:C.muted,fontSize:'13px'}},'‹')));
  }


  vfEquipDocs(){ const s=this.S.docs.find(x=>x.id==='safety'); const liveS=s.deferred?'deferred':({claimed:'declared',sent:'checking',verified:'ok'})[s.state];
    const liveMeta=s.deferred?'مؤجّل كشرط':(s.state==='verified'?'وثّقها المورّد عبر الوكيل':'إقرار ذاتي — بلا مستند'+(s.askedByMe?' · طُلب الإثبات':''));
    // PER MACHINE — these follow the unit selected on the map / in the unit switcher, because
    // equipment documents live on the equipment listing and are authored from the readiness card.
    const ur=this.curUnitRec();
    const certOk = ur ? !!ur.cert : (s.state==='verified');
    // Anything the supplier has supplied in response to a request reads as verified from here on.
    const got=(ur&&ur.gotDocs)||{};
    const applyGot=rows=>rows.map(r=>got[r.k]?Object.assign({},r,{s:'ok',meta:'أرسلها المورد الآن',exp:null,expSoon:false,live:null}):r);
    return applyGot([
      {k:'شهادة سلامة المعدّة',s:certOk?'ok':liveS,meta:certOk?(s.certType+' · على الملف'):(s.certType+' · '+liveMeta),live:certOk?null:'safety'},
      // Ownership papers are fully viewable by decision (spec §7.14) — no lock, a real download.
      {k:'إثبات الملكية / التسجيل',s:'ok',meta:'سند الملكية — موثّق'},
      {k:'الاستمارة (رخصة السير)',s:'ok',meta:'سارية'},
      {k:'تأمين المعدّة',s:'ok',exp:'تنتهي 30 يونيو 2026',expSoon:true},
      {k:'رخصة تشغيل المعدّة',s:'ok',meta:'موثّقة'},
      {k:'شهادة سلامة المشغّل',s:'deferred',meta:'تُستكمل قبل التسليم'},
      {k:'صور المعدّة الإلزامية',s:'ok',meta:'٤ صور — مرفوعة'},
    ]);
  }


  vfCompanyDocs(){ const s=this.curSup(); const got=(s&&s.gotDocs)||{};
    return [
    {k:'السجل التجاري',s:'ok',exp:'صالح حتى 12 مارس 2027'},
    {k:'الشهادة الضريبية (VAT)',s:'ok',exp:'يُجدَّد سنوياً · 2026'},
    {k:'البيانات البنكية (IBAN)',s:'ok',meta:'حساب التحويلات — موثّق'},
    {k:'العنوان الوطني',s:'ok',meta:'موثّق'},
    {k:'المحتوى المحلي',s:'deferred',meta:'اختياري — مؤجّل باتفاق'},
  ].map(r=>got[r.k]?Object.assign({},r,{s:'ok',meta:'أرسلها المورد الآن',exp:null,expSoon:false}):r); }
