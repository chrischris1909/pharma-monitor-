# Guía de Despliegue y Pruebas - Pharma Monitor

## 1. Despliegue del Backend (Render / Railway)
- Crea una cuenta en Github y sube el proyecto.
- Crea un nuevo Web Service en Render conectado a tu repositorio.
- Configura el Build Command: 
pm install`n- Configura el Start Command: 
pm start`n- En la configuración de variables de entorno de Render, añade todas las variables de tu .env (Excepto PORT que Render asigna automáticamente).
- Verifica los logs para asegurar que se conecta a Supabase exitosamente.

## 2. Despliegue del Frontend (Vercel / Netlify)
- Ve a la carpeta rontend/ y asegúrate de que tienes un archivo .env o .env.production configurado.
- Define la variable VITE_API_URL con la URL pública que te dio Render para el backend.
- Sube el frontend a Github y conéctalo a Vercel.
- Vercel detectará que es un proyecto de Vite y lo construirá automáticamente.

## 3. Configuración de Dominio (Namecheap / Hostinger)
- Una vez desplegado el frontend en Vercel, ve a la pestaña Settings > Domains.
- Añade tu dominio comprado (ej. pharmamonitor.com).
- Vercel te indicará los registros DNS (A y CNAME) que debes configurar en el panel de control de tu proveedor de dominio.

## 4. Pruebas Finales (V1.0)
- [ ] Ingresa a la URL de producción y verifica que cargue la interfaz (Login con imágenes incorporadas).
- [ ] Inicia sesión con dmin.
- [ ] Verifica que el dashboard muestre datos y que el WebSocket se conecte (ver consola del navegador).
- [ ] Simula una alerta desde el backend o espera una y verifica que llegue el correo a la bandeja de entrada (Nodemailer).
