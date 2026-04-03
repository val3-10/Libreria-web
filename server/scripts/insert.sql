USE Booknest;
GO

-- Proveedores de ejemplo (solo si la tabla está vacía)
IF NOT EXISTS (SELECT 1 FROM dbo.Proveedores)
INSERT INTO dbo.Proveedores (Nombre, Contacto) VALUES
  (N'Distribuidora Editorial Sur', N'compras@delsur.com.co'),
  (N'Libros & Más SAS', N'ventas@librosymas.com'),
  (N'Importadora Lector Global', N'logistica@lectorglobal.co'),
  (N'Casa del Libro Bogotá', N'proveedores@casadellibro-bog.com'),
  (N'Distribuidora Panamericana', N'comercial@panamericana.com.co'),
  (N'Editorial independiente Norte', N'contacto@edinorte.org');
GO

-- Requiere tablas Categorias y Libros con columna CategoriaId (create-database.sql o migrate-evolucion-booknest.sql).
INSERT INTO dbo.Libros (Titulo, Autor, Estado, Stock, Precio, CaratulaUrl, CategoriaId)
VALUES
  (N'Cien años de soledad', N'Gabriel García Márquez', N'disponible', 12, 45000, N'caratulas/cien años de soledad.jpg', 1),
  (N'El principito', N'Antoine de Saint-Exupéry', N'disponible', 30, 22000,  N'caratulas/El principito.jpg', 1),
  (N'1984', N'George Orwell', N'disponible', 8, 35000, N'caratulas/1984.jpg', 1),
  (N'El corazón delator', N'Edgar Allan Poe', N'disponible', 18, 35000, N'caratulas/El corazon delator.jpg', 1),
  (N'El gato negro', N'Edgar Allan Poe', N'disponible', 20, 45000, N'caratulas/El gato negro.jpg', 1),
  (N'El patito feo', N'Hans Christian Andersen', N'disponible', 28, 35000, N'caratulas/El patito feo.jpg', 4),
  (N'El resplandor', N'Stephen King', N'disponible', 15, 40000, N'caratulas/El resplandor.jpg', 2),
  (N'La muerte de la mascara roja', N'Edgar Allan Poe', N'disponible', 28, 35000, N'caratulas/La muerte de la mascara roja.jpg', 1),
  (N'IT', N'Stephen King', N'disponible', 28, 40000, N'caratulas/Libro de IT.jpg', 6),
  (N'A dos metros de ti', N'Rachael Lippincott', N'disponible', 28, 52000, N'caratulas/A dos metros de ti.jpg', 2),
  (N'Berserk', N'Kentaro Miura', N'disponible', 28, 37900, N'caratulas/Berserk.jpg', 1),
  (N'Cementerio de animales', N'Stephen King', N'disponible', 28, 59000, N'caratulas/cementerio de animales.jpg', 6),
  (N'De la tierra a la luna', N'Julio Verne', N'disponible', 28, 40000, N'caratulas/De la tierra a la luna.jpg', 3),
  (N'El visitante', N'Stephen King', N'disponible', 28, 55000, N'caratulas/El visitante.jpg', 6),
  (N'Hansel y Gretel', N'Hermanos Grimm', N'disponible', 28, 40000, N'caratulas/gretel y hansel.jpg', 4),
  (N'Cómo entrenar a tu dragón', N'Cressida Cowell', N'disponible', 28, 45000, N'caratulas/How to Train Your Dragon.jpg', 4),
  (N'Misery', N'Stephen King', N'disponible', 28, 50000, N'caratulas/Misery.jpg', 6),
  (N'Parque Jurásico', N'Michael Crichton', N'disponible', 28, 60000, N'caratulas/Parque jurásico.jpg', 5),
  (N'Viaje al centro de la tierra', N'Julio Verne', N'disponible', 28, 35000, N'caratulas/Viaje al centro de la tierra.jpg', 3);
GO
