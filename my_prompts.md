these are the changes :
1- identity must include if company is verified or not , if yes what business documents it does have, the same as trust part but will be viewed in the identity part just ui change
2- rental cost must be per unit (day/month/week) then  multiplied by duration (estimateDuration) if exits times quantity also , the same as now just ensuring 
3- mebo and demo as now if on supplier then show it also multiplied by quantity only 
4- who handles the costs , in this part check if in the request it is on rentee then he can add cost , if on supplier no add cost , if any conflict happen between request and deal room then reflected as red (for operator f and tarnsport)
5-equipment tersm are acknowledged but must be checked with supplier , this note must be somehwhere in the ui make it very seamless ux with samll link to deal room so he verifies it there with supplier ,
5- same for equipment part the equipment "safety" certificates and ownership + operator cert must be from the deak room terms according to this 🔀 Moving to Negotiable: Operator included, Operator certification, and Equipment safety certifications are acknowledge-only today, but are planned to become supplier-declarable terms — the supplier will pick a value and they'll be able to conflict in the deal room.
check this file http://moedatech-api-docs.s3-website.eu-central-1.amazonaws.com/terms-journey.html 

----

sharable link same as spec 006 of web app but with expanded scope :
1- after request submission a unique link per request will be created and able to shared or copied , the link must contain the renter name if possible , 
for this part follow this prototype: 

2- then the link submission will open the supplier bid form that have fields to fill and submit the bid so here we will store and collect these bid submissions in a new table with the fields of the form and user info, no write to existing tables in this step it is indepenent bid storage
for this part follow this prototype:

3- then in my bids view cards the bids submitted from the form will appear here as well with the current app bids but with a label to indicate its source . also a filter will be avaialble for filtering the bids 
for this part follow this prototype: 

4- clicking view submission on the bid card will open the answers of the submissions of that supplier just as view 
for this part follow this prototype:

5- for the request header in my bids show the tracking part of the link 
for this part follow this prototype 

5- in the bid comparison table supplier will be able to select and compare between these submitted bids from the link with in app bids or any others so check each field in the table if it can be got from the form or not and vica versa if the submissions has some fields to compare but didnt appear in the compairson table also we'll review it
for this part follow this prototype 



--- 
operator cert
equipment cert 
if none confirmed in deal room then show "need supplier confirmation in deal room "
otherwize their values are reflected from deal room + cert endpoint for rendering