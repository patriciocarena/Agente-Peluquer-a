// ==========================================================================
// FONO LANDING PAGE INTERACTIVITY (SYNTHAI STYLE)
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initThemeToggle();
    initWhatsAppSimulator();
    initLeadForm();
});

/* ==========================================================================
   THEME TOGGLE SYSTEM
   ========================================================================== */

function initThemeToggle() {
    const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
    
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (document.documentElement.classList.contains('dark')) {
                document.documentElement.classList.remove('dark');
                localStorage.theme = 'light';
            } else {
                document.documentElement.classList.add('dark');
                localStorage.theme = 'dark';
            }
        });
    });
}

/* ==========================================================================
   NAVIGATION LOGIC
   ========================================================================== */

function initNavigation() {
    const hamburger = document.querySelector('.mobile-hamburger-btn');
    const mobileMenu = document.querySelector('.mobile-menu');

    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileMenu.classList.toggle('hidden');
        });

        // Close mobile menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!mobileMenu.contains(e.target) && e.target !== hamburger) {
                mobileMenu.classList.add('hidden');
            }
        });

        // Close mobile menu when clicking on any link inside it
        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.add('hidden');
            });
        });
    }

    // Scroll active link behavior & navbar border shadow
    const header = document.querySelector('header');
    window.addEventListener('scroll', () => {
        if (header) {
            if (window.scrollY > 40) {
                header.classList.add('header-scrolled');
            } else {
                header.classList.remove('header-scrolled');
            }
        }
    });
}

/* ==========================================================================
   WHATSAPP SIMULATOR STATE MACHINE
   ========================================================================== */

