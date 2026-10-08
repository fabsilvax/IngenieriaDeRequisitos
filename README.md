# Ingeniería de Requisitos · Legal Tech · Empresa 1

Tablero con el plan, las entregas y los avances del proyecto. Los avances se guardan en `NuestrosAvances/`.

## Local
Doble clic en `iniciar.bat` (o `npm start`) y abrir http://localhost:4173

## Railway (recomendado: necesita servidor para guardar archivos)
1. New Project > Deploy from GitHub repo > este repositorio. No requiere configuración.
2. Variables: `ACCESS_PASSWORD` (contraseña de acceso, muy recomendado).
3. Para que los archivos sobrevivan a cada deploy: añade un Volume montado en `/data` y define `DATA_DIR=/data`.

## Vercel
Vercel no ejecuta servidores con disco persistente: la página carga, pero sin guardar archivos (modo "Sin servidor").
