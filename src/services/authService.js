// HU-11 cuentas de cliente (SC-01) e inicio de sesión del administrador (CU-11)
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { badRequest, unauthorized, conflict } = require('../utils/errors');

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function firmar(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpires });
}

function verificar(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('La sesión expiró o no es válida; inicia sesión de nuevo');
  }
}

const publicoCliente = ({ passwordHash, ...c }) => c;

function createAuthService(repos) {
  return {
    async registrarCliente({ nombre, correo, telefono, password, direccion, ciudad }) {
      nombre = String(nombre || '').trim();
      correo = String(correo || '').trim().toLowerCase();
      telefono = String(telefono || '').replace(/\s/g, '');
      if (nombre.length < 3) throw badRequest('Escribe tu nombre completo');
      if (!CORREO.test(correo)) throw badRequest('El correo no es válido');
      if (!/^\d{7,15}$/.test(telefono)) throw badRequest('El teléfono debe tener entre 7 y 15 dígitos');
      if (!password || password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
        throw badRequest('La contraseña debe tener al menos 8 caracteres, con letras y números');
      }
      const existente = await repos.clientes.buscarPorCorreo(correo);
      if (existente && existente.passwordHash) throw conflict('CORREO_REGISTRADO', 'Ya existe una cuenta con ese correo');
      const datos = { nombre, correo, telefono, direccion: direccion || '', ciudad: ciudad || '', passwordHash: await bcrypt.hash(password, 10) };
      // Un cliente que la tienda registró desde el panel (sin contraseña) activa su cuenta al registrarse
      const cliente = existente
        ? await repos.clientes.activarCuenta(existente.id, datos)
        : await repos.clientes.crear(datos);
      return { token: firmar({ sub: cliente.id, rol: 'cliente', nombre: cliente.nombre }), cliente: publicoCliente(cliente) };
    },

    async loginCliente({ correo, password }) {
      const c = correo && await repos.clientes.buscarPorCorreo(String(correo).trim());
      if (!c || !c.passwordHash || !password || !(await bcrypt.compare(password, c.passwordHash))) throw unauthorized('Correo o contraseña incorrectos');
      return { token: firmar({ sub: c.id, rol: 'cliente', nombre: c.nombre }), cliente: publicoCliente(c) };
    },

    async loginAdmin({ usuario, password }) {
      const a = usuario && await repos.admins.buscarPorUsuario(String(usuario).trim());
      if (!a || !a.passwordHash || !password || !(await bcrypt.compare(password, a.passwordHash))) throw unauthorized('Usuario o contraseña incorrectos');
      return { token: firmar({ sub: a.id, rol: 'admin', nombre: a.nombre }), admin: { id: a.id, nombre: a.nombre, usuario: a.usuario } };
    },

    async perfil(idCliente) {
      const c = await repos.clientes.buscarPorId(idCliente);
      if (!c) throw unauthorized();
      return publicoCliente(c);
    },

    verificar,
  };
}

module.exports = { createAuthService, firmar, verificar };
