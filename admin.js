import {firebaseConfig} from "./firebase-config.js";
import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import{getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import{getFirestore,collection,doc,setDoc,updateDoc,onSnapshot,query,orderBy}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id);
const states=["Recibido","En diagnóstico","Esperando autorización","En reparación","Esperando refacción","En pruebas","Terminado","Entregado","Devolución"];
let all=[],ultimaRecepcion=null;

$("loginBtn").onclick=async()=>{
  try{
    $("loginMsg").textContent="";
    await signInWithEmailAndPassword(auth,$("email").value.trim(),$("pass").value);
  }catch(e){
    console.error("Firebase Auth error:",e);
    const errores={
      "auth/invalid-credential":"Correo o contraseña incorrectos.",
      "auth/invalid-email":"El correo electrónico no es válido.",
      "auth/user-disabled":"Este usuario está deshabilitado.",
      "auth/too-many-requests":"Demasiados intentos. Espera un momento.",
      "auth/network-request-failed":"Error de red. Revisa tu conexión.",
      "auth/operation-not-allowed":"El acceso por correo y contraseña no está habilitado."
    };
    $("loginMsg").textContent=errores[e.code]||`Error Firebase: ${e.code||e.message}`;
  }
};

$("logout").onclick=()=>signOut(auth);
onAuthStateChanged(auth,u=>{
  $("login").classList.toggle("hidden",!!u);
  $("dashboard").classList.toggle("hidden",!u);
  if(u)listen();
});

$("crear").onclick=async()=>{
  try{
    const now=Date.now();
    const folio=`XE-${new Date().getFullYear()}-${String(now).slice(-6)}`;
    const d={
      cliente:$("cliente").value.trim(),
      telefono:$("telefono").value.trim(),
      equipo:$("equipo").value.trim(),
      modelo:$("modelo").value.trim(),
      falla:$("falla").value.trim(),
      nota:$("nota").value.trim(),
      accesorios:$("accesorios").value.trim(),
      observaciones:$("observaciones").value.trim(),
      anticipo:Math.max(0,Number($("anticipo").value)||0),
      costoTotal:Math.max(0,Number($("costoTotal").value)||0),
      reparacionRealizada:"",
      estado:"Recibido",recibido:now,actualizado:now,entregado:null,
      garantiaTiempo:Math.max(0,Number($("garantiaTiempo").value)||0),
      garantiaUnidad:$("garantiaUnidad").value,
      garantiaHasta:null,
      historial:[{estado:"Recibido",nota:$("nota").value.trim()||"Equipo recibido en taller.",fecha:now}]
    };
    if(!d.cliente||!d.equipo)return alert("Escribe cliente y equipo");
    if(!d.telefono)return alert("Escribe el WhatsApp del cliente");

    await setDoc(doc(db,"equipos",folio),d);
    const pub={cliente:d.cliente,equipo:d.equipo,modelo:d.modelo,nota:d.nota,estado:d.estado,recibido:d.recibido,actualizado:d.actualizado,entregado:d.entregado,garantiaTiempo:d.garantiaTiempo,garantiaUnidad:d.garantiaUnidad,garantiaHasta:d.garantiaHasta,historial:d.historial};
    await setDoc(doc(db,"estados_publicos",folio),pub);

    ultimaRecepcion={folio,...d};
    $("created").innerHTML=`FOLIO CREADO: ${folio}<br><br><button type="button" id="pdfRecepcionNueva">PDF RECEPCIÓN / ANTICIPO</button> <button type="button" id="enviarWhatsapp">ENVIAR FOLIO POR WHATSAPP</button>`;
    document.getElementById("pdfRecepcionNueva").addEventListener("click",()=>generarPDFRecepcion(ultimaRecepcion));
    document.getElementById("enviarWhatsapp").addEventListener("click",()=>enviarFolioWhatsApp(ultimaRecepcion));

    ["cliente","telefono","equipo","modelo","falla","nota","accesorios","observaciones","anticipo","costoTotal"].forEach(x=>$(x).value="");$("garantiaTiempo").value="30";$("garantiaUnidad").value="dias";
  }catch(e){
    console.error(e);
    alert("No se pudo crear la recepción: "+(e.code||e.message));
  }
};

