# XE Recepción Taller · Fase 1 Beta

Esta versión conserva el sistema de recepción e historial y agrega un módulo independiente de agenda de citas.

## Nuevas páginas
- `agenda.html`: panel privado para crear, consultar, reagendar, cancelar y convertir citas en recepción.
- `cita.html`: consulta pública de citas mediante folio.

## Funciones de la agenda
- Crear folios `XE-CITA-xxxxxx`.
- Enviar la confirmación por WhatsApp.
- Cambiar solamente fecha y hora conservando el resto de los datos.
- Enviar por WhatsApp la nueva propuesta.
- Historial de movimientos de la cita.
- PDF premium azul metálico y plata.
- Solicitar reagendar por WhatsApp.
- Solicitar llamada por WhatsApp.
- Convertir una cita en recepción mediante precarga de datos.

## Firebase
Publica las reglas incluidas en `firestore.rules.txt`. Se agregan las colecciones:
- `citas`: información privada para el administrador.
- `citas_publicas`: información visible al consultar un folio.

Las colecciones existentes `equipos` y `estados_publicos` no se eliminan ni se modifican.

## Fases 2 y 3 añadidas
- Historial cronológico y avisos de WhatsApp al actualizar.
- Campos de accesorios, observaciones físicas, anticipo y costo total.
- PDF premium de recepción rojo metálico, sin QR ni firma.
- Captura posterior de reparación realizada e importes.
- PDF premium de entrega negro y dorado, con historial resumido y garantía, sin QR ni firma.
- Botón del cliente para solicitar llamada por WhatsApp.
- Mensaje de confianza al final del seguimiento.

## Nota de entrega premium
La Nota de Entrega utiliza el logotipo original de XE y contiene los datos del taller:
- Mártires 30 de Diciembre, Col. Guerrero, Chilpancingo, Guerrero
- Tel. 747 173 1852
- Responsable: Ing. I. Daniel S.
- Facebook: Daniel Sanchez Nava
- TikTok / YouTube / Google Maps: XE Servicio Electrónico

El documento no es una factura ni un comprobante fiscal. No incluye QR ni el apartado "Resumen del servicio".

## Estadísticas y respaldo

El panel administrador incluye estadísticas automáticas de equipos activos, entregas del mes, devoluciones, ingresos registrados, autorizaciones pendientes y expedientes totales.

El botón **Descargar respaldo completo** genera un archivo JSON con las colecciones `equipos`, `estados_publicos`, `citas` y `citas_publicas`. No borra ni modifica datos. El botón **Exportar equipos CSV** genera una tabla compatible con Excel.
