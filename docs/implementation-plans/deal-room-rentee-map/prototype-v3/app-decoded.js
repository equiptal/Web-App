

const h = React.createElement;
const C = {
  // Aligned to the request/bids screen: navy is the action colour, orange the single accent, and the page
  // sits on a cool blue-grey rather than near-white. Blue is no longer a primary — it was the only thing
  // making this surface look like a different product.
  bg:'#EDF2F7', white:'#fff', blue:'#16304F', blueLt:'rgba(22,48,79,.07)', blueBd:'rgba(22,48,79,.22)',
  orange:'#E8890C', orangeLt:'rgba(232,137,12,.10)', orangeBd:'rgba(232,137,12,.32)',
  green:'#16A34A', greenLt:'rgba(22,163,74,.09)', greenBd:'rgba(22,163,74,.25)',
  red:'#D9362A', redLt:'rgba(217,54,42,.09)', redBd:'rgba(217,54,42,.22)',
  amber:'#D4780A', amberLt:'rgba(212,120,10,.10)', amberBd:'rgba(212,120,10,.25)',
  navy:'#1C3550', deep:'#16304F', muted:'#6B8FA8', border:'#C8D8E8', blt:'#E1E9F1', surface:'#EFF4F9', s2:'#EDF2F7'
};
const AR = n => Number(n).toLocaleString('ar-EG');
const toAr = n => String(n).replace(/\d/g, d=>'٠١٢٣٤٥٦٧٨٩'[d]);
const fmtEN = n => Math.round(n).toLocaleString('en-US');
const DAY_RATE=3000, OPERATOR=3000, MOB=1500, DEMOB=1000;
const FREQ_UNIT={daily:'يوم',weekly:'أسبوع',monthly:'شهر'};
const FREQ_DAYS={daily:1,weekly:7,monthly:30};
const SUP_PAY={schedule:'مقدّم 100%',method:'تحويل بنكي'};
const PAY_SCHEDULES=['مقدّم 100%','نصف عند التسليم ونصف عند الإرجاع','دفعات شهرية'];
const PAY_METHODS=['تحويل بنكي','شيك','ضمان بنكي'];
const FLEET=[
  {serial:'FD30T-114522',model:'FD30',maker:'',year:'٢٠١٨',spec:'رافعة شوكية ٣ طن',fit:'bad',fuel:'ديزل',load:'٣ طن',att:'شوكات تمديد',yard:'ساحة القصيم',km:'١٨٥',
    map:{pin:['11%','12%'],chip:['33%','36%'],truck:['13%','19%'],route:'M322,112 C 334,240 236,330 158,430'}},
  {serial:'FD30T-118207',model:'كوماتسو FD30',maker:'كوماتسو',year:'٢٠٢٠',spec:'رافعة شوكية ٣ طن',fit:'ok',certOnFile:true,fuel:'ديزل',load:'٣ طن',att:'شوكات تمديد',yard:'ساحة السلي — الرياض',km:'١٢',
    map:{pin:['44%','21%'],chip:['49%','37%'],truck:['46%','29%'],route:'M305,382 C 255,398 192,418 158,430'}},
  {serial:'8FD35-77140',model:'تويوتا 8FD35',maker:'تويوتا',year:'٢٠٢١',spec:'رافعة شوكية ٣٫٥ طن',fit:'ok',fuel:'ديزل',load:'٣٫٥ طن',att:'',yard:'ساحة الخرج',km:'٩٥',
    map:{pin:['85%','44%'],chip:['66%','51%'],truck:['83%','53%'],route:'M215,730 C 195,630 168,520 158,430'}},
  {serial:'C500-90233',model:'كاتربيلر C500',maker:'كاتربيلر',year:'٢٠٢٢',spec:'مولّد كهرباء ٥٠٠ ك.ف.أ',fit:'ok',certOnFile:true,fuel:'ديزل',load:'٥٠٠ ك.ف.أ',att:'لوحة توزيع',yard:'ساحة السلي — الرياض',km:'١٢',
    map:{pin:['44%','21%'],chip:['49%','37%'],truck:['46%','29%'],route:'M305,382 C 255,398 192,418 158,430'}},
  {serial:'XAS110-4471',model:'أطلس كوبكو XAS',maker:'أطلس كوبكو',year:'٢٠٢٠',spec:'ضاغط هواء ٣٩٠ ق.د.م',fit:'ok',fuel:'ديزل',load:'٣٩٠ CFM',att:'خرطوم ٢٠م',yard:'ساحة الخرج',km:'٩٥',
    map:{pin:['85%','44%'],chip:['66%','51%'],truck:['83%','53%'],route:'M215,730 C 195,630 168,520 158,430'}},
];
// multi-item request: each entry maps to a FLEET unit + its own qty + supplier opening rate
const MULTI_ITEMS=[
  {fleet:0, icon:'🏗️', qty:2, supRate:3000},
  {fleet:3, icon:'⚡', qty:1, supRate:2200},
  {fleet:4, icon:'💨', qty:3, supRate:650},
];
const REQ_ID='REQ-1043', RFQ_ID='RFQ-0012';
// ── term taxonomy: 5 categories, 4 behaviour types ──
const CATS=[
  {key:'price',   emoji:'🚚', label:'السعر واللوجستيات'},
  {key:'operator',emoji:'👷', label:'المشغّل'},
  {key:'equip',   emoji:'🏗️', label:'المعدّة'},
  {key:'work',    emoji:'🗓️', label:'العمل'},
  {key:'pay',     emoji:'💳', label:'الدفع والتجاري'},
];
const CATMAP={}; CATS.forEach(c=>CATMAP[c.key]=c);
const TTYPE={
  neg:   {lbl:'قابل للتفاوض',       c:'#2563EB', bg:'rgba(37,99,235,.08)', bd:'rgba(37,99,235,.22)'},
  ack:   {lbl:'للإقرار · قراءة فقط', c:'#6B8FA8', bg:'#F1F5FA',            bd:'#DCE6F0'},
  info:  {lbl:'للعلم · مرحلة العرض', c:'#D4780A', bg:'rgba(212,120,10,.10)',bd:'rgba(212,120,10,.28)'},
  priced:{lbl:'مُسعّر · خطوة السعر',  c:'#16A34A', bg:'rgba(22,163,74,.09)', bd:'rgba(22,163,74,.28)'},
};
const SITE=[24.6908,46.6853];                 // برج العليا · الرياض
const YARDS=[[26.026,44.020],[24.660,46.828],[24.155,47.335]]; // القصيم · السلي(الرياض) · الخرج
// ── all suppliers bidding on this request ──
// `units` = the machines the supplier actually IDENTIFIED (one EquipmentListing row each: serial,
// docs, year, its own yard). `ghost` = units offered commercially but NOT registered — they have no
// serial, no documents, no readiness and NO location of their own.
//   offered count = units.length + ghost   ← what the bid sells
//   identified    = units.length           ← what can be pinned, documented, readiness-checked
// The two are different numbers and the UI must never conflate them.
/* An off-platform submission. Fields mirror `link_bid_submissions` + the renter mapper exactly:
   no equipmentId, no yardId, no coordinates, no serial/model/year — but photos, documents,
   confirmations and per-item pricing all exist. `city` and `companyDocuments` require the two
   SELECT additions noted in spec §6.12.1. */
const OFF_PLATFORM={id:'op1',name:'مؤسسة النخبة لتأجير المعدات',initials:'نخ',offPlatform:true,
  city:'الرياض · الشفا',km:null,rate:2520,eta:null,verified:false,status:'new',deals:null,offered:2,fleet:[],
  co:[24.60,46.72],
  submission:{
    quotationRef:'Q-2026-0043', createdAt:'٥ أغسطس ٢٠٢٦', validUntil:'١٢ أغسطس ٢٠٢٦',
    crNumber:'١٠١٠······', vatNumber:null,   // masked placeholders; VAT deliberately absent → company details 3/4
    nationalAddress:'الرياض · حي الشفا · وحدة ١٢',
    contactInfo:'٠٥٥ ··· ····',
    // The tag is how the real implementation carries "priced VAT-inclusive" without a column.
    // It must NEVER be displayed — stripVatTag() removes the whole line (vat-inclusive.ts parity).
    notes:'[VAT-INCLUSIVE] Prices were quoted VAT-inclusive (15% VAT already included).\nيمكننا التسليم خلال ٤٨ ساعة، والسعر قابل للنقاش على العقود الطويلة.',
    grandTotal:9476,                                   // VAT-inclusive, as stored
    companyDocuments:[{k:'السجل التجاري',type:'cr',s:'ok'},{k:'العنوان الوطني',type:'national_address',s:'ok'}],
    items:[{ label:'رافعة شوكية ٣ طن', reqMeasurement:'٣ طن - ٥ طن (قياسي)',   // the REQUEST's measurement — a submission has no such field
      certs:['TÜV','الاستمارة'],           // acknowledged in the form — not verified
      offeredUnits:2, numberOfUnits:1,
      rentalRate:2520, deliveryPrice:800, returnPrice:800, total:9476,   // (2520+800+800)×2×1.15
      photos:3,
      // `type` matters: bid-quality.ts classifies documents into buckets by type, not by count.
      documents:[{k:'شهادة سلامة المعدّة',type:'tuv',s:'ok'},{k:'تأمين المعدّة',type:'other',s:'ok'},
                 {k:'الاستمارة (رخصة السير)',type:'istimara',s:'ok'}],
      terms:[['مدة الإيجار','١٤ يوم','١٤ يوم',true],['المشغّل','مع عامل','مع عامل',true],
             ['المسكن والنقل','على المستأجر','على المستأجر',true],
             ['الدفع','٣٠ يوم','عند التسليم',false]] }],
    messages:[{who:'sup',txt:'أرسلنا عرضنا، وجاهزون لأي استفسار.'}]
  }};
const SUPPLIERS=[
  {id:'s1',name:'أبراج الخليج للمعدات',initials:'أخ',co:[24.7136,46.6753],city:'الرياض · العليا',km:12,rate:3000,rating:'٤٫٨',deals:'١٢',verified:true,status:'new',eta:'٤ ساعات',
   offered:3,fleet:[
     {id:'eq-fd30t118207',serial:'FD30T-118207',year:'٢٠٢٠',yard:'ساحة السلي — الرياض',ll:[24.660,46.828],km:12,confirmed:true, cert:true, inBid:true},
     {id:'eq-fd30t114522',serial:'FD30T-114522',year:'٢٠١٨',yard:'ساحة النسيم',        ll:[24.745,46.885],km:19,confirmed:false,cert:false,inBid:true},
     {id:'eq-fd30t120944',serial:'FD30T-120944',year:'٢٠٢٢',yard:'ساحة السلي — الرياض',ll:[24.664,46.821],km:13,confirmed:false,cert:true, inBid:false},
   ]},
  {id:'s2',name:'الدرعية للمقاولات',initials:'در',co:[24.7330,46.5750],city:'الرياض · الدرعية',km:21,rate:2950,rating:'٤٫٤',deals:'٨',verified:true,status:'new',eta:'٦ ساعات',
   offered:1,fleet:[
     {id:'eq-8fd3044120',serial:'8FD30-44120',year:'٢٠٢١',yard:'ساحة الدرعية',ll:[24.735,46.575],km:21,confirmed:true,cert:true,inBid:true},
   ]},
  {id:'s3',name:'رافعات الرياض الشمالية',initials:'رش',co:[24.8250,46.6400],city:'الرياض · النخيل',km:28,rate:3200,rating:'٤٫٩',deals:'٢١',verified:true,status:'seen',eta:'٨ ساعات',
   offered:2,fleet:[
     {id:'eq-fg35n9014',serial:'FG35N-9014',year:'٢٠٢٢',yard:'ساحة النخيل',ll:[24.905,46.590],km:28,confirmed:true, cert:true,inBid:true},
     {id:'eq-fg35n9027',serial:'FG35N-9027',year:'٢٠٢٢',yard:'ساحة النخيل',ll:[24.905,46.590],km:28,confirmed:false,cert:true,inBid:true},
     {id:'eq-fg35n9033',serial:'FG35N-9033',year:'٢٠٢١',yard:'ساحة الملز',  ll:[24.678,46.742],km:9, confirmed:false,cert:false,inBid:false},
   ]},
  // ← 4 units sold, 2 machines owned: 2 CLAIMED. Plus one alternative not in the offer.
  {id:'s4',name:'مؤسسة الخرج الصناعية',initials:'خر',co:[24.1550,47.3050],city:'الخرج',km:95,rate:2750,rating:'٤٫٢',deals:'٦',verified:false,status:'neg',eta:'يوم واحد',
   offered:4,fleet:[
     {id:'eq-8fd3577140',serial:'8FD35-77140',year:'٢٠٢١',yard:'ساحة الخرج',        ll:[24.155,47.335],km:95,confirmed:true, cert:true, inBid:true},
     {id:'eq-8fd3577168',serial:'8FD35-77168',year:'٢٠١٩',yard:'ساحة السلي — الرياض',ll:[24.668,46.812],km:12,confirmed:false,cert:false,inBid:true},
     {id:'eq-8fd3577201',serial:'8FD35-77201',year:'٢٠٢٣',yard:'ساحة الخرج',        ll:[24.151,47.329],km:94,confirmed:false,cert:true, inBid:false},
   ]},
  {id:'s5',name:'المجمعة للمعدات الثقيلة',initials:'مج',co:[25.9050,45.3600],city:'المجمعة',km:155,rate:2600,rating:'٤٫٠',deals:'٤',verified:true,status:'new',eta:'يومان',
   offered:1,fleet:[
     {id:'eq-h30a2255',serial:'H30A-2255',year:'٢٠٢٠',yard:'ساحة المجمعة',ll:[25.905,45.360],km:155,confirmed:false,cert:false,inBid:false},
   ]},
  OFF_PLATFORM,
  {id:'s6',name:'القصيم للتأجير',initials:'قص',co:[26.0260,44.0200],city:'القصيم · بريدة',km:185,rate:2400,rating:'٣٫٩',deals:'٣',verified:false,status:'new',eta:'يومان',
   offered:2,fleet:[
     {id:'eq-fd2531002',serial:'FD25-31002',year:'٢٠١٧',yard:'ساحة القصيم',ll:[26.026,44.020],km:185,confirmed:false,cert:false,inBid:true},
   ]},
];
/* ── the three levels, now derived from the FLEET + the offered count ──────────────────────────
   confirmed : machine in this bid whose yard the supplier confirmed in bid readiness   → green
   located   : machine in this bid, positioned at its fleet yard, unconfirmed            → red
   claimed   : offered − machines-in-bid. No machine, no location, drawn nowhere.
   alternatives: machines he owns that are NOT in this offer — the renter can ask for them. */
function fleetOf(s){ return s.fleet||[]; }
function inBidOf(s){ return fleetOf(s).filter(u=>u.inBid); }
function altsOf(s){ return fleetOf(s).filter(u=>!u.inBid); }
function unitsOf(s){ return inBidOf(s); }
function offeredOf(s){ return s.offered!=null ? s.offered : inBidOf(s).length; }
/* Units the MAP should show for a supplier. The bid's original count until the supplier approves a
   different one as the unit term in the quotation — an unapproved counter-offer must not silently
   rewrite what the offer says. `agreed` is the approved count, or null while still negotiating. */
function shownUnitsOf(s,agreed){ return (agreed!=null) ? agreed : offeredOf(s); }
function identifiedOf(s){ return inBidOf(s).length; }
function confirmedOf(s){ return inBidOf(s).filter(u=>u.confirmed).length; }
function locatedOf(s){ return inBidOf(s).filter(u=>!u.confirmed).length; }
function claimedOf(s){ return Math.max(0, offeredOf(s) - inBidOf(s).length); }
function levelsOf(s){ return {confirmed:confirmedOf(s),located:locatedOf(s),claimed:claimedOf(s),offered:offeredOf(s),alts:altsOf(s).length}; }
function siteCountOf(s){ return new Set(inBidOf(s).map(u=>u.ll.join(','))).size; }
function kmRangeOf(s){ const k=inBidOf(s).map(u=>u.km); return k.length?[Math.min.apply(null,k),Math.max.apply(null,k)]:[s.km,s.km]; }
// Which suppliers bid on which item. SEPARATE bids — the same firm appearing under two items is two
// independent offers with their own price, terms and deal room, not one bid spanning items.
const ITEM_BIDS=[[0,1,2,3,5],[1,3,4],[0,2,3,4]];
const INCOMING_BID={id:'s7',name:'مصنع الرياض للرفع',initials:'مر',co:[24.6500,46.7200],city:'الرياض · الصناعية',km:16,rate:2680,rating:'٤٫٦',deals:'٧',verified:true,status:'new',eta:'٥ ساعات',
   offered:2,fleet:[
     {id:'eq-fd30t131880',serial:'FD30T-131880',year:'٢٠٢٢',yard:'ساحة الصناعية',ll:[24.641,46.735],km:16,confirmed:true, cert:true, inBid:true},
     {id:'eq-fd30t131905',serial:'FD30T-131905',year:'٢٠٢١',yard:'ساحة الصناعية',ll:[24.648,46.729],km:17,confirmed:false,cert:true, inBid:true},
   ]};
const SUPSTAT={new:{lbl:'عرض جديد',c:'#D4780A',bg:'rgba(212,120,10,.10)'},seen:{lbl:'تمت المشاهدة',c:'#6B8FA8',bg:'#F1F5FA'},neg:{lbl:'قيد التفاوض',c:'#2563EB',bg:'rgba(37,99,235,.08)'}};
function freshState(){ return {
  stage:'fresh', availabilityAsked:false, availabilityConfirmed:false,
  docs:[{id:'safety',name:'شهادة سلامة المعدّة',certType:'TÜV',sub:'كما حُدّدت في طلبك',state:'claimed',askedByMe:false,deferred:false}],
  myDocs:[{id:'iban',name:'الآيبان البنكي',state:'claimed'},{id:'addr',name:'العنوان الوطني',state:'missing'}],
  qty:1, days:14, operator:true, unitIdx:0, eligibleAsked:false, fitAccepted:false,
  price:{ sup:{rate:DAY_RATE,mob:MOB,demob:DEMOB,incMob:true,incDemob:true,overtime:450}, rounds:[], agreed:null, agreedPos:null, turn:'rentee', draft:null },
  terms:[
    // 🚚 السعر واللوجستيات — مُسعّرة (تُتفاوض في خطوة السعر)
    {id:'price_main',cat:'price',en:'PRICE (from bid rate)',name:'السعر — من سعر العرض',desc:'الإيجار اليومي الأساسي المشتق من سعر العرض — لكل عرض',type:'priced',ack:true,priced:true,supDefault:'٣٬٠٠٠ ر.س / يوم',opts:[],state:'agreed',agreedVal:'٣٬٠٠٠ ر.س / يوم'},
    {id:'mob',cat:'price',en:'mobilization_pricing',name:'تسعير التعبئة (موب)',desc:'رسوم نقل المعدّة إلى الموقع — لكل بند',type:'priced',ack:true,priced:true,supDefault:'١٬٥٠٠ ر.س',opts:[],state:'agreed',agreedVal:'١٬٥٠٠ ر.س'},
    {id:'demob',cat:'price',en:'demobilization_pricing',name:'تسعير الإرجاع (ديموب)',desc:'رسوم إعادة المعدّة من الموقع — لكل بند',type:'priced',ack:true,priced:true,supDefault:'١٬٠٠٠ ر.س',opts:[],state:'agreed',agreedVal:'١٬٠٠٠ ر.س'},
    // 👷 المشغّل
    {id:'operator_inc',cat:'operator',en:'operator_included',name:'شمول المشغّل',desc:'هل يشمل التأجير مشغّلاً معتمداً — للطلب كامل',type:'neg',supDefault:'مشمول',opts:['بدون مشغّل'],state:'open',agreedVal:null},
    {id:'fat_food',cat:'operator',en:'fat_food',name:'إعاشة المشغّل — الطعام',desc:'من يوفّر وجبات المشغّل طوال المدة — لكل بند',type:'neg',supDefault:'على المستأجر',opts:['على المورد','بدل نقدي'],state:'open',agreedVal:null},
    {id:'fat_stay',cat:'operator',en:'fat_accommodation_transport',name:'إعاشة المشغّل — السكن والتنقّل',desc:'سكن المشغّل وتنقّله من وإلى الموقع — لكل بند',type:'neg',supDefault:'على المستأجر',opts:['على المورد','مناصفة'],state:'open',agreedVal:null},
    {id:'overtime',cat:'work',en:'overtime_multiplier',name:'الساعات الإضافية (أوفرتايم)',desc:'مُعامل أجر ساعة العمل خارج الدوام الرسمي — للطلب كامل',type:'neg',supDefault:'١٫٥×',opts:['بدون','٢×'],state:'open',agreedVal:null},
    // 🏗️ المعدّة
    {id:'fuel',cat:'equip',en:'fuel_responsibility',name:'مسؤولية الوقود',desc:'من يغطّي تكلفة الوقود طوال المدة — للطلب كامل',type:'neg',supDefault:'على المستأجر',opts:['على المورد','مناصفة'],state:'open',agreedVal:null},
    {id:'maintenance',cat:'equip',en:'maintenance_responsibility',name:'مسؤولية الصيانة',desc:'الصيانة الدورية والطارئة طوال المدة — للطلب كامل',type:'ack',ack:true,supDefault:'على المورد',opts:[],state:'agreed',agreedVal:'على المورد'},
    {id:'breakdown_sla',cat:'equip',en:'breakdown_response_sla',name:'زمن الاستجابة للأعطال',desc:'أقصى مهلة لإصلاح أو استبدال البند عند تعطّله — للطلب كامل',type:'neg',supDefault:'٢٤ ساعة',opts:['١٢ ساعة','٨ ساعات','٤٨ ساعة'],state:'open',agreedVal:null},
    // 🗓️ العمل — كلها للإقرار (قراءة فقط)
    {id:'working_days',cat:'work',en:'working_days',name:'أيام العمل',desc:'أيام التشغيل المعتمدة — حقل الطلب',type:'ack',ack:true,supDefault:'الأحد–الخميس',opts:[],state:'agreed',agreedVal:'الأحد–الخميس'},
    {id:'working_hours',cat:'work',en:'working_hours',name:'ساعات العمل',desc:'نافذة الدوام اليومية — حقل الطلب',type:'ack',ack:true,supDefault:'٧ص–٣م · ٨ ساعات',opts:[],state:'agreed',agreedVal:'٧ص–٣م · ٨ ساعات'},
    {id:'night',cat:'work',en:'night_shift',name:'الوردية الليلية',desc:'إتاحة تشغيل المعدّة في وردية ليلية — للطلب كامل',type:'neg',supDefault:'متاح',opts:['غير متاح'],state:'open',agreedVal:null},
    {id:'crosshire',cat:'work',en:'crosshire (schema: subletting)',name:'التأجير من الباطن',desc:'إعادة تأجير المعدّة لطرف ثالث — حقل الطلب',type:'ack',ack:true,supDefault:'غير مسموح دون موافقة كتابية',opts:[],state:'agreed',agreedVal:'غير مسموح دون موافقة كتابية'},
    {id:'local_content',cat:'work',en:'local_content',name:'المحتوى المحلي',desc:'نسبة المحتوى المحلي المطلوبة — حقل الطلب',type:'ack',ack:true,supDefault:'محتوى محلي ≥ ٤٠٪',opts:[],state:'agreed',agreedVal:'محتوى محلي ≥ ٤٠٪'},
    // 💳 الدفع والتجاري
    {id:'payment_terms',cat:'pay',en:'payment_terms',name:'شروط الدفع',desc:'جدول سداد قيمة الاتفاق — للطلب كامل',type:'neg',supDefault:'مقدّم ١٠٠٪',opts:['نصف عند التسليم ونصف عند الإرجاع','دفعات شهرية'],state:'open',agreedVal:null},
    {id:'offer_duration',cat:'pay',en:'offer_duration',name:'مدة صلاحية العرض',desc:'المهلة قبل انتهاء صلاحية عرض المورد — مرحلة العرض فقط',type:'info',ack:true,supDefault:'٧ أيام',opts:[],state:'agreed',agreedVal:'صالح ٧ أيام من تاريخ العرض'},
    {id:'fulfillment',cat:'pay',en:'fulfillment_type',name:'نوع التوريد',desc:'آلية التوريد — مع مرونة تعديل عدد الوحدات في الطلب متعدد الوحدات',type:'ack',ack:true,fulfill:true,supDefault:'توريد كامل',opts:[],state:'agreed',agreedVal:'توريد كامل'},
  ],
  approved:false,
  chips:[{who:'sup',txt:'تمت مطابقة معدّتك تلقائياً مع هذا الطلب'}],
  // middleware trigger layer — one nudge per type per room; ✕ mutes the type for the room
  assist:{fired:{}, muted:{}},
};}

