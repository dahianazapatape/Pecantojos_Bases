# Guía de contribución

## Ramas (Gitflow)

| Rama | Uso | Se crea desde | Se une a |
|---|---|---|---|
| `main` | Código publicado. Cada versión lleva una etiqueta `vX.Y.Z` | | |
| `develop` | Integración de funcionalidades terminadas | `main` | `release/*` |
| `feature/HU-XX-nombre` | Una historia de usuario | `develop` | `develop` |
| `release/vX.Y.0` | Ajustes finales de una versión | `develop` | `main` y `develop` |
| `hotfix/vX.Y.Z` | Corrección urgente en producción | `main` | `main` y `develop` |

```bash
git checkout develop && git pull
git checkout -b feature/HU-14-descuentos
# ... cambios ...
npm test
git commit -m "feat(promociones): aplica descuento por porcentaje al subtotal"
git checkout develop && git merge --no-ff feature/HU-14-descuentos
```

## Mensajes de commit

Formato `tipo(ámbito): descripción en minúscula y en presente`.

- `feat`: funcionalidad nueva
- `fix`: corrección de un error
- `test`: pruebas
- `docs`: documentación
- `refactor`: cambio interno sin cambiar el comportamiento
- `chore`: configuración, dependencias o scripts

## Antes de unir una rama

1. `npm test` pasa sin errores.
2. No subas `.env`, contraseñas ni la carpeta `node_modules`.
3. Si cambias el modelo de datos, actualiza los validadores e índices (`src/db/mongo-esquema.js`), el repositorio en memoria y la carga inicial (`src/db/carga/`).
4. Actualiza `CHANGELOG.md`.
