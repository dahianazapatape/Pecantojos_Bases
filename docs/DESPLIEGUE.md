# Publicar Pecantojos: MongoDB Atlas, GitHub y Azure

Al terminar, la tienda queda en `https://pecantojos-mongo.azurewebsites.net`, guarda todo en MongoDB Atlas y el código está en GitHub. Tiempo aproximado: 45 minutos.

```
Navegador ──HTTPS──▶ Azure App Service (API Node.js) ──TLS, usuario y clave──▶ MongoDB Atlas (clúster gratuito)
```

| Parte | Dónde | Costo |
|---|---|---|
| Base de datos | MongoDB Atlas, clúster **Free (M0)** | gratis, sin tarjeta |
| Aplicación | Azure App Service, plan `pecantojos-plan` (F1 gratuito) que ya existe | gratis |
| Código | GitHub, repositorio `pecantojos-mongo` | gratis |

> Las contraseñas y la cadena de conexión van **solo** en el archivo `.env` de tu computador y en la configuración de Azure. Nunca en el código ni en GitHub (`.gitignore` ya excluye `.env`).

---

## Parte 1. MongoDB Atlas

### 1.1 Crear el clúster

1. Entra a <https://cloud.mongodb.com> e inicia sesión (puedes usar tu cuenta de Google).
2. Crea un proyecto llamado `Pecantojos`.
3. **Create** › elige **Free**. Proveedor **Azure** o **AWS**, la región gratuita más cercana (por ejemplo São Paulo o Virginia). Nombre del clúster: `pecantojos`. **Create Deployment**. Tarda 1 a 3 minutos.

### 1.2 Usuario de la base de datos

**Security › Database Access › Add New Database User**:

- Método **Password**. Usuario `pecantojos_app`. **Autogenerate Secure Password** y guárdala en un lugar seguro.
- Rol: **Atlas admin** (la carga inicial crea colecciones con validadores e índices).

### 1.3 Acceso de red

**Security › Network Access › Add IP Address**:

1. **Add Current IP Address**: tu computador, para la carga inicial.
2. Otra vez **Add IP Address** › **Allow access from anywhere** (`0.0.0.0/0`): la app en Azure del plan gratuito no tiene una IP de salida fija. La protección la dan el usuario, la contraseña y el cifrado TLS que Atlas exige siempre.

### 1.4 Cadena de conexión

En el clúster: **Connect › Drivers › Node.js**. Copia la cadena:

```
mongodb+srv://pecantojos_app:<db_password>@pecantojos.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=pecantojos
```

Reemplaza `<db_password>` por la contraseña. Si tiene caracteres especiales, escríbelos codificados: `@` → `%40`, `#` → `%23`, `%` → `%25`, `/` → `%2F`.

---

## Parte 2. Cargar los datos desde tu computador

Abre **PowerShell** en la carpeta del proyecto (en el Explorador: clic derecho dentro de `Documentos\pecantojos-mongo` › *Abrir en Terminal*).

```powershell
copy .env.example .env
notepad .env
```

En el Bloc de notas completa estas líneas y guarda:

```env
MONGODB_URI=mongodb+srv://pecantojos_app:TU_CLAVE@pecantojos.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=pecantojos
MONGODB_DB=pecantojos
ADMIN_PASSWORD=una_clave_para_el_panel_de_8_o_mas
JWT_SECRET=una_frase_larga_y_aleatoria_de_40_caracteres_o_mas
```

Luego:

```powershell
npm install
npm run mongo:check      # debe decir: Conexión a MongoDB: OK (pecantojos.xxxxx.mongodb.net / pecantojos)
npm run mongo:cargar     # carga catálogo + 12 meses de histórico y verifica; todas las líneas con ✔
npm start                # abre http://localhost:3000 y http://localhost:3000/admin
```

Entra al panel con el usuario `admin` y la contraseña que pusiste en `ADMIN_PASSWORD`. Revisa **Reportes**: deben verse barras con un año de ventas.

En Atlas, **Data Explorer** › `pecantojos` › `pedidos`: abre un pedido y comprueba que trae `detalles`, `historial` y `pagos` adentro. En la pestaña **Indexes** de `pedidos` aparecen los índices y en **Validation** el esquema. **Toma las capturas aquí** (lista al final).

> Si necesitas empezar de cero: `npm run mongo:cargar -- --reiniciar` borra las colecciones y vuelve a cargar.

---

## Parte 3. Subir el código a GitHub

1. En <https://github.com/new> crea el repositorio `pecantojos-mongo`, **sin** README ni .gitignore (el proyecto ya los tiene). Puede ser público; si es privado, agrega al profesor y a Jhonatan en *Settings › Collaborators*.
2. En PowerShell, dentro de la carpeta del proyecto (pon tu nombre y tu correo de GitHub):

