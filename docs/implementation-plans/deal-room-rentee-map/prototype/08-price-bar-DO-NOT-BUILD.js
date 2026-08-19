/* ── 08-price-bar-DO-NOT-BUILD.js ────────────────────────────────
 * DO NOT BUILD. The prototype bar was reworked into a "negotiation gap track" then REVERTED by decision (§6.1) — re-host the shipped DealRoom bar instead. Kept only so the dark footer shell geometry is visible. Also holds the retired unit-picker modal (§7.6).
 *
 * Verbatim from deal-room-rentee-map-v2.html. REFERENCE ONLY — prototype code uses
 * React.createElement, inline styles and fixture data. Read it for STRUCTURE,
 * GEOMETRY and ORDER; build with this repo's conventions. design.md is the distilled
 * version, this is the receipt.
 */

  rPriceBar(){ const S=this.S, cfg=this.cfg;
    const agreed=!!S.price.agreed, waiting=!agreed&&S.price.turn==='supplier';
    const replied=this.supHasCountered()&&S.price.turn==='rentee'&&!agreed;
    const pos=agreed?(S.price.agreedPos||this.supPos()):this.supPos();
    const totalAll=agreed?S.price.agreed:this.currentAsk();
    // Hero is the RATE per period, not the grand total — app parity (DealRoom.tsx:749-751).
    // The toggle scales the RATE (rate × units), never grand ÷ qty: mob and demob carry their own
    // unit counts and either leg can be excluded, so that quotient means nothing.
    const units=Math.max(1,S.qty);
    const priceAll=this.priceAll===true;            // per-unit is the DEFAULT, as shipped
    const heroRate=priceAll?pos.rate*units:pos.rate;
    const nAck=S.terms.filter(t=>!t.ack), diff=nAck.filter(t=>t.state==='countered').length, open=nAck.filter(t=>t.state==='open').length;
    const ready=this.allDone();
    const A=(k,v)=>({key:k,val:v});
    const stTone = S.approved?'done' : agreed?'done' : waiting?'wait' : 'neg';
    const stColor = stTone==='done'?{c:'#6FE0A0',bg:'rgba(29,175,88,.16)',bd:'rgba(29,175,88,.4)'}
                  : stTone==='wait'?{c:'#F3C77A',bg:'rgba(212,120,10,.16)',bd:'rgba(212,120,10,.42)'}
                  : {c:'#8FD0FF',bg:'rgba(143,208,255,.14)',bd:'rgba(143,208,255,.34)'};
    const stLabel = S.approved?'معتمد' : agreed?'السعر متفق' : waiting?'بانتظار المورد' : 'قيد التفاوض';
    const srcTxt = agreed?'السعر المتفق عليه':(this.supHasCountered()?'عرض المورد المقابل':'عرض المورد الافتتاحي');

    const btn=(o)=>h('button',{key:o.key,onClick:o.disabled?null:o.onClick,disabled:!!o.disabled,title:o.title||'',
      style:{display:'inline-flex',alignItems:'center',gap:'7px',border:0,borderRadius:'12px',padding:'9px 16px',fontFamily:'inherit',fontWeight:700,fontSize:'13px',
        cursor:o.disabled?'not-allowed':'pointer',color:'#fff',opacity:o.disabled?.5:1,background:o.bg,
        animation:o.pulse?'dpPing 1.8s ease-out infinite':'none'}},
      o.ic?h('span',{style:{fontSize:'15px'}},o.ic):null,o.label);

    const rental=this.rateLineTotal(pos.rate), mob=pos.incMob?pos.mob:0, demob=pos.incDemob?pos.demob:0;
    const sub=rental+mob+demob, vat=Math.round(sub*.15);
    const brow=(l,v,tot)=>h('div',{key:l,style:{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:'12px',padding:tot?'10px 0 0':'6px 0',
      borderTop:tot?'1px solid rgba(255,255,255,.2)':'none',marginTop:tot?'4px':0}},
      h('span',{style:{fontSize:'13px',fontWeight:tot?700:600,color:tot?'#fff':'rgba(255,255,255,.82)'}},l),
      h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr',fontSize:tot?'17px':'15px',fontWeight:700,color:tot?'#8FD0FF':'#fff'}},fmtEN(v)));

    return h('div',{style:{position:'relative',display:'flex',alignItems:'center',justifyContent:'center',minHeight:'124px',padding:'12px 20px'}},
      h('span',{style:{position:'absolute',top:'12px',right:'16px',display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'11px',fontWeight:700,
        padding:'4px 11px',borderRadius:'999px',background:stColor.bg,border:'1px solid '+stColor.bd,color:stColor.c}},
        h('span',{style:{width:'7px',height:'7px',borderRadius:'50%',background:'currentColor'}}),stLabel),

      h('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px',textAlign:'center'}},
        h('div',{style:{display:'inline-flex',alignItems:'center',gap:'7px',fontSize:'12px',fontWeight:600,color:'rgba(255,255,255,.72)'}},
          h('span',{style:{width:'8px',height:'8px',borderRadius:'50%',background:stColor.c}}),
          srcTxt+' · '+(units>1?('العرض يشمل '+AR(units)+' وحدات'):'وحدة واحدة')),
        h('div',{style:{display:'flex',alignItems:'baseline',gap:'8px'}},
          h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr',fontSize:'44px',fontWeight:700,letterSpacing:'-1.5px',lineHeight:1,color:'#fff'}},fmtEN(heroRate)),
          h('span',{style:{fontSize:'15px',fontWeight:600,color:'rgba(255,255,255,.68)'}},'ر.س / يوم')),
        h('div',{style:{display:'inline-flex',alignItems:'center',gap:'11px',marginTop:'2px'}},
          // per-unit ↔ all-units, shipped behaviour: scales the RATE only, and only when units > 1
          units>1?h('div',{style:{display:'inline-flex',background:'rgba(255,255,255,.1)',borderRadius:'8px',padding:'2px'}},
            // Labels say what they MEAN. "للوحدة" alone was read as "the price of the unit I clicked";
            // it is really the rate expressed per unit. The scope never changes — always the whole offer.
            [[false,'سعر الوحدة'],[true,'إجمالي '+AR(units)+' وحدات']].map(o=>h('button',{key:String(o[0]),onClick:()=>{ this.priceAll=o[0]; this.up(); },
              style:{border:0,background:(o[0]===priceAll)?'#fff':'none',color:(o[0]===priceAll)?'#0F2238':'rgba(255,255,255,.75)',fontFamily:'inherit',fontSize:'11px',fontWeight:700,padding:'4px 11px',borderRadius:'7px',cursor:'pointer'}},o[1]))):null,
          h('button',{onClick:()=>{ this.bdOpen=!this.bdOpen; this.up(); },
            style:{background:'none',border:0,color:'#8FD0FF',fontFamily:'inherit',fontSize:'11px',fontWeight:700,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'3px'}},
            'التفاصيل',h('span',{style:{display:'inline-block',transition:'.2s',transform:this.bdOpen?'rotate(180deg)':'none'}},'⌄'))),
        (replied||waiting)?h('div',{style:{marginTop:'7px',fontSize:'11.5px',fontWeight:700,color:'#F3C77A'}},
          replied?'🔔 المورد ردّ — دورك الآن':'⏳ عرضك لدى المورد'):null,
        null),

      h('div',{style:{position:'absolute',left:'20px',top:'50%',transform:'translateY(-50%)',display:'flex',alignItems:'center',gap:'8px'}},
        S.approved
          ? h('div',{style:{fontSize:'12.5px',fontWeight:700,color:'#6FE0A0',whiteSpace:'nowrap'}},'✓ الاتفاق معتمد — الشحنة على الطريق 🚚')
          : [ btn({key:'neg',
                label: replied?'راجع وردّ' : waiting?'عرضك لدى المورد' : 'اطلب سعراً أقل',
                ic: replied?'🔔' : waiting?'⏳' : '⇣',
                bg:C.blue,pulse:replied,onClick:()=>this.openQuote()}),
              btn({key:'acc',label:'اعتمد',ic:'✓',bg:C.green,disabled:!ready,title:ready?'':'أنهِ البنود المختلفة أولاً',onClick:()=>this.openAgree()}) ]),

      this.bdOpen?h('div',{onClick:()=>{ this.bdOpen=false; this.up(); },style:{position:'fixed',inset:0,zIndex:19}}):null,
      this.bdOpen?h('div',{style:{position:'absolute',bottom:'calc(100% + 8px)',left:'50%',transform:'translateX(-50%)',zIndex:20,width:'min(420px,calc(100vw - 40px))',
        background:'#0F2238',border:'1px solid rgba(255,255,255,.2)',borderRadius:'16px',padding:'14px 18px',boxShadow:'0 20px 50px rgba(9,20,34,.5)',textAlign:'start'}},
        brow('الإيجار ('+(cfg.mode==='open'?'مفتوح':AR(cfg.duration)+' يوم')+' × '+AR(S.qty)+')',rental),
        pos.incMob?brow('التعبئة والنقل',mob):null,
        pos.incDemob?brow('الإرجاع',demob):null,
        brow('المجموع قبل الضريبة',sub),
        brow('ضريبة القيمة المضافة (١٥٪)',vat),
        brow('الإجمالي التقديري',sub+vat,true)):null);
  }


  rQuoteModal(){ const S=this.S;
    const agreed=!!S.price.agreed, supTurn=S.price.turn==='supplier'&&!agreed, wizard=!agreed&&!supTurn;
    const steps=this.wizSteps(); const idx=steps.findIndex(s=>s.key===this.qsStep);
    const titleMap={paper:'السعر وشروط الدفع',terms:'شروط التشغيل',review:'مراجعة وإرسال'};
    const title=agreed?'عرض السعر المتفق':supTurn?'ردّ المورد':(titleMap[this.qsStep]||'عرض الأسعار');
    const subMap={paper:'عدّل القيم لإرسال عرض مضاد',pay:'قرار واحد لكل سؤال',terms:'احسم بنود التشغيل',review:'راجع ثم أرسل'};
    // shipped subtitle: room · request code · round number
    const roundNo=(S.price.rounds?S.price.rounds.length:0)+1;
    const subtitle='غرفة التفاوض · '+REQ_ID+' · الجولة '+AR(roundNo);
    const sub=this.posTotal(S.price.draft); const net=sub+Math.round(sub*0.15);
    const mw='100%';   // qp-full: the shipped sheet is full-screen, not a centred card
    const stepper=wizard? h('div',{style:{flexShrink:0,background:'#eaf1fc',borderBottom:'1px solid '+C.blt,padding:'12px 22px 14px'}},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'center',maxWidth:'560px',margin:'0 auto'}},
        steps.reduce((acc,s,n)=>{ const done=n<idx, on=n===idx; const clickable=n<idx;
          acc.push(h('button',{key:'st'+s.key,onClick:clickable?()=>this.goStep(s.key):null,style:{display:'flex',alignItems:'center',gap:'8px',flexShrink:0,background:'none',border:'none',padding:0,cursor:clickable?'pointer':'default',fontFamily:'inherit'}},
            h('div',{style:{width:'30px',height:'30px',borderRadius:'50%',background:done?C.green:on?C.blue:C.surface,color:done||on?'#fff':C.muted,border:'1.5px solid '+(done?C.green:on?C.blue:C.border),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:800}}, done?'✓':AR(n+1)),
            h('div',{style:{fontSize:'14px',fontWeight:on?800:600,color:on?C.blue:done?C.green:C.muted,whiteSpace:'nowrap'}},s.label)));
          if(n<steps.length-1) acc.push(h('div',{key:'cn'+n,style:{flex:1,height:'2px',background:n<idx?C.green:C.border,margin:'0 10px',minWidth:'18px'}}));
          return acc; },[]))) : null;
    return h('div',{style:{position:'fixed',inset:0,zIndex:150,display:'flex',alignItems:'stretch',justifyContent:'stretch',padding:0}},
      h('div',{onClick:()=>this.closeQuote(),style:{position:'absolute',inset:0,background:'rgba(9,20,34,.5)',animation:'dpFade .2s'}}),
      h('div',{style:{position:'relative',width:mw,maxWidth:'none',height:'100%',maxHeight:'none',background:'#fff',borderRadius:0,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 30px 70px rgba(9,20,34,.4)',animation:'dpModal .25s'}},
        // top bar
        h('div',{style:{flexShrink:0,minHeight:'66px',background:'#fff',borderBottom:'1px solid '+C.blt,display:'flex',alignItems:'center',gap:'14px',padding:'0 22px'}},
          h('div',{style:{width:'44px',height:'44px',borderRadius:'12px',background:C.blueLt,color:C.blue,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'21px',flexShrink:0}},'﷼'),
          h('div',{style:{flexShrink:0}},h('div',{style:{fontSize:'18px',fontWeight:800,color:C.navy}},title),h('div',{style:{fontSize:'13px',color:C.muted,fontWeight:600}},subtitle)),
          h('div',{style:{marginInlineStart:'auto',display:'flex',alignItems:'center',gap:'16px'}},
            wizard? h('div',{style:{textAlign:'end'}},
              h('div',{style:{fontSize:'11px',fontWeight:700,color:C.muted}},'إجمالي عرضك · شامل الضريبة'),
              h('div',{style:{fontSize:'22px',fontWeight:800,color:C.navy,fontFamily:'ui-monospace,monospace',direction:'ltr',lineHeight:1.1}},fmtEN(net)+' ر.س')) : null,
            h('button',{onClick:()=>this.closeQuote(),style:{width:'40px',height:'40px',borderRadius:'50%',background:C.surface,border:'1px solid '+C.border,color:C.muted,cursor:'pointer',fontSize:'17px',fontFamily:'inherit',flexShrink:0}},'✕'))),
        stepper,
        // scrolling body
        this.qpDesk(this.qsBody()),
        // footer
        h('div',{style:{flexShrink:0,padding:'15px 22px',borderTop:'1px solid '+C.blt,background:'#fff',boxShadow:'0 -6px 18px rgba(9,20,34,.05)'}}, this.qsFoot())));
  }


  rUnitPickModal(){ const s=this.curSup(); if(!s) return null;
    const us=unitsOf(s), sel=this.pickSel[s.id]||{}, picked=this.pickedCount(), qty=this.S.qty;
    const rest=Math.max(0,qty-picked);
    return h('div',{style:{position:'fixed',inset:0,zIndex:220,background:'rgba(9,20,34,.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'},onClick:()=>{this.unitPick=false;this.up();}},
      h('div',{onClick:e=>e.stopPropagation(),style:{width:'min(520px,100%)',maxHeight:'86vh',overflowY:'auto',background:'#fff',borderRadius:'18px',padding:'18px',boxShadow:'0 24px 60px rgba(9,20,34,.42)'}},
        h('div',{style:{fontSize:'15px',fontWeight:800,color:C.deep}},'أي معدّات تريد؟'),
        h('div',{style:{fontSize:'11.5px',color:C.muted,fontWeight:600,marginTop:'4px',lineHeight:1.7}},
          'وافقت على '+AR(qty)+' وحدات. اختر المعدّات التي تريدها بالتحديد من وحدات هذا المورد — نفس الوحدات الظاهرة على الخريطة.'),
        h('div',{style:{display:'flex',flexDirection:'column',gap:'8px',margin:'14px 0'}},
          us.map((u,i)=>{ const on=!!sel[i], rd=this.unitReadiness(u);
            return h('button',{key:i,onClick:()=>this.togglePick(i),
              style:{display:'flex',alignItems:'center',gap:'11px',textAlign:'start',background:on?C.blueLt:'#fff',border:'1.5px solid '+(on?C.blue:C.border),borderRadius:'13px',padding:'11px 12px',cursor:'pointer',fontFamily:'inherit'}},
              h('span',{style:{width:'20px',height:'20px',borderRadius:'6px',border:'2px solid '+(on?C.blue:C.border),background:on?C.blue:'#fff',color:'#fff',fontSize:'12px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}},on?'✓':''),
              h('div',{style:{flex:1,minWidth:0}},
                h('div',{style:{fontSize:'12.5px',fontWeight:800,color:C.deep,fontFamily:'ui-monospace,monospace',direction:'ltr',textAlign:'start'}},u.serial),
                h('div',{style:{fontSize:'10.5px',fontWeight:600,color:C.muted,marginTop:'3px'}},u.yard+' · '+toAr(u.km)+' كم · '+u.year)),
              h('div',{style:{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'4px',flexShrink:0}},
                h('span',{style:{fontSize:'9px',fontWeight:800,color:this.bandColor(rd.band)}},this.bandLabel(rd.band)),
                h('span',{style:{fontSize:'9px',fontWeight:800,color:u.confirmed?C.green:C.red}},u.confirmed?'موقع مؤكّد ✓':'موقع غير مؤكّد'))); })),
        rest>0? h('div',{style:{background:C.amberLt,border:'1px solid '+C.amberBd,borderRadius:'12px',padding:'11px 13px',fontSize:'11.5px',fontWeight:700,color:'#8a4f08',lineHeight:1.7}},
          'اخترت '+AR(picked)+' من '+AR(qty)+' — سيحدّد المورد الوحدات المتبقية ('+AR(rest)+') لاحقاً.') : null,
        picked>qty? h('div',{style:{background:C.redLt,border:'1px solid '+C.redBd,borderRadius:'12px',padding:'11px 13px',fontSize:'11.5px',fontWeight:700,color:C.red}},
          'اخترت '+AR(picked)+' وهي أكثر من العدد المتفق عليه ('+AR(qty)+').') : null,
        h('div',{style:{display:'flex',gap:'9px',marginTop:'14px'}},
          h('button',{onClick:()=>{this.unitPick=false;this.up();},style:{flex:1,background:'#fff',border:'1.5px solid '+C.border,color:C.navy,borderRadius:'12px',padding:'11px',fontSize:'12.5px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},'لاحقاً'),
          h('button',{onClick:()=>{this.unitPick=false;this.toast('تم تحديد '+AR(picked)+' معدّة لهذه الصفقة');this.up();},disabled:picked>qty,
            style:{flex:2,background:picked>qty?C.border:C.blue,border:0,color:'#fff',borderRadius:'12px',padding:'11px',fontSize:'12.5px',fontWeight:700,cursor:picked>qty?'default':'pointer',fontFamily:'inherit'}},'تأكيد الاختيار'))));
  }


  rAgreeModal(){ return this.modalShell('الاتفاق والدفع','الملخص النهائي وجدول الدفع','🤝',this.pAgree(),()=>this.closeAgree(),'560px'); }


  rBidsBar(){ const list=this.sortedBids(); const rates=list.map(s=>s.rate);
    const lo=Math.min.apply(null,rates), hi=Math.max.apply(null,rates), avg=Math.round(rates.reduce((a,b)=>a+b,0)/rates.length);
    const stat=(l,v,c)=>h('div',{key:l,style:{display:'inline-flex',alignItems:'baseline',gap:'6px'}},
      h('span',{style:{fontSize:'10px',fontWeight:600,color:'rgba(255,255,255,.55)'}},l),
      h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr',fontSize:'13px',fontWeight:700,color:c||'#fff'}},fmtEN(v)));
    return h('div',{style:{position:'relative',display:'flex',alignItems:'center',justifyContent:'center',minHeight:'138px',padding:'12px 20px'}},
      h('span',{style:{position:'absolute',top:'12px',right:'16px',display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'11px',fontWeight:700,
        padding:'4px 11px',borderRadius:'999px',background:'rgba(143,208,255,.14)',border:'1px solid rgba(143,208,255,.34)',color:'#8FD0FF'}},
        h('span',{style:{width:'7px',height:'7px',borderRadius:'50%',background:'currentColor'}}),'عروض مفتوحة'),
      h('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px',textAlign:'center'}},
        h('div',{style:{fontSize:'12px',fontWeight:600,color:'rgba(255,255,255,.72)'}},'أقل سعر بين '+AR(list.length)+' عروض'),
        h('div',{style:{display:'flex',alignItems:'baseline',gap:'8px'}},
          h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr',fontSize:'44px',fontWeight:700,letterSpacing:'-1.5px',lineHeight:1,color:'#fff'}},fmtEN(lo)),
          h('span',{style:{fontSize:'15px',fontWeight:600,color:'rgba(255,255,255,.68)'}},'ر.س / يوم')),
        h('div',{style:{display:'inline-flex',alignItems:'center',gap:'18px',marginTop:'2px'}},
          stat('المتوسط',avg), h('span',{style:{width:'1px',height:'22px',background:'rgba(255,255,255,.14)'}}), stat('أعلى سعر',hi))),
      h('div',{style:{position:'absolute',top:'14px',left:'20px',fontSize:'10.5px',fontWeight:600,color:'rgba(255,255,255,.45)'}},'اختر مورّداً من الخريطة لفتح غرفة صفقته'),
      h('div',{style:{position:'absolute',left:'20px',bottom:'16px'}},
        h('button',{onClick:()=>this.selectSup(SUPPLIERS.indexOf(this.sortedBids()[0])),
          style:{display:'flex',alignItems:'center',gap:'7px',background:'#fff',color:C.deep,border:'none',borderRadius:'12px',padding:'11px 17px',fontSize:'12.5px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},
          'افتح أفضل عرض',h('span',null,'←'))));
  }


  pTerms(){ const S=this.S; const multi=this.itemsMode==='multi';
    const terms=S.terms.filter(t=>!t.deferredTerm);
    const negOpen=terms.filter(t=>t.type==='neg'&&t.state!=='agreed').length;
    return h('div',{style:{padding:'16px'}},
      h('div',{style:{fontSize:'14px',fontWeight:700,color:C.navy,marginBottom:'4px'}},'شروط التشغيل'),
      h('div',{style:{fontSize:'11.5px',color:C.muted,marginBottom:'13px',lineHeight:1.6}},'البنود القابلة للتفاوض فقط تقبل عرضاً مضاداً · بنود الإقرار والعلم للقراءة فقط'),
      h('div',{style:{display:'flex',gap:'8px',marginBottom:'13px',flexWrap:'wrap'}},
        h('span',{style:{fontSize:'10px',fontWeight:800,color:C.blue,background:C.blueLt,border:'1px solid '+C.blueBd,borderRadius:'100px',padding:'4px 11px'}},'⚖ '+AR(negOpen)+' قابلة للتفاوض بلا حسم'),
        h('span',{style:{fontSize:'10px',fontWeight:800,color:C.muted,background:C.s2,border:'1px solid '+C.blt,borderRadius:'100px',padding:'4px 11px'}},'🔒 '+AR(terms.filter(t=>t.ack).length)+' للقراءة فقط')),
      multi? h('div',{style:{display:'flex',gap:'9px',background:C.blueLt,border:'1px solid '+C.blueBd,borderRadius:'12px',padding:'11px 13px',marginBottom:'14px'}},
        h('span',{style:{fontSize:'16px'}},'🌐'),
        h('div',{},
          h('div',{style:{fontSize:'12px',fontWeight:700,color:C.blue}},'شروط موحّدة لكل الطلب ('+AR(MULTI_ITEMS.length)+' بنود)'),
          h('div',{style:{fontSize:'10.5px',color:C.navy,fontWeight:500,marginTop:'2px',lineHeight:1.6}},'تضبط الشرط مرّة واحدة فيُطبَّق على كل البنود. قد يردّ المورد بقيمة مختلفة لبند بعينه، لكن موقفك يبقى واحداً.'))) : null,
      this.catGroups(terms).map(g=>h('div',{key:'pt-'+g.cat.key,style:{marginBottom:'8px'}},
        this.catHead(g.cat,g.items.length),
        g.items.map(t=>t.type==='neg'?this.pTermNeg(t):this.ackRow(t)))),
      S.terms.filter(t=>t.deferredTerm).length? h('div',{style:{marginTop:'6px'}},
        h('div',{style:{fontSize:'11px',color:C.amber,fontWeight:700,marginBottom:'8px'}},'⏱ شروط مؤجّلة من التوثيق'),
        S.terms.filter(t=>t.deferredTerm).map(t=>this.ackRow(t))) : null);
  }


  pTermNeg(t){ const S=this.S; const multi=this.itemsMode==='multi';
    const itemName=idx=>FLEET[this.items[idx].unitIdx].spec;
    const done=t.state==='agreed'; const countered=t.state==='countered';
    const perItem=multi&&t.supByItem?Object.keys(t.supByItem):[];
    return h('div',{key:t.id,style:{border:'1px solid '+(done?C.greenBd:countered?C.amberBd:C.blueBd),background:done?C.greenLt:countered?C.amberLt:'#fff',borderRadius:'13px',padding:'13px',marginBottom:'10px'}},
      h('div',{style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'10px',marginBottom:'9px'}},
        h('div',{style:{minWidth:0}},
          h('div',{style:{display:'flex',alignItems:'center',gap:'7px',flexWrap:'wrap'}},
            h('span',{style:{fontSize:'13px',fontWeight:800,color:C.navy}},t.name),
            this.typeBadge('neg'),
            multi? h('span',{style:{fontSize:'9px',fontWeight:700,color:C.blue,background:C.blueLt,border:'1px solid '+C.blueBd,borderRadius:'5px',padding:'2px 5px'}},'يُطبّق على الكل') : null),
          this.enTag(t.en)),
        done? h('span',{style:{fontSize:'11px',fontWeight:800,color:C.green,flexShrink:0}},'✓ متفق') : countered? h('span',{style:{fontSize:'11px',fontWeight:800,color:C.amber,flexShrink:0}},'⚡ ردّك معلّق') : h('span',{style:{fontSize:'11px',fontWeight:800,color:C.blue,flexShrink:0}},'○ يحتاج قراراً')),
      done? h('div',{style:{fontSize:'12.5px',fontWeight:700,color:C.navy}},t.agreedVal)
      : h('div',{},
          h('div',{style:{fontSize:'11px',color:C.muted,fontWeight:600,marginBottom:'8px'}},'عرض المورد: '+t.supDefault+(countered?' · ردّك: '+t.myVal:'')),
          h('div',{style:{display:'flex',flexWrap:'wrap',gap:'6px'}},
            h('button',{onClick:()=>this.acceptTerm(t.id),style:{background:C.green,color:'#fff',border:'none',borderRadius:'9px',padding:'8px 13px',fontSize:'11.5px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},'✓ اقبل: '+t.supDefault),
            t.opts.map(o=>h('button',{key:o,onClick:()=>this.counterTerm(t.id,o),style:{background:'#fff',color:C.navy,border:'1.5px solid '+C.border,borderRadius:'9px',padding:'8px 13px',fontSize:'11.5px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}},'↖ '+o)))),
      perItem.length? h('div',{style:{marginTop:'10px',paddingTop:'10px',borderTop:'1px dashed '+C.border}},
        h('div',{style:{fontSize:'9.5px',fontWeight:800,color:C.amber,marginBottom:'6px'}},'⚡ ردّ المورد بقيمة مختلفة لبند بعينه — قرارك يبقى موحّداً:'),
        perItem.map(idx=>h('div',{key:idx,style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',fontSize:'11px',padding:'4px 0'}},
          h('span',{style:{fontWeight:600,color:C.navy}},FLEET[this.items[idx].unitIdx].icon||'•',' ',itemName(idx)),
          h('span',{style:{fontWeight:800,color:'#8a4f08',background:C.amberLt,borderRadius:'6px',padding:'2px 8px'}},t.supByItem[idx])))) : null); }
