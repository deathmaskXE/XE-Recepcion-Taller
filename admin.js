import {firebaseConfig} from "./firebase-config.js";
import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import{getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import{getFirestore,collection,doc,setDoc,updateDoc,onSnapshot,query,orderBy,getDocs}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
  actualizarEstadisticas();

  const tarjeta=x=>{const g=garantiaInfo(x);const historial=(x.historial||[]).slice().reverse();const clase=x.estado==="Entregado"?"item-entregado":x.estado==="Devolución"?"item-devolucion":"item-taller";return `<div class="item ${clase}"><div class="itemtop"><div><h3>${x.id} · ${esc(x.equipo)}</h3><p>${esc(x.cliente)} · ${esc(x.falla||"Sin falla reportada")}</p><p>WhatsApp: ${esc(x.telefono||"Sin número")}</p><div class="warranty-badge ${g.clase}"><b>${g.texto}</b><span>${g.detalle}</span></div></div><b>${x.estado}</b></div><div class="controls"><select data-state="${x.id}">${states.map(s=>`<option ${s===x.estado?"selected":""}>${s}</option>`).join("")}</select><textarea data-note="${x.id}" placeholder="Nueva actualización visible para el cliente">${esc(x.nota||"")}</textarea><button data-save="${x.id}">GUARDAR Y AVISAR</button></div><div class="financial-edit"><input type="number" min="0" step="0.01" data-anticipo="${x.id}" value="${Number(x.anticipo||0)}" placeholder="Anticipo"><input type="number" min="0" step="0.01" data-total="${x.id}" value="${Number(x.costoTotal||0)}" placeholder="Costo total"><textarea data-reparacion="${x.id}" placeholder="Reparación realizada para el PDF de entrega">${esc(x.reparacionRealizada||"")}</textarea><button data-finanzas="${x.id}">GUARDAR IMPORTES</button></div><div class="pdf-actions"><button data-pdf-recepcion="${x.id}">PDF RECEPCIÓN Y ANTICIPO</button><button data-pdf-entrega="${x.id}">NOTA DE ENTREGA Y PAGO</button></div><label class="notify-check"><input type="checkbox" data-notify="${x.id}" checked> Abrir WhatsApp con el aviso después de guardar</label><details class="admin-history"><summary>HISTORIAL (${historial.length})</summary><div>${historial.map(h=>`<div class="history-entry"><small>${new Date(h.fecha).toLocaleString("es-MX")}</small><b>${esc(h.estado||"")}</b><span>${esc(h.nota||"Sin nota")}</span></div>`).join("")||"<p>Sin historial.</p>"}</div></details></div>`};

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


function esMismoMes(timestamp,referencia=new Date()){
  if(!timestamp)return false;
  const f=new Date(timestamp);
  return f.getFullYear()===referencia.getFullYear()&&f.getMonth()===referencia.getMonth();
}

function moneda(valor){
  return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:2}).format(Number(valor)||0);
}

function actualizarEstadisticas(){
  const taller=all.filter(x=>x.estado!=="Entregado"&&x.estado!=="Devolución");
  const entregadosMes=all.filter(x=>x.estado==="Entregado"&&esMismoMes(x.entregado||x.actualizado));
  const devoluciones=all.filter(x=>x.estado==="Devolución");
  const autorizacion=all.filter(x=>x.estado==="Esperando autorización");
  const ingresos=entregadosMes.reduce((s,x)=>s+(Number(x.costoTotal)||0),0);
  if($("statTaller"))$("statTaller").textContent=taller.length;
  if($("statEntregadosMes"))$("statEntregadosMes").textContent=entregadosMes.length;
  if($("statDevoluciones"))$("statDevoluciones").textContent=devoluciones.length;
  if($("statIngresos"))$("statIngresos").textContent=moneda(ingresos);
  if($("statAutorizacion"))$("statAutorizacion").textContent=autorizacion.length;
  if($("statTotal"))$("statTotal").textContent=all.length;
}