```powershell
git init -b main
git config user.name "Dahiana Zapata Peña"
git config user.email "TU_CORREO_DE_GITHUB"
git add .
git status               # revisa que NO aparezca .env ni node_modules
git commit -m "feat: tienda Pecantojos sobre MongoDB Atlas (proyecto final Bases de Datos II)"
git branch develop
git remote add origin https://github.com/TU_USUARIO/pecantojos-mongo.git
git push -u origin main develop
git tag v3.0.0 && git push origin v3.0.0
```

La primera vez Git abre el navegador para iniciar sesión en GitHub. Jhonatan puede clonar el repositorio y trabajar en ramas `feature/...` que se unen a `develop` (ver `CONTRIBUTING.md`).

---

## Parte 4. Publicar en Azure

Se crea una **segunda aplicación web** en el plan gratuito que ya existe. La versión anterior (`pecantojos`) sigue funcionando aparte.

### 4.1 Crear la aplicación

En <https://portal.azure.com> abre **Cloud Shell** (icono `>_` arriba) en modo **Bash** y ejecuta:

```bash
az webapp create -g pecantojos -p pecantojos-plan -n pecantojos-mongo --runtime "NODE:24-lts"
```

Si el nombre `pecantojos-mongo` ya está tomado, usa otro (por ejemplo `pecantojos-bd2`) y cámbialo en los comandos siguientes.

### 4.2 Variables de entorno

```bash
az webapp config appsettings set -g pecantojos -n pecantojos-mongo -o none --settings \
  DB_CLIENT=mongo MONGODB_DB=pecantojos JWT_EXPIRES=8h UPLOADS_DIR=/home/data/uploads \
  WHATSAPP_NUMERO=57XXXXXXXXXX SCM_DO_BUILD_DURING_DEPLOYMENT=true JWT_SECRET=$(openssl rand -hex 32)
read -s -p "Pega la cadena de Atlas y Enter: " U; echo
az webapp config appsettings set -g pecantojos -n pecantojos-mongo -o none --settings MONGODB_URI="$U"; unset U
```

`read -s` oculta lo que pegas, así la cadena no queda visible en pantalla ni en el historial.

### 4.3 Subir el código

1. En tu computador crea el ZIP (PowerShell, en la carpeta del proyecto):

   ```powershell
   Compress-Archive -Path package.json,package-lock.json,src,public -DestinationPath pecantojos-mongo-app.zip -Force
   ```

   (Si recibiste `pecantojos-mongo-app.zip` ya hecho, puedes usar ese.)
2. En Cloud Shell: **Administrar archivos › Cargar** y elige `pecantojos-mongo-app.zip`.
3. Ejecuta:

   ```bash
   az webapp deploy -g pecantojos -n pecantojos-mongo --src-path pecantojos-mongo-app.zip --type zip --async true
   ```

   `--async true` evita que el comando falle si Cloud Shell se desconecta. Azure instala las dependencias; espera 3 o 4 minutos.

### 4.4 Probar

Abre `https://pecantojos-mongo.azurewebsites.net`. La primera visita del día tarda hasta un minuto (el plan gratuito duerme la app); la tienda muestra *Despertando la tienda* y carga sola. Entra a `/admin`, crea un pedido de prueba desde la tienda y búscalo en Atlas (**Data Explorer** › `pedidos`, ordena por `_id` descendente).

Si algo falla, mira el registro: `az webapp log tail -g pecantojos -n pecantojos-mongo` (Ctrl+C para salir). Un `Server selection timed out` significa que falta `0.0.0.0/0` en *Network Access*.

### Actualizar más adelante

Repite 4.3 con un ZIP nuevo. Los datos están en Atlas, así que publicar no borra nada.

---

## Capturas para la documentación (secciones 12 y 13)

- [ ] Atlas › *Clusters*: el clúster `pecantojos` activo.
- [ ] Atlas › *Data Explorer* › `pedidos`: un documento con `detalles`, `historial` y `pagos`.
- [ ] Atlas › `pedidos` › *Indexes* y *Validation*.
- [ ] Atlas › *Network Access* y *Database Access* (sin mostrar contraseñas).
- [ ] PowerShell: salida de `npm run mongo:cargar` con todas las líneas en ✔.
- [ ] Azure › `pecantojos-mongo` › *Información general*: estado *En ejecución* y la dirección.
- [ ] Azure › *Variables de entorno*: los nombres (con los valores ocultos).
- [ ] La tienda abierta en el celular con la dirección de Azure.
- [ ] GitHub: el repositorio con el código y sin `.env`.

## Límites del plan gratuito

- Atlas M0: 0,5 GB (la carga usa unos 3 MB), 100 operaciones por segundo, 500 conexiones. Se pausa tras 30 días sin conexiones; se reanuda desde Atlas con un clic.
- Azure F1: 60 minutos de CPU al día y la app se duerme tras unos 20 minutos sin visitas. Abre la tienda unos minutos antes de la sustentación.
