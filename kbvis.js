/*
Future Feature List / To-Do:
-CSS overhaul (non-static; adjust to screen size)
-Streamline functions / code overhaul
-Galaxy Indicator? (galaxy y/n to outputs?)
-Hover-icons that explain what each input is
-Drift delay/stoppage frames (makes for more realistic drift as people go from their TDI, to drift, back to TDI)
-ASDI (turn on/off + direction), would need ASDI modifier??
-Sakuri Angle (361) feature (check if grounded, apply correct angle)
-Error checking/input checks/warnings
-Allow for multiple stages overlayed? (button on/off? auto shows all, highlights selected? checkbox list?)
-X,Y readout in corner upon mouseover of canvas
-Custom Char Input
-add character hurtboxes at the end of the move? (yellow rectangle/sprite), requires adding data to char
-Live move/combo replay (eg draw/hightlight hurtbox over the move)
-hitpause? would need many extra inputs...
-Canvas Scaling (even if just 2x);
-DI circle slider?
-Custom Stage?
-Actual stage pixel art
-Attack List (varying kb, sakuri angle, ugh)

Bug List:
-Having both bkb and kbs as 0 throws an error, somewhere
-Sideways hits (30 to -45, both sides) seem to behave a little weird, especially with DI zone on, maybe rounding?
- LowKB DI assist might be off, hard to tell
- Crouch canceling does not deal with projectiles/lowkb moves
- Crouch canceling will work anywhere (need a "groundedTrue?" function for this + 361")
- Not sure if non 0-359 angles works correctly (should but might not)
*/

//Objects
var Plat = function(height, spacing, width){
  return{
  height:height/2,
  spacing:spacing/2,
  width:width/2
  }
}
var Stage = function(name, top, side, bottom, ground, plats, camera){
	return{
  name:name,
  top:top/2, //distance stage floor to top blastzone
  side:side/2, //distance from ledge to side blastzone
  bottom:bottom/2, //distance from stage floor to bottom blastzone
  ground:ground/2, //ground width
  plats:plats, //array of platforms
  camera:camera/2 //starting camera height
  }
}
var Attack = function(name, damage, angle, bkb, kbs, hsm, flipper){
	return{
  name:name,
  damage:damage,
  angle:angle,
  bkb:bkb,
  kbs:kbs,
  hsm:hsm,
  flipper:flipper
  }
}
var Character = function(name, kba, hga, friction, maxFall){
	return{
  name:name,
  kba:kba, //knockback adjustment aka weight
  hga:hga, //hitstun gravity accel
  friction:friction, //air friction
  maxFall:maxFall //maximum fall speed normally
  }
}
var Point = function(x,y){
	return{
  x:x,
  y:y
  }
}
var Inputs = function (char,percent,tdi,drift,startPoint,cc,noDI){
	return{
  	char:char,
    percent:percent,
    tdi:tdi,
    drift:drift,
    startPoint:startPoint,
    cc:cc,
    noDI:noDI
  }
}
var Outputs = function (kb,direction,hitstun,minmax){
  return{
  	kb:kb,
    direction:direction,
    hitstun:hitstun,
    minmax:minmax,
  }
}
var Item = function(attack, inputs, color, diZone, positions, outputs){
	return{
  attack:attack,
  inputs:inputs,
  color:color,
  diZone:diZone,
  positions:positions,
  outputs:outputs
  }
}
var MinMax = function(maxX,maxY,minX,minY){
	return{
  	maxX:maxX,
  	maxY:maxY,
    minX:minX,
    minY:minY
  }
}
var Drift = function(direction,delay,cutoff){
	return{
  direction:direction,
  delay:delay,
  cutoff:cutoff,
  }
}

