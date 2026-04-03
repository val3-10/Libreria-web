-- Añade categorías literarias si aún no existen (BD Booknest ya creada con solo 6 filas).
USE Booknest;
GO

INSERT INTO dbo.Categorias (Nombre)
SELECT v.Nombre
FROM (VALUES
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

PRINT 'Categorías ampliadas (o ya estaban al día).';
GO
