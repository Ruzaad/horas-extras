// ── Estado global ──────────────────────────────────────────────
const state = {
  session: null,
  personal: [],
  fontSize: parseInt(localStorage.getItem('fontSize') || '16'),
  theme: localStorage.getItem('theme') || 'dark',
  registroHoy: [],
};

// ── Supabase client ────────────────────────────────────────────
const sb = (() => {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Content-Type': 'application/json',
  };

  async function select(table, params = '') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function insert(table, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function update(table, params, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function remove(table, params) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      method: 'DELETE',
      headers,
    });
    if (!r.ok) throw new Error(await r.text());
    return true;
  }

  return { select, insert, update, remove };
})();

// ── Helpers ────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function setTheme(t) {
  state.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
  $('btnTheme').textContent = t === 'dark' ? '☀️' : '🌙';
}

function setFontSize(size) {
  state.fontSize = Math.min(Math.max(size, 13), 22);
  document.documentElement.style.fontSize = state.fontSize + 'px';
  localStorage.setItem('fontSize', state.fontSize);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function toast(msg, tipo = 'ok') {
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function formatFecha(fecha) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function confirmar(msg) {
  return window.confirm(msg);
}

// ── Modal genérico ─────────────────────────────────────────────
function abrirModal(titulo, contenidoHTML, onConfirm) {
  $('modalTitulo').textContent = titulo;
  $('modalCuerpo').innerHTML = contenidoHTML;
  $('modalOverlay').classList.remove('hidden');
  $('btnModalConfirmar').onclick = () => {
    onConfirm();
  };
  $('btnModalCancelar').onclick = cerrarModal;
  $('modalOverlay').onclick = (e) => { if (e.target === $('modalOverlay')) cerrarModal(); };
}

function cerrarModal() {
  $('modalOverlay').classList.add('hidden');
}

// ── Login ──────────────────────────────────────────────────────
async function login() {
  const usuario = $('inputUsuario').value.trim();
  const pin = $('inputPin').value.trim();
  if (!usuario || !pin) { toast('Ingresa usuario y PIN', 'error'); return; }

  $('btnLogin').disabled = true;
  $('btnLogin').textContent = 'Verificando...';

  try {
    const sups = await sb.select('supervisoras', `usuario=eq.${encodeURIComponent(usuario)}&pin=eq.${encodeURIComponent(pin)}&select=*`);
    if (sups.length > 0) {
      state.session = { rol: 'supervisora', area: sups[0].area, nombre: sups[0].nombre, usuario };
      await cargarPersonalArea(sups[0].area);
      renderRegistro();
      showScreen('screenRegistro');
      return;
    }

    const ings = await sb.select('ingenieros', `usuario=eq.${encodeURIComponent(usuario)}&pin=eq.${encodeURIComponent(pin)}&select=*`);
    if (ings.length > 0) {
      state.session = {
        rol: ings[0].es_admin ? 'admin' : 'ingeniero',
        nombre: ings[0].nombre,
        usuario,
        es_admin: ings[0].es_admin
      };
      await renderReportes();
      showScreen('screenReportes');
      return;
    }

    toast('Usuario o PIN incorrecto', 'error');
  } catch (e) {
    toast('Error de conexión', 'error');
    console.error(e);
  } finally {
    $('btnLogin').disabled = false;
    $('btnLogin').textContent = 'Ingresar';
  }
}

async function loginLector() {
  const pin = $('inputPinLector').value.trim();
  if (!pin) { toast('Ingresa el PIN', 'error'); return; }

  try {
    const cfg = await sb.select('config', `clave=eq.pin_lectores`);
    if (cfg.length > 0 && cfg[0].valor === pin) {
      state.session = { rol: 'lector' };
      await renderReportes();
      showScreen('screenReportes');
    } else {
      toast('PIN incorrecto', 'error');
    }
  } catch (e) {
    toast('Error de conexión', 'error');
  }
}

function logout() {
  state.session = null;
  state.personal = [];
  state.registroHoy = [];
  $('inputUsuario').value = '';
  $('inputPin').value = '';
  $('inputPinLector').value = '';
  showScreen('screenLogin');
}

// ── Registro ───────────────────────────────────────────────────
async function cargarPersonalArea(area) {
  state.personal = await sb.select('personal', `area=eq.${encodeURIComponent(area)}&order=nombre_corto.asc&select=*`);
}

function renderRegistro() {
  $('labelArea').textContent = state.session.area;
  const hoy = new Date().toISOString().split('T')[0];
  $('inputFecha').value = hoy;
  $('inputFecha').max = hoy;
  renderListaPersonal();
}

function renderListaPersonal() {
  const busqueda = $('inputBusqueda').value.toLowerCase();
  const lista = state.personal.filter(p =>
    p.nombre_corto.toLowerCase().includes(busqueda) ||
    p.apellidos_nombres.toLowerCase().includes(busqueda)
  );

  const container = $('listaPersonal');
  container.innerHTML = '';

  lista.forEach(p => {
    const sel = state.registroHoy.find(r => r.dni === p.dni);
    const div = document.createElement('div');
    div.className = `persona-item ${sel ? 'seleccionado' : ''}`;
    div.innerHTML = `
      <div class="persona-info">
        <span class="persona-nombre">${p.nombre_corto}</span>
        <span class="persona-cargo">${p.cargo}</span>
      </div>
      <div class="persona-horas" onclick="event.stopPropagation()">
        ${sel ? `
          <button class="btn-hora" onclick="cambiarHoras('${p.dni}', -1)">−</button>
          <span class="horas-valor">${sel.horas}h</span>
          <button class="btn-hora" onclick="cambiarHoras('${p.dni}', 1)">+</button>
          <span class="check-icon">✓</span>
        ` : '<span class="plus-icon">+</span>'}
      </div>
    `;
    div.addEventListener('click', () => togglePersona(p.dni));
    container.appendChild(div);
  });

  $('contadorSeleccionados').textContent = state.registroHoy.length;
}

function togglePersona(dni) {
  const idx = state.registroHoy.findIndex(r => r.dni === dni);
  if (idx >= 0) {
    state.registroHoy.splice(idx, 1);
  } else {
    state.registroHoy.push({ dni, horas: 2 });
  }
  renderListaPersonal();
}

function cambiarHoras(dni, delta) {
  const r = state.registroHoy.find(r => r.dni === dni);
  if (r) {
    r.horas = Math.min(Math.max((r.horas || 2) + delta, 1), 12);
    renderListaPersonal();
  }
}

async function guardarRegistro() {
  if (state.registroHoy.length === 0) { toast('Selecciona al menos una persona', 'error'); return; }
  const motivo = $('inputMotivo').value.trim();
  if (!motivo) { toast('Ingresa el motivo', 'error'); return; }
  const fecha = $('inputFecha').value;
  if (!fecha) { toast('Selecciona la fecha', 'error'); return; }

  $('btnGuardar').disabled = true;
  $('btnGuardar').textContent = 'Guardando...';

  try {
    const registros = state.registroHoy.map(r => ({
      dni: r.dni,
      area: state.session.area,
      fecha,
      horas: r.horas,
      motivo,
      registrado_por: state.session.usuario,
      costo_hora: null,
      anulado: false,
    }));
    await sb.insert('horas_extras', registros);
    toast(`${registros.length} registro(s) guardados`, 'ok');
    state.registroHoy = [];
    $('inputMotivo').value = '';
    renderListaPersonal();
  } catch (e) {
    toast('Error al guardar', 'error');
    console.error(e);
  } finally {
    $('btnGuardar').disabled = false;
    $('btnGuardar').textContent = 'Guardar registro';
  }
}

// ── Reportes ───────────────────────────────────────────────────
let reporteData = [];
let reporteTipo = 'dia';

async function renderReportes() {
  // Mostrar/ocultar botón admin
  const btnAdmin = $('btnAdmin');
  if (state.session?.es_admin) {
    btnAdmin.classList.remove('hidden');
  } else {
    btnAdmin.classList.add('hidden');
  }
  await cargarReporte('dia');
}

async function cargarReporte(tipo) {
  reporteTipo = tipo;
  $('loadingReporte').style.display = 'block';
  $('tablaReporte').innerHTML = '';
  $('resumenReporte').innerHTML = '';

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  $(`tab-${tipo}`).classList.add('active');

  try {
    const hoy = new Date();
    let fechaDesde, fechaHasta;

    if (tipo === 'dia') {
      const sel = $('inputFechaReporte').value || hoy.toISOString().split('T')[0];
      fechaDesde = fechaHasta = sel;
    } else if (tipo === 'semana') {
      const d = new Date(hoy); d.setDate(d.getDate() - 6);
      fechaDesde = d.toISOString().split('T')[0];
      fechaHasta = hoy.toISOString().split('T')[0];
    } else if (tipo === 'quincena') {
      const dia = hoy.getDate();
      const mes = String(hoy.getMonth() + 1).padStart(2, '0');
      const anio = hoy.getFullYear();
      fechaDesde = dia <= 15 ? `${anio}-${mes}-01` : `${anio}-${mes}-16`;
      fechaHasta = dia <= 15 ? `${anio}-${mes}-15` : hoy.toISOString().split('T')[0];
    } else if (tipo === 'mes') {
      const mes = String(hoy.getMonth() + 1).padStart(2, '0');
      fechaDesde = `${hoy.getFullYear()}-${mes}-01`;
      fechaHasta = hoy.toISOString().split('T')[0];
    }

    const filtroArea = state.session.rol === 'supervisora'
      ? `&area=eq.${encodeURIComponent(state.session.area)}` : '';

    const datos = await sb.select('horas_extras',
      `fecha=gte.${fechaDesde}&fecha=lte.${fechaHasta}${filtroArea}&anulado=eq.false&select=*,personal(nombre_corto,cargo,area)&order=fecha.desc,area.asc`
    );

    reporteData = datos;
    renderResumen(datos);
    renderTablaReporte(datos, tipo);
    renderRanking(datos);
  } catch (e) {
    toast('Error al cargar reporte', 'error');
    console.error(e);
  } finally {
    $('loadingReporte').style.display = 'none';
  }
}

function renderResumen(datos) {
  const porArea = {};
  datos.forEach(r => {
    if (!porArea[r.area]) porArea[r.area] = 0;
    porArea[r.area] += parseFloat(r.horas);
  });
  const totalHoras = datos.reduce((s, r) => s + parseFloat(r.horas), 0);

  $('resumenReporte').innerHTML = `
    <div class="resumen-card">
      <span class="resumen-label">Registros</span>
      <span class="resumen-valor">${datos.length}</span>
    </div>
    <div class="resumen-card">
      <span class="resumen-label">Total horas</span>
      <span class="resumen-valor">${totalHoras.toFixed(1)}</span>
    </div>
    <div class="resumen-card">
      <span class="resumen-label">Áreas activas</span>
      <span class="resumen-valor">${Object.keys(porArea).length}</span>
    </div>
  `;
}

function renderTablaReporte(datos, tipo) {
  const container = $('tablaReporte');
  if (datos.length === 0) {
    container.innerHTML = '<p class="empty-msg">Sin registros en este período</p>';
    return;
  }

  const porArea = {};
  datos.forEach(r => {
    if (!porArea[r.area]) porArea[r.area] = [];
    porArea[r.area].push(r);
  });

  container.innerHTML = '';

  Object.entries(porArea).forEach(([area, registros]) => {
    const totalArea = registros.reduce((s, r) => s + parseFloat(r.horas), 0);
    const esAdmin = state.session?.es_admin;

    const section = document.createElement('div');
    section.className = 'reporte-area';
    section.innerHTML = `
      <div class="reporte-area-header" onclick="toggleArea(this)">
        <div class="area-header-left">
          <span class="area-toggle-icon">▼</span>
          <span class="reporte-area-nombre">${area}</span>
        </div>
        <span class="reporte-area-total">${totalArea.toFixed(1)} hrs</span>
      </div>
      <div class="area-detalle">
        <table class="tabla">
          <thead>
            <tr>
              <th>Persona</th>
              ${tipo !== 'dia' ? '<th>Fecha</th>' : ''}
              <th>Horas</th>
              <th>Motivo</th>
              ${esAdmin ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${registros.map(r => `
              <tr>
                <td>${r.personal?.nombre_corto || r.dni}</td>
                ${tipo !== 'dia' ? `<td>${formatFecha(r.fecha)}</td>` : ''}
                <td class="horas-cell">${r.horas}</td>
                <td class="motivo-cell">${r.motivo}</td>
                ${esAdmin ? `<td><button class="btn-anular" onclick="anularRegistro(${r.id})">Anular</button></td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    container.appendChild(section);
  });
}

function toggleArea(header) {
  const detalle = header.nextElementSibling;
  const icon = header.querySelector('.area-toggle-icon');
  const abierto = !detalle.classList.contains('colapsado');
  detalle.classList.toggle('colapsado', abierto);
  icon.textContent = abierto ? '▶' : '▼';
}

async function anularRegistro(id) {
  if (!confirmar('¿Anular este registro? No aparecerá en reportes pero quedará en la base de datos.')) return;
  try {
    await sb.update('horas_extras', `id=eq.${id}`, { anulado: true });
    toast('Registro anulado', 'ok');
    await cargarReporte(reporteTipo);
  } catch (e) {
    toast('Error al anular', 'error');
  }
}

function renderRanking(datos) {
  const container = $('rankingReporte');
  if (!container) return;

  const porPersona = {};
  datos.forEach(r => {
    if (!porPersona[r.dni]) porPersona[r.dni] = {
      nombre: r.personal?.nombre_corto || r.dni,
      area: r.area, horas: 0, dias: new Set(),
    };
    porPersona[r.dni].horas += parseFloat(r.horas);
    porPersona[r.dni].dias.add(r.fecha);
  });

  const ranking = Object.values(porPersona).sort((a, b) => b.horas - a.horas).slice(0, 10);
  if (ranking.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <h3 class="ranking-titulo">Top 10 — Más horas extras</h3>
    <table class="tabla">
      <thead><tr><th>#</th><th>Persona</th><th>Área</th><th>Horas</th><th>Días</th></tr></thead>
      <tbody>
        ${ranking.map((p, i) => `
          <tr>
            <td class="rank-num">${i + 1}</td>
            <td>${p.nombre}</td>
            <td>${p.area}</td>
            <td class="horas-cell">${p.horas.toFixed(1)}</td>
            <td>${p.dias.size}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ── Admin CRUD ─────────────────────────────────────────────────
async function showAdmin() {
  showScreen('screenAdmin');
  await cargarTablaAdmin('personal');
}

let adminTabla = 'personal';

async function cargarTablaAdmin(tabla) {
  adminTabla = tabla;
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  $(`adminTab-${tabla}`).classList.add('active');
  $('adminContenido').innerHTML = '<p class="loading-msg">Cargando...</p>';

  try {
    if (tabla === 'personal') await renderAdminPersonal();
    else if (tabla === 'supervisoras') await renderAdminSupervisoras();
    else if (tabla === 'ingenieros') await renderAdminIngenieros();
    else if (tabla === 'areas') await renderAdminAreas();
    else if (tabla === 'config') await renderAdminConfig();
  } catch (e) {
    $('adminContenido').innerHTML = '<p class="empty-msg">Error al cargar</p>';
  }
}

// ── Admin: Personal ────────────────────────────────────────────
async function renderAdminPersonal() {
  const data = await sb.select('personal', 'order=area.asc,nombre_corto.asc&select=*');
  const areas = await sb.select('areas', 'order=nombre.asc');

  $('adminContenido').innerHTML = `
    <div class="admin-toolbar">
      <button class="btn-admin-nuevo" onclick="modalNuevoPersonal()">+ Nuevo</button>
    </div>
    <div class="admin-table-wrap">
      <table class="tabla">
        <thead><tr><th>Nombre corto</th><th>Apellidos y nombres</th><th>DNI</th><th>Área</th><th>Cargo</th><th></th></tr></thead>
        <tbody>
          ${data.map(p => `
            <tr>
              <td>${p.nombre_corto}</td>
              <td class="motivo-cell">${p.apellidos_nombres}</td>
              <td>${p.dni}</td>
              <td>${p.area}</td>
              <td class="motivo-cell">${p.cargo}</td>
              <td class="td-acciones">
                <button class="btn-editar" onclick='modalEditarPersonal(${JSON.stringify(p)})'>✏️</button>
                <button class="btn-anular" onclick="eliminarPersonal('${p.dni}')">🗑</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function modalNuevoPersonal() {
  const html = `
    <div class="form-group"><label class="form-label">Apellidos y nombres</label>
      <input class="form-input" id="mApellidos" placeholder="LOPEZ, JUAN"></div>
    <div class="form-group"><label class="form-label">Nombre corto</label>
      <input class="form-input" id="mNombreCorto" placeholder="LOPEZ JUAN"></div>
    <div class="form-group"><label class="form-label">DNI</label>
      <input class="form-input" id="mDni" placeholder="12345678" inputmode="numeric"></div>
    <div class="form-group"><label class="form-label">Área</label>
      <select class="form-input" id="mArea">
        <option value="Corte">Corte</option><option value="Camisa">Camisa</option>
        <option value="Pantalon">Pantalon</option><option value="Saco">Saco</option>
        <option value="Acabado">Acabado</option><option value="Reproceso">Reproceso</option>
      </select></div>
    <div class="form-group"><label class="form-label">Cargo</label>
      <input class="form-input" id="mCargo" placeholder="COSTURERA"></div>
  `;
  abrirModal('Nuevo personal', html, async () => {
    const body = {
      apellidos_nombres: $('mApellidos').value.trim().toUpperCase(),
      nombre_corto: $('mNombreCorto').value.trim().toUpperCase(),
      dni: $('mDni').value.trim(),
      area: $('mArea').value,
      cargo: $('mCargo').value.trim().toUpperCase(),
    };
    if (!body.dni || !body.apellidos_nombres) { toast('DNI y apellidos son obligatorios', 'error'); return; }
    try {
      await sb.insert('personal', body);
      toast('Personal agregado', 'ok');
      cerrarModal();
      await renderAdminPersonal();
    } catch (e) { toast('Error al guardar', 'error'); }
  });
}

function modalEditarPersonal(p) {
  const html = `
    <div class="form-group"><label class="form-label">Apellidos y nombres</label>
      <input class="form-input" id="mApellidos" value="${p.apellidos_nombres}"></div>
    <div class="form-group"><label class="form-label">Nombre corto</label>
      <input class="form-input" id="mNombreCorto" value="${p.nombre_corto}"></div>
    <div class="form-group"><label class="form-label">DNI</label>
      <input class="form-input" id="mDni" value="${p.dni}" readonly style="opacity:0.6"></div>
    <div class="form-group"><label class="form-label">Área</label>
      <select class="form-input" id="mArea">
        ${['Corte','Camisa','Pantalon','Saco','Acabado','Reproceso'].map(a =>
          `<option value="${a}" ${a === p.area ? 'selected' : ''}>${a}</option>`
        ).join('')}
      </select></div>
    <div class="form-group"><label class="form-label">Cargo</label>
      <input class="form-input" id="mCargo" value="${p.cargo}"></div>
  `;
  abrirModal('Editar personal', html, async () => {
    const body = {
      apellidos_nombres: $('mApellidos').value.trim().toUpperCase(),
      nombre_corto: $('mNombreCorto').value.trim().toUpperCase(),
      area: $('mArea').value,
      cargo: $('mCargo').value.trim().toUpperCase(),
    };
    try {
      await sb.update('personal', `dni=eq.${p.dni}`, body);
      toast('Personal actualizado', 'ok');
      cerrarModal();
      await renderAdminPersonal();
    } catch (e) { toast('Error al actualizar', 'error'); }
  });
}

async function eliminarPersonal(dni) {
  if (!confirmar('¿Eliminar esta persona del padrón? Esta acción no se puede deshacer.')) return;
  try {
    await sb.remove('personal', `dni=eq.${dni}`);
    toast('Personal eliminado', 'ok');
    await renderAdminPersonal();
  } catch (e) { toast('Error al eliminar', 'error'); }
}

// ── Admin: Supervisoras ────────────────────────────────────────
async function renderAdminSupervisoras() {
  const data = await sb.select('supervisoras', 'order=area.asc&select=*');
  $('adminContenido').innerHTML = `
    <div class="admin-toolbar">
      <button class="btn-admin-nuevo" onclick="modalNuevaSupervisora()">+ Nueva</button>
    </div>
    <div class="admin-table-wrap">
      <table class="tabla">
        <thead><tr><th>Nombre</th><th>Área</th><th>Usuario</th><th></th></tr></thead>
        <tbody>
          ${data.map(s => `
            <tr>
              <td>${s.nombre}</td><td>${s.area}</td><td>${s.usuario}</td>
              <td class="td-acciones">
                <button class="btn-editar" onclick='modalEditarSupervisora(${JSON.stringify(s)})'>✏️</button>
                <button class="btn-anular" onclick="eliminarSupervisora(${s.id})">🗑</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function modalNuevaSupervisora() {
  const html = `
    <div class="form-group"><label class="form-label">Nombre</label>
      <input class="form-input" id="mNombre" placeholder="Supervisora Corte"></div>
    <div class="form-group"><label class="form-label">Área</label>
      <select class="form-input" id="mArea">
        ${['Corte','Camisa','Pantalon','Saco','Acabado','Reproceso'].map(a =>
          `<option value="${a}">${a}</option>`).join('')}
      </select></div>
    <div class="form-group"><label class="form-label">Usuario</label>
      <input class="form-input" id="mUsuario" placeholder="supervisora.corte" autocapitalize="none"></div>
    <div class="form-group"><label class="form-label">PIN</label>
      <input class="form-input" id="mPin" type="password" inputmode="numeric" placeholder="••••"></div>
  `;
  abrirModal('Nueva supervisora', html, async () => {
    const body = {
      nombre: $('mNombre').value.trim(),
      area: $('mArea').value,
      usuario: $('mUsuario').value.trim(),
      pin: $('mPin').value.trim(),
    };
    if (!body.usuario || !body.pin) { toast('Usuario y PIN son obligatorios', 'error'); return; }
    try {
      await sb.insert('supervisoras', body);
      toast('Supervisora agregada', 'ok');
      cerrarModal();
      await renderAdminSupervisoras();
    } catch (e) { toast('Error al guardar', 'error'); }
  });
}

function modalEditarSupervisora(s) {
  const html = `
    <div class="form-group"><label class="form-label">Nombre</label>
      <input class="form-input" id="mNombre" value="${s.nombre}"></div>
    <div class="form-group"><label class="form-label">Área</label>
      <select class="form-input" id="mArea">
        ${['Corte','Camisa','Pantalon','Saco','Acabado','Reproceso'].map(a =>
          `<option value="${a}" ${a === s.area ? 'selected' : ''}>${a}</option>`).join('')}
      </select></div>
    <div class="form-group"><label class="form-label">Usuario</label>
      <input class="form-input" id="mUsuario" value="${s.usuario}" autocapitalize="none"></div>
    <div class="form-group"><label class="form-label">Nuevo PIN (dejar vacío para no cambiar)</label>
      <input class="form-input" id="mPin" type="password" inputmode="numeric" placeholder="••••"></div>
  `;
  abrirModal('Editar supervisora', html, async () => {
    const body = {
      nombre: $('mNombre').value.trim(),
      area: $('mArea').value,
      usuario: $('mUsuario').value.trim(),
    };
    const pin = $('mPin').value.trim();
    if (pin) body.pin = pin;
    try {
      await sb.update('supervisoras', `id=eq.${s.id}`, body);
      toast('Supervisora actualizada', 'ok');
      cerrarModal();
      await renderAdminSupervisoras();
    } catch (e) { toast('Error al actualizar', 'error'); }
  });
}

async function eliminarSupervisora(id) {
  if (!confirmar('¿Eliminar esta supervisora?')) return;
  try {
    await sb.remove('supervisoras', `id=eq.${id}`);
    toast('Supervisora eliminada', 'ok');
    await renderAdminSupervisoras();
  } catch (e) { toast('Error al eliminar', 'error'); }
}

// ── Admin: Ingenieros ──────────────────────────────────────────
async function renderAdminIngenieros() {
  const data = await sb.select('ingenieros', 'order=nombre.asc&select=*');
  $('adminContenido').innerHTML = `
    <div class="admin-toolbar">
      <button class="btn-admin-nuevo" onclick="modalNuevoIngeniero()">+ Nuevo</button>
    </div>
    <div class="admin-table-wrap">
      <table class="tabla">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Admin</th><th></th></tr></thead>
        <tbody>
          ${data.map(i => `
            <tr>
              <td>${i.nombre}</td><td>${i.usuario}</td>
              <td>${i.es_admin ? '✅' : '—'}</td>
              <td class="td-acciones">
                <button class="btn-editar" onclick='modalEditarIngeniero(${JSON.stringify(i)})'>✏️</button>
                <button class="btn-anular" onclick="eliminarIngeniero(${i.id})">🗑</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function modalNuevoIngeniero() {
  const html = `
    <div class="form-group"><label class="form-label">Nombre</label>
      <input class="form-input" id="mNombre" placeholder="Ingeniero Producción"></div>
    <div class="form-group"><label class="form-label">Usuario</label>
      <input class="form-input" id="mUsuario" placeholder="ingeniero1" autocapitalize="none"></div>
    <div class="form-group"><label class="form-label">PIN</label>
      <input class="form-input" id="mPin" type="password" inputmode="numeric" placeholder="••••"></div>
    <div class="form-group" style="display:flex;align-items:center;gap:10px;">
      <input type="checkbox" id="mAdmin" style="width:20px;height:20px;">
      <label class="form-label" style="margin:0">Es administrador</label>
    </div>
  `;
  abrirModal('Nuevo ingeniero', html, async () => {
    const body = {
      nombre: $('mNombre').value.trim(),
      usuario: $('mUsuario').value.trim(),
      pin: $('mPin').value.trim(),
      es_admin: $('mAdmin').checked,
    };
    if (!body.usuario || !body.pin) { toast('Usuario y PIN son obligatorios', 'error'); return; }
    try {
      await sb.insert('ingenieros', body);
      toast('Ingeniero agregado', 'ok');
      cerrarModal();
      await renderAdminIngenieros();
    } catch (e) { toast('Error al guardar', 'error'); }
  });
}

function modalEditarIngeniero(ing) {
  const html = `
    <div class="form-group"><label class="form-label">Nombre</label>
      <input class="form-input" id="mNombre" value="${ing.nombre}"></div>
    <div class="form-group"><label class="form-label">Usuario</label>
      <input class="form-input" id="mUsuario" value="${ing.usuario}" autocapitalize="none"></div>
    <div class="form-group"><label class="form-label">Nuevo PIN (dejar vacío para no cambiar)</label>
      <input class="form-input" id="mPin" type="password" inputmode="numeric" placeholder="••••"></div>
    <div class="form-group" style="display:flex;align-items:center;gap:10px;">
      <input type="checkbox" id="mAdmin" style="width:20px;height:20px;" ${ing.es_admin ? 'checked' : ''}>
      <label class="form-label" style="margin:0">Es administrador</label>
    </div>
  `;
  abrirModal('Editar ingeniero', html, async () => {
    const body = {
      nombre: $('mNombre').value.trim(),
      usuario: $('mUsuario').value.trim(),
      es_admin: $('mAdmin').checked,
    };
    const pin = $('mPin').value.trim();
    if (pin) body.pin = pin;
    try {
      await sb.update('ingenieros', `id=eq.${ing.id}`, body);
      toast('Ingeniero actualizado', 'ok');
      cerrarModal();
      await renderAdminIngenieros();
    } catch (e) { toast('Error al actualizar', 'error'); }
  });
}

async function eliminarIngeniero(id) {
  if (!confirmar('¿Eliminar este ingeniero?')) return;
  try {
    await sb.remove('ingenieros', `id=eq.${id}`);
    toast('Ingeniero eliminado', 'ok');
    await renderAdminIngenieros();
  } catch (e) { toast('Error al eliminar', 'error'); }
}

// ── Admin: Áreas ───────────────────────────────────────────────
async function renderAdminAreas() {
  const data = await sb.select('areas', 'order=nombre.asc&select=*');
  $('adminContenido').innerHTML = `
    <div class="admin-toolbar">
      <button class="btn-admin-nuevo" onclick="modalNuevaArea()">+ Nueva área</button>
    </div>
    <div class="admin-table-wrap">
      <table class="tabla">
        <thead><tr><th>Nombre del área</th><th></th></tr></thead>
        <tbody>
          ${data.map(a => `
            <tr>
              <td>${a.nombre}</td>
              <td class="td-acciones">
                <button class="btn-editar" onclick='modalEditarArea(${JSON.stringify(a)})'>✏️</button>
                <button class="btn-anular" onclick="eliminarArea(${a.id})">🗑</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function modalNuevaArea() {
  const html = `
    <div class="form-group"><label class="form-label">Nombre del área</label>
      <input class="form-input" id="mNombre" placeholder="Ej: Bordado"></div>
  `;
  abrirModal('Nueva área', html, async () => {
    const nombre = $('mNombre').value.trim();
    if (!nombre) { toast('Ingresa un nombre', 'error'); return; }
    try {
      await sb.insert('areas', { nombre });
      toast('Área agregada', 'ok');
      cerrarModal();
      await renderAdminAreas();
    } catch (e) { toast('Error al guardar', 'error'); }
  });
}

function modalEditarArea(a) {
  const html = `
    <div class="form-group"><label class="form-label">Nombre del área</label>
      <input class="form-input" id="mNombre" value="${a.nombre}"></div>
  `;
  abrirModal('Editar área', html, async () => {
    const nombre = $('mNombre').value.trim();
    if (!nombre) { toast('Ingresa un nombre', 'error'); return; }
    try {
      await sb.update('areas', `id=eq.${a.id}`, { nombre });
      toast('Área actualizada', 'ok');
      cerrarModal();
      await renderAdminAreas();
    } catch (e) { toast('Error al actualizar', 'error'); }
  });
}

async function eliminarArea(id) {
  if (!confirmar('¿Eliminar esta área? Asegúrate de que no tenga personal asignado.')) return;
  try {
    await sb.remove('areas', `id=eq.${id}`);
    toast('Área eliminada', 'ok');
    await renderAdminAreas();
  } catch (e) { toast('No se puede eliminar: tiene personal o registros asociados', 'error'); }
}

// ── Admin: Config ──────────────────────────────────────────────
async function renderAdminConfig() {
  const data = await sb.select('config', 'select=*');
  $('adminContenido').innerHTML = `
    <div class="admin-table-wrap">
      <table class="tabla">
        <thead><tr><th>Clave</th><th>Valor</th><th></th></tr></thead>
        <tbody>
          ${data.map(c => `
            <tr>
              <td>${c.clave}</td>
              <td>${c.clave.includes('pin') ? '••••' : c.valor}</td>
              <td class="td-acciones">
                <button class="btn-editar" onclick='modalEditarConfig(${JSON.stringify(c)})'>✏️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function modalEditarConfig(c) {
  const html = `
    <div class="form-group"><label class="form-label">${c.clave}</label>
      <input class="form-input" id="mValor" type="${c.clave.includes('pin') ? 'password' : 'text'}"
        inputmode="${c.clave.includes('pin') ? 'numeric' : 'text'}"
        placeholder="Nuevo valor"></div>
  `;
  abrirModal('Editar configuración', html, async () => {
    const valor = $('mValor').value.trim();
    if (!valor) { toast('Ingresa un valor', 'error'); return; }
    try {
      await sb.update('config', `clave=eq.${c.clave}`, { valor });
      toast('Configuración actualizada', 'ok');
      cerrarModal();
      await renderAdminConfig();
    } catch (e) { toast('Error al actualizar', 'error'); }
  });
}

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setTheme(state.theme);
  setFontSize(state.fontSize);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/horas-extras/sw.js');
  }

  $('btnTheme').addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
  $('btnFontUp').addEventListener('click', () => setFontSize(state.fontSize + 1));
  $('btnFontDown').addEventListener('click', () => setFontSize(state.fontSize - 1));

  $('btnLogin').addEventListener('click', login);
  $('btnLoginLector').addEventListener('click', loginLector);
  $('btnModoLector').addEventListener('click', () => {
    $('loginNormal').classList.toggle('hidden');
    $('loginLector').classList.toggle('hidden');
  });

  ['inputUsuario', 'inputPin'].forEach(id =>
    $(id).addEventListener('keydown', e => e.key === 'Enter' && login())
  );
  $('inputPinLector').addEventListener('keydown', e => e.key === 'Enter' && loginLector());

  $('inputBusqueda').addEventListener('input', renderListaPersonal);
  $('btnGuardar').addEventListener('click', guardarRegistro);
  $('btnLogoutRegistro').addEventListener('click', logout);
  $('btnVerReporte').addEventListener('click', async () => {
    await renderReportes();
    showScreen('screenReportes');
  });

  $('btnLogoutReporte').addEventListener('click', logout);
  $('btnVolverRegistro').addEventListener('click', () => {
    if (state.session?.rol === 'supervisora') showScreen('screenRegistro');
    else logout();
  });
  $('btnAdmin').addEventListener('click', showAdmin);
  $('btnVolverAdmin').addEventListener('click', () => showScreen('screenReportes'));
  $('btnLogoutAdmin').addEventListener('click', logout);

  $('adminTab-personal').addEventListener('click', () => cargarTablaAdmin('personal'));
  $('adminTab-supervisoras').addEventListener('click', () => cargarTablaAdmin('supervisoras'));
  $('adminTab-ingenieros').addEventListener('click', () => cargarTablaAdmin('ingenieros'));
  $('adminTab-areas').addEventListener('click', () => cargarTablaAdmin('areas'));
  $('adminTab-config').addEventListener('click', () => cargarTablaAdmin('config'));

  $('tab-dia').addEventListener('click', () => cargarReporte('dia'));
  $('tab-semana').addEventListener('click', () => cargarReporte('semana'));
  $('tab-quincena').addEventListener('click', () => cargarReporte('quincena'));
  $('tab-mes').addEventListener('click', () => cargarReporte('mes'));
  $('inputFechaReporte').addEventListener('change', () => cargarReporte('dia'));

  $('btnSeleccionarTodos').addEventListener('click', () => {
    const busqueda = $('inputBusqueda').value.toLowerCase();
    const visibles = state.personal.filter(p =>
      p.nombre_corto.toLowerCase().includes(busqueda) ||
      p.apellidos_nombres.toLowerCase().includes(busqueda)
    );
    const todosSeleccionados = visibles.every(p => state.registroHoy.find(r => r.dni === p.dni));
    if (todosSeleccionados) {
      visibles.forEach(p => {
        const idx = state.registroHoy.findIndex(r => r.dni === p.dni);
        if (idx >= 0) state.registroHoy.splice(idx, 1);
      });
    } else {
      visibles.forEach(p => {
        if (!state.registroHoy.find(r => r.dni === p.dni))
          state.registroHoy.push({ dni: p.dni, horas: 2 });
      });
    }
    renderListaPersonal();
  });
});