//Functions
function resetCanvas(){
  c.beginPath();
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = 'black';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.stroke();
  c.closePath();  
}
function findPositions(item){
  var startPoint = item.inputs.startPoint;
  //Initial Knockback calcs
  //BKB + damage * knockback_scaling * 0.12 * knockback_adj
  var ccFactor = 1;
  if (item.inputs.cc == true){
  	ccFactor = 2/3;
  }else{
  	ccFactor = 1;
  }
  var sentAngle = 0;
  if (item.attack.flipper == true){ //reflect over Y axis
  	sentAngle = (180-item.attack.angle)%360;
  }else{
  	sentAngle = item.attack.angle;
  }
  
  var launchKB = item.attack.bkb*ccFactor+(item.attack.damage+item.inputs.percent)*item.attack.kbs*0.12*item.inputs.char.kba;
  //console.log(launchKB);
  
  var diAngle = 0;
  if(item.inputs.noDI == true){
  	diAngle = sentAngle;
  }else{
  	diAngle = item.inputs.tdi;
  }
  
  var assistAngle = assistDI(launchKB,diAngle,sentAngle); //Angle after DI assist is applied
  var launchAngle = sentAngle+18*Math.sin(rad(assistAngle-sentAngle));
  //var launchAngle = item.attack.angle+18*Math.sin(rad(item.tdi-item.attack.angle));

  //BKB * 4 * ((knockback_adj - 1) * 0.6 + 1) + damage * 0.12 * knockback_scaling * 4 * 0.65 * knockback_adj		
  var hitstun = (item.attack.bkb*ccFactor*4*(((item.inputs.char.kba-1)*0.6)+1))+(item.attack.damage+item.inputs.percent)*item.attack.kbs*0.312*item.inputs.char.kba; //combined constants
  
  hitstun *= item.attack.hsm;
  
  if (item.inputs.char.name === "Etalus (Armor)"){ //Should this go before or after DI assist is applied?
  	launchKB *= 0.70;
    hitstun *= 0.70;
  }
  
  //Current position/velocity/frame vars
  var x = startPoint.x;
  var y = startPoint.y;
  var vx = 0;
  var vy = 0;
  var driftAdj = 1;
  var driftVal = 0;
  var positions = [];
  var hsframes = 0;
  var maxY = startPoint.y;
  var maxX = startPoint.x;
  var minY = startPoint.y;
  var minX = startPoint.x;
  
  vx = Math.cos(rad(launchAngle))*launchKB;
  vy = Math.sin(rad(launchAngle))*launchKB;
  
  //calculate position per frame
  positions.push(new Point(x,y));
  for (i=1; i<(hitstun+1); i++){
    //drift adjustment
    if (Math.abs(vx) < 5){
    	driftAdj = 1;
    }else if(Math.abs(vx) > 10){
    	driftAdj = 0.5;
    }else{
    	driftAdj = 1.5-Math.abs(vx)/10; //linear gradient
    }
    //drift direction/delay/cutoff
    if ((i < (hitstun+1-item.inputs.drift.cutoff)) && (i > (item.inputs.drift.delay))){
      if (item.inputs.drift.direction === "Left"){
        driftVal = -1.25;
      }else if (item.inputs.drift.direction === "Right"){
        driftVal = 1.25;
      }else{
        driftVal = 0;
      }
    }else{
    	driftVal = 0;
    }
    
    x += vx;
    y += vy; 
    
    vx += driftVal*driftAdj*0.1;
    if (vx >= item.inputs.char.friction){
    	vx -= item.inputs.char.friction;
    }else if (vx <= -item.inputs.char.friction){
    	vx += item.inputs.char.friction;
    }else {
    	vx = 0;
    }
    
    if (vy > -item.inputs.char.maxFall){ //gravity added until max fall is reached (spike, falltime)
      vy -= item.inputs.char.hga;
    }
    
    if (y > maxY){
    	maxY = y;
    }else if(y < minY){
    	minY = y;
    }
    if (x > maxX){
    	maxX = x;
    }else if (x < minX){
    	minX = x;
    }
    positions.push(new Point(x,y));
    
    hsframes = i;
    //console.log(maxX,maxY,minX,minY);
    
  }
  maxX = Math.round(maxX);
  maxY = Math.round(maxY);
  minX = Math.round(minX);
  minY = Math.round(minY);
  var mm = new MinMax(maxX,maxY,minX,minY);
  var outputs = new Outputs(launchKB,launchAngle,hsframes,mm);
  item.outputs = outputs;
  item.positions = positions;
  return item;
}
function drawMove(item){
	var radius = 2;
  var canvasX = 0;
  var canvasY = 0;
  
	for (i=0; i<item.positions.length; i++){
  	if ((i==0) || i==(item.positions.length-1)){
			radius = 4;
    }else if (i%5 == 0){
    	radius = 2;
    }else{
    	radius = 1;
    }
    c.beginPath();
    canvasX = canvas.width/2 + item.positions[i].x/2;
    canvasY = vOffset - item.positions[i].y/2;
    c.arc(Math.round(canvasX), Math.round(canvasY), radius, 0, 2*Math.PI);
    c.fillStyle = 'hsl(' + item.color + ',80%,50%)';
    c.fill();
    c.closePath();
  } 
  
  if (item.diZone == true){
  	drawDISpots(findDISpots(item),item.color);
  }
  
  var kb = Math.round(item.outputs.kb*100)/100;
  var ang = Math.round(item.outputs.direction*100)/100;
  var fx = item.positions[item.positions.length-1].x;
  var fy = item.positions[item.positions.length-1].y;
  fx = Math.round(fx);
  fy = Math.round(fy);
  
  //console.log(kb);
  if (item.attack.name == itemList[cMove].attack.name){	
    document.getElementById('launchKB').innerHTML = kb + " p/f";
    document.getElementById('kbAngle').innerHTML = ang + "°";
    document.getElementById('hitstun').innerHTML = item.outputs.hitstun + " frames";
    document.getElementById('height').innerHTML = item.outputs.minmax.maxY + " pixels";
    document.getElementById('position').innerHTML = "("+fx+","+fy+")";
    //console.log(kill(item,stageList[cStage]));
    if (kill(item,stageList[cStage])){
    	document.getElementById('kill').innerHTML = "Yes";
    }else{
    	document.getElementById('kill').innerHTML = "No";
    }
  }
  
}
function drawStage(stage,color){
	resetCanvas();
  
  //draw the main stage + blastzone
  c.beginPath();
  c.lineWidth = 4;
  c.strokeStyle = color;
  if (stage.name === "Air Armada"){ //Pineapple 
  	c.rect(canvas.width/2 - (stage.ground / 2), vOffset, stage.ground, 162/2);
  }else{
  	c.rect(canvas.width/2 - (stage.ground / 2), vOffset, stage.ground, stage.bottom);
  }
   // Stage - 648/2 is largest stage's bottom 
  c.rect(canvas.width/2 - (stage.side + (stage.ground / 2)), vOffset - stage.top, 2 * stage.side +stage.ground, stage.top + stage.bottom); // blastzone
  c.stroke();
  c.closePath();
  
  //draw plats
  
  for (i=0;i<stage.plats.length;i++){
  	c.beginPath();
  	c.lineWidth = 4;
  	c.strokeStyle = color;
  	c.rect(canvas.width/2 - (stage.ground / 2) + stage.plats[i].spacing, vOffset - stage.plats[i].height, stage.plats[i].width, 0);
    c.stroke();
  	c.closePath();
  }
  
  //show camera coverage
  c.globalAlpha = 0.25;
  c.lineWidth = 2;
  c.strokeStyle = 'grey';
  c.rect(canvas.width/2 - 960/4, vOffset - 540/2 + stage.camera,960/2,540/2);
  c.stroke();
  c.closePath();
  c.globalAlpha = 1.00;
  
}
function rad(angle){
	return angle*(Math.PI/180);
}
function addItem(){
	var damage = parseFloat(document.getElementById('damage').value);
  var bkb = parseFloat(document.getElementById('bkb').value);
  var kbs = parseFloat(document.getElementById('kbs').value);
  var angle = parseFloat(document.getElementById('kba').value)%360;
  var hsm = parseFloat(document.getElementById('hsm').value);
  var name = document.getElementById('aName').value;
  var flipper = document.getElementById('flipper').checked;
  var attack = new Attack(name,damage,angle,bkb,kbs,hsm,flipper);
  
  var charName = document.getElementById('chars').value;
  var char = charList[0];
  for (i=0;i<charList.length;i++){
  	if(charName === charList[i].name){
    	char = charList[i];
    }
  }
  
  var percent = parseFloat(document.getElementById('percent').value);
  var cc = document.getElementById('crouch').checked;
  var noDI = document.getElementById('noDI').checked;
  var tdi = parseFloat(document.getElementById('tdi').value)%360;
  var direction = document.getElementById('drift').value;
  var delay = document.getElementById('delay').value;
  var cutoff = document.getElementById('cutoff').value;
  var drift = new Drift(direction,delay,cutoff);
  var x = parseFloat(document.getElementById('xStart').value);
  var y = parseFloat(document.getElementById('yStart').value);
  var startPoint = new Point(x,y);
  var input = Inputs(char,percent,tdi,drift,startPoint,cc,noDI);
  var color = parseFloat(document.getElementById('aColor').value);
  var diZone = document.getElementById('noDI').checked;
	itemList.push(new Item(attack,input,color,diZone));
}
function addAttack(){
  addItem();
  cMove = itemList.length-1;
 
  // Move(s)
  //console.log(itemList.length);
  itemList[cMove] = findPositions(itemList[cMove]);
  
  var randColor = 30*(itemList.length.toString()-1);
  randColor = randColor%360;
  
  itemList[cMove].color = randColor;
  document.getElementById('aColor').value = randColor;
  document.getElementById('aColorSlider').value = randColor;
  document.getElementById('aName').value = "Attack " + itemList.length.toString();
  itemList[cMove].attack.name = "Attack " + itemList.length.toString();
  
  document.getElementById("aList").selectedIndex = itemList.length-1;
  //drawMove(itemList[cMove]);
  //updateList();
  resetStage();
  updateAttack();
  
  //console.log(document.getElementById("aList").selectedIndex)
  //cMove = document.getElementById("aList").selectedIndex; 
}
function resetStage(){
// Stage
	c.globalAlpha = 1.0;
	resetCanvas();
	var theStage = document.getElementById('stage').value;
  for (j=0;j<stageList.length;j++){
  	if (stageList[j].name == theStage){
    	drawStage(stageList[j],'grey');
      cStage = j;
    }
  }
  for (k=0;k<(itemList.length);k++){
  	drawMove(itemList[k]);
  }
  
}
function reset(){
	itemList.length = 0;
  var select = document.getElementById("aList");
  while (select.firstChild) {
        select.removeChild(select.firstChild);
    }
  addAttack();
  resetStage();
}
function assistDI(kb,diAngle,kbAngle){
  var assistAngle = 0;
  var kbLimit = 12;
  var weakAngle = false;
  var normal = true;
  
  //if <6, lowkb
  //if <12, maybe low, maybe normal
  //else normal
  
  if((kbAngle > 20) && (kbAngle < 70)){ //find kb threshold, on linear scale depending on angle
  	weakAngle = true;
    kbLimit = 6 + ((kbAngle-20)/50)*6;
    //console.log(kbLimit);
  }else if((kbAngle  > 110) && (kbAngle < 160)){
  	weakAngle = true;
  	kbLimit = 12 + ((kbAngle-160)/50)*6;
  }
  
  if ((weakAngle == true) && (kb < kbLimit)){ // Weak move DI assist 20-70deg, hold out for full out
  	if(kbAngle < 70){
    	if ((diAngle < 23) || (diAngle > 337)) { //WHAT IS THIS THRESHOLD IDK, PATCH NOTES SAY "HOLD STRAIGHT OUT"
      	assistAngle = (kbAngle-90)%360;
        normal = false;
      }
    }else{ //gotta be 110-160
      if ((diAngle > 157) && (diAngle < 203)){ //WHAT IS THIS THRESHOLD IDK, PATCH NOTES SAY "HOLD STRAIGHT OUT"
        assistAngle = (kbAngle+90)%360;
        normal = false;
      }
    }
  }
  
  if(normal == true){ //"normal" DI assist, within 23 degrees of perfect in/out just yeilds perfect in/out
    if (Math.abs((diAngle - ((kbAngle+90)%360) + 180 + 360) % 360 - 180) < 23){
      assistAngle = (kbAngle+90)%360;
    }else if(Math.abs((diAngle - ((kbAngle-90)%360) + 180 + 360) % 360 - 180) < 23){
      assistAngle = (kbAngle-90)%360;
    }else{
    	assistAngle = diAngle;
    }
  }
  
	return assistAngle;
}
function updateAttack(){
  if (itemList.length == 0){
  }else{
    //addItem();
    updateList();
    cMove = document.getElementById("aList").selectedIndex; 
    //console.log(cMove);

    itemList[cMove].attack.damage = parseFloat(document.getElementById('damage').value);
    itemList[cMove].attack.bkb = parseFloat(document.getElementById('bkb').value);
    itemList[cMove].attack.kbs = parseFloat(document.getElementById('kbs').value);
    itemList[cMove].attack.angle = parseFloat(document.getElementById('kba').value)%360;
    itemList[cMove].attack.flipper = document.getElementById('flipper').checked;
    itemList[cMove].attack.hsm = parseFloat(document.getElementById('hsm').value);
    itemList[cMove].attack.name = document.getElementById('aName').value;

    var charName = document.getElementById('chars').value;
    var char = charList[0];
    for (i=0;i<charList.length;i++){
      if(charName === charList[i].name){
        itemList[cMove].inputs.char = charList[i];
      }
    }

    itemList[cMove].inputs.percent = parseFloat(document.getElementById('percent').value);
    itemList[cMove].inputs.cc = document.getElementById('crouch').checked;
    itemList[cMove].inputs.noDI = document.getElementById('noDI').checked;
    itemList[cMove].inputs.tdi = parseFloat(document.getElementById('tdi').value)%360;
    itemList[cMove].inputs.drift.direction = document.getElementById('drift').value;
    itemList[cMove].inputs.drift.delay = document.getElementById('delay').value;
    itemList[cMove].inputs.drift.cutoff = document.getElementById('cutoff').value;
    itemList[cMove].inputs.startPoint.x = parseFloat(document.getElementById('xStart').value);
    itemList[cMove].inputs.startPoint.y = parseFloat(document.getElementById('yStart').value);
    itemList[cMove].color = parseFloat(document.getElementById('aColor').value);
    itemList[cMove].diZone = document.getElementById('diZone').checked;

    itemList[cMove] = findPositions(itemList[cMove]);
    //console.log(itemList[cMove].outputs.kb);
    //itemList[itemList.length-1].color = itemList[itemList.length-2].color;

    //itemList.splice(itemList.length-2,1);
    
    //drawMove(itemList[cMove]);
    updateList();
    resetStage(); 
    
  }
}
function updateList(){
	var select = document.getElementById("aList");
  while (select.firstChild) {
        select.removeChild(select.firstChild);
    }
  for(i = 0; i < (itemList.length); i++) {
    var aName = itemList[i].attack.name;
    var add = document.createElement('option');
    add.textContent = aName;
    add.value = aName;
    select.appendChild(add);
	}
  
  document.getElementById("aList").selectedIndex = cMove;
  
}
function swapMove(){
	//console.log("start");
	var select = document.getElementById("aList").value;
  //console.log(select);
  var item;
  for (i=0; i < itemList.length; i++){
  	if (select === itemList[i].attack.name){
    	item = itemList[i];
      cMove = i;
    }
  }
  //console.log(item.attack.name);
  //inputs matching
  document.getElementById('damage').value = item.attack.damage;
  document.getElementById('damageSlider').value = item.attack.damage;
  document.getElementById('bkb').value = item.attack.bkb;
  document.getElementById('bkbSlider').value = item.attack.bkb;
  document.getElementById('kbs').value = item.attack.kbs;
  document.getElementById('kbsSlider').value = item.attack.kbs;
  document.getElementById('kba').value = item.attack.angle;
  document.getElementById('kbaSlider').value = item.attack.angle;
  document.getElementById('flipper').checked = item.attack.flipper;
  document.getElementById('hsm').value = item.attack.hsm;
  document.getElementById('hsmSlider').value = item.attack.hsm;
  
  document.getElementById('chars').value = item.inputs.char.name;
  document.getElementById('percent').value = item.inputs.percent;
  document.getElementById('percentSlider').value = item.inputs.percent;
  document.getElementById('crouch').checked = item.inputs.cc;
  document.getElementById('noDI').checked = item.inputs.noDI;
  document.getElementById('tdi').value = item.inputs.tdi;
  document.getElementById('tdiSlider').value = item.inputs.tdi;
  document.getElementById('drift').value = item.inputs.drift.direction;
  document.getElementById('delay').value = item.inputs.drift.delay;
  document.getElementById('delaySlider').value = item.inputs.drift.delay;
  document.getElementById('cutoff').value = item.inputs.drift.cutoff;
  document.getElementById('cutoffSlider').value = item.inputs.drift.cutoff;
  
  document.getElementById('xStart').value = item.inputs.startPoint.x;
  document.getElementById('xStartSlider').value = item.inputs.startPoint.x;
  document.getElementById('yStart').value = item.inputs.startPoint.y;
  document.getElementById('yStartSlider').value = item.inputs.startPoint.y;
  
  document.getElementById('aColor').value = item.color;
  document.getElementById('aColorSlider').value = item.color;
  document.getElementById('aName').value = item.attack.name;
  document.getElementById('diZone').checked = item.diZone;
  
  //console.log("outputs");
  //outputs
  var kb = Math.round(item.outputs.kb*100)/100;
  document.getElementById('launchKB').innerHTML = kb + " p/f";
  var ang = Math.round(item.outputs.direction*100)/100;
  document.getElementById('kbAngle').innerHTML = ang + "°";
  document.getElementById('hitstun').innerHTML = item.outputs.hitstun + " frames";
  document.getElementById('height').innerHTML = item.outputs.minmax.maxY + " pixels";
  var fx = item.positions[item.positions.length-1].x;
  var fy = item.positions[item.positions.length-1].y;
  fx = Math.round(fx);
  fy = Math.round(fy);
  document.getElementById('position').innerHTML = "("+fx+","+fy+")";
  if (kill(item,stageList[cStage])){
    document.getElementById('kill').innerHTML = "Yes";
  }else{
    document.getElementById('kill').innerHTML = "No";
  }
  
  resetStage();
  //updateAttack();
}
function deleteAttack(){
	if (itemList.length == 0){
  	addAttack();
  }else{
    cMove = document.getElementById("aList").selectedIndex; 
    itemList.splice(cMove,1)
    updateList();
    if (cMove >= itemList.length){
    	cMove -= 1;
    }
    if (itemList.length == 0){
    	addAttack();
    }
    document.getElementById("aList").selectedIndex = cMove; 
    swapMove();
    //resetStage();
    //updateAttack();
  }
}
function findDISpots(item){
	var spotArray = [];
  //var itemCopy = Object.assign({},item);
  let itemCopy = JSON.parse(JSON.stringify(item)); // copy by value
  
  itemCopy.inputs.noDI = false;
  
  var angle = itemCopy.attack.angle;
  if (itemCopy.attack.flipper == true){ //reflect over Y axis
  	angle = (180-itemCopy.attack.angle)%360;
  }else{
  	angle = itemCopy.attack.angle;
  }
  
  for (var i=0;i<15;i++){
  	if ((i%5) == 0){
			itemCopy.inputs.tdi = (angle+90)%360;
    }else if ((i%5) == 1){
    	itemCopy.inputs.tdi = (angle+67)%360; //67?
    }else if ((i%5) == 2){
    	itemCopy.inputs.tdi = angle;
    }else if ((i%5) == 3){
    	itemCopy.inputs.tdi = (angle-67)%360; //67?
    }else if ((i%5) == 4){
    	itemCopy.inputs.tdi = (angle-90)%360;
    }
    if ((i%3) == 0){
    	itemCopy.inputs.drift.direction = "Left";
    }else if ((i%3) == 1){
    	itemCopy.inputs.drift.direction = "None";
    }else if ((i%3) == 2){
    	itemCopy.inputs.drift.direction = "Right";
    }
    itemCopy.inputs.drift.delay = 0;
    itemCopy.inputs.drift.cutoff = 0;
    itemCopy = findPositions(itemCopy);
    //console.log(positions[positions.length-1]);
    var x = itemCopy.positions[itemCopy.positions.length-1].x;
    var y = itemCopy.positions[itemCopy.positions.length-1].y;
    canvasX = canvas.width/2 + x/2;
    canvasY = vOffset - y/2;
    c.globalAlpha = 0.5;
    c.beginPath();
    c.arc(Math.round(canvasX), Math.round(canvasY), 2, 0, 2*Math.PI);
    c.fillStyle = 'hsl(' + itemCopy.color + ',80%,50%)';
    c.fill();
    c.closePath();
    spotArray.push(new Point(canvasX,canvasY));
  }

  c.globalAlpha = 1.0;
  return spotArray;
}
function drawDISpots(s,color){
	/*
  0 = inleft
  1 = inpartnone
  2 = noneright
  3 = outpartleft
  4 = outnone
  5 = inright
  6 = inpartleft
  7 = nonenone
  8 = outpartright
  9 = outleft
  10 = innone
  11 = inpartright
  12 = noneleft
  13 = outpartnone
  14 = outright
  */
  
  //positions already adjusted to canvas in prev function
  
  //DI in line
  c.globalAlpha = 0.5;
  c.beginPath();
  c.lineWidth = 2;
  c.strokeStyle = 'hsl(' + color + ',80%,50%)';
  c.moveTo(s[0].x,s[0].y);
  c.quadraticCurveTo(s[10].x,s[10].y,s[5].x,s[5].y);
  c.stroke();
  c.closePath();
  //Middle DI zone
  
  c.globalAlpha = 0.25;
  c.beginPath();
  c.lineWidth = 2;
  c.strokeStyle = 'hsl(' + color + ',80%,50%)';
  c.moveTo(s[6].x,s[6].y);
  c.lineTo(s[1].x,s[1].y);
  c.lineTo(s[11].x,s[11].y);
  c.lineTo(s[2].x,s[2].y);
  c.lineTo(s[7].x,s[7].y);
  c.lineTo(s[12].x,s[12].y);
  c.lineTo(s[6].x,s[6].y);
  c.stroke();
  c.fillstyle = 'hsl(' + color + ',80%,50%)';
  c.globalAlpha = 0.1;
  c.fill();
  c.closePath();
  
  c.globalAlpha = 0.25;
  c.beginPath();
  c.lineWidth = 2;
  c.strokeStyle = 'hsl(' + color + ',80%,50%)';
  c.moveTo(s[3].x,s[3].y);
  c.lineTo(s[12].x,s[12].y);
  c.lineTo(s[7].x,s[7].y);
  c.lineTo(s[2].x,s[2].y);
  c.lineTo(s[8].x,s[8].y);
  c.lineTo(s[13].x,s[13].y);
  c.lineTo(s[3].x,s[3].y);
  c.stroke();
  c.fillstyle = 'hsl(' + color + ',80%,50%)';
  c.globalAlpha = 0.1;
  c.fill();
  c.closePath();
  
  //no drift line
  c.globalAlpha = 0.15;
  c.beginPath();
  c.lineWidth = 2;
  c.strokeStyle = 'hsl(' + color + ',80%,50%)';
  c.moveTo(s[13].x,s[13].y);
  c.lineTo(s[7].x,s[7].y);
  c.lineTo(s[1].x,s[1].y);
  c.stroke();
  c.closePath();
  

  //c.quadraticCurveTo(s[12].x,s[12].y,s[6].x,s[6].y);
  //c.moveTo(s[6].x,s[6].y);
  //c.quadraticCurveTo(s[1].x,s[1].y,s[11].x,s[11].y);
  //c.moveTo(s[11].x,s[11].y);
  //bx = 2*s[2].x - s[11].x/2 - s[8].x/2;
  //by = 2*s[2].y - s[11].y/2 - s[8].y/2;
  //c.quadraticCurveTo(s[2].x,s[2].y,s[8].x,s[8].y);
  //c.moveTo(s[8].x,s[8].y);
  //c.quadraticCurveTo(s[13].x,s[13].y,s[3].x,s[3].y);
  
  
  //DI out line
  c.globalAlpha = 0.5;
  c.beginPath();
  c.moveTo(s[9].x,s[9].y);
  c.quadraticCurveTo(s[4].x,s[4].y,s[14].x,s[14].y);
  c.lineWidth = 2;
  c.strokeStyle = 'hsl(' + color + ',80%,50%)';
  c.stroke();
  c.closePath();
  c.globalAlpha = 1.0;
}
function kill(item,stage){
	if (item.outputs.minmax.maxY/2 >= stage.top){
  //console.log("top");
  	return true;
  }else if (item.outputs.minmax.minY/2 <= -stage.bottom){
  //console.log("bottom");
  	return true;
  }else if (item.outputs.minmax.maxX/2 >= (stage.side+stage.ground/2)){
  //console.log("right");
  	return true;
  }else if (item.outputs.minmax.minX/2 <= (-stage.side-stage.ground/2)){
  //console.log("left");
  	return true;
  }else{
  	return false;
  }
}
function grounded(item,stage){ //not implemented; for cc/sakuri
	var x = item.inputs.startPoint.x;
  var y = item.inputs.startPoint.y;  
}

