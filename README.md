# XE Recepción Taller V1

Frontend: GitHub Pages. Datos en tiempo real: Firebase Firestore. Acceso privado: Firebase Authentication.

## Configuración
1. Crea un proyecto en Firebase.
2. Agrega una app Web.
3. Copia `firebaseConfig` en `firebase-config.js`.
4. En Authentication habilita Email/Password y crea tu usuario administrador.
5. Crea Firestore Database.
6. Usa reglas para que clientes puedan leer `equipos` y solo usuarios autenticados puedan escribir:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /equipos/{folio} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}

7. Sube estos archivos a un repositorio GitHub y activa Pages desde main / root.

IMPORTANTE: no guardes contraseñas en el código. El firebaseConfig web no es una contraseña; la seguridad real se controla con Authentication y Firestore Rules.
