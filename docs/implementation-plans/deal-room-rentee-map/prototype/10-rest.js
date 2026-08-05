/* State, helpers, fixtures and plumbing not tied to one surface — 241 functions, source order. */

  up(){ this.setState(s=>({tick:s.tick+1})); }

  toast(msg){ this.toastMsg=msg; clearTimeout(this._toastT); this._toastT=setTimeout(()=>{this.toastMsg='';this.up();},3600); this.up(); }

  componentDidMount(){
    this.initLeaflet();
    window.addEventListener('resize',()=>{ if(this.map) this.map.invalidateSize(); if(this.tourOn){ this._ms=-1; this.forceUpdate(); } });
    let seen=false; try{ seen=localStorage.getItem('dp_tour_seen')==='1'; }catch(e){}
    if(!seen) setTimeout(()=>{ this.tourStep=0; this._ms=-1; this.tourOn=true; this.forceUpdate(); }, 650);
  }

  supIcon(conf){ return L.divIcon({className:'',iconSize:[40,52],iconAnchor:[20,40],html:
    '<div style="display:flex;flex-direction:column;align-items:center">'
    +'<div style="width:34px;height:34px;border-radius:50%;background:'+(conf?C.green:C.amber)+';border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;font-family:\'IBM Plex Sans Arabic\',sans-serif">أخ</div>'
    +'<div style="margin-top:4px;background:#fff;border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700;color:#0F2238;box-shadow:0 2px 6px rgba(15,34,56,.2);white-space:nowrap;font-family:\'IBM Plex Sans Arabic\',sans-serif">المعدّة</div></div>' }); }

  truckIcon(){ return L.divIcon({className:'',iconSize:[36,36],iconAnchor:[18,18],html:
    '<div style="width:34px;height:34px;border-radius:50%;background:#fff;border:2.5px solid '+C.green+';box-shadow:0 3px 10px rgba(15,34,56,.3);display:flex;align-items:center;justify-content:center;font-size:16px">🚚</div>' }); }

  fitMap(){ if(!this.map) return;
    // one debounced, non-animated fit: the triple invalidateSize on boot used to cancel each other's fly
    clearTimeout(this._fitT);
    this._fitT=setTimeout(()=>{ const M=this.map; if(!M) return;
      const sz=M.getSize();
      const px=Math.min(170,Math.round(sz.x*0.18)), py=Math.min(120,Math.round(sz.y*0.24));
      // a selected bid may fan out across several yards — fit to every one of its units, not just its anchor
      const cs=this.curSup();
      // Project only until a supplier is selected; then the project plus that fleet.
      const pts = cs ? [SITE].concat(fleetOf(cs).map(u=>u.ll)) : [SITE];
      M.fitBounds(pts,{paddingTopLeft:[px,py],paddingBottomRight:[px,Math.round(py*1.5)],animate:false,maxZoom:13});
      this.layoutBids(true);
    },40);
  }

  distBand(km){ return {lbl: km<=30?'قريب' : km<=120?'متوسط' : 'بعيد'}; }

  approvedUnitsFor(s){ const st=this._supStates&&this._supStates[s.id];
    const S=(this.curSup()===s)?this.S:st;
    return (S&&S.approved&&S.qty!=null)?S.qty:null; }

  supAvail(s){ const us=unitsOf(s); if(!us.length) return C.red;
    const n=us.filter(u=>u.confirmed).length;
    if(n===us.length) return C.green;   // every machine's yard confirmed in bid readiness
    if(n===0)         return C.red;     // none confirmed
    return C.muted;                     // MIXED — grey, so it never reads as either extreme
  }

  supTip(s){ const band={c:C.muted,lbl:this.distBand(s.km).lbl};
    return '<div style="font-family:\'IBM Plex Sans Arabic\',sans-serif;direction:rtl;text-align:right;min-width:150px">'
      +'<div style="font-size:11.5px;font-weight:700;color:'+C.deep+'">'+s.name+(s.verified?' ✓':'')+'</div>'
      +'<div style="font-size:9.5px;font-weight:600;color:'+C.muted+';margin-top:2px">'+s.deals+' صفقة · '+s.city+'</div>'
      +'<div style="display:flex;gap:8px;align-items:center;margin-top:6px;padding-top:6px;border-top:1px dashed '+C.blt+'">'
        +'<span style="font-size:12.5px;font-weight:700;color:'+C.deep+'">'+AR(s.rate)+'<span style="font-size:8.5px;font-weight:600;color:'+C.muted+'"> ر.س/يوم</span></span>'
        +'<span style="font-size:9px;font-weight:700;color:'+band.c+'">'+band.lbl+' · '+toAr(s.km)+' كم · '+s.eta+'</span></div>'
      +'<div style="font-size:9px;font-weight:700;color:'+C.blue+';margin-top:5px">انقر لفتح غرفة الصفقة ←</div></div>';
  }

  unitTip(s,u,idx,total){ const band={c:C.muted};   // distance is neutral; availability is the ring
    return '<div style="font-family:\'IBM Plex Sans Arabic\',sans-serif;direction:rtl;text-align:right;min-width:180px">'
      +'<div style="font-size:11.5px;font-weight:700;color:'+C.deep+'">وحدة '+AR(idx+1)+' من '+AR(total)+' · '+s.name+'</div>'
      +'<div style="font-size:9.5px;font-weight:600;color:'+C.muted+';margin-top:3px;font-family:ui-monospace,monospace;direction:ltr;text-align:right">'+u.serial+'</div>'
      +'<div style="display:flex;gap:8px;align-items:center;margin-top:6px;padding-top:6px;border-top:1px dashed '+C.blt+'">'
        +'<span style="font-size:9.5px;font-weight:700;color:'+band.c+'">'+u.yard+' · '+toAr(u.km)+' كم</span>'
        +'<span style="font-size:9px;font-weight:700;color:'+(u.confirmed?C.green:C.amber)+'">'+(u.confirmed?'موقع مؤكّد ✓':'موقع غير مؤكّد')+'</span></div>'
      +'<div style="font-size:9px;font-weight:600;color:'+C.muted+';margin-top:4px">سنة الصنع '+u.year+'</div></div>';
  }

  allBids(){ if(this.itemsMode!=='multi') return SUPPLIERS; return (ITEM_BIDS[this.activeItem||0]||[]).map(i=>SUPPLIERS[i]); }

  bidsFor(){ const b=this.kmBand;   // NB: distBand(km) is an existing label helper — do not reuse that name
    if(!b) return this.allBids();
    return this.allBids().filter((s,i)=>{
      if(SUPPLIERS.indexOf(s)===this.selSup) return true;   // never hide what the renter has selected
      if(typeof s.km!=='number') return true;               // unknown distance is NOT far (AC-227)
      return s.km<=b;
    });
  }

  distBands(){ return [[null,'الكل'],[50,'≤ ٥٠ كم'],[100,'≤ ١٠٠ كم'],[200,'≤ ٢٠٠ كم']]; }

  setDistBand(b){ this.kmBand=b; this.up(); if(this.map) this.updateLeaflet(true); }

  curYard(){ const s=this.curSup(); return s?s.co:YARDS[this.S.unitIdx||0]; }

  backToBids(){ if(this.selSup!=null) this._supStates[this.selSup]=this.S;
    this.selSup=null; this.drawerOpen=false; this.quoteOpen=false; this.agreeOpen=false; this.supViewOpen=false;
    this.up(); setTimeout(()=>this.updateLeaflet(true),70);
  }

  setBidSort(k){ this.bidSort=k; this.up(); }

  animateTruck(){ const yard=this.curYard(); const steps=70; let i=0; clearInterval(this._ti);
    this._ti=setInterval(()=>{ i++; const t=i/steps; this.truckMarker.setLatLng([yard[0]+(SITE[0]-yard[0])*t, yard[1]+(SITE[1]-yard[1])*t]); if(i>=steps) clearInterval(this._ti); }, 55);
  }

  componentDidUpdate(){ this.measureTour();
    if(this.map){ const key=(this.S.unitIdx||0)+'|'+this.selSup+'|'+this.itemsMode+'|'+this.activeItem+'|'+this.bidSort;
      const refit=this._lastKey!==key; this._lastKey=key; this.updateLeaflet(refit);
      if(this.S.stage==='closed'){ if(!this._trucking){ this._trucking=true; this.animateTruck(); } } else { this._trucking=false; } }
  }

  measureTour(){ if(!this.tourOn) return; if(this._ms===this.tourStep) return; const el=document.getElementById(TOUR[this.tourStep].id);
    this.tourRect = el? (()=>{const b=el.getBoundingClientRect();return {top:b.top,left:b.left,width:b.width,height:b.height};})() : null;
    this._ms=this.tourStep; this.forceUpdate(); }

  startTour(){ this.tourStep=0; this._ms=-1; this.tourOn=true; this.up(); }

  tourNext(){ if(this.tourStep>=TOUR.length-1){ this.finishTour(); return; } this.tourStep++; this._ms=-1; this.up(); }

  tourPrev(){ this.tourStep=Math.max(0,this.tourStep-1); this._ms=-1; this.up(); }

  finishTour(){ this.tourOn=false; try{localStorage.setItem('dp_tour_seen','1');}catch(e){} this.up(); }

  dismissNotifQuiet(){ clearTimeout(this._nT); this.notif=null; }

  closeDrawer(){ this.drawerOpen=false; this.drawerMax=false; this.up(); }

  toggleDrawerMax(){ this.drawerMax=!this.drawerMax; this.up(); }

  zoom(f){ this.view.scale=Math.max(1,Math.min(4,this.view.scale*f)); if(this._applyMap) this._applyMap(); }

  zoomReset(){ this.view={scale:1,tx:0,ty:0}; if(this._applyMap) this._applyMap(); }

  rateLineTotal(rate){ const cfg=this.cfg,S=this.S; if(cfg.mode==='open') return rate*S.qty; const perDay=rate/FREQ_DAYS[cfg.frequency]; return perDay*(cfg.valid?cfg.duration:0)*S.qty; }

  posTotal(p){ return this.rateLineTotal(p.rate)+(p.incMob?p.mob:0)+(p.incDemob?p.demob:0); }

  copyPos(p){ return {rate:p.rate,mob:p.mob,demob:p.demob,incMob:p.incMob,incDemob:p.incDemob,overtime:(p.overtime!=null?p.overtime:450)}; }

  supPos(){ const r=this.S.price.rounds; for(let i=r.length-1;i>=0;i--) if(r[i].who==='sup') return r[i].pos; return this.S.price.sup; }

  myLastRound(){ const r=this.S.price.rounds; for(let i=r.length-1;i>=0;i--) if(r[i].who==='me') return r[i]; return null; }

  supHasCountered(){ return this.S.price.rounds.some(r=>r.who==='sup'); }

  roundNo(){ return this.S.price.rounds.length+1; }

  currentAsk(){ return this.posTotal(this.supPos()); }

  docResolved(d){ return d.state==='verified'||d.deferred; }

  minYear(){ return 2020; }

  eqNeeds(){ return this.eqSummary().filter(r=>r.st==='bad').map(r=>r.need||r.k); }

  trustOpenCount(){ let n=0; this.S.docs.forEach(d=>{ if(!this.docResolved(d)) n++; }); return n; }

  commOpenCount(){ let n=0; if(!this.S.price.agreed) n++; if(this.S.terms.some(t=>t.state==='open')) n++; return n; }

  allDone(){ return !this.fitGateOpen() && this.trustOpenCount()===0 && this.commOpenCount()===0; }

  checklist(){ return [
    {key:'fit',label:'ملاءمة المعدّة',ok:!this.fitGateOpen(),panel:'equip'},
    {key:'docs',label:'التوثيق والمستندات',ok:this.S.docs.every(d=>this.docResolved(d)),panel:'verif'},
    {key:'price',label:'الاتفاق على السعر',ok:!!this.S.price.agreed,panel:'quote'},
    {key:'terms',label:'شروط التشغيل',ok:this.S.terms.every(t=>t.state==='agreed'),panel:'terms'},
  ]; }

  progress(){ const c=this.checklist(); return [c.filter(i=>i.ok).length,c.length]; }

  recomputeStage(){ const S=this.S;
    if(S.approved){S.stage='closed';return;}
    if(this.allDone()){S.stage='ready';return;}
    if(!S.availabilityAsked){S.stage='fresh';return;}
    if(!S.availabilityConfirmed){S.stage='asked';return;}
    S.stage='negotiating';
  }

  narrate(who,txt){ this.S.chips.push({who,txt}); }

  normDigits(t){ return t.replace(/[٠-٩]/g, d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)); }

  classifyMsg(txt){ const t=this.normDigits(txt); const digits=t.replace(/\D/g,'');
    if(/9665\d{8}|05\d{8}/.test(digits) || /^5\d{8}$/.test(digits)) return 'phone';
    if(/تمديد|نمدد|زيادة\s*(يوم|أسبوع|شهر)/.test(t)) return 'extend';
    if(/\d{3,}/.test(digits+' ') && /(ر\.?\s?س|ريال|بالي|سعر|يومي)/.test(t)) return 'price';
    return null; }

  aiChip(type,txt,actions,once){ const a=this.S.assist;
    if(a.muted[type]) return;
    if(once && a.fired[type]) return;
    if(this.S.chips.some(c=>c.kind==='ai'&&c.type===type&&!c.done&&!c.dismissed)) return;
    a.fired[type]=true; this.S.chips.push({kind:'ai',type,txt,actions}); }

  aiRun(name,arg){ const S=this.S;
    if(name==='call'){ this.inAppCall(); }
    else if(name==='driverCard'){ S.chips.push({kind:'media',who:'me',ic:'👷',name:'بطاقة تواصل السائق',sub:'أبو فهد · ٠٥٥ ××× ×××× · محفوظة في سجل الصفقة'}); this.toast('شوركت بطاقة السائق داخل الغرفة'); }
    else if(name==='toPaper'){ if(!S.price.agreed){ this.resetPaperState(); if(S.price.draft) S.price.draft.rate=arg; this.quoteOpen=true; this.qsStep='paper'; } this.toast('نُقل '+AR(arg)+' ر.س إلى ورقة العرض — أرسلها من هناك'); }
    else if(name==='fileTuv'){ const d=S.docs[0]; if(d.state!=='verified') d.state='verified'; this.narrate('me','أرشفتَ صورة الشهادة كإثبات TÜV في ملف التوثيق'); this.recomputeStage(); this.toast('أُرشفت في ملف التوثيق 🛡️'); }
    else if(name==='fileAddr'){ const d=S.myDocs.find(x=>x.id==='addr'); if(d) d.state='claimed'; this.narrate('me','أضفتَ العنوان الوطني إلى مستنداتك'); this.toast('أُضيف إلى «مستنداتك» — يراه المورد كإقرار ذاتي'); }
    else if(name==='pinSite'){ this.toast('ثُبّتت كنقطة التسليم على خريطة الصفقة 📍'); }
    else if(name==='extendReq'){ this.narrate('me','طلبتَ تمديد المدة بنفس الشروط المتفق عليها — بانتظار موافقة المورد'); this.toast('أُرسل طلب التمديد'); } }

  aiAct(i,j){ const c=this.S.chips[i], a=c.actions[j];
    if(!a.ghost) this.aiRun(a.run,a.arg);
    c.done=true; c.doneTxt=a.ghost?'تم التجاهل':(a.doneTxt||'تم'); this.up(); }

  aiDismiss(i){ const c=this.S.chips[i]; c.dismissed=true; this.S.assist.muted[c.type]=true; this.toast('أُخفي — لن يظهر هذا النوع مجدداً في هذه الغرفة'); this.up(); }

  chatMiddleware(txt){ const type=this.classifyMsg(txt); if(!type) return; const S=this.S;
    if(type==='phone'){
      if(!S.approved) this.aiChip('phone','لاحظت رقم جوال — تقدر تتصل به <b>من داخل التطبيق</b> بزر 📞 أعلى المحادثة، وكل ما يبقى داخل الغرفة يبقى <b>موثّقاً لحمايتك</b> لو صار خلاف. رسالتك وصلت للمورد كما هي.',[{lbl:'اتصل داخل التطبيق 📞',run:'call',doneTxt:'بدأت المكالمة داخل التطبيق'},{lbl:'فهمت',ghost:true}],true);
      else this.aiChip('phone-post','قرب التسليم؟ بدل كتابة الأرقام، شارك <b>بطاقة تواصل السائق</b> — تبقى محفوظة في سجل الصفقة.',[{lbl:'أنشئ بطاقة السائق 👷',run:'driverCard',doneTxt:'شوركت البطاقة'},{lbl:'لا شكراً',ghost:true}],true);
    }
    if(type==='price' && !S.price.agreed){ const m=(this.normDigits(txt).match(/\d[\d,]*/g)||[]).map(x=>parseInt(x.replace(/,/g,''))).find(n=>n>=100);
      if(m) this.aiChip('price','رصدت سعراً في الكلام — <b>'+AR(m)+' ر.س</b>. الكلام يُنسى؛ ورقة العرض لا تُنسى. أنقله لك؟',[{lbl:'انقله إلى ورقة العرض 📄',run:'toPaper',arg:m,doneTxt:'في ورقة العرض الآن'},{lbl:'تجاهل',ghost:true}]);
    }
    if(type==='extend' && S.approved){ this.aiChip('extend','تحتاج تمديداً؟ أجهّز لك طلب تمديد <b>بنفس الشروط المتفق عليها</b> يعتمده المورد بضغطة.',[{lbl:'أنشئ طلب التمديد ⏱',run:'extendReq',doneTxt:'أُرسل الطلب'},{lbl:'ليس الآن',ghost:true}],true);
    } }

  inAppCall(){ this.S.chips.push({kind:'media',who:'me',ic:'📞',name:'مكالمة داخل التطبيق',sub:'صادرة · مسجّلة في سجل الغرفة'}); this.toast('جارٍ الاتصال بالمورد داخل التطبيق…'); this.up(); }

  chSend(txt){ txt=(txt||'').trim(); if(!txt) return; this.S.chips.push({kind:'me',txt}); this.chatMiddleware(txt); this.up(); }

  chSuggest(k){ const T={phone:'كلمني واتساب أسهل — رقمي 0551234567',price:'خلاص نتفق على 2750 باليوم شامل المشغّل؟',extend:'المشروع تأخر شوي — نبغى نمدد أسبوع زيادة',plain:'متى تقدرون توصلون المعدّة للموقع؟'}; this.chSend(T[k]); }

  toggleAtt(){ this.attOpen=!this.attOpen; this.up(); }

  attSend(kind){ this.attOpen=false; const S=this.S;
    if(kind==='addr'){ S.chips.push({kind:'media',who:'me',ic:'📄',name:'العنوان الوطني.pdf',sub:'PDF · ٠٫٨ م.ب'});
      this.aiChip('media-addr','هذا يشبه <b>العنوان الوطني</b> — أضيفه إلى «مستنداتك» في الغرفة بدل أن يضيع في المحادثة؟',[{lbl:'أضفه إلى مستنداتي 🏢',run:'fileAddr',doneTxt:'أُضيف إلى مستنداتك'},{lbl:'مجرد مشاركة',ghost:true}]); }
    else if(kind==='site'){ S.chips.push({kind:'media',who:'me',ic:'🖼️',name:'صورة من موقع المشروع',sub:'JPG · ٢٫١ م.ب'});
      this.aiChip('media-site','صورة من الموقع؟ أثبّتها على <b>خريطة الصفقة</b> كنقطة التسليم ليراها السائق؟',[{lbl:'ثبّتها على الخريطة 📍',run:'pinSite',doneTxt:'ثُبّتت على الخريطة'},{lbl:'تجاهل',ghost:true}]); }
    else { S.chips.push({kind:'media',who:'me',ic:'🎞️',name:'مقطع فيديو',sub:'MP4 · ٥٫٤ م.ب'}); }
    this.up(); }

  simSupplierMedia(){ this.S.chips.push({kind:'media',who:'sup',ic:'📷',name:'شهادة TÜV.jpg',sub:'صورة · من المورد'});
    this.notifyChat('أرسل المورد صورة: شهادة TÜV.jpg');
    this.aiChip('media-tuv','الصورة المرسلة تشبه <b>شهادة TÜV</b> التي طلبتها — أرشفها كإثبات في ملف التوثيق 🛡️ بدل بقائها صورة تضيع في المحادثة؟',[{lbl:'أرشفها كإثبات ✓',run:'fileTuv',doneTxt:'أُرشفت في ملف التوثيق'},{lbl:'تجاهل',ghost:true}]); this.up(); }

  askAvailability(silent){ const S=this.S; if(S.availabilityAsked) return;
    S.availabilityAsked=true; S.docs.forEach(d=>d.askedByMe=true);
    this.narrate('me','طلبتَ تأكيد التوفّر — مع الإشارة لفارق سنة الصنع وطلب إثبات شهادة السلامة (TÜV)');
    this.recomputeStage(); if(!silent){ this.toast('أُرسل الطلب — المورد سيرد في غرفة المحادثة'); this.up(); }
  }

  askProof(){ const d=this.S.docs.find(x=>x.id==='safety'); d.askedByMe=true; this.narrate('me','طلبتَ إثبات '+d.name); this.toast('أُرسل طلب الإثبات'); this.up(); }

  deferDoc(id){ const S=this.S; const d=S.docs.find(x=>x.id===id); d.deferred=true;
    const t={id:'defer-'+id,name:'توثيق '+d.name+' بعد التوقيع',supDefault:'شرط مقترح منك',opts:[],state:'agreed',agreedVal:'مؤجّل كشرط',deferredTerm:true};
    if(!S.terms.find(x=>x.id===t.id)) S.terms.push(t);
    this.narrate('me','اقترحتَ تأجيل توثيق '+d.name+' كشرط في الاتفاق');
    this.recomputeStage(); this.toast('أُضيف كشرط مؤجّل'); this.up();
  }

  acceptFit(){ const S=this.S; if(S.fitAccepted) return; const gaps=this.eqNeeds().join(' · '); S.fitAccepted=true;
    this.narrate('me','قبلتَ الوحدة كما هي رغم: '+gaps); this.recomputeStage(); this.toast('تم قبول الوحدة — التالي: التوثيق'); this.up(); }

  requestEligible(){ const S=this.S; if(S.eligibleAsked) return; S.eligibleAsked=true; const needs=this.eqNeeds();
    this.narrate('me',needs.length?'طلبتَ معدّة مطابقة — حدّد الوكيل المطلوب: '+needs.join(' · '):'طلبتَ معدّة مطابقة إضافية');
    this.recomputeStage(); this.toast('أُرسل الطلب — سيقترح المورد وحدة'); this.up(); }

  pickUnit(i){ const S=this.S; if(i===(S.unitIdx||0)) return; S.unitIdx=i; S.fitAccepted=false; S.eligibleAsked=false;
    const safety=S.docs.find(x=>x.id==='safety'); const u=FLEET[i];
    safety.state=u.certOnFile?'verified':'claimed';
    if(S.price.agreed){ this.resetPriceOnScope(); }
    this.recomputeStage(); this.toast('تم استبدال الوحدة — أُعيد رسم الخريطة'); this.up(); }

  resetPaperState(){ this.cfg={mode:'fixed',frequency:'daily',duration:this.S.days,valid:true}; this.paySel={schedule:'',method:''}; this.cardFace='sup'; this.S.price.draft=this.copyPos(this.supPos()); }

  openQuote(){ if(this.S.price.agreed){ this.activePanel='quote'; this.quoteOpen=true; this.qsStep='paper'; this.up(); return; } this.resetPaperState(); this.quoteOpen=true; this.qsStep='paper'; this.up(); }

  closeQuote(){ this.quoteOpen=false; this.up(); }

  goStep(s){ this.qsStep=s; if(s==='terms') this.initTermSec(); this.up(); }

  onPrice(field,raw){ this.S.price.draft[field]=parseInt(raw)||0; this.up(); }

  toggleRow(field){ const k=field==='mob'?'incMob':'incDemob'; this.S.price.draft[k]=!this.S.price.draft[k]; this.up(); }

  setMode(m){ this.cfg.mode=m; this.up(); }

  setFreq(f){ this.cfg.frequency=f; this.up(); }

  onDuration(raw){ this.cfg.duration=parseFloat(raw)||0; this.cfg.valid=this.cfg.duration>0; this.up(); }

  onPay(field,val){ this.paySel[field]=val; this.up(); }

  payState(field){ const v=this.paySel[field]; if(!v) return 'open'; return v===SUP_PAY[field]?'match':'conflict'; }

  payDecided(){ return this.payState('schedule')!=='open' && this.payState('method')!=='open'; }

  priceDiffNow(){ const d=this.S.price.draft, sp=this.supPos();
    return d.rate!==sp.rate || d.overtime!==sp.overtime || d.incMob!==sp.incMob || d.incDemob!==sp.incDemob || (d.incMob?d.mob:0)!==(sp.incMob?sp.mob:0) || (d.incDemob?d.demob:0)!==(sp.incDemob?sp.demob:0); }

  negotiableTerms(){ return this.S.terms.filter(t=>(t.state==='open'||t.state==='countered')&&t.cat!=='pay'); }

  termSections(){ const by=id=>this.S.terms.find(t=>t.id===id);
    return [
      {key:'equip',icon:'🏗️',label:'المعدّة',ids:['fuel','breakdown_sla']},
      {key:'operator',icon:'👷',label:'المشغّل',ids:['operator_inc','fat_food','fat_stay']},
      {key:'work',icon:'🗓️',label:'العمل',ids:['overtime','night']},
    ].map(s=>Object.assign({},s,{items:s.ids.map(by).filter(Boolean)})); }

  secDone(s){ return s.items.every(it=>it.pending); }

  initTermSec(){ const secs=this.termSections(); this.termSec=secs.findIndex(s=>!this.secDone(s)); }

  toggleTermSec(i){ this.termSec=(this.termSec===i?-1:i); this.up(); }

  maybeAdvanceSection(id){ const secs=this.termSections(); const si=secs.findIndex(s=>s.ids.includes(id)); if(si<0) return;
    if(this.secDone(secs[si])){ let nxt=-1; for(let k=si+1;k<secs.length;k++){ if(!this.secDone(secs[k])){ nxt=k; break; } } this.termSec=nxt; } }

  legendDot(c,t){ return h('div',{key:t,style:{display:'flex',alignItems:'center',gap:'6px'}}, h('span',{style:{width:'10px',height:'10px',borderRadius:'50%',background:c,flexShrink:0}}), h('span',{style:{fontSize:'12px',fontWeight:700,color:C.navy}},t)); }

  termChip(t,v){ const on=t.pending&&t.pending.value===v; const isSup=v===t.supDefault;
    const c=on?(isSup?C.green:C.red):C.navy, bg=on?(isSup?C.greenLt:C.redLt):'#fff', bd=on?(isSup?C.greenBd:C.redBd):C.border;
    return h('button',{key:v,onClick:()=>this.pendTerm(t.id,v),style:{display:'inline-flex',alignItems:'center',gap:'6px',background:bg,border:'1.5px solid '+bd,color:c,borderRadius:'11px',padding:'10px 13px',fontSize:'14px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},
      on?h('span',{style:{fontSize:'13px'}},'✓'):null, v, isSup?h('span',{style:{fontSize:'12px',fontWeight:800,color:on?C.green:C.muted}},'· المورد'):null); }

  termItemCard(t){ const pend=t.pending, st=!pend?'none':(pend.value===t.supDefault?'match':'conflict');
    const col=st==='match'?C.green:st==='conflict'?C.red:C.blue, colLt=st==='match'?C.greenLt:st==='conflict'?C.redLt:C.blueLt, colBd=st==='match'?C.greenBd:st==='conflict'?C.redBd:C.blueBd;
    const pill=st==='match'?'✓ يطابق عرض المورد':st==='conflict'?'↕ يختلف · بديلك':'● بانتظار قرارك';
    const box=(label,val,bg,bd,fg)=>h('div',{style:{flex:1,minWidth:0,background:bg,border:'1.5px solid '+bd,borderRadius:'12px',padding:'11px 13px',textAlign:'center'}},
      h('div',{style:{fontSize:'12px',fontWeight:700,color:C.muted,marginBottom:'4px'}},label),
      h('div',{style:{fontSize:'14px',fontWeight:800,color:fg}},val));
    return h('div',{key:t.id,style:{background:'#fff',border:'1.5px solid '+colBd,borderRadius:'14px',padding:'14px 15px',marginBottom:'10px'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'9px',marginBottom:'3px'}},
        h('span',{style:{width:'9px',height:'9px',borderRadius:'50%',background:col,flexShrink:0}}),
        h('span',{style:{fontSize:'14px',fontWeight:800,color:C.navy,flex:1}},t.name),
        h('span',{style:{fontSize:'12px',fontWeight:800,color:col,background:colLt,border:'1px solid '+col+'44',borderRadius:'100px',padding:'4px 11px',whiteSpace:'nowrap'}},pill)),
      t.desc?h('div',{style:{fontSize:'12px',color:C.muted,fontWeight:600,lineHeight:1.6,marginBottom:'11px'}},t.desc):null,
      h('div',{style:{display:'flex',gap:'10px',marginBottom:'12px'}},
        box('عرض المورد',t.supDefault,C.amberLt,C.amberBd,'#8a4f08'),
        box('ردّك',pend?pend.value:'لم تُقرّر بعد',colLt,colBd,col)),
      h('div',{style:{display:'flex',flexWrap:'wrap',gap:'8px'}}, [t.supDefault].concat(t.opts||[]).map(v=>this.termChip(t,v)))); }

  termSectionCard(s,i){ const n=i+1, done=this.secDone(s), open=this.termSec===i, decided=s.items.filter(it=>it.pending).length;
    return h('div',{key:s.key,style:{border:'1.5px solid '+(done?C.greenBd:open?C.blueBd:C.blt),borderRadius:'16px',marginBottom:'12px',overflow:'hidden',background:'#fff'}},
      h('button',{onClick:()=>this.toggleTermSec(i),style:{width:'100%',display:'flex',alignItems:'center',gap:'12px',background:done?C.greenLt:open?C.blueLt:'#fff',border:'none',padding:'15px 16px',cursor:'pointer',fontFamily:'inherit',textAlign:'start'}},
        h('span',{style:{width:'34px',height:'34px',borderRadius:'50%',background:done?C.green:open?C.blue:C.surface,color:done||open?'#fff':C.muted,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px',fontWeight:800,flexShrink:0}}, done?'✓':AR(n)),
        h('span',{style:{fontSize:'19px',flexShrink:0}},s.icon),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:'14px',fontWeight:800,color:done?C.green:C.navy}},s.label),
          h('div',{style:{fontSize:'12px',fontWeight:700,color:done?C.green:C.muted,marginTop:'2px'}},done?'مكتمل — كل البنود محسومة':('حُسم '+AR(decided)+' من '+AR(s.items.length)))),
        h('span',{style:{fontSize:'16px',color:C.muted,transform:open?'rotate(180deg)':'none',transition:'transform .2s'}},'⌄')),
      open? h('div',{style:{padding:'14px 15px 5px',borderTop:'1px solid '+C.blt}}, s.items.map(t=>this.termItemCard(t))) : null); }

  catGroups(terms){ return CATS.map(c=>({cat:c,items:terms.filter(t=>t.cat===c.key)})).filter(g=>g.items.length); }

  catHead(c,count,note){ return h('div',{key:'h-'+c.key,style:{display:'flex',alignItems:'center',gap:'9px',margin:'4px 0 11px'}},
    h('span',{style:{fontSize:'16px',lineHeight:1}},c.emoji),
    h('span',{style:{fontSize:'12.5px',fontWeight:800,color:C.deep,letterSpacing:'.2px'}},c.label),
    count!=null?h('span',{style:{fontSize:'10px',fontWeight:800,color:C.muted,background:C.s2,border:'1px solid '+C.blt,borderRadius:'100px',padding:'2px 9px'}},AR(count)):null,
    note?h('span',{style:{marginInlineStart:'auto',fontSize:'9.5px',fontWeight:700,color:C.muted}},note):null,
    h('div',{style:{flex:note?0:1,height:'1px',background:C.blt}})); }

  typeBadge(type){ const s=TTYPE[type]||TTYPE.ack; return h('span',{style:{fontSize:'8.5px',fontWeight:800,color:s.c,background:s.bg,border:'1px solid '+s.bd,borderRadius:'100px',padding:'2px 8px',whiteSpace:'nowrap'}},s.lbl); }

  enTag(en){ return en?h('div',{style:{fontSize:'9px',fontWeight:600,color:C.muted,fontFamily:'ui-monospace,SFMono-Regular,monospace',direction:'ltr',textAlign:'start',marginTop:'2px',opacity:.85}},en):null; }

  pendTerm(id,val){ const t=this.S.terms.find(x=>x.id===id); t.pending={state:val===t.supDefault?'agreed':'counter',value:val}; if(val===t.supDefault) this.termAlt[id]=false; this.maybeAdvanceSection(id); this.up(); }

  acceptAllTerms(){ this.negotiableTerms().forEach(t=>{ t.pending={state:'agreed',value:t.supDefault}; this.termAlt[t.id]=false; }); this.termSec=-1; this.up(); }

  toggleTermAlt(id){ this.termAlt[id]=!this.termAlt[id]; this.up(); }

  clearTermPending(id){ const t=this.S.terms.find(x=>x.id===id); delete t.pending; this.termAlt[id]=false; this.up(); }

  qsTermCard(t){ const pend=t.pending; const isMatch=pend&&pend.state==='agreed', isConflict=pend&&pend.state==='counter';
    const showAlt=this.termAlt[t.id]||isConflict;
    const status=isMatch?{t:'✓ مطابق',c:C.green}:isConflict?{t:'⚡ مختلف',c:C.red}:{t:'○ قيد القرار',c:C.muted};
    const border=isMatch?C.greenBd:isConflict?C.redBd:C.blt;
    const bg=isMatch?'linear-gradient(180deg,'+C.greenLt+',#fff 55%)':isConflict?'linear-gradient(180deg,'+C.redLt+',#fff 55%)':'#fff';
    const yb=isMatch?{bg:C.greenLt,bd:C.greenBd,c:C.green,lbl:'✓ مطابق للمورد'}:isConflict?{bg:C.redLt,bd:C.redBd,c:C.red,lbl:'✗ مختلف عن المورد'}:{bg:C.s2,bd:C.border,c:C.muted,lbl:'لم تقرّر بعد'};
    const yourVal=pend?pend.value:'—';
    return h('div',{key:t.id,style:{border:'1.5px solid '+border,background:bg,borderRadius:'14px',padding:'14px',marginBottom:'12px'}},
      h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'10px',marginBottom:'12px'}},
        h('div',{style:{minWidth:0}},
          h('div',{style:{display:'flex',alignItems:'center',gap:'7px'}},h('span',{style:{fontSize:'14px',fontWeight:800,color:C.navy}},t.name),
            this.typeBadge(t.type)),
          this.enTag(t.en),
          t.desc?h('div',{style:{fontSize:'10.5px',color:C.muted,fontWeight:600,marginTop:'3px',lineHeight:1.5}},t.desc):null),
        h('span',{style:{fontSize:'10.5px',fontWeight:800,color:status.c,background:'#fff',border:'1px solid '+status.c+'44',borderRadius:'100px',padding:'4px 11px',whiteSpace:'nowrap',flexShrink:0}},status.t)),
      h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'11px'}},
        h('div',{style:{background:yb.bg,border:'1px solid '+yb.bd,borderRadius:'11px',padding:'11px',textAlign:'center'}},
          h('div',{style:{fontSize:'9px',fontWeight:700,color:yb.c,marginBottom:'4px'}},'ردّك'),
          h('div',{style:{fontSize:'13px',fontWeight:800,color:pend?C.navy:C.muted}},yourVal),
          h('div',{style:{fontSize:'8.5px',fontWeight:700,color:yb.c,marginTop:'3px'}},yb.lbl)),
        h('div',{style:{background:C.amberLt,border:'1px solid '+C.amberBd,borderRadius:'11px',padding:'11px',textAlign:'center'}},
          h('div',{style:{fontSize:'9px',fontWeight:700,color:C.amber,marginBottom:'4px'}},'عرض المورد'),
          h('div',{style:{fontSize:'13px',fontWeight:800,color:'#8a4f08'}},t.supDefault))),
      (this.itemsMode==='multi'&&t.supByItem&&Object.keys(t.supByItem).length)? h('div',{style:{background:'#fff',border:'1px dashed '+C.amberBd,borderRadius:'11px',padding:'10px 12px',marginBottom:'11px'}},
        h('div',{style:{fontSize:'9.5px',fontWeight:800,color:C.amber,marginBottom:'6px'}},'⚡ ردّ المورد بقيمة مختلفة لبند بعينه — قرارك يبقى موحّداً'),
        Object.keys(t.supByItem).map(idx=>h('div',{key:idx,style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',fontSize:'11px',padding:'3px 0'}},
          h('span',{style:{fontWeight:700,color:C.navy}},(FLEET[this.items[idx].unitIdx].spec)),
          h('span',{style:{fontWeight:800,color:'#8a4f08',background:C.amberLt,borderRadius:'6px',padding:'2px 8px'}},t.supByItem[idx])))) : null,
      isMatch? h('div',{style:{display:'flex',alignItems:'center',gap:'10px',background:C.greenLt,border:'1px solid '+C.greenBd,borderRadius:'11px',padding:'11px 13px'}},
        h('span',{style:{fontSize:'15px'}},'✓'),
        h('div',{style:{flex:1,fontSize:'12.5px',fontWeight:800,color:C.green}},'قبلتَ عرض المورد'),
        h('button',{onClick:()=>this.clearTermPending(t.id),style:{background:'#fff',border:'1px solid '+C.border,color:C.muted,borderRadius:'8px',padding:'6px 12px',fontSize:'10.5px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},'تغيير القرار'))
      : !pend? h('div',{style:{display:'flex',gap:'10px'}},
        h('button',{onClick:()=>this.pendTerm(t.id,t.supDefault),style:{flex:1,background:'#fff',color:C.green,border:'1.5px solid '+C.greenBd,borderRadius:'10px',padding:'10px',fontSize:'12px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'✓ اقبل عرض المورد'),
        h('button',{onClick:()=>this.toggleTermAlt(t.id),style:{flex:1,background:showAlt?C.amberLt:'#fff',color:C.amber,border:'1.5px solid '+C.amberBd,borderRadius:'10px',padding:'10px',fontSize:'12px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'↖ اقترح بديلاً'))
      : null,
      showAlt? h('div',{style:{marginTop:'12px',paddingTop:'12px',borderTop:'1px dashed '+C.border}},
        h('div',{style:{fontSize:'10px',fontWeight:700,color:C.red,marginBottom:'8px'}},'⚡ ردّك سيُرسل كاقتراح مختلف للمورّد'),
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:'7px',marginBottom:'10px'}},
          [t.supDefault].concat(t.opts).map(o=>{ const on=pend&&pend.value===o; const acc=o===t.supDefault;
            return h('button',{key:o,onClick:()=>this.pendTerm(t.id,o),style:{background:on?(acc?C.green:C.red):'#fff',color:on?'#fff':(acc?C.green:C.navy),border:'1.5px solid '+(on?(acc?C.green:C.red):(acc?C.greenBd:C.border)),borderRadius:'9px',padding:'8px 14px',fontSize:'11.5px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},(acc?'✓ ':'')+o+(acc?' (عرض المورد)':'')); })),
        h('button',{onClick:()=>this.clearTermPending(t.id),style:{background:'none',border:'none',color:C.muted,fontSize:'11px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',textDecoration:'underline'}},'↺ تراجع / أعد الفتح')) : null);
  }

  setQty(d){ const before=this.S.qty;
    this.S.qty=Math.max(1,Math.min(4,this.S.qty+d));
    this.resetPriceOnScope();
    // The quotation counter does NOT name machines. Which specific units are supplied is settled with
    // the supplier in chat, not bound here — so changing the count opens nothing.
    this.up();
  }

  openUnitPick(){ const s=this.curSup(); if(!s) return;
    if(!this.pickSel) this.pickSel={};
    const key=s.id;
    if(!this.pickSel[key]){ // default: pre-tick up to the agreed count, in order
      const sel={}; unitsOf(s).forEach((u,i)=>{ if(i<this.S.qty) sel[i]=true; });
      this.pickSel[key]=sel;
    }
    this.unitPick=true; this.up();
  }

  pickedCount(){ const s=this.curSup(); if(!s||!this.pickSel||!this.pickSel[s.id]) return 0;
    return Object.keys(this.pickSel[s.id]).filter(k=>this.pickSel[s.id][k]).length; }

  pickedSerialsLabel(){ const s=this.curSup(); if(!s) return '—';
    const us=unitsOf(s), sel=(this.pickSel&&this.pickSel[s.id])||{};
    const picked=us.filter((u,i)=>sel[i]);
    const rest=Math.max(0,this.S.qty-picked.length);
    if(!picked.length) return rest?('لم تُحدَّد بعد — '+AR(rest)+' وحدات يحدّدها المورد'):'—';
    return picked.map(u=>u.serial).join(' · ') + (rest?(' · + '+AR(rest)+' يحدّدها المورد'):'');
  }

  togglePick(i){ const s=this.curSup(); if(!s) return;
    const sel=this.pickSel[s.id]||{}; sel[i]=!sel[i]; this.pickSel[s.id]=sel; this.up(); }

  setOp(v){ this.S.operator=v; this.resetPriceOnScope(); this.up(); }

  resetPriceOnScope(){ const S=this.S; if(S.price.agreed) this.toast('تغيّر النطاق — أعيد فتح السعر');
    S.price.agreed=null; S.price.agreedPos=null; S.price.rounds=[]; S.price.turn='rentee'; S.price.draft=this.copyPos(S.price.sup); this.cardFace='sup'; this.recomputeStage(); }

  submitResponse(){ const S=this.S;
    const accepts=S.terms.filter(t=>t.pending&&t.pending.state==='agreed');
    const counters=S.terms.filter(t=>t.pending&&t.pending.state==='counter');
    const pd=this.priceDiffNow();
    accepts.forEach(t=>{ t.state='agreed'; t.agreedVal=t.pending.value; delete t.pending; });
    if(!pd && counters.length===0){ this.acceptPrice(); this.qsStep='paper'; this.closeQuote(); return; }
    counters.forEach(t=>{ t.state='countered'; t.agreedVal=null; t.myVal=t.pending.value; delete t.pending; });
    S.price.rounds.push({who:'me',pos:this.copyPos(S.price.draft),total:this.posTotal(S.price.draft),terms:counters.map(t=>({name:t.name,value:t.myVal}))});
    S.price.turn='supplier'; this.cardFace='me';
    this.narrate('me','أرسلتَ ردّك — '+(pd?'عرض مضاد '+AR(this.posTotal(S.price.draft))+' ر.س':'قبول السعر')+(accepts.length?' · قبول '+AR(accepts.length)+' بنود':'')+(counters.length?' · تعديل '+AR(counters.length)+' بنود':''));
    this.recomputeStage(); this.qsStep='paper'; this.closeQuote(); this.toast('أُرسل ردّك للمورد'); }

  acceptPrice(){ const sp=this.supPos(); const S=this.S; S.price.agreed=this.posTotal(sp); S.price.agreedPos=this.copyPos(sp); S.price.draft=this.copyPos(sp); this.cardFace='sup';
    this.narrate('me','قبلتَ السعر: '+AR(S.price.agreed)+' ر.س'); this.recomputeStage(); this.toast('تم قبول السعر'); }

  acceptTerm(id){ const t=this.S.terms.find(x=>x.id===id); t.state='agreed'; t.agreedVal=t.supDefault; this.narrate('me','قبلتَ بند '+t.name+': '+t.supDefault); this.recomputeStage(); this.up(); }

  counterTerm(id,opt){ const t=this.S.terms.find(x=>x.id===id); t.state='agreed'; t.agreedVal=opt+' (بديلك)'; this.narrate('me','عدّلتَ بند '+t.name+' إلى: '+opt); this.recomputeStage(); this.up(); }

  approveDeal(){ if(!this.allDone()) return; this.S.approved=true; this.S.stage='closed';
    this.narrate('me','اعتمدتَ الاتفاق ✓ — الدفعة الأولى عند التسليم'); this.toast('الاتفاق معتمد 🎉'); this.up(); }

  supplierConfirm(silent){ const S=this.S; S.availabilityConfirmed=true; S.docs[0].state='verified';
    this.narrate('sup','المورد أكّد التوفّر والموقع ✓ ('+this.curUnit().km+' كم عن مشروعك) ووثّق TÜV عبر الوكيل'); this.recomputeStage(); if(!silent) this.up(); }

  supplierCounter(silent){ const my=this.myLastRound(); if(!my) return; const sp=this.supPos(); const S=this.S;
    const pos=this.copyPos(my.pos);
    pos.rate=Math.round((my.pos.rate+sp.rate)/2/25)*25;
    pos.incMob=my.pos.incMob; pos.mob=my.pos.incMob?sp.mob:0;
    pos.incDemob=my.pos.incDemob; pos.demob=my.pos.incDemob?sp.demob:0;
    const moves=[];
    if(pos.rate!==sp.rate) moves.push('⬇ خفّض الإيجار اليومي إلى '+AR(pos.rate)+' ر.س');
    if(!pos.incMob&&sp.incMob) moves.push('✓ وافق على استبعاد التعبئة');
    if(!pos.incDemob&&sp.incDemob) moves.push('✓ وافق على استبعاد الإرجاع');
    S.price.rounds.push({who:'sup',pos,total:this.posTotal(pos),moves});
    S.price.turn='rentee'; this.cardFace='sup';
    this.narrate('sup','المورد ردّ بعرض مقابل: '+AR(this.posTotal(pos))+' ر.س'); this.recomputeStage(); if(!silent) this.up(); }

  supComputeCounter(){ const my=this.myLastRound(), sp=this.supPos(); const pos=this.copyPos(my.pos);
    pos.rate=Math.round((my.pos.rate+sp.rate)/2/25)*25;
    pos.incMob=my.pos.incMob; pos.mob=my.pos.incMob?sp.mob:0;
    pos.incDemob=my.pos.incDemob; pos.demob=my.pos.incDemob?sp.demob:0;
    return pos; }

  supPushCounter(pos){ const my=this.myLastRound(), sp=this.supPos(), S=this.S;
    const moves=[];
    if(pos.rate!==my.pos.rate) moves.push(pos.rate<my.pos.rate?'⬇ عدّل الإيجار إلى '+AR(pos.rate)+' ر.س':'↺ تمسّك بإيجار '+AR(pos.rate)+' ر.س');
    if(!pos.incMob&&sp.incMob) moves.push('✓ وافق على استبعاد التعبئة');
    if(!pos.incDemob&&sp.incDemob) moves.push('✓ وافق على استبعاد الإرجاع');
    if(pos.incMob&&pos.mob!==my.pos.mob) moves.push('↺ تمسّك بسعر التعبئة '+AR(pos.mob)+' ر.س');
    S.price.rounds.push({who:'sup',pos,total:this.posTotal(pos),moves});
    S.price.turn='rentee'; this.cardFace='sup';
    this.narrate('sup','المورد ردّ بعرض مقابل: '+AR(this.posTotal(pos))+' ر.س'); this.recomputeStage(); }

  openSupplierView(){ const S=this.S;
    if(S.stage==='asked'){ this.supView='availability'; }
    else if(S.price.turn==='supplier' && !S.price.agreed){ this.supView='price'; this.supDraft=this.supComputeCounter(); this.supTermDec={}; }
    else { this.toast('لا يوجد طلب معلّق يحتاج ردّ المورد'); return; }
    this.supViewOpen=true; this.up(); }

  closeSupplierView(){ this.supViewOpen=false; this.up(); }

  onSupDraft(field,raw){ this.supDraft[field]=parseInt(raw)||0; this.up(); }

  supToggle(field){ const k=field==='mob'?'incMob':'incDemob'; this.supDraft[k]=!this.supDraft[k]; this.up(); }

  supConfirmFromView(){ this.supplierConfirm(true); this.supViewOpen=false; this.toast('المورد أكّد التوفّر ✓'); this.up(); }

  supAcceptFromView(){ this.supplierAcceptPrice(true); this.supViewOpen=false; this.toast('المورد قبِل عرضك'); this.up(); }

  supSetTerm(id,dec){ this.supTermDec[id]=dec; this.up(); }

  supSendCounterFromView(){ const S=this.S;
    S.terms.filter(t=>t.state==='countered').forEach(t=>{ const dec=this.supTermDec[t.id];
      if(dec==='accept'){ t.state='agreed'; t.agreedVal=t.myVal+' (قبله المورد)'; }
      else if(dec==='hold'){ t.state='open'; t.agreedVal=null; t.myVal=null; t.supHeld=true; } });
    this.supPushCounter(this.copyPos(this.supDraft)); this.supViewOpen=false; this.toast('المورد أرسل ردّه — دورك الآن'); this.up(); }

  supplierAcceptPrice(silent){ const my=this.myLastRound(); const S=this.S; const pos=my?my.pos:this.copyPos(this.supPos());
    S.price.agreed=this.posTotal(pos); S.price.agreedPos=this.copyPos(pos); S.price.turn='rentee'; this.cardFace='sup';
    const ct=S.terms.filter(t=>t.state==='countered'); ct.forEach(t=>{ t.state='agreed'; t.agreedVal=t.myVal+' (قبله المورد)'; });
    this.narrate('sup','المورد وافق على عرضك: '+AR(S.price.agreed)+' ر.س'+(ct.length?' — وقبل تعديلاتك':'')); this.recomputeStage(); if(!silent) this.up(); }

  simulate(){ const S=this.S;
    if(S.stage==='asked'){ this.supplierConfirm(); this.toast('ردّ المورد: التوفّر مؤكّد'); }
    else if(S.price.turn==='supplier' && !S.price.agreed){ if(!this.supHasCountered()){ this.supplierCounter(); this.toast('ردّ المورد: عرض مقابل'); } else { this.supplierAcceptPrice(); this.toast('ردّ المورد: قبل عرضك'); } }
    else { this.toast('لا يوجد رد معلّق من المورد'); }
    this.up(); }

  canSimulate(){ const S=this.S; return S.stage==='asked' || (S.price.turn==='supplier'&&!S.price.agreed); }

  setEntry(k){ this.entry=k;
    if(this.itemsMode==='multi'){ this.buildMulti(); this.activeItem=0; this.S=this.items[0]; this.items.forEach(st=>this.applyEntryTo(st,k)); }
    else { this.S=freshState(); this.applyEntryTo(this.S,k); }
    this.cfg={mode:'fixed',frequency:'daily',duration:this.S.days,valid:true}; this.paySel={schedule:'',method:''}; this.quoteOpen=false; this.activePanel=null; this.verifTab='equip';
    this.recomputeStage(); this.up(); }

  applyEntryTo(st,k){ const save=this.S; this.S=st;
    if(k==='b'){ this.askAvailability(true); this.supplierConfirm(true); }
    if(k==='neg'){ this.askAvailability(true); this.supplierConfirm(true); st.fitAccepted=true; st.price.draft={rate:st.price.sup.rate-250,mob:MOB,demob:DEMOB,incMob:true,incDemob:false};
      st.price.rounds.push({who:'me',pos:this.copyPos(st.price.draft),total:this.posTotal(st.price.draft)}); st.price.turn='supplier'; this.cardFace='me';
      this.narrate('me','أرسلتَ عرضاً مضاداً'); }
    this.recomputeStage(); this.S=save; }

  setItemsMode(m){ if(m===this.itemsMode) return; this.itemsMode=m; this.setEntry(this.entry); }

  buildMulti(){ const shared=freshState().terms; this.sharedTerms=shared;
    const chat=[{who:'sup',txt:'تمت مطابقة معدّاتك تلقائياً مع بنود هذا الطلب ('+RFQ_ID+')'}];
    this.items=MULTI_ITEMS.map(d=>{ const st=freshState(); st.unitIdx=d.fleet; st.qty=d.qty; st.icon=d.icon; st.terms=shared; st.chips=chat; st.price.sup.rate=d.supRate; return st; });
    // supplier countered one shared term differently on the generator only (per-item counter, rentee side stays single)
    const sla=shared.find(t=>t.id==='breakdown_sla'); if(sla) sla.supByItem={1:'٤٨ ساعة'};
  }

  switchItem(i){ if(this.itemsMode!=='multi') return; this.activeItem=i; this.S=this.items[i]; this.activePanel=this.activePanel==='chat'?'chat':this.activePanel; this.up(); }

  reqLabel(){ return this.itemsMode==='multi'?RFQ_ID:REQ_ID; }

  reset(){ this.setEntry('c'); }

  guide(){ const S=this.S;
    if(S.stage==='closed') return {parts:['الاتفاق معتمد ',['a','✓'],' — الدفعة الأولى عند التسليم'],cta:'تفاصيل الدفع',cls:'done',act:()=>this.openAgree()};
    if(!S.availabilityAsked) return {parts:['غرفة جديدة — ',['a','اطلب تأكيد التوفّر من المورد'],' (يشير لفارق سنة الصنع ويطلب شهادة السلامة)'],cta:'اطلب تأكيد التوفّر',cls:'',act:()=>this.askAvailability()};
    if(!S.availabilityConfirmed) return {parts:['طلبك أُرسل — ',['a','بانتظار تأكيد المورد للتوفّر والموقع'],' · استخدم «محاكاة ردّ المورد»'],cta:null,cls:'wait',act:()=>{}};
    if(this.fitGateOpen()) return {parts:['⚠ ',['w',this.eqNeeds().join(' · ')],' — راجع المعدّة وقرّر'],cta:'راجع المعدّة',cls:'warn',act:()=>this.openDrawer('equip')};
    if(this.trustOpenCount()>0) return {parts:[['w',AR(this.trustOpenCount())+' مستندات'],' بانتظار طلبك — افحصها الآن'],cta:'افحص المستندات',cls:'',act:()=>this.openDrawer('verif')};
    if(!S.price.agreed && S.price.turn==='rentee' && this.supHasCountered()) return {parts:['المورد ردّ ',['a','بعرض مقابل '+AR(this.currentAsk())+' ر.س'],' — افتح العرض وقرّر'],cta:'افتح العرض',cls:'',act:()=>this.openQuote()};
    if(!S.price.agreed && S.price.turn==='rentee') return {parts:['المستندات مكتملة ✓ — ',['a','افتح عرض الأسعار وردّ']],cta:'افتح العرض',cls:'',act:()=>this.openQuote()};
    if(!S.price.agreed && S.price.turn==='supplier') return {parts:['عرضك المضاد '+AR(this.myLastRound().total)+' ر.س لدى المورد — ',['a','بانتظار رده']],cta:null,cls:'wait',act:()=>this.openQuote()};
    if(S.terms.some(t=>t.state==='open')) return {parts:['السعر متفق ✓ — ',['a','تبقّى '+AR(S.terms.filter(t=>t.state==='open').length)+' بنود شروط في التفاوض']],cta:'افتح التفاوض',cls:'',act:()=>this.openQuote()};
    return {parts:['كل شيء جاهز — ',['a','راجع الاتفاق']],cta:'اعتمد الاتفاق',cls:'done',act:()=>this.openAgree()};
  }

  openAgree(){ this.agreeOpen=true; this.up(); }

  closeAgree(){ this.agreeOpen=false; this.up(); }

  openSupplier(){ this.supplierOpen=true; this.up(); }

  closeSupplier(){ this.supplierOpen=false; this.up(); }

  reopenTerm(id){ const t=this.S.terms.find(x=>x.id===id); if(t.deferredTerm) return; t.state='open'; t.agreedVal=null; delete t.pending; this.narrate('me','أعدتَ فتح بند '+t.name); this.recomputeStage(); this.up(); }

  modalShell(title,sub,icon,body,onClose,width){ return h('div',{style:{position:'fixed',inset:0,zIndex:150,display:'flex',alignItems:'center',justifyContent:'center',padding:'28px'}},
    h('div',{onClick:onClose,style:{position:'absolute',inset:0,background:'rgba(9,20,34,.55)',animation:'dpFade .2s'}}),
    h('div',{style:{position:'relative',width:(width||'560px'),maxWidth:'100%',maxHeight:'100%',background:'#fff',borderRadius:'20px',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 30px 70px rgba(9,20,34,.4)',animation:'dpModal .25s'}},
      h('div',{style:{flexShrink:0,padding:'16px 20px',borderBottom:'1px solid '+C.blt,display:'flex',alignItems:'center',gap:'12px'}},
        h('div',{style:{width:'40px',height:'40px',borderRadius:'11px',background:C.blueLt,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'19px'}},icon),
        h('div',{style:{flex:1}},h('div',{style:{fontSize:'15px',fontWeight:700,color:C.navy}},title),sub?h('div',{style:{fontSize:'11px',color:C.muted,fontWeight:500}},sub):null),
        h('button',{onClick:onClose,style:{width:'32px',height:'32px',borderRadius:'50%',background:C.surface,border:'1px solid '+C.border,color:C.muted,cursor:'pointer',fontSize:'15px'}},'✕')),
      h('div',{style:{flex:1,overflowY:'auto'}}, body))); }

  supTermCard(t){ const dec=this.supTermDec[t.id];
    const bd=dec==='accept'?C.greenBd:dec==='hold'?C.amberBd:C.blt;
    const bg=dec==='accept'?C.greenLt:dec==='hold'?C.amberLt:'#fff';
    return h('div',{key:t.id,style:{border:'1.5px solid '+bd,background:bg,borderRadius:'13px',padding:'13px',marginBottom:'10px'}},
      h('div',{style:{marginBottom:'3px'}},
        h('div',{style:{display:'flex',alignItems:'center',gap:'7px'}},h('span',{style:{fontSize:'13px',fontWeight:800,color:C.navy}},t.name),this.typeBadge(t.type)),
        this.enTag(t.en)),
      h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',margin:'9px 0'}},
        h('div',{style:{background:C.blueLt,border:'1px solid '+C.blueBd,borderRadius:'11px',padding:'11px',textAlign:'center'}},h('div',{style:{fontSize:'9px',fontWeight:700,color:C.blue,marginBottom:'4px'}},'اقتراح المستأجر'),h('div',{style:{fontSize:'13px',fontWeight:800,color:C.navy}},t.myVal||'—')),
        h('div',{style:{background:C.amberLt,border:'1px solid '+C.amberBd,borderRadius:'11px',padding:'11px',textAlign:'center'}},h('div',{style:{fontSize:'9px',fontWeight:700,color:C.amber,marginBottom:'4px'}},'عرضك الأصلي'),h('div',{style:{fontSize:'13px',fontWeight:800,color:'#8a4f08'}},t.supDefault))),
      h('div',{style:{display:'flex',gap:'10px'}},
        h('button',{onClick:()=>this.supSetTerm(t.id,'accept'),style:{flex:1,background:dec==='accept'?C.green:'#fff',color:dec==='accept'?'#fff':C.green,border:'1.5px solid '+C.greenBd,borderRadius:'10px',padding:'10px',fontSize:'11.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'✓ اقبل اقتراح المستأجر'),
        h('button',{onClick:()=>this.supSetTerm(t.id,'hold'),style:{flex:1,background:dec==='hold'?C.amber:'#fff',color:dec==='hold'?'#fff':C.amber,border:'1.5px solid '+C.amberBd,borderRadius:'10px',padding:'10px',fontSize:'11.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'↩ تمسّك بعرضك')));
  }

  rSupplierChip(){ const s=this.curSup();
    if(!s) return h('div',{style:{display:'flex',alignItems:'center',gap:'9px'}},
      h('div',{style:{width:'32px',height:'32px',borderRadius:'10px',background:C.blueLt,border:'1px solid '+C.blueBd,color:C.blue,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px'}},'🗺️'),
      h('div',{style:{textAlign:'start'}},
        h('div',{style:{fontSize:'12.5px',fontWeight:700,color:C.deep}},'عروض المورّدين'),
        h('div',{style:{fontSize:'9.5px',color:C.muted,fontWeight:600,marginTop:'1px'}},AR(this.bidsFor().length)+' عرض على الخريطة')));
    return h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},

      h('button',{onClick:()=>this.openSupplier(),style:{display:'flex',alignItems:'center',gap:'9px',background:'#fff',border:'1px solid '+C.blt,borderRadius:'11px',padding:'6px 12px 6px 8px',cursor:'pointer',fontFamily:'inherit'}},
        h('div',{style:{width:'30px',height:'30px',borderRadius:'50%',background:s.verified?C.green:C.amber,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'12px',flexShrink:0}},s.initials),
        h('div',{style:{textAlign:'start'}},
          h('div',{style:{fontSize:'12px',fontWeight:700,color:C.deep,display:'flex',gap:'4px',alignItems:'center'}},s.name,s.verified?h('span',{style:{color:C.green,fontSize:'10px'}},'✓'):null),
          h('div',{style:{fontSize:'9.5px',color:C.muted,fontWeight:500,marginTop:'1px'}},
            this.isOff(s) ? ('من خارج المنصّة · '+s.city) : (s.deals+' صفقة · '+s.city))),
        h('span',{style:{fontSize:'13px',color:C.border,marginInlineStart:'2px'}},'⌄')));
  }

  rRoundsLog(){ const p=this.S.price; if(!p.rounds.length) return null;
    const row=(who,label,total,moves,color)=>h('div',{key:label+total,style:{padding:'9px 0',borderBottom:'1px solid '+C.blt}},
      h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px'}},
        h('span',{style:{fontSize:'11.5px',fontWeight:700,color:color}},label),
        h('b',{style:{fontSize:'12.5px',color:C.deep}},fmtEN(total)+' ر.س')),
      moves&&moves.length?h('div',{style:{fontSize:'10px',color:C.muted,marginTop:'5px',lineHeight:1.7}},moves.join(' · ')):null);
    return h('div',{style:{background:C.s2,borderRadius:'13px',padding:'12px 14px',marginBottom:'16px'}},
      h('div',{style:{fontSize:'11px',fontWeight:700,color:C.muted,marginBottom:'4px'}},'جولات التفاوض ('+AR(p.rounds.length+1)+')'),
      row('sup','المورد — العرض الافتتاحي',this.posTotal(p.sup),null,C.green),
      p.rounds.map(r=>row(r.who,r.who==='me'?'أنت — عرض مضاد':'المورد — عرض مقابل',r.total,r.moves,r.who==='me'?C.blue:C.green)));
  }

  scheduleResponse(c){ clearTimeout(this._simT); this._simT=setTimeout(()=>this.simulateResponse(c),4200); }

  simNewBid(){
    if(this._bidLanded) { this.toast('العرض الجديد وصل بالفعل'); return; }
    this._bidLanded=true;
    SUPPLIERS.push(INCOMING_BID);
    if(this.itemsMode==='multi'){ const i=SUPPLIERS.length-1; ITEM_BIDS.forEach(ids=>ids.push(i)); }
    this.freshBid=SUPPLIERS.length-1;          // drives the "just arrived" highlight
    clearTimeout(this._freshT);
    this._freshT=setTimeout(()=>{ this.freshBid=null; this.up(); },9000);
    // It is cheaper than the cheapest existing offer, so the cheapest-first sort must MOVE it to the
    // top on its own. If it merely appended, the sort would be decorative.
    if(this.map) this.updateLeaflet(true);
    this.logArrival({kind:'bid',supIdx:SUPPLIERS.length-1,supName:INCOMING_BID.name,
      ref:null,serial:null,txt:toAr(INCOMING_BID.rate)+' ر.س / يوم · '+INCOMING_BID.city,read:false});
    this.notifyBid(INCOMING_BID);
    this.up();
  }

  notifyBid(s){
    // Rank it against the offers that were already on the list, excluding itself.
    const others=SUPPLIERS.filter(x=>x!==s&&typeof x.rate==='number').map(x=>x.rate);
    const best=others.length?Math.min.apply(null,others):null;
    const cmp = best==null ? ''
      : s.rate<best ? ' — أقل سعر في العروض'
      : ' — أعلى من أقل سعر بـ '+toAr(s.rate-best)+' ر.س';
    this.notif={txt:'عرض جديد من '+s.name+' · '+toAr(s.rate)+' ر.س / يوم'+cmp,
      ref:null,serial:null,scope:null,resolution:'bid',bidName:s.name,supIdx:SUPPLIERS.indexOf(s)};
    clearTimeout(this._nT); this._nT=setTimeout(()=>{ this.notif=null; this.up(); },8000);
  }

  logArrival(e){ this.arrivals=this.arrivals||[]; this.arrivals.unshift(e);
    if(!e.read) this.bubbleHidden=false;   // a dismissal silences one arrival, never the next
  }

  latestArrival(){ return this.pendingArrivals()[0]||null; }

  clearArrivalsFor(i){ (this.arrivals||[]).forEach(function(a){ if(a.supIdx===i) a.read=true; }); }

  arrivalKindLabel(k){ return ({reply:'رد على طلبك',refusal:'رفض طلبك',chat:'رسالة جديدة',bid:'عرض جديد'})[k]||'إشعار'; }

  hideBubble(){ this.bubbleHidden=true; this.up(); }

  revealBid(i){
    this.dismissNotifQuiet();
    this.setBidSort('price');          // the row is only findable if the list is in a known order
    this.flashBid=i;
    clearTimeout(this._flashT);
    this._flashT=setTimeout(()=>{ this.flashBid=null; this.up(); },2400);
    this.up();
    const s=SUPPLIERS[i];
    if(s) setTimeout(()=>{ const el=document.getElementById('bidrow-'+s.id);
      if(el&&el.scrollIntoView) el.scrollIntoView({block:'center',behavior:'smooth'}); },60);
  }

  notifyChat(txt){
    this.S.newInChat=true;
    const sup=this.curSup(); const chatVisible=this.drawerOpen&&this.activePanel==='chat';
    this.logArrival({kind:'chat',supIdx:this.selSup,supName:sup?sup.name:'المورد',
      ref:null,serial:null,txt:txt,read:chatVisible});
    if(chatVisible){ this.S.newInChat=false; this.up(); return; }
    this.unread=(this.unread||0)+1;
    this.notif={txt,ref:null,serial:null,scope:null,resolution:'chat'};
    clearTimeout(this._nT); this._nT=setTimeout(()=>{ this.notif=null; this.up(); },7000);
    this.up();
  }

  simSupplierChat(){ this.S.chips.push({who:'sup',kind:'sup',txt:'المعدّة جاهزة، وأستطيع تقديم المشغّل أيضاً إن رغبت.'});
    this.notifyChat('المعدّة جاهزة، وأستطيع تقديم المشغّل أيضاً إن رغبت.'); }

  notify(txt,c,res){ this.notif={txt,ref:c.ref,serial:c.serial,scope:c.scope,resolution:res};
    clearTimeout(this._nT); this._nT=setTimeout(()=>{ this.notif=null; this.up(); },7000); this.up(); }

  dismissNotif(){ clearTimeout(this._nT); this.notif=null; this.up(); }

  openChatFromNotif(){ this.dismissNotif(); this.unread=0; this.openDrawer('chat'); }

  rTopActions(){ const can=this.canSimulate();
    return h('div',{style:{display:'flex',alignItems:'center',gap:'10px'}},
      h('button',{onClick:()=>this.openSupplierView(),disabled:!can,style:{display:'flex',alignItems:'center',gap:'7px',background:can?C.deep:C.surface,color:can?'#fff':C.muted,border:'none',borderRadius:'11px',padding:'10px 16px',fontSize:'12.5px',fontWeight:700,cursor:can?'pointer':'default',fontFamily:'inherit'}},'👁 محاكاة شاشة المورد'),
      h('button',{onClick:()=>this.startTour(),title:'جولة تعريفية',style:{width:'38px',height:'38px',borderRadius:'11px',background:'#fff',border:'1px solid '+C.border,color:C.muted,fontSize:'15px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',flexShrink:0}},'؟'),
      h('button',{onClick:()=>this.reset(),style:{background:'none',border:'1.5px dashed '+C.border,color:C.muted,borderRadius:'11px',padding:'10px 14px',fontSize:'12px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}},'↺ إعادة'));
  }

  rChecklist(){ const cl=this.checklist(), [done,total]=this.progress();
    const active=this.activePanel;
    return h('div',{style:{background:'#fff',border:'1px solid '+C.blt,borderRadius:'16px',padding:'14px',marginBottom:'14px'}},
      h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'11px'}},
        h('div',{style:{fontSize:'12px',fontWeight:700,color:C.navy}},'مسار الإغلاق'),
        h('div',{style:{fontSize:'11px',fontWeight:700,color:C.muted}},AR(done)+' / '+AR(total))),
      h('div',{style:{height:'5px',borderRadius:'3px',background:C.blt,marginBottom:'12px',overflow:'hidden'}},
        h('div',{style:{height:'100%',width:(done/total*100)+'%',background:C.green,borderRadius:'3px',transition:'width .4s'}})),
      h('div',{style:{display:'flex',flexDirection:'column',gap:'6px'}},
        cl.map((it,i)=>{ const isActive=active===it.panel||(it.panel==='quote'&&active==='quote');
          return h('button',{key:it.key,onClick:()=>{ if(it.panel==='quote') this.openQuote(); else {this.activePanel=it.panel;this.up();} },
            style:{display:'flex',alignItems:'center',gap:'10px',background:isActive?C.blueLt:'transparent',border:'1px solid '+(isActive?C.blueBd:'transparent'),borderRadius:'10px',padding:'8px 9px',cursor:'pointer',fontFamily:'inherit',textAlign:'start'}},
            h('span',{style:{width:'22px',height:'22px',borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,background:it.ok?C.green:(isActive?C.blue:C.surface),color:it.ok||isActive?'#fff':C.muted}}, it.ok?'✓':AR(i+1)),
            h('span',{style:{flex:1,fontSize:'12.5px',fontWeight:600,color:it.ok?C.muted:C.navy}},it.label),
            h('span',{style:{fontSize:'13px',color:C.border}},'‹')); })));
  }

  rSupplierMini(){
    const openS=()=>{ this.activePanel='supplier'; this.up(); };
    return h('button',{onClick:openS,style:{width:'100%',background:'#fff',border:'1px solid '+C.blt,borderRadius:'16px',padding:'13px',display:'flex',alignItems:'center',gap:'11px',cursor:'pointer',fontFamily:'inherit',textAlign:'start'}},
      h('div',{style:{width:'42px',height:'42px',borderRadius:'50%',background:C.green,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'14px',flexShrink:0}},'أخ'),
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{fontSize:'13px',fontWeight:700,color:C.deep,display:'flex',alignItems:'center',gap:'5px'}},'أبراج الخليج للمعدات',h('span',{style:{color:C.green,fontSize:'11px'}},'✓')),
        h('div',{style:{fontSize:'10.5px',color:C.muted,fontWeight:500,marginTop:'2px'}},'★ ٤٫٨ · ١٢ صفقة · ٩٦٪ التزام')),
      h('span',{style:{fontSize:'15px',color:C.border}},'‹'));
  }

  rModeToggle(){ const modes=[['single','بند واحد'],['multi','عدّة بنود']];
    return h('div',{style:{display:'flex',alignItems:'center',gap:'6px'}},
      h('span',{style:{fontSize:'10px',fontWeight:700,color:C.muted}},'الطلب:'),
      h('div',{style:{display:'flex',background:C.surface,border:'1px solid '+C.border,borderRadius:'9px',padding:'2px'}},
        modes.map(o=>h('button',{key:o[0],onClick:()=>this.setItemsMode(o[0]),
          style:{background:this.itemsMode===o[0]?'#fff':'transparent',color:this.itemsMode===o[0]?C.blue:C.muted,border:this.itemsMode===o[0]?'1px solid '+C.blueBd:'1px solid transparent',boxShadow:this.itemsMode===o[0]?'0 1px 2px rgba(15,34,56,.08)':'none',borderRadius:'7px',padding:'6px 11px',fontSize:'11px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},o[1]))));
  }

  rDevBar(){ const opts=[['c','غير مؤكّد'],['b','مؤكّد'],['neg','قيد التفاوض']];
    const can=this.canSimulate();
    return h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:'14px',padding:'7px 22px',background:'#EAF0F6',borderBottom:'1px solid '+C.border,zIndex:31}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'6px',flexShrink:0}},
        h('span',{style:{fontSize:'9.5px',fontWeight:800,color:C.muted,letterSpacing:'.04em'}},'⚙ عرض توضيحي')),
      h('div',{style:{width:'1px',height:'20px',background:C.border,flexShrink:0}}),
      h('div',{style:{display:'flex',alignItems:'center',gap:'6px'}},
        h('span',{style:{fontSize:'10px',fontWeight:700,color:C.muted}},'سيناريو:'),
        opts.map(o=>h('button',{key:o[0],onClick:()=>this.setEntry(o[0]),
          style:{background:this.entry===o[0]?C.deep:'#fff',color:this.entry===o[0]?'#fff':C.navy,border:'1px solid '+(this.entry===o[0]?C.deep:C.border),borderRadius:'8px',padding:'6px 11px',fontSize:'11px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}},o[1]))),
      h('div',{style:{flex:1}}),
      h('button',{onClick:()=>this.openSupplierView(),disabled:!can,style:{display:'flex',alignItems:'center',gap:'7px',background:can?C.deep:'#fff',color:can?'#fff':C.muted,border:can?'none':'1px solid '+C.border,borderRadius:'10px',padding:'8px 14px',fontSize:'12px',fontWeight:700,cursor:can?'pointer':'default',fontFamily:'inherit'}},'👁 محاكاة شاشة المورد'),
      h('button',{onClick:()=>this.startTour(),title:'جولة تعريفية',style:{width:'34px',height:'34px',borderRadius:'10px',background:'#fff',border:'1px solid '+C.border,color:C.muted,fontSize:'14px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',flexShrink:0}},'؟'),
      h('button',{onClick:()=>this.reset(),style:{background:'none',border:'1.5px dashed '+C.border,color:C.muted,borderRadius:'10px',padding:'8px 13px',fontSize:'11.5px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}},'↺ إعادة'));
  }

  guideFocusPanel(){ return 'equip'; }

  effectivePanel(){ return this.activePanel||this.guideFocusPanel(); }

  rRouteSummary(){ const conf=this.S.availabilityConfirmed, u=this.curUnit();
    return h('div',{style:{background:'#fff',border:'1px solid '+C.blt,borderRadius:'14px',padding:'14px',marginBottom:'12px'}},
      h('div',{style:{fontSize:'10.5px',fontWeight:700,color:C.muted,marginBottom:'11px',letterSpacing:'.3px'}},'من ← إلى'),
      h('div',{style:{display:'flex',alignItems:'center',gap:'9px',fontSize:'12.5px',fontWeight:600,color:C.deep,marginBottom:'9px'}},
        h('span',{style:{width:'9px',height:'9px',borderRadius:'50%',background:conf?C.green:C.amber,flexShrink:0}}),
        h('span',{style:{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},u.yard),
        h('span',{style:{fontSize:'10px',color:conf?C.green:C.amber,fontWeight:700,flexShrink:0}},conf?'مؤكّد ✓':'بانتظار')),
      h('div',{style:{display:'flex',alignItems:'center',gap:'9px',fontSize:'12.5px',fontWeight:600,color:C.deep}},
        h('span',{style:{width:'9px',height:'9px',borderRadius:'50%',background:C.blue,flexShrink:0}}),
        h('span',{style:{flex:1}},'برج العليا · موقعك'),
        h('span',{style:{fontSize:'12px',fontWeight:700,color:C.deep,flexShrink:0}},u.km+' كم')));
  }

  offBreakdown(){ const it=this.offSub().items[0], n=it.offeredUnits;
    const rental=it.rentalRate*n, mob=it.deliveryPrice*n, demob=it.returnPrice*n;
    const sub=rental+mob+demob;
    return {n,rental,mob,demob,sub,vat:it.total-sub,total:it.total};
  }

  rSubDonut(q){ const R=34, CIRC=2*Math.PI*R, off=CIRC*(1-q.total/100);
    return h('div',{style:{position:'relative',width:'84px',height:'84px',flexShrink:0}},
      h('svg',{width:84,height:84,style:{transform:'rotate(-90deg)'}},
        h('circle',{cx:42,cy:42,r:R,fill:'none',stroke:'#E4EDF5',strokeWidth:9}),
        h('circle',{cx:42,cy:42,r:R,fill:'none',stroke:q.color,strokeWidth:9,strokeLinecap:'round',
          strokeDasharray:CIRC,strokeDashoffset:off})),
      h('div',{style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}},
        h('div',{style:{fontSize:'19px',fontWeight:900,color:C.deep,fontFamily:'ui-monospace,monospace',direction:'ltr'}},q.total+'٪'),
        h('div',{style:{fontSize:'8px',fontWeight:800,color:q.color,marginTop:'1px'}},q.band)));
  }

  rSubBar(label,ic,pct,weight,color){
    return h('div',{key:label,style:{flex:1,minWidth:0}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'6px',marginBottom:'5px'}},
        h('span',{style:{fontSize:'12px'}},ic),
        h('span',{style:{flex:1,minWidth:0,fontSize:'10.5px',fontWeight:800,color:C.deep,whiteSpace:'nowrap'}},label),
        h('span',{style:{fontSize:'11px',fontWeight:900,color:color,fontFamily:'ui-monospace,monospace',direction:'ltr'}},pct+'٪')),
      h('div',{style:{height:'4px',borderRadius:'3px',background:'#E4EDF5',overflow:'hidden'}},
        h('div',{style:{height:'100%',width:pct+'%',background:color,borderRadius:'3px'}})),
      h('div',{style:{fontSize:'8.5px',fontWeight:700,color:C.muted,marginTop:'4px'}},'الوزن '+weight+'٪'));
  }

  rPanel(){ switch(this.effectivePanel()){
    case 'equip': return this.pEquip();
    // 'verif' now resolves to the merged panel's documents tab — the standalone panel is retired.
    case 'verif': this.eqTab='docs'; return this.pEquip();
    case 'terms': return this.pTerms();
    case 'supplier': return this.pSupplier();
    case 'agree': return this.pAgree();
    case 'offequip': return this.pOffEquip();
    case 'sub': return this.pSubmission();
    case 'chat': return this.pChat();
    default: return this.pEquip();
  }}

  card(children,extra){ return h('div',{style:Object.assign({background:'#fff',border:'1px solid '+C.blt,borderRadius:'14px',padding:'15px',marginBottom:'12px'},extra||{})},children); }

  h4(t){ return h('div',{style:{fontSize:'11px',fontWeight:700,color:C.muted,letterSpacing:'.3px',marginBottom:'10px'}},t); }

  hasVatTag(notes){ return /\[VAT-INCLUSIVE\]/i.test(notes||''); }

  stripVatTag(notes){ return String(notes||'').split('\n').filter(l=>!/\[VAT-INCLUSIVE\]/i.test(l)).join('\n').trim(); }

  offSub(){ const s=this.curSup(); return this.isOff(s)?s.submission:null; }

  levelsLabel(s){ const L2=levelsOf(s); const p=[];
    if(L2.confirmed) p.push(AR(L2.confirmed)+' مؤكّدة');
    if(L2.located)   p.push(AR(L2.located)+' بموقع غير مؤكّد');
    if(L2.claimed)   p.push(AR(L2.claimed)+' معلنة بلا معدّة');
    return p.join(' · ') || '—';
  }

  rLevels(s){ if(!s) return null; const L2=levelsOf(s);
    const row=(n,color,title,sub)=>n?h('div',{key:title,style:{display:'flex',alignItems:'center',gap:'9px',padding:'7px 0'}},
      h('span',{style:{width:'22px',height:'22px',borderRadius:'50%',flexShrink:0,background:color==='grey'?'#F1F5FA':'#fff',border:'2.5px '+(color==='green'?'solid '+C.green:color==='amber'?'dashed '+C.amber:'dashed '+C.muted),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'9.5px',fontWeight:900,color:color==='green'?C.green:color==='amber'?C.amber:C.muted}},color==='green'?'✓':'؟'),
      h('span',{style:{fontSize:'13px',fontWeight:800,color:C.deep,minWidth:'18px'}},AR(n)),
      h('div',{style:{minWidth:0}},
        h('div',{style:{fontSize:'11.5px',fontWeight:800,color:C.deep}},title),
        h('div',{style:{fontSize:'9.5px',fontWeight:600,color:C.muted,marginTop:'1px'}},sub))):null;
    return h('div',{style:{background:'#fff',border:'1px solid '+C.blt,borderRadius:'14px',padding:'11px 13px',marginBottom:'12px'}},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'4px'}},
        h('span',{style:{fontSize:'10px',fontWeight:800,color:C.muted}},'الوحدات المعروضة'),
        h('span',{style:{fontSize:'12px',fontWeight:800,color:C.deep}},AR(L2.offered))),
      row(L2.confirmed,'green','متاحة ومؤكّدة','معدّة مسجّلة · أكّد المورد ساحتها في جاهزية العرض'),
      row(L2.located,'amber','مسجّلة · التوفّر غير مؤكّد','معدّة مسجّلة بموقع معروف · لم يؤكّد المورد توفّرها بعد'),
      row(L2.claimed,'grey','عدد بلا معدّة مسجّلة','أضاف المورد العدد دون معدّة مسجّلة — لا رقم تسلسلي ولا مستندات ولا موقع'));
  }

  bandLabel(b){ return b==='green'?'مكتملة' : b==='yellow'?'ناقصة جزئياً' : 'ناقصة'; }

  unitPhotoCount(u){ if(!u) return 0;
    const digits=String(u.serial).replace(/\D/g,'').split('').reduce((a,c)=>a+(+c),0);
    return 2+(digits%3); }

  unitMatchPct(){ const rows=this.eqSummary(); if(!rows.length) return 100;
    const ok=rows.filter(r=>r.st==='ok').length;
    return Math.round(ok/rows.length*100); }

  askSwap(){ this.askAnotherOfType(); }

  rUnitSwitch(){ const s=this.curSup(); if(!s) return null; const us=unitsOf(s), gh=(s.ghost||0);
    if(us.length<2 && !gh) return null;
    return h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'12px'}},
      us.map((u,i)=>{ const on=i===(this.selUnit??0);
        const c=u.confirmed?C.green:C.red;
        return h('button',{key:i,onClick:()=>{this.selUnit=i;this.up();},
          title:(u.confirmed?'التوفّر مؤكّد':'التوفّر غير مؤكّد')+' · '+u.yard,
          style:{display:'flex',alignItems:'center',gap:'7px',background:on?C.blueLt:'#fff',border:'1.5px solid '+(on?C.blue:C.border),borderRadius:'10px',padding:'6px 10px',cursor:'pointer',fontFamily:'inherit',fontSize:'11px',fontWeight:700,color:C.deep}},
          h('span',{style:{width:'9px',height:'9px',borderRadius:'50%',background:c,flexShrink:0}}),
          h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr',fontSize:'10.5px',fontWeight:800}},u.serial),
          h('span',{style:{fontSize:'9.5px',fontWeight:700,color:C.muted}},u.year)); }),
      gh?h('div',{style:{display:'flex',alignItems:'center',gap:'6px',background:'#fff',border:'1.5px dashed '+C.border,borderRadius:'10px',padding:'6px 10px',fontSize:'11px',fontWeight:700,color:C.muted}},
        AR(gh)+' بلا معدّة مسجّلة'):null);
  }

  composeRequest(u,act,docType){
    this.pendingCard={type:'rentee_request',scope:'equipment',kind:act.kind,
      equipmentId:u.id,serial:u.serial,ref:this.nextRef(),
      docTypes:docType?[docType]:[],text:act.text+(docType?(' — '+docType):'')};
    this.activePanel='chat'; this.drawerOpen=true; this.docPick=null; this.up();
  }

  sendPendingCard(){ const c=this.pendingCard; if(!c) return;
    this.sentReqs=(this.sentReqs||0)+1;
    this.S.chips.push({who:'me',kind:'me',txt:c.text,card:c});
    this.pendingCard=null;
    // The hint is the only way the renter discovers that a reply reaches him on the map too.
    this.toast('أُرسل الطلب · '+c.ref+' — أغلق اللوحة لترى كيف يصلك الرد على الخريطة');
    this.scheduleResponse(c); this.up();
  }

  missingDocsFor(u){ const all=this.vfEquipDocs();
    return all.filter(d=>d.s!=='ok').map(d=>d.k);
  }

  availabilityExplainer(ur){ if(!ur) return null;
    if(ur.confirmed) return {tone:'green',
      title:'أكّد المورد توفّر هذه المعدّة',
      body:'حدّد المورد ساحة هذه المعدّة في جاهزية العرض، فظهرت خضراء على الخريطة. الموقع أدناه هو ما أكّده هو.'};
    return {tone:'amber',
      title:'لم يؤكّد المورد توفّر هذه المعدّة بعد',
      body:'المعدّة مسجّلة لدى المورد ونعرف موقعها من ملفّها، لكنه لم يؤكّد ساحتها في جاهزية العرض. هذا لا يعني أنها غير متوفّرة — يعني أنه لم يؤكّدها.',
      cta:'اطلب تأكيد التوفّر'};
  }

  unitsWord(n){ return AR(n)+' وحدة'; }

  askAnotherOfType(){ const ur=this.curUnitRec(); if(!ur) return; const u=this.curUnit();
    this.composeRequest(ur,{kind:'alternative',
      text:'هل لديك '+u.spec+' أخرى مسجّلة لديك؟ أرسل لنا خياراتك المتاحة المطابقة لمواصفات الطلب.'});
  }

  btn(bg){ return {background:bg,color:'#fff',border:'none',borderRadius:'11px',padding:'11px',fontSize:'12.5px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',width:'100%'}; }

  btnGhost(){ return {background:'#fff',color:C.navy,border:'1.5px solid '+C.border,borderRadius:'11px',padding:'11px',fontSize:'12.5px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}; }

  vfAttention(list){ return list.filter(d=>d.s!=='ok'&&d.s!=='deferred').length; }

  docKey(tab,i){ return tab+':'+(tab==='equip'?(this.selUnit??0):'co')+':'+i; }

  docSelected(tab,i){ return !!(this.docSel&&this.docSel[this.docKey(tab,i)]); }

  toggleDoc(tab,i){ if(!this.docSel) this.docSel={}; const k=this.docKey(tab,i);
    this.docSel[k]=!this.docSel[k]; this.up(); }

  docSelCount(list,tab){ let n=0; list.forEach((d,i)=>{ if(this.docSelected(tab,i)) n++; }); return n; }

  toggleAllDocs(list,tab){ if(!this.docSel) this.docSel={};
    const all=this.docSelCount(list,tab)===list.length;
    list.forEach((d,i)=>{ this.docSel[this.docKey(tab,i)]=!all; }); this.up(); }

  rDocSelectBar(list,tab){ const n=this.docSelCount(list,tab), all=n===list.length&&list.length>0;
    return h('div',{style:{position:'sticky',top:0,zIndex:5,display:'flex',alignItems:'center',gap:'9px',padding:'8px 2px 9px',borderBottom:'1px solid '+C.blt,marginBottom:'9px',background:'#F8FAFC'}},
      h('button',{onClick:()=>this.toggleAllDocs(list,tab),
        style:{display:'flex',alignItems:'center',gap:'7px',background:'none',border:0,cursor:'pointer',fontFamily:'inherit',fontSize:'11px',fontWeight:700,color:C.navy}},
        h('span',{style:{width:'18px',height:'18px',borderRadius:'5px',border:'2px solid '+(all?C.blue:C.border),background:all?C.blue:'#fff',color:'#fff',fontSize:'11px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}},all?'✓':''),
        'تحديد الكل'),
      h('div',{style:{flex:1}}),
      h('span',{style:{fontSize:'10.5px',fontWeight:700,color:n?C.blue:C.muted}}, n?AR(n)+' محدَّد':'لم تحدّد شيئاً'));
  }

  docDownload(list,tab){ const picked=list.filter((d,i)=>this.docSelected(tab,i)&&!d.noFile&&(d.s==='ok'||d.s==='checking'));
    if(!picked.length){ this.toast('اختر مستنداً واحداً على الأقل قابلاً للتحميل'); return; }
    // More than one file: let the renter choose the shape rather than deciding for him (spec OQ 10).
    if(picked.length>1){ this.dlAsk={n:picked.length}; this.up(); return; }
    this.toast('تحميل مستند'); }

  dlPick(merge){ const n=this.dlAsk?this.dlAsk.n:0; this.dlAsk=null;
    this.toast(merge?('دمج '+AR(n)+' مستندات في ملف PDF واحد'):('تحميل '+AR(n)+' ملفات منفصلة')); this.up(); }

  rDlAsk(){ const a=this.dlAsk; if(!a) return null;
    return h('div',{style:{position:'sticky',bottom:0,zIndex:7,background:C.blueLt,border:'1.5px solid '+C.blueBd,borderRadius:'13px',padding:'11px 12px',marginTop:'10px'}},
      h('div',{style:{fontSize:'11.5px',fontWeight:800,color:C.blue,marginBottom:'7px'}},'كيف تريد تنزيل '+AR(a.n)+' مستندات؟'),
      h('div',{style:{display:'flex',gap:'8px'}},
        h('button',{onClick:()=>this.dlPick(false),style:{flex:1,background:'#fff',border:'1.5px solid '+C.blueBd,color:C.blue,borderRadius:'10px',padding:'9px',fontSize:'11px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'ملفات منفصلة'),
        h('button',{onClick:()=>this.dlPick(true),style:{flex:1,background:C.blue,border:0,color:'#fff',borderRadius:'10px',padding:'9px',fontSize:'11px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'ملف PDF واحد'),
        h('button',{onClick:()=>{this.dlAsk=null;this.up();},style:{background:'none',border:0,color:C.muted,fontSize:'11px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',padding:'0 6px'}},'إلغاء')));
  }

  docRequest(list,tab){ const picked=list.filter((d,i)=>this.docSelected(tab,i));
    if(!picked.length){ this.toast('اختر المستندات التي تريد طلبها'); return; }
    // Asking for a document the supplier already provided is worth one interruption, not a silent send.
    const have=picked.filter(d=>d.s==='ok'||d.s==='checking').map(d=>d.k);
    const missing=picked.filter(d=>!(d.s==='ok'||d.s==='checking')).map(d=>d.k);
    if(have.length){ this.docConfirm={have,missing,tab}; this.up(); return; }
    const names=picked.map(d=>d.k);
    const ur=this.curUnitRec();
    // Company documents belong to the SUPPLIER, so they carry scope:'company' and no equipmentId —
    // otherwise the supplier would read a CR request as a question about one machine.
    this.pendingCard = tab==='company'
      ? {type:'rentee_request',scope:'company',kind:'document',equipmentId:null,serial:null,
         docTypes:names,ref:this.nextRef(),text:'هل يمكنك تزويدنا بمستندات الشركة التالية: '+names.join('، ')+'؟'}
      : {type:'rentee_request',scope:'equipment',kind:'document',equipmentId:(ur?ur.id:null),serial:(ur?ur.serial:null),
         docTypes:names,ref:this.nextRef(),text:'هل يمكنك تزويدنا بمستندات هذه المعدّة: '+names.join('، ')+'؟'};
    this.docSel={}; this.activePanel='chat'; this.drawerOpen=true; this.up(); }

  nextRef(){ this.reqSeq=(this.reqSeq||0)+1; return 'RQ-'+String(1000+this.reqSeq*37).slice(-4); }

  rDocActions(list,tab){ const n=this.docSelCount(list,tab);
    return h('div',{style:{position:'sticky',bottom:0,zIndex:5,display:'flex',gap:'9px',marginTop:'10px',padding:'11px 0 4px',borderTop:'1px solid '+C.blt,background:'linear-gradient(180deg,rgba(248,250,252,.82),#F8FAFC 34%)',backdropFilter:'blur(3px)'}},
      h('button',{onClick:()=>this.docDownload(list,tab),disabled:!n,
        style:{flex:1,background:'#fff',border:'1.5px solid '+C.border,color:n?C.navy:C.muted,borderRadius:'12px',padding:'11px',fontSize:'12.5px',fontWeight:700,cursor:n?'pointer':'default',fontFamily:'inherit',opacity:n?1:.6}},'⤓ تنزيل'),
      h('button',{onClick:()=>this.docRequest(list,tab),disabled:!n,
        style:{flex:2,background:n?C.blue:C.border,border:0,color:'#fff',borderRadius:'12px',padding:'11px',fontSize:'12.5px',fontWeight:700,cursor:n?'pointer':'default',fontFamily:'inherit'}},'+ طلب عبر المحادثة'));
  }

  requestOneDoc(d,tab){ const ur=this.curUnitRec();
    this.pendingCard = tab==='company'
      ? {type:'rentee_request',scope:'company',kind:'document',equipmentId:null,serial:null,
         docTypes:[d.k],ref:this.nextRef(),text:'هل يمكنك تزويدنا بمستند الشركة: '+d.k+'؟'}
      : {type:'rentee_request',scope:'equipment',kind:'document',equipmentId:(ur?ur.id:null),serial:(ur?ur.serial:null),
         docTypes:[d.k],ref:this.nextRef(),text:'هل يمكنك تزويدنا بمستند هذه المعدّة: '+d.k+'؟'};
    this.activePanel='chat'; this.drawerOpen=true; this.up();
  }

  docConfirmSend(list,tab,onlyMissing){
    const c=this.docConfirm; if(!c) return;
    const names = onlyMissing ? c.missing : c.missing.concat(c.have);
    this.docConfirm=null;
    if(!names.length){ this.docSel={}; this.toast('كل المستندات المحدَّدة متوفّرة بالفعل'); this.up(); return; }
    this.composeDocRequest(names,tab);
  }

  composeDocRequest(names,tab){ const ur=this.curUnitRec();
    this.pendingCard = tab==='company'
      ? {type:'rentee_request',scope:'company',kind:'document',equipmentId:null,serial:null,
         docTypes:names,ref:this.nextRef(),text:'هل يمكنك تزويدنا بمستندات الشركة التالية: '+names.join('، ')+'؟'}
      : {type:'rentee_request',scope:'equipment',kind:'document',equipmentId:(ur?ur.id:null),serial:(ur?ur.serial:null),
         docTypes:names,ref:this.nextRef(),text:'هل يمكنك تزويدنا بمستندات هذه المعدّة: '+names.join('، ')+'؟'};
    this.docSel={}; this.activePanel='chat'; this.drawerOpen=true; this.up();
  }

  rDocConfirm(list,tab){ const c=this.docConfirm; if(!c||c.tab!==tab) return null;
    return h('div',{style:{position:'sticky',bottom:0,zIndex:6,background:C.amberLt,border:'1.5px solid '+C.amberBd,borderRadius:'13px',padding:'11px 12px',marginTop:'10px',boxShadow:'0 -6px 18px rgba(15,34,56,.10)'}},
      h('div',{style:{fontSize:'11.5px',fontWeight:800,color:'#8a4f08',marginBottom:'5px'}},
        AR(c.have.length)+' من المستندات المحدَّدة متوفّرة بالفعل'),
      h('div',{style:{fontSize:'10px',fontWeight:700,color:C.navy,lineHeight:1.8,marginBottom:'8px'}},c.have.join('، ')),
      h('div',{style:{fontSize:'9.5px',fontWeight:600,color:C.muted,lineHeight:1.7,marginBottom:'9px'}},
        'يمكنك تنزيلها الآن دون طلب. أطلبها من المورد فقط إذا أردت نسخة محدَّثة.'),
      h('div',{style:{display:'flex',gap:'8px'}},
        c.missing.length? h('button',{onClick:()=>this.docConfirmSend(list,tab,true),
          style:{flex:2,background:C.blue,border:0,color:'#fff',borderRadius:'10px',padding:'9px',fontSize:'11px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'اطلب الناقص فقط ('+AR(c.missing.length)+')'):null,
        h('button',{onClick:()=>this.docConfirmSend(list,tab,false),
          style:{flex:1,background:'#fff',border:'1.5px solid '+C.amberBd,color:'#8a4f08',borderRadius:'10px',padding:'9px',fontSize:'11px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'اطلب الكل'),
        h('button',{onClick:()=>{this.docConfirm=null;this.up();},
          style:{background:'none',border:0,color:C.muted,fontSize:'11px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',padding:'0 6px'}},'إلغاء')));
  }

  pAgree(){ const S=this.S; const total=S.price.agreed||this.currentAsk(); const half=Math.round(total/2); const ready=this.allDone(); const deferred=S.terms.filter(t=>t.deferredTerm);
    return h('div',{style:{padding:'16px'}},
      S.approved? h('div',{style:{background:C.greenLt,border:'1.5px solid '+C.greenBd,borderRadius:'14px',padding:'16px',marginBottom:'12px',textAlign:'center'}},
        h('div',{style:{fontSize:'16px',fontWeight:700,color:C.green}},'✓ الاتفاق معتمد'),
        h('div',{style:{fontSize:'11.5px',color:C.navy,marginTop:'4px'}},'أُخطر المورد · الدفعة الأولى عند التسليم ١٢ مايو · الشحنة على الطريق 🚚')) : null,
      !ready&&!S.approved? h('div',{style:{background:C.amberLt,border:'1px solid '+C.amberBd,borderRadius:'12px',padding:'11px 13px',fontSize:'11.5px',fontWeight:600,color:'#8a4f08',marginBottom:'12px',lineHeight:1.6}},'يُفعّل الاعتماد عند اكتمال الثقة والسعر والشروط — تبقّى '+AR(this.trustOpenCount()+this.commOpenCount())+' بنود') : null,
      this.card([ this.h4('ملخص الاتفاق'),
        [['المعدّة',this.curUnit().spec],['المعدّات المحدَّدة',this.pickedSerialsLabel()],['الموقع','برج العليا · حي العليا'],['الكمية × المدة',AR(S.qty)+' × '+AR(S.days)+' يوم'+(S.operator?' · مع عامل':'')],['الشروط',AR(S.terms.filter(t=>t.state==='agreed').length)+' بنود متفق عليها']].map((r,i)=>
          h('div',{key:i,style:{display:'flex',justifyContent:'space-between',gap:'10px',padding:'7px 0',borderBottom:'1px solid '+C.blt,fontSize:'12px'}},h('span',{style:{color:C.muted,fontWeight:600}},r[0]),h('span',{style:{fontWeight:700,color:C.navy,textAlign:'end'}},r[1]))),
        deferred.map(t=>h('div',{key:t.id,style:{display:'flex',justifyContent:'space-between',gap:'10px',padding:'7px 0',borderBottom:'1px solid '+C.blt,fontSize:'12px'}},h('span',{style:{color:C.amber,fontWeight:600}},'شرط مؤجّل'),h('span',{style:{fontWeight:700,color:C.amber}},t.name))),
        h('div',{style:{display:'flex',justifyContent:'space-between',padding:'11px 0 0',fontSize:'15px',fontWeight:700,color:C.deep}},h('span',{},'الإجمالي'),h('span',{},AR(total)+' ر.س')) ]),
      this.card([ this.h4('جدول الدفع'),
        h('div',{style:{display:'flex',gap:'10px'}},
          [[half,'عند التسليم · ١٢ مايو'],[total-half,'عند الإرجاع · ٢٦ مايو']].map((p,i)=>h('div',{key:i,style:{flex:1,background:C.s2,borderRadius:'12px',padding:'12px',textAlign:'center'}},
            h('div',{style:{fontSize:'15px',fontWeight:700,color:C.deep}},AR(p[0])+' ر.س'),h('div',{style:{fontSize:'10px',color:C.muted,fontWeight:600,marginTop:'3px'}},p[1])))) ]),
      !S.approved? h('button',{onClick:()=>this.approveDeal(),disabled:!ready,style:{width:'100%',background:ready?C.green:C.surface,color:ready?'#fff':C.muted,border:'none',borderRadius:'12px',padding:'14px',fontSize:'14px',fontWeight:700,cursor:ready?'pointer':'default',fontFamily:'inherit'}},'اعتمد الاتفاق') : null);
  }

  rReplyCard(r){
    const RES={provided:{lbl:'استجاب',c:C.green,bg:C.greenLt,bd:C.greenBd,ic:'✓'},
               declined:{lbl:'رفض الطلب',c:C.amber,bg:C.amberLt,bd:C.amberBd,ic:'✕'},
               pending:{lbl:'قيد المتابعة',c:C.muted,bg:C.s2,bd:C.border,ic:'…'}};
    const st=RES[r.resolution]||RES.pending;
    return h('div',{style:{background:'#fff',border:'1px solid '+st.bd,borderRadius:'13px 13px 13px 4px',overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,.10)'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'7px',padding:'7px 11px',background:st.bg,borderBottom:'1px solid '+st.bd}},
        h('span',{style:{width:'17px',height:'17px',borderRadius:'50%',background:st.c,color:'#fff',fontSize:'9.5px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}},st.ic),
        h('span',{style:{fontSize:'10px',fontWeight:800,color:st.c}},st.lbl),
        h('div',{style:{flex:1}}),
        h('span',{style:{fontSize:'9px',fontWeight:800,color:C.muted,fontFamily:'ui-monospace,monospace',direction:'ltr'}},'↩ '+r.inReplyTo)),
      h('div',{style:{padding:'9px 11px'}},
        r.serial? h('div',{style:{fontSize:'9.5px',fontWeight:700,color:C.muted,marginBottom:'4px',fontFamily:'ui-monospace,monospace',direction:'ltr',textAlign:'start'}},r.serial):null,
        h('div',{style:{fontSize:'12px',fontWeight:600,color:C.navy,lineHeight:1.7}},r.text)));
  }

  supplierChatTabs(){ const i=this.selSup; if(i==null || this.itemsMode!=='multi') return [];
    const out=[];
    ITEM_BIDS.forEach((ids,item)=>{ if(ids.indexOf(i)>=0) out.push({item,unread: item===0?0:(item===1?2:0)}); });
    return out.length>1 ? out : [];   // no tab strip for a supplier with a single bid
  }

  rChatTabs(){ const tabs=this.supplierChatTabs(); if(!tabs.length) return null;
    const active = this.chatItem==null ? (this.activeItem||0) : this.chatItem;
    return h('div',{style:{flexShrink:0,display:'flex',gap:'6px',padding:'8px 12px',background:'#fff',borderBottom:'1px solid '+C.blt,overflowX:'auto'}},
      tabs.map(t=>{ const on=t.item===active, u=FLEET[MULTI_ITEMS[t.item].fleet];
        return h('button',{key:t.item,onClick:()=>{ this.chatItem=t.item; this.up(); },
          style:{position:'relative',flexShrink:0,display:'flex',alignItems:'center',gap:'7px',background:on?C.blueLt:'#fff',border:'1.5px solid '+(on?C.blue:C.border),borderRadius:'10px',padding:'6px 12px',cursor:'pointer',fontFamily:'inherit',fontSize:'11px',fontWeight:700,color:on?C.blue:C.navy,whiteSpace:'nowrap'}},
          h('span',{style:{fontSize:'13px'}},MULTI_ITEMS[t.item].icon),
          u.spec,
          t.unread&&!on?h('span',{style:{minWidth:'17px',height:'17px',borderRadius:'9px',background:C.red,color:'#fff',fontSize:'9px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px'}},AR(t.unread)):null); }));
  }

  unitByRef(c){ if(!c||c.scope==='company'||!c.equipmentId) return null;
    let found=null;
    SUPPLIERS.forEach(s=>{ fleetOf(s).forEach(u=>{ if(u.id===c.equipmentId) found={s,u}; }); });
    return found;
  }

  echoFor(c){ const ch=this.S.chips||[];
    for(let i=ch.length-1;i>=0;i--){ const x=ch[i];
      if(x.kind==='reply'&&x.reply&&x.reply.inReplyTo===c.ref) return x.reply; }
    return null;
  }

  derivable(c){ return c.kind==='availability'||c.kind==='document'; }

  cardState(c){
    if(!this.derivable(c)){
      const e=this.echoFor(c);
      if(e&&e.resolution==='declined') return {txt:'رفض المورد الطلب',color:C.amber,done:true};
      if(e&&e.resolution==='provided') return {txt:'استجاب المورد',color:C.green,done:true};
      return {txt:'بانتظار رد المورد',color:C.muted,done:false};
    }
    return this.derivedState(c);
  }

  cardKindLabel(c){ return ({availability:'طلب تأكيد التوفّر',document:'طلب مستند',
    alternative:'طلب معدّة أخرى'})[c.kind]||'طلب'; }

  rPendingCard(){ const c=this.pendingCard; if(!c) return null;
    return h('div',{style:{flexShrink:0,margin:'10px 12px'}},this.rRequestCard(c,true));
  }

  rScopeNote(units){ const s=this.curSup(); if(!s||units<=1) return null;
    const us=unitsOf(s), ur=this.curUnitRec();
    const idx=us.indexOf(ur);
    if(idx<0) return null;
    return h('div',{style:{marginTop:'9px',display:'inline-flex',alignItems:'center',gap:'9px',background:'rgba(143,208,255,.12)',border:'1px solid rgba(143,208,255,.34)',borderRadius:'20px',padding:'5px 12px'}},
      h('span',{style:{fontSize:'11px',fontWeight:700,color:'#8FD0FF'}},
        'تستعرض وحدة '+AR(idx+1)+' — والسعر والتفاوض يشملان '+AR(units)+' وحدات'),
      h('button',{onClick:()=>{ this.S.qty=1; this.resetPriceOnScope(); this.openUnitPick(); },
        style:{background:'rgba(255,255,255,.14)',border:'1px solid rgba(255,255,255,.26)',color:'#fff',borderRadius:'14px',padding:'3px 10px',fontSize:'10px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},
        'أريد هذه الوحدة فقط'));
  }

  scrollPay(){ const c=this._qsBodyEl, p=this._payEl;
    if(c&&p){ const top=c.scrollTop+(p.getBoundingClientRect().top-c.getBoundingClientRect().top)-16; c.scrollTo({top:Math.max(0,top),behavior:'smooth'}); }
    this.payPulse=true; this.up(); clearTimeout(this._payT); this._payT=setTimeout(()=>{ this.payPulse=false; this.up(); },1700); }

  wizSteps(){ const neg=this.negotiableTerms();
    const s=[{key:'paper',label:'السعر والدفع'}];
    if(neg.length) s.push({key:'terms',label:'الشروط'});
    s.push({key:'review',label:'المراجعة'});
    return s; }

  qsPay(){ const group=(field,title,hint,opts)=>{ const sel=this.paySel[field];
      return h('div',{style:{marginBottom:'24px'}},
        h('div',{style:{fontSize:'16px',fontWeight:800,color:C.navy,marginBottom:'3px'}},title),
        h('div',{style:{fontSize:'12px',color:C.muted,fontWeight:600,marginBottom:'13px'}},hint),
        h('div',{style:{display:'grid',gap:'10px'}},
          opts.map(o=>{ const on=sel===o, isSup=o===SUP_PAY[field];
            return h('button',{key:o,onClick:()=>this.onPay(field,o),style:{display:'flex',alignItems:'center',gap:'13px',background:on?C.blueLt:'#fff',border:'2px solid '+(on?C.blue:C.border),borderRadius:'14px',padding:'16px 18px',cursor:'pointer',fontFamily:'inherit',textAlign:'start',width:'100%'}},
              h('span',{style:{width:'24px',height:'24px',borderRadius:'50%',border:'2px solid '+(on?C.blue:C.border),background:on?C.blue:'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'13px',fontWeight:900,color:'#fff'}}, on?'✓':''),
              h('span',{style:{flex:1,fontSize:'14px',fontWeight:700,color:C.navy}},o),
              isSup? h('span',{style:{fontSize:'10px',fontWeight:800,color:C.green,background:C.greenLt,border:'1px solid '+C.greenBd,borderRadius:'100px',padding:'4px 11px',whiteSpace:'nowrap'}},'يقترحه المورد') : null); }))); };
    return h('div',{},
      h('div',{style:{display:'flex',alignItems:'center',gap:'10px',background:C.blueLt,border:'1px solid '+C.blueBd,borderRadius:'12px',padding:'11px 14px',marginBottom:'20px'}},
        h('span',{style:{fontSize:'16px'}},'💳'),
        h('div',{style:{fontSize:'11.5px',fontWeight:700,color:C.navy,lineHeight:1.7}},'اختيار واحد لكل سؤال. المطابق لاقتراح المورد يُسرّع الاتفاق.')),
      group('schedule','متى تدفع؟','جدولة الدفعات مقابل مراحل التنفيذ',PAY_SCHEDULES),
      group('method','كيف تدفع؟','طريقة تحويل المبلغ',PAY_METHODS));
  }

  rQuoteSheet(d,sp){ const S=this.S, s=this.curSup(), cfg=this.cfg;
    const V={navy:'#1c3550',navyDeep:'#12263a',navyMid:'#2a4f72',line:'#e4edf5',border:'#d4e0ec',muted:'#6b8fa8',
             success:'#1daf58',successBg:'#e7f7ee',successBd:'rgba(29,175,88,.5)',rentee:'#2563eb',warning:'#d4780a',paper2:'#f8fafc',desk:'#dbe6f1'};
    const units=Math.max(1,S.qty), supUnits=s?offeredOf(s):units;
    const periods = cfg.mode==='open' ? null : cfg.duration;
    const rentalLine=this.rateLineTotal(d.rate);
    const mobLine=d.incMob?d.mob*units:0, demobLine=d.incDemob?d.demob*units:0;
    const sub=rentalLine+mobLine+demobLine, vat=Math.round(sub*0.15), total=sub+vat;
    const money=v=>fmtEN(Math.round(v));
    const sech=t=>h('div',{style:{fontSize:'11px',fontWeight:800,letterSpacing:'.04em',color:V.muted,margin:'4px 0 8px'}},t);
    const th=t=>h('th',{key:t,style:{background:V.navy,color:'#fff',fontSize:'11px',fontWeight:800,padding:'9px 10px',textAlign:'start',whiteSpace:'nowrap'}},t);
    const td=(k,kids,st)=>h('td',{key:k,style:Object.assign({borderBottom:'1px solid '+V.line,padding:'11px 10px',fontSize:'12.5px',verticalAlign:'middle'},st||{})},kids);
    const cellLbl=(t,sub2)=>h('div',{},h('div',{style:{fontWeight:800,color:V.navy}},t),sub2?h('div',{style:{fontSize:'10.5px',fontWeight:600,color:V.muted,marginTop:'2px'}},sub2):null);
    const totB=v=>h('b',{style:{fontFamily:'ui-monospace,monospace',fontWeight:800,color:V.navy,direction:'ltr'}},money(v));
    // .qp-pricebox — editable price in a green box, as the shipped sheet renders it
    const priceBox=v=>h('span',{style:{display:'inline-flex',alignItems:'center',gap:'3px',background:V.successBg,border:'1.5px solid '+V.successBd,borderRadius:'9px',padding:'3px 9px'}},
      h('span',{style:{fontSize:'12px',color:V.success}},'✎'),
      h('span',{style:{fontSize:'14px',fontWeight:800,color:V.success,direction:'ltr'}},money(v)));
    const ref=(txt,changed)=>h('div',{style:{fontSize:'10px',fontWeight:700,color:changed?V.warning:V.muted,marginTop:'4px'}},txt);
    const qmatch=n=>h('span',{style:{fontSize:'10px',fontWeight:800,color:V.success,background:V.successBg,border:'1px solid rgba(29,175,88,.44)',borderRadius:'999px',padding:'2px 9px',whiteSpace:'nowrap'}},'✓ العدد '+AR(n));
    const stepBtn=(t,dd,dis)=>h('button',{onClick:()=>{ if(!dis) this.setQty(dd); },disabled:dis,
      style:{display:'grid',placeItems:'center',width:'26px',height:'26px',borderRadius:'8px',border:'1px solid '+V.border,background:'#fff',color:V.navy,fontSize:'16px',fontWeight:800,cursor:dis?'default':'pointer',opacity:dis?.4:1,fontFamily:'inherit'}},t);
    const qtyCell=()=>h('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px'}},
      h('span',{style:{fontSize:'9.5px',fontWeight:700,color:V.rentee}},'خيارك'),
      h('div',{style:{display:'inline-flex',alignItems:'center',gap:'6px'}},
        stepBtn('−',-1,units<=1),
        h('span',{style:{minWidth:'18px',textAlign:'center',fontSize:'14px',fontWeight:800,color:V.navy}},AR(units)),
        stepBtn('+',1,units>=4)),
      qmatch(units),
      s?ref('المورد: '+AR(supUnits)+' وحدة',units!==supUnits):null);
    const legRow=(k,name,sub2,price,inc,line,units2,toggle)=>h('tr',{key:k,style:inc?null:{background:V.paper2}},
      td('a',h('div',{style:{display:'flex',alignItems:'flex-start',gap:'9px'}},
        inc?h('button',{onClick:toggle,title:'استبعاد',style:{flexShrink:0,width:'24px',height:'24px',borderRadius:'50%',border:0,background:'#fcebea',color:'#d9362a',fontSize:'12px',fontWeight:800,cursor:'pointer',display:'grid',placeItems:'center',marginTop:'1px',fontFamily:'inherit'}},'✕'):null,
        h('div',{},cellLbl(name,sub2),
          inc?null:h('button',{onClick:toggle,style:{border:0,background:'none',font:'inherit',fontSize:'11px',fontWeight:800,color:V.success,cursor:'pointer',padding:0,marginTop:'4px'}},'+ استعادة')))),
      td('b',h('span',{style:{color:V.muted}},'رحلة')),
      td('c',inc?h('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px'}},h('span',{style:{fontSize:'14px',fontWeight:800,color:V.navy}},AR(units2)),qmatch(units2)):h('span',{style:{color:V.muted,fontWeight:700}},'—')),
      td('d',inc?priceBox(price):h('span',{style:{fontSize:'12px',fontWeight:700,color:V.muted}},'مستثنى')),
      td('e',inc?totB(line):h('span',{style:{fontSize:'12px',fontWeight:700,color:V.muted}},'—'),{textAlign:'end'}));
    const trow=(l,v,net)=>h('div',{key:l,style:Object.assign({display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:'12px',padding:'4px 0',fontSize:'13px'},net?{borderTop:'1px solid '+V.line,marginTop:'5px',paddingTop:'9px',fontSize:'15px'}:{})},
      h('span',{style:{color:net?V.navy:V.navyMid,fontWeight:net?800:600}},l),
      h('span',{style:{fontFamily:'ui-monospace,monospace',fontWeight:net?800:700,direction:'ltr',color:net?V.success:V.navy}},money(v)));
    // desk, paper and zoom come from qpDesk() — this renders the sheet CONTENT only.
    return h('div',{},
        // ── qhead: company + location, and the ROOM SHORT CODE as the reference. No invented ids. ──
        h('div',{style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'16px',borderBottom:'1px solid '+V.line,paddingBottom:'14px',marginBottom:'16px'}},
          h('div',{style:{display:'flex',alignItems:'center',gap:'12px',minWidth:0}},
            h('div',{style:{width:'46px',height:'46px',borderRadius:'12px',background:V.navyDeep,color:'#fff',fontWeight:800,fontSize:'18px',display:'grid',placeItems:'center',flexShrink:0}},s?s.name.charAt(0):'م'),
            h('div',{style:{display:'flex',flexDirection:'column',gap:'2px',minWidth:0}},
              h('b',{style:{fontSize:'17px',fontWeight:800,color:V.navy}},s?s.name:'المورد'),
              h('span',{style:{fontSize:'11px',fontWeight:600,color:V.muted}},s?s.city:'—'))),
          h('div',{style:{textAlign:'end',flexShrink:0,direction:'ltr'}},
            h('div',{style:{fontSize:'10px',fontWeight:800,letterSpacing:'.08em',color:V.muted,textTransform:'uppercase'}},'عرض سعر رقم'),
            h('div',{style:{fontSize:'15px',fontWeight:800,color:V.rentee,direction:'ltr'}},REQ_ID),
            h('div',{style:{fontSize:'11px',fontWeight:600,color:V.muted,marginTop:'2px'}},'التاريخ ٤ أغسطس ٢٠٢٦'))),
        sech('عرض السعر'),
        h('div',{style:{overflowX:'auto'}},
          h('table',{style:{width:'100%',borderCollapse:'collapse'}},
            h('thead',{},h('tr',{},[th('البند'),th('المدة'),th('العدد'),th('السعر'),th('الإجمالي')])),
            h('tbody',{},
              h('tr',{key:'r'},
                td('a',cellLbl('الإيجار الأساسي',this.curUnit().spec)),
                td('b',periods?(AR(periods)+' يوم'):'—',{color:V.muted}),
                td('c',qtyCell()),
                td('d',h('div',{},priceBox(d.rate),ref('المورد: '+money(sp.rate),d.rate!==sp.rate))),
                td('e',totB(rentalLine),{textAlign:'end'})),
              legRow('m','التعبئة — موب','توصيل',d.mob,d.incMob,mobLine,units,()=>{ this.S.price.sup.incMob=!this.S.price.sup.incMob; this.up(); }),
              legRow('dm','الإرجاع — ديموب','استلام',d.demob,d.incDemob,demobLine,units,()=>{ this.S.price.sup.incDemob=!this.S.price.sup.incDemob; this.up(); })))),
        // No per-unit selection here: the counter agrees HOW MANY, not WHICH. The specific machines are
        // discussed with the supplier in chat. Once he approves the unit term, the map follows this count.
        h('div',{style:{marginTop:'14px',background:V.paper2,border:'1px dashed '+V.border,borderRadius:'8px',padding:'10px 12px'}},
          h('div',{style:{fontSize:'10px',fontWeight:800,color:V.muted,marginBottom:'4px'}},'عدد الوحدات'),
          h('div',{style:{fontSize:'11.5px',fontWeight:700,color:V.navyMid,lineHeight:1.7}},
            'تتفاوض على '+AR(units)+' من '+AR(s?offeredOf(s):units)+' وحدة معروضة. تحديد المعدّات بالتحديد يُتفق عليه مع المورد في المحادثة.')),
        h('div',{style:{marginTop:'16px',borderTop:'1.5px solid '+V.border,paddingTop:'10px'}},
          trow('المجموع قبل الضريبة',sub),
          trow('ضريبة القيمة المضافة ١٥٪',vat),
          trow('الصافي شامل الضريبة',total,true)),
        h('div',{style:{marginTop:'10px',background:V.paper2,border:'1px dashed '+V.border,borderRadius:'8px',padding:'8px 12px',fontSize:'11.5px',fontWeight:700,color:V.navyMid}},
          h('span',{style:{color:V.muted,fontWeight:800,marginInlineEnd:'6px'}},'المبلغ بالحروف'),money(total)+' ريال سعودي فقط لا غير'),
        h('div',{style:{marginTop:'14px'}},
          sech('شروط الدفع'),
          [['الجدولة',this.paySel.schedule||SUP_PAY.schedule],['الطريقة',this.paySel.method||SUP_PAY.method],['صلاحية العرض','٧ أيام']].map(r=>
            h('div',{key:r[0],style:{display:'flex',alignItems:'center',gap:'10px',padding:'9px 0',borderTop:'1px solid '+V.line}},
              h('span',{style:{fontSize:'12.5px',fontWeight:700,color:V.navy,minWidth:'92px',flexShrink:0}},r[0]),
              h('span',{style:{flex:1,fontSize:'13px',fontWeight:700,color:V.navy}},r[1]),
              r[0]!=='صلاحية العرض'?h('span',{style:{fontSize:'10.5px',fontWeight:800,padding:'3px 9px',borderRadius:'999px',background:V.successBg,color:V.success,whiteSpace:'nowrap'}},'مطابق'):null))));
  }

  qpDesk(body){ const z=this.paperZoom||0.85;
    const zbtn=(lbl,fn,pct)=>h('button',{key:lbl,onClick:fn,style:Object.assign({display:'grid',placeItems:'center',background:'#fff',border:'1px solid '+(pct?C.blt:C.border),color:C.navy,font:'inherit',fontWeight:800,cursor:'pointer',padding:0},pct?{width:'auto',height:'auto',borderRadius:'9px',padding:'6px 9px',fontSize:'11px',boxShadow:'0 3px 10px rgba(9,20,34,.12)'}:{width:'46px',height:'46px',borderRadius:'50%',fontSize:'24px',lineHeight:1,boxShadow:'0 6px 18px rgba(9,20,34,.2)'})},lbl);
    return h('div',{ref:el=>this._qsBodyEl=el,style:{position:'relative',flex:1,minHeight:0,overflow:'auto',background:'#dbe6f1'}},
      h('div',{style:{position:'absolute',top:'50%',insetInlineStart:'20px',transform:'translateY(-50%)',display:'flex',flexDirection:'column',alignItems:'center',gap:'10px',zIndex:6}},
        zbtn('+',()=>{ this.paperZoom=Math.min(1.8,Math.round((z+0.15)*100)/100); this.up(); }),
        zbtn(Math.round(z*100)+'%',()=>{ this.paperZoom=0.85; this.up(); },true),
        zbtn('−',()=>{ this.paperZoom=Math.max(0.5,Math.round((z-0.15)*100)/100); this.up(); })),
      h('div',{style:{minHeight:'100%',display:'flex',justifyContent:'center',alignItems:'flex-start',padding:'22px 0 46px'}},
        h('div',{style:{width:'800px',maxWidth:'100%',flexShrink:0,zoom:String(z),background:'#fff',border:'1px solid '+C.blt,borderRadius:'8px',boxShadow:'0 10px 34px rgba(9,20,34,.2)',padding:'28px 30px 38px'}}, body)));
  }

  fulfillStepper(){ const q=this.S.qty;
    const btn=(lbl,d,dis)=>h('button',{onClick:()=>{ if(!dis) this.setQty(d); },disabled:dis,style:{width:'26px',height:'26px',borderRadius:'8px',border:'1px solid '+C.border,background:dis?C.s2:'#fff',color:dis?C.border:C.blue,fontSize:'15px',fontWeight:900,cursor:dis?'default':'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center'}},lbl);
    return h('div',{style:{display:'flex',alignItems:'center',gap:'8px',background:'#fff',border:'1px solid '+C.blueBd,borderRadius:'10px',padding:'5px 6px'}},
      btn('−',-1,q<=1),
      h('div',{style:{minWidth:'54px',textAlign:'center'}},h('div',{style:{fontSize:'14px',fontWeight:800,color:C.navy,lineHeight:1}},AR(q)),h('div',{style:{fontSize:'8px',fontWeight:700,color:C.muted,marginTop:'1px'}},'وحدة')),
      btn('+',1,q>=4)); }

  ackRow(t){ const s=TTYPE[t.type]||TTYPE.ack;
    return h('div',{key:t.id,style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px',background:s.bg,border:'1px solid '+s.bd,borderRadius:'11px',padding:'11px 13px',marginBottom:'8px'}},
      h('div',{style:{minWidth:0}},
        h('div',{style:{display:'flex',alignItems:'center',gap:'7px',flexWrap:'wrap'}},h('span',{style:{fontSize:'12.5px',fontWeight:800,color:C.navy}},t.name),this.typeBadge(t.type)),
        this.enTag(t.en),
        t.desc?h('div',{style:{fontSize:'10px',color:C.muted,fontWeight:600,marginTop:'3px',lineHeight:1.5}},t.desc):null),
      t.fulfill? h('div',{style:{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'6px',flexShrink:0}},
          h('span',{style:{fontSize:'12px',fontWeight:800,color:C.navy}},t.agreedVal),
          this.fulfillStepper())
        : h('div',{style:{fontSize:'12px',fontWeight:800,color:t.type==='priced'?C.green:C.navy,textAlign:'end',flexShrink:0,maxWidth:'170px'}},t.agreedVal)); }

  qsAckTerms(){ const ack=this.S.terms.filter(t=>t.ack&&!t.deferredTerm);
    if(!ack.length) return null;
    return h('div',{style:{marginTop:'16px',paddingTop:'14px',borderTop:'1px dashed '+C.border}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'7px',marginBottom:'11px'}},
        h('span',{style:{fontSize:'13px'}},'🔒'),
        h('div',{style:{fontSize:'11.5px',fontWeight:800,color:C.muted}},'بنود للقراءة فقط — للإقرار وللعلم (غير قابلة للعرض المضاد)')),
      this.catGroups(ack).map(g=>h('div',{key:'ak-'+g.cat.key,style:{marginBottom:'6px'}}, this.catHead(g.cat,g.items.length), g.items.map(t=>this.ackRow(t)))));
  }

  qsAgreedTerms(){ const agreed=this.S.terms.filter(t=>t.state==='agreed'&&!t.ack);
    if(!agreed.length) return null;
    return h('div',{style:{marginTop:'14px',paddingTop:'12px',borderTop:'1px dashed '+C.border}},
      h('div',{style:{fontSize:'11px',fontWeight:700,color:C.muted,marginBottom:'9px'}},'بنود متفق عليها ('+AR(agreed.length)+')'),
      agreed.map(t=>h('div',{key:t.id,style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',padding:'8px 0'}},
        h('div',{style:{minWidth:0}},h('span',{style:{fontSize:'12px',fontWeight:600,color:C.navy}},t.name+': '),h('span',{style:{fontSize:'12px',fontWeight:700,color:t.deferredTerm?C.amber:C.green}},t.agreedVal)),
        t.deferredTerm? h('span',{style:{fontSize:'9.5px',color:C.amber,fontWeight:700,flexShrink:0}},'مؤجّل') : h('button',{onClick:()=>this.reopenTerm(t.id),style:{background:'#fff',border:'1px solid '+C.border,color:C.muted,borderRadius:'8px',padding:'5px 10px',fontSize:'10.5px',fontWeight:600,cursor:'pointer',fontFamily:'inherit',flexShrink:0}},'↻ أعد الفتح'))));
  }

  qsSupplierRespond(){ const S=this.S, my=this.myLastRound(), mp=my.pos, sp=this.supPos();
    const countered=S.terms.filter(t=>t.state==='countered').length;
    const matched=S.terms.filter(t=>t.state==='agreed'&&!t.deferredTerm).length;
    const wrow=(label,now,was,excl)=>h('div',{key:label,style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid '+C.blt}},
      h('span',{style:{fontSize:'12px',fontWeight:600,color:C.navy}},label),
      h('div',{style:{display:'flex',alignItems:'center',gap:'8px',direction:'ltr'}},
        was!=null?h('span',{style:{fontSize:'10.5px',color:C.red,textDecoration:'line-through',fontWeight:700}},was):null,
        h('span',{style:{fontSize:'12.5px',fontWeight:700,color:excl?C.muted:C.deep,fontFamily:'ui-monospace,monospace'}},now)));
    const rateNow=this.rateLineTotal(mp.rate), rateWas=this.rateLineTotal(sp.rate);
    return h('div',{},
      h('div',{style:{background:'linear-gradient(135deg,'+C.navy+','+C.deep+')',color:'#fff',borderRadius:'16px',padding:'16px 18px',marginBottom:'12px'}},
        h('div',{style:{display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px'}},
          h('span',{style:{fontSize:'13px',fontWeight:800}},'عرضك المضاد — أُرسل'),
          h('span',{style:{marginInlineStart:'auto',fontSize:'10px',fontWeight:800,background:'rgba(255,255,255,.16)',border:'1px solid rgba(255,255,255,.25)',borderRadius:'100px',padding:'3px 10px'}},'الجولة '+AR(this.roundNo()))),
        h('div',{style:{textAlign:'center'}},
          h('div',{style:{fontSize:'30px',fontWeight:800,fontFamily:'ui-monospace,monospace',direction:'ltr'}},fmtEN(my.total)+' ﷼'),
          h('div',{style:{fontSize:'10.5px',opacity:.75,fontWeight:600,marginTop:'2px'}},'سعرك المضاد الإجمالي'))),
      h('div',{style:{background:'#fff',border:'1px solid '+C.blt,borderRadius:'14px',padding:'4px 15px 13px',marginBottom:'12px'}},
        h('div',{style:{fontSize:'10px',fontWeight:800,letterSpacing:'.3px',color:C.muted,padding:'12px 0 2px'}},'تفاصيل السعر'),
        wrow('الإيجار ('+AR(this.cfg.duration)+' يوم × '+fmtEN(mp.rate)+')', fmtEN(rateNow)+' ر.س', rateWas!==rateNow?fmtEN(rateWas):null),
        S.operator? wrow('عامل التشغيل', fmtEN(OPERATOR)+' ر.س', null):null,
        wrow('التعبئة (موب)', mp.incMob?fmtEN(mp.mob)+' ر.س':'مستبعدة', (sp.incMob&&!mp.incMob)?fmtEN(sp.mob):null, !mp.incMob),
        wrow('الإرجاع (ديموب)', mp.incDemob?fmtEN(mp.demob)+' ر.س':'مستبعد', (sp.incDemob&&!mp.incDemob)?fmtEN(sp.demob):null, !mp.incDemob),
        h('div',{style:{display:'flex',justifyContent:'space-between',padding:'11px 0 2px',fontSize:'14px',fontWeight:800,color:C.deep}},h('span',{},'الإجمالي'),h('span',{style:{direction:'ltr',color:C.blue}},fmtEN(my.total)+' ر.س')),
        (countered||matched)? h('div',{style:{display:'flex',gap:'8px',justifyContent:'center',marginTop:'12px'}},
          countered? h('span',{style:{fontSize:'11px',fontWeight:800,color:C.amber,background:C.amberLt,border:'1px solid '+C.amberBd,borderRadius:'100px',padding:'5px 13px'}},'⚡ '+AR(countered)+' بنود مضادة'):null,
          matched? h('span',{style:{fontSize:'11px',fontWeight:800,color:C.green,background:C.greenLt,border:'1px solid '+C.greenBd,borderRadius:'100px',padding:'5px 13px'}},'✓ '+AR(matched)+' مطابقة'):null) : null),
      this.rRoundsLog(),
      h('div',{style:{background:C.amberLt,border:'1px solid '+C.amberBd,borderRadius:'12px',padding:'12px 14px',fontSize:'12px',fontWeight:700,color:'#8a4f08',textAlign:'center',marginBottom:'14px',lineHeight:1.6}},'⏳ أُرسل للمورد — سيصلك ردّه هنا وفي غرفة المحادثة'),
      h('button',{onClick:()=>this.openSupplierView(),style:{width:'100%',background:C.deep,color:'#fff',border:'none',borderRadius:'12px',padding:'13px',fontSize:'13px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},'👁 افتح شاشة المورد للردّ'));
  }

  qsBody(){ const S=this.S, sp=this.supPos(), d=S.price.draft, my=this.myLastRound();
    if(this.qsStep==='terms'){ const secs=this.termSections(); const flat=this.negotiableTerms(); const decided=flat.filter(t=>t.pending).length;
      return h('div',{},
        h('div',{style:{display:'flex',alignItems:'center',gap:'12px',background:'#fff',border:'1px solid '+C.blt,borderRadius:'14px',padding:'12px 15px',marginBottom:'12px'}},
          h('button',{onClick:()=>this.acceptAllTerms(),style:{background:C.greenLt,border:'1.5px solid '+C.greenBd,color:C.green,borderRadius:'10px',padding:'10px 16px',fontSize:'13px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},'✓ قبول الكل'),
          h('div',{style:{flex:1,fontSize:'12px',color:C.muted,fontWeight:600,lineHeight:1.6,textAlign:'end'}},'اقبل عرض المورد أو اقترح بديلاً لكل بند · حُسم '+AR(decided)+'/'+AR(flat.length))),
        h('div',{style:{display:'flex',alignItems:'center',gap:'18px',flexWrap:'wrap',margin:'0 4px 14px'}},
          this.legendDot(C.blue,'بانتظار قرارك'), this.legendDot(C.green,'يطابق المورد'), this.legendDot(C.red,'يختلف · بديلك')),
        secs.map((s,i)=>this.termSectionCard(s,i)));
    }
    if(this.qsStep==='review'){ const accepts=S.terms.filter(t=>t.pending&&t.pending.state==='agreed'); const counters=S.terms.filter(t=>t.pending&&t.pending.state==='counter'); const pd=this.priceDiffNow();
      const acks=['maintenance','working_days','working_hours'].map(id=>S.terms.find(t=>t.id===id)).filter(Boolean);
      return h('div',{},
        this.rQuoteSheet(d,sp),
        h('div',{style:{background:C.s2,borderRadius:'13px',padding:'16px',marginBottom:'12px'}},
          h('div',{style:{fontSize:'13px',fontWeight:800,color:C.muted,marginBottom:'11px'}},'ملخص السعر'),
          this.reviewRow('عرض المورد',fmtEN(this.posTotal(sp))+' ر.س',C.muted),
          this.reviewRow('عرضك',fmtEN(this.posTotal(d))+' ر.س',pd?C.blue:C.green,true)),
        h('div',{style:{background:C.s2,borderRadius:'13px',padding:'16px',marginBottom:'12px'}},
          h('div',{style:{fontSize:'13px',fontWeight:800,color:C.muted,marginBottom:'11px'}},'شروط التشغيل'),
          accepts.length||counters.length? [].concat(
            accepts.map(t=>this.reviewRow(t.name,t.pending.value+' ✓ متفق',C.green)),
            counters.map(t=>this.reviewRow(t.name,t.pending.value+' · بديلك',C.red))
          ) : h('div',{style:{fontSize:'13px',color:C.muted}},'لا تغييرات على الشروط')),
        h('div',{style:{background:C.greenLt,border:'1px solid '+C.greenBd,borderRadius:'13px',padding:'16px'}},
          h('div',{style:{display:'flex',alignItems:'center',gap:'7px',fontSize:'13px',fontWeight:800,color:C.green,marginBottom:'11px'}},h('span',{},'✓'),'مُقرّ من المورد — بلا تفاوض'),
          acks.map((t,i)=>h('div',{key:t.id,style:{display:'flex',justifyContent:'space-between',gap:'12px',padding:'8px 0',borderBottom:i<acks.length-1?'1px solid '+C.greenBd:'none',fontSize:'13px'}},
            h('span',{style:{color:C.navy,fontWeight:700}},t.name),
            h('span',{style:{color:C.green,fontWeight:800,direction:'rtl'}},t.agreedVal)))));
    }
    // supplier's respond-to-counter view — full parity, same fields, just locked
    if(S.price.turn==='supplier' && !S.price.agreed) return this.qsSupplierRespond();
    // paper — price table only (payment moved to its own wizard step)
    return this.qsPaper();
  }

  qtTripRow(label,sub,field,val,inc,supVal,cs){
    const changed=inc&&supVal!=null&&val!==supVal;
    const inp=inc? h('div',{},
      h('label',{style:{display:'inline-flex',alignItems:'center',gap:'4px',border:'1.5px solid '+(changed?C.amber:C.blue),borderRadius:'9px',background:changed?C.amberLt:C.blueLt,padding:'5px 8px',cursor:'text',boxShadow:'0 1px 3px rgba(37,99,235,.14)'}},
        h('span',{style:{fontSize:'13px',color:changed?C.amber:C.blue}},'✎'),
        h('input',{type:'number',value:val,onChange:e=>this.onPrice(field,e.target.value),style:{width:'58px',border:'none',background:'transparent',textAlign:'center',fontSize:'14px',fontWeight:800,outline:'none',color:C.navy,fontFamily:'inherit',padding:0}})),
      supVal!=null?h('div',{style:{fontSize:'11px',fontWeight:700,marginTop:'4px',direction:'ltr',color:changed?C.amber:C.muted}},changed?h('span',{},'المورد ',h('span',{style:{textDecoration:'line-through'}},fmtEN(supVal))):'المورد '+fmtEN(supVal)):null) : h('span',{style:{fontSize:'14px',color:C.muted,fontWeight:700}},'—');
    return h('tr',{style:{opacity:inc?1:.6,background:inc?'transparent':C.s2}},
      h('td',{style:cs},h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
        h('button',{onClick:()=>this.toggleRow(field),title:inc?'استبعاد':'تضمين',style:{width:'22px',height:'22px',borderRadius:'50%',border:'none',background:inc?C.redLt:C.greenLt,color:inc?C.red:C.green,fontSize:'12px',fontWeight:900,cursor:'pointer',flexShrink:0}},inc?'✕':'+'),
        h('div',{},h('div',{style:{fontWeight:700,color:C.navy,fontSize:'14px',textDecoration:inc?'none':'line-through'}},label),h('div',{style:{fontSize:'11px',color:C.muted,marginTop:'2px'}},sub)))),
      h('td',{style:Object.assign({textAlign:'center',color:C.muted},cs)},'رحلة'),
      h('td',{style:Object.assign({textAlign:'center',color:C.navy},cs)},'١'),
      h('td',{style:Object.assign({textAlign:'center'},cs)},inp),
      h('td',{style:Object.assign({textAlign:'end',fontWeight:700,color:inc?C.navy:C.muted,fontFamily:'ui-monospace,monospace',direction:'ltr'},cs)},inc?fmtEN(val):'مستبعد')); }

  paySelect(field,label,opts){ const v=this.paySel[field], st=this.payState(field);
    const bd=st==='match'?C.green:st==='conflict'?C.red:C.blueBd;
    const pill=v? (st==='match'
      ? h('span',{style:{fontSize:'12px',fontWeight:800,color:C.green}},'✓ يطابق المورد')
      : h('span',{style:{fontSize:'12px',fontWeight:800,color:C.red}},'✕ يختلف عن المورد')) : null;
    return h('div',{style:{flex:1,minWidth:0}},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',marginBottom:'7px'}},
        h('div',{style:{fontSize:'14px',fontWeight:700,color:C.navy}},label), pill),
      h('select',{value:v,onChange:e=>this.onPay(field,e.target.value),style:{width:'100%',height:'48px',border:'2px solid '+bd,borderRadius:'11px',padding:'0 12px',fontFamily:'inherit',fontSize:'14px',fontWeight:700,color:v?C.navy:C.muted,background:st==='match'?C.greenLt:st==='conflict'?C.redLt:'#fff',outline:'none',cursor:'pointer'}},
        h('option',{value:''},'— اختر —'),
        opts.map(o=>h('option',{key:o,value:o},o))),
      h('div',{style:{fontSize:'12px',color:C.muted,fontWeight:600,marginTop:'6px'}},'المورّد: ',h('b',{style:{color:st==='conflict'?C.red:st==='match'?C.green:C.navy}},SUP_PAY[field]))); }

  priceInputCell(field,val,supVal,cs){ const changed=(supVal!=null)&&val!==supVal;
    return h('td',{style:Object.assign({textAlign:'center'},cs)},
      h('label',{style:{display:'inline-flex',alignItems:'center',gap:'4px',border:'1.5px solid '+(changed?C.amber:C.blue),borderRadius:'9px',background:changed?C.amberLt:C.blueLt,padding:'5px 8px',cursor:'text',boxShadow:'0 1px 3px rgba(37,99,235,.14)'}},
        h('span',{style:{fontSize:'13px',color:changed?C.amber:C.blue}},'✎'),
        h('input',{type:'number',value:val,onChange:e=>this.onPrice(field,e.target.value),style:{width:'58px',border:'none',background:'transparent',textAlign:'center',fontSize:'14px',fontWeight:800,outline:'none',color:C.navy,fontFamily:'inherit',padding:0}})),
      supVal!=null? h('div',{style:{fontSize:'11px',fontWeight:700,marginTop:'4px',direction:'ltr'}}, changed? h('span',{style:{color:C.amber}},'المورد ',h('span',{style:{textDecoration:'line-through'}},fmtEN(supVal))) : h('span',{style:{color:C.muted}},'المورد '+fmtEN(supVal))) : null);
  }

  qsPaper(){ const S=this.S, sp=this.supPos(), d=S.price.draft, my=this.myLastRound();
    const th=(t,a)=>h('th',{style:{background:C.navy,color:'#fff',fontSize:'13px',fontWeight:700,padding:'12px 11px',textAlign:a||'start',whiteSpace:'nowrap'}},t);
    const cs={padding:'14px 11px',borderBottom:'1px solid '+C.blt,fontSize:'14px',verticalAlign:'middle'};
    const rateLine=this.rateLineTotal(d.rate);
    const subtotal=this.posTotal(d), tax=Math.round(subtotal*0.15), net=subtotal+tax;
    const configCard=h('div',{style:{background:C.s2,border:'1px solid '+C.blt,borderRadius:'13px',padding:'13px',marginBottom:'12px'}},
      h('div',{style:{fontSize:'12px',fontWeight:800,letterSpacing:'.4px',color:C.blue,marginBottom:'10px'}},'⚙ نمط المدة والفوترة'),
      h('div',{style:{display:'flex',gap:'8px',marginBottom:'11px'}},
        [['fixed','مدة محددة','مدة معروفة مسبقاً'],['open','مفتوح · قابل للتمديد','يُحتسب حسب التشغيل الفعلي']].map(m=>h('button',{key:m[0],onClick:()=>this.setMode(m[0]),style:{flex:1,background:this.cfg.mode===m[0]?C.amberLt:'#fff',border:'1.5px solid '+(this.cfg.mode===m[0]?C.amberBd:C.border),borderRadius:'9px',padding:'10px 12px',textAlign:'start',fontFamily:'inherit',cursor:'pointer'}},
          h('div',{style:{fontSize:'14px',fontWeight:700,color:this.cfg.mode===m[0]?'#8a4f08':C.navy}},m[1]),
          h('div',{style:{fontSize:'12px',color:C.muted,marginTop:'3px'}},m[2])))),
      h('div',{style:{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}},
        h('span',{style:{fontSize:'14px',fontWeight:700,color:C.navy}},'الفوترة'),
        h('div',{style:{display:'inline-flex',background:'#fff',border:'1px solid '+C.border,borderRadius:'8px',overflow:'hidden'}},
          [['daily','يومي'],['weekly','أسبوعي'],['monthly','شهري']].map(f=>h('button',{key:f[0],onClick:()=>this.setFreq(f[0]),style:{border:'none',background:this.cfg.frequency===f[0]?C.navy:'transparent',color:this.cfg.frequency===f[0]?'#fff':C.muted,padding:'8px 13px',fontSize:'14px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},f[1]))),
        this.cfg.mode==='fixed'? h('span',{style:{fontSize:'14px',fontWeight:700,color:C.navy,marginInlineStart:'4px'}},'المدة') : null,
        this.cfg.mode==='fixed'? h('input',{type:'number',value:this.cfg.duration,onChange:e=>this.onDuration(e.target.value),style:{width:'62px',border:'1.5px solid '+C.blueBd,borderRadius:'7px',textAlign:'center',fontSize:'14px',fontWeight:700,padding:'7px',fontFamily:'inherit',outline:'none',color:C.navy}}) : null,
        this.cfg.mode==='fixed'? h('span',{style:{fontSize:'12px',color:C.muted,fontWeight:600}},'يوم') : null));
    const taxRow=(k,v)=>h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0'}},
      h('span',{style:{fontSize:'11.5px',fontWeight:600,color:C.muted}},k),h('span',{style:{fontSize:'12.5px',fontWeight:700,color:C.navy,fontFamily:'ui-monospace,monospace',direction:'ltr'}},v));
    return h('div',{},
      my&&!S.price.agreed? h('div',{style:{display:'flex',alignItems:'center',gap:'12px',background:'linear-gradient(135deg,'+C.navy+','+C.deep+')',color:'#fff',borderRadius:'14px',padding:'16px 18px',marginBottom:'16px'}},
        h('div',{style:{flex:1,textAlign:'center'}},h('div',{style:{fontSize:'11px',opacity:.7,fontWeight:700}},'عرض المورد'),h('div',{style:{fontSize:'23px',fontWeight:800,fontFamily:'ui-monospace,monospace',direction:'ltr'}},fmtEN(this.posTotal(sp)))),
        h('div',{style:{fontSize:'20px',opacity:.6}},'⇄'),
        h('div',{style:{flex:1,textAlign:'center'}},h('div',{style:{fontSize:'11px',opacity:.7,fontWeight:700}},'عرضك الأخير'),h('div',{style:{fontSize:'23px',fontWeight:800,color:'#8FD0FF',fontFamily:'ui-monospace,monospace',direction:'ltr'}},fmtEN(my.total)))) : null,
      this.rRoundsLog(),
      configCard,
      h('div',{style:{display:'flex',alignItems:'center',gap:'10px',background:C.blueLt,border:'1px solid '+C.blueBd,borderRadius:'12px',padding:'13px 15px',marginBottom:'14px'}},
        h('span',{style:{fontSize:'19px'}},'💬'),
        h('div',{style:{fontSize:'14px',fontWeight:700,color:C.navy,lineHeight:1.7}},'القيم المعروضة هي ',h('b',{style:{color:C.blue}},'عرض المورد'),' — عدّل أي سعر لإرسال ',h('b',{style:{color:C.blue}},'عرض مضاد'),' له')),
      h('div',{style:{fontSize:'14px',fontWeight:800,color:C.muted,letterSpacing:'.3px',margin:'2px 2px 9px'}},'١ السعر — عدّل أي قيمة للمقابلة'),
      h('table',{style:{width:'100%',borderCollapse:'collapse',marginBottom:'14px',border:'1px solid '+C.blt,borderRadius:'12px',overflow:'hidden'}},
        h('thead',{},h('tr',{},th('البند'),th('الوحدة','center'),th('العدد','center'),th('✎ السعر · قابل للتعديل','center'),th('الإجمالي','end'))),
        h('tbody',{},
          h('tr',{},
            h('td',{style:cs},h('div',{style:{fontWeight:700,color:C.navy,fontSize:'14px'}},'الإيجار الأساسي'),h('div',{style:{fontSize:'11px',color:C.muted,marginTop:'2px'}},'حسب مواصفات الطلب')),
            h('td',{style:Object.assign({textAlign:'center',color:C.muted},cs)},this.cfg.mode==='open'?('/'+FREQ_UNIT[this.cfg.frequency]):(AR(this.cfg.duration)+' '+FREQ_UNIT[this.cfg.frequency])),
            h('td',{style:Object.assign({textAlign:'center',fontWeight:700,color:C.navy},cs)},AR(S.qty)),
            this.priceInputCell('rate',d.rate,sp.rate,cs),
            h('td',{style:Object.assign({textAlign:'end',fontWeight:700,color:C.navy,fontFamily:'ui-monospace,monospace',direction:'ltr'},cs)},this.cfg.mode==='open'?fmtEN(d.rate)+'/'+FREQ_UNIT[this.cfg.frequency]:fmtEN(rateLine))),
          this.qtTripRow('التعبئة / التوصيل','رحلة واحدة · لكل بند','mob',d.mob,d.incMob,sp.mob,cs),
          this.qtTripRow('الإرجاع / الإعادة','رحلة واحدة · لكل بند','demob',d.demob,d.incDemob,sp.demob,cs))),
      this.qtyStepperCard(),
      h('div',{style:{marginTop:'18px'}},
        h('div',{style:{fontSize:'14px',fontWeight:800,color:C.muted,letterSpacing:'.3px',margin:'2px 2px 11px'}},'٢ شروط الدفع — مطلوبة للمتابعة'),
        h('div',{style:{display:'flex',gap:'12px'}},
          this.paySelect('schedule','الجدولة',PAY_SCHEDULES),
          this.paySelect('method','الطريقة',PAY_METHODS))));
  }

  qtyStepperCard(){ const S=this.S, q=S.qty;
    const b=(lbl,d,dis)=>h('button',{onClick:()=>{ if(!dis) this.setQty(d); },disabled:dis,style:{width:'46px',height:'46px',borderRadius:'12px',border:'1.5px solid '+C.border,background:dis?C.s2:'#fff',color:dis?C.border:C.navy,fontSize:'23px',fontWeight:700,cursor:dis?'default':'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}},lbl);
    return h('div',{style:{display:'flex',alignItems:'center',gap:'14px',background:'#fff',border:'1px solid '+C.blt,borderRadius:'14px',padding:'16px 18px',marginTop:'2px'}},
      h('span',{style:{width:'44px',height:'44px',borderRadius:'12px',background:C.blueLt,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'21px',flexShrink:0}},'🔢'),
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{fontSize:'14px',fontWeight:800,color:C.navy}},'الكمية المطلوبة — '+AR(q)+' وحدة'),
        h('div',{style:{fontSize:'12px',color:C.muted,fontWeight:600,marginTop:'3px',lineHeight:1.6}},'يعدّلها المستأجر فقط — المورّد لا يغيّرها · كمية الطلب الأساسية ثابتة')),
      h('div',{style:{display:'flex',alignItems:'center',gap:'12px',flexShrink:0}},
        b('−',-1,q<=1),
        h('div',{style:{minWidth:'42px',textAlign:'center'}},h('div',{style:{fontSize:'22px',fontWeight:800,color:C.navy,lineHeight:1}},AR(q)),h('div',{style:{fontSize:'10.5px',fontWeight:700,color:C.muted,marginTop:'3px'}},'وحدة')),
        b('+',1,q>=4)));
  }

  qsPaperOld(){ const S=this.S, sp=this.supPos(), d=S.price.draft, my=this.myLastRound();
    return h('div',{},
      my&&!S.price.agreed? h('div',{style:{display:'flex',alignItems:'center',gap:'12px',background:C.s2,borderRadius:'13px',padding:'12px',marginBottom:'14px'}},
        h('div',{style:{flex:1,textAlign:'center'}},h('div',{style:{fontSize:'9.5px',color:C.muted,fontWeight:600}},'عرض المورد'),h('div',{style:{fontSize:'17px',fontWeight:700,color:C.navy}},fmtEN(this.posTotal(sp)))),
        h('div',{style:{fontSize:'16px',color:C.muted}},'⇄'),
        h('div',{style:{flex:1,textAlign:'center'}},h('div',{style:{fontSize:'9.5px',color:C.muted,fontWeight:600}},'عرضك الأخير'),h('div',{style:{fontSize:'17px',fontWeight:700,color:C.blue}},fmtEN(my.total)))) : null,
      this.rRoundsLog(),
      // rental mode
      this.h4('نمط التأجير'),
      h('div',{style:{display:'flex',gap:'8px',marginBottom:'14px'}},
        [['fixed','مدة محددة'],['open','مفتوح المدة']].map(m=>h('button',{key:m[0],onClick:()=>this.setMode(m[0]),style:{flex:1,background:this.cfg.mode===m[0]?C.blueLt:'#fff',border:'1.5px solid '+(this.cfg.mode===m[0]?C.blueBd:C.border),color:this.cfg.mode===m[0]?C.blue:C.navy,borderRadius:'10px',padding:'10px',fontSize:'12px',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}},m[1]))),
      // frequency
      this.h4('دورة الفوترة'),
      h('div',{style:{display:'flex',gap:'6px',marginBottom:'14px'}},
        [['daily','يومي'],['weekly','أسبوعي'],['monthly','شهري']].map(f=>h('button',{key:f[0],onClick:()=>this.setFreq(f[0]),style:{flex:1,background:this.cfg.frequency===f[0]?C.deep:'#fff',border:'1px solid '+(this.cfg.frequency===f[0]?C.deep:C.border),color:this.cfg.frequency===f[0]?'#fff':C.navy,borderRadius:'9px',padding:'9px',fontSize:'11.5px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}},f[1]))),
      // rate + duration
      h('div',{style:{display:'flex',gap:'10px',marginBottom:'14px'}},
        h('div',{style:{flex:1}},this.h4('الإيجار / '+FREQ_UNIT[this.cfg.frequency]),
          h('input',{type:'number',value:d.rate,onChange:e=>this.onPrice('rate',e.target.value),style:this.numInput()})),
        this.cfg.mode==='fixed'? h('div',{style:{flex:1}},this.h4('المدة (أيام)'),
          h('input',{type:'number',value:this.cfg.duration,onChange:e=>this.onDuration(e.target.value),style:this.numInput()})) : null),
      // line items
      this.h4('البنود'),
      this.lineRow('الإيجار ('+AR(this.S.qty)+' وحدة'+(this.cfg.mode==='fixed'?' × '+AR(this.cfg.duration)+' يوم':'')+')',fmtEN(this.rateLineTotal(d.rate)),true,null),
      this.S.operator? this.lineRow('عامل تشغيل',fmtEN(OPERATOR),true,null):null,
      this.lineRow('التعبئة (موب)',fmtEN(d.mob),d.incMob,()=>this.toggleRow('mob')),
      this.lineRow('الإرجاع (ديموب)',fmtEN(d.demob),d.incDemob,()=>this.toggleRow('demob')),
      h('div',{style:{display:'flex',justifyContent:'space-between',padding:'12px 2px 4px',fontSize:'16px',fontWeight:700,color:C.deep,borderTop:'2px solid '+C.blt,marginTop:'6px'}},h('span',{},'الإجمالي'),h('span',{},fmtEN(this.posTotal(d))+' ر.س')),
      // payment
      h('div',{style:{marginTop:'16px'}},this.h4('شروط الدفع — يجب حسمها قبل المتابعة'),
        this.payPicker('schedule','جدول الدفع',PAY_SCHEDULES),
        this.payPicker('method','طريقة الدفع',PAY_METHODS)),
      // scope
      h('div',{style:{marginTop:'16px',background:C.s2,borderRadius:'13px',padding:'13px'}},
        h('div',{style:{fontSize:'11px',fontWeight:700,color:C.muted,marginBottom:'10px'}},'النطاق — تغيير الكمية أو العامل يعيد فتح السعر'),
        h('div',{style:{display:'flex',gap:'10px'}},
          h('div',{style:{flex:1,display:'flex',alignItems:'center',justifyContent:'space-between'}},h('span',{style:{fontSize:'12px',fontWeight:600,color:C.navy}},'الكمية'),
            h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},h('button',{onClick:()=>this.setQty(-1),style:this.stepBtn()},'−'),h('b',{style:{fontSize:'13px'}},AR(this.S.qty)),h('button',{onClick:()=>this.setQty(1),style:this.stepBtn()},'+'))),
          h('div',{style:{flex:1,display:'flex',alignItems:'center',justifyContent:'space-between'}},h('span',{style:{fontSize:'12px',fontWeight:600,color:C.navy}},'عامل'),
            h('div',{style:{display:'flex',gap:'4px'}},h('button',{onClick:()=>this.setOp(true),style:this.segBtn(this.S.operator)},'مع'),h('button',{onClick:()=>this.setOp(false),style:this.segBtn(!this.S.operator)},'بدون'))))));
  }

  numInput(){ return {width:'100%',background:'#fff',border:'1.5px solid '+C.border,borderRadius:'10px',padding:'11px 13px',fontSize:'15px',fontWeight:700,color:C.deep,outline:'none',fontFamily:'inherit',textAlign:'center'}; }

  stepBtn(){ return {width:'28px',height:'28px',borderRadius:'8px',border:'1px solid '+C.border,background:'#fff',color:C.navy,fontSize:'15px',cursor:'pointer',fontWeight:700}; }

  segBtn(on){ return {background:on?C.blue:'#fff',color:on?'#fff':C.muted,border:'1px solid '+(on?C.blue:C.border),borderRadius:'8px',padding:'6px 12px',fontSize:'11.5px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}; }

  lineRow(label,val,inc,toggle){ return h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 2px',borderBottom:'1px solid '+C.blt,opacity:inc?1:.45}},
    h('div',{style:{display:'flex',alignItems:'center',gap:'9px'}},
      toggle? h('button',{onClick:toggle,style:{width:'20px',height:'20px',borderRadius:'6px',border:'1.5px solid '+(inc?C.blue:C.border),background:inc?C.blue:'#fff',color:'#fff',fontSize:'11px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}},inc?'✓':'') : null,
      h('span',{style:{fontSize:'12.5px',fontWeight:600,color:C.navy}},label)),
    h('span',{style:{fontSize:'13px',fontWeight:700,color:C.deep}},val+' ر.س')); }

  payPicker(field,label,opts){ const st=this.payState(field);
    return h('div',{style:{marginBottom:'10px'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'7px',fontSize:'11.5px',fontWeight:600,color:C.navy,marginBottom:'7px'}},label,
        st==='open'?h('span',{style:{fontSize:'10px',color:C.amber,fontWeight:700}},'○ لم يُحسم'):st==='match'?h('span',{style:{fontSize:'10px',color:C.green,fontWeight:700}},'✓ يطابق المورد'):h('span',{style:{fontSize:'10px',color:C.blue,fontWeight:700}},'مختلف عن المورد')),
      h('div',{style:{display:'flex',flexWrap:'wrap',gap:'6px'}},opts.map(o=>{ const on=this.paySel[field]===o;
        return h('button',{key:o,onClick:()=>this.onPay(field,o),style:{background:on?C.blueLt:'#fff',border:'1.5px solid '+(on?C.blueBd:C.border),color:on?C.blue:C.navy,borderRadius:'9px',padding:'8px 12px',fontSize:'11px',fontWeight:600,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:'5px'}},o,o===SUP_PAY[field]?h('span',{style:{fontSize:'9px',color:C.green}},'(المورد)'):null); }))); }

  reviewRow(label,val,color,strong){ return h('div',{style:{display:'flex',justifyContent:'space-between',gap:'10px',padding:'7px 0',fontSize:'14px'}},h('span',{style:{color:C.muted,fontWeight:600}},label),h('span',{style:{fontWeight:strong?800:700,color:color}},val)); }

  qsFoot(){ const S=this.S;
    const nextBtn=(lbl,gate,onGo)=>h('button',{onClick:()=>{ if(!gate) onGo(); },disabled:gate,style:{flex:1,background:gate?C.surface:C.blue,color:gate?C.muted:'#fff',border:'none',borderRadius:'11px',padding:'13px',fontSize:'13px',fontWeight:800,cursor:gate?'default':'pointer',fontFamily:'inherit'}},lbl);
    if(S.price.agreed) return h('div',{style:{display:'flex',gap:'10px'}},
      h('button',{onClick:()=>this.closeQuote(),style:this.btnGhost()},'→ رجوع'),
      h('button',{onClick:()=>this.toast('تحميل عرض السعر (نموذج)'),style:Object.assign({},this.btn(C.green))},'📄 تحميل عرض السعر'));
    if(S.price.turn==='supplier') return h('button',{onClick:()=>this.closeQuote(),style:Object.assign({},this.btnGhost(),{width:'100%'})},'→ رجوع للغرفة');
    const steps=this.wizSteps(); const i=steps.findIndex(s=>s.key===this.qsStep);
    const prev=i>0?steps[i-1].key:null, next=i<steps.length-1?steps[i+1].key:null;
    const back=h('button',{onClick:()=>prev?this.goStep(prev):this.closeQuote(),style:this.btnGhost()}, prev?'→ رجوع':'→ إغلاق');
    if(this.qsStep==='paper'){ const gate=!this.payDecided();
      return h('div',{style:{display:'flex',gap:'10px'}}, back, nextBtn(gate?'اختر شروط الدفع للمتابعة':(next==='terms'?'التالي: الشروط ←':'مراجعة وإرسال ←'),gate,()=>this.goStep(next))); }
    if(this.qsStep==='terms'){ const neg=this.negotiableTerms(); const decided=neg.filter(t=>t.pending).length; const gate=decided<neg.length;
      return h('div',{style:{display:'flex',gap:'10px'}}, back, nextBtn(gate?'احسم كل البنود ('+AR(decided)+'/'+AR(neg.length)+')':'مراجعة وإرسال ←',gate,()=>this.goStep(next))); }
    return h('div',{style:{display:'flex',gap:'10px'}}, back,
      h('button',{onClick:()=>this.submitResponse(),style:Object.assign({},this.btn(C.blue),{flex:1,padding:'13px',fontSize:'13px',fontWeight:800})},'إرسال الرد ✓'));
  }