//Define Stages
var stageList = [];
var capitalPlats = [new Plat(192, 64, 128), new Plat(96, 194, 124), new Plat(96, 514, 124), new Plat(192, 640, 128)];
stageList.push(new Stage("Fire Capital",612,484,432,832,capitalPlats,154));
var armadaPlats = [new Plat(176, -4, 184), new Plat(176, 508, 184)];
stageList.push(new Stage("Air Armada",564,396,416,688,armadaPlats,198));
var rockPlats = [new Plat(96, 128, 128), new Plat(192, 128, 128), new Plat(96, 512, 128), new Plat(192, 512, 128)];
stageList.push(new Stage("The Rock Wall",580, 356, 400, 768,rockPlats,182));
var merchantPlats = [new Plat(96,16,112), new Plat(176,214,80), new Plat(176,378,80), new Plat(96,544,112)];
stageList.push(new Stage("Merchant Port",596,452,384,672,merchantPlats,182));
var treetopPlats = [new Plat(96, 4, 192), new Plat(162, 320, 188)];
stageList.push(new Stage("Treetop Lodge",612, 484, 368, 512,treetopPlats,150));
var hideoutPlats = [new Plat(128, 128, 384)];
stageList.push(new Stage("Blazing Hideout",596, 500, 384, 640,hideoutPlats,166));
var tempestPlats = [new Plat(32, -174, 124), new Plat(96, 66, 124), new Plat(96, 322, 124), new Plat(32, 562, 124)];
stageList.push(new Stage("Tempest Peak",628, 536, 400, 512,tempestPlats,182));
var frozenPlats = [new Plat(192, 96, 162), new Plat(96, 308, 154), new Plat(192, 512, 162)];
stageList.push(new Stage("Frozen Fortress",600, 442, 396, 768,frozenPlats,150));
var towerPlats = [new Plat(96,64,128), new Plat(192,256,128), new Plat(96,448,128)];
stageList.push(new Stage("Tower Of Heaven",596,320,384,640,towerPlats,166));
var gatesPlats = [new Plat(112,36,156), new Plat(112,452,156), Plat(112,164,156), new Plat(112,324,156)];
stageList.push(new Stage("Aethereal Gates",612,500,376,640,gatesPlats,182));
var abyssPlats = [];
stageList.push(new Stage("The Endless Abyss",570, 464, 432, 672,abyssPlats,182));
var spiritPlats = [new Plat(82,-96,192), new Plat(82,480,192)];
stageList.push(new Stage("The Spirit Tree", 556, 484, 392, 576,spiritPlats,187));
var forestPlats = [new Plat(96,92,120), new Plat(96,492,120)];
stageList.push(new Stage("The Forest Floor",564, 440, 376, 704,forestPlats,138));
var julesPlats = [new Plat(96, -96, 768), new Plat(192, -96, 768)];
stageList.push(new Stage("Julesvale",590, 460, 400, 576,julesPlats,154));
var troupplePlats = [new Plat(96, -96, 186), new Plat(192, 164, 186), new Plat(96, 418, 186)];
stageList.push(new Stage("Troupple Pond",600, 500, 416, 512,troupplePlats,182));