function initWhatsAppSimulator() {
    const chatBody = document.getElementById('chat-body');
    const suggestionsContainer = document.getElementById('chat-suggestions');
    const typingIndicator = document.getElementById('typing-indicator');

    if (!chatBody || !suggestionsContainer || !typingIndicator) return;

    // Conversation State Database
    const conversationTree = {
        start: {
            suggestions: [
                { text: '¿Cuáles son los precios de los cortes?', nextState: 'pricing' },
                { text: 'Quiero reservar un turno para mañana', nextState: 'book_tomorrow' },
                { text: '¿Con qué barberos puedo reservar?', nextState: 'barbers_list' }
            ]
        },
        pricing: {
            botReply: 'Ofrecemos los siguientes servicios:<br>💈 Corte Clásico: <b>$8.000</b><br>✂️ Corte + Barba: <b>$12.000</b><br>🎨 Tintura / Color: <b>$15.000</b><br>🪒 Perfilado de Barba: <b>$5.000</b><br><br>¿Te gustaría reservar un turno para alguno?',
            suggestions: [
                { text: 'Sí, quiero reservar un turno', nextState: 'book_tomorrow' },
                { text: '¿Cuáles son los horarios disponibles?', nextState: 'horarios_info' },
                { text: 'Volver al inicio', nextState: 'start' }
            ]
        },
        barbers_list: {
            botReply: 'En nuestro equipo contamos con:<br>🧑🏻‍💻 <b>Nico</b>: especialista en cortes modernos y degradados (fades).<br>🧔🏻 <b>Franco</b>: experto en barbas y estilos clásicos.<br><br>¿Querés reservar un turno con alguno de ellos?',
            suggestions: [
                { text: 'Reservar con Nico', nextState: 'book_nico' },
                { text: 'Reservar con Franco', nextState: 'book_franco' },
                { text: 'Ver precios de servicios', nextState: 'pricing' }
            ]
        },
        horarios_info: {
            botReply: 'Atendemos de Martes a Sábados de 10:00 a 20:00 hs. Nuestro bot de FONO consulta la agenda en tiempo real.<br><br>¿Querés que busquemos disponibilidad para mañana?',
            suggestions: [
                { text: 'Sí, buscar para mañana', nextState: 'book_tomorrow' },
                { text: 'Volver al inicio', nextState: 'start' }
            ]
        },
        book_tomorrow: {
            botReply: '¡Excelente! Para mañana sábado tenemos disponibilidad en la agenda. ¿Con qué barbero preferís atenderte?<br>1. Nico<br>2. Franco<br>3. Cualquiera disponible',
            suggestions: [
                { text: 'Con Nico, por favor', nextState: 'book_nico' },
                { text: 'Con Franco', nextState: 'book_franco' },
                { text: 'Cualquiera disponible', nextState: 'book_any' }
            ]
        },
        book_nico: {
            botReply: 'Buscando en la agenda de Nico... 🔍<br>Nico tiene los siguientes slots libres mañana:<br>⏰ <b>10:30 hs</b><br>⏰ <b>14:00 hs</b><br>⏰ <b>16:30 hs</b><br><br>¿Alguno de estos horarios te queda cómodo?',
            suggestions: [
                { text: 'Reservar a las 14:00 hs', nextState: 'confirm_time_14' },
                { text: 'Reservar a las 16:30 hs', nextState: 'confirm_time_16' },
                { text: 'Ver otros horarios', nextState: 'horarios_info' }
            ]
        },
        book_franco: {
            botReply: 'Buscando en la agenda de Franco... 🔍<br>Franco tiene los siguientes slots libres mañana:<br>⏰ <b>11:00 hs</b><br>⏰ <b>15:30 hs</b><br>⏰ <b>18:00 hs</b><br><br>¿Te sirve alguno de estos?',
            suggestions: [
                { text: 'Reservar a las 11:00 hs', nextState: 'confirm_time_11' },
                { text: 'Reservar a las 15:30 hs', nextState: 'confirm_time_15' },
                { text: 'Ver precios de servicios', nextState: 'pricing' }
            ]
        },
        book_any: {
            botReply: 'Consultando disponibilidad general... 🔍<br>Tenemos estos horarios libres mañana:<br>⏰ <b>10:30 hs</b> (con Nico)<br>⏰ <b>11:00 hs</b> (con Franco)<br>⏰ <b>14:00 hs</b> (con Nico)<br><br>¿Cuál preferís?',
            suggestions: [
                { text: 'A las 11:00 hs con Franco', nextState: 'confirm_time_11' },
                { text: 'A las 14:00 hs con Nico', nextState: 'confirm_time_14' },
                { text: 'Volver al inicio', nextState: 'start' }
            ]
        },
        confirm_time_14: {
            botReply: '¡Perfecto! Agendando: Corte a las <b>14:00 hs</b> mañana con Nico.<br><br>Para finalizar, por favor escribime tu nombre y apellido.',
            suggestions: [
                { text: 'Patricio Carena', nextState: 'booking_complete_14_nico' },
                { text: 'Mauricio Carena', nextState: 'booking_complete_14_nico' },
                { text: 'Volver a empezar', nextState: 'start' }
            ]
        },
        confirm_time_16: {
            botReply: '¡Perfecto! Agendando: Corte a las <b>16:30 hs</b> mañana con Nico.<br><br>Para finalizar, por favor escribime tu nombre y apellido.',
            suggestions: [
                { text: 'Patricio Carena', nextState: 'booking_complete_16_nico' },
                { text: 'Mauricio Carena', nextState: 'booking_complete_16_nico' },
                { text: 'Volver a empezar', nextState: 'start' }
            ]
        },
        confirm_time_11: {
            botReply: '¡Perfecto! Agendando: Corte a las <b>11:00 hs</b> mañana con Franco.<br><br>Para finalizar, por favor escribime tu nombre y apellido.',
            suggestions: [
                { text: 'Patricio Carena', nextState: 'booking_complete_11_franco' },
                { text: 'Mauricio Carena', nextState: 'booking_complete_11_franco' },
                { text: 'Volver a empezar', nextState: 'start' }
            ]
        },
        confirm_time_15: {
            botReply: '¡Perfecto! Agendando: Corte a las <b>15:30 hs</b> mañana con Franco.<br><br>Para finalizar, por favor escribime tu nombre y apellido.',
            suggestions: [
                { text: 'Patricio Carena', nextState: 'booking_complete_15_franco' },
                { text: 'Mauricio Carena', nextState: 'booking_complete_15_franco' },
                { text: 'Volver a empezar', nextState: 'start' }
            ]
        },
        booking_complete_14_nico: {
            botReply: '¡Confirmado! 💈 Tu turno ha sido agendado exitosamente:<br><br>📅 <b>Fecha:</b> Mañana (Sábado)<br>⏰ <b>Horario:</b> 14:00 hs<br>🧔 <b>Peluquero:</b> Nico<br><br>Se ha guardado en el turnero de Barbería Gran Classic. Te enviaremos un recordatorio por acá 2 horas antes de tu turno. ¡Te esperamos! 🙌',
            suggestions: [
                { text: '¡Excelente servicio! Muchas gracias', nextState: 'final_thanks' },
                { text: 'Volver al inicio', nextState: 'start' }
            ]
        },
        booking_complete_16_nico: {
            botReply: '¡Confirmado! 💈 Tu turno ha sido agendado exitosamente:<br><br>📅 <b>Fecha:</b> Mañana (Sábado)<br>⏰ <b>Horario:</b> 16:30 hs<br>🧔 <b>Peluquero:</b> Nico<br><br>Se ha guardado en el turnero de Barbería Gran Classic. Te enviaremos un recordatorio por acá 2 horas antes de tu turno. ¡Te esperamos! 🙌',
            suggestions: [
                { text: '¡Excelente servicio! Muchas gracias', nextState: 'final_thanks' },
                { text: 'Volver al inicio', nextState: 'start' }
            ]
        },
        booking_complete_11_franco: {
            botReply: '¡Confirmado! 💈 Tu turno ha sido agendado exitosamente:<br><br>📅 <b>Fecha:</b> Mañana (Sábado)<br>⏰ <b>Horario:</b> 11:00 hs<br>🧔 <b>Peluquero:</b> Franco<br><br>Se ha guardado en el turnero de Barbería Gran Classic. Te enviaremos un recordatorio por acá 2 horas antes de tu turno. ¡Te esperamos! 🙌',
            suggestions: [
                { text: '¡Excelente servicio! Muchas gracias', nextState: 'final_thanks' },
                { text: 'Volver al inicio', nextState: 'start' }
            ]
        },
        booking_complete_15_franco: {
            botReply: '¡Confirmado! 💈 Tu turno ha sido agendado exitosamente:<br><br>📅 <b>Fecha:</b> Mañana (Sábado)<br>⏰ <b>Horario:</b> 15:30 hs<br>🧔 <b>Peluquero:</b> Franco<br><br>Se ha guardado en el turnero de Barbería Gran Classic. Te enviaremos un recordatorio por acá 2 horas antes de tu turno. ¡Te esperamos! 🙌',
            suggestions: [
                { text: '¡Excelente servicio! Muchas gracias', nextState: 'final_thanks' },
                { text: 'Volver al inicio', nextState: 'start' }
            ]
        },
        final_thanks: {
            botReply: '¡De nada! Si necesitás reprogramar o cancelar, podés escribirme en cualquier momento. ¡Que tengas un excelente día! 😊👋',
            suggestions: [
                { text: 'Volver a empezar (Reiniciar Demo)', nextState: 'start' }
            ]
        }
    };

    // Scroll chat to bottom
    const scrollToBottom = () => {
        chatBody.scrollTop = chatBody.scrollHeight;
    };

    // Append new bubble message
    const appendMessage = (text, isSent) => {
        const bubble = document.createElement('div');
        bubble.className = `message ${isSent ? 'sent' : 'received'}`;
        bubble.innerHTML = text;
        
        // Insert before typing indicator
        chatBody.insertBefore(bubble, typingIndicator);
        scrollToBottom();
    };

    // Handle suggestions click
    const handleStateChange = (nextStateKey) => {
        const state = conversationTree[nextStateKey];
        if (!state) return;

        // Hide suggestions during typing
        suggestionsContainer.style.pointerEvents = 'none';
        suggestionsContainer.style.opacity = '0.4';

        // Show typing indicator
        typingIndicator.classList.add('active');
        scrollToBottom();

        // Simulate network / AI response lag (1.2 to 1.8s)
        const delay = 1000 + Math.random() * 800;
        
        setTimeout(() => {
            typingIndicator.classList.remove('active');
            
            // If it's a special final state or just a regular reply
            let botText = state.botReply;
            if (nextStateKey === 'start') {
                botText = '¡Hola! Bienvenido a Barbería Gran Classic. Soy su asistente virtual de turnos. ¿En qué puedo ayudarlo hoy? 💈';
            }
            
            appendMessage(botText, false);
            renderSuggestions(state.suggestions);
            
            suggestionsContainer.style.pointerEvents = 'auto';
            suggestionsContainer.style.opacity = '1';
        }, delay);
    };

    // Render suggestion buttons
    const renderSuggestions = (suggestions) => {
        suggestionsContainer.innerHTML = '';
        
        suggestions.forEach(sug => {
            const btn = document.createElement('button');
            btn.className = 'suggestion-btn';
            btn.textContent = sug.text;
            btn.addEventListener('click', () => {
                // 1. Send User Message Bubble
                appendMessage(sug.text, true);
                
                // 2. Trigger Bot Reply Flow
                handleStateChange(sug.nextState);
            });
            suggestionsContainer.appendChild(btn);
        });
    };

    // Initialize Suggestions on Page Load
    renderSuggestions(conversationTree.start.suggestions);
}

/* ==========================================================================
   LEAD FORM HANDLER (B2B Leads capturing simulation)
   ========================================================================== */

function initLeadForm() {
    const form = document.getElementById('lead-form');
    const submitBtn = document.getElementById('submit-btn');
    const formFeedback = document.getElementById('form-feedback');

    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Trigger loading state
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
        formFeedback.textContent = '';
        formFeedback.className = 'form-feedback';

        // Collect inputs
        const formData = new FormData(form);
        const name = formData.get('name');
        const phone = formData.get('phone');
        const barbershop = formData.get('barber_name');

        // Simulate network API request
        setTimeout(() => {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
            
            formFeedback.className = 'form-feedback success';
            formFeedback.innerHTML = `🌟 <b>¡Excelente, ${name}!</b> Hemos recibido tu solicitud para <b>${barbershop}</b>.<br>Te enviaremos un WhatsApp al <b>${phone}</b> en los próximos minutos para activar tu entorno de pruebas.`;
            
            form.reset();
        }, 2000);
    });
}