// The `dpGuide` step was dropped: that container is empty now (guideEl is null), so its spotlight
// measured a zero-height element and drew a stray blue bar over the map.
const TOUR=[
  {id:'dpRail',t:'أدواتك',x:'المعدّة · التوثيق · المحادثة. افتح أيّها عند الحاجة كلوحة جانبية، ثم أغلقها لتعود الخريطة كاملة.'},
  {id:'dpLegend',t:'الخريطة — مكان الصفقة',x:'من ساحة المعدّة إلى مشروعك، والمسافة هي الرقم الأساسي. اللون = تأكيد المورد: كهرماني ← أخضر ✓.'},
  {id:'dpPrice',t:'شريط السعر',x:'السعر ظاهر دائماً هنا. افتح «عرض الأسعار» للتفاوض بالجولات والعروض المقابلة.'},
];
class Component extends DCLogic {
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
    // v3 — this surface is scoped to ONE supplier and verifies his EQUIPMENT. The renter
    // arrives here having already chosen the offer, so the page opens on a supplier and
    // navigates between his machines, not between competing bids.
    this.paneMode=true;
    this.selSup=0; this._supStates={}; this.bidSort='price'   /* cheapest first, per spec */; this.hoverSup=null;
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
  up(){ this.setState(s=>({tick:s.tick+1})); }
  toast(msg){ this.toastMsg=msg; clearTimeout(this._toastT); this._toastT=setTimeout(()=>{this.toastMsg='';this.up();},3600); this.up(); }