function normalizarWhatsApp(valor){
  let numero=String(valor||"").replace(/\D/g,"");
  if(numero.startsWith("521")&&numero.length===13)numero=numero.slice(3);
  else if(numero.startsWith("52")&&numero.length===12)numero=numero.slice(2);
  if(numero.length!==10)return null;
  return "52"+numero;
}

function enviarFolioWhatsApp(d){
  const numeroCliente=normalizarWhatsApp(d.telefono);
  if(!numeroCliente){
    alert(`WhatsApp inválido.\nNúmero capturado: ${d.telefono}`);
    return;
  }

  const link=`https://deathmaskxe.github.io/XE-Recepcion-Taller/?folio=${encodeURIComponent(d.folio)}`;
  const mensaje=`🎮 *XE SERVICIO ELECTRÓNICO*

Hola ${d.cliente} 👋

Tu equipo *${d.equipo}* ha sido recibido correctamente en nuestro taller.

🔹 *Folio:* ${d.folio}
🔹 *Estado actual:* Recibido

Puedes consultar en tiempo real el estado de tu equipo y el tiempo que lleva en nuestro taller aquí:

${link}

Guarda tu folio para futuras consultas.

⚡ *XE Servicio Electrónico*
Diagnóstico y reparación profesional.`;

  if(!confirm(`ENVIAR FOLIO POR WHATSAPP\n\nCliente: ${d.cliente}\nWhatsApp: +${numeroCliente}\n\n¿Abrir este número?`))return;

  const url=`https://wa.me/${numeroCliente}?text=${encodeURIComponent(mensaje)}`;
  const nueva=window.open(url,"_blank");
  if(!nueva)window.location.href=url;
}

function calcularGarantiaHasta(entregado,tiempo,unidad){
  const n=Math.max(0,Number(tiempo)||0);
  if(!entregado||!n)return null;
  const fecha=new Date(entregado);
  if(unidad==="meses")fecha.setMonth(fecha.getMonth()+n);
  else fecha.setDate(fecha.getDate()+n);
  return fecha.getTime();
}

function garantiaInfo(x){
  if(x.estado==="Devolución")return {clase:"sin",texto:"DEVOLUCIÓN SIN GARANTÍA",detalle:"Equipo devuelto sin reparación o sin autorización de presupuesto"};
  if(!x.entregado)return {clase:"pendiente",texto:"GARANTÍA AÚN NO INICIA",detalle:`${x.garantiaTiempo||0} ${x.garantiaUnidad||"días"} después de entrega`};
  if(!x.garantiaHasta)return {clase:"sin",texto:"SIN GARANTÍA",detalle:"Sin periodo de garantía asignado"};
  const restante=x.garantiaHasta-Date.now();
  if(restante>0){
    const dias=Math.ceil(restante/864e5);
    return {clase:"vigente",texto:"EN GARANTÍA",detalle:`${dias} día${dias===1?"":"s"} restante${dias===1?"":"s"} · vence ${new Date(x.garantiaHasta).toLocaleString("es-MX")}`};
  }
  return {clase:"vencida",texto:"FUERA DE GARANTÍA",detalle:`Venció ${new Date(x.garantiaHasta).toLocaleString("es-MX")}`};
}

function listen(){
  onSnapshot(query(collection(db,"equipos"),orderBy("recibido","desc")),s=>{
    all=s.docs.map(x=>({id:x.id,...x.data()}));
    render();
  });
}
$("filter").oninput=render;

