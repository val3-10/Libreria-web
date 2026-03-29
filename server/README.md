# Servidor API - Libreria-web (Booknest)

Backend Node.js con **Express** y conexión a **SQL Server** para la aplicación Booknest.

## Requisitos

- **Node.js** >= 18
- **SQL Server** (local, Express o remoto) con TCP habilitado en el puerto 1433

## Instalación

```bash
cd server
npm install
```

## Configuración de la base de datos

1. Copia el archivo de ejemplo de variables de entorno:

   ```bash
   cp .env.example .env
   ```

2. Edita `.env` con los datos de tu SQL Server:

   | Variable | Descripción | Ejemplo |
   |----------|-------------|--------|
   | `DB_SERVER` | Servidor (host o IP) | `localhost` o `.\SQLEXPRESS` |
   | `DB_PORT` | Puerto | `1433` |
   | `DB_DATABASE` | Nombre de la base | `Booknest` |
   | `DB_USER` | Usuario SQL | `sa` |
   | `DB_PASSWORD` | Contraseña | tu contraseña |
   | `DB_TRUST_SERVER_CERTIFICATE` | Certificado en desarrollo | `true` |
   | `PORT` | Puerto del API | `3000` |

3. Crea la base de datos y las tablas ejecutando el script SQL en **SQL Server Management Studio** o **sqlcmd**:

   ```bash
   sqlcmd -S localhost -U sa -P tu_contraseña -i scripts/create-database.sql
   ```

   O abre `scripts/create-database.sql` en SSMS y ejecútalo.

## Ejecutar el servidor

```bash
# Producción
npm start

# Desarrollo (reinicio automático al cambiar archivos)
npm run dev
```

El API quedará en `http://localhost:3000` (o el `PORT` definido en `.env`).

## Endpoints disponibles

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del API y conexión a la base de datos |
| GET | `/api/ping-db` | Prueba de consulta SQL (`SELECT @@VERSION`) |

## Uso del módulo de base de datos

En tus rutas o servicios puedes usar el helper en `src/config/database.js`:

```javascript
const db = require('./config/database');

// Consulta directa
const { recordset } = await db.query('SELECT * FROM Libros WHERE Estado = @estado', request);

// Con parámetros (usando request del pool)
const pool = await db.getPool();
const request = pool.request();
request.input('estado', sql.VarChar, 'disponible');
const result = await request.query('SELECT * FROM Libros WHERE Estado = @estado');
```

## Próximos pasos

- Crear rutas para **usuarios** (login, registro, perfil).
- Crear rutas para **libros** (CRUD).
- Crear rutas para **ventas** y **préstamos**.
- Sustituir en el frontend las llamadas a `localStorage` por `fetch()` a este API.
