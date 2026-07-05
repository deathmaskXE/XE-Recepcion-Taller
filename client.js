import {firebaseConfig} from "./firebase-config.js";
import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import{getFirestore,doc,onSnapshot}from"https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app=initializeApp(firebaseConfig),db=getFirestore(app);

const states=[
"Recibido",
"En diagnóstico",
"Esperando autorización",
"En reparación",
"Esperando refacción",
"En pruebas",
"Terminado",
"Entregado"
];

let unsub,timerInt,current;
const $=id=>document.getElementById(id);

$("buscar").onclick=()=>{
  watch($("folio").value.trim().toUpperCase());
};

function watch(f){
  if(!f)return;

  $("folio").value=f;

  if(unsub)unsub();

  unsub=onSnapshot(
    doc(db,"estados_publicos",f),
    s=>{
      if(!s.exists()){
        $("msg").textContent="Folio no encontrado.";
        $("result").classList.add("hidden");
        return;
      }

      current={id:s.id,...s.data()};
      render();
    },
    ()=>{
      $("msg").textContent="No fue posible consultar el folio.";
    }
  );
}

function render(){
  let d=current;

  $("msg").textContent="";
  $("result").classList.remove("hidden");

  $("rFolio").textContent=d.id;
  $("rEstado").textContent=d.estado;
  $("rEquipo").textContent=d.equipo;
  $("rModelo").textContent=d.modelo||"N/A";
  $("rNota").textContent=d.nota||"Sin nota";
  $("rUpdate").textContent=
    new Date(d.actualizado).toLocaleString("es-MX");

  let idx=states.indexOf(d.estado);

  $("steps").innerHTML=states.map((s,i)=>
    `<div class="step ${i<=idx?"done":""}">
      <i></i>${s}
    </div>`
  ).join("");

  renderWarranty();
  clearInterval(timerInt);
  tick();
  timerInt=setInterval(()=>{tick();renderWarranty()},1000);
}

function tick(){
  if(!current)return;

  let end=
    current.estado==="Entregado"&&current.entregado
    ?current.entregado
    :Date.now();

  let ms=Math.max(0,end-current.recibido);

  let d=Math.floor(ms/864e5);
  ms%=864e5;

  let h=Math.floor(ms/36e5);
  ms%=36e5;

  let m=Math.floor(ms/6e4);
  let s=Math.floor(ms%6e4/1000);

  $("timer").textContent=
  `${String(d).padStart(2,"0")} DÍAS · `+
  `${String(h).padStart(2,"0")} HRS · `+
  `${String(m).padStart(2,"0")} MIN · `+
  `${String(s).padStart(2,"0")} SEG`;
}


function renderWarranty(){
  if(!current)return;
  const card=$("warrantyCard");
  if(current.estado!=="Entregado"){
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden","vigente","vencida","sin");
  if(!current.garantiaHasta){
    card.classList.add("sin");
    $("warrantyStatus").textContent="SIN GARANTÍA";
    $("warrantyDetail").textContent="No se asignó un periodo de garantía.";
    return;
  }
  const restante=current.garantiaHasta-Date.now();
  if(restante>0){
    const dias=Math.ceil(restante/864e5);
    card.classList.add("vigente");
    $("warrantyStatus").textContent="EN GARANTÍA";
    $("warrantyDetail").textContent=`${dias} día${dias===1?"":"s"} restante${dias===1?"":"s"} · vence ${new Date(current.garantiaHasta).toLocaleString("es-MX")}`;
  }else{
    card.classList.add("vencida");
    $("warrantyStatus").textContent="FUERA DE GARANTÍA";
    $("warrantyDetail").textContent=`Venció ${new Date(current.garantiaHasta).toLocaleString("es-MX")}`;
  }
}

$("share").onclick=()=>{
  let t=
`🎮 *ESTADO DE REPARACIÓN XE*

Folio: ${current.id}
Equipo: ${current.equipo}
Estado: ${current.estado}
Nota: ${current.nota||"Sin nota"}

Consulta actualizada en XE Servicio Electrónico.`;

  window.open(
    `https://api.whatsapp.com/send?text=${encodeURIComponent(t)}`,
    "_blank"
  );
};

/* ABRIR FOLIO AUTOMÁTICAMENTE DESDE EL LINK */

const params=new URLSearchParams(window.location.search);
const folioURL=params.get("folio");

if(folioURL){
  const folio=folioURL.trim().toUpperCase();

  $("folio").value=folio;

  watch(folio);
}
