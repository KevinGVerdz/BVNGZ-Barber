// ==========================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================
const supabaseUrl = 'https://iewlbhuiqdqzusfwvpko.supabase.co';
const supabaseKey = 'sb_publishable_wQ0q5sibdsdaBpt9H-FZGg_61cWYPrQ'; 
// Renombrado a clienteSupabase para evitar choque con la librería global
const clienteSupabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// ==========================================
// ESTADO DE LA APLICACIÓN
// ==========================================
let currentUser = null; 
let userRole = 'client'; 
let activeBooking = null; 
let isRescheduling = false; 

const basePrice = 250;
const workHours = ['10:00', '11:00', '12:00', '13:00', '14:00', '16:00', '17:00', '18:00', '19:00'];

// ==========================================
// CONTROL DE VISTAS
// ==========================================
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
    
    if (viewId !== 'auth-section') {
        document.getElementById('nav-actions').classList.remove('hidden');
    }
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
            const hoy = new Date().toISOString().split('T')[0];
            document.getElementById('booking-date').value = hoy;
            await checkUserBooking();
            await renderTimeSlots(hoy);
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
// LÓGICA DE CLIENTE: CITAS
// ==========================================
async function checkUserBooking() {
    const { data, error } = await clienteSupabase
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
        infoDiv.innerHTML = `<h4 style="color:var(--accent-purple)">Próximo corte: ${activeBooking.fecha} a las ${activeBooking.hora}</h4>
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
    container.innerHTML = 'Cargando...';

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
    
    const accion = isRescheduling ? 'reagendar' : 'agendar';
    if (!confirm(`¿Seguro que deseas ${accion} para el ${date} a las ${time}?`)) return;

    if (isRescheduling) {
        await clienteSupabase.from('citas')
            .update({ fecha: date, hora: time, cambios_realizados: 1 })
            .eq('id', activeBooking.id);
        alert("Cita reagendada con éxito.");
    } else {
        await clienteSupabase.from('citas')
            .insert([{ user_id: currentUser.id, fecha: date, hora: time }]);
        alert("Cita agendada con éxito.");
    }
    
    await checkUserBooking();
    await renderTimeSlots(document.getElementById('booking-date').value);
}

document.getElementById('booking-date').addEventListener('change', (e) => {
    renderTimeSlots(e.target.value);
});

document.getElementById('btn-cancel').addEventListener('click', async () => {
    if(confirm("¿Seguro que deseas cancelar tu cita? Esta acción es definitiva.")) {
        await clienteSupabase.from('citas').update({ estado: 'cancelada' }).eq('id', activeBooking.id);
        await checkUserBooking();
        await renderTimeSlots(document.getElementById('booking-date').value);
    }
});

document.getElementById('btn-reschedule').addEventListener('click', () => {
    isRescheduling = true;
    alert("Selecciona un nuevo horario en el calendario de abajo.");
});

// ==========================================
// LÓGICA DEL MASTER (POS)
// ==========================================
async function loadAdminData(date) {
    const { data: citas } = await clienteSupabase
        .from('citas')
        .select(`id, hora, estado, usuarios(email)`)
        .eq('fecha', date)
        .eq('estado', 'activa');

    const select = document.getElementById('pos-client-select');
    select.innerHTML = '<option value="">Seleccionar cita para cobrar...</option>';

    if (citas) {
        citas.forEach(cita => {
            const option = document.createElement('option');
            option.value = cita.id;
            option.textContent = `${cita.hora} - ${cita.usuarios.email}`;
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
