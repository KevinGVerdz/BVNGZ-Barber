// ==========================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================
const supabaseUrl = 'https://iewlbhuiqdqzusfwvpko.supabase.co';
const supabaseKey = 'sb_publishable_wQ0q5sibdsdaBpt9H-FZGg_61cWYPrQ'; 
const clienteSupabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// ==========================================
// ESTADO DE LA APLICACIÓN
// ==========================================
let currentUser = null; 
let userRole = 'client'; 
let activeBooking = null; 
let isRescheduling = false; 

// Variables para el Calendario Visual
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let selectedDateStr = new Date().toISOString().split('T')[0];
const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const basePrice = 250;
const workHours = ['10:00', '11:00', '12:00', '13:00', '14:00', '16:00', '17:00', '18:00', '19:00'];

// ==========================================
// CONTROL DE VISTAS
// ==========================================
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
    if (viewId !== 'auth-section') document.getElementById('nav-actions').classList.remove('hidden');
}

// ==========================================
// AUTENTICACIÓN
// ==========================================
document.getElementById('btn-register').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if(!email || !password) return alert("Ingresa correo y contraseña.");

    const { data, error } = await clienteSupabase.auth.signUp({ email, password });
    if (error) return alert("Error: " + error.message);

    if (data.user) {
        const rol_asignado = email.includes('master') ? 'master' : 'client';
        await clienteSupabase.from('usuarios').insert([{ id: data.user.id, email: email, rol: rol_asignado }]);
        alert("Usuario creado. Ahora dale a Iniciar Sesión.");
    }
});

document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if(!email || !password) return alert("Ingresa correo y contraseña.");

    const { data, error } = await clienteSupabase.auth.signInWithPassword({ email, password });
    if (error) return alert("Error al iniciar sesión.");

    if (data.user) {
        currentUser = data.user;
        const { data: userData } = await clienteSupabase.from('usuarios').select('rol').eq('id', currentUser.id).single();
        userRole = userData?.rol || 'client';
        
        if (userRole === 'master') {
            switchView('admin-section');
            const hoy = new Date().toISOString().split('T')[0];
            document.getElementById('admin-date').value = hoy;
            loadAdminData(hoy);
        } else {
            switchView('client-section');
            await checkUserBooking();
            buildCalendar(currentMonth, currentYear); // Inicia el calendario
            renderTimeSlots(selectedDateStr);
        }
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await clienteSupabase.auth.signOut();
    currentUser = null; activeBooking = null;
    document.getElementById('nav-actions').classList.add('hidden');
    switchView('auth-section');
});

// ==========================================
// MOTOR DEL CALENDARIO VISUAL
// ==========================================
function buildCalendar(month, year) {
    const grid = document.getElementById('calendar-grid');
    const display = document.getElementById('month-year-display');
    grid.innerHTML = '';
    display.textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Configurar el "Hoy" eliminando las horas para poder comparar
    const today = new Date();
    today.setHours(0,0,0,0); 

    // Celdas vacías antes del primer día del mes
    for(let i = 0; i < firstDay; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'cal-day empty';
        grid.appendChild(emptyDiv);
    }

    // Días reales del mes
    for(let i = 1; i <= daysInMonth; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'cal-day';
        dayDiv.textContent = i;

        // Crear string YYYY-MM-DD
        const cellDate = new Date(year, month, i);
        const cellDateStr = cellDate.getFullYear() + "-" + String(cellDate.getMonth() + 1).padStart(2, '0') + "-" + String(cellDate.getDate()).padStart(2, '0');

        if (cellDate < today) {
            dayDiv.classList.add('past'); // Días pasados bloqueados
        } else {
            if(cellDateStr === selectedDateStr) dayDiv.classList.add('selected');

            dayDiv.addEventListener('click', () => {
                selectedDateStr = cellDateStr;
                document.getElementById('selected-date-text').textContent = `Horarios para: ${cellDateStr}`;
                buildCalendar(month, year); 
                renderTimeSlots(selectedDateStr);
            });
        }
        grid.appendChild(dayDiv);
    }
}

document.getElementById('prev-month').addEventListener('click', () => {
    currentMonth--;
    if(currentMonth < 0) { currentMonth = 11; currentYear--; }
    buildCalendar(currentMonth, currentYear);
});

document.getElementById('next-month').addEventListener('click', () => {
    currentMonth++;
    if(currentMonth > 11) { currentMonth = 0; currentYear++; }
    buildCalendar(currentMonth, currentYear);
});

