import {firebaseConfig} from "./firebase-config.js";
import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import{getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import{getFirestore,collection,doc,setDoc,updateDoc,onSnapshot,query,orderBy}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id);
const states=["Recibido","En diagnóstico","Esperando autorización","En reparación","Esperando refacción","En pruebas","Terminado","Entregado"];
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
      estado:"Recibido",recibido:now,actualizado:now,entregado:null
    };
    if(!d.cliente||!d.equipo)return alert("Escribe cliente y equipo");
    if(!d.telefono)return alert("Escribe el WhatsApp del cliente");

    await setDoc(doc(db,"equipos",folio),d);
    const pub={equipo:d.equipo,modelo:d.modelo,nota:d.nota,estado:d.estado,recibido:d.recibido,actualizado:d.actualizado,entregado:d.entregado};
    await setDoc(doc(db,"estados_publicos",folio),pub);

    ultimaRecepcion={folio,...d};
    $("created").innerHTML=`FOLIO CREADO: ${folio}<br><br><button type="button" id="enviarWhatsapp">ENVIAR FOLIO POR WHATSAPP</button>`;
    document.getElementById("enviarWhatsapp").addEventListener("click",()=>enviarFolioWhatsApp(ultimaRecepcion));

    ["cliente","telefono","equipo","modelo","falla","nota"].forEach(x=>$(x).value="");
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
  $("list").innerHTML=arr.map(x=>`<div class="item"><div class="itemtop"><div><h3>${x.id} · ${esc(x.equipo)}</h3><p>${esc(x.cliente)} · ${esc(x.falla||"Sin falla reportada")}</p><p>WhatsApp: ${esc(x.telefono||"Sin número")}</p></div><b>${x.estado}</b></div><div class="controls"><select data-state="${x.id}">${states.map(s=>`<option ${s===x.estado?"selected":""}>${s}</option>`).join("")}</select><textarea data-note="${x.id}">${esc(x.nota||"")}</textarea><button data-save="${x.id}">GUARDAR</button></div></div>`).join("");

  document.querySelectorAll("[data-save]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.save;
    const estado=document.querySelector(`[data-state="${id}"]`).value;
    const nota=document.querySelector(`[data-note="${id}"]`).value;
    const upd={estado,nota,actualizado:Date.now()};
    if(estado==="Entregado"){
      const old=all.find(x=>x.id===id);
      upd.entregado=old.entregado||Date.now();
    }
    await updateDoc(doc(db,"equipos",id),upd);
    await updateDoc(doc(db,"estados_publicos",id),upd);
  });
}

function esc(s){
  return String(s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
}
