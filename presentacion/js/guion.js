/* Guion oral de NEXFLOR. Una entrada por diapositiva.
   El texto de la pantalla es corto. Esto es lo que se dice. */

window.GUION = {
    duracion: 360,

    integrantes: {
        "Camilo": { nombre: "Camilo", color: "#8fd19a" },
        "Ada": { nombre: "Ada", color: "#d8f3dc" },
        "Lopera": { nombre: "Lopera", color: "#b7e4c7" },
        "Emi": { nombre: "Emi", color: "#52b788" },
    },

    escenas: [
        {
            titulo: "Portada", quien: "Camilo", seg: 40, pasos: 0,
            claves: ["Saludo", "Equipo", "NEXFLOR", "Flores El Trigal"],
            texto: "Muy buenos días a todos. Reciban un cordial saludo de parte de nuestro equipo. Hoy queremos presentarles NEXFLOR, una propuesta de innovación tecnológica pensada para Flores El Trigal. Nuestro proyecto busca integrar la tecnología con el bienestar, la capacitación y la seguridad de los trabajadores. Los invitamos a conocer cómo una sola plataforma puede reunir diferentes herramientas para mejorar los procesos de trabajo en la floricultura.",
        },
        {
            titulo: "Qué queremos mejorar", quien: "Camilo", seg: 50, pasos: 0,
            claves: ["Identificar", "Capacitar", "Prevenir", "Pasa a Ada"],
            texto: "Para desarrollar nuestra propuesta, identificamos tres aspectos en los que la tecnología puede ser útil dentro de una empresa floricultora. El primero es la identificación de las personas; el segundo es la capacitación de los trabajadores, para que conozcan mejor los procedimientos; y el tercero es la prevención, mediante alertas cuando se detecten posturas inadecuadas. En lugar de crear herramientas separadas, pensamos en integrar estas tres funciones en un solo sistema. Ahora Ada les explicará cómo funciona nuestra propuesta.",
        },
        {
            titulo: "Nuestra solución", quien: "Ada", seg: 45, pasos: 0,
            claves: ["Una plataforma", "ID", "Academy", "Posture"],
            texto: "NEXFLOR nace como una solución que integra estas tres necesidades en una misma plataforma. Su funcionamiento se organiza en tres módulos: uno dedicado a la identificación de las personas, otro a la capacitación interactiva y un tercero a la detección preventiva de posturas inadecuadas. Cada módulo tiene una función diferente, pero todos forman parte de un mismo proyecto. Así buscamos que la tecnología no se limite a identificar personas, sino que también contribuya al aprendizaje y al bienestar durante el trabajo.",
        },
        {
            titulo: "Cómo funciona", quien: "Ada", seg: 50, pasos: 0,
            claves: ["Identificación", "Cursos", "Juego", "Monitoreo de postura"],
            texto: "Para entenderlo mejor, imaginemos el recorrido de una persona dentro de NEXFLOR. Primero, el sistema puede identificarla mediante reconocimiento facial. Después, puede acceder a los cursos de capacitación y realizar un juego para comprobar lo aprendido. Durante las labores, el módulo de postura puede analizar la posición corporal mediante una cámara y generar una alerta preventiva cuando reconoce una postura inadecuada. De esta manera, NEXFLOR conecta diferentes herramientas dentro de una misma propuesta.",
        },
        {
            titulo: "NEXFLOR ID", quien: "Lopera", seg: 45, pasos: 0,
            claves: ["Reconocimiento facial", "Registro", "Privacidad"],
            texto: "El primer módulo es NEXFLOR ID. Su función consiste en utilizar el reconocimiento facial como herramienta para identificar y registrar a las personas autorizadas. La idea es facilitar este proceso mediante tecnología, evitando depender exclusivamente de registros manuales. También debemos considerar que los datos faciales son información sensible, por lo que su tratamiento debe realizarse con las autorizaciones, medidas de seguridad y garantías de privacidad correspondientes.",
        },
        {
            titulo: "NEXFLOR ACADEMY", quien: "Lopera", seg: 45, pasos: 0,
            claves: ["Cursos", "Juego evaluativo", "Retroalimentación"],
            texto: "El segundo módulo es NEXFLOR ACADEMY. Aquí queremos que la capacitación sea más dinámica y fácil de comprender. Los trabajadores podrán recorrer cursos sobre los procedimientos de trabajo y, al finalizar, participar en un juego evaluativo. Este juego permitirá comprobar qué tanto comprendieron los contenidos. La idea es que aprender no sea solamente leer información, sino también participar, responder preguntas y recibir retroalimentación.",
        },
        {
            titulo: "NEXFLOR POSTURE", quien: "Emi", seg: 50, pasos: 0,
            claves: ["Cámara", "Alerta preventiva", "No reemplaza al personal de salud"],
            texto: "El tercer módulo es NEXFLOR POSTURE. Su objetivo es contribuir a la prevención de riesgos relacionados con las posturas corporales. A través de una cámara y herramientas de análisis de imagen, el sistema puede identificar determinadas posiciones inadecuadas y generar una alerta para llamar la atención del trabajador. Esta herramienta busca fomentar hábitos posturales más seguros y complementar las acciones de seguridad y salud en el trabajo. Es importante aclarar que se trata de una ayuda preventiva y que su efectividad dependerá de cómo se desarrolle, pruebe y configure el sistema.",
        },
        {
            titulo: "Qué aporta", quien: "Emi", seg: 45, pasos: 0,
            claves: ["Cuatro aportes", "Uso responsable", "Privacidad"],
            texto: "Con NEXFLOR buscamos integrar la identificación, el aprendizaje y la prevención en una sola plataforma. Esto puede ayudar a organizar determinados procesos, hacer más participativa la capacitación y generar alertas que promuevan mejores hábitos posturales. Sin embargo, para que una propuesta como esta sea útil, también es necesario cuidar los datos personales, garantizar un uso responsable de las cámaras y comprobar que cada función opere correctamente. La innovación no consiste solamente en utilizar tecnología, sino en utilizarla con un propósito claro.",
        },
        {
            titulo: "Cierre", quien: "Emi", seg: 40, pasos: 0,
            claves: ["Eslogan", "Una plataforma", "Preguntas"],
            texto: "En conclusión, NEXFLOR es nuestra propuesta para integrar la tecnología, el conocimiento y el bienestar en Flores El Trigal. Mediante la identificación facial, la capacitación interactiva y las alertas preventivas de postura, queremos demostrar que es posible pensar en soluciones tecnológicas que respondan a necesidades concretas. Este proyecto representa una oportunidad para seguir aprendiendo, innovando y explorando nuevas formas de mejorar los procesos de trabajo. Muchas gracias por su atención. Estamos listos para escuchar sus preguntas.",
        },
    ],
};
