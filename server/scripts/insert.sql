USE Booknest;
GO

-- Booknest DML (datos semilla) para instalación desde cero.
-- Requiere create-database.sql ejecutado previamente.

-- Documento
INSERT INTO dbo.Documento (Codigo, Nombre)
SELECT v.Codigo, v.Nombre
FROM (VALUES
  (N'CC',  N'Cédula de Ciudadanía'),
  (N'CE',  N'Cédula de Extranjería'),
  (N'PA',  N'Pasaporte'),
  (N'TI',  N'Tarjeta de Identidad'),
  (N'NIT', N'NIT'),
  (N'DNI', N'DNI')
) AS v(Codigo, Nombre)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Documento d WHERE d.Codigo = v.Codigo);
GO

-- Categorías
INSERT INTO dbo.Categorias (Nombre)
SELECT v.Nombre
FROM (VALUES
  (N'General'),
  (N'Ficción'),
  (N'No ficción'),
  (N'Infantil'),
  (N'Ciencia ficción'),
  (N'Terror'),
  (N'Fantasía'),
  (N'Romance'),
  (N'Thriller'),
  (N'Misterio'),
  (N'Aventura'),
  (N'Historia'),
  (N'Biografía'),
  (N'Poesía'),
  (N'Juvenil'),
  (N'Clásico'),
  (N'Drama'),
  (N'Humor'),
  (N'Filosofía'),
  (N'Autoayuda'),
  (N'Otro')
) AS v(Nombre)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Categorias c WHERE c.Nombre = v.Nombre);
GO

-- Proveedores
INSERT INTO dbo.Proveedores (Nombre, Contacto)
SELECT v.Nombre, v.Contacto
FROM (VALUES
  (N'Distribuidora Editorial Sur', N'compras@delsur.com.co'),
  (N'Libros & Más SAS', N'ventas@librosymas.com'),
  (N'Importadora Lector Global', N'logistica@lectorglobal.co'),
  (N'Casa del Libro Bogotá', N'proveedores@casadellibro-bog.com'),
  (N'Distribuidora Panamericana', N'comercial@panamericana.com.co'),
  (N'Editorial independiente Norte', N'contacto@edinorte.org')
) AS v(Nombre, Contacto)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Proveedores p WHERE p.Nombre = v.Nombre);
GO

-- Libros de ejemplo
INSERT INTO dbo.Libros (Titulo, Autor, Stock, Precio, CaratulaUrl, CategoriaId)
SELECT v.Titulo, v.Autor, v.Stock, v.Precio, v.CaratulaUrl, v.CategoriaId
FROM (VALUES
  (N'Cien años de soledad', N'Gabriel García Márquez', 12, 45000, N'caratulas/cien años de soledad.jpg', 1),
  (N'El principito', N'Antoine de Saint-Exupéry', 30, 22000,  N'caratulas/El principito.jpg', 1),
  (N'1984', N'George Orwell', 8, 35000, N'caratulas/1984.jpg', 1),
  (N'El corazón delator', N'Edgar Allan Poe', 18, 35000, N'caratulas/El corazon delator.jpg', 1),
  (N'El gato negro', N'Edgar Allan Poe', 20, 45000, N'caratulas/El gato negro.jpg', 1),
  (N'El patito feo', N'Hans Christian Andersen', 28, 35000, N'caratulas/El patito feo.jpg', 4),
  (N'El resplandor', N'Stephen King', 15, 40000, N'caratulas/El resplandor.jpg', 2),
  (N'La muerte de la mascara roja', N'Edgar Allan Poe', 28, 35000, N'caratulas/La muerte de la mascara roja.jpg', 1),
  (N'IT', N'Stephen King', 28, 40000, N'caratulas/Libro de IT.jpg', 6),
  (N'A dos metros de ti', N'Rachael Lippincott', 28, 52000, N'caratulas/A dos metros de ti.jpg', 2),
  (N'Berserk', N'Kentaro Miura', 28, 37900, N'caratulas/Berserk.jpg', 1),
  (N'Cementerio de animales', N'Stephen King', 28, 59000, N'caratulas/cementerio de animales.jpg', 6),
  (N'De la tierra a la luna', N'Julio Verne', 28, 40000, N'caratulas/De la tierra a la luna.jpg', 3),
  (N'El visitante', N'Stephen King', 28, 55000, N'caratulas/El visitante.jpg', 6),
  (N'Hansel y Gretel', N'Hermanos Grimm', 28, 40000, N'caratulas/gretel y hansel.jpg', 4),
  (N'Cómo entrenar a tu dragón', N'Cressida Cowell', 28, 45000, N'caratulas/How to Train Your Dragon.jpg', 4),
  (N'Misery', N'Stephen King', 28, 50000, N'caratulas/Misery.jpg', 6),
  (N'Parque Jurásico', N'Michael Crichton', 28, 60000, N'caratulas/Parque jurásico.jpg', 5),
  (N'Viaje al centro de la tierra', N'Julio Verne', 28, 35000, N'caratulas/Viaje al centro de la tierra.jpg', 3)
) AS v(Titulo, Autor, Stock, Precio, CaratulaUrl, CategoriaId)
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.Libros l
  WHERE l.Titulo = v.Titulo
    AND ((l.Autor = v.Autor) OR (l.Autor IS NULL AND v.Autor IS NULL))
);
GO

-- Usuario administrador de prueba
IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE Correo = N'admin@booknest.com')
BEGIN
  INSERT INTO dbo.Usuarios (
    Nombre,
    DocumentoId,
    NumeroDocumento,
    Correo,
    Telefono,
    Direccion,
    FechaNacimiento,
    Usuario,
    PasswordHash,
    Rol,
    Activo
  )
  VALUES (
    N'Administrador Booknest',
    NULL,
    NULL,
    N'admin@booknest.com',
    NULL,
    NULL,
    NULL,
    N'admin',
    N'Abc123',
    N'admin',
    1
  );
END
GO

PRINT 'DML Booknest aplicado correctamente.';