function descargarArchivo(nombre,contenido,tipo){
  const blob=new Blob([contenido],{type:tipo});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=nombre;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function leerColeccion(nombre){
  const snap=await getDocs(collection(db,nombre));
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}

$("backupAll").onclick=async()=>{
  const b=$("backupAll");
  try{
    b.disabled=true;b.textContent="CREANDO RESPALDO...";
    const [equipos,estadosPublicos,citas,citasPublicas]=await Promise.all([
      leerColeccion("equipos"),leerColeccion("estados_publicos"),leerColeccion("citas"),leerColeccion("citas_publicas")
    ]);
    const respaldo={
      formato:"XE-RESPALDO-V1",
      negocio:"XE Servicio Electrónico",
      generado:new Date().toISOString(),
      totales:{equipos:equipos.length,estados_publicos:estadosPublicos.length,citas:citas.length,citas_publicas:citasPublicas.length},
      datos:{equipos,estados_publicos:estadosPublicos,citas,citas_publicas:citasPublicas}
    };
    const fecha=new Date().toISOString().slice(0,10);
    descargarArchivo(`XE-Respaldo-Completo-${fecha}.json`,JSON.stringify(respaldo,null,2),"application/json;charset=utf-8");
    alert("Respaldo completo descargado correctamente. Guárdalo en un lugar seguro.");
  }catch(e){
    console.error(e);alert("No se pudo crear el respaldo: "+(e.code||e.message));
  }finally{b.disabled=false;b.textContent="DESCARGAR RESPALDO COMPLETO"}
};

$("exportCsv").onclick=()=>{
  const columnas=["Folio","Cliente","Telefono","Equipo","Modelo","Falla","Estado","Recibido","Entregado","Anticipo","Costo total","Reparacion realizada"];
  const fila=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const lineas=all.map(x=>[
    x.id,x.cliente,x.telefono,x.equipo,x.modelo,x.falla,x.estado,
    x.recibido?new Date(x.recibido).toLocaleString("es-MX"):"",
    x.entregado?new Date(x.entregado).toLocaleString("es-MX"):"",
    Number(x.anticipo||0),Number(x.costoTotal||0),x.reparacionRealizada||""
  ].map(fila).join(","));
  const csv="\ufeff"+[columnas.map(fila).join(","),...lineas].join("\n");
  descargarArchivo(`XE-Equipos-${new Date().toISOString().slice(0,10)}.csv`,csv,"text/csv;charset=utf-8");
};

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
const DATOS_TALLER={
  nombre:"XE Servicio Electrónico",
  slogan:"Expertos en Tecnología",
  responsable:"Ing. I. Daniel S.",
  direccion:"Mártires 30 de Diciembre, Col. Guerrero, Chilpancingo, Guerrero",
  telefono:"747 173 1852",
  facebook:"Daniel Sanchez Nava",
  tiktok:"XE Servicio Electrónico",
  youtube:"XE Servicio Electrónico",
  maps:"XE Servicio Electrónico"
};
let logoXeCache=null;
function cargarLogoXE(){
  if(logoXeCache)return Promise.resolve(logoXeCache);
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{logoXeCache=img;resolve(img)};
    img.onerror=()=>reject(new Error("No se pudo cargar el logotipo XE"));
    img.src="logo-xe.png";
  });
}
function metalLine(p,x1,y1,x2,y2,c1=[17,168,221],c2=[210,164,60]){
  const steps=14;
  for(let i=0;i<steps;i++){
    const t=i/(steps-1),r=Math.round(c1[0]*(1-t)+c2[0]*t),g=Math.round(c1[1]*(1-t)+c2[1]*t),b=Math.round(c1[2]*(1-t)+c2[2]*t);
    p.setDrawColor(r,g,b);p.setLineWidth(.25);const yy=y1+(y2-y1)*t;p.line(x1,yy,x2,yy);
  }
}
function premiumPanel(p,x,y,w,h,title,accent=[19,150,205],dark=false){
  p.setFillColor(...(dark?[15,19,25]:[247,249,252]));p.setDrawColor(...accent);p.setLineWidth(.35);p.roundedRect(x,y,w,h,3,3,"FD");
  p.setFillColor(...(dark?[26,33,43]:[229,236,244]));p.roundedRect(x,y,w,12,3,3,"F");p.rect(x,y+8,w,4,"F");
  p.setTextColor(...(dark?[236,239,244]:accent));p.setFont("helvetica","bold");p.setFontSize(8);p.text(title.toUpperCase(),x+6,y+8);
}
function premiumField(p,label,value,x,y,w,accent=[19,150,205],options={}){
  const {align="left",big=false}=options;
  p.setTextColor(...accent);p.setFont("helvetica","bold");p.setFontSize(6.4);p.text(label.toUpperCase(),x,y);
  p.setTextColor(32,37,45);p.setFont("helvetica",big?"bold":"normal");p.setFontSize(big?11:8.2);
  const txt=p.splitTextToSize(String(value??"No especificado"),w);
  p.text(txt.slice(0,big?1:2),align==="right"?x+w:x,y+6,{align});
}
async function generarPDFEntrega(x){
  if(!x||!window.jspdf)return alert("No se pudo cargar el generador PDF.");
  try{
    const logo=await cargarLogoXE();
    const {jsPDF}=window.jspdf,p=new jsPDF({unit:"mm",format:"a4",compress:true});
    const azul=[16,151,211],azulOscuro=[7,53,88],oro=[207,161,55],plata=[168,178,189],negro=[8,12,18];
    const total=Number(x.costoTotal)||0,anticipo=Number(x.anticipo)||0,pagoFinal=Math.max(0,total-anticipo);

    // Fondo y marco metálico.
    p.setFillColor(5,9,15);p.rect(0,0,210,297,"F");
    p.setDrawColor(...plata);p.setLineWidth(1);p.roundedRect(5,5,200,287,3,3,"S");
    p.setDrawColor(...azul);p.setLineWidth(.45);p.roundedRect(8,8,194,281,2,2,"S");
    metalLine(p,9,9,201,12,azul,oro);metalLine(p,9,285,201,288,oro,azul);

    // Encabezado premium.
    p.setFillColor(...negro);p.roundedRect(10,11,190,58,3,3,"F");
    p.setDrawColor(...azulOscuro);p.setLineWidth(.35);p.roundedRect(11,12,188,56,3,3,"S");
    p.addImage(logo,"PNG",16,16,55,39,undefined,"FAST");
    p.setTextColor(238,241,246);p.setFont("helvetica","bold");p.setFontSize(22);p.text("NOTA DE ENTREGA",194,29,{align:"right"});
    p.setTextColor(...oro);p.setFontSize(8.5);p.text("COMPROBANTE DE SERVICIO Y PAGO",194,38,{align:"right"});
    p.setTextColor(...plata);p.setFont("helvetica","normal");p.setFontSize(7.2);
    p.text(`FOLIO  ${x.id}`,194,49,{align:"right"});
    p.text(`EMISIÓN  ${fechaLarga(x.entregado||Date.now())}`,194,56,{align:"right"});
    p.setTextColor(...azul);p.setFont("helvetica","bold");p.setFontSize(7.3);p.text("SERVICIO FINALIZADO",194,64,{align:"right"});

    // Datos cliente / taller.
    premiumPanel(p,12,75,90,54,"Datos del cliente",azul,false);
    premiumField(p,"Nombre",x.cliente,18,94,76,azul);
    premiumField(p,"WhatsApp",x.telefono||"No especificado",18,110,76,azul);
    premiumField(p,"Folio de servicio",x.id,18,123,76,azul);

    premiumPanel(p,108,75,90,54,"Datos del taller",oro,false);
    premiumField(p,"Responsable",DATOS_TALLER.responsable,114,94,76,oro);
    premiumField(p,"Dirección",DATOS_TALLER.direccion,114,108,76,oro);
    premiumField(p,"Teléfono / WhatsApp",DATOS_TALLER.telefono,114,123,76,oro);

    // Equipo y fechas.
    premiumPanel(p,12,135,186,36,"Información del servicio",azul,false);
    premiumField(p,"Equipo",x.equipo,18,154,38,azul);
    premiumField(p,"Modelo / versión",x.modelo||"No especificado",61,154,38,azul);
    premiumField(p,"Fecha de recepción",fechaLarga(x.recibido),104,154,40,azul);
    premiumField(p,"Fecha de entrega",fechaLarga(x.entregado||Date.now()),149,154,41,azul);

    // Reparación realizada, sin resumen de servicio.
    premiumPanel(p,12,177,186,43,"Reparación realizada",oro,false);
    p.setTextColor(29,34,42);p.setFont("helvetica","normal");p.setFontSize(9);
    const rep=p.splitTextToSize(String(x.reparacionRealizada||x.nota||"No especificada"),174);
    p.text(rep.slice(0,7),18,197);

    // Panel financiero.
    premiumPanel(p,12,226,120,42,"Detalle de pago",azulOscuro,true);
    p.setTextColor(...plata);p.setFont("helvetica","normal");p.setFontSize(7);p.text("COSTO TOTAL",20,247);p.text("ANTICIPO",57,247);p.text("PAGO FINAL",94,247);
    p.setTextColor(245,247,250);p.setFont("helvetica","bold");p.setFontSize(11);p.text(moneda(total),20,259);p.text(moneda(anticipo),57,259);
    p.setTextColor(...oro);p.text(moneda(pagoFinal),94,259);

    // Garantía.
    premiumPanel(p,138,226,60,42,"Garantía",oro,true);
    const garantia=x.garantiaHasta?`${x.garantiaTiempo||0} ${x.garantiaUnidad||"días"}`:"Sin garantía";
    p.setTextColor(...oro);p.setFont("helvetica","bold");p.setFontSize(13);p.text(garantia.toUpperCase(),168,248,{align:"center"});
    p.setTextColor(...plata);p.setFont("helvetica","normal");p.setFontSize(6.6);
    p.text(x.garantiaHasta?`Vence: ${new Date(x.garantiaHasta).toLocaleDateString("es-MX",{day:"2-digit",month:"long",year:"numeric"})}`:"No registrada",168,259,{align:"center"});

    // Redes y pie.
    p.setTextColor(...plata);p.setFont("helvetica","normal");p.setFontSize(6.3);
    p.text(`Facebook: ${DATOS_TALLER.facebook}   |   TikTok: ${DATOS_TALLER.tiktok}`,105,276,{align:"center"});
    p.text(`YouTube: ${DATOS_TALLER.youtube}   |   Google Maps: ${DATOS_TALLER.maps}`,105,282,{align:"center"});
    p.setTextColor(...oro);p.setFont("helvetica","bold");p.setFontSize(7.5);p.text(`${DATOS_TALLER.nombre.toUpperCase()}  •  ${DATOS_TALLER.slogan.toUpperCase()}`,105,289,{align:"center"});

    p.save(`Nota-Entrega-Pagada-${x.id}.pdf`);
  }catch(e){console.error(e);alert("No se pudo crear la Nota de Entrega: "+e.message)}
}