function render(){
  const f=$("filter").value.toLowerCase();
  const arr=all.filter(x=>(x.id+" "+x.cliente+" "+x.equipo).toLowerCase().includes(f));
  const taller=arr.filter(x=>x.estado!=="Entregado"&&x.estado!=="Devolución");
  const entregados=arr.filter(x=>x.estado==="Entregado");
  const devoluciones=arr.filter(x=>x.estado==="Devolución");

  const tarjeta=x=>{const g=garantiaInfo(x);const historial=(x.historial||[]).slice().reverse();const clase=x.estado==="Entregado"?"item-entregado":x.estado==="Devolución"?"item-devolucion":"item-taller";return `<div class="item ${clase}"><div class="itemtop"><div><h3>${x.id} · ${esc(x.equipo)}</h3><p>${esc(x.cliente)} · ${esc(x.falla||"Sin falla reportada")}</p><p>WhatsApp: ${esc(x.telefono||"Sin número")}</p><div class="warranty-badge ${g.clase}"><b>${g.texto}</b><span>${g.detalle}</span></div></div><b>${x.estado}</b></div><div class="controls"><select data-state="${x.id}">${states.map(s=>`<option ${s===x.estado?"selected":""}>${s}</option>`).join("")}</select><textarea data-note="${x.id}" placeholder="Nueva actualización visible para el cliente">${esc(x.nota||"")}</textarea><button data-save="${x.id}">GUARDAR Y AVISAR</button></div><div class="financial-edit"><input type="number" min="0" step="0.01" data-anticipo="${x.id}" value="${Number(x.anticipo||0)}" placeholder="Anticipo"><input type="number" min="0" step="0.01" data-total="${x.id}" value="${Number(x.costoTotal||0)}" placeholder="Costo total"><textarea data-reparacion="${x.id}" placeholder="Reparación realizada para el PDF de entrega">${esc(x.reparacionRealizada||"")}</textarea><button data-finanzas="${x.id}">GUARDAR IMPORTES</button></div><div class="pdf-actions"><button data-pdf-recepcion="${x.id}">PDF RECEPCIÓN Y ANTICIPO</button><button data-pdf-entrega="${x.id}">PDF ENTREGA Y PAGO</button></div><label class="notify-check"><input type="checkbox" data-notify="${x.id}" checked> Abrir WhatsApp con el aviso después de guardar</label><details class="admin-history"><summary>HISTORIAL (${historial.length})</summary><div>${historial.map(h=>`<div class="history-entry"><small>${new Date(h.fecha).toLocaleString("es-MX")}</small><b>${esc(h.estado||"")}</b><span>${esc(h.nota||"Sin nota")}</span></div>`).join("")||"<p>Sin historial.</p>"}</div></details></div>`};

  const bloque=(titulo,clase,datos,vacio)=>`<section class="equipment-group ${clase}"><div class="equipment-group-title"><h3>${titulo}</h3><span>${datos.length}</span></div>${datos.length?datos.map(tarjeta).join(""):`<p class="empty-group">${vacio}</p>`}</section>`;
  $("list").innerHTML=
    bloque("EQUIPOS EN TALLER","group-taller",taller,"No hay equipos activos en el taller.")+
    bloque("EQUIPOS ENTREGADOS","group-entregados",entregados,"Todavía no hay equipos entregados.")+
    bloque("DEVOLUCIONES","group-devoluciones",devoluciones,"No hay equipos en devolución.");

  document.querySelectorAll("[data-finanzas]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.finanzas;
    const anticipo=Math.max(0,Number(document.querySelector(`[data-anticipo="${id}"]`).value)||0);
    const costoTotal=Math.max(0,Number(document.querySelector(`[data-total="${id}"]`).value)||0);
    const reparacionRealizada=document.querySelector(`[data-reparacion="${id}"]`).value.trim();
    try{await updateDoc(doc(db,"equipos",id),{anticipo,costoTotal,reparacionRealizada});alert("Importes y reparación guardados.")}catch(e){alert("No se pudieron guardar: "+(e.code||e.message))}
  });
  document.querySelectorAll("[data-pdf-recepcion]").forEach(b=>b.onclick=()=>generarPDFRecepcion(all.find(x=>x.id===b.dataset.pdfRecepcion)));
  document.querySelectorAll("[data-pdf-entrega]").forEach(b=>b.onclick=()=>{const x=all.find(x=>x.id===b.dataset.pdfEntrega);if(x.estado!=="Entregado")return alert("El PDF de entrega solo se genera cuando el estado es Entregado.");generarPDFEntrega(x)});

  document.querySelectorAll("[data-save]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.save;
    const old=all.find(x=>x.id===id);
    const estado=document.querySelector(`[data-state="${id}"]`).value;
    const nota=document.querySelector(`[data-note="${id}"]`).value.trim();
    const avisar=document.querySelector(`[data-notify="${id}"]`).checked;
    const ahora=Date.now();
    const cambio=estado!==old.estado||nota!==(old.nota||"");
    if(!cambio)return alert("No hay cambios nuevos para guardar.");

    const historial=[...(old.historial||[]),{estado,nota:nota||"Sin nota adicional.",fecha:ahora}];
    const upd={estado,nota,actualizado:ahora,historial};
    if(estado==="Entregado"){
      upd.entregado=old.entregado||ahora;
      upd.devolucion=null;
      upd.garantiaHasta=old.garantiaHasta||calcularGarantiaHasta(upd.entregado,old.garantiaTiempo,old.garantiaUnidad);
    }else if(estado==="Devolución"){
      upd.devolucion=old.devolucion||ahora;
      upd.entregado=null;
      upd.garantiaHasta=null;
    }else if(old.estado==="Entregado"||old.estado==="Devolución"){
      upd.entregado=null;
      upd.devolucion=null;
      upd.garantiaHasta=null;
    }

    let ventana=null;
    if(avisar)ventana=window.open("about:blank","_blank");
    try{
      b.disabled=true;
      b.textContent="GUARDANDO...";
      await updateDoc(doc(db,"equipos",id),upd);
      await updateDoc(doc(db,"estados_publicos",id),upd);
      if(avisar)abrirAvisoWhatsApp({...old,...upd,id},ventana);
    }catch(e){
      if(ventana)ventana.close();
      console.error(e);
      alert("No se pudo guardar la actualización: "+(e.code||e.message));
    }finally{
      b.disabled=false;
      b.textContent="GUARDAR Y AVISAR";
    }
  });
}

