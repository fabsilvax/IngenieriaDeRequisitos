# Ingeniería de Requisitos · Legal Tech · Empresa 1

Tablero con el plan, las entregas y los avances del proyecto. Los avances van a `NuestrosAvances/`.

## En tu PC
Doble clic en `iniciar.bat` (o `npm start`) y abrir http://localhost:4173. Guarda directo en la carpeta `NuestrosAvances`.

## En Vercel
1. Vercel > Add New > Project > importa este repositorio. No cambies nada de la configuración.
2. Antes de desplegar, en *Environment Variables* agrega:
   - `GH_TOKEN`: token de GitHub (Settings > Developer settings > Fine-grained tokens), solo para este repositorio, permiso *Contents: Read and write*.
   - `ACCESS_PASSWORD`: contraseña de acceso (la web pide usuario y contraseña; el usuario puede ser cualquiera).
3. Deploy.

Vercel no tiene disco persistente, así que cada registro se guarda como commit en la rama `avances`, dentro de `NuestrosAvances/`. Esa rama no genera despliegues. Archivos de hasta 4 MB (límite de Vercel); los más pesados se suben a mano a la carpeta.

Para traer los avances a tu PC:

    git fetch origin avances
    git checkout origin/avances -- NuestrosAvances

Variables opcionales: `GH_REPO` (por defecto el repositorio del proyecto) y `GH_BRANCH` (por defecto `avances`).