  /* ── real map (Leaflet) ── */
  componentDidMount(){
    this.initLeaflet();
    window.addEventListener('resize',()=>{ if(this.map) this.map.invalidateSize(); if(this.tourOn){ this._ms=-1; this.forceUpdate(); } });
    let seen=false; try{ seen=localStorage.getItem('dp_tour_seen')==='1'; }catch(e){}
    // v3: the tour narrates an edge rail this layout no longer leads with — skip it in pane mode
    if(!seen && !this.paneMode) setTimeout(()=>{ this.tourStep=0; this._ms=-1; this.tourOn=true; this.forceUpdate(); }, 650);
  }
  supIcon(conf){ return L.divIcon({className:'',iconSize:[40,52],iconAnchor:[20,40],html:
    '<div style="display:flex;flex-direction:column;align-items:center">'
    +'<div style="width:34px;height:34px;border-radius:50%;background:'+(conf?C.green:C.amber)+';border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;font-family:\'IBM Plex Sans Arabic\',sans-serif">أخ</div>'
    +'<div style="margin-top:4px;background:#fff;border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700;color:#0F2238;box-shadow:0 2px 6px rgba(15,34,56,.2);white-space:nowrap;font-family:\'IBM Plex Sans Arabic\',sans-serif">المعدّة</div></div>' }); }
  siteIcon(){ return L.divIcon({className:'',iconSize:[40,52],iconAnchor:[20,40],html:
    '<div style="display:flex;flex-direction:column;align-items:center">'
    +'<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:'+C.blue+';border:2px solid #fff;box-shadow:0 3px 10px rgba(37,99,235,.5);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:14px">📍</span></div>'
    +'<div style="margin-top:6px;background:#fff;border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700;color:#0F2238;box-shadow:0 2px 6px rgba(15,34,56,.2);white-space:nowrap;font-family:\'IBM Plex Sans Arabic\',sans-serif">مشروعك</div></div>' }); }
  truckIcon(){ return L.divIcon({className:'',iconSize:[36,36],iconAnchor:[18,18],html:
    '<div style="width:34px;height:34px;border-radius:50%;background:#fff;border:2.5px solid '+C.green+';box-shadow:0 3px 10px rgba(15,34,56,.3);display:flex;align-items:center;justify-content:center;font-size:16px">🚚</div>' }); }
  initLeaflet(){ const tryInit=()=>{
      if(!window.L){ this._lt=setTimeout(tryInit,120); return; }
      const el=document.getElementById('dpLeaflet'); if(!el){ this._lt=setTimeout(tryInit,120); return; }
      if(this.map) return;
      const map=L.map(el,{zoomControl:false,attributionControl:true,scrollWheelZoom:true,wheelPxPerZoomLevel:90,
        zoomSnap:.5,zoomDelta:.5,inertia:true,inertiaDeceleration:2800,doubleClickZoom:true,minZoom:5,maxZoom:16,
        worldCopyJump:false,keyboard:true}).setView(SITE,9);
      this.baseLayer=L.tileLayer(this.baseUrl(this.mapStyle||'voyager'),{maxZoom:19,subdomains:'abcd',attribution:'&copy; OpenStreetMap, &copy; CARTO'}).addTo(map);
      this.map=map; window.__dpMap=map; window.__dp=this;
      this.routeLine=L.polyline([this.curYard(),SITE],{color:C.amber,weight:4,opacity:0,dashArray:'10 9',lineCap:'round'}).addTo(map);
      this.siteMarker=L.marker(SITE,{icon:this.siteIcon(),zIndexOffset:900}).addTo(map);
      this.truckMarker=L.marker(this.curYard(),{icon:this.truckIcon(),zIndexOffset:950,opacity:0}).addTo(map);
      this.bidLayer=L.layerGroup().addTo(map);
      map.on('zoomend',()=>this.layoutBids(true));
      map.on('resize',()=>this.layoutBids(true));
      this._lastUnit=this.S.unitIdx||0;
      this.updateLeaflet(true);
      setTimeout(()=>{ map.invalidateSize(); this.updateLeaflet(true); },300);
      setTimeout(()=>{ map.invalidateSize(); this.updateLeaflet(true); },900);
    }; tryInit();
  }
  updateLeaflet(fit){ if(!this.map) return;
    const sel=this.selSup, conf=this.S.availabilityConfirmed;
    if(sel!=null) this.routeLine.setLatLngs([this.curYard(),SITE]).setStyle({opacity:.85,color:conf?C.green:C.amber});
    else this.routeLine.setStyle({opacity:0});
    const moving = sel!=null && this.S.stage==='closed';
    this.truckMarker.setOpacity(moving?1:0);
    if(sel!=null && !moving) this.truckMarker.setLatLng(this.curYard());
    if(fit) this.fitMap();
    this.layoutBids(true);
  }
  fitMap(){ if(!this.map) return;
    // one debounced, non-animated fit: the triple invalidateSize on boot used to cancel each other's fly
    clearTimeout(this._fitT);
    this._fitT=setTimeout(()=>{ const M=this.map; if(!M) return;
      const sz=M.getSize();
      // The floating panel sits on the inline-end (left, in RTL) edge and is opaque, so the fit must
      // keep the whole map content — the project pin above all — clear of it. Measure the real panel
      // instead of guessing a fraction; fall back to a fraction only if it would eat the map.
      let px=Math.min(170,Math.round(sz.x*0.18));
      try{ const g=document.getElementById('dpGuide');
        if(g&&g.offsetWidth) px=Math.min(Math.round(sz.x*0.55), g.offsetWidth+56);
      }catch(e){}
      // the isometric sprites are 124px tall and hang above their anchor, so the top needs real room
      const py=Math.min(215,Math.round(sz.y*0.34));
      // a selected bid may fan out across several yards — fit to every one of its units, not just its anchor
      const cs=this.curSup();
      // Project only until a supplier is selected; then the project plus that fleet.
      const pts = cs ? [SITE].concat(fleetOf(cs).map(u=>u.ll)) : [SITE];
      // asymmetric on purpose: the panel occupies the leading edge only, so padding it on both sides
      // cancels out and the content stays centred underneath the panel — which is how the project pin
      // ended up hidden. The trailing side only needs room for a pin's own label.
      const pr=Math.min(150,Math.round(sz.x*0.16));
      px=Math.min(px,Math.max(0,sz.x-pr-140));
      M.fitBounds(pts,{paddingTopLeft:[px,py],paddingBottomRight:[pr,Math.round(py*1.5)],animate:false,maxZoom:13});
      // fitBounds pads the ANCHORS; the sprites hang ~124px above theirs, so a northern machine could
      // still be clipped. Measure what actually rendered and pan by the overflow.
      setTimeout(()=>{ try{
        const mm=this.map; if(!mm) return;
        const els=Array.prototype.slice.call(document.querySelectorAll('#dpLeaflet .leaflet-marker-icon'));
        if(!els.length) return;
        const host=document.getElementById('dpLeaflet').getBoundingClientRect();
        let over=0;
        els.forEach(e=>{ const b=e.getBoundingClientRect();
          over=Math.max(over, host.top-b.top+8, 0);
        });
        if(over>1) mm.panBy([0,-Math.min(over,220)],{animate:false});
      }catch(e){} },30);
      this.layoutBids(true);
    },40);
  }
  /* ── how a supplier reads on the map ── */
  distBand(km){ return {lbl: km<=30?'قريب' : km<=120?'متوسط' : 'بعيد'}; }   // label only — colour means availability
  /* Outside the request's city. Mobilisation crosses city limits, which is a different conversation from
     "far" — so it is its own flag, not a distance band. The prototype infers it from the radius; the real
     app has the yard's city on the listing. */
  CITY_KM(){ return 45; }
  outOfCity(u){ return !!u && u.km>this.CITY_KM(); }
  reqEmoji(){ return this.itemsMode==='multi' ? (MULTI_ITEMS[this.activeItem||0].icon||'🏗️') : '🏗️'; }
  /* Ring colour = AVAILABILITY everywhere, the same meaning it carries on unit pins. It used to be the
     DISTANCE band here, so a far-but-fully-confirmed supplier rendered amber and read as "not available"
     while a unit pin's amber meant "yard unconfirmed" — one channel, two meanings. Distance is text only. */
  /* The approved unit term for a supplier, or null while it is still being negotiated. Only an APPROVED
     term rewrites the map — a pending counter must not. */
  approvedUnitsFor(s){ const st=this._supStates&&this._supStates[s.id];
    const S=(this.curSup()===s)?this.S:st;
    return (S&&S.approved&&S.qty!=null)?S.qty:null; }
  supAvail(s){ const us=unitsOf(s); if(!us.length) return C.red;
    const n=us.filter(u=>u.confirmed).length;
    if(n===us.length) return C.green;   // every machine's yard confirmed in bid readiness
    if(n===0)         return C.red;     // none confirmed
    return C.muted;                     // MIXED — grey, so it never reads as either extreme
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
  /* ── one IDENTIFIED machine ──
     The RING carries the yard state: solid green = supplier confirmed this machine's yard,
     dashed amber = we inferred the position. The small pip carries READINESS (documents). Two
     separate signals, both readable without text. ONE compact label line — detail goes in the
     tooltip, because stacked labels collided into mush at real zoom levels. */
  /* One machine of the selected offer. The RING is the only availability signal — green solid when the
     supplier confirmed its yard in bid readiness, amber dashed when they did not. No second tick, no
     readiness dot: an amber ring carrying a green ✓ read as a contradiction. No equipment icon either —
     the renter knows the machine; the number says which of the set it is. */
  /* One machine of this supplier's qualifying fleet.
     RING colour = availability: green when its yard is confirmed in bid readiness, red when it is not
     (then it sits at the yard recorded when the machine was added). That is the ONLY colour meaning.
     Machines NOT in the current offer are drawn hollow — real and locatable, but not being sold yet;
     the renter can ask for them from the equipment panel. */
  /* One machine of the supplier's qualifying fleet.
       FILL      = availability. green = yard confirmed in bid readiness, red = not confirmed.
       IMAGE     = the request item's taxonomy glyph, so the pin says WHAT as well as where.
       BAR       = document readiness for this machine, segmented: present vs required.
       OUTLINE   = in the offer (solid) vs owned-but-not-offered (dashed, '+').
       SEL RING  = the currently selected machine. Exactly one at a time. */
  /* Which illustration stands for this machine. The listings are one type per request, so this maps the
     serial prefix onto the isometric art; the real app would key off the equipment taxonomy id. */
  /* The card and the detail show a PHOTOGRAPH of the machine — the listing's own photo in the real app.
     The map keeps the isometric illustration, which is what reads at pin size. Photos are keyed off the
     serial so a machine always shows the same one. */
  machinePhoto(u){ const R=(window.__resources||{}); const P=[R.photoExcavator||'assets/photos/excavator.jpg',R.photoLoader||'assets/photos/loader.jpg',R.photoDumpTruck||'assets/photos/dump-truck.jpg'];
    const sn=String((u&&u.serial)||''); let n=0; for(let i=0;i<sn.length;i++) n=(n+sn.charCodeAt(i))%997;
    return P[n%P.length];
  }
  /* BID READINESS, on the card. Not a second colour scale: the track is slate, and it counts only what the
     REQUEST asked this machine to carry — its photos and the certificates named in the request. What is
     missing is named, so the row tells him what to ask for rather than scoring the supplier. */
  eqReadinessRow(u){
    const rd=this.unitReadiness(u); if(!rd) return null;
    const missing=(rd.keys||[]).filter(x=>!x.ok).map(x=>x.k);
    const full=rd.done===rd.total;
    return h('div',{style:{display:'flex',alignItems:'center',gap:'8px',marginTop:'1px'}},
      h('span',{style:{display:'flex',gap:'3px',flexShrink:0}},
        Array.from({length:rd.total}).map((_,i)=>h('span',{key:i,style:{width:'16px',height:'4px',borderRadius:'2px',
          background:i<rd.done?'rgba(15,34,56,.6)':'rgba(15,34,56,.13)'}}))),
      h('span',{style:{flex:1,minWidth:0,fontSize:'10.5px',fontWeight:700,color:full?C.muted:C.navy,
        whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},
        full?'جاهزية العرض مكتملة':'ينقصها '+missing.join(' و')));
  }
  /* Model comes from the request's fleet template, matched on serial — the listing row carries the serial
     and the year, the taxonomy carries the model name. */
  unitModel(u){ const t=FLEET.find(x=>x.serial===(u&&u.serial)); return (t&&t.model)||'رافعة شوكية ٣ طن'; }
  /* Which certificates this machine actually holds, named the way the request names them. */
  unitDocChips(u){ const out=[]; if(u&&u.cert){ out.push('TÜV'); out.push('SPSP'); } return out; }
  machineArt(u){ const sn=String((u&&u.serial)||''); const R=(window.__resources||{});
    if(/^C500/.test(sn)) return R.artGenerator||'assets/equipment/generator.png';
    if(/^XAS/.test(sn))  return R.artCompressor||'assets/equipment/air-compressor.png';
    if(/^TH|^RT/.test(sn)) return R.artTelehandler||'assets/equipment/telescopic-handler.png';
    return R.artForklift||'assets/equipment/heavy-duty-forklift.png';
  }
  unitIcon(s,u,idx,total,selected){ const F="font-family:'IBM Plex Sans Arabic',sans-serif";
    // Green confirms. Not-confirmed is a soft, low-contrast state — unanswered, not rejected.
    const conf=!!u.confirmed, ring=conf?'#12904A':'#C62A2A', alt=!u.inBid;
    const rd=this.unitReadiness(u), segs=rd.total, done=rd.done;
    let bar='';
    for(let i=0;i<segs;i++){
      // Neutral on purpose: this bar counts documents, and colour on this surface means availability only.
      bar+='<span style="flex:1;height:4px;border-radius:2px;background:'+(i<done?'rgba(15,34,56,.55)':'rgba(15,34,56,.14)')+'"></span>';
    }
    // The machine itself stands on the map, isometric, on a tinted ground disc that carries the state —
    // colour still says availability only. Selection is a blue ring on the disc, not a new colour.
    // The state is unmistakable on the map: a solid colour plate the machine stands on, ringed in the
    // same colour. Green = availability confirmed, red = not confirmed yet.
    const disc = alt ? 'background:rgba(107,143,168,.22);border:2px solid rgba(107,143,168,.5);'
                     : 'background:'+(conf?'rgba(18,144,74,.34)':'rgba(198,42,42,.32)')+';border:2.5px solid '+(conf?'#12904A':'#C62A2A')+';';
    return L.divIcon({className:'',iconSize:[132,124],iconAnchor:[66,124],html:
      '<div style="'+F+';width:132px;display:flex;flex-direction:column;align-items:center;cursor:pointer">'
      +'<div style="position:relative;width:96px;height:78px;display:flex;align-items:flex-end;justify-content:center">'
        // the machine stands ON the map: a contact shadow on the ground, then the state ring around it
        +(selected?'<span style="position:absolute;bottom:4px;left:50%;width:62px;height:62px;border-radius:50%;border:2px solid '+(conf?'#12904A':'#C62A2A')+';animation:dpHalo 1.9s ease-out infinite"></span>':'')
        +'<span style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%) scaleY(.32);width:62px;height:62px;border-radius:50%;'+disc
          +(selected?'box-shadow:0 0 0 3px rgba(37,99,235,.55);':'')+'"></span>'
        +'<span style="position:absolute;bottom:7px;left:50%;transform:translateX(-50%) scaleY(.26);width:44px;height:44px;border-radius:50%;background:radial-gradient(closest-side,rgba(15,34,56,.42),transparent);filter:blur(1px)"></span>'
        +'<img src="'+this.machineArt(u)+'" alt="" style="position:relative;width:94px;height:74px;object-fit:contain;'
          +(selected?'animation:dpLift .55s cubic-bezier(.34,1.4,.64,1) forwards;':'transform:translateY(-4px);')
          +'filter:drop-shadow(0 '+(selected?'14px 12px rgba(15,34,56,.34)':'7px 7px rgba(15,34,56,.30)')+')'+(alt?' grayscale(.75) opacity(.75)':'')+'">'
        +(selected?'<span style="position:absolute;top:-2px;inset-inline-end:0;width:18px;height:18px;border-radius:50%;background:'+C.blue+';color:#fff;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #fff">✓</span>':'')
        +(alt?'<span style="position:absolute;top:-2px;inset-inline-start:0;width:18px;height:18px;border-radius:50%;background:#fff;color:'+ring+';font-size:12px;font-weight:900;display:flex;align-items:center;justify-content:center;border:1.5px dashed '+ring+'">+</span>'
             :'<span style="position:absolute;bottom:0;inset-inline-start:0;min-width:17px;height:17px;border-radius:9px;background:'+ring+';color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff">'+AR(idx+1)+'</span>')
      +'</div>'
      // One label, one fact. The readiness bar and the document count moved into the machine's detail —
      // a pin on a simple map says what it is and nothing else.
      +'<div style="margin-top:6px;background:'+(alt?'#fff':ring)+';border:1px '+(alt?'dashed '+C.border:'solid '+ring)+';border-radius:20px;padding:3px 10px;font-size:10px;font-weight:800;white-space:nowrap;color:'+(alt?C.muted:'#fff')+';box-shadow:0 3px 10px rgba(15,34,56,.20)'
        +(selected?';transform:scale(1.06)':'')+'">'
        +(alt?'يمكنك طلبها':(conf?'مؤكد توفرها':'لم يوكد توفرها بعد'))+'</div>'
      // Only the selected pin names itself — the map stays quiet until the renter has chosen.
      +(selected?'<div style="margin-top:5px;background:#fff;border:1px solid '+C.blt+';border-radius:8px;padding:2px 8px;font-size:9.5px;font-weight:800;color:'+C.deep+';white-space:nowrap;box-shadow:0 3px 10px rgba(15,34,56,.18);animation:dpTagIn .3s ease .1s both">'
        +'معروضة في اللوحة</div>':'')
      +'</div>' });
  }
  /* ── the unregistered remainder ──
     Deliberately NOT a machine: grey, dashed, hollow, no serial, no distance. Offset away from the
     bid anchor in layoutBids, because the anchor is usually one of the real units' yards and the two
     markers landed exactly on top of each other. */
  ghostIcon(s,n){ const F="font-family:'IBM Plex Sans Arabic',sans-serif";
    return L.divIcon({className:'',iconSize:[136,72],iconAnchor:[68,72],html:
      '<div style="'+F+';width:136px;display:flex;flex-direction:column;align-items:center;cursor:pointer">'
      +'<div style="width:42px;height:42px;border-radius:50%;background:#F1F5FA;border:3px dashed '+C.muted+';display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:900;color:'+C.muted+';position:relative;box-shadow:0 4px 10px rgba(15,34,56,.16)">؟'
        +'<span style="position:absolute;top:-6px;inset-inline-end:-6px;min-width:18px;height:18px;border-radius:9px;background:'+C.muted+';color:#fff;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff">'+AR(n)+'</span></div>'
      +'<div style="margin-top:6px;background:#fff;border:1.5px dashed '+C.muted+';border-radius:8px;padding:2px 8px;font-size:9px;font-weight:800;white-space:nowrap;color:'+C.muted+';box-shadow:0 2px 8px rgba(15,34,56,.14)">'
        +AR(n)+' بلا معدّة محدَّدة</div></div>' });
  }
  supTip(s){ const band={c:C.muted,lbl:this.distBand(s.km).lbl};
    return '<div style="font-family:\'IBM Plex Sans Arabic\',sans-serif;direction:rtl;text-align:right;min-width:150px">'
      +'<div style="font-size:11.5px;font-weight:700;color:'+C.deep+'">'+s.name+'</div>'
      +'<div style="margin-top:3px">'+(s.verified
        ? '<span style="display:inline-block;background:rgba(18,144,74,.10);border:1px solid rgba(18,144,74,.30);color:#12904A;border-radius:20px;padding:1px 8px;font-size:9px;font-weight:800">✓ شركة موثّقة</span>'
        : '<span style="display:inline-block;background:#EEF3F8;border:1px solid '+C.blt+';color:'+C.muted+';border-radius:20px;padding:1px 8px;font-size:9px;font-weight:800">غير موثّقة</span>')+'</div>'
      +'<div style="display:flex;gap:8px;align-items:center;margin-top:6px;padding-top:6px;border-top:1px dashed '+C.blt+'">'
        +'<span style="font-size:12.5px;font-weight:700;color:'+C.deep+'">'+AR(s.rate)+'<span style="font-size:8.5px;font-weight:600;color:'+C.muted+'"> ر.س/يوم</span></span>'
        +'<span style="font-size:9px;font-weight:700;color:'+band.c+'">'+band.lbl+' · '+toAr(s.km)+' كم · '+s.eta+'</span></div>'
      +'<div style="font-size:9px;font-weight:700;color:'+C.blue+';margin-top:5px">انقر لفتح غرفة الصفقة ←</div></div>';
  }
  /* distance rings: 30 / 120 / 220 km around the site */
  ensureRings(){ if(!this.map) return;
    if(!this.ringLayer){ this.ringLayer=L.layerGroup(); this.ringLabels=[];
      [[30000,'٣٠ كم'],[120000,'١٢٠ كم'],[220000,'٢٢٠ كم']].forEach(r=>{
        L.circle(SITE,{radius:r[0],color:'#5B7C99',weight:1,opacity:.3,dashArray:'4 7',fill:true,fillColor:'#5B7C99',fillOpacity:.03,interactive:false}).addTo(this.ringLayer);
        const lbl=L.marker(SITE,{interactive:false,zIndexOffset:-500,icon:L.divIcon({className:'',iconSize:[62,16],iconAnchor:[31,8],
          html:'<div style="font-family:\'IBM Plex Sans Arabic\',sans-serif;font-size:8.5px;font-weight:700;color:#5B7C99;background:rgba(255,255,255,.8);border-radius:5px;text-align:center;padding:1px 0">'+r[1]+'</div>'})}).addTo(this.ringLayer);
        this.ringLabels.push({r:r[0],m:lbl});
      });
    }
    // labels ride the ring to the south-west, away from the site pin and the northern yards; hidden when the ring is tiny
    const sp=this.map.latLngToLayerPoint(SITE), K=111320, cs=Math.cos(SITE[0]*Math.PI/180);
    this.ringLabels.forEach(o=>{ const edge=this.map.latLngToLayerPoint([SITE[0]+o.r/K,SITE[1]]);
      const px=Math.abs(sp.y-edge.y);
      o.m.setOpacity(px<44?0:1);
      const f=0.7071;
      o.m.setLatLng([SITE[0]-o.r*f/K, SITE[1]-o.r*f/(K*cs)]);
    });
    // Rings retired: every distance is now stated in words on its own line, so three dashed circles
    // over the whole city were decoration. Kept the builder so the option is one line away.
    if(this.map.hasLayer(this.ringLayer)) this.map.removeLayer(this.ringLayer);
  }
  /* every bid stays visible at a glance: icons nudge apart, never collapse into a count bubble */
  layoutBids(force){ const M=this.map; if(!M||!this.bidLayer) return;
    const sel=this.selSup, set=this.bidsFor();
    // State 1 = project only. Supplier company coordinates are not reliable enough to plot, so no
    // supplier markers are drawn at any time; the bid list carries the overview instead.
    const key=[M.getZoom(),M.getCenter().lat.toFixed(3),M.getCenter().lng.toFixed(3),sel,this.itemsMode,this.activeItem,this.S.availabilityConfirmed].join('|');
    if(!force && key===this._bidKey) return; this._bidKey=key;
    this.ensureRings();
    this._chipPts=[];                  // distance-chip positions, recomputed per redraw
    this.bidLayer.clearLayers();
    const add=l=>this.bidLayer.addLayer(l);
    // push-apart so all bids read at once, with a leader line back to the true yard
    const site=M.latLngToLayerPoint(SITE);
    const vp=M.getSize();
    const pad={ t:Math.min(76,Math.round(vp.y*0.14)), b:Math.min(118,Math.round(vp.y*0.20)),
                l:Math.min(120,Math.round(vp.x*0.13)), r:Math.min(150,Math.round(vp.x*0.16)) };
    const bandW=Math.max(120,vp.x-pad.l-pad.r), bandH=Math.max(90,vp.y-pad.t-pad.b);
    // full cards are 110×74; if the visible band can't hold them all, fall back to compact icons
    const fits=(w,hh)=>Math.floor(bandW/w)*Math.floor(bandH/hh) >= set.length;
    this.compactPins = !fits(116,80);
    const CW=this.compactPins?50:116, CH=this.compactPins?50:80;
    const HX=CW/2, HY=CH/2, SX=26, SY=30;
    const canClamp = fits(CW,CH);
    const clampN=n=>{ if(n.fixed||!canClamp) return;
      n.x=Math.max(pad.l+HX,Math.min(vp.x-pad.r-HX,n.x)); n.y=Math.max(pad.t+HY,Math.min(vp.y-pad.b,n.y)); };
    const all=(sel==null?[]:set.filter(s=>SUPPLIERS.indexOf(s)===sel)).map(s=>{ const p=M.latLngToLayerPoint(s.co), on=true;
      return {s:s,hx:p.x,hy:p.y,x:p.x,y:p.y,fixed:on}; });
    const outside=n=>!n.fixed && (n.x<-CW || n.x>vp.x+CW || n.y<-CH || n.y>vp.y+CH);
    const away=all.filter(outside), nodes=all.filter(n=>!outside(n));
    const pin={x:site.x,y:site.y,fixed:true};
    // rectangular separation along the axis of least overlap, clamped every pass
    const sep=(A,B,ax,ay,forceX)=>{ const dx=B.x-A.x, dy=B.y-A.y;
      const ox=ax-Math.abs(dx), oy=ay-Math.abs(dy);
      if(ox<=0||oy<=0) return false;
      const both=!A.fixed&&!B.fixed;
      // late passes resolve horizontally: the vertical band is short, so y-pushes get clamped back
      if(forceX||ox<oy){ const s=(dx<0?-1:1)*(both?ox/2+.5:ox+1); if(!A.fixed) A.x-=s; if(!B.fixed) B.x+=both?s:0; if(A.fixed&&!B.fixed) B.x+=s; }
      else { const s=(dy<0?-1:1)*(both?oy/2+.5:oy+1); if(!A.fixed) A.y-=s; if(!B.fixed) B.y+=both?s:0; if(A.fixed&&!B.fixed) B.y+=s; }
      return true;
    };
    for(let it=0;it<160;it++){ let moved=false; const fx=it>70;
      for(let i=0;i<nodes.length;i++){ const A=nodes[i];
        if(sep(A,pin,HX+SX,HY+SY,fx)) moved=true;
        for(let j=i+1;j<nodes.length;j++) if(sep(A,nodes[j],HX*2,HY*2,fx)) moved=true;
        clampN(A);
      }
      if(!moved) break;
    }
    // last resort: if the band still can't hold full cards without overlap, shrink to compact icons
    const clash=()=>{ for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++){
        if(Math.abs(nodes[i].x-nodes[j].x)<CW-2 && Math.abs(nodes[i].y-nodes[j].y)<CH-2) return true; } return false; };
    if(!this.compactPins && clash()){ this.compactPins=true;
      const hx=25, hy=25;
      nodes.forEach(n=>{ const p=M.latLngToLayerPoint(n.s.co); n.x=p.x; n.y=p.y; });
      for(let it=0;it<160;it++){ let moved=false; const fx=it>70;
        for(let i=0;i<nodes.length;i++){ const A=nodes[i];
          if(sep(A,pin,hx+SX,hy+SY,fx)) moved=true;
          for(let j=i+1;j<nodes.length;j++) if(sep(A,nodes[j],hx*2,hy*2,fx)) moved=true;
          if(!A.fixed){ A.x=Math.max(pad.l+hx,Math.min(vp.x-pad.r-hx,A.x)); A.y=Math.max(pad.t+hy,Math.min(vp.y-pad.b,A.y)); }
        }
        if(!moved) break;
      }
    }
    if(away.length){ const lo=Math.min.apply(null,away.map(o=>o.s.rate));
      const anchor=M.layerPointToLatLng([pad.l+80, vp.y-pad.b-6]);
      add(L.marker(anchor,{zIndexOffset:150,icon:L.divIcon({className:'',iconSize:[176,34],iconAnchor:[88,34],
        html:'<div title="انقر لعرض كل العروض" style="font-family:\'IBM Plex Sans Arabic\',sans-serif;display:flex;align-items:center;gap:7px;background:#fff;border:1px solid '+C.border+';border-radius:11px;padding:5px 10px;box-shadow:0 4px 12px rgba(15,34,56,.2);cursor:pointer;white-space:nowrap">'
          +'<span style="width:20px;height:20px;border-radius:50%;background:'+C.navy+';color:#fff;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center">'+AR(away.length)+'</span>'
          +'<span style="font-size:9.5px;font-weight:700;color:'+C.navy+'">عروض أبعد</span>'
          +'<span style="font-size:9px;font-weight:600;color:'+C.muted+'">من '+AR(lo)+' ر.س</span></div>'})})
        .on('click',()=>{ this.selSup==null ? this.fitMap() : this.backToBids(); }));
    }
    // a ring label hides when a bid box lands on it
    if(this.ringLabels){ const bw=CW/2+31, bh=CH/2+8;
      this.ringLabels.forEach(o=>{ if(o.m.options.opacity===0) return;
        const p=M.latLngToLayerPoint(o.m.getLatLng());
        const hit=nodes.some(n=>Math.abs(n.x-p.x)<bw && Math.abs(n.y-CH/2-p.y)<bh);
        o.m.setOpacity(hit?0:1); }); }
    nodes.forEach(n=>{ const i=SUPPLIERS.indexOf(n.s), on=(i===sel);
      const off=Math.hypot(n.x-n.hx,n.y-n.hy);
      const ll = off<1 ? n.s.co : M.layerPointToLatLng([n.x,n.y]);
      const mode = on ? (this.S.availabilityConfirmed?'confirmed':'selected') : 'idle';
      // SELECTED bid fans out: one pin per identified machine at its OWN yard, tied back by a dashed
      // connector, plus a single hollow marker for the unregistered remainder. Unselected bids stay
      // collapsed to one pin so the map remains a comparison of OFFERS, not a field of machines.
      if(on && fleetOf(n.s).length){
        // Only the machines IN this offer. Machines he merely owns were a third pin with a third label
        // and no card in the panel to match — the map now says exactly what the list says.
        const us=unitsOf(n.s);
        // ── GROUPING ──
        // A box anchored to the SUPPLIER's own pin, offset upward so it never covers a unit, stating
        // plainly how many of the offered units are registered machines and how many are only claimed.
        // (An earlier centroid 'hub' label drifted into open desert and overlapped the unit pins.)
        const lv=levelsOf(n.s);
        // connectors are drawn after de-collision, below
        // v3: the panel header now carries this same composition summary (rOfferSummary), and the
        // map box landed on top of the panel. One statement of it, in the panel.
        if(!this.paneMode && (lv.offered>1||lv.alts)){
          const ap=M.latLngToLayerPoint(n.s.co);
          const bll=M.layerPointToLatLng([ap.x,ap.y-96]);
          add(L.marker(bll,{interactive:false,zIndexOffset:820,icon:L.divIcon({className:'',iconSize:[236,74],iconAnchor:[118,74],
            html:'<div style="direction:rtl;background:#fff;border:1px solid '+C.border+';border-radius:12px;padding:9px 12px;box-shadow:0 10px 26px rgba(15,34,56,.26);white-space:nowrap">'
              +'<div style="font-size:10.5px;font-weight:800;color:'+C.deep+';margin-bottom:5px">'+n.s.name+' · '+AR(lv.offered)+' وحدات معروضة</div>'
              +'<div style="display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:700;color:'+C.green+'"><span style="width:9px;height:9px;border-radius:50%;background:'+C.green+'"></span>'+AR(lv.confirmed+lv.located)+' معدّات في هذا العرض</div>'
              +(lv.claimed?'<div style="display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:700;color:'+C.muted+';margin-top:3px"><span style="width:9px;height:9px;border-radius:50%;border:1.5px dashed '+C.muted+'"></span>'+AR(lv.claimed)+' عدد بلا معدّة مسجّلة — لا موقع لها</div>':'')
              +(lv.alts?'<div style="display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:700;color:'+C.blue+';margin-top:3px"><span style="width:9px;height:9px;border-radius:50%;border:1.5px solid '+C.blue+'"></span>'+AR(lv.alts)+' معدّة أخرى لديه — يمكنك طلبها</div>':'')
              +'</div>'})}));
        }
        // Two machines can sit in the SAME yard, in which case their pins landed on the same point and
        // the lower-numbered one was invisible — "where is unit 1?". Fan same-yard units apart in screen
        // space (they keep a marker each, since the renter needs to inspect them individually).
        const taken=[];
        const placed=us.map(u=>{ const p=M.latLngToLayerPoint(u.ll);
          let best={x:p.x,y:p.y}, k=0;
          // nudge outward until this pin clears every pin already placed by at least MIN px
          // Clearance is tested per axis against the real icon box (132×124 incl. label), because a
          // circular test let vertically stacked sprites overlap their labels and badges.
          while(taken.some(q=>Math.abs(q.x-best.x)<132 && Math.abs(q.y-best.y)<128) && k<8){
            // fan DOWNWARD first: the sprite hangs above its anchor, so nudging up pushed pins off the
            // top of the viewport, leaving a label with no machine under it.
            const ang=(Math.PI/2)+(k*(Math.PI/3)), r=150;
            best={x:p.x+Math.cos(ang)*r, y:p.y+Math.sin(ang)*r}; k++;
          }
          taken.push(best);
          return (k===0) ? u.ll : M.layerPointToLatLng([best.x,best.y]);
        });
        us.forEach((u,ui)=>{ const pos=placed[ui];
          // Ride-hailing plainness: ONE line per machine — site to machine, thin and neutral. The
          // supplier-to-yard line said the same thing twice and turned the map into a web.
          // distance, stated on the map itself — a label riding the line from the site to this machine,
          // plus a flag when the yard sits outside the request's city.
          // A shallow arc, drawn as round dots that fade toward the machine: a route, not a ruler. Two
          // machines in the same direction bow apart instead of laying parallel tracks.
          (()=>{ const p0=M.latLngToLayerPoint(SITE), p1=M.latLngToLayerPoint(pos);
            const mx=(p0.x+p1.x)/2, my=(p0.y+p1.y)/2, vx=p1.x-p0.x, vy=p1.y-p0.y;
            const bow=Math.min(56,Math.hypot(vx,vy)*0.16)*(ui%2?-1:1);
            const cx=mx+(-vy/(Math.hypot(vx,vy)||1))*bow, cy=my+(vx/(Math.hypot(vx,vy)||1))*bow;
            const pt=t=>{ const k=1-t; return [k*k*p0.x+2*k*t*cx+t*t*p1.x, k*k*p0.y+2*k*t*cy+t*t*p1.y]; };
            // three segments, each fainter than the last — the fade is what keeps it off the machine
            [[0,.42,.8],[.42,.76,.55],[.76,1,.3]].forEach((seg,si)=>{
              const ptsArr=[]; for(let i=0;i<=10;i++){ const t=seg[0]+(seg[1]-seg[0])*(i/10); ptsArr.push(M.layerPointToLatLng(pt(t))); }
              add(L.polyline(ptsArr,{className:'dpFlow',color:'#6E869C',weight:3,opacity:seg[2],dashArray:'1 9',lineCap:'round',interactive:false}));
            });
          })();
          (()=>{ const a=M.latLngToLayerPoint(SITE), b=M.latLngToLayerPoint(pos);
            // The label rides the line, but every line ENDS inside a pin box (132×124, anchored bottom),
            // so a fixed fraction lands on the machine whenever the line is short. Walk the line from the
            // site end and take the first point that clears the pin box, then nudge perpendicular.
            const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy)||1;
            const clearsPin=(x,y)=>Math.abs(x-b.x)>=86 || (b.y-y)>=136 || (y-b.y)>=26;
            let t=0.62, px2=a.x+dx*t, py2=a.y+dy*t;
            for(let i=0;i<9 && !clearsPin(px2,py2); i++){ t-=0.07; if(t<0.18) t=0.18;
              px2=a.x+dx*t; py2=a.y+dy*t; if(t===0.18) break; }
            if(!clearsPin(px2,py2)){ const nx=-dy/len, ny=dx/len; px2+=nx*30; py2+=ny*30; }
            // and clear of each OTHER: two machines in the same direction put their chips on one spot
            this._chipPts=this._chipPts||[];
            for(let g=0; g<6 && this._chipPts.some(q=>Math.abs(q.x-px2)<58 && Math.abs(q.y-py2)<24); g++){
              const nx=-dy/len, ny=dx/len, s=(g%2?-1:1)*(26+13*Math.floor(g/2));
              px2=a.x+dx*t+nx*s; py2=a.y+dy*t+ny*s;
            }
            this._chipPts.push({x:px2,y:py2});
            const mid=M.layerPointToLatLng([px2,py2]);
            const far=this.outOfCity(u);
            add(L.marker(mid,{interactive:false,zIndexOffset:700,icon:L.divIcon({className:'',iconSize:[150,26],iconAnchor:[75,13],
              html:'<div style="'+"font-family:'IBM Plex Sans Arabic',sans-serif"+';direction:rtl;display:flex;justify-content:center;gap:4px">'
                +'<span style="background:#fff;border:1px solid '+C.border+';border-radius:20px;padding:2px 9px;font-size:10px;font-weight:800;color:'+C.deep+';white-space:nowrap;box-shadow:0 2px 8px rgba(15,34,56,.16)">'+toAr(u.km)+' كم</span>'
                +(far?'<span style="background:#FFF6E8;border:1px solid '+C.amberBd+';border-radius:20px;padding:2px 9px;font-size:10px;font-weight:800;color:#8a4f08;white-space:nowrap;box-shadow:0 2px 8px rgba(15,34,56,.14)">خارج المدينة</span>':'')
                +'</div>'})}));
          })();
          // leader line back to the true yard whenever the pin had to be nudged off it
          if(pos!==u.ll) add(L.polyline([u.ll,pos],{color:'#A9BCCC',weight:1,opacity:.8,interactive:false}));
          add(L.marker(pos,{icon:this.unitIcon(n.s,u,ui,us.length,this.selUnit===ui),zIndexOffset:760,riseOnHover:true})
            .bindTooltip(this.unitTip(n.s,u,ui,us.length),{direction:'top',offset:[0,-16],opacity:1})
            // A pin and its card open the SAME view: the panel takes over with this machine's detail.
            // (It used to open the legacy drawer, which floated over the map and read as a second design.)
            .on('click',()=>{ this.selUnit=ui; this.expUnit=u.serial; this.drawerOpen=false; this.up(); }));
        });
        // L1 (claimed-only) units are NOT drawn. They have no equipment record, therefore no yard and
        // no coordinates — the bid anchor is the OFFER's origin, not theirs. Putting a marker anywhere
        // would assert a position that does not exist. The count is carried by the pin badge, the hub
        // label and the panels instead.
        return;
      }
      add(L.marker(ll,{icon:this.supRoundIcon(n.s,mode,this.compactPins,false),zIndexOffset:on?700:200,riseOnHover:true})
        .bindTooltip(this.supTip(n.s),{direction:'top',offset:[0,-14],opacity:1})
        .on('click',()=>{ on?this.backToBids():this.selectSup(i); }));
    });
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
  // A bid belongs to exactly ONE item — the backend fans a multi-item RFQ into one request per item,
  // so a supplier bidding on three items has three SEPARATE bids. There is no "covers 2 of 3 items".
  // Switching the item strip therefore swaps to that item's own bid list.
  /* Every bid for the active item, BEFORE the distance filter — the denominator of "N of M". */
  allBids(){ if(this.itemsMode!=='multi') return SUPPLIERS; return (ITEM_BIDS[this.activeItem||0]||[]).map(i=>SUPPLIERS[i]); }
  /* Bids after the distance band. The map (layoutBids) and the list both read this, so they can never
     disagree about which bids exist — that was the point of specifying one scope for both. */
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
  /* Shown vs total, so the renter always knows offers are being hidden and how many. */
  bandCount(){ return {shown:this.bidsFor().length, total:this.allBids().length}; }
  sortedBids(){ const k=this.bidSort;
    return this.bidsFor().slice().sort((a,b)=> k==='dist'? a.km-b.km : a.rate-b.rate);
  }
  curSup(){ return this.selSup==null?null:SUPPLIERS[this.selSup]; }
  curYard(){ const s=this.curSup(); return s?s.co:YARDS[this.S.unitIdx||0]; }
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
  backToBidsFit(){ this.backToBids(); setTimeout(()=>{ try{ this.fitMap(); }catch(e){} },40); }
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
  openDrawer(panel){ this.activePanel=panel; this.drawerOpen=true;
    if(panel==='chat'){ this.unread=0; this.dismissNotifQuiet(); this.clearArrivalsFor(this.selSup); }
    this.up(); }
  dismissNotifQuiet(){ clearTimeout(this._nT); this.notif=null; }
  closeDrawer(){ this.drawerOpen=false; this.drawerMax=false; this.up(); }
  toggleDrawerMax(){ this.drawerMax=!this.drawerMax; this.up(); }
  zoom(f){ this.view.scale=Math.max(1,Math.min(4,this.view.scale*f)); if(this._applyMap) this._applyMap(); }
  zoomReset(){ this.view={scale:1,tx:0,ty:0}; if(this._applyMap) this._applyMap(); }

  /* ── derived / price ── */
  curUnit(){ const u=FLEET[this.S.unitIdx||0], s=this.curSup();
    // the room is now scoped to a bidding supplier: its yard/distance own the map + panels
    const f=s?(inBidOf(s)[0]||fleetOf(s)[0]):null;
    return s? Object.assign({},u,{yard:(f?f.yard:s.city),km:toAr(f?f.km:s.km)}) : u; }
  rateLineTotal(rate){ const cfg=this.cfg,S=this.S; if(cfg.mode==='open') return rate*S.qty; const perDay=rate/FREQ_DAYS[cfg.frequency]; return perDay*(cfg.valid?cfg.duration:0)*S.qty; }
  posTotal(p){ return this.rateLineTotal(p.rate)+(p.incMob?p.mob:0)+(p.incDemob?p.demob:0); }
  copyPos(p){ return {rate:p.rate,mob:p.mob,demob:p.demob,incMob:p.incMob,incDemob:p.incDemob,overtime:(p.overtime!=null?p.overtime:450)}; }
  supPos(){ const r=this.S.price.rounds; for(let i=r.length-1;i>=0;i--) if(r[i].who==='sup') return r[i].pos; return this.S.price.sup; }
  myLastRound(){ const r=this.S.price.rounds; for(let i=r.length-1;i>=0;i--) if(r[i].who==='me') return r[i]; return null; }
  supHasCountered(){ return this.S.price.rounds.some(r=>r.who==='sup'); }
  roundNo(){ return this.S.price.rounds.length+1; }
  currentAsk(){ return this.posTotal(this.supPos()); }
  docResolved(d){ return d.state==='verified'||d.deferred; }
  /* The request's minimum build year. One place, so the row, the gate text and the need string
     cannot drift apart. */
  minYear(){ return 2020; }
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
  eqNeeds(){ return this.eqSummary().filter(r=>r.st==='bad').map(r=>r.need||r.k); }
  fitGateOpen(){ return this.eqNeeds().length>0 && !this.S.fitAccepted && !this.S.eligibleAsked; }
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

  /* ── smart chat room + mediator middleware ──
     Rules: (1) assist cards are PRIVATE to this side + dismissible — never a bot bubble in the shared thread.
     (2) the bubble lands first, the card follows. (3) message type × deal stage decides the response.
     (4) unclassified → silence. (5) one nudge per type per room; ✕ mutes it. */
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

  /* ── rentee actions ── */
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

  /* ── quotation ── */
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
  /* The quotation names SERIALS, not a bare count — that is the whole point of binding machines to
     the deal. Any agreed unit with no machine chosen is stated as an explicit remainder, never hidden. */
  pickedSerialsLabel(){ const s=this.curSup(); if(!s) return '—';
    const us=unitsOf(s), sel=(this.pickSel&&this.pickSel[s.id])||{};
    const picked=us.filter((u,i)=>sel[i]);
    const rest=Math.max(0,this.S.qty-picked.length);
    if(!picked.length) return rest?('لم تُحدَّد بعد — '+AR(rest)+' وحدات يحدّدها المورد'):'—';
    return picked.map(u=>u.serial).join(' · ') + (rest?(' · + '+AR(rest)+' يحدّدها المورد'):'');
  }
  togglePick(i){ const s=this.curSup(); if(!s) return;
    const sel=this.pickSel[s.id]||{}; sel[i]=!sel[i]; this.pickSel[s.id]=sel; this.up(); }
  /* Selection modal — the map's unit pins as a list. Same machines, same action, different view.
     Choosing FEWER machines than the count is valid: the renter knows some machines and trusts the
     supplier for the rest. The remainder is stated, never silently filled. */
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

  /* ── supplier simulation ── */
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

  /* ── scenarios ── */
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
  /* ── multi-item ── */
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

  /* ═══════════ GUIDE ═══════════ */
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
  rAgreeModal(){ return this.modalShell('الاتفاق والدفع','الملخص النهائي وجدول الدفع','🤝',this.pAgree(),()=>this.closeAgree(),'560px'); }
  rSupplierModal(){ return this.modalShell('المورد وسجلّه','الثقة والأداء عبر المنصة','⭐',this.pSupplier(),()=>this.closeSupplier(),'520px'); }
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
  /* Rail is TWO buttons now. Eligibility and verification were merged — they are properties of one
     machine, and the renter has just selected that machine on the map. Company documents moved out
     entirely: they belong to the supplier, and open from the supplier row in the bid list. */
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
  /* Distance band selector — §6.10. Default is "all": a renter who cannot see every offer cannot tell
     "few bids" from "narrow filter". */
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
    // Same shell as the machine and company takeovers: a flush, full-height column. The old
    // calc(100vh - 250px) budgeted for a header and a price bar that no longer exist.
    return h('div',{style:{background:'#fff',borderInlineEnd:'1px solid '+C.blt,boxShadow:'6px 0 24px rgba(15,34,56,.10)',pointerEvents:'auto',display:'flex',flexDirection:'column',overflow:'hidden',height:'100%'}},
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
      h('div',{style:{flex:1,overflowY:'auto',minHeight:0,padding:'11px',display:'flex',flexDirection:'column',gap:'9px',background:C.s2}}, list.map(card)));
  }
  /* Colour key, hosted inside the bid panel so nothing can cover it. Collapsed by default — the
     renter who already knows the scale should not pay for it with vertical space every session. */
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
  /* Legend for the unselected map. It USED to explain the ring colour as a distance band — which is now
     wrong, because ring colour means availability. A legend that mislabels the only colour on screen is
     worse than none, so it was replaced rather than kept alongside. Distance lives in each pin's text. */
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
  /* ── drawer / tour / toast (restored) ── */
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
    // CHAT is not a second panel. Mirroring the equipment panel on the opposite edge read as two competing
    // structures with the map squeezed between them; a conversation belongs to the button that opens it, so
    // it opens as a window docked above the chat dock — the map stays whole. «توسيع» still gives it the
    // full drawer when the renter wants to read the whole history.
    // The conversation REPLACES the map rather than floating over it: it fills the canvas beside the panel,
    // flush and square-edged like the map it stands in for, so only ever one thing occupies that space.
    const docked = p==='chat' && !this.drawerMax;
    const w=this.drawerMax?'min(760px, calc(100% - 40px))':'420px';
    // Two placements, switchable: `fill` takes the whole map area beside the panel; `mirror` is the original
    // — a panel on the map's opposite edge, the same 436px as the equipment panel, so the two read as a pair
    // and the map stays visible between them.
    const mirror = this.chatPlace==='mirror';   // default: undefined → full-width over the map
    const shell = docked
      ? (mirror
          ? {position:'absolute',top:0,bottom:0,right:0,width:'436px',maxWidth:'calc(100% - 470px)',borderRadius:0,border:0,
             borderInlineStart:'1px solid '+C.blt,boxShadow:'-6px 0 24px rgba(15,34,56,.10)'}
          : {position:'absolute',top:0,bottom:0,left:'436px',right:0,borderRadius:0,border:0,
             borderInlineEnd:'1px solid '+C.blt,boxShadow:'none'})
      : {position:'absolute',top:'14px',bottom:'14px',right:'14px',width:w,borderRadius:'18px'};
    return h('div',{id:'dpDrawer',style:Object.assign({zIndex:40,display:'flex',flexDirection:'column',
      background:'#fff',border:'1px solid '+C.blt,borderRadius:'18px',boxShadow:'0 18px 48px rgba(15,34,56,.22)',overflow:'hidden',animation:'dpFade .18s ease'},shell)},
      h('div',{style:{flexShrink:0,height:'64px',boxSizing:'border-box',display:'flex',alignItems:'center',gap:'11px',
        padding:'0 18px',borderBottom:'1px solid '+C.blt,background:'#fff'}},
        docked?null:h('div',{style:{width:'36px',height:'36px',borderRadius:'11px',background:C.blueLt,border:'1px solid '+C.blueBd,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'17px',flexShrink:0}},m.ic),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:docked?'12.5px':'13.5px',fontWeight:800,color:C.deep}},m.t),
          docked?null:h('div',{style:{fontSize:'10px',fontWeight:600,color:C.muted,marginTop:'2px'}},m.s)),
        // ONE control decides the placement: full-width over the map (the default) or a side panel beside it.
        docked?h('button',{onClick:()=>{ this.chatPlace=mirror?'fill':'mirror'; this.up();
            setTimeout(()=>{ try{ if(this.map){ this.map.invalidateSize(); this.fitMap(); } }catch(e){} },60); },
          title:mirror?'ملء الخريطة':'لوحة بجانب الخريطة',
          style:{flexShrink:0,width:'30px',height:'30px',borderRadius:'9px',background:'#fff',border:'1px solid '+C.border,
            color:C.navy,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center'}},
          h('svg',{width:'14',height:'14',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'2.1',strokeLinecap:'round',strokeLinejoin:'round'},
            mirror? h(React.Fragment,null,h('path',{d:'M4 10V4h6'}),h('path',{d:'M20 14v6h-6'}),h('path',{d:'M4 4l7 7'}),h('path',{d:'M20 20l-7-7'}))
                  : h(React.Fragment,null,h('rect',{x:'3',y:'4',width:'18',height:'16',rx:'2'}),h('path',{d:'M14 4v16'})))):null,
        h('button',{onClick:()=>this.closeDrawer(),title:'إغلاق',
          style:{width:'30px',height:'30px',borderRadius:'50%',background:'#fff',border:'1px solid '+C.border,color:C.muted,cursor:'pointer',fontSize:'14px',fontFamily:'inherit'}},'✕')),
      h('div',{style:{flex:1,overflowY:'auto',minHeight:0,background:'#fff'}}, body));
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
  /* The supplier answers a moment later. Prototype-only timing; the real trigger is the bid event. */
  scheduleResponse(c){ clearTimeout(this._simT); this._simT=setTimeout(()=>this.simulateResponse(c),4200); }
  simulateResponse(c){
    if(!c) return;                     // guard: the timer can outlive the card it was scheduled for
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
  /* A bid lands while the renter is on the page. Nothing is refetched by hand and nothing is
     re-rendered wholesale — the list is derived from SUPPLIERS, so appending is the whole update. */
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
  /* The renter may be deep in a machine panel when a bid arrives. Same surface as a reply — a bid is
     the one event in this view that changes the ANSWER to "who should I rent from", so it cannot be
     left to a silent list mutation the renter never looks back at. */
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
  /* Minimal arrival log — enough to survive a dismissed toast and to name who is waiting. */
  logArrival(e){ this.arrivals=this.arrivals||[]; this.arrivals.unshift(e);
    if(!e.read) this.bubbleHidden=false;   // a dismissal silences one arrival, never the next
  }
  pendingArrivals(){ return (this.arrivals||[]).filter(function(a){return !a.read;}); }
  latestArrival(){ return this.pendingArrivals()[0]||null; }
  clearArrivalsFor(i){ (this.arrivals||[]).forEach(function(a){ if(a.supIdx===i) a.read=true; }); }
  /* Conversation bubble on the chat icon. Appears on any supplier arrival — a reply to a request or
     an ordinary message — and points at the button that opens the room it came from.

     Only rendered with the rail, i.e. when the drawer is closed. With a panel open the transient
     popup covers that case; putting the bubble over an open drawer would collide with it. */
  arrivalKindLabel(k){ return ({reply:'رد على طلبك',refusal:'رفض طلبك',chat:'رسالة جديدة',bid:'عرض جديد'})[k]||'إشعار'; }
  bubbleArrival(){ return this.pendingArrivals().filter(function(a){return a.kind!=='bid';})[0]||null; }
  hideBubble(){ this.bubbleHidden=true; this.up(); }
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
  openArrival(a){
    a.read=true;
    if(a.kind==='bid'){ this.revealBid(a.supIdx); return; }
    if(a.supIdx!=null && a.supIdx!==this.selSup) this.selectSup(a.supIdx);
    this.openDrawer('chat');
  }
  /* Scroll the offer's row into view and pulse it. Deliberately does NOT select the supplier or open
     a room — the alert said an offer arrived, so the answer is "here it is", nothing more. */
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
  /* An ordinary supplier message — no request, no state change. Still has to reach a renter who is
     looking at the map rather than the conversation. Same surfaces as a reply, minus the ref. */
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
  /* Prototype trigger: the supplier says something unprompted. */
  simSupplierChat(){ this.S.chips.push({who:'sup',kind:'sup',txt:'المعدّة جاهزة، وأستطيع تقديم المشغّل أيضاً إن رغبت.'});
    this.notifyChat('المعدّة جاهزة، وأستطيع تقديم المشغّل أيضاً إن رغبت.'); }
  /* In-view notification. The renter is on the map, not in the chat — so a reply that changes the
     map must announce itself where the renter is actually looking. */
  notify(txt,c,res){ this.notif={txt,ref:c.ref,serial:c.serial,scope:c.scope,resolution:res};
    clearTimeout(this._nT); this._nT=setTimeout(()=>{ this.notif=null; this.up(); },7000); this.up(); }
  dismissNotif(){ clearTimeout(this._nT); this.notif=null; this.up(); }
  openChatFromNotif(){ this.dismissNotif(); this.unread=0; this.openDrawer('chat'); }
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
  rToast(){ if(!this.toastMsg) return null;
    return h('div',{style:{position:'fixed',bottom:'150px',left:'50%',transform:'translateX(-50%)',zIndex:210,background:C.deep,color:'#fff',
      borderRadius:'12px',padding:'11px 18px',fontSize:'12.5px',fontWeight:600,boxShadow:'0 14px 34px rgba(9,20,34,.4)',animation:'dpToast .2s ease',maxWidth:'min(560px,86vw)',textAlign:'center',lineHeight:1.7}},this.toastMsg);
  }

  renderVals(){
    return {
      devBarEl:this.rCaseToggle(),
      supplierChip:this.rSupplierChip(),
      requestSummary:this.rRequest(),
      modeToggleEl:this.rModeToggle(),
      itemStripEl:this.itemsMode==='multi'?this.rItemStrip():null,
      // Colour explanation lives in the bid panel footer (rColourKey) — a floating overlay at
      // z-index 23 sat behind that panel in RTL, so it was invisible in the one state that needed it.
      mapLegend:null,
      // v3 — same floating panel, different subject: once a supplier is selected it lists
      // HIS EQUIPMENT rather than competing bids, because this surface verifies machines.
      guideEl:this.rEquipPanel(),
      chatDockEl:this.rChatDock(),
      mapStylesEl:this.rMapStyles(),
      drawerEl:this.rDrawer(),
      quoteModalEl:(this.quoteOpen||this.unitPick)?h(React.Fragment,null,
        this.quoteOpen?h('div',{key:'q'},this.rQuoteModal()):null,
        this.unitPick?h('div',{key:'p'},this.rUnitPickModal()):null):null,
      agreeModalEl:this.agreeOpen?this.rAgreeModal():null,
      supplierModalEl:this.supplierOpen?this.rSupplierModal():null,
      supplierViewModalEl:h(React.Fragment,null,
        this.supViewOpen?this.rSupplierViewModal():null,
        this.rSubmissionModal()),
      tourEl:this.tourOn?this.rTour():null,
      toastEl:h(React.Fragment,null,this.rDocModal(),this.rToast()),
    };
  }

  /* ── top bar ── */
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
  rTopActions(){ const can=this.canSimulate();
    return h('div',{style:{display:'flex',alignItems:'center',gap:'10px'}},
      h('button',{onClick:()=>this.openSupplierView(),disabled:!can,style:{display:'flex',alignItems:'center',gap:'7px',background:can?C.deep:C.surface,color:can?'#fff':C.muted,border:'none',borderRadius:'11px',padding:'10px 16px',fontSize:'12.5px',fontWeight:700,cursor:can?'pointer':'default',fontFamily:'inherit'}},'👁 محاكاة شاشة المورد'),
      h('button',{onClick:()=>this.startTour(),title:'جولة تعريفية',style:{width:'38px',height:'38px',borderRadius:'11px',background:'#fff',border:'1px solid '+C.border,color:C.muted,fontSize:'15px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',flexShrink:0}},'؟'),
      h('button',{onClick:()=>this.reset(),style:{background:'none',border:'1.5px dashed '+C.border,color:C.muted,borderRadius:'11px',padding:'10px 14px',fontSize:'12px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}},'↺ إعادة'));
  }

  /* ── left rail ── */
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
  /* PROTOTYPE ONLY — switch the offer-composition case so all three sentences can be reviewed on one
     supplier. It overrides the summary line's own reading of the data; nothing else depends on it. */
  rCaseToggle(){
    const cur=this.offerCase||'auto';
    const opts=[['auto','تلقائي'],['single','وحدة واحدة'],['multi','عدّة وحدات'],['short','عدّة وحدات — ناقصة']];
    // Out of the map altogether: every free corner of the canvas belongs to something real — pins, the deal
    // slab, the chat dock — so a prototype-only control has no business there. It docks to the panel's
    // trailing edge as a thin strip instead, where it can collide with nothing.
    // The map has no free region — pins fill the top and centre, the deal slab the panel's foot, the chat
    // dock the bottom corner. So this prototype-only control rests as a 26px tab and only expands over the
    // map when asked, which means its resting footprint can never cover a marker.
    const open=!!this.caseBarOpen;
    if(!open) return h('button',{onClick:()=>{ this.caseBarOpen=true; this.up(); },title:'حالة العرض (نموذج)',
      style:{position:'fixed',top:'50%',left:'436px',transform:'translateY(-50%)',zIndex:29,width:'26px',height:'86px',
        background:'rgba(255,255,255,.96)',border:'1px solid '+C.blt,borderLeft:0,borderRadius:'0 10px 10px 0',
        color:C.muted,fontSize:'9px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',
        writingMode:'vertical-rl',boxShadow:'3px 3px 12px rgba(15,34,56,.10)',padding:0}},'حالة العرض');
    return h('div',{style:{position:'fixed',top:'50%',left:'436px',transform:'translateY(-50%)',zIndex:29,
      display:'flex',flexDirection:'column',alignItems:'stretch',gap:'3px',background:'rgba(255,255,255,.98)',border:'1px solid '+C.blt,
      borderLeft:0,borderRadius:'0 12px 12px 0',padding:'6px',boxShadow:'4px 4px 16px rgba(15,34,56,.16)',maxWidth:'118px'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'4px',padding:'0 2px 3px'}},
        h('span',{style:{flex:1,fontSize:'8.5px',fontWeight:800,color:C.muted,letterSpacing:'.2px'}},'حالة العرض'),
        h('button',{onClick:()=>{ this.caseBarOpen=false; this.up(); },title:'إخفاء',
          style:{background:'none',border:0,color:C.muted,fontSize:'10px',fontWeight:900,cursor:'pointer',fontFamily:'inherit',padding:'0 2px',lineHeight:1}},'✕')),
      opts.map(o=>h('button',{key:o[0],onClick:()=>{ this.offerCase=o[0]==='auto'?null:o[0]; this.up(); },
        style:{background:cur===o[0]?C.navy:'transparent',color:cur===o[0]?'#fff':C.navy,border:0,borderRadius:'7px',
          padding:'4px 7px',fontSize:'9.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',textAlign:'start',lineHeight:1.4}},o[1])));
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
  /* ── map layer ── */
  rMapLayer(){ const S=this.S, u=this.curUnit(), conf=S.availabilityConfirmed;
    const moving=S.stage==='closed';
    const truckTop=moving?u.map.chip[0]:u.map.truck[0], truckRight=moving?u.map.chip[1]:u.map.truck[1];
    return h('div',{style:{position:'absolute',inset:0,pointerEvents:'none'}},
      h('svg',{viewBox:'0 0 390 844',preserveAspectRatio:'xMidYMid slice',style:{position:'absolute',inset:0,width:'100%',height:'100%'}},
        h('path',{d:u.map.route,stroke:conf?C.green:C.amber,strokeWidth:'2.6',strokeDasharray:'7 6',fill:'none',opacity:'.9'})),
      // site pin
      h('div',{style:{position:'absolute',top:'52%',right:'60%',transform:'translate(50%,-100%)',textAlign:'center'}},
        h('div',{style:{position:'absolute',bottom:'-9px',left:'50%',transform:'translateX(-50%)',width:'46px',height:'46px',borderRadius:'50%',background:'rgba(37,99,235,.18)',animation:'dpPulse 2.2s infinite'}}),
        h('div',{style:{position:'relative',width:'34px',height:'34px',margin:'0 auto',background:C.blue,borderRadius:'50% 50% 50% 0',transform:'rotate(-45deg)',boxShadow:'0 4px 12px rgba(37,99,235,.45)',display:'flex',alignItems:'center',justifyContent:'center'}},h('span',{style:{transform:'rotate(45deg)',fontSize:'15px'}},'📍')),
        h('div',{style:{marginTop:'6px',background:'#fff',borderRadius:'9px',padding:'4px 10px',fontSize:'10px',fontWeight:700,color:C.deep,boxShadow:'0 2px 8px rgba(15,34,56,.14)',display:'inline-block'}},'مشروعك')),
      // supplier pin
      h('div',{style:{position:'absolute',top:u.map.pin[0],right:u.map.pin[1],textAlign:'center'}},
        h('div',{style:{width:'30px',height:'30px',margin:'0 auto',background:conf?C.green:C.amber,borderRadius:'50%',border:'3px solid #fff',boxShadow:'0 3px 10px rgba(0,0,0,.25)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'11px',fontWeight:700}},'أخ'),
        h('div',{style:{marginTop:'6px',background:'#fff',borderRadius:'9px',padding:'4px 10px',fontSize:'10px',fontWeight:700,color:C.deep,boxShadow:'0 2px 8px rgba(15,34,56,.14)',display:'inline-block'}},'المعدّة')),
      // distance chip
      h('div',{style:{position:'absolute',top:u.map.chip[0],right:u.map.chip[1],background:conf?C.green:C.amber,color:'#fff',borderRadius:'18px',padding:'8px 14px',fontWeight:700,boxShadow:'0 5px 16px rgba(0,0,0,.28)',display:'flex',flexDirection:'column',alignItems:'center',lineHeight:1.35,border:'2px solid #fff'}},
        h('span',{style:{fontSize:'13px'}},u.km+' كم'),h('small',{style:{fontSize:'8.5px',fontWeight:600,opacity:.9}},conf?'مؤكّد':'مبدئي')),
      // truck
      h('div',{style:{position:'absolute',top:truckTop,right:truckRight,textAlign:'center',transition:'top 1.4s ease,right 1.4s ease'}},
        h('div',{style:{width:'34px',height:'34px',margin:'0 auto',background:'#fff',borderRadius:'50%',border:'2.5px solid '+C.green,boxShadow:'0 3px 10px rgba(15,34,56,.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',position:'relative'}},'🚚',
          moving?h('span',{style:{position:'absolute',inset:'-6px',borderRadius:'50%',border:'2px solid rgba(22,163,74,.55)',animation:'dpRing 2s ease-out infinite'}}):null),
        h('div',{style:{marginTop:'4px',background:'#fff',borderRadius:'8px',padding:'3px 8px',fontSize:'9px',fontWeight:700,color:C.deep,boxShadow:'0 2px 8px rgba(15,34,56,.14)',display:'inline-block'}},'الشحنة')));
  }
  /* Legend for the SELECTED bid — teaches the marker vocabulary, because colour alone did not.
     Three marker kinds and two independent pips, spelled out. */
  /* ── right panel tabs ── */
  /* Everything about a machine — fit, its documents, the company's — is one panel now, so there is
     nothing left for this to focus that isn't 'equip'. */
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
        h('span',{style:{flex:1}},'برج العليا · مشروعك'),
        h('span',{style:{fontSize:'12px',fontWeight:700,color:C.deep,flexShrink:0}},u.km+' كم')));
  }
  /* The whole submission, exactly as it arrived. Seven sections, matching spec §6.12.7. */
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
  /* Read-only bar. There is no DealRoom before conversion, so there is nothing for accept or
     counter-offer to call — showing them disabled would imply the flow exists. */
  /* Breakdown for an off-platform submission. VAT is DERIVED as total − subtotal rather than recomputed,
     so the figures can never disagree with the stored `total` by a rounding unit. */
  offBreakdown(){ const it=this.offSub().items[0], n=it.offeredUnits;
    const rental=it.rentalRate*n, mob=it.deliveryPrice*n, demob=it.returnPrice*n;
    const sub=rental+mob+demob;
    return {n,rental,mob,demob,sub,vat:it.total-sub,total:it.total};
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
  /* Off-platform submission, presented as the submitted document itself — mirrors the live app's
     "view submission" modal rather than inventing a second visual language for the same object. */
  /* Mirrors src/lib/contract/bid-quality.ts EXACTLY. That file already exists in the web and is the
     source of truth — this is a prototype restatement of it, not a second design.

       terms     40%  fraction of the REQUIRED terms the supplier confirmed true
       equipment 30%  BUCKET coverage: photos + ownership always; equipment / operator certificates
                      only when the request requires them. Not a document count.
       company   30%  four OPTIONAL slots — cr / vat / address / otherDocs — each satisfiable by text
                      OR a document. Company name and contact are EXCLUDED: both are required to
                      submit, so scoring them would hand every submission free points.
       bands     high >= 80, mid >= 50, else low. */
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
  /* Equipment detail for an off-platform submission. Mirrors the live card's Equipment → Details, and is
     deliberately NOT the machine panel: there is no listing, so no serial, no year, no yard, no readiness
     band and no availability chip. What exists is the taxonomy label, the offered count, photos and the
     attached documents. */
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

  /* ── EQUIPMENT / FIT ── */
  /* Which identified machine the panels are scoped to, and its two independent indicators. */
  /* Parity with src/lib/contract/vat-inclusive.ts — the signal is a tagged line in `notes`, not a column. */
  hasVatTag(notes){ return /\[VAT-INCLUSIVE\]/i.test(notes||''); }
  stripVatTag(notes){ return String(notes||'').split('\n').filter(l=>!/\[VAT-INCLUSIVE\]/i.test(l)).join('\n').trim(); }
  isOff(s){ return !!(s&&s.offPlatform); }
  offSub(){ const s=this.curSup(); return this.isOff(s)?s.submission:null; }
  curUnitRec(){ const s=this.curSup(); if(!s) return null; const us=unitsOf(s); return us[this.selUnit] || us[0] || null; }
  /* Readiness = does this machine hold what the REQUEST asks for (photos + requested certs).
     Ownership papers are excluded by design — the renter's payload strips them, so scoring them
     would hold every supplier permanently short. Separate signal from the yard. */
  unitReadiness(ur){ if(!ur) return null;
    const keys=[{k:'الصور الإلزامية',ok:true},{k:'شهادة السلامة',ok:!!ur.cert},{k:'شهادات المشغّل',ok:!!ur.cert}];
    const done=keys.filter(x=>x.ok).length, total=keys.length;
    const pct=Math.round(done/total*100);
    return {done,total,pct,band:pct>=100?'green':pct>=50?'yellow':'red',keys};
  }
  /* The three levels as one short string — used on the hub, in the panel and in the legend so the
     same vocabulary appears everywhere. */
  levelsLabel(s){ const L2=levelsOf(s); const p=[];
    if(L2.confirmed) p.push(AR(L2.confirmed)+' مؤكّدة');
    if(L2.located)   p.push(AR(L2.located)+' بموقع غير مؤكّد');
    if(L2.claimed)   p.push(AR(L2.claimed)+' معلنة بلا معدّة');
    return p.join(' · ') || '—';
  }
  /* Three-level breakdown block, for the equipment panel. */
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
  bandColor(b){ return b==='green'?C.green : b==='yellow'?C.amber : C.red; }
  bandLabel(b){ return b==='green'?'مكتملة' : b==='yellow'?'ناقصة جزئياً' : 'ناقصة'; }
  /* PROTOTYPE FIXTURE: how many of the 4 mandatory photo slots this machine has uploaded. In the real
     app these come from `offeredUnitsDetail[].photos` ({slot, url}), which is already on the wire. */
  unitPhotoCount(u){ if(!u) return 0;
    const digits=String(u.serial).replace(/\D/g,'').split('').reduce((a,c)=>a+(+c),0);
    return 2+(digits%3); }
  /* Match % against the request — the share of comparison rows that come back OK. Distinct from
     readiness (documents) and from the yard signal; all three answer different questions. */
  unitMatchPct(){ const rows=this.eqSummary(); if(!rows.length) return 100;
    const ok=rows.filter(r=>r.st==='ok').length;
    return Math.round(ok/rows.length*100); }
  /* Photo strip — the 4 mandatory slots, filled ones first, empty ones as dashed placeholders. */
  rUnitPhotos(){ const u=this.curUnitRec(); const n=this.unitPhotoCount(u); const SLOTS=['أمامية','اللوحة','العدّاد','جانبية'];
    return h('div',{style:{display:'flex',gap:'8px',marginTop:'10px',overflowX:'auto',paddingBottom:'2px'}},
      SLOTS.map((lbl,i)=>{ const has=i<n;
        return h('div',{key:i,title:lbl,style:{flexShrink:0,width:'74px'}},
          h('div',{style:{height:'58px',borderRadius:'11px',border:has?('1px solid '+C.blt):('1.5px dashed '+C.border),background:has?'#E8EEF5':C.s2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'19px',color:C.muted}}, has?'📷':'—'),
          h('div',{style:{fontSize:'8.5px',fontWeight:700,color:has?C.navy:C.muted,textAlign:'center',marginTop:'4px'}},lbl)); }));
  }
  /* Collapsed summary card — identity + match bar + a documents count that drills into the docs panel.
     "Swap" is NOT a local action: the renter cannot reassign a supplier's machine, so it opens a
     prefilled chat message asking for a different one. */
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
  askSwap(){ this.askAnotherOfType(); }
  /* Unit switcher — the list form of the map's unit pins. Same selection, different view. */
  rUnitSwitch(){ if(this.paneMode) return null;   // v3: the equipment strip above is the navigation
    const s=this.curSup(); if(!s) return null; const us=unitsOf(s), gh=(s.ghost||0);
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
  /* Compose the request into the chat, UNSENT. The renter sees the card and sends it explicitly. */
  composeRequest(u,act,docType){
    // Scope travels with the request: a COMPANY document is not attached to a machine, so it carries no
    // equipmentId and no serial — that is what the reply resolver branches on to mark s.gotDocs.
    const scope=act.scope||'equipment', co=scope==='company';
    this.pendingCard={type:'rentee_request',scope:scope,kind:act.kind,
      equipmentId:co?null:(u&&u.id)||null,serial:co?null:(u&&u.serial)||null,ref:this.nextRef(),
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
  /* Document picker: only what is MISSING or UNVERIFIED on this machine, so the request names a type. */
  missingDocsFor(u){ const all=this.vfEquipDocs();
    return all.filter(d=>d.s!=='ok').map(d=>d.k);
  }
  /* This machine's documents, inside the machine panel. Merged from the old verification button: one
     machine, one panel. Company documents are NOT here — they open from the supplier row (rSupplierDocs). */
  availabilityExplainer(ur){ if(!ur) return null;
    if(ur.confirmed) return {tone:'green',
      title:'أكّد المورد توفّر هذه المعدّة',
      body:'حدّد المورد ساحة هذه المعدّة في جاهزية العرض، فظهرت خضراء على الخريطة. الموقع أدناه هو ما أكّده هو.'};
    return {tone:'amber',
      title:'لم يؤكّد المورد توفّر هذه المعدّة بعد',
      body:'المعدّة مسجّلة لدى المورد ونعرف موقعها من ملفّها، لكنه لم يؤكّد ساحتها في جاهزية العرض. هذا لا يعني أنها غير متوفّرة — يعني أنه لم يؤكّدها.',
      cta:'اطلب تأكيد التوفّر'};
  }
  /* Sticky identity strip — the machine every tab below is talking about. Stays put while the
     tabs change so a request can never be composed against a machine the renter has scrolled away
     from. Mirrors the card that will be posted into the chat. */
  /* What the offer is MADE OF. Confirmation per machine is read from the chip below; this answers the
     question nothing else does — how much of the quoted count is an actual registered machine, and how
     much is a number with nothing behind it. */
  /* One literal form for every count — «١ وحدة», «٢ وحدة», «٣ وحدة». Decided by the product owner over
     grammatical pluralisation; kept as a helper so it is changed in one place if that is revisited. */
  unitsWord(n){ return AR(n)+' وحدة'; }
  rOfferSummary(){ const s=this.curSup(); if(!s) return null;
    const L=levelsOf(s), off=L.offered;
    // The fleet total always renders (§2); only the offered and shortfall lines are conditional.
    const GOOD='#12904A', BAD='#C62A2A';
    // Off-platform bids never reach this view (v3: nothing to verify, nothing to plot).
    if(false && this.isOff(s)){
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
    return this.rOfferSlots(s,L);
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
  /* No registered machine in this offer at all — the supplier quoted a count and nothing else. The
     panel still exists (price, company documents and chat are all real), but there is nothing to
     inspect, so it says that plainly instead of rendering an empty shell. */
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
  /* ══════════ v3 — the equipment pane ══════════
     The page verifies ONE supplier's machines, so the left pane owns the space:
     who the supplier is → which of his machines → that machine in full. The
     eligibility/fit content that used to hide behind a tab is inline here, and the
     only thing still behind a button is documents, because a document list is a
     different task (pick types, request, download) rather than something you read. */

  /* Which supplier — plus, for the prototype only, a way to change him. In the app
     the renter arrives already scoped from the bid list. */
  /* One card per machine, in the same visual grammar the bid rows used. Offered machines
     are inspectable — selecting one focuses its pin and opens the detail. A machine he owns
     but did not offer is not inspectable; it is something to ASK for. */
  rEquipCards(){ const s=this.curSup(); if(!s) return null;
    const all=fleetOf(s), offered=unitsOf(s);
    if(!all.length) return h('div',{style:{padding:'14px',fontSize:'11px',color:C.muted,lineHeight:1.8,textAlign:'center'}},
      'لا توجد معدّة مسجّلة في هذا العرض — قدّم المورد سعراً وعدداً فقط.');
    const reqSpec=(this.curUnit()||{}).spec||'';

    return all.map(u=>{
      const inBid=!!u.inBid, oi=offered.indexOf(u), on=inBid&&oi===this.selUnit;
      return h('div',{key:u.serial,
        onMouseEnter:()=>{ if(inBid){ this.hoverUnit=oi; this.updateLeaflet(false); } },
        onMouseLeave:()=>{ if(this.hoverUnit===oi){ this.hoverUnit=null; this.updateLeaflet(false); } },
        style:{position:'relative',flexShrink:0,background:on?C.blueLt:'#fff',border:'1.5px solid '+(on?C.blue:C.blt),
          borderRadius:'14px',overflow:'hidden',boxShadow:on?'0 4px 14px rgba(37,99,235,.18)':'0 2px 6px rgba(15,34,56,.05)',
          opacity:inBid?1:.92,transition:'.15s'}},

        on?h('span',{key:'acc',style:{position:'absolute',insetInlineStart:0,top:0,bottom:0,width:'4px',background:C.blue}}):null,

        h('button',{onClick:()=>{ if(!inBid) return; this.selUnit=oi; this.openDrawer('equip'); if(this.map) this.updateLeaflet(false); },
          style:{width:'100%',textAlign:'start',background:'none',border:0,cursor:inBid?'pointer':'default',
            fontFamily:'inherit',padding:'11px 13px 11px 15px',display:'flex',gap:'10px',alignItems:'center'}},

          h('div',{style:{width:'44px',height:'44px',borderRadius:'10px',flexShrink:0,position:'relative',
            background:'linear-gradient(135deg,#F2C94C,#E19A2E)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'20px'}},'🏗️',
            inBid?h('span',{style:{position:'absolute',bottom:'-3px',insetInlineEnd:'-3px',width:'14px',height:'14px',borderRadius:'50%',
              border:'2px solid #fff',background:u.confirmed?'#12904A':'#C62A2A'}}):null),

          h('div',{style:{flex:1,minWidth:0}},
            h('div',{style:{display:'flex',alignItems:'center',gap:'6px'}},
              h('span',{style:{fontSize:'12px',fontWeight:800,color:C.deep,fontFamily:'ui-monospace,monospace',direction:'ltr'}},u.serial),
              inBid?null:h('span',{style:{fontSize:'8px',fontWeight:800,color:C.muted,background:C.s2,border:'1px solid '+C.border,borderRadius:'6px',padding:'1px 5px'}},'خارج العرض')),
            h('div',{style:{fontSize:'9.5px',fontWeight:600,color:C.muted,marginTop:'2px'}},reqSpec+' · '+u.year),
            h('div',{style:{display:'flex',alignItems:'center',gap:'5px',flexWrap:'wrap',marginTop:'5px'}},
              inBid?h('span',{style:{fontSize:'9px',fontWeight:800,color:u.confirmed?C.green:C.red}},
                u.confirmed?'✓ التوفّر مؤكّد':'؟ غير مؤكّدة'):null,
              h('span',{style:{fontSize:'9px',fontWeight:700,color:u.cert?C.green:'#8a4f08'}},u.cert?'· شهادة على الملف':'· لا شهادة'),
              h('span',{style:{fontSize:'9px',fontWeight:700,color:C.muted}},'· '+(u.yard||'—')+' · '+AR(u.km)+' كم'))),

          inBid?h('span',{style:{flexShrink:0,color:on?C.blue:C.muted,fontSize:'13px',fontWeight:900}},'‹'):null),

        inBid?null:h('div',{style:{padding:'0 13px 11px'}},
          h('button',{onClick:()=>this.composeRequest(u,{kind:'alternative',text:'هل يمكنك تقديم '+u.serial+' بدلاً منها؟'}),
            style:{width:'100%',background:'#fff',border:'1.5px solid '+C.blueBd,color:C.blue,borderRadius:'9px',padding:'8px',
              fontSize:'10.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'اطلب هذه المعدّة بدلاً منها')));
    });
  }

  rEquipPanel(){ const s=this.curSup();
    if(!s) return this.rBidsPanel();          // no supplier chosen yet → the offers, as before
    const all=fleetOf(s), offered=unitsOf(s), confirmed=offered.filter(u=>u.confirmed).length;
    if(this.coOpen) return this.rCompanyPanel(s);
    // A machine takes over the whole panel, as in the reference: one subject on screen at a time.
    if(this.expUnit){ const u=offered.concat(altsOf(s)).find(x=>x.serial===this.expUnit); if(u) return this.rEquipDetail(s,u); }
    return h('div',{style:{background:'#fff',borderInlineEnd:'1px solid '+C.blt,pointerEvents:'auto',display:'flex',flexDirection:'column',overflow:'hidden',height:'100%',boxShadow:'6px 0 24px rgba(15,34,56,.10)'}},

      // One header geometry across all three panels — equipment, company, chat: 64px tall, 18px gutters.
      h('div',{style:{position:'relative',overflow:'hidden',flexShrink:0,height:'64px',boxSizing:'border-box',
        display:'flex',flexDirection:'column',justifyContent:'center',padding:'0 18px',borderBottom:'1px solid '+C.blt,
        background:'linear-gradient(180deg,#FBFDFF,#F2F7FC)'}},
        // a single sheen sweeps the header once on open — the panel feels handed over, not just swapped
        h('span',{style:{position:'absolute',top:0,bottom:0,width:'42%',pointerEvents:'none',
          background:'linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent)',
          animation:'dpSheen 1.5s ease-out .1s 1 both'}}),
        // The header carries the company name and its verified tick, nothing else. The whole name is the
        // way into the full company profile and its documents (feature list §3).
        h('div',{style:{display:'flex',alignItems:'center',gap:'10px'}},
          // No route back to an offers list: the renter arrives here having already engaged this bid, so this
          // surface opens on his machines and never shows competing offers.
          h('span',{style:{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:'7px'}},
            h('span',{style:{minWidth:0,fontSize:'16px',fontWeight:800,color:C.deep,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},s.name),
            this.rVerifiedChip(s)),
          // the way into the company file is an explicit control on the trailing edge, not the name itself
          h('button',{onClick:()=>{ this.coOpen=true; this.expUnit=null; this.up(); },
            style:{flexShrink:0,display:'inline-flex',alignItems:'center',gap:'5px',background:'#fff',border:'1px solid '+C.border,
              color:C.navy,borderRadius:'20px',padding:'5px 10px',fontSize:'10.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},
            'مستندات الشركة',h('span',null,'‹')))),

      h('div',{style:{flex:1,overflowY:'auto',minHeight:'160px',padding:'14px',display:'flex',flexDirection:'column',gap:'10px',background:C.s2}},
        this.rOfferSummary(),
        this.rEquipGroups(),
        // At the FOOT of the list, named for what it actually asks: another machine of the requested type.
        h('button',{key:'askalt',onClick:()=>{ const lv=levelsOf(this.curSup()); const short=lv&&lv.claimed;
            this.composeRequest(null,{kind:'alternative',text:short
              ? ('عرضك يتضمّن '+this.unitsWord(lv.offered)+' وأرى '+AR(lv.offered-lv.claimed)+' معدّة مسجّلة فقط. أضف المعدّات الناقصة إلى العرض حتى نتمكّن من فحصها.')
              : 'هل يمكنك إضافة '+this.reqTypeWord(1)+' أخرى إلى هذا العرض؟'}); },
          style:{flexShrink:0,background:'#fff',border:'1.5px dashed '+C.border,color:C.navy,borderRadius:'12px',padding:'11px',
            fontSize:'12px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},
          'اطلب من المورد إضافة '+this.reqTypeWord(1)+' أخرى')),

      // the deal — pinned to the panel's foot, where the colour key used to sit
      // The deal is the panel's anchor, so it sits on a dark slab — the one weighted surface in the layout,
      // and the thing the renter's eye returns to after comparing machines.
      // One footer geometry across the panels: 76px tall, 18px gutters, contents vertically centred.
      h('div',{style:{flexShrink:0,height:'76px',boxSizing:'border-box',display:'flex',flexDirection:'column',
        justifyContent:'center',borderTop:'1px solid rgba(255,255,255,.08)',
        background:'linear-gradient(180deg,#152C46,#0F2238)',padding:'0 18px'}},
        this.rHeadDeal(true)));
  }

  /* One panel, two subjects. Chat used to open as a mirror panel on the opposite edge — two full-height
     structures with the map pinched between them. It is the same conversation about the same offer, so it
     belongs in the same panel, and the map is never squeezed. */
  rPanelTabsUnused(){ const t=this.panelTab||'equip', n=this.unread||0;
    const tab=(id,lbl,badge)=>h('button',{key:id,onClick:()=>{ this.panelTab=id;
        if(id==='chat'){ this.unread=0; this.bubbleHidden=true; }
        this.up(); },
      style:{flex:1,display:'inline-flex',alignItems:'center',justifyContent:'center',gap:'6px',transition:'.15s',background:t===id?'#fff':'transparent',
        border:'1px solid '+(t===id?C.blt:'transparent'),boxShadow:t===id?'0 1px 3px rgba(15,34,56,.10)':'none',
        color:t===id?C.deep:C.muted,borderRadius:'9px',padding:'7px 10px',fontSize:'11.5px',fontWeight:800,
        cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},
      lbl,
      badge?h('span',{style:{minWidth:'17px',height:'17px',borderRadius:'999px',background:C.red,color:'#fff',fontSize:'10px',
        fontWeight:900,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:'0 5px'}},AR(badge)):null);
    return h('div',{style:{display:'flex',gap:'4px',marginTop:'13px',padding:'3px',background:C.s2,border:'1px solid '+C.blt,borderRadius:'11px'}},
      tab('equip','المعدّات',0),tab('chat','المحادثة',n));
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
  /* Tabs. The counts are "needs attention", not totals — a badge that always shows a number stops
     being a signal. */
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
  pEquip(){ const tab=this.eqTab||'fit';
    // Company documents still work with no machine; the other two tabs have no subject.
    if(!this.curUnitRec() && tab!=='co') return h('div',{style:{padding:'16px'}},
      this.rMachineTabs(), this.rOfferSummary(), this.rNoMachines());
    if(tab==='docs') return h('div',{style:{padding:'16px'}},this.rMachineHeader(),this.rMachineTabs(),this.rDocPanel(this.vfEquipDocs(),'equip'));
    if(tab==='co')   return h('div',{style:{padding:'16px'}},this.rMachineHeader(),this.rMachineTabs(),this.rDocPanel(this.vfCompanyDocs(),'company'));
    return this.pEquipFit();
  }
  /* `compact` — embedded inside an equipment card, which already states the machine's
     identity and availability, so the header would say it twice. */
  pEquipFit(compact){ const u=this.curUnit(), gate=this.fitGateOpen();
    const ICN={ok:'✓',bad:'⚠',claim:'?',na:'—'};
    const stColor={ok:C.green,bad:C.red,claim:C.amber,na:C.muted};
    const stBg={ok:C.greenLt,bad:C.redLt,claim:C.amberLt,na:C.s2};
    const stBd={ok:C.greenBd,bad:C.redBd,claim:C.amberBd,na:C.border};
    const rows=this.eqSummary();
    const ur=this.curUnitRec(), rd=this.unitReadiness(ur);
    return h('div',{style:{padding:compact?'12px 13px 14px':'16px'}},
      compact?null:this.rMachineHeader(),
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
  /* Both actions, together. Not an either/or: the renter may want the yard confirmed AND to see what
     else this supplier has, so neither hides the other. Availability only appears when it is the
     open question. */
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
  /* Asking for a different machine is a property of the whole panel, not of any one indicator, so it
     sits at the end — after the renter has seen why he might want a different one. */
  /* Asks by TYPE, never "instead of this serial" — the renter is asking what else the supplier has
     registered, not rejecting the machine he is looking at. */
  askAnotherOfType(){ const ur=this.curUnitRec(); if(!ur) return; const u=this.curUnit();
    this.composeRequest(ur,{kind:'alternative',
      text:'هل لديك '+u.spec+' أخرى مسجّلة لديك؟ أرسل لنا خياراتك المتاحة المطابقة لمواصفات الطلب.'});
  }
  /* Collapsed detail. Everything the renter may want but is not being asked to act on lives here,
     which is what keeps each tab to roughly one screen. */
  btn(bg){ return {background:bg,color:'#fff',border:'none',borderRadius:'11px',padding:'11px',fontSize:'12.5px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',width:'100%'}; }
  btnGhost(){ return {background:'#fff',color:C.navy,border:'1.5px solid '+C.border,borderRadius:'11px',padding:'11px',fontSize:'12.5px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}; }

  /* ── VERIFICATION ── */
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
  vfAttention(list){ return list.filter(d=>d.s!=='ok'&&d.s!=='deferred').length; }
  /* ── document multi-select ── keyed per tab so switching tabs doesn't carry a stale selection. */
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
  /* Download acts on the ticked documents individually — no merged PDF (mixed PDFs + images would
     need a PDF library or a backend endpoint). Ownership rows carry no file and are never included. */
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
  /* Request = a PREFILLED CHAT MESSAGE naming the ticked documents. Nothing is recorded as a formal
     request; the readiness band updates on its own when the supplier uploads. */
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
  /* Short human-quotable reference. Sequential in the prototype; the backend mints it. */
  nextRef(){ this.reqSeq=(this.reqSeq||0)+1; return 'RQ-'+String(1000+this.reqSeq*37).slice(-4); }
  rDocActions(list,tab){ const n=this.docSelCount(list,tab);
    return h('div',{style:{position:'sticky',bottom:0,zIndex:5,display:'flex',gap:'9px',marginTop:'10px',padding:'11px 0 4px',borderTop:'1px solid '+C.blt,background:'linear-gradient(180deg,rgba(248,250,252,.82),#F8FAFC 34%)',backdropFilter:'blur(3px)'}},
      h('button',{onClick:()=>this.docDownload(list,tab),disabled:!n,
        style:{flex:1,background:'#fff',border:'1.5px solid '+C.border,color:n?C.navy:C.muted,borderRadius:'12px',padding:'11px',fontSize:'12.5px',fontWeight:700,cursor:n?'pointer':'default',fontFamily:'inherit',opacity:n?1:.6}},'⤓ تنزيل'),
      h('button',{onClick:()=>this.docRequest(list,tab),disabled:!n,
        style:{flex:2,background:n?C.blue:C.border,border:0,color:'#fff',borderRadius:'12px',padding:'11px',fontSize:'12.5px',fontWeight:700,cursor:n?'pointer':'default',fontFamily:'inherit'}},'+ طلب عبر المحادثة'));
  }
  /* One row, one request. Same card shape as the multi-select path. */
  requestOneDoc(d,tab){ const ur=this.curUnitRec();
    this.pendingCard = tab==='company'
      ? {type:'rentee_request',scope:'company',kind:'document',equipmentId:null,serial:null,
         docTypes:[d.k],ref:this.nextRef(),text:'هل يمكنك تزويدنا بمستند الشركة: '+d.k+'؟'}
      : {type:'rentee_request',scope:'equipment',kind:'document',equipmentId:(ur?ur.id:null),serial:(ur?ur.serial:null),
         docTypes:[d.k],ref:this.nextRef(),text:'هل يمكنك تزويدنا بمستند هذه المعدّة: '+d.k+'؟'};
    this.activePanel='chat'; this.drawerOpen=true; this.up();
  }
  /* ═══ requesting documents that are ALREADY on file ═══
     The renter can tick anything, including verified rows. Silently asking the supplier for a document
     he already uploaded wastes his time and makes the renter look like he did not look. So the send is
     interrupted once, with the choice stated. */
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
  /* Shared document list — checkbox multi-select, one row per document, request/download footer.
     `tab` is 'equip' (scoped to the selected machine) or 'company' (scoped to the supplier). */
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
  /* ── TERMS ── */
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

  /* ── SUPPLIER ── */
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

  /* ── AGREEMENT ── */
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

  /* ── CHAT ROOM (rich: bubbles · media · private mediator cards) ── */
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
  /* The supplier's reply. Carries the echoed correlation triple (§7.13.4 layer 3) — which is the
     only layer that can express a refusal, since a refusal changes no state. */
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
  /* Items this supplier has a SEPARATE bid on, within this RFQ. Each is its own deal room and its
     own chat channel — the tabs group them so two bids from one supplier stop reading as two
     unrelated conversations. Grouping only; nothing about the rooms changes. */
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
  /* Resolve a card's machine from its equipmentId — the card renders the CURRENT machine, never a
     snapshot taken when the request was sent. */
  unitByRef(c){ if(!c||c.scope==='company'||!c.equipmentId) return null;
    let found=null;
    SUPPLIERS.forEach(s=>{ fleetOf(s).forEach(u=>{ if(u.id===c.equipmentId) found={s,u}; }); });
    return found;
  }
  /* The reply that echoed this request's ref, if the supplier has sent one (§7.13.4 layer 3). */
  echoFor(c){ const ch=this.S.chips||[];
    for(let i=ch.length-1;i>=0;i--){ const x=ch[i];
      if(x.kind==='reply'&&x.reply&&x.reply.inReplyTo===c.ref) return x.reply; }
    return null;
  }
  /* Kinds whose answer can be read off the machine. The rest can only be answered by the echo. */
  /* 'alternative' has no observable counterpart — nothing in the data says "a different machine
     instead of this one" — so it is answered by the echoed resolution (§7.13.4 layer 3). */
  derivable(c){ return c.kind==='availability'||c.kind==='document'; }
  /* The live answer. Layer 1 (derived state) wins; where nothing is derivable, layer 3 (the echoed
     resolution) answers; only then is it genuinely still open. Returns {txt, color, done}. */
  cardState(c){
    if(!this.derivable(c)){
      const e=this.echoFor(c);
      if(e&&e.resolution==='declined') return {txt:'رفض المورد الطلب',color:C.amber,done:true};
      if(e&&e.resolution==='provided') return {txt:'استجاب المورد',color:C.green,done:true};
      return {txt:'بانتظار رد المورد',color:C.muted,done:false};
    }
    return this.derivedState(c);
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
  cardKindLabel(c){ return ({availability:'طلب تأكيد التوفّر',document:'طلب مستند',
    alternative:'طلب معدّة أخرى'})[c.kind]||'طلب'; }
  /* One renderer, two callers: the unsent draft (draft=true, with send/cancel) and the sent
     message. Identical body — the renter reviews the exact thing the supplier will see. */
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
  /* Pre-composed request card sits in the chat UNSENT until the renter sends it. */
  rPendingCard(){ const c=this.pendingCard; if(!c) return null;
    return h('div',{style:{flexShrink:0,margin:'10px 12px'}},this.rRequestCard(c,true));
  }
  pChat(){ const S=this.S; const typed=S.chips.filter(c=>c.kind==='me').length;
    const attOpt=(ic,t,s,kind)=>h('button',{key:kind,onClick:()=>this.attSend(kind),style:{display:'flex',alignItems:'center',gap:'9px',background:'none',border:'none',borderRadius:'11px',padding:'9px 10px',textAlign:'start',cursor:'pointer',fontFamily:'inherit',width:'100%'},onMouseEnter:e=>e.currentTarget.style.background=C.s2,onMouseLeave:e=>e.currentTarget.style.background='none'},
      h('span',{style:{width:'34px',height:'34px',borderRadius:'10px',background:C.blueLt,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',flexShrink:0}},ic),
      h('div',{style:{minWidth:0}},h('div',{style:{fontSize:'11.5px',fontWeight:800,color:C.deep}},t),h('div',{style:{fontSize:'9px',fontWeight:700,color:C.muted,marginTop:'2px'}},s)));
    const sugg=(k,lbl)=>h('button',{key:k,onClick:()=>this.chSuggest(k),style:{flexShrink:0,background:'#fff',border:'1px solid '+C.border,borderRadius:'16px',padding:'6px 11px',fontSize:'10.5px',fontWeight:700,color:C.navy,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},lbl);
    return h('div',{style:{display:'flex',flexDirection:'column',height:'100%'}},
      // supplier header — follows the SELECTED supplier (was hardcoded to the first fixture row)
      // No supplier header: the drawer's own title bar and the panel beside it both already name him. The
      // phone control moves to the composer, where the other input affordances live.
      // stream
      h('div',{ref:el=>{ if(el) requestAnimationFrame(()=>{ el.scrollTop=el.scrollHeight; }); },style:{flex:1,overflowY:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:'8px',background:'#EDF3FA'}},
        h('div',{style:{alignSelf:'flex-start',background:'#fff',border:'1px solid '+C.blt,borderRadius:'13px 13px 13px 4px',padding:'9px 12px',fontSize:'12.5px',color:C.deep,maxWidth:'80%',lineHeight:1.7}},'أهلاً! المعدّة جاهزة لأي استفسار'),
        S.chips.map((c,i)=>this.chatMsg(c,i))),
      this.rChatTabs(),
      this.rPendingCard(),
      // suggestion row (before user types) — showcases the mediator
      null,
      // composer
      // same footer geometry as the panels: 76px tall, 18px gutters, contents centred
      h('div',{style:{flexShrink:0,height:'76px',boxSizing:'border-box',position:'relative',padding:'0 18px',background:'#fff',borderTop:'1px solid '+C.blt,display:'flex',gap:'8px',alignItems:'center'}},
        this.attOpen? h('div',{style:{position:'absolute',bottom:'62px',insetInlineStart:'12px',zIndex:40,background:'#fff',borderRadius:'15px',boxShadow:'0 12px 34px rgba(15,34,56,.28)',padding:'7px',display:'flex',flexDirection:'column',gap:'3px',width:'270px',border:'1px solid '+C.blt}},
          attOpt('📄','مستند — العنوان الوطني','الوسيط يتعرّف عليه ويعرض إضافته لمستنداتك','addr'),
          attOpt('🖼️','صورة من موقع المشروع','يعرض تثبيتها على خريطة الصفقة','site'),
          attOpt('🎞️','وسائط أخرى','لا تصنيف — تمرّ بصمت','other')) : null,
        h('button',{onClick:()=>this.toggleAtt(),title:'إرفاق',style:{width:'38px',height:'38px',borderRadius:'50%',border:'1px solid '+C.border,background:this.attOpen?C.blueLt:'#fff',color:this.attOpen?C.blue:C.muted,fontSize:'16px',cursor:'pointer',flexShrink:0}},'📎'),
        // Placeholder only: the shipped composer already owns the phone affordance and its behaviour.
        h('span',{title:'رقم الجوال',
          style:{flexShrink:0,width:'38px',height:'38px',borderRadius:'50%',border:'1px solid '+C.border,background:'#fff',
            color:C.muted,fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center'}},
          h('svg',{width:'15',height:'15',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'2',strokeLinecap:'round',strokeLinejoin:'round'},
            h('path',{d:'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2z'}))),
        h('input',{ref:el=>this._chatInput=el,placeholder:'اكتب رسالة…',style:{flex:1,minWidth:0,background:C.s2,border:'1px solid '+C.border,borderRadius:'20px',padding:'10px 14px',fontSize:'12.5px',outline:'none',fontFamily:'inherit',color:C.deep},
          onKeyDown:e=>{ if(e.key==='Enter'){ const v=e.target.value; e.target.value=''; this.chSend(v); } }}),
        h('span',{style:{fontSize:'18px',flexShrink:0,cursor:'default'}},'🎙️'),
        h('button',{onClick:()=>{ if(this._chatInput){ const v=this._chatInput.value; this._chatInput.value=''; this.chSend(v); } },title:'إرسال',style:{width:'40px',height:'40px',borderRadius:'50%',background:C.blue,color:'#fff',border:'none',fontSize:'14px',cursor:'pointer',transform:'scaleX(-1)',flexShrink:0}},'➤')));
  }

  /* ── PRICE BAR ── */
  /* Says plainly that the price and the negotiation cover the whole offer, even though a single unit
     is selected above — and offers the only real way to narrow it: change the count, then pick. */
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

  /* ── QUOTATION MODAL ── */
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
  /* ── Quotation sheet — the shipped deal room's paper layout (deal-room-proto.css .qp-*) ──
     A white 800px sheet on a grey desk: company header + quotation number, a navy-headed price table
     with the units STEPPER inline (labelled "your choice" against the supplier's figure), the selected
     machines named by serial, then totals / amount in words / payment. Mirrors the app rather than
     inventing a second quotation look. */
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
  /* qp-desk + qp-deskpad + qp-paper + qp-zoom, from the shipped sheet. Wraps EVERY step, which is what
     makes the whole flow read as a document rather than only the final step. */
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

  /* ══════════ v4 — offered-vs-registered as SLOTS ══════════
     One tile per offered unit, so the gap is countable instead of inferred from a ratio bar.
     Colour still carries availability only: green confirmed, red not confirmed. A unit the
     supplier sold as a number carries neither — it is drawn as an empty outline, no colour. */
  /* The offered-vs-registered gap as one sentence, with the explanation behind a link. The tiles were
     a third colour system on a screen that already carries one. */
  /* §2 — the fleet total, the offered total, and the shortfall. Three lines, each rendering only when it
     has something to say: the fleet total always, the offered total on multi-unit offers, and the
     shortfall ONLY when he offered more units than he has registered machines — so its absence means
     "nothing claimed" rather than "not checked". */
  rOfferLine(s,lv){
    const reg=lv.offered-lv.claimed, fleet=fleetOf(s).length;
    // Two counts on one line — offered vs registered, the comparison the renter is actually making — and
    // the shortfall only as its own alert underneath, so the block is one card, not three stacked ones.
    const num=(n,lbl,col)=>h('div',{key:lbl,style:{flex:1,minWidth:0}},
      h('div',{style:{fontSize:'20px',fontWeight:800,color:col||C.deep}},AR(n)),
      h('div',{style:{fontSize:'10.5px',fontWeight:700,color:C.muted,marginTop:'1px',lineHeight:1.5}},lbl));
    // Three cases, three sentences. `this.offerCase` overrides which one renders, for the prototype toggle.
    const forced=this.offerCase;
    const kind = forced || (lv.offered<=1 ? 'single' : (lv.claimed ? 'short' : 'multi'));
    const off = kind==='single' ? 1 : (kind==='short' ? Math.max(fleet+2,lv.offered) : Math.max(2,Math.min(fleet,lv.offered||2)));
    const gap = kind==='short' ? Math.max(1, off-fleet) : 0;
    // Two counts as two pills: the number is the thing being read, the label tells you which count it is.
    // A run-on sentence made both numbers invisible.
    const pill=(n,lbl)=>h('span',{key:lbl,style:{display:'inline-flex',alignItems:'baseline',gap:'5px',background:'#fff',
      border:'1px solid '+C.blt,borderRadius:'999px',padding:'4px 11px',whiteSpace:'nowrap'}},
      h('span',{style:{fontSize:'13px',fontWeight:800,color:C.deep}},AR(n)),
      h('span',{style:{fontSize:'10.5px',fontWeight:700,color:C.muted}},lbl));
    const bar=kids=>h('div',{style:{flexShrink:0,display:'flex',alignItems:'center',flexWrap:'wrap',gap:'6px',padding:'0 2px'}},kids);
    // 1 — SINGLE UNIT: nothing to compare, so only what he owns of this type.
    if(kind==='single') return bar([pill(fleet,this.reqTypeWord(fleet)+' لدى المورد')]);
    // 2 — MULTI UNIT: what he owns, and what this offer puts forward.
    if(kind==='multi') return bar([pill(fleet,this.reqTypeWord(fleet)+' لدى المورد'),pill(off,'في هذا العرض')]);
    // 3 — MULTI UNIT SHORT: the same two counts, then the gap and the one way to close it.
    return h('div',{style:{flexShrink:0}},
      bar([pill(fleet,this.reqTypeWord(fleet)+' لدى المورد'),pill(off,'في هذا العرض')]),
      h('div',{style:{display:'flex',alignItems:'center',gap:'9px',marginTop:'7px',padding:'8px 10px',borderRadius:'10px',
        // Not red: a shortfall is an incomplete offer, not an unavailable machine — and red on this surface
        // means availability only. Orange is the attention accent the request screen already uses.
        background:C.orangeLt,border:'1px solid '+C.orangeBd}},
        h('span',{style:{flex:1,minWidth:0,fontSize:'11px',fontWeight:700,color:'#8a4f08',lineHeight:1.65}},
          AR(gap)+' وحدة في العرض بلا معدّة مسجّلة — لا تظهر على الخريطة'),
        h('button',{onClick:()=>this.composeRequest(null,{kind:'alternative',
            text:'عرضك يتضمّن '+AR(off)+' وحدة وأرى '+AR(fleet)+' معدّة مسجّلة فقط. أضف المعدّات الناقصة إلى العرض حتى نتمكّن من فحصها.'}),
          style:{flexShrink:0,background:'#fff',border:'1px solid '+C.blueBd,color:C.blue,borderRadius:'8px',padding:'6px 10px',
            fontSize:'10.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},'اطلب إضافتها')));
  }
  /* The type and size are the REQUEST's words, so the fleet line reads in the renter's own terms. */
  reqTypeWord(n){ const u=this.curUnit(); const spec=(u&&u.spec)||'رافعة شوكية ٣ طن';
    return n===1? spec : spec.replace('رافعة','رافعات'); }
  rOfferSlots(s,lv){
    const GOOD='#12904A', BAD='#C62A2A';
    return this.rOfferLine(s,lv);
    const tile=(kind,i)=>{
      const conf=kind==='c', unconf=kind==='l';
      return h('span',{key:kind+i,title:conf?'معدّة مسجّلة · ساحتها مؤكّدة':unconf?'معدّة مسجّلة · لم يؤكّد ساحتها بعد':'عدد فقط — لا معدّة مسجّلة',
        style:{width:'34px',height:'34px',borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'center',
          fontSize:'14px',fontWeight:900,flexShrink:0,
          background:conf?GOOD:unconf?BAD:'transparent',
          color:kind==='g'?'#93A9BD':'#fff',
          border:kind==='g'?'1.5px dashed #A9BFD3':'none',
          boxShadow:kind==='g'?'none':'0 2px 6px rgba(15,34,56,.16)'}},
        conf?'✓':unconf?'؟':'—');
    };
    const tiles=[];
    for(let i=0;i<lv.confirmed;i++) tiles.push(tile('c',i));
    for(let i=0;i<lv.located;i++)   tiles.push(tile('l',i));
    for(let i=0;i<lv.claimed;i++)   tiles.push(tile('g',i));
    const line=(sw,txt,sub,col)=>h('div',{key:txt,style:{display:'flex',alignItems:'flex-start',gap:'9px'}},
      sw,
      h('div',{style:{minWidth:0}},
        h('div',{style:{fontSize:'12px',fontWeight:800,color:col||C.deep}},txt),
        h('div',{style:{fontSize:'11px',fontWeight:600,color:C.muted,marginTop:'1px',lineHeight:1.6}},sub)));
    const dot=(bg,dash)=>h('span',{style:{width:'13px',height:'13px',borderRadius:'4px',flexShrink:0,marginTop:'3px',
      background:dash?'transparent':bg,border:dash?'1.5px dashed #A9BFD3':'none'}});
    const open=!!this.slotsOpen;
    return h('div',{style:{marginTop:'11px',paddingTop:'11px',borderTop:'1px solid '+C.blt}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'10px'}},
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:'6px'}},tiles),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:'12px',fontWeight:800,color:C.deep,lineHeight:1.5}},this.unitsWord(lv.offered)+' معروضة'),
          h('div',{style:{fontSize:'11px',fontWeight:600,color:C.muted,marginTop:'1px'}},
            lv.claimed? AR(lv.offered-lv.claimed)+' معدّة مسجّلة · '+AR(lv.claimed)+' عدد فقط' : 'كلّها معدّات مسجّلة')),
        h('button',{onClick:()=>{ this.slotsOpen=!open; this.up(); },
          style:{flexShrink:0,background:'none',border:0,color:C.blue,fontSize:'11px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',padding:'2px'}},
          open?'إخفاء':'ما معناها؟')),
      open? h('div',{style:{display:'flex',flexDirection:'column',gap:'9px',marginTop:'11px'}},
        lv.confirmed? line(dot(GOOD),AR(lv.confirmed)+' مؤكّدة','أكّد المورد الساحة التي تشحن منها',GOOD):null,
        lv.located?   line(dot(BAD),AR(lv.located)+' غير مؤكّدة','لم يردّ على طلب التأكيد بعد — ليست مرفوضة',BAD):null,
        lv.claimed?   line(dot(null,true),AR(lv.claimed)+' عدد بلا معدّة مسجّلة','لا رقم تسلسلي ولا مستندات ولا موقع — لا تظهر على الخريطة'):null):null);
  }

  /* ══════════ v4 — basemap styles ══════════
     Three looks for the same map: the coloured street map, a quiet grey one that lets the machines and
     their state carry all the colour, and a satellite view for reading the yard itself. */
  // One basemap: the coloured street map. The quiet and satellite variants were a choice the renter had no
  // reason to make on this surface, and the switcher was the last thing floating over the map.
  MAP_STYLES(){ return [{k:'voyager', lbl:'ملوّن'}]; }
  baseUrl(k){
    if(k==='positron') return 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    if(k==='sat')      return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    return 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  }
  setMapStyle(k){ this.mapStyle=k;
    if(this.map&&this.baseLayer){ this.baseLayer.setUrl(this.baseUrl(k)); }
    this.up();
  }
  rMapStyles(){ return null; }
  rMapStylesUnused(){ const cur=this.mapStyle||'voyager';
    return h('div',{style:{display:'inline-flex',background:'rgba(255,255,255,.94)',border:'1px solid '+C.blt,borderRadius:'11px',
      padding:'3px',gap:'2px',boxShadow:'0 6px 18px rgba(15,34,56,.16)',pointerEvents:'auto'}},
      this.MAP_STYLES().map(o=>h('button',{key:o.k,onClick:()=>this.setMapStyle(o.k),
        style:{background:cur===o.k?C.deep:'transparent',color:cur===o.k?'#fff':C.navy,border:0,borderRadius:'8px',
          padding:'6px 11px',fontSize:'11px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},o.lbl)));
  }

  /* ══════════ v4 — chat dock ══════════
     Chat is the only tool left on the canvas, so it is a single dock in the corner opposite the
     panel: nothing it opens can cover the equipment list, and an arriving message has empty map
     above the button to pop into. Popups stack upward from the button and each one points at it. */
  rChatDock(){
    const sel=this.selSup!=null, off=sel&&this.isOff(this.curSup());
    if(off) return null;
    // While the conversation is open it IS the affordance — a button under it would be a second one.
    if(this.drawerOpen && this.activePanel==='chat') return null;
    const arrivals=this.pendingArrivals().filter(a=>a.kind!=='bid');
    const n=this.unread||0;
    const pops=[];
    if(!this.bubbleHidden) arrivals.slice(0,2).forEach((a,i)=>pops.push(this.rChatPop(a,i,arrivals.length)));
    return h('div',{style:{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'10px'}},
      pops.length?h('div',{key:'pops',style:{display:'flex',flexDirection:'column',gap:'8px'}},pops):null,
      h('button',{key:'fab',onClick:()=>{ if(!sel){ if(arrivals[0]) this.openArrival(arrivals[0]); return; } this.openDrawer('chat'); },
        title:'المحادثة مع المورد',
        style:{position:'relative',display:'flex',alignItems:'center',gap:'10px',background:C.deep,color:'#fff',border:'2px solid #fff',
          borderRadius:'999px',padding:'13px 20px 13px 17px',fontFamily:'inherit',fontSize:'13.5px',fontWeight:800,cursor:'pointer',
          boxShadow:'0 10px 28px rgba(9,20,34,.32)'}},
        h('span',{style:{fontSize:'17px'}},'💬'),
        h('span',{},'المحادثة'),
        n?h('span',{style:{minWidth:'22px',height:'22px',borderRadius:'999px',background:C.red,color:'#fff',fontSize:'11.5px',fontWeight:900,
          display:'flex',alignItems:'center',justifyContent:'center',padding:'0 6px',animation:'dpPing 1.8s ease-out infinite'}},AR(n)):null));
  }
  rChatPop(a,i,total){
    const warm=a.kind==='refusal', fill=warm?'#B26206':'#1D4ED8';
    const more=total-2;
    return h('div',{key:'pop'+i,style:{position:'relative',width:'296px',background:fill,border:'2px solid #fff',borderRadius:'15px',
      padding:'11px 12px',boxShadow:'0 14px 36px rgba(9,20,34,.34)',animation:'dpFade .22s ease',textAlign:'start',
      opacity:i?0.94:1,transform:i?'scale(.97)':'none',transformOrigin:'bottom right'}},
      i===0?h('span',{style:{position:'absolute',bottom:'-8px',insetInlineStart:'26px',width:'14px',height:'14px',background:fill,
        borderBottom:'2px solid #fff',borderLeft:'2px solid #fff',transform:'rotate(-45deg)'}}):null,
      h('div',{style:{display:'flex',alignItems:'center',gap:'6px',marginBottom:'5px'}},
        h('span',{style:{fontSize:'10px',fontWeight:800,color:'#fff',background:'rgba(255,255,255,.22)',borderRadius:'20px',padding:'2px 8px'}},this.arrivalKindLabel(a.kind)),
        h('div',{style:{flex:1}}),
        (i===1&&more>0)?h('span',{style:{fontSize:'10px',fontWeight:900,color:fill,background:'#fff',borderRadius:'20px',padding:'1px 7px'}},'+'+AR(more)):null,
        i===0?h('button',{onClick:e=>{ e.stopPropagation(); this.hideBubble(); },title:'إخفاء',
          style:{background:'none',border:0,color:'rgba(255,255,255,.85)',fontSize:'12px',fontWeight:900,cursor:'pointer',fontFamily:'inherit',padding:'0 2px',lineHeight:1}},'✕'):null),
      h('button',{onClick:()=>{ this.bubbleHidden=false; this.openArrival(a); },
        style:{display:'block',width:'100%',textAlign:'start',background:'none',border:0,padding:0,cursor:'pointer',fontFamily:'inherit'}},
        h('div',{style:{fontSize:'12px',fontWeight:900,color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},a.supName),
        h('div',{style:{fontSize:'11px',fontWeight:600,color:'rgba(255,255,255,.93)',lineHeight:1.65,marginTop:'3px',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},a.txt),
        a.ref?h('div',{style:{fontSize:'9.5px',fontWeight:800,color:'rgba(255,255,255,.78)',marginTop:'4px',fontFamily:'ui-monospace,monospace',direction:'ltr',textAlign:'start'}},'↩ '+a.ref+(a.serial?(' · '+a.serial):'')):null));
  }

  /* ══════════ v4 — price + request, in the panel header ══════════
     The shipped bottom bar is gone from this surface; its two facts — the rate under negotiation and
     what the request asks for — sit beside the supplier's name, where the offer they belong to is. */
  rHeadDeal(dark){ const S=this.S, s=this.curSup(); if(!s) return null;
    // On the dark slab the same content inverts: the figure goes white, its supporting line light slate.
    const cFig=dark?'#fff':C.deep, cSub=dark?'rgba(255,255,255,.62)':C.muted;
    // Off-platform: no negotiation and no deal room, but it still has the one figure it can be compared
    // on, and the submission it arrived as. Both were hosted by the deleted price bar; they live here now.
    if(this.isOff(s)){
      const sub=s.submission, it=sub.items[0], b=this.offBreakdown();
      return h('div',{style:{display:'flex',alignItems:'stretch',gap:'11px'}},
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{display:'flex',alignItems:'baseline',gap:'6px'}},
            h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr',fontSize:'24px',fontWeight:700,letterSpacing:'-.8px',color:cFig}},fmtEN(it.rentalRate)),
            h('span',{style:{fontSize:'12px',fontWeight:700,color:cSub}},'ر.س / يوم')),
          h('div',{style:{fontSize:'11px',fontWeight:600,color:cSub,marginTop:'3px',lineHeight:1.6}},
            'الصافي '+fmtEN(b.total)+' ر.س · عرض من خارج المنصّة · صالح حتى '+sub.validUntil)),
        h('button',{onClick:()=>{ this.subOpen=true; this.up(); },
          style:{flexShrink:0,alignSelf:'center',background:dark?'#fff':C.deep,border:0,color:dark?C.deep:'#fff',borderRadius:'11px',padding:'11px 16px',
            fontSize:'12.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},'عرض العرض المُقدَّم'));
    }
    const agreed=!!S.price.agreed, waiting=!agreed&&S.price.turn==='supplier';
    const replied=this.supHasCountered()&&S.price.turn==='rentee'&&!agreed;
    const rate=agreed?(S.price.agreedPos||this.supPos()).rate:this.supPos().rate;
    // On the navy slab a navy button would vanish, so the primary inverts to white there.
    const tone=agreed?C.green:replied?C.amber:(dark?'#fff':C.blue);
    const toneFg=(!agreed&&!replied&&dark)?C.deep:'#fff';
    return h('div',{style:{display:'flex',alignItems:'stretch',gap:'11px'}},
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{display:'flex',alignItems:'baseline',gap:'6px'}},
          h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr',fontSize:'24px',fontWeight:700,letterSpacing:'-.8px',color:cFig}},fmtEN(rate)),
          h('span',{style:{fontSize:'12px',fontWeight:700,color:cSub}},'ر.س / يوم')),
        // The request's own terms belong to the request, not to the price. Only the negotiation state stays.
        h('div',{style:{fontSize:'11px',fontWeight:600,color:cSub,marginTop:'3px',lineHeight:1.6}},
          agreed?'السعر متفق':replied?'المورد ردّ — دورك':waiting?'عرضك لدى المورد':'عرض افتتاحي')),
      h('div',{style:{flexShrink:0,alignSelf:'center',display:'flex',alignItems:'center',gap:'7px'}},
        h('button',{onClick:()=>this.openQuote(),
          style:{background:tone,border:0,color:toneFg,borderRadius:'11px',padding:'11px 16px',
            fontSize:'12.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',
            animation:replied?'dpPing 1.8s ease-out infinite':'none'}},
          agreed?'راجع السعر':replied?'راجع وردّ':'اطلب سعراً أقل'),
        // «اعتمد» also lived on the deleted price bar. Without it the renter can negotiate forever and
        // never accept, so it stays beside the negotiation button, disabled until nothing is open.
        S.approved?h('span',{style:{fontSize:'11.5px',fontWeight:800,color:C.green,whiteSpace:'nowrap'}},'✓ معتمد')
        :h('button',{onClick:()=>this.openAgree(),disabled:!this.allDone(),title:this.allDone()?'':'أنهِ البنود المفتوحة أولاً',
          style:{background:this.allDone()?C.green:'rgba(255,255,255,.12)',border:0,color:this.allDone()?'#fff':'rgba(255,255,255,.5)',borderRadius:'11px',padding:'11px 14px',
            fontSize:'12.5px',fontWeight:800,cursor:this.allDone()?'pointer':'not-allowed',fontFamily:'inherit',whiteSpace:'nowrap'}},'اعتمد')));
  }

  /* ══════════ v4 — equipment grouped by yard ══════════
     Every machine is the same type, so the only real differences are WHERE it sits and whether the
     supplier answered about it. The yard therefore becomes the outer structure and states its distance
     once, and each card carries what is left: serial, year, papers, answer state. */
  eqYardGroups(list){
    const out=[], byYard={};
    list.forEach(u=>{ const k=u.yard||'—'; if(!byYard[k]){ byYard[k]={yard:k,km:u.km,units:[]}; out.push(byYard[k]); } byYard[k].units.push(u); });
    return out.sort((a,b)=>a.km-b.km);
  }
  eqCard(s,u,oi,offeredLen){
    const inBid=!!u.inBid, on=inBid&&oi===this.selUnit, conf=!!u.confirmed;
    const chip=(txt,col,bg,bd)=>h('span',{key:txt,style:{fontSize:'10.5px',fontWeight:700,color:col,background:bg,border:'1px solid '+bd,borderRadius:'7px',padding:'2px 8px',whiteSpace:'nowrap'}},txt);
    return h('div',{key:u.serial,id:'eqcard-'+(u.id||u.serial),className:'dpCard',
      // staggered arrival — nearest first, so the list reads as being assembled in distance order
      'data-eqi':oi,
      onMouseEnter:()=>{ if(inBid){ this.hoverUnit=oi; this.updateLeaflet(false); } },
      onMouseLeave:()=>{ if(this.hoverUnit===oi){ this.hoverUnit=null; this.updateLeaflet(false); } },
      // Selection is neutral slate, not blue: on a card whose only other colour is its availability chip,
      // a saturated accent read as a third state. Selection is UI, so it stays achromatic.
      onMouseOver:e=>{ if(inBid){ e.currentTarget.style.boxShadow='0 8px 20px rgba(15,34,56,.14)'; e.currentTarget.style.borderColor='#B9C9D8'; } },
      onMouseOut:e=>{ if(inBid){ e.currentTarget.style.boxShadow='0 1px 4px rgba(15,34,56,.05)'; e.currentTarget.style.borderColor=on?C.navy:C.blt; } },
      style:{position:'relative',flexShrink:0,background:on?'#F2F6FA':'#fff',border:'1.5px solid '+(on?C.navy:C.blt),
        borderRadius:'14px',overflow:'hidden',boxShadow:on?'0 4px 14px rgba(15,34,56,.14)':'0 1px 4px rgba(15,34,56,.05)',transition:'.15s',
        animation:'dpCardIn .34s cubic-bezier(.22,.9,.3,1) '+(0.05+oi*0.07)+'s both'}},
      on?h('span',{key:'acc',style:{position:'absolute',insetInlineStart:0,top:0,bottom:0,width:'4px',
        background:'linear-gradient(180deg,'+C.navy+','+C.deep+')',animation:'dpCardIn .22s ease both'}}):null,
      h('button',{onClick:()=>{ if(!inBid) return;
          const same=this.expUnit===u.serial;
          this.expUnit=same?null:u.serial; this.selUnit=same?null:oi; this.eqTab='spec'; this.eqDoc=null;
          if(this.map) this.updateLeaflet(false); this.up();
          // The detail opens inside a scrolling list, so bring the card's top to the top of the list
          // rather than leaving the opened content below the fold. (No scrollIntoView: it moves the app.)
          if(!same) setTimeout(()=>{ const el=document.getElementById('eqcard-'+(u.id||u.serial));
            if(!el) return; const box=el.parentNode; if(!box) return;
            box.scrollTop = Math.max(0, el.offsetTop - box.offsetTop - 6); },40); },
        style:{width:'100%',textAlign:'start',background:'none',border:0,cursor:inBid?'pointer':'default',
          fontFamily:'inherit',padding:0,display:'flex',gap:'0',alignItems:'stretch'}},
        // the photo shimmers until it decodes, so the card never shows a bare grey rectangle
        h('span',{style:{width:'104px',flexShrink:0,alignSelf:'stretch',minHeight:'112px',position:'relative',overflow:'hidden',
          backgroundImage:'linear-gradient(90deg,#E8EFF6 20%,#F4F8FC 40%,#E8EFF6 60%)',backgroundSize:'220% 100%',
          animation:'dpShimmer 1.25s linear infinite',
          background:C.surface,borderInlineEnd:'1px solid '+C.blt,display:'block'}},
          h('img',{src:this.machinePhoto(u),alt:'',className:'dpArt',
            style:{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',
              filter:inBid?'none':'grayscale(.7) opacity(.8)'}}),
          // a hairline of the machine's own state along the photo's inner edge — the card's quietest signal
          h('span',{style:{position:'absolute',insetInlineEnd:0,top:0,bottom:0,width:'3px',
            background:conf?'#12904A':'#C62A2A',opacity:.85}})),
        // EVERY card is the same height: three fixed rows — state · title · distance — and no row that
        // appears or disappears with the data. A machine with fewer papers or an open question must not
        // make its card taller, or the list stops being scannable down a column.
        h('div',{style:{flex:1,minWidth:0,padding:'11px 13px',display:'flex',flexDirection:'column',gap:'7px'}},
          h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
            h('span',{style:{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:'5px'}},
              h('span',{style:{minWidth:0,fontSize:'14px',fontWeight:800,lineHeight:1.35,whiteSpace:'nowrap',overflow:'hidden',
                textOverflow:'ellipsis',color:C.deep}},this.unitModel(u)+' · '+u.year),
              // verified = the platform checked this machine's papers; separate from whether it is available
              u.cert?h('span',{title:'معدّة موثّقة',style:{flexShrink:0,width:'15px',height:'15px',borderRadius:'50%',background:C.green,
                color:'#fff',fontSize:'9px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}},'✓'):null),
            inBid?h('span',{style:{flexShrink:0,display:'inline-flex',alignItems:'center',gap:'4px',background:on?C.navy:'#fff',
              border:'1px solid '+(on?C.navy:C.border),color:on?'#fff':C.navy,borderRadius:'20px',padding:'3px 9px',
              fontSize:'10px',fontWeight:800,whiteSpace:'nowrap'}},'التفاصيل',h('span',null,'‹')):null),
          // the state is a chip again — a bordered, tinted label, with the ask as a link beside it
          h('div',{style:{display:'flex',alignItems:'center',gap:'8px',minHeight:'19px'}},
            conf ? chip('✓ مؤكد توفرها','#12904A','rgba(18,144,74,.12)','rgba(18,144,74,.34)')
                 : h('span',{style:{display:'inline-flex',alignItems:'center',gap:'5px',background:'rgba(198,42,42,.10)',
                     border:'1px solid rgba(198,42,42,.30)',color:'#C62A2A',borderRadius:'999px',padding:'3px 9px',
                     fontSize:'10.5px',fontWeight:800,whiteSpace:'nowrap'}},
                     // the dot breathes: an unanswered question is live, not a closed verdict
                     h('span',{style:{width:'6px',height:'6px',borderRadius:'50%',background:'#C62A2A',animation:'dpDot 1.7s ease-in-out infinite'}}),
                     'لم يوكد توفرها بعد'),
            (inBid&&!conf)?h('span',{onClick:e=>{ e.stopPropagation();
                this.composeRequest(u,{kind:'availability',text:'هل المعدّة '+u.serial+' متوفّرة؟ حدّد ساحتها في جاهزية العرض لتأكيدها.'}); },
              title:'اطلب من المورد تأكيد توفّرها',
              style:{flexShrink:0,fontSize:'10.5px',fontWeight:800,color:C.blue,cursor:'pointer',whiteSpace:'nowrap',
                borderBottom:'1px solid '+C.blueBd}},'اطلب التأكيد'):null,
            this.outOfCity(u)?h('span',{style:{flexShrink:0,fontSize:'10.5px',fontWeight:700,color:'#8a4f08',whiteSpace:'nowrap'}},'· خارج المدينة'):null),
          h('div',{style:{display:'flex',alignItems:'baseline',gap:'5px',whiteSpace:'nowrap'}},
            h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr',fontSize:'17px',fontWeight:700,letterSpacing:'-.4px',color:C.navy}},toAr(u.km)),
            h('span',{style:{fontSize:'11.5px',fontWeight:700,color:C.muted}},'كم من مشروعك')),
          // The certificate row always occupies its line, empty or not, so a machine with no certificates
          // is a shorter LINE and not a shorter CARD.
          // certificate chips take the request screen's orange — the same treatment «TÜV · equipment» has there
          h('div',{style:{display:'flex',alignItems:'center',gap:'5px',minHeight:'19px',overflow:'hidden'}},
            this.unitDocChips(u).length? this.unitDocChips(u).map(t=>chip(t,'#8a4f08',C.orangeLt,C.orangeBd))
              : h('span',{style:{fontSize:'10.5px',fontWeight:700,color:C.muted,opacity:.7}},'لا شهادات على المعدّة'))),
      ));
  }
  /* ══════════ v4 — the company takes the panel ══════════
     Company papers belong to the company, not to a machine, so they get their own takeover rather than a
     modal: a modal would black out the map and the list the renter is deciding between. The difference is
     carried by SKIN, not by colour — a navy identity band, flat rows, no photo, no distance, no state
     pill. Green and soft-red stay reserved for machine availability; nothing here borrows them. */
  /* ONE verified mark, everywhere the company is named: a chip that says the word, not a bare tick. A tick
     alone had to be learned; «موثّقة» does not. */
  rVerifiedChip(s,onDark){
    if(!s) return null;
    const ok=!!s.verified;
    // Green in both placements, including on the dark header: verification is a fact about the company, not
    // a property of the surface it sits on.
    const fg=ok?'#12904A':C.muted;
    const bg=ok?(onDark?'rgba(255,255,255,.94)':'rgba(18,144,74,.10)'):(onDark?'rgba(255,255,255,.85)':C.s2);
    const bd=ok?(onDark?'rgba(18,144,74,.45)':'rgba(18,144,74,.30)'):C.blt;
    return h('span',{title:ok?'شركة موثّقة على المنصّة':'شركة غير موثّقة',
      style:{display:'inline-flex',alignItems:'center',gap:'5px',background:bg,border:'1px solid '+bd,color:fg,
        borderRadius:'999px',padding:'2px 9px',fontSize:'10px',fontWeight:800,whiteSpace:'nowrap',flexShrink:0}},
      h('svg',{width:'11',height:'11',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'2.6',strokeLinecap:'round',strokeLinejoin:'round'},
        ok?h('path',{d:'M20 6L9 17l-5-5'}):h('path',{d:'M12 8v5M12 17h.01'})),
      ok?'شركة موثّقة':'غير موثّقة');
  }
  /* The company's papers, in the machine-documents pattern: selectable rows with a thumbnail and one
     download each, grouped, with a single footer that acts on the selection. */
  coDocsBody(docs){
    const GOOD='#12904A', BAD='#C62A2A';
    this.coSel=this.coSel||{};
    const sel=k=>!!this.coSel[k];
    const ico=p=>h('svg',{width:'14',height:'14',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'2.3',
      strokeLinecap:'round',strokeLinejoin:'round'},p.map((d,i)=>h('path',{key:i,d:d})));
    const box=(on,fn)=>h('button',{onClick:e=>{ e.stopPropagation(); fn(); },
      style:{flexShrink:0,width:'22px',height:'22px',borderRadius:'6px',cursor:'pointer',fontFamily:'inherit',
        background:on?C.blue:'#fff',border:'1.5px solid '+(on?C.blue:C.border),color:'#fff',fontSize:'11px',fontWeight:900,
        display:'flex',alignItems:'center',justifyContent:'center'}},on?'✓':'');
    const thumb=here=>h('span',{style:{position:'relative',flexShrink:0,width:'46px',height:'40px',borderRadius:'8px',overflow:'hidden',
      background:here?'#fff':C.s2,border:'1px '+(here?'solid '+C.blt:'dashed '+C.border),display:'flex',alignItems:'center',justifyContent:'center'}},
      here?h('img',{src:((window.__resources||{}).docTuv||'assets/doc-tuv.jpg'),alt:'',style:{width:'100%',height:'100%',objectFit:'cover'}})
        :h('span',{style:{width:'14px',height:'2px',background:C.border,borderRadius:'2px'}}),
      h('span',{style:{position:'absolute',bottom:'2px',insetInlineStart:'2px',width:'14px',height:'14px',borderRadius:'50%',
        background:here?GOOD:BAD,color:'#fff',fontSize:'8px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}},here?'✓':'!'));
    const row=d=>{ const here=d.s==='ok';
      // The row opens the paper full-size in the shared document modal — the company panel has no viewer
      // frame of its own, and a row that lifts under the cursor has to actually do something.
      return h('div',{key:d.k,className:'dpRow',onClick:()=>{ if(here){ this.docModal=d.k; this.eqDocKind='doc'; this.up(); } },
        style:{display:'flex',alignItems:'center',gap:'9px',padding:'8px 9px',marginBottom:'7px',cursor:here?'pointer':'default',
          borderRadius:'12px',border:'1px solid '+(here?'rgba(18,144,74,.30)':'rgba(198,42,42,.26)'),
          background:here?'rgba(18,144,74,.055)':'rgba(198,42,42,.045)'}},
        box(sel(d.k),()=>{ this.coSel[d.k]=!this.coSel[d.k]; this.up(); }),
        here?h('button',{onClick:e=>{ e.stopPropagation(); this.toast('تحميل '+d.k); },title:'تحميل',
          style:{flexShrink:0,width:'30px',height:'30px',borderRadius:'9px',background:C.blueLt,border:'1px solid '+C.blueBd,
            color:C.blue,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center'}},
          ico(['M12 3v12','M7 11l5 5 5-5','M4 20h16']))
          :h('span',{style:{flexShrink:0,width:'30px'}}),
        h('div',{style:{flex:1,minWidth:0,textAlign:'start'}},
          h('div',{style:{fontSize:'12px',fontWeight:800,color:here?GOOD:BAD,lineHeight:1.4}},d.k),
          h('div',{style:{fontSize:'10.5px',fontWeight:700,color:here?C.muted:BAD,marginTop:'1px',lineHeight:1.5}},
            here?(d.exp||d.meta||'على ملف الشركة'):'بلا مستند بعد')),
        thumb(here));
    };
    const miss=docs.filter(d=>d.s!=='ok').length;
    const chosen=docs.filter(d=>sel(d.k));
    const dlN=chosen.filter(d=>d.s==='ok').length, askN=chosen.length;
    const all=docs.every(d=>sel(d.k));
    const foot=(lbl,fn,solid,dim)=>h('button',{key:lbl,onClick:fn,disabled:dim,
      style:{flex:1,background:dim?C.s2:(solid?C.blue:'#fff'),border:'1px solid '+(dim?C.blt:(solid?C.blue:C.blueBd)),
        color:dim?C.muted:(solid?'#fff':C.blue),borderRadius:'11px',padding:'11px',fontSize:'12px',fontWeight:800,
        cursor:dim?'default':'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},lbl);
    return h(React.Fragment,null,
      h('div',{style:{flex:1,overflowY:'auto',minHeight:0,background:C.s2}},
        h('div',{style:{display:'flex',alignItems:'center',gap:'9px',padding:'11px 14px',borderBottom:'1px dashed '+C.blt,background:'#fff'}},
          box(all,()=>{ docs.forEach(d=>{ this.coSel[d.k]=!all; }); this.up(); }),
          h('span',{style:{flex:1,fontSize:'11.5px',fontWeight:800,color:C.navy}},'تحديد الكل'),
          chosen.length?h('span',{style:{fontSize:'11px',fontWeight:800,color:C.muted}},AR(chosen.length)+' محدّد'):null),
        h('div',{style:{padding:'13px 14px 4px'}},
          h('div',{style:{display:'flex',alignItems:'center',gap:'8px',marginBottom:'9px'}},
            h('span',{style:{flex:1,fontSize:'12px',fontWeight:800,color:C.deep}},'مستندات الشركة'),
            miss?h('span',{style:{fontSize:'10px',fontWeight:800,color:BAD,background:'rgba(198,42,42,.09)',
              border:'1px solid rgba(198,42,42,.24)',borderRadius:'999px',padding:'2px 9px',whiteSpace:'nowrap'}},AR(miss)+' يحتاج انتباه')
             :h('span',{style:{fontSize:'10px',fontWeight:800,color:GOOD,background:'rgba(18,144,74,.10)',
              border:'1px solid rgba(18,144,74,.28)',borderRadius:'999px',padding:'2px 9px',whiteSpace:'nowrap'}},'مكتملة')),
          h('div',{},docs.map(row)))),
      h('div',{style:{flexShrink:0,height:'76px',boxSizing:'border-box',display:'flex',alignItems:'center',gap:'8px',
        padding:'0 18px',background:'#fff',borderTop:'1px solid '+C.blt}},
        foot('تنزيل ('+AR(dlN)+')',()=>this.toast('تنزيل '+AR(dlN)+' مستند'),false,!dlN),
        foot('اطلب المستند ('+AR(askN)+')',()=>{ const names=chosen.map(d=>d.k);
            this.composeRequest(null,{kind:'document',scope:'company',
              text:'نطلب المستندات التالية من مستندات الشركة: '+names.join('، ')+'.'},names[0]);
            this.coSel={}; },true,!askN)));
  }
  rCompanyPanel(s){
    const docs=this.vfCompanyDocs();
    const back=()=>{ this.coOpen=false; this.up(); };
    const sect=(title,body)=>h('div',{key:title,style:{padding:'14px 18px',borderTop:'1px solid '+C.blt}},
      h('div',{style:{fontSize:'11px',fontWeight:800,color:C.muted,letterSpacing:'.3px'}},title),
      h('div',{style:{marginTop:'9px'}},body));
    // Same two-state row as the machine's documents: on file → green with a download; not on file → red,
    // and the only thing to do is ask. A present paper can still be asked for again.
    const GOOD='#12904A', BAD='#C62A2A';
    const dlIcon=h('svg',{width:'14',height:'14',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'2.3',strokeLinecap:'round',strokeLinejoin:'round'},
      h('path',{d:'M12 3v12'}),h('path',{d:'M7 11l5 5 5-5'}),h('path',{d:'M4 20h16'}));
    const docRow=(d,i)=>{ const here=d.s==='ok';
      return h('div',{key:d.k+i,className:'dpRow',
        style:{display:'flex',alignItems:'center',gap:'9px',padding:'9px 10px',marginBottom:'7px',borderRadius:'12px',
          border:'1px solid '+(here?'rgba(18,144,74,.30)':'rgba(198,42,42,.26)'),
          background:here?'rgba(18,144,74,.055)':'rgba(198,42,42,.045)'}},
        h('span',{style:{width:'20px',height:'20px',borderRadius:'6px',flexShrink:0,background:here?GOOD:BAD,color:'#fff',
          fontSize:'9.5px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}},here?'✓':'✕'),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:'12px',fontWeight:800,color:here?GOOD:BAD,lineHeight:1.4}},d.k),
          h('div',{style:{fontSize:'10.5px',fontWeight:600,color:C.muted,marginTop:'1px',lineHeight:1.5}},
            here?(d.exp||d.meta||'على ملف الشركة'):'ليست على ملف الشركة')),
        here?h('span',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:'5px'}},
              h('button',{onClick:()=>this.toast('تحميل '+d.k),title:'تحميل '+d.k,
                style:{width:'29px',height:'29px',borderRadius:'9px',background:'#fff',border:'1px solid rgba(18,144,74,.34)',
                  color:GOOD,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center'}},dlIcon),
              h('button',{onClick:()=>this.composeRequest(null,{kind:'document',scope:'company',text:'نطلب إعادة رفع '+d.k+' من مستندات الشركة — النسخة الحالية غير كافية.'},d.k),
                style:{background:'#fff',border:'1px solid '+C.blueBd,color:C.blue,borderRadius:'9px',padding:'6px 9px',
                  fontSize:'10px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},'اطلب تحديثه'))
          :h('button',{onClick:()=>this.composeRequest(null,{kind:'document',scope:'company',text:'نطلب '+d.k+' من مستندات الشركة.'},d.k),
            style:{flexShrink:0,background:'#fff',border:'1px solid '+C.blueBd,color:C.blue,borderRadius:'9px',padding:'6px 10px',
              fontSize:'10.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},'اطلبه'));
    };
    const bar=(lbl,pct)=>h('div',{key:lbl,style:{marginBottom:'10px'}},
      h('div',{style:{display:'flex',justifyContent:'space-between',gap:'8px'}},
        h('span',{style:{fontSize:'11.5px',fontWeight:700,color:C.navy}},lbl),
        h('span',{style:{fontSize:'11.5px',fontWeight:800,color:C.deep,fontFamily:'ui-monospace,monospace',direction:'ltr'}},pct+'%')),
      h('div',{style:{height:'6px',borderRadius:'4px',background:'rgba(15,34,56,.08)',marginTop:'5px',overflow:'hidden'}},
        h('div',{style:{width:pct+'%',height:'100%',background:C.navy,borderRadius:'4px'}})));
    return h('div',{style:{background:'#fff',borderInlineEnd:'1px solid '+C.blt,pointerEvents:'auto',display:'flex',flexDirection:'column',
      overflow:'hidden',height:'100%',boxShadow:'6px 0 24px rgba(15,34,56,.10)',animation:'dpPanelIn .18s ease'}},

      h('div',{style:{flexShrink:0,height:'64px',boxSizing:'border-box',display:'flex',flexDirection:'column',
        justifyContent:'center',background:C.deep,color:'#fff',padding:'0 18px'}},
        h('div',{style:{display:'flex',alignItems:'center',gap:'10px'}},
          h('button',{onClick:back,title:'رجوع إلى المعدّات',
            style:{flexShrink:0,width:'30px',height:'30px',borderRadius:'50%',background:'rgba(255,255,255,.14)',border:0,color:'#fff',
              fontSize:'14px',fontWeight:900,cursor:'pointer',fontFamily:'inherit'}},'›'),
          h('span',{style:{width:'40px',height:'40px',borderRadius:'11px',flexShrink:0,background:'rgba(255,255,255,.13)',
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:800}},s.initials),
          h('div',{style:{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:'8px'}},
            h('span',{style:{minWidth:0,fontSize:'15px',fontWeight:800,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},s.name),
            this.rVerifiedChip(s,true))),
        // Rating, deals count and city are gone: this file exists to answer «are his papers in order?».
      ),

      // Same selection model as the machine's documents: pick rows, then act once in the footer.
      this.coDocsBody(docs));
  }

  /* ══════════ v4 — the machine takes the panel ══════════
     Availability, papers and the three requests, one machine at a time, with a back arrow to the list.
     Nothing here is on the list cards: the list compares machines, this decides about one. */
  rEquipDetail(s,u){
    const GOOD='#12904A', SOFT='#C62A2A', conf=!!u.confirmed, inBid=!!u.inBid;
    const docs=this.vfEquipDocs(), waiting=docs.filter(d=>d.s!=='ok'&&d.s!=='deferred');
    // Leaving the machine clears the selection too: with nothing open, "selected" marked a card the
    // renter was no longer looking at, and the map kept a tick on its pin.
    const back=()=>{ this.expUnit=null; this.selUnit=null; if(this.map) this.updateLeaflet(true); this.up(); };
    const sect=(title,body,note)=>h('div',{key:title,style:{padding:'14px 18px',borderTop:'1px solid '+C.blt}},
      h('div',{style:{fontSize:'11px',fontWeight:800,color:C.muted,letterSpacing:'.3px'}},title),
      note?h('div',{style:{fontSize:'11.5px',fontWeight:600,color:C.navy,lineHeight:1.8,marginTop:'6px'}},note):null,
      h('div',{style:{marginTop:'8px'}},body));
    const row=(k,v)=>h('div',{key:k,style:{display:'flex',alignItems:'baseline',gap:'10px',padding:'7px 0'}},
      h('span',{style:{width:'104px',flexShrink:0,fontSize:'11.5px',fontWeight:600,color:C.muted}},k),
      h('span',{style:{flex:1,minWidth:0,fontSize:'12.5px',fontWeight:700,color:C.deep}},v));
    // A document is either on the unit's file — green, download it — or it is not — red, and the only thing
    // to do is ask the supplier for it. No status word, no amber: the pair of states is the whole story.
    const dlIcon=h('svg',{width:'13',height:'13',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'2.4',strokeLinecap:'round',strokeLinejoin:'round'},
      h('path',{d:'M12 3v12'}),h('path',{d:'M7 11l5 5 5-5'}),h('path',{d:'M4 20h16'}));
    const eyeIcon=h('svg',{width:'14',height:'14',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'2.2',strokeLinecap:'round',strokeLinejoin:'round'},
      h('path',{d:'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z'}),h('circle',{cx:'12',cy:'12',r:'2.8'}));
    const docRow=(d,i)=>{ const here=d.s==='ok';
      return h('div',{key:d.k+i,style:{display:'flex',alignItems:'center',gap:'9px',padding:'9px 10px',marginTop:i?'6px':'0',
        borderRadius:'10px',border:'1px solid '+(here?'rgba(18,144,74,.30)':'rgba(198,42,42,.26)'),
        background:here?'rgba(18,144,74,.055)':'rgba(198,42,42,.045)'}},
        h('span',{style:{width:'22px',height:'22px',borderRadius:'7px',flexShrink:0,background:here?GOOD:SOFT,color:'#fff',
          fontSize:'10px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}},here?'✓':'✕'),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:'12px',fontWeight:800,color:here?GOOD:SOFT}},d.k),
          h('div',{style:{fontSize:'10.5px',fontWeight:600,color:C.muted,marginTop:'1px',lineHeight:1.5}},
            here?(d.meta||d.exp||'على ملف المعدّة'):'ليست على ملف المعدّة')),
        // A present document gets all three: look at it, keep a copy, or ask for a fresh one — an expired or
        // illegible scan is "provided" and still useless, so the ask must exist even on green.
        here?h('span',{style:{flexShrink:0,display:'flex',alignItems:'center',gap:'5px'}},
              h('button',{onClick:()=>this.toast('فتح '+d.k),title:'عرض '+d.k,
                style:{display:'flex',alignItems:'center',justifyContent:'center',width:'29px',height:'29px',background:'#fff',
                  border:'1px solid rgba(18,144,74,.34)',color:GOOD,borderRadius:'9px',cursor:'pointer',fontFamily:'inherit'}},eyeIcon),
              h('button',{onClick:()=>this.toast('تحميل '+d.k),title:'تحميل '+d.k,
                style:{display:'flex',alignItems:'center',justifyContent:'center',width:'29px',height:'29px',background:'#fff',
                  border:'1px solid rgba(18,144,74,.34)',color:GOOD,borderRadius:'9px',cursor:'pointer',fontFamily:'inherit'}},dlIcon),
              h('button',{onClick:()=>this.composeRequest(u,{kind:'document',text:'نطلب إعادة رفع '+d.k+' للمعدّة '+u.serial+' — النسخة الحالية غير كافية.'},d.k),
                style:{background:'#fff',border:'1px solid '+C.blueBd,color:C.blue,borderRadius:'9px',padding:'6px 9px',
                  fontSize:'10px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},'اطلب إعادة الرفع'))
          :h('button',{onClick:()=>this.composeRequest(u,{kind:'document',text:'نطلب '+d.k+' للمعدّة '+u.serial+'.'},d.k),
            style:{flexShrink:0,background:'#fff',border:'1px solid '+C.blueBd,color:C.blue,borderRadius:'9px',padding:'6px 10px',
              fontSize:'10.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},'اطلب من المورد تزويده'));
    };
    return h('div',{style:{background:'#fff',borderInlineEnd:'1px solid '+C.blt,pointerEvents:'auto',display:'flex',flexDirection:'column',overflow:'hidden',height:'100%',boxShadow:'6px 0 24px rgba(15,34,56,.10)'}},

      // The media area is a VIEWER, not a photo: the machine's picture by default, and whatever document
      // the renter clicks in its place, so reading a certificate never leaves the machine.
      this.eqViewer(u),
      this.eqTabs(),

      h('div',{style:{flex:1,overflowY:'auto',minHeight:0}},
        (this.eqTab==='docs')? this.eqDocsTab(u,docRow)
        : h(React.Fragment,null,
          // One line: distance · band — yard, with the availability label on the opposite corner.
          h('div',{style:{display:'flex',alignItems:'center',gap:'10px',padding:'13px 18px 12px'}},
            h('div',{style:{flex:1,minWidth:0,display:'flex',alignItems:'baseline',flexWrap:'wrap',gap:'6px'}},
              h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr',fontSize:'20px',fontWeight:700,letterSpacing:'-.5px',color:C.deep}},toAr(u.km)),
              h('span',{style:{fontSize:'12px',fontWeight:700,color:C.muted}},'كم · '+this.distBand(u.km).lbl),
              h('span',{style:{fontSize:'13px',fontWeight:800,color:C.navy,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},'— '+u.yard),
              this.outOfCity(u)?h('span',{style:{fontSize:'10.5px',fontWeight:800,color:'#8a4f08',background:'#FFF6E8',border:'1px solid '+C.amberBd,borderRadius:'20px',padding:'2px 8px',whiteSpace:'nowrap'}},'خارج مدينة الطلب'):null),
            h('div',{style:{flexShrink:0,display:'inline-flex',alignItems:'center',gap:'6px',borderRadius:'999px',padding:'5px 11px',whiteSpace:'nowrap',
              background:conf?'rgba(18,144,74,.12)':'rgba(198,42,42,.10)',border:'1px solid '+(conf?'rgba(18,144,74,.34)':'rgba(198,42,42,.30)')}},
              h('span',{style:{width:'8px',height:'8px',borderRadius:'50%',background:conf?GOOD:SOFT}}),
              h('span',{style:{fontSize:'11.5px',fontWeight:800,color:conf?GOOD:SOFT}},conf?'مؤكد توفرها':'لم يوكد توفرها بعد'))),

          // A CONFIRMED machine needs no explanation — the label says it. The unanswered state does: renters
          // read red as rejection, so that one sentence stays.
          conf? null : sect('التوفّر', null, 'لم يحدّد المورد ساحة هذه المعدّة بعد — سؤال معلّق، وليس رفضاً.'),

          this.eqEligibility(u))),

      // The footer belongs to the machine itself. On the documents tab the selection has its own footer,
      // so this one steps aside rather than stacking two action bars.
      (this.eqTab==='docs')?null:h('div',{style:{flexShrink:0,height:'76px',boxSizing:'border-box',borderTop:'1px solid '+C.blt,background:C.s2,padding:'0 18px',display:'flex',gap:'8px',alignItems:'center'}},
        conf?null:h('button',{onClick:()=>this.composeRequest(u,{kind:'availability',text:'هل المعدّة '+u.serial+' متوفّرة؟ حدّد ساحتها في جاهزية العرض لتأكيدها.'}),
          style:{flex:1,minWidth:0,background:C.blue,border:0,color:'#fff',borderRadius:'11px',padding:'12px 10px',fontSize:'12px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},'اطلب تأكيد التوفّر'),
        h('button',{onClick:()=>this.composeRequest(u,{kind:'alternative',text:inBid?('هل يمكنك تقديم معدّة أخرى بدلاً من '+u.serial+'؟'):('هل يمكنك تقديم '+u.serial+' بدلاً منها؟')}),
          style:{flex:1,minWidth:0,background:'#fff',border:'1px solid '+C.border,color:C.navy,borderRadius:'11px',padding:'12px 10px',fontSize:'12px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},
          inBid?'اطلب معدّة أخرى':'اطلب هذه المعدّة بدلاً منها')));
  }

  /* THE VIEWER — one frame, two subjects. Default: the machine's photo. Click any document in the
     documents tab and it renders here instead, with download and expand. Nothing navigates away. */
  eqViewer(u){
    const back=()=>{ this.expUnit=null; this.selUnit=null; this.eqDoc=null; this.eqDocKind=null; this.eqTab='spec';
      if(this.map) this.updateLeaflet(true); this.up(); };
    // A photo slot is a PHOTO: it renders as an image. Only certificates and ownership use the sheet mock.
    const d=this.eqDoc, isPhoto=this.eqDocKind==='photo';
    const ico=(p,extra)=>h('svg',Object.assign({width:'15',height:'15',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',
      strokeWidth:'2.2',strokeLinecap:'round',strokeLinejoin:'round'},extra||{}),p.map((dd,i)=>h('path',{key:i,d:dd})));
    // Labelled controls, not bare glyphs: a 32px circle with an unfamiliar icon is a guess.
    const tool=(title,kids,fn,solid)=>h('button',{key:title,onClick:fn,title:title,
      style:{display:'inline-flex',alignItems:'center',gap:'5px',height:'32px',padding:'0 11px',borderRadius:'999px',
        background:solid?C.navy:'rgba(255,255,255,.97)',border:'1px solid '+(solid?C.navy:C.border),
        color:solid?'#fff':C.navy,cursor:'pointer',fontFamily:'inherit',fontSize:'11px',fontWeight:800,whiteSpace:'nowrap',
        boxShadow:'0 2px 10px rgba(15,34,56,.16)'}},kids);
    return h('div',{style:{position:'relative',flexShrink:0,height:d?'268px':'196px',overflow:'hidden',
      background:d?'#EEF3F9':C.surface,borderBottom:'1px solid '+C.blt}},
      (d&&isPhoto)? h('img',{src:this.machinePhoto(u),alt:'',style:{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',background:'#0F2238'}})
      : d? h('img',{src:((window.__resources||{}).docTuv||'assets/doc-tuv.jpg'),alt:d,onClick:()=>{ this.docModal=d; this.up(); },
          style:{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',background:'#fff',cursor:'zoom-in',padding:'10px 10px 34px'}})
       : h('img',{src:this.machinePhoto(u),alt:'',style:{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}),
      h('button',{onClick:back,title:'رجوع إلى المعدّات',
        style:{position:'absolute',top:'14px',insetInlineStart:'14px',width:'34px',height:'34px',borderRadius:'50%',background:'#fff',
          border:'1px solid '+C.blt,color:C.navy,fontSize:'15px',fontWeight:900,cursor:'pointer',fontFamily:'inherit',
          boxShadow:'0 2px 8px rgba(15,34,56,.14)'}},'›'),
      d?h('div',{style:{position:'absolute',top:'12px',insetInlineEnd:'12px',display:'flex',gap:'7px'}},
        tool('تكبير',[ico(['M4 10V4h6','M20 14v6h-6','M4 4l7 7','M20 20l-7-7']),h('span',{key:'t'},'تكبير')],()=>{ this.docModal=d; this.up(); },true),
        tool('تحميل',[ico(['M12 3v12','M7 11l5 5 5-5','M4 20h16']),h('span',{key:'t'},'تحميل')],()=>this.toast('تحميل '+d))):null,
      d?h('div',{style:{position:'absolute',bottom:0,insetInline:0,padding:'9px 14px',background:'rgba(255,255,255,.94)',
        borderTop:'1px solid '+C.blt,fontSize:'11.5px',fontWeight:800,color:C.deep,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},d):null);
  }
  /* FULL-SIZE DOCUMENT — a certificate is unreadable at panel width, so «تكبير» opens it over the whole
     surface. Backdrop and Escape both close; the panel keeps its state underneath. */
  rDocModal(){ const d=this.docModal; if(!d) return null;
    const close=()=>{ this.docModal=null; this.up(); };
    const photo=this.eqDocKind==='photo';
    return h('div',{onClick:close,
      style:{position:'fixed',inset:0,zIndex:90,background:'rgba(9,20,34,.72)',backdropFilter:'blur(3px)',
        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'12px',padding:'34px',animation:'dpFade .16s ease'}},
      h('div',{onClick:e=>e.stopPropagation(),style:{display:'flex',alignItems:'center',gap:'10px',width:'100%',maxWidth:'760px'}},
        h('span',{style:{flex:1,minWidth:0,fontSize:'13px',fontWeight:800,color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},d),
        h('button',{onClick:()=>this.toast('تحميل '+d),
          style:{background:'rgba(255,255,255,.96)',border:0,color:C.deep,borderRadius:'999px',padding:'7px 13px',
            fontSize:'11.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'تحميل'),
        h('button',{onClick:close,title:'إغلاق',
          style:{width:'32px',height:'32px',borderRadius:'50%',background:'rgba(255,255,255,.16)',border:'1px solid rgba(255,255,255,.34)',
            color:'#fff',fontSize:'14px',fontWeight:900,cursor:'pointer',fontFamily:'inherit'}},'✕')),
      h('img',{onClick:e=>e.stopPropagation(),src:photo?this.machinePhoto(this.curUnitRec()):((window.__resources||{}).docTuv||'assets/doc-tuv.jpg'),alt:d,
        style:{maxWidth:'760px',maxHeight:'calc(100% - 60px)',width:'auto',objectFit:'contain',background:'#fff',
          borderRadius:'8px',boxShadow:'0 24px 70px rgba(0,0,0,.5)'}}));
  }
  /* Two tabs on one panel: what the machine IS, and what the machine HAS on file. */
  eqTabs(){ const t=this.eqTab||'spec';
    const tab=(id,lbl)=>h('button',{key:id,onClick:()=>{ this.eqTab=id; this.up(); },
      style:{flex:1,background:'none',border:0,borderBottom:'2px solid '+(t===id?C.navy:'transparent'),
        color:t===id?C.deep:C.muted,padding:'11px 8px',fontSize:'12px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},lbl);
    return h('div',{style:{flexShrink:0,display:'flex',background:'#fff',borderBottom:'1px solid '+C.blt}},
      tab('spec','المعدّة'),tab('docs','المستندات'));
  }
  /* DOCUMENTS TAB — grouped the way the request groups them: photos, proof of ownership, certifications.
     Every row opens in the viewer above; a missing one can only be asked for. */
  eqDocsTab(u,docRow){
    const GOOD='#12904A', BAD='#C62A2A';
    const shots=this.unitPhotoCount(u), SLOTS=['أمامية','لوحة الصنع','العدّاد','جانبية'];
    const docs=this.vfEquipDocs();
    const pick=(k,kind)=>{ this.eqDoc=k; this.eqDocKind=kind||'doc'; this.up(); };
    this.docSel=this.docSel||{};
    const sel=k=>!!this.docSel[k];
    const toggle=k=>{ this.docSel[k]=!this.docSel[k]; this.up(); };
    const ico=p=>h('svg',{width:'14',height:'14',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'2.3',
      strokeLinecap:'round',strokeLinejoin:'round'},p.map((d,i)=>h('path',{key:i,d:d})));
    const box=(on,fn)=>h('button',{onClick:e=>{ e.stopPropagation(); fn(); },
      style:{flexShrink:0,width:'22px',height:'22px',borderRadius:'6px',cursor:'pointer',fontFamily:'inherit',
        background:on?C.blue:'#fff',border:'1.5px solid '+(on?C.blue:C.border),color:'#fff',fontSize:'11px',fontWeight:900,
        display:'flex',alignItems:'center',justifyContent:'center'}},on?'✓':'');
    // Thumbnail states carry the badge, so a glance down the trailing edge reads the whole file at once.
    const thumb=(here,kind)=>h('span',{style:{position:'relative',flexShrink:0,width:'46px',height:'40px',borderRadius:'8px',overflow:'hidden',
      background:here?'#fff':C.s2,border:'1px '+(here?'solid '+C.blt:'dashed '+C.border),display:'flex',alignItems:'center',justifyContent:'center'}},
      here?h('img',{src:kind==='photo'?this.machinePhoto(u):((window.__resources||{}).docTuv||'assets/doc-tuv.jpg'),alt:'',
        style:{width:'100%',height:'100%',objectFit:'cover'}})
        :h('span',{style:{width:'14px',height:'2px',background:C.border,borderRadius:'2px'}}),
      h('span',{style:{position:'absolute',bottom:'2px',insetInlineStart:'2px',width:'14px',height:'14px',borderRadius:'50%',
        background:here?GOOD:BAD,color:'#fff',fontSize:'8px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}},here?'✓':'!'));
    const grp=(title,badge,tone,kids)=>h('div',{key:title,style:{padding:'13px 14px 4px'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'8px',marginBottom:'9px'}},
        h('span',{style:{flex:1,fontSize:'12px',fontWeight:800,color:C.deep}},title),
        badge?h('span',{style:{flexShrink:0,fontSize:'10px',fontWeight:800,borderRadius:'999px',padding:'2px 9px',whiteSpace:'nowrap',
          color:tone,background:tone===GOOD?'rgba(18,144,74,.10)':'rgba(198,42,42,.09)',
          border:'1px solid '+(tone===GOOD?'rgba(18,144,74,.28)':'rgba(198,42,42,.24)')}},badge):null),
      kids);
    // One row per file: select it, download it if it is here, and open it in the viewer above by clicking the
    // row. What to DO with a selection lives once in the footer, not repeated on every row.
    const fileRow=(k,here,sub,kind)=>{ const on=this.eqDoc===k;
      return h('div',{key:k,className:'dpRow',onClick:()=>{ if(here) pick(k,kind); },
        style:{display:'flex',alignItems:'center',gap:'9px',padding:'8px 9px',marginBottom:'7px',cursor:here?'pointer':'default',
          borderRadius:'12px',border:'1px solid '+(on?C.navy:(here?C.blt:'rgba(198,42,42,.22)')),
          background:on?'rgba(15,34,56,.045)':(here?'#fff':'rgba(198,42,42,.035)')}},
        box(sel(k),()=>toggle(k)),
        here?h('button',{onClick:e=>{ e.stopPropagation(); this.toast('تحميل '+k); },title:'تحميل',
          style:{flexShrink:0,width:'30px',height:'30px',borderRadius:'9px',background:C.blueLt,border:'1px solid '+C.blueBd,
            color:C.blue,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center'}},
          ico(['M12 3v12','M7 11l5 5 5-5','M4 20h16']))
          :h('span',{style:{flexShrink:0,width:'30px'}}),
        h('div',{style:{flex:1,minWidth:0,textAlign:'start'}},
          h('div',{style:{fontSize:'12px',fontWeight:800,color:C.deep,lineHeight:1.4}},k),
          h('div',{style:{fontSize:'10.5px',fontWeight:700,color:here?C.muted:BAD,marginTop:'1px',lineHeight:1.5}},
            sub||(here?'على ملف المعدّة':'بلا مستند بعد'))),
        thumb(here,kind));
    };
    const own=docs.find(d=>/ملكية/.test(d.k)), eq=docs.find(d=>/سلامة|المعدّة/.test(d.k)), op=docs.find(d=>/مشغّل/.test(d.k));
    const items=[]
      .concat(SLOTS.map((s,i)=>({k:s,here:i<shots,sub:i<shots?'صورة مرفوعة':'لم تُرفع',kind:'photo',g:'photos'})))
      .concat([{k:own?own.k:'إثبات الملكية',here:!!(own&&own.s==='ok'),g:'docs'},
               {k:eq?eq.k:'شهادة السلامة',here:!!(eq&&eq.s==='ok'),g:'docs'},
               {k:op?op.k:'شهادات المشغّل',here:!!(op&&op.s==='ok'),g:'docs'}]);
    const all=items.every(x=>sel(x.k));
    const chosen=items.filter(x=>sel(x.k));
    // Download counts only what exists. The request counts EVERYTHING selected: a document already on file
    // can be asked for again — an expired or illegible scan is provided and still useless.
    const dlN=chosen.filter(x=>x.here).length, askN=chosen.length;
    const gset=g=>items.filter(x=>x.g===g);
    const miss=g=>gset(g).filter(x=>!x.here).length;
    const foot=(lbl,fn,solid,dim)=>h('button',{key:lbl,onClick:fn,disabled:dim,
      style:{flex:1,background:dim?C.s2:(solid?C.blue:'#fff'),border:'1px solid '+(dim?C.blt:(solid?C.blue:C.blueBd)),
        color:dim?C.muted:(solid?'#fff':C.blue),borderRadius:'11px',padding:'11px',fontSize:'12px',fontWeight:800,
        cursor:dim?'default':'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}},lbl);
    return h('div',{style:{display:'flex',flexDirection:'column',minHeight:'100%'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'9px',padding:'11px 14px',borderBottom:'1px dashed '+C.blt}},
        box(all,()=>{ items.forEach(x=>{ this.docSel[x.k]=!all; }); this.up(); }),
        h('span',{style:{flex:1,fontSize:'11.5px',fontWeight:800,color:C.navy}},'تحديد الكل'),
        chosen.length?h('span',{style:{fontSize:'11px',fontWeight:800,color:C.muted}},AR(chosen.length)+' محدّد'):null),
      grp('صور المعدّة', miss('photos')?AR(miss('photos'))+' يحتاج انتباه':'مكتملة', miss('photos')?BAD:GOOD,
        h('div',{},gset('photos').map(x=>fileRow(x.k,x.here,x.sub,x.kind)))),
      grp('مستندات المعدّة', miss('docs')?AR(miss('docs'))+' يحتاج انتباه':'مكتملة', miss('docs')?BAD:GOOD,
        h('div',{},gset('docs').map(x=>fileRow(x.k,x.here,x.sub,x.kind)))),
      h('div',{style:{marginTop:'auto',position:'sticky',bottom:0,height:'76px',boxSizing:'border-box',display:'flex',
        alignItems:'center',gap:'8px',padding:'0 18px',
        background:'rgba(255,255,255,.97)',borderTop:'1px solid '+C.blt}},
        foot('تنزيل ('+AR(dlN)+')',()=>this.toast('تنزيل '+AR(dlN)+' مستند'),false,!dlN),
        foot('اطلب المستند ('+AR(askN)+')',()=>{ const names=chosen.map(x=>x.k);
            this.composeRequest(u,{kind:'document',text:'نطلب المستندات التالية للمعدّة '+u.serial+': '+names.join('، ')+'.'},names[0]);
            this.docSel={}; },true,!askN)));
  }
  /* UNIT ELIGIBILITY FOR THIS REQUEST — the four document families the request checks, each saying only
     whether it is on the machine's file. Green satisfied, red not, slate where the request asked nothing. */
  eqEligibility(u){
    const GOOD='#12904A', BAD='#C62A2A';
    const ur=this.curUnitRec()||u, cert=!!(ur&&ur.cert), shots=this.unitPhotoCount(u);
    const dl=this.vfEquipDocs();
    const has=re=>{ const d=dl.find(x=>re.test(x.k)); return !!(d&&d.s==='ok'); };
    const rows=[
      // Neutral: the request sets no minimum year and asked for no attachments, so nothing here passes or fails.
      {ic:'📅',k:this.unitMake(u)?'سنة الصنع والمُصنّع':'سنة الصنع',
       v:toAr(u.year)+(this.unitMake(u)?(' · '+this.unitMake(u)):''),ok:null},
      {ic:'📎',k:'المرفقات',v:u.att||'لا مرفقات مطلوبة',ok:null},
      {ic:'🖼',k:'صور المعدّة',v:shots?AR(shots)+' من ٤ مرفوعة':'لم تُرفع',ok:!!shots},
      {ic:'📄',k:'إثبات الملكية',v:has(/ملكية/)?'على ملف المعدّة':'ليست على ملف المعدّة',ok:has(/ملكية/)},
      {ic:'🛠',k:'شهادات المعدّة',v:has(/سلامة/)?'على ملف المعدّة':'ليست على ملف المعدّة',ok:has(/سلامة/)},
      {ic:'👷',k:'شهادات المشغّل',v:has(/مشغّل/)?'على ملف المعدّة':'ليست على ملف المعدّة',ok:has(/مشغّل/)}
    ];
    const cell=(r,i)=>{ const col=r.ok===true?GOOD:r.ok===false?BAD:C.muted;
      const bg=r.ok===true?'rgba(18,144,74,.055)':r.ok===false?'rgba(198,42,42,.045)':C.s2;
      const bd=r.ok===true?'rgba(18,144,74,.28)':r.ok===false?'rgba(198,42,42,.24)':C.blt;
      const wide=false;
      return h('div',{key:r.k,className:'dpCell',style:{gridColumn:wide?'1 / -1':'auto',background:bg,border:'1px solid '+bd,borderRadius:'10px',padding:'9px 10px',minWidth:0}},
        h('div',{style:{display:'flex',alignItems:'center',gap:'6px'}},
          h('span',{style:{fontSize:'11px',opacity:.75}},r.ic),
          h('span',{style:{flex:1,minWidth:0,fontSize:'10.5px',fontWeight:700,color:C.muted,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},r.k)),
        h('div',{style:{fontSize:'11.5px',fontWeight:800,color:col,marginTop:'4px',lineHeight:1.5}},r.v));
    };
    return h('div',{style:{padding:'12px 15px 13px',borderTop:'1px solid '+C.blt,background:'#fff'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'8px',marginBottom:'9px'}},
        h('span',{style:{flex:1,fontSize:'11px',fontWeight:800,color:C.muted,letterSpacing:'.3px'}},'مطابقة المعدّة لهذا الطلب'),
        h('button',{onClick:()=>{ this.eqTab='docs'; this.up(); },
          style:{background:'none',border:0,color:C.blue,fontSize:'10.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'المستندات ‹')),
      h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'7px'}},rows.map(cell)));
  }
  /* The manufacturer comes off the same fleet record the title uses — its field is `maker`. No brand
     fallback: a cell whose job is to state a verified fact must say nothing rather than guess. */
  unitMake(u){ const t=FLEET.find(x=>x.serial===(u&&u.serial)); return (t&&t.maker)||''; }
  eqSectionHead(txt,sub){ return h('div',{key:'h'+txt,style:{padding:'4px 4px 0'}},
    h('div',{style:{fontSize:'11px',fontWeight:800,color:C.muted,letterSpacing:'.4px'}},txt),
    sub?h('div',{style:{fontSize:'11px',fontWeight:600,color:C.muted,opacity:.85,marginTop:'2px',lineHeight:1.6}},sub):null); }
  eqYardHead(g){ return h('div',{key:'y'+g.yard,style:{display:'flex',alignItems:'baseline',gap:'9px',padding:'8px 4px 2px'}},
    h('span',{style:{display:'flex',alignItems:'baseline',gap:'4px',flexShrink:0}},
      h('span',{style:{fontFamily:'ui-monospace,monospace',direction:'ltr',fontSize:'20px',fontWeight:700,letterSpacing:'-.5px',color:C.deep}},toAr(g.km)),
      h('span',{style:{fontSize:'11.5px',fontWeight:700,color:C.muted}},'كم')),
    h('span',{style:{fontSize:'13px',fontWeight:800,color:C.navy,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},g.yard),
    h('span',{style:{flex:1,height:'1px',background:C.blt}}),
    h('span',{style:{flexShrink:0,whiteSpace:'nowrap',fontSize:'10.5px',fontWeight:700,color:C.muted}},this.distBand(g.km).lbl+' · '+this.unitsWord(g.units.length))); }
  rEquipGroups(){ const s=this.curSup(); if(!s) return null;
    // An off-platform offer has no machines to group. It is not an error state: what it does have —
    // photos, equipment documents, company documents — gets its own way in, since the rail is gone.
    if(this.isOff(s)) return h('div',{key:'off',style:{background:'#fff',border:'1px solid '+C.blt,borderRadius:'14px',padding:'14px'}},
      h('div',{style:{fontSize:'12.5px',fontWeight:800,color:C.deep}},'لا معدّات على الخريطة'),
      h('div',{style:{fontSize:'11.5px',fontWeight:600,color:C.muted,lineHeight:1.8,marginTop:'4px'}},
        'وصل هذا العرض من خارج المنصّة، فلا يحمل معدّات مسجّلة ولا إحداثيات. ما أرسله المورد محفوظ كما هو، ويمكنك فحصه.'),
      h('button',{onClick:()=>this.openDrawer('offequip'),
        style:{width:'100%',marginTop:'12px',background:C.blue,border:0,color:'#fff',borderRadius:'11px',padding:'11px',
          fontSize:'12px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}},'المعدّة والمستندات'));
    const all=fleetOf(s), offered=unitsOf(s), alts=altsOf(s);
    if(!all.length) return h('div',{style:{padding:'16px',fontSize:'12px',color:C.muted,lineHeight:1.8,textAlign:'center'}},
      'لا توجد معدّة مسجّلة في هذا العرض — قدّم المورد سعراً وعدداً فقط.');
    // Flat, nearest first, offered machines only. Machines he owns but did not offer are not a second
    // list to scan — they are one request, made from inside a machine («اطلب معدّة أخرى»).
    return offered.slice().sort((a,b)=>a.km-b.km).map(u=>this.eqCard(s,u,offered.indexOf(u),offered.length));
  }
}