function abrirAvisoWhatsApp(d,ventana){
  const numeroCliente=normalizarWhatsApp(d.telefono);
  if(!numeroCliente){
    if(ventana)ventana.close();
    alert(`La actualización se guardó, pero el WhatsApp no es válido.\nNúmero capturado: ${d.telefono||"Sin número"}`);
    return;
  }
  const link=`https://deathmaskxe.github.io/XE-Recepcion-Taller/?folio=${encodeURIComponent(d.id)}`;
  const mensaje=`🎮 *ACTUALIZACIÓN DE REPARACIÓN XE*

Hola ${d.cliente} 👋

Tenemos una nueva actualización de tu equipo *${d.equipo}*.

🔹 *Folio:* ${d.id}
🔹 *Nuevo estado:* ${d.estado}
🔹 *Detalle:* ${d.nota||"Sin nota adicional"}
🔹 *Fecha:* ${new Date(d.actualizado).toLocaleString("es-MX")}

Consulta el historial completo aquí:
${link}

⚡ *XE Servicio Electrónico*`;
  const url=`https://wa.me/${numeroCliente}?text=${encodeURIComponent(mensaje)}`;
  if(ventana)ventana.location.href=url;
  else window.open(url,"_blank");
}

function esc(s){
  return String(s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
}


// Precarga una cita al convertirla en recepción.
const paramsAdmin=new URLSearchParams(location.search);
if(paramsAdmin.get("desdeCita")==="1"){
  try{
    const cita=JSON.parse(localStorage.getItem("xe_cita_recepcion")||"null");
    if(cita){
      const cargar=()=>{
        $("cliente").value=cita.cliente||"";
        $("telefono").value=cita.telefono||"";
        $("equipo").value=cita.equipo||"";
        $("modelo").value=cita.modelo||"";
        $("falla").value=cita.falla||"";
        $("nota").value=`Cita ${cita.id} convertida en recepción.`;
      };
      if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",cargar);else cargar();
    }
  }catch(e){console.warn("No se pudo precargar la cita",e)}
}


function moneda(v){return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(Number(v)||0)}
function fechaLarga(v){return v?new Date(v).toLocaleString("es-MX",{dateStyle:"long",timeStyle:"short"}):"No especificada"}
function pdfMarco(p,primario,secundario){
  p.setFillColor(248,248,248);p.rect(0,0,210,297,"F");
  p.setDrawColor(...primario);p.setLineWidth(1.2);p.roundedRect(8,8,194,281,3,3,"S");
  p.setDrawColor(...secundario);p.setLineWidth(.35);p.roundedRect(11,11,188,275,2,2,"S");
}
function pdfLogo(p,x,y,primario,oscuro=false){
  p.setFillColor(...primario);p.roundedRect(x,y,27,27,4,4,"F");
  p.setTextColor(oscuro?20:255,oscuro?20:255,oscuro?20:255);p.setFont("helvetica","bold");p.setFontSize(19);p.text("XE",x+13.5,y+18,{align:"center"});
}
function pdfPie(p,primario){
  p.setDrawColor(...primario);p.setLineWidth(.45);p.line(18,270,192,270);
  p.setTextColor(38,38,38);p.setFont("helvetica","bold");p.setFontSize(9);p.text("XE SERVICIO ELECTRÓNICO",105,278,{align:"center"});
  p.setFont("helvetica","normal");p.setFontSize(8);p.text("EXPERTOS EN TECNOLOGÍA",105,284,{align:"center"});
}
function pdfTitulo(p,titulo,subtitulo,primario,oscuro=false){
  p.setFillColor(...(oscuro?[14,14,16]:primario));p.roundedRect(13,13,184,37,3,3,"F");
  pdfLogo(p,19,18,oscuro?primario:[235,238,242],!oscuro);
  p.setTextColor(...(oscuro?primario:[255,255,255]));p.setFont("helvetica","bold");p.setFontSize(17);p.text(titulo,55,29);
  p.setFont("helvetica","normal");p.setFontSize(8);p.text(subtitulo.toUpperCase(),55,38);
}
function pdfEtiqueta(p,texto,x,y,w,primario,oscuro=false){
  p.setFillColor(...(oscuro?[20,20,22]:primario));p.roundedRect(x,y,w,9,2,2,"F");
  p.setTextColor(...(oscuro?primario:[255,255,255]));p.setFont("helvetica","bold");p.setFontSize(7.5);p.text(texto.toUpperCase(),x+w/2,y+6,{align:"center"});
}
function pdfCampo(p,etiqueta,valor,x,y,w,primario){
  p.setFillColor(255,255,255);p.setDrawColor(220,223,228);p.roundedRect(x,y,w,20,2,2,"FD");
  p.setTextColor(...primario);p.setFont("helvetica","bold");p.setFontSize(7);p.text(etiqueta.toUpperCase(),x+5,y+6);
  p.setTextColor(45,45,48);p.setFont("helvetica","normal");p.setFontSize(9);const lines=p.splitTextToSize(String(valor??"No especificado"),w-10);p.text(lines.slice(0,2),x+5,y+12);
}
function pdfTextoLargo(p,etiqueta,valor,x,y,w,h,primario){
  p.setFillColor(255,255,255);p.setDrawColor(220,223,228);p.roundedRect(x,y,w,h,2,2,"FD");
  p.setTextColor(...primario);p.setFont("helvetica","bold");p.setFontSize(7);p.text(etiqueta.toUpperCase(),x+5,y+6);
  p.setTextColor(45,45,48);p.setFont("helvetica","normal");p.setFontSize(8.5);const lines=p.splitTextToSize(String(valor??"No especificado"),w-10);p.text(lines.slice(0,Math.max(1,Math.floor((h-10)/4.5))),x+5,y+12);
}
function generarPDFRecepcion(x){
  if(!x||!window.jspdf)return alert("No se pudo cargar el generador PDF.");
  const {jsPDF}=window.jspdf,p=new jsPDF();const rojo=[132,18,32],plata=[132,140,151];
  pdfMarco(p,rojo,plata);pdfTitulo(p,"RECEPCIÓN DE EQUIPO","Comprobante de ingreso y anticipo",rojo);
  pdfEtiqueta(p,"Folio "+(x.folio||x.id),145,55,47,rojo);
  pdfCampo(p,"Cliente",x.cliente,18,69,85,rojo);pdfCampo(p,"WhatsApp",x.telefono,107,69,85,rojo);
  pdfCampo(p,"Equipo",x.equipo,18,93,85,rojo);pdfCampo(p,"Modelo",x.modelo||"No especificado",107,93,85,rojo);
  pdfCampo(p,"Fecha y hora de recepción",fechaLarga(x.recibido),18,117,174,rojo);
  pdfTextoLargo(p,"Falla reportada",x.falla||"No especificada",18,141,174,27,rojo);
  pdfTextoLargo(p,"Accesorios recibidos",x.accesorios||"No se registraron accesorios",18,172,85,30,rojo);
  pdfTextoLargo(p,"Observaciones físicas",x.observaciones||"Sin observaciones registradas",107,172,85,30,rojo);
  p.setFillColor(247,239,241);p.setDrawColor(...rojo);p.roundedRect(18,207,174,25,3,3,"FD");
  p.setTextColor(...rojo);p.setFont("helvetica","bold");p.setFontSize(8);p.text("ANTICIPO RECIBIDO",26,217);
  p.setFontSize(18);p.text(moneda(x.anticipo),184,221,{align:"right"});
  p.setFillColor(249,249,250);p.setDrawColor(...plata);p.roundedRect(18,237,174,27,2,2,"FD");
  p.setTextColor(...rojo);p.setFont("helvetica","bold");p.setFontSize(7.5);p.text("POLÍTICA DE DEVOLUCIÓN",25,246);
  p.setTextColor(55,55,58);p.setFont("helvetica","normal");p.setFontSize(7.5);const aviso=p.splitTextToSize("Todo equipo devuelto por no poder repararse o por no aceptar el presupuesto tiene un costo de $200 MXN. En controles, el costo es de $50 MXN.",158);p.text(aviso,25,252);
  pdfPie(p,rojo);p.save(`Recepcion-Anticipo-${x.folio||x.id}.pdf`)
}
function generarPDFEntrega(x){
  if(!x||!window.jspdf)return alert("No se pudo cargar el generador PDF.");
  const {jsPDF}=window.jspdf,p=new jsPDF();const oro=[190,146,46],negro=[18,18,20];
  pdfMarco(p,oro,[80,80,82]);pdfTitulo(p,"ENTREGA DE EQUIPO","Comprobante de servicio y pago",oro,true);
  pdfEtiqueta(p,"Servicio finalizado",145,55,47,oro,true);
  pdfCampo(p,"Folio",x.id,18,69,55,oro);pdfCampo(p,"Cliente",x.cliente,77,69,115,oro);
  pdfCampo(p,"Equipo",x.equipo,18,93,85,oro);pdfCampo(p,"Modelo",x.modelo||"No especificado",107,93,85,oro);
  pdfCampo(p,"Fecha de recepción",fechaLarga(x.recibido),18,117,85,oro);pdfCampo(p,"Fecha de entrega",fechaLarga(x.entregado||Date.now()),107,117,85,oro);
  pdfTextoLargo(p,"Reparación realizada",x.reparacionRealizada||x.nota||"No especificada",18,141,174,30,oro);
  pdfEtiqueta(p,"Resumen del servicio",18,176,72,oro,true);
  let y=190;const hist=(x.historial||[]).slice(-4);hist.forEach(h=>{p.setFillColor(255,255,255);p.setDrawColor(225,225,226);p.roundedRect(18,y,174,13,2,2,"FD");p.setTextColor(...oro);p.setFont("helvetica","bold");p.setFontSize(7);p.text(new Date(h.fecha).toLocaleDateString("es-MX"),23,y+5);p.setTextColor(45,45,48);p.setFont("helvetica","normal");p.text(p.splitTextToSize(`${h.estado}: ${h.nota||"Sin detalle"}`,135).slice(0,1),50,y+5);y+=16});
  y=Math.max(y+2,226);p.setFillColor(...negro);p.roundedRect(18,y,174,33,3,3,"F");
  const total=Number(x.costoTotal)||0,anticipo=Number(x.anticipo)||0,restante=Math.max(0,total-anticipo);
  p.setTextColor(235,235,235);p.setFont("helvetica","normal");p.setFontSize(8);p.text("COSTO TOTAL",27,y+10);p.text("ANTICIPO",86,y+10);p.text("PAGO FINAL",145,y+10);
  p.setFont("helvetica","bold");p.setFontSize(12);p.text(moneda(total),27,y+23);p.text(moneda(anticipo),86,y+23);p.setTextColor(...oro);p.text(moneda(restante),145,y+23);
  p.setTextColor(55,55,58);p.setFont("helvetica","normal");p.setFontSize(8);const garantia=x.garantiaHasta?`Garantía: ${x.garantiaTiempo||0} ${x.garantiaUnidad||"días"}. Vence ${fechaLarga(x.garantiaHasta)}.`:"Sin garantía registrada.";p.text(garantia,18,266);
  pdfPie(p,oro);p.save(`Entrega-Pagada-${x.id}.pdf`)
}