// ==========================================
// LÓGICA DE CLIENTE: CITAS
// ==========================================
async function checkUserBooking() {
    const { data } = await clienteSupabase
        .from('citas')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('estado', 'activa')
        .maybeSingle(); 

    activeBooking = data || null;
    isRescheduling = false;

    const infoDiv = document.getElementById('current-booking-info');
    const actionsDiv = document.getElementById('booking-actions');
    const btnReschedule = document.getElementById('btn-reschedule');

    if (activeBooking) {
        infoDiv.innerHTML = `<h4 style="color:var(--accent-purple)">Próximo servicio: ${activeBooking.tipo_corte || 'Corte'}</h4>
                             <p class="text-main">${activeBooking.fecha} a las ${activeBooking.hora}</p>
                             <p class="text-muted">Cambios realizados: ${activeBooking.cambios_realizados}/1</p>`;
        actionsDiv.classList.remove('hidden');
        
        if (activeBooking.cambios_realizados >= 1) {
            btnReschedule.classList.add('hidden');
        } else {
            btnReschedule.classList.remove('hidden');
        }
    } else {
        infoDiv.innerHTML = `<p class="text-muted">No tienes citas activas.</p>`;
        actionsDiv.classList.add('hidden');
    }
}

async function renderTimeSlots(date) {
    const container = document.getElementById('time-slots');
    container.innerHTML = 'Cargando horarios...';

    const { data: citasOcupadas } = await clienteSupabase
        .from('citas')
        .select('hora')
        .eq('fecha', date)
        .neq('estado', 'cancelada');

    const horasOcupadas = citasOcupadas ? citasOcupadas.map(c => c.hora) : [];
    container.innerHTML = '';

    workHours.forEach(time => {
        const div = document.createElement('div');
        div.className = 'time-slot';
        div.textContent = time;
        
        if (horasOcupadas.includes(time)) {
            div.classList.add('booked');
        } else {
            div.addEventListener('click', () => handleBooking(date, time));
        }
        container.appendChild(div);
    });
}

async function handleBooking(date, time) {
    if (activeBooking && !isRescheduling) {
        return alert("Ya tienes una cita activa. Usa el botón de reagendar.");
    }
    
    const tipoCorte = document.getElementById('tipo-corte').value;
    const accion = isRescheduling ? 'reagendar' : 'agendar';
    
    if (!confirm(`¿Seguro que deseas ${accion} el servicio "${tipoCorte}" para el ${date} a las ${time}?`)) return;

    if (isRescheduling) {
        await clienteSupabase.from('citas')
            .update({ fecha: date, hora: time, tipo_corte: tipoCorte, cambios_realizados: 1 })
            .eq('id', activeBooking.id);
        alert("Cita reagendada con éxito.");
    } else {
        await clienteSupabase.from('citas')
            .insert([{ user_id: currentUser.id, fecha: date, hora: time, tipo_corte: tipoCorte }]);
        alert("Cita agendada con éxito.");
    }
    
    await checkUserBooking();
    await renderTimeSlots(selectedDateStr);
}

document.getElementById('btn-cancel').addEventListener('click', async () => {
    if(confirm("¿Seguro que deseas cancelar tu cita? Esta acción es definitiva.")) {
        await clienteSupabase.from('citas').update({ estado: 'cancelada' }).eq('id', activeBooking.id);
        await checkUserBooking();
        await renderTimeSlots(selectedDateStr);
    }
});

document.getElementById('btn-reschedule').addEventListener('click', () => {
    isRescheduling = true;
    alert("Selecciona una nueva fecha y horario en el calendario.");
});

// ==========================================
// LÓGICA DEL MASTER (POS)
// ==========================================
async function loadAdminData(date) {
    const { data: citas } = await clienteSupabase
        .from('citas')
        .select(`id, hora, estado, tipo_corte, usuarios(email)`)
        .eq('fecha', date)
        .eq('estado', 'activa');

    const select = document.getElementById('pos-client-select');
    select.innerHTML = '<option value="">Seleccionar cita para cobrar...</option>';

    if (citas) {
        citas.forEach(cita => {
            const option = document.createElement('option');
            option.value = cita.id;
            const servicio = cita.tipo_corte ? cita.tipo_corte : 'Clásico';
            option.textContent = `${cita.hora} - ${cita.usuarios.email} (${servicio})`;
            select.appendChild(option);
        });
    }
}

document.getElementById('admin-date').addEventListener('change', (e) => {
    loadAdminData(e.target.value);
});

function updatePOS() {
    let total = basePrice;
    if (document.getElementById('extra-pomada').checked) total += 150;
    if (document.getElementById('extra-aceite').checked) total += 100;
    document.getElementById('pos-total').textContent = total;
}
document.getElementById('extra-pomada').addEventListener('change', updatePOS);
document.getElementById('extra-aceite').addEventListener('change', updatePOS);

document.getElementById('btn-charge').addEventListener('click', async () => {
    const citaId = document.getElementById('pos-client-select').value;
    if(!citaId) return alert("Selecciona una cita.");
    
    const total = document.getElementById('pos-total').textContent;
    
    await clienteSupabase.from('transacciones').insert([{ cita_id: parseInt(citaId), monto: parseFloat(total) }]);
    await clienteSupabase.from('citas').update({ estado: 'completada' }).eq('id', citaId);
    
    alert(`Cobro de $${total} registrado con éxito.`);
    
    document.getElementById('extra-pomada').checked = false;
    document.getElementById('extra-aceite').checked = false;
    updatePOS();
    loadAdminData(document.getElementById('admin-date').value);
});
