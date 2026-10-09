const fs = require('fs');
const path = require('path');

const pages = {
  'Dashboard.jsx': 'Dashboard',
  'Areas.jsx': 'Áreas y Variables',
  'AreaDetail.jsx': 'Detalles de Área',
  'Values.jsx': 'Valores y Registros',
  'Alerts.jsx': 'Alertas',
  'Analytics.jsx': 'Analíticas',
  'AuditLog.jsx': 'Log de Auditoría',
  'Users.jsx': 'Usuarios',
  'Settings.jsx': 'Configuración',
  'Login.jsx': 'Iniciar Sesión'
};

const hooksDir = path.join(__dirname, 'frontend/src/pages');

for (const [file, title] of Object.entries(pages)) {
  const filePath = path.join(hooksDir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Solo si no tiene usePageTitle
    if (!content.includes('usePageTitle')) {
      // Inyectar import
      const importStatement = `import { usePageTitle } from '../hooks/usePageTitle'\n`;
      // Buscar el inicio de la función default export
      const match = content.match(/export default function \w+\(.*\) {/);
      if (match) {
        const index = match.index + match[0].length;
        const injected = `\n  usePageTitle('${title}')\n`;
        content = importStatement + content.slice(0, index) + injected + content.slice(index);
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file}`);
      }
    }
  }
}