var treetopDPlats = [new Plat(96, 100, 192), new Plat(162, 416, 188)];
stageList.push(new Stage("Treetop Lodge (D)",612, 388, 368, 704,treetopDPlats,150));
var forestDPlats = [new Plat(96, 0, 120), new Plat(192, 192, 120), new Plat(96, 384, 128), new Plat(192, 576, 120), new Plat(96, 768, 120)];
stageList.push(new Stage("The Forest Floor (D)",564, 440, 376, 896,forestDPlats,138));



//Define Characters
var charList = [];
charList.push(new Character("Absa",1.10,0.45,0.04,8));
charList.push(new Character("Clairen",1.00,0.50,0.02,10));
charList.push(new Character("Elliana",0.90,0.45,0.04,9));
charList.push(new Character("Elliana (Snake)",1.30,0.45,0.04,9)); //possible diffs
charList.push(new Character("Etalus",0.90,0.50,0.04,11));
charList.push(new Character("Etalus (Armor)",0.90,0.60,0.04,11)); //possible diffs
charList.push(new Character("Forsburn",1.00,0.50,0.04,10));
charList.push(new Character("Kragg",0.90,0.53,0.04,11));
charList.push(new Character("Maypul",1.10,0.50,0.06,10));
charList.push(new Character("Orcane",1.00,0.50,0.07,9));
charList.push(new Character("Ori",1.15,0.50,0.03,10));
charList.push(new Character("Ranno",1.05,0.50,0.02,10));
charList.push(new Character("Shovel Knight",0.95,0.50,0.04,10));
charList.push(new Character("Shovel Knight (Mail)",0.90,0.50,0.04,10)); //possible diffs
charList.push(new Character("Sylvanos",0.95,0.51,0.06,11));
charList.push(new Character("Wrastor",1.20,0.45,0.04,8));
charList.push(new Character("Zetterburn",1.00,0.50,0.04,10));

//Move List
var itemList = []; //list of plotted attacks
var cMove = 0; //current selected move
var cStage = 0;

//Listeners
function writeMessage(canvas, message) {
        c.font = '12pt Times New Roman';
        c.textAlign = 'center';
        c.fillStyle = 'grey';
        c.fillText(message, canvas.width/2, 318+30);
      }
function getMousePos(canvas, evt) {
  var rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

//Initial Load
var canvas = document.getElementById("myCanvas");
var c = canvas.getContext("2d");
var vOffset = 318;
reset();
drawStage(stageList[0],'grey');
updateAttack();
cMove = 0;

canvas.addEventListener('mousemove', function(evt) {
	if (!document.getElementById('xy').checked){
  	resetStage();
    var mousePos = getMousePos(canvas, evt);
    var x = -(canvas.width) + Math.round(2*mousePos.x);
    var y = (canvas.height) - Math.round(2*mousePos.y) + 100;
    var message = 'X:' + x + ' Y:' + y;
    writeMessage(canvas, message);
  }
}, false);