/* ── 09-supplier-and-misc.js ─────────────────────────────────────
 * Supplier modal, guided tour, top bar, and the selection accessors the rest reference.
 *
 * Verbatim from deal-room-rentee-map-v2.html. REFERENCE ONLY — prototype code uses
 * React.createElement, inline styles and fixture data. Read it for STRUCTURE,
 * GEOMETRY and ORDER; build with this repo's conventions. design.md is the distilled
 * version, this is the receipt.
 */

  rSupplierModal(){ return this.modalShell('المورد وسجلّه','الثقة والأداء عبر المنصة','⭐',this.pSupplier(),()=>this.closeSupplier(),'520px'); }


  rSupplierViewModal(){ const S=this.S;
    const banner=h('div',{style:{display:'flex',alignItems:'center',gap:'11px',background:'linear-gradient(135deg,#134E32,#16A34A)',color:'#fff',borderRadius:'14px',padding:'14px 16px',marginBottom:'16px'}},
      h('span',{style:{fontSize:'22px'}},'👁'),
      h('div',{},h('div',{style:{fontSize:'14px',fontWeight:800}},'أنت الآن: المورّد'),
        h('div',{style:{fontSize:'11px',opacity:.88,fontWeight:500,marginTop:'2px',lineHeight:1.6}},'هذه شاشة المورّد بنفس أدوات المستأجر — راجع عرضه وردّ بالسعر والشروط')));
    let body, foot;
    if(this.supView==='availability'){ const u=this.curUnit();
      body=h('div',{style:{padding:'20px 22px',maxWidth:'760px',margin:'0 auto',width:'100%'}},banner,
        h('div',{style:{border:'1px solid '+C.blt,borderRadius:'14px',padding:'16px'}},
          h('div',{style:{fontSize:'11px',fontWeight:700,color:C.muted,marginBottom:'11px'}},'📩 طلب وارد من المستأجر'),
          h('div',{style:{fontSize:'13.5px',fontWeight:700,color:C.navy,marginBottom:'6px'}},u.spec+' · '+AR(S.qty)+' وحدة · '+AR(S.days)+' يوم'),
          h('div',{style:{fontSize:'12px',color:C.navy,lineHeight:1.9}},'• تأكيد التوفّر والموقع ('+u.km+' كم إلى برج العليا)',h('br'),'• إثبات شهادة السلامة (TÜV)',h('br'),'• تنويه بفارق سنة الصنع (٢٠١٨ مقابل ٢٠٢٠+)')));
      foot=h('button',{onClick:()=>this.supConfirmFromView(),style:{width:'100%',maxWidth:'760px',margin:'0 auto',display:'block',background:C.green,color:'#fff',border:'none',borderRadius:'12px',padding:'14px',fontSize:'13px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},'✓ أكّد التوفّر ووثّق شهادة السلامة');
    } else { const my=this.myLastRound(), mp=my.pos, sd=this.supDraft;
      const th=(t,a)=>h('th',{style:{background:C.navy,color:'#fff',fontSize:'9.5px',fontWeight:700,padding:'10px',textAlign:a||'start',whiteSpace:'nowrap'}},t);
      const cs={padding:'11px 10px',borderBottom:'1px solid '+C.blt,fontSize:'12px',verticalAlign:'middle'};
      const supCell=(field,val,refVal)=>{ const changed=val!==refVal; return h('td',{style:Object.assign({textAlign:'center'},cs)},
        h('label',{style:{display:'inline-flex',alignItems:'center',gap:'4px',border:'1.5px solid '+(changed?C.amber:C.blue),borderRadius:'9px',background:changed?C.amberLt:C.blueLt,padding:'5px 8px',cursor:'text',boxShadow:'0 1px 3px rgba(37,99,235,.14)'}},
          h('span',{style:{fontSize:'11px',color:changed?C.amber:C.blue}},'✎'),
          h('input',{type:'number',value:val,onChange:e=>this.onSupDraft(field,e.target.value),style:{width:'56px',border:'none',background:'transparent',textAlign:'center',fontSize:'12.5px',fontWeight:800,outline:'none',color:C.navy,fontFamily:'inherit',padding:0}})),
        h('div',{style:{fontSize:'8.5px',fontWeight:700,marginTop:'4px',direction:'ltr'}}, changed?h('span',{style:{color:C.amber}},'المستأجر ',h('span',{style:{textDecoration:'line-through'}},fmtEN(refVal))):h('span',{style:{color:C.muted}},'المستأجر '+fmtEN(refVal)))); };
      const tripRow=(label,field,val,inc,refVal)=>h('tr',{style:{opacity:inc?1:.6,background:inc?'transparent':C.s2}},
        h('td',{style:cs},h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},h('button',{onClick:()=>this.supToggle(field),style:{width:'22px',height:'22px',borderRadius:'50%',border:'none',background:inc?C.redLt:C.greenLt,color:inc?C.red:C.green,fontSize:'12px',fontWeight:900,cursor:'pointer',flexShrink:0}},inc?'✕':'+'),h('span',{style:{fontWeight:700,color:C.navy,fontSize:'12px',textDecoration:inc?'none':'line-through'}},label))),
        h('td',{style:Object.assign({textAlign:'center',color:C.muted},cs)},'رحلة'),
        h('td',{style:Object.assign({textAlign:'center',color:C.navy},cs)},'١'),
        inc?supCell(field,val,refVal):h('td',{style:Object.assign({textAlign:'center',color:C.muted},cs)},'—'),
        h('td',{style:Object.assign({textAlign:'end',fontWeight:700,color:inc?C.navy:C.muted,fontFamily:'ui-monospace,monospace',direction:'ltr'},cs)},inc?fmtEN(val):'مستبعد'));
      const counteredTerms=S.terms.filter(t=>t.state==='countered');
      const acceptedTerms=S.terms.filter(t=>t.state==='agreed'&&!t.ack);
      const subtotal2=this.posTotal(sd), tax2=Math.round(subtotal2*0.15), net2=subtotal2+tax2;
      const taxRow=(k,v)=>h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0'}},
        h('span',{style:{fontSize:'11.5px',fontWeight:600,color:C.muted}},k),h('span',{style:{fontSize:'12.5px',fontWeight:700,color:C.navy,fontFamily:'ui-monospace,monospace',direction:'ltr'}},v));
      body=h('div',{style:{padding:'20px 22px',maxWidth:'860px',margin:'0 auto',width:'100%'}},banner,
        h('div',{style:{display:'flex',alignItems:'center',gap:'12px',background:'linear-gradient(135deg,'+C.navy+','+C.deep+')',color:'#fff',borderRadius:'14px',padding:'14px 16px',marginBottom:'14px'}},
          h('div',{style:{flex:1,textAlign:'center'}},h('div',{style:{fontSize:'9px',opacity:.7,fontWeight:700}},'عرض المستأجر'),h('div',{style:{fontSize:'19px',fontWeight:800,fontFamily:'ui-monospace,monospace',direction:'ltr'}},fmtEN(this.posTotal(mp)))),
          h('div',{style:{fontSize:'18px',opacity:.6}},'⇄'),
          h('div',{style:{flex:1,textAlign:'center'}},h('div',{style:{fontSize:'9px',opacity:.7,fontWeight:700}},'ردّك'),h('div',{style:{fontSize:'19px',fontWeight:800,color:'#8FD0FF',fontFamily:'ui-monospace,monospace',direction:'ltr'}},fmtEN(this.posTotal(sd))))),
        this.rRoundsLog(),
        h('div',{style:{display:'flex',alignItems:'center',gap:'9px',background:C.blueLt,border:'1px solid '+C.blueBd,borderRadius:'12px',padding:'11px 13px',marginBottom:'12px'}},
          h('span',{style:{fontSize:'16px'}},'💬'),
          h('div',{style:{fontSize:'11.5px',fontWeight:700,color:C.navy,lineHeight:1.7}},'القيم المعروضة هي ',h('b',{style:{color:C.blue}},'عرض المستأجر'),' — عدّل أي سعر لإرسال ',h('b',{style:{color:C.blue}},'ردّك'),' له')),
        h('table',{style:{width:'100%',borderCollapse:'collapse',marginBottom:'12px',border:'1px solid '+C.blt,borderRadius:'12px',overflow:'hidden'}},
          h('thead',{},h('tr',{},th('البند'),th('الوحدة','center'),th('العدد','center'),th('✎ سعرك · قابل للتعديل','center'),th('الإجمالي','end'))),
          h('tbody',{},
            h('tr',{},
              h('td',{style:cs},h('div',{style:{fontWeight:700,color:C.navy,fontSize:'12px'}},'الإيجار الأساسي'),h('div',{style:{fontSize:'9px',color:C.muted,marginTop:'2px'}},'حسب مواصفات الطلب')),
              h('td',{style:Object.assign({textAlign:'center',color:C.muted},cs)},FREQ_UNIT[this.cfg.frequency]),
              h('td',{style:Object.assign({textAlign:'center',fontWeight:700,color:C.navy},cs)},this.cfg.mode==='open'?'∞':AR(this.cfg.duration)),
              supCell('rate',sd.rate,mp.rate),
              h('td',{style:Object.assign({textAlign:'end',fontWeight:700,color:C.navy,fontFamily:'ui-monospace,monospace',direction:'ltr'},cs)},fmtEN(this.rateLineTotal(sd.rate)))),
            tripRow('التعبئة / التوصيل','mob',sd.mob,sd.incMob,mp.mob),
            tripRow('الإرجاع / الإعادة','demob',sd.demob,sd.incDemob,mp.demob))),
        h('div',{style:{background:C.s2,borderRadius:'12px',padding:'12px 16px',marginBottom:'16px'}},
          taxRow('قبل الضريبة',fmtEN(subtotal2)),
          taxRow('ضريبة ١٥٪',fmtEN(tax2)),
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:'9px',marginTop:'6px',borderTop:'1px solid '+C.border}},
            h('span',{style:{fontSize:'14px',fontWeight:800,color:C.deep}},'إجمالي ردّك'),
            h('span',{style:{fontSize:'16px',fontWeight:800,color:C.blue,fontFamily:'ui-monospace,monospace',direction:'ltr'}},fmtEN(net2)+' ر.س'))),
        counteredTerms.length? h('div',{},
          h('div',{style:{fontSize:'11px',fontWeight:800,color:C.blue,margin:'4px 0 8px'}},'📋 اقتراحات المستأجر على الشروط — قرارك'),
          counteredTerms.map(t=>this.supTermCard(t))) : null,
        acceptedTerms.length? h('div',{style:{marginTop:'12px',paddingTop:'12px',borderTop:'1px dashed '+C.border}},
          h('div',{style:{fontSize:'11px',fontWeight:700,color:C.muted,marginBottom:'8px'}},'✓ شروط قبلها المستأجر كما عرضتَها'),
          acceptedTerms.map(t=>h('div',{key:t.id,style:{display:'flex',justifyContent:'space-between',gap:'10px',padding:'8px 0',fontSize:'12px'}},h('span',{style:{color:C.navy,fontWeight:700}},t.name),h('span',{style:{color:C.green,fontWeight:700}},t.agreedVal)))) : null);
      foot=h('div',{style:{display:'flex',gap:'12px',maxWidth:'860px',margin:'0 auto'}},
        h('button',{onClick:()=>this.supAcceptFromView(),style:{flex:1,background:'#fff',color:C.green,border:'1.5px solid '+C.greenBd,borderRadius:'12px',padding:'14px',fontSize:'13px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'✓ اقبل عرض المستأجر كما هو'),
        h('button',{onClick:()=>this.supSendCounterFromView(),style:{flex:1,background:C.blue,color:'#fff',border:'none',borderRadius:'12px',padding:'14px',fontSize:'13px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'أرسل ردّ المورّد للمستأجر ←'));
    }
    return h('div',{style:{position:'fixed',inset:0,zIndex:160,display:'flex',flexDirection:'column',background:'#F8FAFC'}},
      h('div',{style:{flexShrink:0,height:'58px',padding:'0 22px',background:'#0F2238',display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{style:{display:'flex',alignItems:'center',gap:'10px'}},h('div',{style:{width:'32px',height:'32px',borderRadius:'9px',background:'rgba(255,255,255,.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px'}},'🏭'),h('div',{style:{color:'#fff',fontSize:'14px',fontWeight:700}},'شاشة المورّد — محاكاة الطرف الآخر')),
        h('button',{onClick:()=>this.closeSupplierView(),style:{display:'flex',alignItems:'center',gap:'7px',background:'rgba(255,255,255,.12)',color:'#fff',border:'1px solid rgba(255,255,255,.2)',borderRadius:'10px',padding:'8px 14px',fontSize:'12px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},'✕ عودة لشاشة المستأجر')),
      h('div',{style:{flex:1,overflowY:'auto',minHeight:0}},body),
      h('div',{style:{flexShrink:0,padding:'14px 22px',background:'#fff',borderTop:'1px solid '+C.blt}},foot));
  }


  rTour(){ const step=TOUR[this.tourStep]||TOUR[0]; if(!step) return null;
    let r=null; try{ const el=document.getElementById(step.id); if(el) r=el.getBoundingClientRect(); }catch(e){}
    const pad=8;
    const spot = r? h('div',{style:{position:'fixed',top:(r.top-pad)+'px',left:(r.left-pad)+'px',width:(r.width+pad*2)+'px',height:(r.height+pad*2)+'px',
      borderRadius:'18px',boxShadow:'0 0 0 9999px rgba(9,20,34,.62)',border:'2px solid '+C.blue,pointerEvents:'none',transition:'.2s'}}) : null;
    const top = r? Math.min(window.innerHeight-190, r.bottom+14) : 120;
    const left = r? Math.max(18, Math.min(window.innerWidth-380, r.left)) : 60;
    return h('div',{style:{position:'fixed',inset:0,zIndex:200}},
      r?null:h('div',{style:{position:'absolute',inset:0,background:'rgba(9,20,34,.62)'}}),
      spot,
      h('div',{style:{position:'fixed',top:top+'px',left:left+'px',width:'344px',background:'#fff',borderRadius:'16px',padding:'16px',boxShadow:'0 22px 54px rgba(9,20,34,.4)',animation:'dpFade .2s'}},
        h('div',{style:{fontSize:'10px',fontWeight:700,color:C.muted,marginBottom:'6px'}},AR(this.tourStep+1)+' من '+AR(TOUR.length)),
        h('div',{style:{fontSize:'14.5px',fontWeight:700,color:C.deep,marginBottom:'6px'}},step.t),
        h('div',{style:{fontSize:'12px',fontWeight:500,color:C.navy,lineHeight:1.75,textWrap:'pretty'}},step.x),
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px',marginTop:'14px'}},
          h('button',{onClick:()=>this.finishTour(),style:{background:'none',border:0,color:C.muted,fontSize:'11.5px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}},'تخطّي'),
          h('div',{style:{flex:1}}),
          this.tourStep>0?h('button',{onClick:()=>this.tourPrev(),style:{background:C.surface,border:'1px solid '+C.border,color:C.navy,borderRadius:'10px',padding:'8px 13px',fontSize:'11.5px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},'السابق'):null,
          h('button',{onClick:()=>this.tourNext(),style:{background:C.blue,border:0,color:'#fff',borderRadius:'10px',padding:'9px 16px',fontSize:'12px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},
            this.tourStep>=TOUR.length-1?'ابدأ':'التالي'))));
  }


  rRequest(){ const S=this.S, u=this.curUnit(), ph=this.phaseChip();
    return h('button',{onClick:()=>{this.activePanel='equip';this.up();},title:'تفاصيل المعدّة',style:{display:'flex',alignItems:'center',gap:'12px',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',padding:'4px 6px',borderRadius:'10px'},onMouseEnter:e=>e.currentTarget.style.background=C.s2,onMouseLeave:e=>e.currentTarget.style.background='none'},
      h('div',{style:{width:'34px',height:'34px',borderRadius:'9px',background:C.amberLt,border:'1px solid '+C.amberBd,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'17px'}},'🏗️'),
      h('div',{},
        h('div',{style:{fontSize:'13px',fontWeight:700,color:C.deep,display:'flex',alignItems:'center',gap:'8px'}},
          h('span',{style:{fontSize:'9.5px',fontWeight:700,color:C.blue,background:C.blueLt,border:'1px solid '+C.blueBd,borderRadius:'6px',padding:'2px 6px',fontFamily:'ui-monospace,monospace',direction:'ltr'}}, this.reqLabel()),
          h('span',{}, this.itemsMode==='multi' ? (u.spec+' +'+AR(MULTI_ITEMS.length-1)+' بنود أخرى') : (u.spec+' · '+AR(S.qty)+' وحدة'+(S.operator?' · مع عامل':'')))),
        h('div',{style:{fontSize:'11px',color:C.muted,fontWeight:500}}, this.itemsMode==='multi' ? (AR(MULTI_ITEMS.length)+' معدات · '+AR(S.days)+' يوم · برج العليا، الرياض') : (AR(S.days)+' يوم · برج العليا، الرياض'))),
      h('span',{style:{fontSize:'11px',fontWeight:700,color:ph.c,background:ph.bg,border:'1px solid '+ph.c+'33',borderRadius:'20px',padding:'5px 12px'}}, ph.t));
  }


  phaseChip(){ const S=this.S;
    if(S.stage==='closed') return {c:C.green,bg:C.greenLt,t:'✓ معتمد'};
    if(this.allDone()) return {c:C.green,bg:C.greenLt,t:'✓ جاهز للاعتماد'};
    if(!S.availabilityAsked) return {c:C.blue,bg:C.blueLt,t:'غرفة جديدة'};
    if(!S.availabilityConfirmed) return {c:C.amber,bg:C.amberLt,t:'بانتظار تأكيد التوفّر'};
    if(this.fitGateOpen()) return {c:C.amber,bg:C.amberLt,t:'قيد المراجعة: الملاءمة'};
    if(this.trustOpenCount()>0) return {c:C.amber,bg:C.amberLt,t:'قيد التوثيق'};
    if(!S.price.agreed) return {c:C.blue,bg:C.blueLt,t:'قيد التفاوض: السعر'};
    return {c:C.blue,bg:C.blueLt,t:'قيد التفاوض: الشروط'};
  }


  curSup(){ return this.selSup==null?null:SUPPLIERS[this.selSup]; }


  curUnit(){ const u=FLEET[this.S.unitIdx||0], s=this.curSup();
    // the room is now scoped to a bidding supplier: its yard/distance own the map + panels
    const f=s?(inBidOf(s)[0]||fleetOf(s)[0]):null;
    return s? Object.assign({},u,{yard:(f?f.yard:s.city),km:toAr(f?f.km:s.km)}) : u; }


  curUnitRec(){ const s=this.curSup(); if(!s) return null; const us=unitsOf(s); return us[this.selUnit] || us[0] || null; }


  constructor(props){
    super(props);
    this.S = freshState();
    this.itemsMode='single'; this.activeItem=0; this.items=null; this.sharedTerms=null;
    this.cfg = {mode:'fixed',frequency:'daily',duration:14,valid:true};
    this.paySel = {schedule:'',method:''};
    this.cardFace='sup';
    this.qsStep='paper';
    this.activePanel='equip';
    this.verifTab='equip';
    this.quoteOpen=false;
    this.agreeOpen=false;
    this.supplierOpen=false;
    this.supViewOpen=false;
    this.supView=null;
    this.supDraft=null;
    this.drawerOpen=false;
    this.drawerMax=false;
    this.termAlt={};
    this.supTermDec={};
    this.tourOn=false;
    this.tourStep=0;
    this.tourRect=null;
    this._ms=-1;
    this.activePanel=null;
    this.entry='c';
    this.selSup=null; this._supStates={}; this.bidSort='price'   /* cheapest first, per spec */; this.hoverSup=null;
    // which IDENTIFIED unit of the selected bid the panels are scoped to (null = the bid's first unit).
    // Set by clicking a unit pin on the map; the equipment + documents panels follow it.
    this.selUnit=null;   // no machine chosen until the renter picks one
    this.chatItem=null; // which item's deal-room conversation the chat panel is showing
    this.toastMsg='';
    this._toastT=null;
    this.attOpen=false;
    this.view={scale:1,tx:0,ty:0};
    this.state={tick:0};
  }


  derivedState(c){
    if(c.scope==='company'){
      const docs=this.vfCompanyDocs();
      const have=(c.docTypes||[]).filter(n=>{ const d=docs.find(x=>x.k===n); return d&&d.s==='ok'; }).length;
      const need=(c.docTypes||[]).length;
      return have>=need&&need
        ? {txt:'اكتملت — المستندات متاحة',color:C.green,done:true}
        : {txt:'الحالة الآن: '+AR(have)+'/'+AR(need)+' مستندات متاحة',color:C.amber,done:false};
    }
    const f=this.unitByRef(c);
    if(!f) return {txt:'بانتظار رد المورد',color:C.muted,done:false};
    if(c.kind==='availability') return f.u.confirmed
      ? {txt:'اكتمل — أكّد المورد الساحة',color:C.green,done:true}
      : {txt:'الحالة الآن: مسجّلة · التوفّر غير مؤكّد',color:C.amber,done:false};
    if(c.kind==='document'){
      const docs=this.vfEquipDocs();
      const have=(c.docTypes||[]).filter(n=>{ const d=docs.find(x=>x.k===n); return d&&d.s==='ok'; }).length;
      const need=(c.docTypes||[]).length;
      return have>=need&&need
        ? {txt:'اكتملت — المستندات متاحة',color:C.green,done:true}
        : {txt:'الحالة الآن: '+AR(have)+'/'+AR(need)+' مستندات متاحة',color:C.amber,done:false};
    }
    return {txt:'بانتظار رد المورد',color:C.muted,done:false};
  }


  pSupplier(){ const perf=[['الالتزام بمواعيد التسليم',96],['اكتمال التوثيق',88],['سرعة الاستجابة',91]];
    return h('div',{style:{padding:'16px'}},
      this.card([
        h('div',{style:{display:'flex',alignItems:'center',gap:'11px',marginBottom:'12px'}},
          h('div',{style:{width:'50px',height:'50px',borderRadius:'50%',background:C.green,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'16px'}},'أخ'),
          h('div',{},h('div',{style:{fontSize:'15px',fontWeight:700,color:C.deep,display:'flex',gap:'5px',alignItems:'center'}},'أبراج الخليج للمعدات',h('span',{style:{color:C.green,fontSize:'12px'}},'✓ موثوق')),
            h('div',{style:{fontSize:'11px',color:C.muted,marginTop:'2px'}},'مورد معدات ثقيلة · الرياض · على المنصة منذ ٢٠٢١'))),
        h('div',{style:{display:'flex',gap:'8px'}},
          [['١٢','صفقة'],['٩٦٪','التزام'],['★ ٤٫٨','تقييم']].map((s,i)=>h('div',{key:i,style:{flex:1,background:C.s2,borderRadius:'12px',padding:'10px 6px',textAlign:'center'}},
            h('div',{style:{fontSize:'14px',fontWeight:700,color:C.deep}},s[0]),h('div',{style:{fontSize:'9px',color:C.muted,fontWeight:600,marginTop:'2px'}},s[1])))),
      ]),
      h('div',{style:{background:C.blueLt,border:'1px solid '+C.blueBd,borderRadius:'12px',padding:'11px 13px',fontSize:'12px',fontWeight:600,color:C.navy,marginBottom:'12px',lineHeight:1.6}},'تعاملكم السابق: ',h('b',{style:{color:C.blue}},'صفقتان مكتملتان'),' مع شركتك — آخرها مضخة خرسانة، مارس ٢٠٢٦ ✓'),
      this.card([ this.h4('الأداء عبر المنصة'),
        perf.map((p,i)=>h('div',{key:i,style:{marginBottom:'10px'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:'11px',fontWeight:600,color:C.navy,marginBottom:'4px'}},h('span',{},p[0]),h('span',{},AR(p[1])+'٪')),
          h('div',{style:{height:'6px',borderRadius:'3px',background:C.blt,overflow:'hidden'}},h('div',{style:{height:'100%',width:p[1]+'%',background:C.green,borderRadius:'3px'}})))) ]),
      this.card([ this.h4('الأسطول'),
        h('div',{style:{fontSize:'12.5px',fontWeight:700,color:C.navy}},'٣٤ وحدة مسجّلة'),
        h('div',{style:{fontSize:'11px',color:C.muted,marginTop:'3px',lineHeight:1.6}},'رافعات شوكية · مضخات · معدات حفر — منها وحدتان مطابقتان لطلبك') ]));
  }


  supRoundIcon(s,mode,compact,dim){ const F="font-family:'IBM Plex Sans Arabic',sans-serif", band={c:this.supAvail(s)};
    const strong=(mode==='selected'||mode==='confirmed');
    // No dimming: every supplier stays fully legible even while one bid is expanded.
    const D='';
    const ring = mode==='confirmed'?C.green : mode==='selected'?C.blue : band.c;
    const size = strong?52:compact?38:44;
    // DENSE / ZOOMED-OUT: no label at all, so nothing can float free of its pin. Supplier initials
    // inside the disc; the name arrives on hover and on zoom-in. This is the guard against the
    // overlapping-label mush that appeared at city zoom.
    if(compact&&!strong) return L.divIcon({className:'',iconSize:[size+8,size+8],iconAnchor:[(size+8)/2,(size+8)/2],html:
      '<div style="'+F+D+';width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+C.navy+';border:3px solid '+ring+';box-shadow:0 4px 11px rgba(15,34,56,.26);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800;cursor:pointer;position:relative">'+s.initials.slice(0,2)
      +'</div>' });
    // Offered-unit badge + the identified/unidentified split. A bid selling 4 units off 2 registered
    // machines must never read as "4 machines here" — the badge is the COUNT, the sub-line is the truth.
    const off=shownUnitsOf(s,this.approvedUnitsFor(s)), idn=identifiedOf(s), gh=claimedOf(s), sites=siteCountOf(s);
    const rg=kmRangeOf(s), kmTxt = rg[0]===rg[1] ? toAr(rg[0])+' كم' : toAr(rg[0])+'–'+toAr(rg[1])+' كم';
    // Badge is simply HOW MANY UNITS ARE OFFERED. The registered-vs-claimed split is explained in a
    // box beside the supplier once selected — a coloured ratio on the pin read as a score, not a count.
    const countBadge = off>1
      ? '<span style="position:absolute;top:-5px;inset-inline-end:-5px;min-width:20px;height:19px;padding:0 5px;border-radius:10px;background:'+C.deep+';color:#fff;font-size:9.5px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff">'+AR(off)+'</span>'
      : '';
    // Yard state only. NO readiness pip on the map — document readiness belongs in the panel, not here.
    const us=unitsOf(s);
    const allConf = us.length>0 && us.every(u=>u.confirmed);
    const pips = '';
    const splitLine = '';
    // The circle carries the SUPPLIER, not the equipment: the renter already knows what machine they
    // asked for — what they are comparing is who is offering it. Initials in the disc, name on the chip.
    const shortName = s.name.length>18 ? s.name.slice(0,17)+'…' : s.name;
    return L.divIcon({className:'',iconSize:[168,size+52],iconAnchor:[84,size+52],html:
      '<div style="'+F+D+';width:168px;display:flex;flex-direction:column;align-items:center;cursor:pointer">'
      +'<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+(s.verified?C.navyDeepFallback||C.deep:C.navy)+';border:3px solid '+ring+';box-shadow:0 5px 14px rgba(15,34,56,.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:'+(strong?15:13.5)+'px;font-weight:800;position:relative">'+s.initials.slice(0,2)
        +countBadge+pips+'</div>'
      +'<div style="margin-top:6px;background:#fff;border:1px solid '+(strong?ring:C.border)+';border-radius:9px;padding:3px 9px;box-shadow:0 3px 10px rgba(15,34,56,.2);white-space:nowrap;text-align:center">'
        +'<div style="font-size:10px;font-weight:800;color:'+C.deep+'">'+shortName+(s.verified?' <span style="color:'+C.green+'">✓</span>':'')+'</div>'
        +'<div style="font-size:9px;font-weight:700;color:'+C.muted+';margin-top:1px">'+AR(s.rate)+' ر.س · '+kmTxt+'</div></div>'
      +splitLine+'</div>' });
  }


  simulateResponse(c){
    const f=this.unitByRef(c);
    let txt='', res='provided';
    if(c.scope==='company'){
      const s=this.curSup(); if(s){ s.gotDocs=s.gotDocs||{}; (c.docTypes||[]).forEach(n=>{ s.gotDocs[n]=true; }); }
      txt='أرفقنا مستندات الشركة المطلوبة.';
    } else if(!f){
      txt='وصلنا طلبك، سنرد قريباً.'; res='pending';
    } else if(c.kind==='availability'){
      // The supplier confirms the yard from the readiness card — he never touches the request.
      // This is exactly why a stored status would go stale (§7.13.5).
      f.u.confirmed=true;
      txt='أكّدنا ساحة المعدّة — متوفّرة كما هي في العرض.';
    } else if(c.kind==='document'){
      f.u.gotDocs=f.u.gotDocs||{}; (c.docTypes||[]).forEach(n=>{ f.u.gotDocs[n]=true; });
      if((c.docTypes||[]).indexOf('شهادة سلامة المعدّة')>=0) f.u.cert=true;
      txt='أرفقنا المستندات المطلوبة لهذه المعدّة.';
    } else if(c.kind==='alternative'){
      // A refusal changes NO state — the only thing that can carry it is the echoed resolution.
      res='declined'; txt='لا تتوفّر لدينا وحدة بديلة مطابقة حالياً.';
    }
    this.S.chips.push({who:'sup',kind:'reply',reply:{inReplyTo:c.ref,equipmentId:c.equipmentId,
      resolution:res,scope:c.scope,serial:c.serial,kind:c.kind,text:txt}});
    const chatVisible=this.drawerOpen&&this.activePanel==='chat';
    const sup=this.curSup();
    this.logArrival({kind:res==='declined'?'refusal':'reply',supIdx:this.selSup,
      supName:sup?sup.name:'المورد',ref:c.ref,serial:c.serial,txt:txt,read:chatVisible});
    if(chatVisible){ this.S.newInChat=false; }
    else { this.unread=(this.unread||0)+1; this.notify(txt,c,res); }
    if(this.map) this.updateLeaflet(true);
    this.up();
  }
