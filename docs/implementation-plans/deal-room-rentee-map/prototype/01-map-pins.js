/* ── 01-map-pins.js ──────────────────────────────────────────────
 * Machine pins, the site pin, the ghost marker (DO NOT BUILD — §6.2 never draws claimed units), Leaflet wiring and pin layout maths.
 *
 * Verbatim from deal-room-rentee-map-v2.html. REFERENCE ONLY — prototype code uses
 * React.createElement, inline styles and fixture data. Read it for STRUCTURE,
 * GEOMETRY and ORDER; build with this repo's conventions. design.md is the distilled
 * version, this is the receipt.
 */

  unitIcon(s,u,idx,total,selected){ const F="font-family:'IBM Plex Sans Arabic',sans-serif";
    const conf=!!u.confirmed, ring=conf?C.green:C.red, alt=!u.inBid;
    const rd=this.unitReadiness(u), segs=rd.total, done=rd.done;
    let bar='';
    for(let i=0;i<segs;i++){
      bar+='<span style="flex:1;height:4px;border-radius:2px;background:'+(i<done?this.bandColor(rd.band):'rgba(15,34,56,.14)')+'"></span>';
    }
    const halo = selected ? 'box-shadow:0 0 0 4px rgba(37,99,235,.35),0 6px 16px rgba(15,34,56,.32);' : 'box-shadow:0 5px 14px rgba(15,34,56,.3);';
    return L.divIcon({className:'',iconSize:[132,86],iconAnchor:[66,86],html:
      '<div style="'+F+';width:132px;display:flex;flex-direction:column;align-items:center;cursor:pointer">'
      +'<div style="position:relative;width:44px;height:44px;border-radius:50%;background:'+(alt?'#fff':ring)+';border:3px '+(alt?'dashed':'solid')+' '+(alt?ring:'#fff')+';'+halo+'display:flex;align-items:center;justify-content:center;font-size:19px">'
        +(alt?'<span style="color:'+ring+';font-size:17px;font-weight:900">+</span>':this.reqEmoji())
        +(selected?'<span style="position:absolute;top:-7px;inset-inline-end:-7px;width:18px;height:18px;border-radius:50%;background:'+C.blue+';color:#fff;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #fff">✓</span>':'')
        +(alt?'':'<span style="position:absolute;bottom:-6px;inset-inline-start:-6px;min-width:17px;height:17px;border-radius:9px;background:'+C.deep+';color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff">'+AR(idx+1)+'</span>')
      +'</div>'
      // readiness bar — documents present vs required, for THIS machine
      +'<div style="margin-top:7px;width:66px;display:flex;gap:2px">'+bar+'</div>'
      +'<div style="margin-top:5px;background:#fff;border:1px '+(alt?'dashed':'solid')+' '+ring+';border-radius:8px;padding:2px 8px;font-size:9px;font-weight:800;white-space:nowrap;color:'+C.deep+';box-shadow:0 2px 8px rgba(15,34,56,.18)">'
        +(alt?'يمكنك طلبها':(conf?'متاحة':'غير مؤكّدة'))+' · '+AR(done)+'/'+AR(segs)+' مستند</div></div>' });
  }


  ghostIcon(s,n){ const F="font-family:'IBM Plex Sans Arabic',sans-serif";
    return L.divIcon({className:'',iconSize:[136,72],iconAnchor:[68,72],html:
      '<div style="'+F+';width:136px;display:flex;flex-direction:column;align-items:center;cursor:pointer">'
      +'<div style="width:42px;height:42px;border-radius:50%;background:#F1F5FA;border:3px dashed '+C.muted+';display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:900;color:'+C.muted+';position:relative;box-shadow:0 4px 10px rgba(15,34,56,.16)">؟'
        +'<span style="position:absolute;top:-6px;inset-inline-end:-6px;min-width:18px;height:18px;border-radius:9px;background:'+C.muted+';color:#fff;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff">'+AR(n)+'</span></div>'
      +'<div style="margin-top:6px;background:#fff;border:1.5px dashed '+C.muted+';border-radius:8px;padding:2px 8px;font-size:9px;font-weight:800;white-space:nowrap;color:'+C.muted+';box-shadow:0 2px 8px rgba(15,34,56,.14)">'
        +AR(n)+' بلا معدّة محدَّدة</div></div>' });
  }


  siteIcon(){ return L.divIcon({className:'',iconSize:[40,52],iconAnchor:[20,40],html:
    '<div style="display:flex;flex-direction:column;align-items:center">'
    +'<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:'+C.blue+';border:2px solid #fff;box-shadow:0 3px 10px rgba(37,99,235,.5);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:14px">📍</span></div>'
    +'<div style="margin-top:6px;background:#fff;border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700;color:#0F2238;box-shadow:0 2px 6px rgba(15,34,56,.2);white-space:nowrap;font-family:\'IBM Plex Sans Arabic\',sans-serif">موقعك</div></div>' }); }


  layoutBids(force){ const M=this.map; if(!M||!this.bidLayer) return;
    const sel=this.selSup, set=this.bidsFor();
    // State 1 = project only. Supplier company coordinates are not reliable enough to plot, so no
    // supplier markers are drawn at any time; the bid list carries the overview instead.
    const key=[M.getZoom(),M.getCenter().lat.toFixed(3),M.getCenter().lng.toFixed(3),sel,this.itemsMode,this.activeItem,this.S.availabilityConfirmed].join('|');
    if(!force && key===this._bidKey) return; this._bidKey=key;
    this.ensureRings();
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
        const us=fleetOf(n.s);
        // ── GROUPING ──
        // A box anchored to the SUPPLIER's own pin, offset upward so it never covers a unit, stating
        // plainly how many of the offered units are registered machines and how many are only claimed.
        // (An earlier centroid 'hub' label drifted into open desert and overlapped the unit pins.)
        const lv=levelsOf(n.s);
        // connectors are drawn after de-collision, below
        if(lv.offered>1||lv.alts){
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
          while(taken.some(q=>Math.hypot(q.x-best.x,q.y-best.y)<74) && k<8){
            const ang=(-Math.PI/2)+(k*(Math.PI/3)), r=78;
            best={x:p.x+Math.cos(ang)*r, y:p.y+Math.sin(ang)*r}; k++;
          }
          taken.push(best);
          return (k===0) ? u.ll : M.layerPointToLatLng([best.x,best.y]);
        });
        us.forEach((u,ui)=>{ const pos=placed[ui];
          add(L.polyline([n.s.co,pos],{color:u.confirmed?C.green:C.red,weight:2.5,opacity:.5,dashArray:'7 6',interactive:false}));
          // leader line back to the true yard whenever the pin had to be nudged off it
          if(pos!==u.ll) add(L.polyline([u.ll,pos],{color:u.confirmed?C.green:C.red,weight:1.5,opacity:.7,interactive:false}));
          add(L.marker(pos,{icon:this.unitIcon(n.s,u,ui,us.length,this.selUnit===ui),zIndexOffset:760,riseOnHover:true})
            .bindTooltip(this.unitTip(n.s,u,ui,us.length),{direction:'top',offset:[0,-16],opacity:1})
            // selecting a unit pin re-scopes the equipment + documents panels to THAT machine
            .on('click',()=>{ this.selUnit=ui; this.activePanel='equip'; this.drawerOpen=true; this.up(); }));
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


  bandColor(b){ return b==='green'?C.green : b==='yellow'?C.amber : C.red; }


  reqEmoji(){ return this.itemsMode==='multi' ? (MULTI_ITEMS[this.activeItem||0].icon||'🏗️') : '🏗️'; }


  unitReadiness(ur){ if(!ur) return null;
    const keys=[{k:'الصور الإلزامية',ok:true},{k:'شهادة السلامة',ok:!!ur.cert},{k:'شهادات المشغّل',ok:!!ur.cert}];
    const done=keys.filter(x=>x.ok).length, total=keys.length;
    const pct=Math.round(done/total*100);
    return {done,total,pct,band:pct>=100?'green':pct>=50?'yellow':'red',keys};
  }


  initLeaflet(){ const tryInit=()=>{
      if(!window.L){ this._lt=setTimeout(tryInit,120); return; }
      const el=document.getElementById('dpLeaflet'); if(!el){ this._lt=setTimeout(tryInit,120); return; }
      if(this.map) return;
      const map=L.map(el,{zoomControl:false,attributionControl:true,scrollWheelZoom:true,wheelPxPerZoomLevel:90,
        zoomSnap:.5,zoomDelta:.5,inertia:true,inertiaDeceleration:2800,doubleClickZoom:true,minZoom:5,maxZoom:16,
        worldCopyJump:false,keyboard:true}).setView(SITE,9);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:'abcd',attribution:'&copy; OpenStreetMap, &copy; CARTO'}).addTo(map);
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
        h('div',{style:{marginTop:'6px',background:'#fff',borderRadius:'9px',padding:'4px 10px',fontSize:'10px',fontWeight:700,color:C.deep,boxShadow:'0 2px 8px rgba(15,34,56,.14)',display:'inline-block'}},'موقعك')),
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
    if(this.selSup==null){ if(!this.map.hasLayer(this.ringLayer)) this.ringLayer.addTo(this.map); }
    else if(this.map.hasLayer(this.ringLayer)) this.map.removeLayer(this.ringLayer);
  }
