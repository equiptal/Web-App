/* ── 07-off-platform.js ──────────────────────────────────────────
 * Off-platform submission surfaces. All of this already exists in the app — host it, do not rebuild.
 *
 * Verbatim from deal-room-rentee-map-v2.html. REFERENCE ONLY — prototype code uses
 * React.createElement, inline styles and fixture data. Read it for STRUCTURE,
 * GEOMETRY and ORDER; build with this repo's conventions. design.md is the distilled
 * version, this is the receipt.
 */

  pOffEquip(){ const s=this.curSup(), sub=this.offSub(); if(!sub) return null;
    const it=sub.items[0];
    const docRow=(d,i)=>h('div',{key:i,style:{display:'flex',alignItems:'center',gap:'9px',padding:'8px 10px',border:'1px solid '+C.blt,background:'#fff',borderRadius:'11px',marginBottom:'6px'}},
      h('span',{style:{width:'26px',height:'26px',borderRadius:'8px',flexShrink:0,background:'#EDF2F7',border:'1px solid '+C.blt,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px'}},'📄'),
      h('span',{style:{flex:1,minWidth:0,fontSize:'11.5px',fontWeight:700,color:C.navy}},d.k),
      h('span',{style:{fontSize:'9px',fontWeight:800,color:C.green,flexShrink:0}},'✓ مُرفق'),
      h('button',{onClick:()=>this.toast('تحميل المستند (نموذج)'),style:{width:'28px',height:'28px',borderRadius:'8px',border:'1px solid '+C.blueBd,background:C.blueLt,color:C.blue,cursor:'pointer',fontSize:'13px',fontFamily:'inherit',flexShrink:0}},'⤓'));
    const ORANGE='#D97A0A';
    const chip=(c)=>h('span',{key:c,style:{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'10px',fontWeight:800,color:C.green,background:C.greenLt,border:'1px solid '+C.greenBd,borderRadius:'20px',padding:'4px 10px'}},'✓ '+c);
    /* A tile whose value is null renders an em-dash rather than being dropped. Hiding an unknown field
       makes the payload look complete; showing it as unknown is the honest presentation and is exactly
       what the live modal does for distance and fuel type. */
    const tile=(label,val,accent)=>h('div',{key:label,style:{background:accent?C.amberLt:C.s2,border:'1px solid '+(accent?C.amberBd:C.blt),borderRadius:'12px',padding:'10px 12px'}},
      h('div',{style:{fontSize:'8.5px',fontWeight:800,color:C.muted,letterSpacing:'.4px'}},label),
      h('div',{style:{fontSize:val?'12.5px':'15px',fontWeight:800,color:val?(accent?ORANGE:C.deep):C.border,marginTop:'4px',lineHeight:1.5}},val||'—'));
    return h('div',{style:{padding:'16px'}},
      // certificates the supplier acknowledged, as a strip
      h('div',{style:{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'10px'}},(it.certs||[]).map(chip)),
      // the equipment, named
      h('div',{style:{fontSize:'15.5px',fontWeight:900,color:C.deep,lineHeight:1.6,marginBottom:'11px'}},
        it.label+' · '+it.reqMeasurement),
      // supplier-provided, unverified — the single most important caveat on this screen
      h('div',{style:{background:C.amberLt,border:'1px solid '+C.amberBd,borderRadius:'14px',padding:'12px 13px',marginBottom:'11px'}},
        h('div',{style:{display:'flex',alignItems:'flex-start',gap:'9px'}},
          h('span',{style:{width:'22px',height:'22px',borderRadius:'50%',flexShrink:0,background:ORANGE,color:'#fff',fontSize:'12px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}},'i'),
          h('div',{style:{minWidth:0}},
            h('div',{style:{fontSize:'11.5px',fontWeight:900,color:'#8a4f08'}},'بيانات من المورد'),
            h('div',{style:{fontSize:'10px',fontWeight:600,color:'#8a4f08',lineHeight:1.85,marginTop:'3px'}},
              'أقرّ بها المورد في نموذج الرابط فقط — لم تُوثَّق. راجع العرض المُقدَّم كاملاً قبل الاعتماد عليها.'))),
        h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',marginTop:'10px',paddingTop:'9px',borderTop:'1px solid '+C.amberBd}},
          h('span',{style:{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'10.5px',fontWeight:800,color:ORANGE}},'🗓','الكمية المتاحة'),
          h('span',{style:{fontSize:'12px',fontWeight:900,color:C.deep}},this.unitsWord(it.offeredUnits)))),
      // spec grid — unknown fields show as em-dashes, not omitted
      h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'11px'}},
        tile('المسافة',null),
        tile('القياس · كما طلبتَه',it.reqMeasurement),
        tile('الكمية المعروضة','×'+AR(it.offeredUnits)),
        tile('نوع الوقود',null),
        tile('سنة الصنع · كما طلبتَها','≥ '+AR(this.minYear())),
        tile('السعر',fmtEN(it.rentalRate)+' ر.س / يوم',true)),
      // what is on file
      h('div',{style:{fontSize:'9.5px',fontWeight:800,color:C.muted,letterSpacing:'.4px',marginBottom:'7px'}},'الشهادات والملكية على الملف'),
      h('div',{style:{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'12px'}},(it.certs||[]).map(chip)),
      // why this panel is thinner than a platform machine's
      h('div',{style:{display:'flex',alignItems:'flex-start',gap:'9px',background:C.s2,border:'1px dashed '+C.border,borderRadius:'12px',padding:'10px 12px',marginBottom:'10px'}},
        h('span',{style:{fontSize:'14px',flexShrink:0}},'ℹ️'),
        h('div',{style:{minWidth:0,fontSize:'9.5px',fontWeight:600,color:C.muted,lineHeight:1.8}},
          'لا يوجد رقم تسلسلي ولا ساحة ولا تقييم جاهزية — لأن المورد لم يربط معدّة مسجّلة بالعرض. خانتا «القياس» و«سنة الصنع» أعلاه هما ما طلبتَه أنت، لا ما أكّده هو؛ والمسافة ونوع الوقود غير متوفّرين أصلاً في النموذج.')),
      this.rOfferSummary(),
      this.card([ this.h4('صور المعدّة — كما أرفقها'),
        h('div',{style:{display:'flex',gap:'8px'}},
          [0,1,2,3].map(i=>h('div',{key:i,style:{flex:1,height:'56px',borderRadius:'10px',border:i<it.photos?('1px solid '+C.blt):('1.5px dashed '+C.border),background:i<it.photos?'#E8EEF5':C.s2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',color:C.muted}},i<it.photos?'📷':'—'))) ]),
      this.card([ this.h4('مستندات المعدّة — كما أرفقها'), it.documents.map(docRow) ]),
      this.card([ this.h4('مستندات الشركة'), sub.companyDocuments.map(docRow) ]),
      h('button',{onClick:()=>{ this.subOpen=true; this.up(); },
        style:{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',background:C.deep,border:0,color:'#fff',borderRadius:'12px',padding:'12px',fontSize:'12.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},
        '👁 عرض العرض المُقدَّم'));
  }


  pSubmission(){ const s=this.curSup(); const sub=this.offSub(); if(!sub) return null;
    const row=(k,v)=>h('div',{key:k,style:{display:'flex',justifyContent:'space-between',gap:'10px',padding:'6px 0',borderBottom:'1px dashed '+C.blt}},
      h('span',{style:{fontSize:'10px',fontWeight:700,color:C.muted}},k),
      h('span',{style:{fontSize:'11px',fontWeight:800,color:C.deep,textAlign:'end'}},
        Array.isArray(v)?v:[v]));   // never concatenate an element with a string — it stringifies
    const money=(n)=>h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr'}},fmtEN(n));
    const docRow=(d,i)=>h('div',{key:i,style:{display:'flex',alignItems:'center',gap:'9px',padding:'8px 10px',border:'1px solid '+C.greenBd,background:'#fff',borderRadius:'11px',marginBottom:'6px'}},
      h('span',{style:{width:'26px',height:'26px',borderRadius:'8px',flexShrink:0,background:'#EDF2F7',border:'1px solid '+C.blt,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px'}},'📄'),
      h('span',{style:{flex:1,minWidth:0,fontSize:'11.5px',fontWeight:700,color:C.navy}},d.k),
      h('button',{onClick:()=>this.toast('تحميل المستند (نموذج)'),style:{width:'28px',height:'28px',borderRadius:'8px',border:'1px solid '+C.blueBd,background:C.blueLt,color:C.blue,cursor:'pointer',fontSize:'13px',fontFamily:'inherit',flexShrink:0}},'⤓'));
    const it=sub.items[0];
    return h('div',{style:{padding:'16px'}},
      // 0. what this is
      h('div',{style:{display:'flex',alignItems:'center',gap:'9px',background:C.amberLt,border:'1px solid '+C.amberBd,borderRadius:'12px',padding:'10px 12px',marginBottom:'12px'}},
        h('span',{style:{fontSize:'17px'}},'🧾'),
        h('div',{style:{minWidth:0}},
          h('div',{style:{fontSize:'11.5px',fontWeight:800,color:'#8a4f08'}},'عرض من خارج المنصّة'),
          h('div',{style:{fontSize:'9.5px',fontWeight:600,color:C.muted,lineHeight:1.7,marginTop:'2px'}},'أرسله المورد عبر رابط الطلب بدون حساب — لا معدّة مسجّلة ولا موقع، والتفاوض يبدأ بعد تحويله إلى عرض على المنصّة.'))),
      // 1. company
      this.card([ this.h4('بيانات الشركة'),
        row('الشركة',s.name), row('المدينة',s.city), row('السجل التجاري',sub.crNumber),
        row('الرقم الضريبي',sub.vatNumber), row('العنوان الوطني',sub.nationalAddress),
        row('للتواصل',sub.contactInfo), row('رقم العرض',sub.quotationRef),
        row('أُرسل',sub.createdAt), row('صالح حتى',sub.validUntil) ]),
      // 2. items + pricing
      this.card([ this.h4('العرض والسعر'),
        row('المعدّة',it.label),
        row('الوحدات المعروضة',AR(it.offeredUnits)+' من '+AR(it.numberOfUnits)+' مطلوبة'),
        row('الإيجار (قبل الضريبة)',[money(it.rentalRate),' ر.س']),
        row('التعبئة والنقل',[money(it.deliveryPrice),' ر.س']),
        row('الإرجاع',[money(it.returnPrice),' ر.س']),
        h('div',{style:{display:'flex',justifyContent:'space-between',gap:'10px',paddingTop:'9px',marginTop:'3px',borderTop:'1.5px solid '+C.blt}},
          h('span',{style:{fontSize:'11px',fontWeight:800,color:C.deep}},'الإجمالي · شامل الضريبة ١٥٪'),
          h('span',{style:{fontSize:'14px',fontWeight:900,color:C.blue}},money(it.total),' ر.س')) ]),
      // The offer's composition — for an off-platform bid this is the one place it appears, since
      // there is no machine panel to host it.
      this.rOfferSummary(),
      // 3. photos
      this.card([ this.h4('صور المعدّة — كما أرسلها'),
        h('div',{style:{display:'flex',gap:'8px'}},
          [0,1,2,3].map(i=>h('div',{key:i,style:{flex:1,height:'54px',borderRadius:'10px',border:i<it.photos?('1px solid '+C.blt):('1.5px dashed '+C.border),background:i<it.photos?'#E8EEF5':C.s2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'17px',color:C.muted}},i<it.photos?'📷':'—'))) ]),
      // 4. equipment documents
      this.card([ this.h4('مستندات المعدّة — كما أرسلها'), it.documents.map(docRow) ]),
      // 5. company documents
      this.card([ this.h4('مستندات الشركة'), sub.companyDocuments.map(docRow) ]),
      // 6. terms — renter asked vs supplier answered
      this.card([ this.h4('الشروط — ما طلبته مقابل ما أكّده'),
        it.terms.map((tm,i)=>h('div',{key:i,style:{display:'flex',alignItems:'center',gap:'8px',padding:'7px 9px',borderRadius:'10px',marginBottom:'6px',background:tm[3]?C.greenLt:C.redLt,border:'1px solid '+(tm[3]?C.greenBd:C.redBd)}},
          h('span',{style:{width:'17px',height:'17px',borderRadius:'50%',flexShrink:0,background:tm[3]?C.green:C.red,color:'#fff',fontSize:'9px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}},tm[3]?'✓':'✕'),
          h('span',{style:{flex:1,minWidth:0,fontSize:'10.5px',fontWeight:700,color:C.deep}},tm[0]),
          h('span',{style:{fontSize:'9.5px',fontWeight:700,color:C.muted}},'طلبت '+tm[1]),
          h('span',{style:{fontSize:'10px',fontWeight:800,color:tm[3]?C.green:C.red}},'· '+tm[2]))) ]),
      // 7. notes + messages
      this.card([ this.h4('ملاحظات المورد'),
        h('div',{style:{fontSize:'11px',fontWeight:600,color:C.navy,lineHeight:1.9}},sub.notes) ]),
      this.card([ this.h4('الرسائل'),
        sub.messages.map((m,i)=>h('div',{key:i,style:{background:C.s2,border:'1px solid '+C.blt,borderRadius:'11px',padding:'9px 11px',fontSize:'11px',fontWeight:600,color:C.navy,lineHeight:1.8,marginBottom:'6px'}},m.txt)),
        h('button',{onClick:()=>this.toast('فتح مراسلة المورد (نموذج)'),
          style:{width:'100%',marginTop:'4px',background:C.blue,border:0,color:'#fff',borderRadius:'11px',padding:'10px',fontSize:'11.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'راسل المورد') ]));
  }


  rOffPriceBar(){ const s=this.curSup(), sub=s.submission, it=sub.items[0];
    return h('div',{style:{position:'relative',display:'flex',alignItems:'center',justifyContent:'center',minHeight:'124px',padding:'12px 20px'}},
      h('span',{style:{position:'absolute',top:'12px',right:'16px',display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'11px',fontWeight:700,padding:'4px 11px',borderRadius:'999px',background:'rgba(212,120,10,.16)',border:'1px solid rgba(212,120,10,.42)',color:'#F3C77A'}},
        h('span',{style:{width:'7px',height:'7px',borderRadius:'50%',background:'currentColor'}}),'من خارج المنصّة'),
      h('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',textAlign:'center'}},
        h('div',{style:{fontSize:'11px',fontWeight:600,color:'rgba(255,255,255,.7)'}},'الإيجار قبل الضريبة · '+AR(it.offeredUnits)+' وحدة'),
        h('div',{style:{display:'flex',alignItems:'baseline',gap:'8px'}},
          h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr',fontSize:'40px',fontWeight:700,letterSpacing:'-1.4px',lineHeight:1,color:'#fff'}},fmtEN(it.rentalRate)),
          h('span',{style:{fontSize:'14px',fontWeight:600,color:'rgba(255,255,255,.68)'}},'ر.س / يوم')),
        h('div',{style:{fontSize:'11px',fontWeight:700,color:'#8FD0FF',marginTop:'3px'}},
          'الإجمالي شامل الضريبة ',h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr'}},fmtEN(it.total)),' ر.س'),
        // AC-222: read the signal, never infer it.
        this.hasVatTag(sub.notes)
          ? h('div',{style:{display:'inline-flex',alignItems:'center',gap:'6px',marginTop:'6px',background:'rgba(212,120,10,.18)',border:'1px solid rgba(212,120,10,.45)',borderRadius:'20px',padding:'3px 10px'}},
              h('span',{style:{fontSize:'10px'}},'ℹ️'),
              h('span',{style:{fontSize:'10px',fontWeight:800,color:'#F3C77A'}},'سعّر المورد شاملاً الضريبة — والمبلغ أعلاه محسوب بعد استخراجها'))
          : null,
        h('button',{onClick:()=>{ this.obdOpen=!this.obdOpen; this.up(); },
          style:{marginTop:'5px',background:'none',border:0,color:'#8FD0FF',fontFamily:'inherit',fontSize:'11px',fontWeight:700,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'3px'}},
          'التفاصيل',h('span',{style:{display:'inline-block',transition:'.2s',transform:this.obdOpen?'rotate(180deg)':'none'}},'⌄'))),
      h('div',{style:{position:'absolute',left:'20px',top:'50%',transform:'translateY(-50%)'}},
        h('button',{onClick:()=>{ this.subOpen=true; this.up(); },style:{display:'inline-flex',alignItems:'center',gap:'7px',border:0,borderRadius:'12px',padding:'11px 18px',fontFamily:'inherit',fontWeight:700,fontSize:'13px',cursor:'pointer',color:'#fff',background:C.blue}},'🧾 عرض العرض المُقدَّم')),
      this.obdOpen?h('div',{onClick:()=>{ this.obdOpen=false; this.up(); },style:{position:'fixed',inset:0,zIndex:19}}):null,
      this.obdOpen?(()=>{ const b=this.offBreakdown();
        const brow=(l,v,tot)=>h('div',{key:l,style:{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:'12px',padding:tot?'10px 0 0':'6px 0',
          borderTop:tot?'1px solid rgba(255,255,255,.2)':'none',marginTop:tot?'4px':0}},
          h('span',{style:{fontSize:'13px',fontWeight:tot?700:600,color:tot?'#fff':'rgba(255,255,255,.82)'}},l),
          h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr',fontSize:tot?'17px':'15px',fontWeight:700,color:tot?'#8FD0FF':'#fff'}},fmtEN(v)));
        return h('div',{style:{position:'absolute',bottom:'calc(100% + 8px)',left:'50%',transform:'translateX(-50%)',zIndex:20,width:'min(430px,calc(100vw - 40px))',
          background:'#0F2238',border:'1px solid rgba(255,255,255,.2)',borderRadius:'16px',padding:'14px 18px',boxShadow:'0 20px 50px rgba(9,20,34,.5)',textAlign:'start'}},
          h('div',{style:{fontSize:'10px',fontWeight:800,color:'rgba(255,255,255,.6)',marginBottom:'8px'}},'كما أرسله المورد — لـ'+AR(b.n)+' وحدة'),
          brow('الإيجار (×'+AR(b.n)+')',b.rental),
          brow('التعبئة والنقل',b.mob),
          brow('الإرجاع',b.demob),
          brow('المجموع قبل الضريبة',b.sub),
          brow('ضريبة القيمة المضافة (١٥٪)',b.vat),
          brow('الإجمالي · شامل الضريبة',b.total,true));
      })():null);
  }


  rSubmissionModal(){ if(!this.subOpen) return null;
    const s=this.curSup(), sub=this.offSub(); if(!sub) return null;
    const it=sub.items[0], q=this.subQuality();
    const ORANGE='#D97A0A';
    const money=(n)=>h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr'}},fmtEN(n));
    const refCell=(k,v)=>h('div',{key:k,style:{flex:'1 1 0',minWidth:0,padding:'10px 12px',borderInlineStart:'1px solid '+C.blt}},
      h('div',{style:{fontSize:'8.5px',fontWeight:800,color:C.muted,letterSpacing:'.4px'}},k),
      h('div',{style:{fontSize:'11.5px',fontWeight:800,color:C.deep,marginTop:'3px',fontFamily:'ui-monospace,monospace',direction:'ltr',textAlign:'start'}},v));
    const termCard=(tm,i)=>{ const ok=tm[3];
      return h('div',{key:i,style:{display:'flex',alignItems:'center',gap:'9px',background:ok?C.greenLt:C.redLt,border:'1px solid '+(ok?C.greenBd:C.redBd),borderRadius:'12px',padding:'10px 11px'}},
        h('span',{style:{flex:1,minWidth:0,fontSize:'11.5px',fontWeight:800,color:C.deep,lineHeight:1.5}},tm[0]),
        h('div',{style:{textAlign:'center',flexShrink:0}},
          h('div',{style:{fontSize:'7.5px',fontWeight:800,color:C.muted,letterSpacing:'.3px',marginBottom:'3px'}},'اختيارك'),
          h('span',{style:{display:'inline-block',fontSize:'10px',fontWeight:800,color:C.blue,background:C.blueLt,border:'1px solid '+C.blueBd,borderRadius:'8px',padding:'4px 9px',whiteSpace:'nowrap'}},tm[1])),
        h('div',{style:{textAlign:'center',flexShrink:0}},
          h('div',{style:{fontSize:'7.5px',fontWeight:800,color:C.muted,letterSpacing:'.3px',marginBottom:'3px'}},'اختيار المورد'),
          h('span',{style:{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'10px',fontWeight:800,color:'#fff',background:ok?C.green:C.red,borderRadius:'8px',padding:'4px 9px',whiteSpace:'nowrap'}},ok?'✓':'✕',tm[2])));
    };
    const docRow=(d,i)=>h('div',{key:i,style:{display:'flex',alignItems:'center',gap:'9px',padding:'8px 10px',border:'1px solid '+C.blt,background:'#fff',borderRadius:'11px',marginBottom:'6px'}},
      h('span',{style:{width:'26px',height:'26px',borderRadius:'8px',flexShrink:0,background:'#EDF2F7',border:'1px solid '+C.blt,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px'}},'📄'),
      h('span',{style:{flex:1,minWidth:0,fontSize:'11.5px',fontWeight:700,color:C.navy}},d.k),
      h('span',{style:{fontSize:'9px',fontWeight:800,color:C.green}},'✓ مُرفق'),
      h('button',{onClick:()=>this.toast('تحميل المستند (نموذج)'),style:{width:'28px',height:'28px',borderRadius:'8px',border:'1px solid '+C.blueBd,background:C.blueLt,color:C.blue,cursor:'pointer',fontSize:'13px',fontFamily:'inherit',flexShrink:0}},'⤓'));
    const sect=(title,children)=>h('div',{style:{background:'#fff',border:'1px solid '+C.blt,borderRadius:'14px',padding:'13px 14px',marginBottom:'11px'}},
      h('div',{style:{fontSize:'9.5px',fontWeight:800,color:C.muted,letterSpacing:'.4px',marginBottom:'9px'}},title), children);
    const kv=(k,v)=>h('div',{key:k,style:{display:'flex',justifyContent:'space-between',gap:'10px',padding:'6px 0',borderBottom:'1px dashed '+C.blt}},
      h('span',{style:{fontSize:'10px',fontWeight:700,color:C.muted}},k),
      h('span',{style:{fontSize:'11px',fontWeight:800,color:v?C.deep:C.muted,textAlign:'end'}},Array.isArray(v)?v:[v||'— غير مُدخل']));

    return h('div',{style:{position:'fixed',inset:0,zIndex:220,background:'rgba(9,20,34,.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:'26px'}},
      h('div',{onClick:e=>e.stopPropagation(),style:{width:'min(760px,96vw)',maxHeight:'92vh',display:'flex',flexDirection:'column',background:C.s2,borderRadius:'20px',overflow:'hidden',boxShadow:'0 30px 70px rgba(9,20,34,.5)',animation:'dpModal .2s ease'}},
        // header
        h('div',{style:{flexShrink:0,background:C.deep,padding:'15px 18px',display:'flex',alignItems:'center',gap:'13px'}},
          h('div',{style:{width:'44px',height:'44px',borderRadius:'12px',flexShrink:0,background:ORANGE,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'19px'}},'🔗'),
          h('div',{style:{flex:1,minWidth:0}},
            h('div',{style:{fontSize:'16px',fontWeight:900,color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},s.name),
            h('div',{style:{fontSize:'10.5px',fontWeight:600,color:'rgba(255,255,255,.72)',marginTop:'2px'}},'من خارج المنصّة · أُرسل عبر رابط طلبك · للعرض فقط')),
          h('button',{onClick:()=>{this.subOpen=false;this.up();},title:'إغلاق',
            style:{width:'36px',height:'36px',borderRadius:'50%',flexShrink:0,border:'1.5px solid rgba(255,255,255,.28)',background:'rgba(255,255,255,.12)',color:'#fff',fontSize:'15px',fontWeight:900,cursor:'pointer',fontFamily:'inherit'}},'✕')),
        // "exactly what he filled in" banner
        h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:'8px',background:C.amberLt,borderBottom:'1px solid '+C.amberBd,padding:'10px 18px'}},
          h('span',{style:{fontSize:'13px'}},'👁'),
          h('span',{style:{fontSize:'11.5px',fontWeight:800,color:'#8a4f08'}},'العرض المُقدَّم — كما أدخله المورد في نموذجك بالضبط')),
        // body
        h('div',{style:{flex:1,overflowY:'auto',padding:'14px 18px'}},
          // quality
          h('div',{style:{background:'#fff',border:'1px solid '+C.blt,borderRadius:'14px',padding:'14px',marginBottom:'11px'}},
            h('div',{style:{display:'flex',alignItems:'center',gap:'14px'}},
              this.rSubDonut(q),
              h('div',{style:{minWidth:0}},
                h('div',{style:{fontSize:'13.5px',fontWeight:900,color:C.deep}},'جودة العرض'),
                h('div',{style:{fontSize:'10.5px',fontWeight:600,color:C.muted,lineHeight:1.7,marginTop:'3px'}},'مدى مطابقة هذا العرض لطلبك، ومدى اكتمال مستنداته وبيانات شركته.'))),
            h('div',{style:{display:'flex',gap:'16px',marginTop:'13px',paddingTop:'12px',borderTop:'1px solid '+C.blt}},
              this.rSubBar('مطابقة الشروط','⇄',q.terms,'٤٠',q.terms>=80?C.green:C.amber),
              this.rSubBar('مستندات المعدّة','✅',q.docs,'٣٠',q.docs>=80?C.green:C.amber),
              this.rSubBar('بيانات الشركة','🏢',q.company,'٣٠',q.company>=80?C.green:C.amber))),
          // refs
          h('div',{style:{display:'flex',background:'#fff',border:'1px solid '+C.blt,borderRadius:'14px',marginBottom:'11px',overflow:'hidden'}},
            [refCell('رقم العرض',sub.quotationRef),refCell('رقم الطلب',RFQ_ID),refCell('الطلب',REQ_ID),refCell('أُرسل',sub.createdAt)]),
          // item header
          h('div',{style:{display:'flex',alignItems:'center',gap:'11px',background:C.deep,borderRadius:'14px 14px 0 0',padding:'13px 15px'}},
            h('span',{style:{fontSize:'17px'}},'🏗️'),
            h('span',{style:{fontSize:'14px',fontWeight:900,color:'#fff'}},it.label),
            h('span',{style:{display:'inline-flex',alignItems:'center',gap:'5px',background:ORANGE,color:'#fff',borderRadius:'20px',padding:'4px 11px',fontSize:'11px',fontWeight:900}},'×'+AR(it.offeredUnits)+' وحدة'),
            h('div',{style:{flex:1}}),
            h('span',{style:{fontSize:'9.5px',fontWeight:800,color:'rgba(255,255,255,.85)',background:'rgba(255,255,255,.14)',borderRadius:'20px',padding:'4px 10px'}},'البند ١ من ١')),
          h('div',{style:{background:'#fff',border:'1px solid '+C.blt,borderTop:'none',borderRadius:'0 0 14px 14px',padding:'13px 14px',marginBottom:'11px'}},
            h('div',{style:{fontSize:'9.5px',fontWeight:800,color:C.muted,letterSpacing:'.4px',marginBottom:'9px'}},'الشروط — إجابات المورد'),
            h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}},it.terms.map(termCard)),
            h('div',{style:{fontSize:'9.5px',fontWeight:800,color:C.muted,letterSpacing:'.4px',margin:'13px 0 9px'}},'السعر'),
            kv('الإيجار (قبل الضريبة)',[money(it.rentalRate),' ر.س']),
            kv('التعبئة والنقل',[money(it.deliveryPrice),' ر.س']),
            kv('الإرجاع',[money(it.returnPrice),' ر.س']),
            h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'10px',paddingTop:'10px',marginTop:'4px',borderTop:'1.5px solid '+C.blt}},
              h('span',{style:{fontSize:'11px',fontWeight:800,color:C.deep}},'الإجمالي · شامل الضريبة ١٥٪'),
              h('span',{style:{fontSize:'16px',fontWeight:900,color:C.blue}},money(it.total),' ر.س')),
            h('div',{style:{fontSize:'9.5px',fontWeight:800,color:C.muted,letterSpacing:'.4px',margin:'13px 0 9px'}},'صور المعدّة'),
            h('div',{style:{display:'flex',gap:'7px'}},
              [0,1,2,3].map(i=>h('div',{key:i,style:{flex:1,height:'50px',borderRadius:'9px',border:i<it.photos?('1px solid '+C.blt):('1.5px dashed '+C.border),background:i<it.photos?'#E8EEF5':C.s2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',color:C.muted}},i<it.photos?'📷':'—')))),
          sect('مستندات المعدّة — كما أرفقها',it.documents.map(docRow)),
          sect('مستندات الشركة',sub.companyDocuments.map(docRow)),
          sect('بيانات الشركة',[kv('الشركة',s.name),kv('المدينة',s.city),kv('السجل التجاري',sub.crNumber),
            kv('الرقم الضريبي',sub.vatNumber),kv('العنوان الوطني',sub.nationalAddress),
            kv('للتواصل',sub.contactInfo),kv('صالح حتى',sub.validUntil)]),
          sect('ملاحظات المورد',[
            // AC-223: the raw tag must never reach the renter.
            this.hasVatTag(sub.notes)
              ? h('div',{key:'v',style:{display:'flex',alignItems:'center',gap:'7px',background:C.amberLt,border:'1px solid '+C.amberBd,borderRadius:'10px',padding:'8px 10px',marginBottom:'8px'}},
                  h('span',{style:{fontSize:'12px'}},'ℹ️'),
                  h('span',{style:{fontSize:'10px',fontWeight:800,color:'#8a4f08',lineHeight:1.7}},'سعّر المورد شاملاً ضريبة القيمة المضافة. المبالغ المعروضة هنا بعد استخراج الضريبة، فيبقى الإجمالي مساوياً لما أدخله.'))
              : null,
            h('div',{key:'n',style:{fontSize:'11px',fontWeight:600,color:C.navy,lineHeight:1.9}},this.stripVatTag(sub.notes)),
          ])),
        // footer
        h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:'10px',background:'#fff',borderTop:'1px solid '+C.blt,padding:'12px 18px'}},
          h('button',{onClick:()=>{this.subOpen=false;this.up();},
            style:{background:'#fff',border:'1.5px solid '+C.border,color:C.navy,borderRadius:'12px',padding:'11px 20px',fontSize:'12.5px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},'إغلاق'),
          h('button',{onClick:()=>this.toast('تنزيل عرض السعر (نموذج)'),
            style:{background:ORANGE,border:0,color:'#fff',borderRadius:'12px',padding:'11px 22px',fontSize:'12.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'⤓ تنزيل عرض السعر'),
          h('div',{style:{flex:1}}),
          h('span',{style:{fontSize:'9.5px',fontWeight:700,color:C.muted}},'للعرض فقط — التفاوض يبدأ بعد التحويل إلى عرض على المنصّة'))));
  }


  isOff(s){ return !!(s&&s.offPlatform); }


  subQuality(){ const sub=this.offSub(); if(!sub) return null; const it=sub.items[0];
    const OWNERSHIP=['istimara','customs_card','sales_contract','saso_registration','combined'];
    const EQUIPCERT=['tuv','spsp','saso','other'];
    const OPCERT=['operator_tuv','operator_spsp','operator_saso','operator_other'];
    const CO_EXTRA=['local_content','saso_heavy_equip','other'];
    const docs=it.documents||[], coDocs=sub.companyDocuments||[];
    const has=(list,types)=>list.some(d=>types.indexOf(d.type)>=0);

    // terms — only what the request required counts toward the denominator
    const tAll=it.terms.length, tOk=it.terms.filter(x=>x[3]).length;
    const terms=tAll?tOk/tAll:1;

    // equipment — buckets, conditional on what the request asks for
    const needsEquipCert=true, needsOperator=true;   // this request asks for both (see eqSummary)
    const buckets=[(it.photos||0)>0, has(docs,OWNERSHIP)];
    if(needsEquipCert) buckets.push(has(docs,EQUIPCERT));
    if(needsOperator)  buckets.push(has(docs,OPCERT));
    const equipment=buckets.length?buckets.filter(Boolean).length/buckets.length:1;

    // company — four optional slots, text OR document
    const slots=[
      !!sub.crNumber || coDocs.some(d=>d.type==='cr'),
      !!sub.vatNumber || coDocs.some(d=>d.type==='vat_cert'),
      !!sub.nationalAddress || coDocs.some(d=>d.type==='national_address'),
      has(coDocs,CO_EXTRA),
    ];
    const company=slots.filter(Boolean).length/slots.length;

    const total=Math.round(100*(0.4*terms + 0.3*equipment + 0.3*company));
    return {terms:Math.round(terms*100), docs:Math.round(equipment*100), company:Math.round(company*100),
      total, tOk, tAll, buckets:buckets.length, bucketsOk:buckets.filter(Boolean).length,
      band: total>=80?'مطابقة عالية' : total>=50?'مطابقة متوسطة' : 'مطابقة ضعيفة',
      color: total>=80?C.green : total>=50?C.amber : C.red};
  }
