// ── Estado global ──────────────────────────────────────────────
const state = {
  session: null,       // { rol: 'supervisora'|'ingeniero'|'lector', area, nombre, usuario }
  personal: [],
  fontSize: parseInt(localStorage.getItem('fontSize') || '16'),
  theme: localStorage.getItem('theme') || 'dark',
  registroHoy: [],
};

// ── Supabase client simple ──────────────────────────────────────
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

  return { select, insert, update };
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

// ── Login ──────────────────────────────────────────────────────
async function login() {
  const usuario = $('inputUsuario').value.trim();
  const pin = $('inputPin').value.trim();
  if (!usuario || !pin) { toast('Ingresa usuario y PIN', 'error'); return; }

  $('btnLogin').disabled = true;
  $('btnLogin').textContent = 'Verificando...';

  try {
    // Verificar supervisora
    const sups = await sb.select('supervisoras', `usuario=eq.${encodeURIComponent(usuario)}&pin=eq.${encodeURIComponent(pin)}&select=*`);
    if (sups.length > 0) {
      state.session = { rol: 'supervisora', area: sups[0].area, nombre: sups[0].nombre, usuario };
      await cargarPersonalArea(sups[0].area);
      renderRegistro();
      showScreen('screenRegistro');
      return;
    }

    // Verificar ingeniero
    const ings = await sb.select('ingenieros', `usuario=eq.${encodeURIComponent(usuario)}&pin=eq.${encodeURIComponent(pin)}&select=*`);
    if (ings.length > 0) {
      state.session = { rol: 'ingeniero', nombre: ings[0].nombre, usuario };
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
  const { area } = state.session;
  $('labelArea').textContent = area;

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
    const seleccionado = state.registroHoy.find(r => r.dni === p.dni);
    const div = document.createElement('div');
    div.className = `persona-item ${seleccionado ? 'seleccionado' : ''}`;
    div.innerHTML = `
      <div class="persona-info">
        <span class="persona-nombre">${p.nombre_corto}</span>
        <span class="persona-cargo">${p.cargo}</span>
      </div>
      <div class="persona-horas">
        ${seleccionado ? `
          <input type="number" class="input-horas" value="${seleccionado.horas}"
            min="0.5" max="12" step="0.5"
            onchange="actualizarHoras('${p.dni}', this.value)"
            onclick="event.stopPropagation()">
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

function actualizarHoras(dni, valor) {
  const r = state.registroHoy.find(r => r.dni === dni);
  if (r) r.horas = parseFloat(valor) || 2;
}

async function guardarRegistro() {
  if (state.registroHoy.length === 0) {
    toast('Selecciona al menos una persona', 'error');
    return;
  }

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

async function renderReportes() {
  await cargarReporte('dia');
}

async function cargarReporte(tipo) {
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
      fechaDesde = sel;
      fechaHasta = sel;
    } else if (tipo === 'semana') {
      const d = new Date(hoy);
      d.setDate(d.getDate() - 6);
      fechaDesde = d.toISOString().split('T')[0];
      fechaHasta = hoy.toISOString().split('T')[0];
    } else if (tipo === 'quincena') {
      const dia = hoy.getDate();
      if (dia <= 15) {
        fechaDesde = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`;
        fechaHasta = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-15`;
      } else {
        fechaDesde = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-16`;
        fechaHasta = hoy.toISOString().split('T')[0];
      }
    } else if (tipo === 'mes') {
      fechaDesde = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`;
      fechaHasta = hoy.toISOString().split('T')[0];
    }

    const filtroArea = state.session.rol === 'supervisora'
      ? `&area=eq.${encodeURIComponent(state.session.area)}`
      : '';

    const datos = await sb.select('horas_extras',
      `fecha=gte.${fechaDesde}&fecha=lte.${fechaHasta}${filtroArea}&select=*,personal(nombre_corto,cargo,area)&order=fecha.desc,area.asc`
    );

    reporteData = datos;
    renderTablaReporte(datos, tipo);
    renderRanking(datos);

  } catch (e) {
    toast('Error al cargar reporte', 'error');
    console.error(e);
  } finally {
    $('loadingReporte').style.display = 'none';
  }
}

function renderTablaReporte(datos, tipo) {
  const container = $('tablaReporte');

  if (datos.length === 0) {
    container.innerHTML = '<p class="empty-msg">Sin registros en este período</p>';
    return;
  }

  // Agrupar por área
  const porArea = {};
  datos.forEach(r => {
    if (!porArea[r.area]) porArea[r.area] = [];
    porArea[r.area].push(r);
  });

  let totalGeneral = 0;

  Object.entries(porArea).forEach(([area, registros]) => {
    const totalArea = registros.reduce((s, r) => s + parseFloat(r.horas), 0);
    totalGeneral += totalArea;

    const section = document.createElement('div');
    section.className = 'reporte-area';
    section.innerHTML = `
      <div class="reporte-area-header">
        <span class="reporte-area-nombre">${area}</span>
        <span class="reporte-area-total">${totalArea.toFixed(1)} hrs</span>
      </div>
      <table class="tabla">
        <thead>
          <tr>
            <th>Persona</th>
            ${tipo !== 'dia' ? '<th>Fecha</th>' : ''}
            <th>Horas</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          ${registros.map(r => `
            <tr>
              <td>${r.personal?.nombre_corto || r.dni}</td>
              ${tipo !== 'dia' ? `<td>${formatFecha(r.fecha)}</td>` : ''}
              <td class="horas-cell">${r.horas}</td>
              <td class="motivo-cell">${r.motivo}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    container.appendChild(section);
  });

  $('resumenReporte').innerHTML = `
    <div class="resumen-card">
      <span class="resumen-label">Total registros</span>
      <span class="resumen-valor">${datos.length}</span>
    </div>
    <div class="resumen-card">
      <span class="resumen-label">Total horas</span>
      <span class="resumen-valor">${totalGeneral.toFixed(1)}</span>
    </div>
    <div class="resumen-card">
      <span class="resumen-label">Áreas activas</span>
      <span class="resumen-valor">${Object.keys(porArea).length}</span>
    </div>
  `;
}

function renderRanking(datos) {
  const container = $('rankingReporte');
  if (!container) return;

  // Ranking por horas totales
  const porPersona = {};
  datos.forEach(r => {
    const key = r.dni;
    if (!porPersona[key]) porPersona[key] = {
      nombre: r.personal?.nombre_corto || r.dni,
      area: r.area,
      horas: 0,
      dias: new Set(),
    };
    porPersona[key].horas += parseFloat(r.horas);
    porPersona[key].dias.add(r.fecha);
  });

  const ranking = Object.values(porPersona)
    .sort((a, b) => b.horas - a.horas)
    .slice(0, 10);

  if (ranking.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <h3 class="ranking-titulo">Top 10 — Más horas extras</h3>
    <table class="tabla">
      <thead>
        <tr><th>#</th><th>Persona</th><th>Área</th><th>Horas</th><th>Días</th></tr>
      </thead>
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

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setTheme(state.theme);
  setFontSize(state.fontSize);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/horas-extras/sw.js');
  }

  // Botones globales
  $('btnTheme').addEventListener('click', () =>
    setTheme(state.theme === 'dark' ? 'light' : 'dark')
  );
  $('btnFontUp').addEventListener('click', () => setFontSize(state.fontSize + 1));
  $('btnFontDown').addEventListener('click', () => setFontSize(state.fontSize - 1));

  // Login
  $('btnLogin').addEventListener('click', login);
  $('btnLoginLector').addEventListener('click', loginLector);
  $('btnModoLector').addEventListener('click', () => {
    $('loginNormal').classList.toggle('hidden');
    $('loginLector').classList.toggle('hidden');
  });

  // Permitir Enter en login
  ['inputUsuario', 'inputPin'].forEach(id =>
    $(id).addEventListener('keydown', e => e.key === 'Enter' && login())
  );
  $('inputPinLector').addEventListener('keydown', e => e.key === 'Enter' && loginLector());

  // Registro
  $('inputBusqueda').addEventListener('input', renderListaPersonal);
  $('btnGuardar').addEventListener('click', guardarRegistro);
  $('btnLogoutRegistro').addEventListener('click', logout);
  $('btnVerReporte').addEventListener('click', async () => {
    await renderReportes();
    showScreen('screenReportes');
  });

  // Reportes
  $('btnLogoutReporte').addEventListener('click', logout);
  $('btnVolverRegistro').addEventListener('click', () => {
    if (state.session?.rol === 'supervisora') showScreen('screenRegistro');
    else logout();
  });

  $('tab-dia').addEventListener('click', () => cargarReporte('dia'));
  $('tab-semana').addEventListener('click', () => cargarReporte('semana'));
  $('tab-quincena').addEventListener('click', () => cargarReporte('quincena'));
  $('tab-mes').addEventListener('click', () => cargarReporte('mes'));
  $('inputFechaReporte').addEventListener('change', () => cargarReporte('dia'));

  // Selector de todos
  $('btnSeleccionarTodos').addEventListener('click', () => {
    const busqueda = $('inputBusqueda').value.toLowerCase();
    const visibles = state.personal.filter(p =>
      p.nombre_corto.toLowerCase().includes(busqueda) ||
      p.apellidos_nombres.toLowerCase().includes(busqueda)
    );
    const todosSeleccionados = visibles.every(p =>
      state.registroHoy.find(r => r.dni === p.dni)
    );
    if (todosSeleccionados) {
      visibles.forEach(p => {
        const idx = state.registroHoy.findIndex(r => r.dni === p.dni);
        if (idx >= 0) state.registroHoy.splice(idx, 1);
      });
    } else {
      visibles.forEach(p => {
        if (!state.registroHoy.find(r => r.dni === p.dni)) {
          state.registroHoy.push({ dni: p.dni, horas: 2 });
        }
      });
    }
    renderListaPersonal();
  });
});
